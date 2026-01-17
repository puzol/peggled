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
        
        // Layered music tracks
        this.musicTracks = new Map(); // Store music track sources (for Web Audio API)
        this.musicTracksHTML5 = new Map(); // Store HTML5 Audio elements (fallback)
        this.fadeIntervals = new Map(); // Store fade intervals for HTML5 Audio tracks
        
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
            }
        } catch (error) {
            console.warn('Web Audio API not available, falling back to HTML5 Audio');
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
            console.warn(`Failed to load sound: ${name}`, error);
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
                
                audioClone.play().catch(error => {
                    console.warn(`Failed to play sound: ${name}`, error);
                    this.activeSounds--;
                });
            }
        } catch (error) {
            console.warn(`Error playing sound: ${name}`, error);
        }
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
                
                audioClone.play().catch(error => {
                    console.warn('Failed to play already-hit peg sound', error);
                    this.activeSounds--;
                });
            }
        } catch (error) {
            console.warn('Error playing already-hit peg sound', error);
        }
    }
    
    /**
     * Reset peg hit scale to beginning (call when starting a new shot/turn)
     */
    resetPegHitScale() {
        this.pegHitIndex = 0;
        this.lastPegHitPitch = null; // Reset last pitch tracking
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
     * @param {Array} trackNames - Array of track names (e.g., ['PilotsOgg1', 'PilotsOgg2', ...])
     * @param {string} basePath - Base path to track files (without extension)
     */
    async loadLayeredMusic(trackNames, basePath) {
        const loadPromises = trackNames.map(name => 
            this.loadSound(name, `${basePath}${name}`, 'music')
        );
        await Promise.all(loadPromises);
        
        // Start all tracks playing (they'll loop)
        trackNames.forEach((name, index) => {
            // First track (index 0) starts unmuted, others start muted
            const startMuted = index > 0;
            this.startMusicTrack(name, startMuted);
        });
    }
    
    /**
     * Start a music track playing (looping)
     * @param {string} name - Track identifier
     * @param {boolean} muted - Whether to start muted
     */
    startMusicTrack(name, muted = false) {
        if (!this.enabled) return;
        
        try {
            if (this.audioContext && this.audioBuffers.has(name)) {
                // Use Web Audio API for looping
                const { buffer } = this.audioBuffers.get(name);
                
                const createSource = () => {
                    const source = this.audioContext.createBufferSource();
                    const gainNode = this.audioContext.createGain();
                    
                    source.buffer = buffer;
                    source.loop = true;
                    
                    const finalVolume = muted ? 0 : (this.musicVolume * this.masterVolume);
                    gainNode.gain.value = finalVolume;
                    
                    source.connect(gainNode);
                    gainNode.connect(this.audioContext.destination);
                    
                    source.start(0);
                    
                    return { source, gainNode };
                };
                
                // Create initial source
                const { source, gainNode } = createSource();
                this.musicTracks.set(name, { source, gainNode, buffer, createSource });
            } else if (this.sounds.has(name)) {
                // Use HTML5 Audio fallback
                const { audio } = this.sounds.get(name);
                const audioClone = audio.cloneNode();
                
                audioClone.volume = muted ? 0 : (this.musicVolume * this.masterVolume);
                audioClone.loop = true;
                audioClone.muted = muted;
                
                this.musicTracksHTML5.set(name, audioClone);
                
                audioClone.play().catch(error => {
                    console.warn(`Failed to start music track: ${name}`, error);
                });
            }
        } catch (error) {
            console.warn(`Error starting music track: ${name}`, error);
        }
    }
    
    /**
     * Set mute state for a specific music track
     * @param {string} name - Track identifier
     * @param {boolean} muted - Whether to mute the track
     */
    setTrackMuted(name, muted) {
        const targetVolume = this.musicVolume * this.masterVolume;
        const fadeDuration = 0.3; // 0.3 seconds fade-in
        
        if (this.musicTracks.has(name)) {
            // Web Audio API
            const { gainNode } = this.musicTracks.get(name);
            if (gainNode) {
                if (muted) {
                    // Instant mute (no fade-out)
                    gainNode.gain.value = 0;
                } else {
                    // Fade-in from 0 to target volume over 0.3 seconds
                    const currentTime = this.audioContext.currentTime;
                    gainNode.gain.setValueAtTime(0, currentTime);
                    gainNode.gain.linearRampToValueAtTime(targetVolume, currentTime + fadeDuration);
                }
            }
        } else if (this.musicTracksHTML5.has(name)) {
            // HTML5 Audio fallback
            const audio = this.musicTracksHTML5.get(name);
            
            // Clear any existing fade interval for this track
            if (this.fadeIntervals.has(name)) {
                clearInterval(this.fadeIntervals.get(name));
                this.fadeIntervals.delete(name);
            }
            
            if (muted) {
                // Instant mute (no fade-out)
                audio.muted = true;
                audio.volume = 0;
            } else {
                // Fade-in using manual volume adjustment
                audio.muted = false;
                const startTime = performance.now();
                const startVolume = 0; // Always fade from 0
                const fadeInterval = setInterval(() => {
                    const elapsed = (performance.now() - startTime) / 1000; // Convert to seconds
                    if (elapsed >= fadeDuration) {
                        audio.volume = targetVolume;
                        clearInterval(fadeInterval);
                        this.fadeIntervals.delete(name);
                    } else {
                        // Linear interpolation from 0 to targetVolume
                        const progress = elapsed / fadeDuration;
                        audio.volume = startVolume + (targetVolume - startVolume) * progress;
                    }
                }, 16); // ~60fps updates
                
                // Store interval for cleanup
                this.fadeIntervals.set(name, fadeInterval);
            }
        }
    }
    
    /**
     * Get mute state for a specific music track
     * @param {string} name - Track identifier
     * @returns {boolean} Whether the track is muted
     */
    getTrackMuted(name) {
        if (this.musicTracks.has(name)) {
            const { gainNode } = this.musicTracks.get(name);
            return gainNode ? gainNode.gain.value === 0 : true;
        } else if (this.musicTracksHTML5.has(name)) {
            const audio = this.musicTracksHTML5.get(name);
            return audio.muted || audio.volume === 0;
        }
        return true;
    }
    
    /**
     * Stop all music tracks
     */
    stopAllMusic() {
        // Clear all fade intervals
        this.fadeIntervals.forEach((interval) => {
            clearInterval(interval);
        });
        this.fadeIntervals.clear();
        
        // Stop Web Audio API tracks
        this.musicTracks.forEach((track, name) => {
            try {
                if (track.source) {
                    track.source.stop();
                }
            } catch (error) {
                // Source might already be stopped
            }
        });
        this.musicTracks.clear();
        
        // Stop HTML5 Audio tracks
        this.musicTracksHTML5.forEach((audio, name) => {
            try {
                audio.pause();
                audio.currentTime = 0;
            } catch (error) {
                // Ignore errors
            }
        });
        this.musicTracksHTML5.clear();
    }
}

