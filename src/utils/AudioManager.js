/**
 * Audio Manager - Handles all game sounds with optimization
 * Supports OGG (primary) and MP3 (fallback) formats
 * Uses object pooling for performance
 */
export class AudioManager {
    constructor() {
        this.audioContext = null;
        this.sounds = new Map(); // Store decoded audio buffers
        this.audioBuffers = new Map(); // Cached decoded buffers
        this.maxConcurrentSounds = 16; // Limit concurrent sounds for performance
        this.activeSounds = 0;
        this.masterVolume = 1.0;
        this.sfxVolume = 1.0;
        this.musicVolume = 0.25; // 20% quieter than 0.7 (0.7 * 0.8 = 0.56)
        this.enabled = true;
        
        // Global music state object
        this.activeMusic = {
            trackName: null, // e.g., "track1"
            tracks: [], // Array of {name, type, source/gainNode/audio, buffer, muted, playing}
            loaded: false
        };
        
        // Fade intervals for HTML5 Audio (stored by track name)
        this.fadeIntervals = new Map();
        
        // Major scale progression for peg hits (2 octaves)
        // Starting from a lower pitch (0.85) and going up the major scale
        // Using exact semitone ratios: 2^(semitones/12)
        // Major scale: Root, Major 2nd (+2), Major 3rd (+4), Perfect 4th (+5), Perfect 5th (+7), Major 6th (+9), Major 7th (+11), Octave (+12)
        const basePitch = 0.85; // Starting lower than normal (1.0)
        const firstOctave = [
            basePitch,                    // Starting lower
            basePitch * Math.pow(2, 2/12),   // Major 2nd (+2 semitones)
            basePitch * Math.pow(2, 4/12),   // Major 3rd (+4 semitones)
            basePitch * Math.pow(2, 5/12),   // Perfect 4th (+5 semitones)
            basePitch * Math.pow(2, 7/12),   // Perfect 5th (+7 semitones)
            basePitch * Math.pow(2, 9/12),   // Major 6th (+9 semitones)
            basePitch * Math.pow(2, 11/12),  // Major 7th (+11 semitones)
            basePitch * Math.pow(2, 12/12)   // Octave (+12 semitones = 2x)
        ];
        // Second octave: multiply first octave by 2
        const secondOctave = firstOctave.map(pitch => pitch * 2);
        this.pegHitScale = [...firstOctave, ...secondOctave];
        this.pegHitIndex = 0; // Current position in scale
        this.lastPegHitPitch = null; // Track last pitch used for new peg hits
        
        // Ghost ball scale (reversed - high to low)
        // Reverse the regular scale and start from the highest pitch
        this.ghostBallScale = [...secondOctave, ...firstOctave].reverse();
        this.ghostBallHitIndex = 0; // Current position in ghost ball scale
        this.lastGhostBallPitch = null; // Track last pitch used for ghost ball hits
        
        // Reverb impulse response (simple room reverb)
        this.reverbImpulseResponse = null;
        this.reverbConvolver = null;
        
        // Initialize Web Audio API (with fallback to HTML5 Audio)
        this.initAudioContext();
    }
    
