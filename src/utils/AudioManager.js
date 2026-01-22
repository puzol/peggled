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
        const majorFirstOctave = [
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
        const majorSecondOctave = majorFirstOctave.map(pitch => pitch * 2);
        this.pegHitScaleMajor = [...majorFirstOctave, ...majorSecondOctave];
        
        // Minor scale progression for peg hits (2 octaves)
        // Minor scale: Root, Major 2nd (+2), Minor 3rd (+3), Perfect 4th (+5), Perfect 5th (+7), Minor 6th (+8), Minor 7th (+10), Octave (+12)
        const minorFirstOctave = [
            basePitch,                    // Starting lower
            basePitch * Math.pow(2, 2/12),   // Major 2nd (+2 semitones)
            basePitch * Math.pow(2, 3/12),   // Minor 3rd (+3 semitones)
            basePitch * Math.pow(2, 5/12),   // Perfect 4th (+5 semitones)
            basePitch * Math.pow(2, 7/12),   // Perfect 5th (+7 semitones)
            basePitch * Math.pow(2, 8/12),   // Minor 6th (+8 semitones)
            basePitch * Math.pow(2, 10/12),  // Minor 7th (+10 semitones)
            basePitch * Math.pow(2, 12/12)   // Octave (+12 semitones = 2x)
        ];
        // Second octave: multiply first octave by 2
        const minorSecondOctave = minorFirstOctave.map(pitch => pitch * 2);
        this.pegHitScaleMinor = [...minorFirstOctave, ...minorSecondOctave];
        
        // Default to major scale (will switch based on active track)
        this.pegHitScale = this.pegHitScaleMajor;
        this.pegHitIndex = 0; // Current position in scale
        this.pegHitDirection = 1; // 1 for up, -1 for down (ping-pong direction)
        this.lastPegHitPitch = null; // Track last pitch used for new peg hits
        
        // Ghost ball scale (reversed - high to low)
        // Reverse the regular scale and start from the highest pitch
        this.ghostBallScaleMajor = [...majorSecondOctave, ...majorFirstOctave].reverse();
        this.ghostBallScaleMinor = [...minorSecondOctave, ...minorFirstOctave].reverse();
        this.ghostBallScale = this.ghostBallScaleMajor; // Default to major
        this.ghostBallHitIndex = 0; // Current position in ghost ball scale
        this.ghostBallHitDirection = -1; // -1 for down, 1 for up (ping-pong direction, starts going down)
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
     * Play peg hit sound going up the scale (major or minor based on active track)
     * Starts from a lower pitch and progresses upward
     */
    playPegHit() {
        // Get current pitch from scale (major for track1, minor for track2)
        const pitch = this.pegHitScale[this.pegHitIndex];
        
        // Track last pitch for already-hit pegs
        this.lastPegHitPitch = pitch;
        
        // Move to next note in scale (ping-pong: bounce at ends)
        this.pegHitIndex += this.pegHitDirection;
        
        // Bounce at the ends (reverse direction)
        if (this.pegHitIndex >= this.pegHitScale.length) {
            this.pegHitIndex = this.pegHitScale.length - 2; // Go to second-to-last
            this.pegHitDirection = -1; // Reverse to go down
        } else if (this.pegHitIndex < 0) {
            this.pegHitIndex = 1; // Go to second note
            this.pegHitDirection = 1; // Reverse to go up
        }
        
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
        this.pegHitDirection = 1; // Reset to going up
        this.lastPegHitPitch = null; // Reset last pitch tracking
        // Also reset ghost ball scale
        this.ghostBallHitIndex = 0;
        this.ghostBallHitDirection = -1; // Reset to going down
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
        
        // Move to next note in scale (ping-pong: bounce at ends)
        this.ghostBallHitIndex += this.ghostBallHitDirection;
        
        // Bounce at the ends (reverse direction)
        if (this.ghostBallHitIndex >= this.ghostBallScale.length) {
            this.ghostBallHitIndex = this.ghostBallScale.length - 2; // Go to second-to-last
            this.ghostBallHitDirection = -1; // Reverse to go down
        } else if (this.ghostBallHitIndex < 0) {
            this.ghostBallHitIndex = 1; // Go to second note
            this.ghostBallHitDirection = 1; // Reverse to go up
        }
        
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
     * Play magnet sound with fade in, looping with crossfade, and volume oscillation
     * Returns a handle object to control the sound
     */
    playMagnetSound() {
        if (!this.enabled) return null;
        
        try {
            if (this.audioContext && this.audioBuffers.has('pegMagnet')) {
                // Use Web Audio API with simple loop
                const { buffer, type } = this.audioBuffers.get('pegMagnet');
                const fadeInTime = 0.3; // 0.3s fade in
                
                const source = this.audioContext.createBufferSource();
                const gainNode = this.audioContext.createGain();
                const masterGainNode = this.audioContext.createGain();
                
                source.buffer = buffer;
                source.loop = true; // Simple loop
                
                const baseVolume = 1.0;
                masterGainNode.gain.value = baseVolume * (type === 'music' ? this.musicVolume : this.sfxVolume) * this.masterVolume;
                
                // Fade in
                gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
                gainNode.gain.linearRampToValueAtTime(1.0, this.audioContext.currentTime + fadeInTime);
                
                source.connect(gainNode);
                gainNode.connect(masterGainNode);
                masterGainNode.connect(this.audioContext.destination);
                
                source.start(0);
                
                return {
                    type: 'webaudio',
                    masterGain: masterGainNode,
                    source: source,
                    gainNode: gainNode,
                    stop: () => {
                        try {
                            source.stop();
                            gainNode.disconnect();
                            masterGainNode.disconnect();
                        } catch (e) {
                            // Source may already be stopped
                        }
                    }
                };
            } else if (this.sounds.has('pegMagnet')) {
                // Fallback to HTML5 Audio (simpler, no crossfade)
                const { audio, type } = this.sounds.get('pegMagnet');
                const audioClone = audio.cloneNode();
                
                audioClone.loop = true;
                audioClone.volume = 0; // Start at 0 for fade in
                
                // Fade in
                const fadeInDuration = 300; // 0.3s in milliseconds
                const fadeSteps = 30;
                const fadeStepTime = fadeInDuration / fadeSteps;
                const fadeStepVolume = 1.0 / fadeSteps;
                let currentStep = 0;
                
                const fadeInterval = setInterval(() => {
                    currentStep++;
                    const targetVolume = fadeStepVolume * currentStep * (type === 'music' ? this.musicVolume : this.sfxVolume) * this.masterVolume;
                    audioClone.volume = Math.min(targetVolume, (type === 'music' ? this.musicVolume : this.sfxVolume) * this.masterVolume);
                    
                    if (currentStep >= fadeSteps) {
                        clearInterval(fadeInterval);
                    }
                }, fadeStepTime);
                
                audioClone.play().catch(() => {});
                
                return {
                    type: 'html5',
                    audio: audioClone,
                    fadeInterval: fadeInterval,
                    stop: () => {
                        clearInterval(fadeInterval);
                        audioClone.pause();
                        audioClone.currentTime = 0;
                    }
                };
            }
        } catch (error) {
            // Error playing magnet sound
        }
        return null;
    }
    
    /**
     * Update volume for magnet sound (for oscillation)
     * @param {Object} handle - Sound handle from playMagnetSound
     * @param {number} volume - Volume (0-1)
     */
    updateMagnetSoundVolume(handle, volume) {
        if (!handle) return;
        
        try {
            if (handle.type === 'webaudio' && handle.masterGain) {
                const baseVolume = volume * (this.sfxVolume) * this.masterVolume;
                // Cancel any scheduled fade out if volume is being updated (sound is still active)
                const currentTime = this.audioContext.currentTime;
                handle.masterGain.gain.cancelScheduledValues(currentTime);
                handle.masterGain.gain.setValueAtTime(baseVolume, currentTime);
            } else if (handle.type === 'html5' && handle.audio) {
                // For HTML5, scale the volume (accounting for master and SFX volumes)
                const finalVolume = volume * this.sfxVolume * this.masterVolume;
                handle.audio.volume = Math.max(0, Math.min(1, finalVolume));
            }
        } catch (error) {
            // Error updating volume
        }
    }
    
    /**
     * Stop magnet sound with fade out
     * @param {Object} handle - Sound handle from playMagnetSound
     */
    stopMagnetSound(handle) {
        if (!handle) return;
        
        try {
            const fadeOutTime = 0.3; // 0.3s fade out
            
            if (handle.type === 'webaudio' && handle.source && handle.masterGain) {
                const currentTime = this.audioContext.currentTime;
                
                // Fade out volume using masterGain
                handle.masterGain.gain.cancelScheduledValues(currentTime);
                handle.masterGain.gain.setValueAtTime(handle.masterGain.gain.value, currentTime);
                handle.masterGain.gain.linearRampToValueAtTime(0, currentTime + fadeOutTime);
                
                // Stop source after fade out
                handle.source.stop(currentTime + fadeOutTime);
                
                // Clean up after fade out completes
                setTimeout(() => {
                    try {
                        if (handle.gainNode) {
                            handle.gainNode.disconnect();
                        }
                        if (handle.masterGain) {
                            handle.masterGain.disconnect();
                        }
                    } catch (e) {
                        // May already be disconnected
                    }
                }, fadeOutTime * 1000);
            } else if (handle.type === 'html5' && handle.audio) {
                // HTML5 Audio fade out
                const audio = handle.audio;
                const startVolume = audio.volume;
                const fadeOutDuration = fadeOutTime * 1000; // 0.3s in milliseconds
                const fadeSteps = 30;
                const fadeStepTime = fadeOutDuration / fadeSteps;
                const fadeStepVolume = startVolume / fadeSteps;
                let currentStep = 0;
                
                if (handle.fadeInterval) {
                    clearInterval(handle.fadeInterval);
                }
                
                handle.fadeInterval = setInterval(() => {
                    currentStep++;
                    const targetVolume = Math.max(0, startVolume - (fadeStepVolume * currentStep));
                    audio.volume = targetVolume;
                    
                    if (currentStep >= fadeSteps || targetVolume <= 0) {
                        clearInterval(handle.fadeInterval);
                        audio.pause();
                        audio.currentTime = 0;
                    }
                }, fadeStepTime);
            } else if (handle.stop) {
                // Fallback: immediate stop
                handle.stop();
            }
        } catch (error) {
            // Error stopping sound
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
        
        // Track file names - dynamic based on track folder
        // track1 uses 'PilotsOgg', track2 uses 'aWalk'
        const trackPrefix = trackName === 'track2' ? 'aWalk' : 'PilotsOgg';
        const trackFiles = [`${trackPrefix}1`, `${trackPrefix}2`, `${trackPrefix}3`, `${trackPrefix}4`];
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
        
        // Update scales based on active track (minor for track2, major for others)
        this.updateScalesForTrack(trackName);
    }
    
    /**
     * Update peg hit scales based on active track
     * Minor scale for track2, major scale for others
     * @param {string} trackName - Track folder name (e.g., "track1", "track2")
     */
    updateScalesForTrack(trackName) {
        if (trackName === 'track2') {
            // Use minor scale for track2
            this.pegHitScale = this.pegHitScaleMinor;
            this.ghostBallScale = this.ghostBallScaleMinor;
        } else {
            // Use major scale for other tracks
            this.pegHitScale = this.pegHitScaleMajor;
            this.ghostBallScale = this.ghostBallScaleMajor;
        }
        
        // Reset indices when switching scales
        this.pegHitIndex = 0;
        this.pegHitDirection = 1;
        this.ghostBallHitIndex = 0;
        this.ghostBallHitDirection = -1;
    }
    
    /**
     * Get track name for a given index (1-4)
     * Returns the actual track name used in the audio system
     * @param {number} index - Track index (1-4)
     * @returns {string|null} Track name or null if not loaded
     */
    getTrackName(index) {
        if (!this.activeMusic.loaded || !this.activeMusic.tracks || index < 1 || index > 4) {
            return null;
        }
        const track = this.activeMusic.tracks[index - 1];
        return track ? track.name : null;
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