    initAudioContext() {
        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (AudioContextClass) {
                this.audioContext = new AudioContextClass();
                // Resume context if suspended (browser autoplay policy)
                if (this.audioContext.state === 'suspended') {
                    this.audioContext.resume();
                }
                // Create reverb convolver (lightweight room reverb)
                this.createReverbConvolver();
            }
        } catch (error) {
            // Web Audio API not available, falling back to HTML5 Audio
        }
    }
    
    /**
     * Create a lightweight reverb effect using ConvolverNode
     * Uses a simple impulse response for room reverb
     */
    createReverbConvolver() {
        if (!this.audioContext) return;
        
        try {
            // Create a simple room reverb impulse response
            // Short decay time for performance (0.3 seconds)
            const sampleRate = this.audioContext.sampleRate;
            const length = sampleRate * 0.3; // 0.3 seconds
            const impulse = this.audioContext.createBuffer(2, length, sampleRate);
            
            // Generate impulse response (exponential decay)
            for (let channel = 0; channel < 2; channel++) {
                const channelData = impulse.getChannelData(channel);
                for (let i = 0; i < length; i++) {
                    const n = length - i;
                    channelData[i] = (Math.random() * 2 - 1) * Math.pow(n / length, 2);
                }
            }
            
            this.reverbConvolver = this.audioContext.createConvolver();
            this.reverbConvolver.buffer = impulse;
            this.reverbConvolver.normalize = true;
        } catch (error) {
            // Reverb not available, continue without it
            this.reverbConvolver = null;
        }
    }
    
    /**
     * Preload a sound file
     * @param {string} name - Sound identifier
     * @param {string} path - Path to sound file (without extension)
     * @param {string} type - 'sfx' or 'music'
     */
    async loadSound(name, path, type = 'sfx') {
        if (this.sounds.has(name)) {
            return; // Already loaded
        }
        
        try {
            // Try OGG first, fallback to MP3
            let audioPath = null;
            let format = null;
            
            // Check if OGG is supported
            const audio = new Audio();
            if (audio.canPlayType('audio/ogg')) {
                audioPath = `${path}.ogg`;
                format = 'ogg';
            } else {
                audioPath = `${path}.mp3`;
                format = 'mp3';
            }
            
            if (this.audioContext) {
                // Use Web Audio API for better control
                const response = await fetch(audioPath);
                if (!response.ok) {
                    // Try fallback format
                    const fallbackPath = format === 'ogg' ? `${path}.mp3` : `${path}.ogg`;
                    const fallbackResponse = await fetch(fallbackPath);
                    if (!fallbackResponse.ok) {
                        throw new Error(`Failed to load sound: ${name}`);
                    }
                    const arrayBuffer = await fallbackResponse.arrayBuffer();
                    const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
                    this.audioBuffers.set(name, { buffer: audioBuffer, type });
                } else {
                    const arrayBuffer = await response.arrayBuffer();
                    const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
                    this.audioBuffers.set(name, { buffer: audioBuffer, type });
                }
            } else {
                // Fallback to HTML5 Audio
                const audio = new Audio(audioPath);
                audio.preload = 'auto';
                await new Promise((resolve, reject) => {
                    audio.addEventListener('canplaythrough', resolve, { once: true });
                    audio.addEventListener('error', () => {
                        // Try fallback
                        const fallbackAudio = new Audio(format === 'ogg' ? `${path}.mp3` : `${path}.ogg`);
                        fallbackAudio.preload = 'auto';
                        fallbackAudio.addEventListener('canplaythrough', () => {
                            this.sounds.set(name, { audio: fallbackAudio, type });
                            resolve();
                        }, { once: true });
                        fallbackAudio.addEventListener('error', reject, { once: true });
                    }, { once: true });
                });
                this.sounds.set(name, { audio, type });
            }
        } catch (error) {
            // Failed to load sound
        }
    }
    
    /**
     * Preload multiple sounds
     * @param {Array} soundList - Array of {name, path, type} objects
     */
    async loadSounds(soundList) {
        const loadPromises = soundList.map(sound => 
            this.loadSound(sound.name, sound.path, sound.type || 'sfx')
        );
        await Promise.all(loadPromises);
    }
    
    /**
     * Play a sound
     * @param {string} name - Sound identifier
     * @param {Object} options - Playback options
     * @param {number} options.volume - Volume (0-1), defaults to sfxVolume
     * @param {number} options.pitch - Pitch variation (0.8-1.2), for variety
     * @param {boolean} options.loop - Loop the sound (for music)
     */
    playSound(name, options = {}) {
        if (!this.enabled) return;
        
        // Check concurrent sound limit
        if (this.activeSounds >= this.maxConcurrentSounds) {
            return; // Skip if too many sounds playing
        }
        
        const {
            volume = this.sfxVolume,
            pitch = 1.0,
            loop = false
        } = options;
        
        try {
            if (this.audioContext && this.audioBuffers.has(name)) {
                // Use Web Audio API
                const { buffer, type } = this.audioBuffers.get(name);
                const source = this.audioContext.createBufferSource();
                const gainNode = this.audioContext.createGain();
                
                source.buffer = buffer;
                source.playbackRate.value = pitch; // Pitch variation
                source.loop = loop;
                
                const finalVolume = volume * (type === 'music' ? this.musicVolume : this.sfxVolume) * this.masterVolume;
                gainNode.gain.value = finalVolume;
                
                source.connect(gainNode);
                gainNode.connect(this.audioContext.destination);
                
                source.start(0);
                
                this.activeSounds++;
                source.addEventListener('ended', () => {
                    this.activeSounds--;
                }, { once: true });
                
                // Return source so it can be stopped if needed (for looping sounds)
                if (loop) {
                    return source;
                }
            } else if (this.sounds.has(name)) {
                // Use HTML5 Audio fallback
                const { audio, type } = this.sounds.get(name);
                const audioClone = audio.cloneNode();
                
                audioClone.volume = volume * (type === 'music' ? this.musicVolume : this.sfxVolume) * this.masterVolume;
                audioClone.playbackRate = pitch;
                audioClone.loop = loop;
                
                this.activeSounds++;
                audioClone.addEventListener('ended', () => {
                    this.activeSounds--;
                }, { once: true });
                
                audioClone.play().catch(() => {
                    this.activeSounds--;
                });
                
                // Return audio element so it can be stopped if needed
                if (loop) {
                    return audioClone;
                }
            }
        } catch (error) {
            // Error playing sound
        }
        return null;
    }
    
    /**
     * Play peg hit sound going up the major scale
     * Starts from a lower pitch and progresses upward
     */
    playPegHit() {
        // Get current pitch from major scale
        const pitch = this.pegHitScale[this.pegHitIndex];
        
        // Track last pitch for already-hit pegs
        this.lastPegHitPitch = pitch;
        
        // Move to next note in scale (wrap around after octave)
        this.pegHitIndex = (this.pegHitIndex + 1) % this.pegHitScale.length;
        
        this.playSound('pegHit', { volume: 0.6, pitch });
    }
    
    /**
     * Play peg hit sound for already-hit pegs
     * Uses same pitch as last new peg hit, with low-pass filter and reduced volume
     */
    playPegHitAlreadyHit() {
        if (!this.lastPegHitPitch) {
            // If no pitch tracked yet, use default
            this.lastPegHitPitch = this.pegHitScale[0];
        }
        
        // Use last pitch, don't increment
        const pitch = this.lastPegHitPitch;
        const volume = 0.6 * 0.8; // 20% quieter (0.48 instead of 0.6)
        
        if (!this.enabled) return;
        
        // Check concurrent sound limit
        if (this.activeSounds >= this.maxConcurrentSounds) {
            return;
        }
        
        try {
            if (this.audioContext && this.audioBuffers.has('pegHit')) {
                // Use Web Audio API with low-pass filter
                const { buffer, type } = this.audioBuffers.get('pegHit');
                const source = this.audioContext.createBufferSource();
                const gainNode = this.audioContext.createGain();
                const filterNode = this.audioContext.createBiquadFilter();
                
                source.buffer = buffer;
                source.playbackRate.value = pitch;
                
                // Configure low-pass filter (reduces high frequencies, creates muffled sound)
                filterNode.type = 'lowpass';
                filterNode.frequency.value = 1500; // Cut-off frequency (lower = more muffled)
                filterNode.Q.value = 1; // Quality factor
                
                const finalVolume = volume * (type === 'music' ? this.musicVolume : this.sfxVolume) * this.masterVolume;
                gainNode.gain.value = finalVolume;
                
                // Connect: source -> filter -> gain -> destination
                source.connect(filterNode);
                filterNode.connect(gainNode);
                gainNode.connect(this.audioContext.destination);
                
                source.start(0);
                
                this.activeSounds++;
                source.addEventListener('ended', () => {
                    this.activeSounds--;
                }, { once: true });
            } else if (this.sounds.has('pegHit')) {
                // Fallback to HTML5 Audio (no filter support, but still play with reduced volume)
                const { audio, type } = this.sounds.get('pegHit');
                const audioClone = audio.cloneNode();
                
                audioClone.volume = volume * (type === 'music' ? this.musicVolume : this.sfxVolume) * this.masterVolume;
                audioClone.playbackRate = pitch;
                
                this.activeSounds++;
                audioClone.addEventListener('ended', () => {
                    this.activeSounds--;
                }, { once: true });
                
                audioClone.play().catch(() => {
                    this.activeSounds--;
                });
            }
        } catch (error) {
            // Error playing already-hit peg sound
        }
    }
    
    /**
     * Reset peg hit scale to beginning (call when starting a new shot/turn)
     */
    resetPegHitScale() {
        this.pegHitIndex = 0;
        this.lastPegHitPitch = null; // Reset last pitch tracking
        // Also reset ghost ball scale
        this.ghostBallHitIndex = 0;
        this.lastGhostBallPitch = null;
    }
    
    /**
     * Play ghost ball peg hit sound going down the major scale (high to low)
     * Includes reverb effect for ethereal sound
     */
    playGhostBallPegHit() {
        // Get current pitch from reversed major scale (high to low)
        const pitch = this.ghostBallScale[this.ghostBallHitIndex];
        
        // Track last pitch for already-hit pegs
        this.lastGhostBallPitch = pitch;
        
        // Move to next note in scale (wrap around after scale)
        this.ghostBallHitIndex = (this.ghostBallHitIndex + 1) % this.ghostBallScale.length;
        
        if (!this.enabled) return;
        
        // Check concurrent sound limit
        if (this.activeSounds >= this.maxConcurrentSounds) {
            return;
        }
        
        try {
            if (this.audioContext && this.audioBuffers.has('pegHit')) {
                // Use Web Audio API with reverb
                const { buffer, type } = this.audioBuffers.get('pegHit');
                const source = this.audioContext.createBufferSource();
                const gainNode = this.audioContext.createGain();
                const reverbGainNode = this.audioContext.createGain();
                const dryGainNode = this.audioContext.createGain();
                const masterGainNode = this.audioContext.createGain();
                
                source.buffer = buffer;
                source.playbackRate.value = pitch;
                
                const baseVolume = 0.6;
                const finalVolume = baseVolume * (type === 'music' ? this.musicVolume : this.sfxVolume) * this.masterVolume;
                
                // Reverb mix: 30% reverb, 70% dry (for subtle effect)
                reverbGainNode.gain.value = finalVolume * 0.3;
                dryGainNode.gain.value = finalVolume * 0.7;
                masterGainNode.gain.value = 1.0;
                
                // Connect: source -> [dryGain -> masterGain] + [reverbConvolver -> reverbGain -> masterGain] -> destination
                source.connect(dryGainNode);
                dryGainNode.connect(masterGainNode);
                
                if (this.reverbConvolver) {
                    source.connect(this.reverbConvolver);
                    this.reverbConvolver.connect(reverbGainNode);
                    reverbGainNode.connect(masterGainNode);
                } else {
                    // Fallback: no reverb, just dry signal
                    source.connect(masterGainNode);
                }
                
                masterGainNode.connect(this.audioContext.destination);
                
                source.start(0);
                
                this.activeSounds++;
                source.addEventListener('ended', () => {
                    this.activeSounds--;
                }, { once: true });
            } else if (this.sounds.has('pegHit')) {
                // Fallback to HTML5 Audio (no reverb support, but still play with reversed pitch)
                const { audio, type } = this.sounds.get('pegHit');
                const audioClone = audio.cloneNode();
                const baseVolume = 0.6;
                
                audioClone.volume = baseVolume * (type === 'music' ? this.musicVolume : this.sfxVolume) * this.masterVolume;
                audioClone.playbackRate = pitch;
                
                this.activeSounds++;
                audioClone.addEventListener('ended', () => {
                    this.activeSounds--;
                }, { once: true });
                
                audioClone.play().catch(() => {
                    this.activeSounds--;
                });
            }
        } catch (error) {
            // Error playing ghost ball sound
        }
    }
    
    /**
     * Set master volume
     * @param {number} volume - Volume (0-1)
     */
    setMasterVolume(volume) {
        this.masterVolume = Math.max(0, Math.min(1, volume));
    }
    
    /**
     * Set SFX volume
     * @param {number} volume - Volume (0-1)
     */
    setSfxVolume(volume) {
        this.sfxVolume = Math.max(0, Math.min(1, volume));
    }
    
    /**
     * Set music volume
     * @param {number} volume - Volume (0-1)
     */
    setMusicVolume(volume) {
        this.musicVolume = Math.max(0, Math.min(1, volume));
    }
    
    /**
     * Enable/disable audio
     * @param {boolean} enabled
     */
    setEnabled(enabled) {
        this.enabled = enabled;
    }
    
    /**
     * Resume audio context (required after user interaction due to browser autoplay policy)
     */
    resumeContext() {
        if (this.audioContext && this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
    }
    
    /**
     * Load and start playing layered music tracks
     * All tracks start playing simultaneously, but tracks 2-4 start muted
     * Only starts tracks if they're not already playing
     * @param {Array} trackNames - Array of track names (e.g., ['PilotsOgg1', 'PilotsOgg2', ...])
     * @param {string} basePath - Base path to track files (without extension)
     */
    /**
     * Load music tracks from track folder (e.g., sounds/tracks/track1/)
     * Mounts all tracks paused and muted (except first track)
     * @param {string} trackName - Track folder name (e.g., "track1")
     * @param {string} basePath - Base path to sounds folder
     */
    async loadMusicTracks(trackName, basePath) {
        if (!this.enabled) return;
        
        // If tracks are already loaded for this track, don't reload (prevents overlap)
        if (this.activeMusic.loaded && this.activeMusic.trackName === trackName) {
            return;
        }
        
        // Destroy existing tracks if any (only happens on level load or track change)
        this.destroyMusicTracks();
        
        // Track file names (assuming they're named PilotsOgg1, PilotsOgg2, etc.)
        const trackFiles = ['PilotsOgg1', 'PilotsOgg2', 'PilotsOgg3', 'PilotsOgg4'];
        const trackPath = `${basePath}tracks/${trackName}/`;
        
        // Load all track buffers
        const loadPromises = trackFiles.map(name => 
            this.loadSound(name, `${trackPath}${name}`, 'music')
        );
        await Promise.all(loadPromises);
        
        // Mount all tracks paused and muted (except first)
        this.activeMusic.trackName = trackName;
        this.activeMusic.tracks = [];
        
        for (let i = 0; i < trackFiles.length; i++) {
            const name = trackFiles[i];
            const isFirstTrack = i === 0;
            const muted = !isFirstTrack; // First track unmuted, others muted
            
            // Mount track (create audio source but don't start playing yet)
            const trackData = await this.mountMusicTrack(name, muted);
            if (trackData) {
                this.activeMusic.tracks.push({
                    name,
                    ...trackData,
                    muted,
                    playing: false
                });
            }
        }
        
        this.activeMusic.loaded = true;
    }
    
    /**
     * Mount a music track (create audio source but don't start playing)
     * @param {string} name - Track identifier
     * @param {boolean} muted - Whether to start muted
     * @returns {Object|null} Track data object or null if failed
     */
    async mountMusicTrack(name, muted = true) {
        if (!this.enabled) return null;
        
        try {
            if (this.audioContext && this.audioBuffers.has(name)) {
                // Web Audio API
                const { buffer } = this.audioBuffers.get(name);
                const gainNode = this.audioContext.createGain();
                const finalVolume = muted ? 0 : (this.musicVolume * this.masterVolume);
                gainNode.gain.value = finalVolume;
                gainNode.connect(this.audioContext.destination);
                
                return { type: 'webaudio', gainNode, buffer, source: null };
            } else if (this.sounds.has(name)) {
                // HTML5 Audio fallback
                const { audio } = this.sounds.get(name);
                const audioClone = audio.cloneNode(true);
                audioClone.volume = muted ? 0 : (this.musicVolume * this.masterVolume);
                audioClone.loop = true;
                audioClone.muted = muted;
                audioClone.pause(); // Start paused
                
                return { type: 'html5', audio: audioClone };
            }
        } catch (error) {
            // Error mounting track
        }
        return null;
    }
    
    /**
     * Play all mounted music tracks (called when pegs are generated)
     */
    playMusicTracks() {
        if (!this.enabled || !this.activeMusic.loaded) return;
        
        this.activeMusic.tracks.forEach((track, index) => {
            if (track.playing) return; // Already playing
            
            try {
                if (track.type === 'webaudio') {
                    // Web Audio API - create and start source
                    const source = this.audioContext.createBufferSource();
                    source.buffer = track.buffer;
                    source.loop = true;
                    source.connect(track.gainNode);
                    source.start(0);
                    track.source = source;
                    track.playing = true;
                } else if (track.type === 'html5') {
                    // HTML5 Audio - play
                    track.audio.currentTime = 0; // Start from beginning
                    track.audio.play().catch(() => {
                        // Failed to play track
                    });
                    track.playing = true;
                }
            } catch (error) {
                // Error playing track
            }
        });
    }
    
    /**
     * Update mute state for a specific track
     * @param {string} name - Track identifier
     * @param {boolean} muted - Whether to mute the track
     */
    setMusicTrackMuted(name, muted) {
        if (!this.activeMusic.loaded) return;
        
        const track = this.activeMusic.tracks.find(t => t.name === name);
        if (!track) return;
        
        const wasMuted = track.muted;
        track.muted = muted;
        
        const targetVolume = this.musicVolume * this.masterVolume;
        const fadeDuration = 0.3;
        const isTransitioningToUnmuted = wasMuted && !muted;
        
        if (track.type === 'webaudio') {
            if (muted) {
                track.gainNode.gain.value = 0;
            } else {
                if (isTransitioningToUnmuted) {
                    const currentTime = this.audioContext.currentTime;
                    const currentGain = track.gainNode.gain.value;
                    track.gainNode.gain.cancelScheduledValues(currentTime);
                    track.gainNode.gain.setValueAtTime(currentGain, currentTime);
                    track.gainNode.gain.linearRampToValueAtTime(targetVolume, currentTime + fadeDuration);
                } else {
                    track.gainNode.gain.value = targetVolume;
                }
            }
        } else if (track.type === 'html5') {
            // Clear any existing fade interval for this track
            if (this.fadeIntervals.has(name)) {
                clearInterval(this.fadeIntervals.get(name));
                this.fadeIntervals.delete(name);
            }
            
            if (muted) {
                track.audio.muted = true;
                track.audio.volume = 0;
            } else {
                track.audio.muted = false;
                if (isTransitioningToUnmuted) {
                    // Fade-in for HTML5
                    const startTime = performance.now();
                    const fadeInterval = setInterval(() => {
                        const elapsed = (performance.now() - startTime) / 1000;
                        if (elapsed >= fadeDuration) {
                            track.audio.volume = targetVolume;
                            clearInterval(fadeInterval);
                            this.fadeIntervals.delete(name);
                        } else {
                            track.audio.volume = (elapsed / fadeDuration) * targetVolume;
                        }
                    }, 16);
                    this.fadeIntervals.set(name, fadeInterval);
                } else {
                    track.audio.volume = targetVolume;
                }
            }
        }
    }
    
    /**
     * Destroy all music tracks (only called on level load)
     */
    destroyMusicTracks() {
        if (!this.activeMusic.loaded) return;
        
        this.activeMusic.tracks.forEach(track => {
            try {
                if (track.type === 'webaudio' && track.source) {
                    track.source.stop();
                    track.gainNode.disconnect();
                } else if (track.type === 'html5') {
                    track.audio.pause();
                    track.audio.currentTime = 0;
                    track.audio.load();
                }
            } catch (error) {
                // Ignore errors
            }
        });
        
        this.activeMusic.trackName = null;
        this.activeMusic.tracks = [];
        this.activeMusic.loaded = false;
    }
}

