import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { PhysicsWorld } from './physics/PhysicsWorld.js';
import { Ball } from './entities/Ball.js';
import { Peg } from './entities/Peg.js';
import { Wall } from './entities/Wall.js';
import { Bucket } from './entities/Bucket.js';
import { Bomb } from './entities/Bomb.js';
import { Spike } from './entities/Spike.js';
import { LevelLoader } from './utils/LevelLoader.js';
import { LuckyClover } from './utils/LuckyClover.js';
import { EmojiEffect } from './utils/EmojiEffect.js';
import { SeededRNG } from './utils/SeededRNG.js';
import { AudioManager } from './utils/AudioManager.js';
import { PeterPower } from './characters/PeterPower.js';
import { JohnPower } from './characters/JohnPower.js';
import { SpikeyPower } from './characters/SpikeyPower.js';
import { BuzzPower } from './characters/BuzzPower.js';
import { MikeyPower } from './characters/MikeyPower.js';
import { MaddamPower } from './characters/MaddamPower.js';
import { LevelEditor } from './utils/LevelEditor.js';

// Main game controller
export class Game {
    constructor(container) {
        this.container = container;
        this.canvasWrapper = container.querySelector('#game-canvas-wrapper');
        this.canvas = container.querySelector('#game-canvas');
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.physicsWorld = null;
        
        // 4:3 aspect ratio
        this.aspectRatio = 4 / 3;
        this.animationFrameId = null;
        
        // Game state
        this.balls = [];
        this.pegs = [];
        this.characteristics = []; // Array of characteristic objects
        this.shapes = []; // Array of shape objects (for level loading)
        this.spacers = []; // Array of spacer objects (for level loading)
        this.walls = [];
        this.bucket = null;
        this.lastTime = 0;
        this.frameCount = 0;
        this.ballsRemaining = 10;
        this.score = 0;
        this.goalProgress = 0;
        this.goalTarget = 25;
        this.powerTurnsRemaining = 0; // Number of turns with lucky clover active
        
        // Free ball system - track score accumulated during current shot
        this.currentShotScore = 0; // Score accumulated during current ball's flight
        this.freeBallThreshold = 10000; // Score needed for a free ball
        
        // Purple peg system
        this.purplePegMultiplier = 1.0; // Multiplier from purple peg (1.5x after hitting purple peg)
        this.purplePeg = null; // Reference to the current purple peg
        this.temporaryPurplePegs = []; // Purple pegs created by Peter's lucky bounces (only last for current turn)
        
        // Orange peg multiplier system
        this.orangePegMultiplier = 1.0; // Base multiplier from orange peg progress (2x at 40%, 3x at 60%, 5x at 80%, 10x at 90%)
        
        // Maximum rebound speed for collisions with pegs, walls, and bucket
        this.maxReboundSpeed = 7.5;
        
        // Ball shot speed constant (reduced by 15%, 30%, 10%, and 30%)
        this.ballShotSpeed = 10;
        
        // FPS cap for determinism (target frame rate)
        this.targetFPS = 60; // Can be increased to 120 if needed for hitreg
        this.targetFrameTime = 1000 / this.targetFPS; // milliseconds per frame
        this.lastFrameTime = 0; // Track last frame time for FPS capping
        
        // Performance monitoring and adaptive slowdown
        this.fpsHistory = []; // Track FPS over time
        this.fpsHistorySize = 60; // Track last 60 frames (1 second at 60fps)
        this.performanceMode = 'normal'; // 'normal', 'slowdown', 'heavy_slowdown'
        this.adaptiveSlowdownEnabled = true; // Enable adaptive slowdown when performance degrades
        this.lastFpsCheck = 0;
        this.fpsCheckInterval = 1000; // Check FPS every second
        this.lastMemoryCheck = 0;
        this.memoryCheckInterval = 5000; // Check memory every 5 seconds
        
        // UI elements
        this.ballsRemainingElement = container.querySelector('#balls-remaining');
        this.scoreElement = container.querySelector('#score');
        this.goalElement = container.querySelector('#goal');
        this.fpsDisplayElement = container.querySelector('#fps-display');
        this.powerTurnsElement = container.querySelector('#power-turns');
        this.currentPowerDisplay = container.querySelector('#current-power-display');
        this.nextPowerDisplay = container.querySelector('#next-power-display');
        this.rocketFuelGauge = container.querySelector('#rocket-fuel-gauge');
        this.rocketFuelGaugeFill = container.querySelector('#rocket-fuel-gauge-fill');
        this.freeBallMeterFill = container.querySelector('#free-ball-meter-fill');
        this.multiplierTrackerFill = container.querySelector('#multiplier-tracker-fill');
        this.multiplierValue = container.querySelector('#multiplier-value');
        this.playAgainButton = container.querySelector('#play-again-button');
        this.playAgainNewSeedButton = container.querySelector('#play-again-new-seed-button');
        this.seedValueElement = container.querySelector('#seed-value');
        this.copySeedButton = container.querySelector('#copy-seed-button');
        // Seed input is in character selector, not game container
        this.seedInput = document.querySelector('#seed-input');
        
        // Set up play again button click handler
        if (this.playAgainButton) {
            this.playAgainButton.addEventListener('click', () => {
                this.restartGame();
            });
        }
        
        // Set up play again with new seed button click handler
        if (this.playAgainNewSeedButton) {
            this.playAgainNewSeedButton.addEventListener('click', () => {
                this.restartGameWithNewSeed();
            });
        }
        
        // Trajectory guide
        this.trajectoryGuide = null;
        this.mirrorTrajectoryGuide = null; // For mikey's ghost ball
        this.mouseX = 0;
        this.mouseY = 0;
        
        // Character system
        this.selectedCharacter = null;
        this.characters = [
            {
                id: 'peter',
                name: 'Peter the Leprechaun',
                power: 'Lucky Clover',
                powerDescription: 'Every 3rd peg hit bounces the ball with 75% of original shot momentum and generates a purple peg'
            },
            {
                id: 'john',
                name: 'John, the Gunner',
                power: 'Roulette Power',
                powerDescription: 'Green pegs trigger a roulette with 3 random powers: Spread Shot, Rapid Shot, or Explosion'
            },
            {
                id: 'spikey',
                name: 'Spikey the PufferFish',
                power: 'Spike Power',
                powerDescription: 'On green peg hit, spawn 8 spikes around the peg. Powers up next shot with quill shot (shoots spikes from ball).'
            },
            {
                id: 'buzz',
                name: 'Buzz, the Rocketeer',
                power: 'Rocket Power',
                powerDescription: 'On green peg hit, adds a rocket power shot. Hold Ctrl to activate thrust, giving control of the ball.'
            },
            {
                id: 'mikey',
                name: 'Mikey, the man in the mirror',
                power: 'Mirror Ball',
                powerDescription: 'On green peg hit, grants a power move. On shot, shoots 2 balls: white ball and ethereal mirror ball that reflects along X-axis.'
            },
            {
                id: 'maddam',
                name: 'Maddam Magna Thicke',
                power: 'Magnetic Pegs',
                powerDescription: 'On green peg hit, grants a power for the next shot. Orange, Green, and Purple pegs gain magnetism, pulling the white ball within 1.5 points radius.'
            }
        ];
        
        // Character power systems
        this.peterPower = new PeterPower(this);
        this.johnPower = new JohnPower(this);
        this.spikeyPower = new SpikeyPower(this);
        this.buzzPower = new BuzzPower(this);
        this.mikeyPower = new MikeyPower(this);
        this.maddamPower = new MaddamPower(this);
        this.levelEditor = new LevelEditor(this);
        
        // John the Gunner power system
        this.gamePaused = false;
        this.rouletteActive = false;
        this.selectedPower = null; // Current active power: 'spread', 'rapid', or 'explosion'
        this.powerQueue = []; // Queue for selected powers (one per roulette completed)
        this.rouletteQueue = []; // Queue for roulettes to play (one per green peg hit)
        this.rapidShotQueue = []; // Queue for rapid shot balls
        this.rapidShotDelay = 0.3; // Delay between rapid shots (seconds)
        this.lastRapidShotTime = 0;
        this.musicStarted = false; // Track if music tracks have been started (happens when pegs are generated)
        
        // Spikey the PufferFish power system
        this.quillShotActive = false; // Flag for quill shot power
        this.spikes = []; // Array to track active spikes
        this.greenPegSpikeHitPegs = []; // Track pegs hit by green peg spikes (not from ball)
        
        // Buzz the Rocketeer power system
        this.rocketActive = false; // Flag for rocket power
        
        // Maddam Magna Thicke power system
        this.magneticActive = false; // Flag for magnetic power
        
        // Perks
        this.luckyClover = new LuckyClover();
        this.luckyCloverEnabled = false; // Disabled by default, enabled by green pegs
        
        // Seeded RNG system - will be initialized in startGame() after seed input is checked
        this.rng = null;
        this.currentSeed = null;
        this.selectedLevelPath = null; // Path to selected level JSON file
        
        // Testing controls
        this.testAimAngle = null; // Set by number keys 1-6
        
        // Click handling
        this.setupClickHandler();
        
        // Set up keyboard controls for testing
        this.setupKeyboardControls();
        
        // Set up level selector first, then character selector
        this.setupLevelSelector();
        this.setupCharacterSelector();
        
        // Set up copy seed button
        if (this.copySeedButton) {
            this.copySeedButton.addEventListener('click', () => {
                this.copySeedToClipboard();
            });
        }
        
        // Initialize audio manager once (not in init() to prevent recreation)
        this.audioManager = new AudioManager();
        
        // Preload roulette sound early for character selector
        this.audioManager.loadSound('pegRoulette', `${import.meta.env.BASE_URL}sounds/pegRoulette`, 'sfx').catch(err => {
            console.warn('Failed to preload roulette sound:', err);
        });
        
        // Load music tracks once on page load (mounts all tracks paused and muted except first)
        // This happens once when the game is created, not every time init() is called
        this.loadMusicTracksOnce();
    }
    
    copySeedToClipboard() {
        if (this.currentSeed !== null) {
            navigator.clipboard.writeText(this.currentSeed.toString()).then(() => {
                // Visual feedback
                const originalText = this.copySeedButton.textContent;
                this.copySeedButton.textContent = '✓';
                setTimeout(() => {
                    this.copySeedButton.textContent = originalText;
                }, 1000);
            }).catch(err => {
                // Failed to copy seed
            });
        }
    }
    
    updateSeedDisplay() {
        if (this.seedValueElement && this.currentSeed !== null) {
            this.seedValueElement.textContent = this.currentSeed;
        }
    }

    setupLevelSelector() {
        const selector = document.querySelector('#level-selector');
        const optionsContainer = document.querySelector('#level-options');
        
        if (!selector || !optionsContainer) return;
        
        // Available levels
        const levels = [
            { name: 'Level 1', path: 'levels/level1.json' },
            { name: 'Level 2', path: 'levels/level2.json' },
            { name: 'Level 3', path: 'levels/Level3.json' }
        ];
        
        // Create level option elements
        levels.forEach(level => {
            const option = document.createElement('div');
            option.className = 'level-option';
            option.innerHTML = `
                <div class="level-option-name">${level.name}</div>
            `;
            
            option.addEventListener('click', () => {
                // Remove selected class from all options
                document.querySelectorAll('.level-option').forEach(opt => {
                    opt.classList.remove('selected');
                });
                
                // Add selected class to clicked option
                option.classList.add('selected');
                
                // Store selected level path
                this.selectedLevelPath = level.path;
                
                // Hide level selector and show character selector
                this.hideLevelSelector();
                this.showCharacterSelector();
            });
            
            optionsContainer.appendChild(option);
        });
    }
    
    showLevelSelector() {
        const levelSelector = document.querySelector('#level-selector');
        if (levelSelector) {
            levelSelector.style.display = 'flex';
        }
    }
    
    hideLevelSelector() {
        const levelSelector = document.querySelector('#level-selector');
        if (levelSelector) {
            levelSelector.style.display = 'none';
        }
    }

    setupCharacterSelector() {
        const selector = document.querySelector('#character-selector');
        const optionsContainer = document.querySelector('#character-options');
        const startButton = document.querySelector('#start-game-button');
        
        if (!selector || !optionsContainer || !startButton) return;
        
        // Create character option elements
        this.characters.forEach(character => {
            const option = document.createElement('div');
            option.className = 'character-option';
            option.innerHTML = `
                <div class="character-name">${character.name}</div>
                <div class="character-power">${character.power}: ${character.powerDescription}</div>
            `;
            
            option.addEventListener('click', () => {
                // Remove selected class from all options
                document.querySelectorAll('.character-option').forEach(opt => {
                    opt.classList.remove('selected');
                });
                
                // Add selected class to clicked option
                option.classList.add('selected');
                
                // Store selected character
                this.selectedCharacter = character;
                
                // Enable start button
                startButton.disabled = false;
            });
            
            optionsContainer.appendChild(option);
        });
        
        // Add Random button as part of the character grid
        const randomButtonWrapper = document.createElement('div');
        randomButtonWrapper.id = 'random-character-button-wrapper';
        const randomButtonElement = document.createElement('button');
        randomButtonElement.id = 'random-character-button';
        randomButtonElement.textContent = 'Random';
        randomButtonWrapper.appendChild(randomButtonElement);
        optionsContainer.appendChild(randomButtonWrapper);
        
        // Get the button reference after creating it
        const randomButton = document.querySelector('#random-character-button');
        
        // Random character button handler with roulette effect
        if (randomButton) {
            randomButton.addEventListener('click', () => {
                if (randomButton.disabled) return; // Prevent multiple clicks
                
                // Disable button during roulette
                randomButton.disabled = true;
                startButton.disabled = true;
                
                // Clear any existing selection
                document.querySelectorAll('.character-option').forEach(opt => {
                    opt.classList.remove('selected', 'roulette-highlight');
                });
                
                const options = Array.from(document.querySelectorAll('.character-option'));
                if (options.length === 0) {
                    randomButton.disabled = false;
                    return;
                }
                
                let currentIndex = 0;
                const cycleInterval = 100; // 100ms per option
                const totalCycles = 20; // Cycle 20 times before selecting
                let cycleCount = 0;
                
                const rouletteInterval = setInterval(() => {
                    // Remove highlight from all options
                    options.forEach(opt => {
                        opt.classList.remove('roulette-highlight');
                    });
                    
                    // Highlight current option
                    if (options[currentIndex]) {
                        options[currentIndex].classList.add('roulette-highlight');
                    }
                    
                    // Play roulette sound for each highlight
                    if (this.audioManager) {
                        this.audioManager.playSound('pegRoulette', { volume: 0.6 });
                    }
                    
                    currentIndex = (currentIndex + 1) % options.length;
                    cycleCount++;
                    
                    // After cycling, randomly select one
                    if (cycleCount >= totalCycles) {
                        clearInterval(rouletteInterval);
                        
                        // Random selection
                        const selectedIndex = Math.floor(Math.random() * options.length);
                        const selectedCharacter = this.characters[selectedIndex];
                        
                        // Remove roulette highlight from all
                        options.forEach(opt => {
                            opt.classList.remove('roulette-highlight');
                        });
                        
                        // Add selected class to chosen character
                        if (options[selectedIndex]) {
                            options[selectedIndex].classList.add('selected');
                        }
                        
                        // Store selected character
                        this.selectedCharacter = selectedCharacter;
                        
                        // Re-enable buttons
                        randomButton.disabled = false;
                        startButton.disabled = false;
                    }
                }, cycleInterval);
            });
        }
        
        // Start game button handler
        startButton.addEventListener('click', () => {
            if (this.selectedCharacter) {
                // Start game (handles seed initialization and then calls init)
                this.startGame();
            }
        });
    }

    startGame() {
        // Get seed from input field or generate one
        let seed;
        // Re-query seed input in case it wasn't found during constructor
        const seedInput = this.seedInput || document.querySelector('#seed-input');
        if (seedInput && seedInput.value.trim() !== '') {
            const seedValue = seedInput.value.trim();
            seed = parseInt(seedValue, 10);
            if (isNaN(seed)) {
                // Invalid seed, generate new one
                seed = Date.now();
            }
        } else {
            // Generate new seed
            seed = Date.now();
        }
        
        // Initialize RNG with seed
        this.currentSeed = seed;
        this.rng = new SeededRNG(seed);
        
        // Update seed display
        this.updateSeedDisplay();
        
        // Hide character selector
        this.hideCharacterSelector();
        
        // Initialize game components
        this.init();
    }
    
    showCharacterSelector() {
        const characterSelector = document.querySelector('#character-selector');
        if (characterSelector) {
            characterSelector.style.display = 'flex';
        }
        
        // Mute tracks 2-4 when showing character selector (keep track 1 playing)
        if (this.audioManager) {
            this.audioManager.setMusicTrackMuted('PilotsOgg2', true);
            this.audioManager.setMusicTrackMuted('PilotsOgg3', true);
            this.audioManager.setMusicTrackMuted('PilotsOgg4', true);
        }
    }
    
    hideCharacterSelector() {
        const characterSelector = document.querySelector('#character-selector');
        if (characterSelector) {
            characterSelector.style.display = 'none';
        }
    }
    
    /**
     * Load music tracks once on page load (called from constructor)
     * This ensures tracks are only loaded once, not every time init() is called
     */
    async loadMusicTracksOnce() {
        if (this.audioManager) {
            await this.audioManager.loadMusicTracks('track1', `${import.meta.env.BASE_URL}sounds/`);
        }
    }

    async init() {
        this.setupScene();
        this.setupRenderer();
        this.setupCamera();
        this.setupPhysics();
        this.setupLighting();
        this.setupResizeHandler();
        
        // Initialize emoji effects (needs scene, camera, renderer)
        this.emojiEffect = new EmojiEffect(this.scene, this.camera, this.renderer);
        
        // Audio manager is created in constructor, so it already exists
        // Preload sounds (only if not already loaded)
        if (this.audioManager) {
            await this.audioManager.loadSound('pegHit', `${import.meta.env.BASE_URL}sounds/pegHit`, 'sfx');
            await this.audioManager.loadSound('pegShoot', `${import.meta.env.BASE_URL}sounds/pegShoot`, 'sfx');
            await this.audioManager.loadSound('pegBucket', `${import.meta.env.BASE_URL}sounds/pegBucket`, 'sfx');
            await this.audioManager.loadSound('pegRoulette', `${import.meta.env.BASE_URL}sounds/pegRoulette`, 'sfx');
            await this.audioManager.loadSound('pegSpike', `${import.meta.env.BASE_URL}sounds/pegSpike`, 'sfx');
            await this.audioManager.loadSound('pegSpikeSmall', `${import.meta.env.BASE_URL}sounds/pegSpikeSmall`, 'sfx');
            await this.audioManager.loadSound('pegExplosion', `${import.meta.env.BASE_URL}sounds/pegExplosion`, 'sfx');
            await this.audioManager.loadSound('pegThrust', `${import.meta.env.BASE_URL}sounds/pegThrust`, 'sfx');
            await this.audioManager.loadSound('pegMagnet', `${import.meta.env.BASE_URL}sounds/pegMagnet`, 'sfx');
        }
        
        // Resume audio context on first user interaction (browser autoplay policy)
        const resumeAudio = () => {
            this.audioManager.resumeContext();
            document.removeEventListener('click', resumeAudio);
            document.removeEventListener('keydown', resumeAudio);
        };
        document.addEventListener('click', resumeAudio, { once: true });
        document.addEventListener('keydown', resumeAudio, { once: true });
        
        // Load level (music will start automatically when level loads)
        // Use import.meta.env.BASE_URL to handle base path in production (GitHub Pages)
        // Only load level if selected and not in level editor mode
        const shouldLoadLevel = this.selectedLevelPath && 
            (!this.levelEditor || (!this.levelEditor.isActive && !this.levelEditor.levelLoaded));
        
        if (shouldLoadLevel) {
            await this.loadLevel(`${import.meta.env.BASE_URL}${this.selectedLevelPath}`);
        }
        
        // Initialize UI
        this.updateBallsRemainingUI();
        this.updateScoreUI();
        this.updateGoalUI();
        this.updatePowerTurnsUI();
        
        // Hide play again buttons initially
        this.hidePlayAgainButton();
        this.hidePlayAgainNewSeedButton();
        
        // Create trajectory guide
        this.createTrajectoryGuide();
        
        // Set up collision detection
        this.setupCollisionDetection();
        
        this.startGameLoop();
    }

    setupScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x2a2a3e);
    }

    setupRenderer() {
        const width = this.canvasWrapper.clientWidth;
        const height = this.canvasWrapper.clientHeight;
        
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true
        });
        this.renderer.setSize(width, height);
        // Limit pixel ratio to prevent performance issues on high-DPI displays (especially 4K)
        // 4K displays often have devicePixelRatio of 2-3, which can cause sluggish performance
        // Limit to 1.5x for better performance on 4K displays while maintaining quality
        const maxPixelRatio = 1.5; // Lowered from 2x for 4K performance
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxPixelRatio));
    }

    setupCamera() {
        // 2D Orthographic camera - no perspective distortion
        // View area: 12 units wide, 9 units tall (4:3 ratio)
        const viewWidth = 12;
        const viewHeight = 9;
        
        this.camera = new THREE.OrthographicCamera(
            -viewWidth / 2,  // left
            viewWidth / 2,   // right
            viewHeight / 2,  // top
            -viewHeight / 2, // bottom
            0.1,             // near
            1000             // far
        );
        
        // Position camera for 2D view (looking down Z axis)
        this.camera.position.set(0, 0, 10);
        this.camera.lookAt(0, 0, 0);
    }

    setupPhysics() {
        this.physicsWorld = new PhysicsWorld();
        this.createWalls();
        this.createBucket();
    }

    createWalls() {
        // Camera view is 12 units wide (-6 to 6) and 9 units tall (-4.5 to 4.5)
        const left = -6;
        const right = 6;
        const top = 4.5;
        const wallThickness = 0.2; // Make walls thicker for better collision
        const wallHeight = 9;
        const wallWidth = 12;
        
        const wallMaterial = this.physicsWorld.wallMaterial;
        
        // Left wall - positioned at x = -6, extends from -4.5 to 4.5 in Y
        const leftWall = new Wall(
            this.scene,
            this.physicsWorld,
            { x: left, y: 0, z: 0 },
            { width: wallThickness, height: wallHeight },
            'left',
            wallMaterial
        );
        this.walls.push(leftWall);
        
        // Right wall - positioned at x = 6
        const rightWall = new Wall(
            this.scene,
            this.physicsWorld,
            { x: right, y: 0, z: 0 },
            { width: wallThickness, height: wallHeight },
            'right',
            wallMaterial
        );
        this.walls.push(rightWall);
        
        // Ceiling - positioned at y = 4.5, extends from -6 to 6 in X
        const ceiling = new Wall(
            this.scene,
            this.physicsWorld,
            { x: 0, y: top, z: 0 },
            { width: wallWidth, height: wallThickness },
            'ceiling',
            wallMaterial
        );
        this.walls.push(ceiling);
    }

    createBucket() {
        // Bucket sticks out from bottom by 0.4 units
        // Bottom of screen is at -4.5, so bucket center should be at -4.5 + 0.2 = -4.3
        // (half of 0.4 height)
        const bucketY = -4.5 + 0.2; // -4.3
        const wallMaterial = this.physicsWorld.wallMaterial;
        
        this.bucket = new Bucket(
            this.scene,
            this.physicsWorld,
            { x: 0, y: bucketY, z: 0 },
            wallMaterial
        );
    }

    createVisualBoundaries() {
        // Camera view is 12 units wide (-6 to 6) and 9 units tall (-4.5 to 4.5)
        const left = -6;
        const right = 6;
        const top = 4.5;
        const bottom = -4.5;
        const thickness = 0.1;
        
        // Left wall
        const leftWallGeometry = new THREE.PlaneGeometry(thickness, 9);
        const leftWallMaterial = new THREE.MeshBasicMaterial({ color: 0x666666 });
        const leftWall = new THREE.Mesh(leftWallGeometry, leftWallMaterial);
        leftWall.position.set(left - thickness / 2, 0, 0);
        this.scene.add(leftWall);
        
        // Right wall
        const rightWallGeometry = new THREE.PlaneGeometry(thickness, 9);
        const rightWallMaterial = new THREE.MeshBasicMaterial({ color: 0x666666 });
        const rightWall = new THREE.Mesh(rightWallGeometry, rightWallMaterial);
        rightWall.position.set(right + thickness / 2, 0, 0);
        this.scene.add(rightWall);
        
        // Ceiling
        const ceilingGeometry = new THREE.PlaneGeometry(12, thickness);
        const ceilingMaterial = new THREE.MeshBasicMaterial({ color: 0x666666 });
        const ceiling = new THREE.Mesh(ceilingGeometry, ceilingMaterial);
        ceiling.position.set(0, top + thickness / 2, 0);
        this.scene.add(ceiling);
        
        // Floor (visible boundary at bottom of play area)
        const floorGeometry = new THREE.PlaneGeometry(12, thickness);
        const floorMaterial = new THREE.MeshBasicMaterial({ color: 0x666666 });
        const floor = new THREE.Mesh(floorGeometry, floorMaterial);
        floor.position.set(0, bottom - thickness / 2, 0);
        this.scene.add(floor);
    }

    setupLighting() {
        // Simple ambient light for 2D (no shadows needed)
        const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
        this.scene.add(ambientLight);
    }

    setupClickHandler() {
        // Use mousemove to track cursor position, click to shoot
        this.canvas.addEventListener('mousemove', (event) => {
            this.handleMouseMove(event);
        });
        
        // Use mousedown for bomb detonation and rocket thrust (immediate response)
        this.canvas.addEventListener('mousedown', (event) => {
            this.handleMouseDown(event);
        });
        
        // Use mouseup for stopping rocket thrust (hold mode)
        this.canvas.addEventListener('mouseup', (event) => {
            this.handleMouseUp(event);
        });
        
        // Use click for shooting new ball
        this.canvas.addEventListener('click', (event) => {
            this.handleClick(event);
        });
    }
    
    handleMouseDown(event) {
        // Check if there's an active bomb to manually detonate
        if (this.bombs && this.bombs.length > 0 && this.balls.length === 0) {
            // Manually detonate the first active bomb
            const bomb = this.bombs[0];
            if (bomb && !bomb.exploded) {
                this.explodeBomb(bomb);
                event.preventDefault(); // Prevent click event from firing
                return;
            }
        }
        
        // Check if there's a rocket ball - if so, handle rocket thrust instead of shooting
        const rocketBall = this.balls.find(ball => ball.isRocket && ball.rocketFuelRemaining > 0);
        if (rocketBall && !rocketBall.rocketThrustActive) {
            // Activate thrust on mousedown (hold mode)
            // Reduce ball velocity to 1 when activating thrust (for better control)
            const currentVel = rocketBall.body.velocity;
            const currentSpeed = Math.sqrt(currentVel.x * currentVel.x + currentVel.y * currentVel.y);
            if (currentSpeed > 1.0) {
                // Normalize and scale to 1
                const scale = 1.0 / currentSpeed;
                rocketBall.body.velocity.set(currentVel.x * scale, currentVel.y * scale, 0);
                // Update originalVelocity to match current velocity so bounces are based on actual speed
                rocketBall.originalVelocity = { x: rocketBall.body.velocity.x, y: rocketBall.body.velocity.y, z: 0 };
            }
            
            // Activate thrust
            rocketBall.rocketThrustActive = true;
            rocketBall.rocketThrustStartTime = performance.now() / 1000;
            rocketBall.rocketThrustPower = 1.0; // Start at full power (no ramp up)
            // Play thrust sound (looping)
            if (this.audioManager) {
                rocketBall.rocketThrustSound = this.audioManager.playSound('pegThrust', { volume: 0.7, loop: true });
            }
            event.preventDefault(); // Prevent click event from firing
            return;
        }
    }
    
    handleMouseUp(event) {
        // Stop rocket thrust on mouseup (hold mode)
        const rocketBall = this.balls.find(ball => ball.isRocket && ball.rocketFuelRemaining > 0);
        if (rocketBall && rocketBall.rocketThrustActive) {
            // Deactivate thrust
            rocketBall.rocketThrustActive = false;
            // Update originalVelocity to current velocity after thrust ends
            // This ensures bounces are based on actual current speed, not original shot speed
            const currentVel = rocketBall.body.velocity;
            rocketBall.originalVelocity = { x: currentVel.x, y: currentVel.y, z: currentVel.z || 0 };
            // Stop thrust sound
            if (rocketBall.rocketThrustSound) {
                if (rocketBall.rocketThrustSound.stop) {
                    // Web Audio API source
                    rocketBall.rocketThrustSound.stop();
                } else if (rocketBall.rocketThrustSound.pause) {
                    // HTML5 Audio element
                    rocketBall.rocketThrustSound.pause();
                    rocketBall.rocketThrustSound.currentTime = 0;
                }
                rocketBall.rocketThrustSound = null;
            }
            if (rocketBall.flameMesh) {
                rocketBall.flameMesh.visible = false;
                rocketBall.flameVisible = false;
            }
            event.preventDefault(); // Prevent any click event from firing
        }
    }
    
    setupKeyboardControls() {
        // Keyboard controls for testing
        window.addEventListener('keydown', (event) => {
            // Number keys 1-6: Set test aim angles
            if (event.key >= '1' && event.key <= '6') {
                const keyNum = parseInt(event.key, 10);
                this.setTestAimAngle(keyNum);
            }
            
            // Key 9: Shoot straight down (270 degrees)
            if (event.key === '9') {
                this.testAimAngle = 270; // Straight down
                // Update trajectory guide if no ball is active
                if (this.balls.length === 0 && this.ballsRemaining > 0) {
                    this.updateTrajectoryGuide();
                }
            }
            
            // Key 'f': Reset all pegs (for testing)
            if (event.key === 'f' || event.key === 'F') {
                this.resetAllPegs();
            }
            
            // Space key: Shoot
            if (event.key === ' ') {
                event.preventDefault(); // Prevent page scroll
                this.handleKeyboardShoot();
            }
            
            // Ctrl key: Activate rocket thrust (for Buzz the Rocketeer)
            if (event.ctrlKey || event.metaKey) {
                const rocketBall = this.balls.find(ball => ball.isRocket && ball.rocketFuelRemaining > 0);
                if (rocketBall && !rocketBall.rocketThrustActive) {
                    // Reduce ball velocity to 1 when activating thrust (for better control)
                    const currentVel = rocketBall.body.velocity;
                    const currentSpeed = Math.sqrt(currentVel.x * currentVel.x + currentVel.y * currentVel.y);
                    if (currentSpeed > 1.0) {
                        // Normalize and scale to 1
                        const scale = 1.0 / currentSpeed;
                        rocketBall.body.velocity.set(currentVel.x * scale, currentVel.y * scale, 0);
                        // Update originalVelocity to match current velocity so bounces are based on actual speed
                        rocketBall.originalVelocity = { x: rocketBall.body.velocity.x, y: rocketBall.body.velocity.y, z: 0 };
                    }
                    
                    // Activate thrust
                    rocketBall.rocketThrustActive = true;
                    rocketBall.rocketThrustStartTime = performance.now() / 1000;
                    rocketBall.rocketThrustPower = 1.0; // Start at full power (no ramp up)
                    // Play thrust sound (looping)
                    if (this.audioManager) {
                        rocketBall.rocketThrustSound = this.audioManager.playSound('pegThrust', { volume: 0.7, loop: true });
                    }
                    event.preventDefault();
                }
            }
        });
        
        // Handle keyup for stopping rocket thrust
        window.addEventListener('keyup', (event) => {
            // Stop rocket thrust when Ctrl is released
            if (event.key === 'Control' || event.key === 'Meta') {
                const rocketBall = this.balls.find(ball => ball.isRocket && ball.rocketFuelRemaining > 0);
                if (rocketBall && rocketBall.rocketThrustActive) {
                    // Deactivate thrust
                    rocketBall.rocketThrustActive = false;
                    // Update originalVelocity to current velocity after thrust ends
                    // This ensures bounces are based on actual current speed, not original shot speed
                    const currentVel = rocketBall.body.velocity;
                    rocketBall.originalVelocity = { x: currentVel.x, y: currentVel.y, z: currentVel.z || 0 };
                    // Stop thrust sound
                    if (rocketBall.rocketThrustSound) {
                        if (rocketBall.rocketThrustSound.stop) {
                            // Web Audio API source
                            rocketBall.rocketThrustSound.stop();
                        } else if (rocketBall.rocketThrustSound.pause) {
                            // HTML5 Audio element
                            rocketBall.rocketThrustSound.pause();
                            rocketBall.rocketThrustSound.currentTime = 0;
                        }
                        rocketBall.rocketThrustSound = null;
                    }
                }
            }
        });
    }
    
    resetAllPegs() {
        // Reset all pegs to unhit state
        let resetCount = 0;
        this.pegs.forEach(peg => {
            if (peg.hit) {
                peg.reset();
                resetCount++;
            }
        });
    }
    
    setTestAimAngle(keyNum) {
        // Allowed angle range: 0-10° and 170-360° (blocked: 10° to 170°)
        // Split into 6 angles more evenly
        // Key 1: 5° (middle of 0-10°, 10° range)
        // Keys 2-6: Split 170-360° (190° range) into 5 equal parts of 38° each
        // Key 2: 189° (170-208°)
        // Key 3: 227° (208-246°)
        // Key 4: 265° (246-284°)
        // Key 5: 303° (284-322°)
        // Key 6: 341° (322-360°)
        
        const angles = [5, 189, 227, 265, 303, 341];
        this.testAimAngle = angles[keyNum - 1];
        
        // Update trajectory guide if no ball is active
        if (this.balls.length === 0 && this.ballsRemaining > 0) {
            this.updateTrajectoryGuide();
        }
    }
    
    handleKeyboardShoot() {
        // Shoot using keyboard - if no test aim angle is set, use a default angle
        if (this.balls.length === 0 && this.ballsRemaining > 0) {
            // If no test aim angle is set, set a default one (straight down-right)
            if (this.testAimAngle === null) {
                this.testAimAngle = 225; // Default angle (down-right)
            }
            // Create a synthetic event - handleClick will use testAimAngle
            const rect = this.canvas.getBoundingClientRect();
            const syntheticEvent = {
                clientX: rect.width / 2,
                clientY: rect.height / 2
            };
            this.handleClick(syntheticEvent);
        }
    }

    handleMouseMove(event) {
        // Store mouse position for aiming
        const rect = this.canvas.getBoundingClientRect();
        this.mouseX = event.clientX - rect.left;
        this.mouseY = event.clientY - rect.top;
        
        // Update trajectory guide if no ball is active
        if (this.balls.length === 0 && this.ballsRemaining > 0) {
            this.updateTrajectoryGuide();
        }
    }

    handleClick(event) {
        // Bomb detonation and rocket thrust are handled in handleMouseDown
        // This is only for shooting new balls
        
        // Don't allow firing if level editor is active and not in testing mode
        if (this.levelEditor && this.levelEditor.isActive && !this.levelEditor.testingMode) {
            return;
        }
        
        // Don't allow firing if there's already an active ball (that isn't a rocket)
        if (this.balls.length > 0) {
            return;
        }
        
        // Don't allow firing if no balls remaining (unless in editor testing mode - unlimited balls)
        if (this.ballsRemaining <= 0 && !(this.levelEditor && this.levelEditor.testingMode)) {
            return;
        }
        
        // Get target position - use test aim angle if set, otherwise use mouse position
        let targetX, targetY;
        let mouseX, mouseY, normalizedX, normalizedY;
        
        if (this.testAimAngle !== null) {
            // Use test aim angle (from keyboard)
            const angleRad = this.testAimAngle * (Math.PI / 180);
            const distance = 5; // Distance from spawn point for aiming
            targetX = Math.cos(angleRad) * distance;
            targetY = Math.sin(angleRad) * distance;
            // Clear test aim angle after use
            this.testAimAngle = null;
            mouseX = null;
            mouseY = null;
            normalizedX = null;
            normalizedY = null;
        } else {
            // Use mouse position
            const rect = this.canvas.getBoundingClientRect();
            mouseX = event.clientX - rect.left;
            mouseY = event.clientY - rect.top;
            
            // Convert to normalized coordinates (-1 to 1)
            // Screen Y: 0 at top, increases downward
            // World Y: increases upward, so we need to flip
            normalizedX = (mouseX / rect.width) * 2 - 1;
            normalizedY = 1 - (mouseY / rect.height) * 2; // Flip Y: top of screen (0) -> 1, bottom -> -1
            
            // Convert to 2D world coordinates
            // Camera view is 12 units wide (-6 to 6), 9 units tall (-4.5 to 4.5)
            targetX = normalizedX * 6;
            targetY = normalizedY * 4.5;
        }
        
        // Spawn ball at horizontal center, well below ceiling to avoid immediate collision
        // Ball radius is 0.2, so diameter is 0.4
        // 3 ball sizes = 3 * 0.4 = 1.2 units
        // Moving up from 2.5: 2.5 + 1.2 = 3.7
        let spawnX = 0; // Horizontal center
        let spawnY = 3.7; // Moved up by 3 ball sizes
        let spawnZ = 0;
        
        // Round spawn position to 3 decimals for determinism
        spawnX = this.roundToDecimals(spawnX);
        spawnY = this.roundToDecimals(spawnY);
        spawnZ = this.roundToDecimals(spawnZ);
        
        // Calculate direction from spawn point to mouse position
        let dx = targetX - spawnX;
        let dy = targetY - spawnY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Prevent division by zero
        if (distance < 0.01) {
            return;
        }
        
        // Calculate angle in degrees (standard atan2: 0° = right, 90° = up, 180° = left, 270° = down)
        // Round dx/dy before atan2 for determinism
        dx = this.roundToDecimals(dx);
        dy = this.roundToDecimals(dy);
        let angle = Math.atan2(dy, dx) * (180 / Math.PI);
        // Round angle for determinism
        angle = this.roundToDecimals(angle);
        // Convert from -180 to 180 range to 0 to 360 range
        if (angle < 0) {
            angle += 360;
        }
        
        // Clamp angle to block 160° cone looking straight up (80° on each side of 90°)
        // Block from 10° to 170° (160° total), allow 170° to 10° (wrapping around)
        // This means we allow: 170° to 360° and 0° to 10°, which is the same as blocking 10° to 170°
        const blockedStart = 10;  // Start of blocked cone
        const blockedEnd = 170;   // End of blocked cone
        
        if (angle > blockedStart && angle < blockedEnd) {
            // Clamp to nearest boundary
            if (angle < 90) {
                // Closer to start boundary
                angle = blockedStart;
            } else {
                // Closer to end boundary
                angle = blockedEnd;
            }
        }
        
        // Convert back to radians and calculate velocity
        // Round angleRad for determinism
        const angleRad = this.roundToDecimals(angle * (Math.PI / 180));
        const clampedDx = this.roundToDecimals(Math.cos(angleRad));
        const clampedDy = this.roundToDecimals(Math.sin(angleRad));
        
        // Normalize direction and apply speed
        const speed = this.ballShotSpeed;
        let velocityX = clampedDx * speed;
        let velocityY = clampedDy * speed;
        
        // Round initial velocity to 3 decimals for determinism
        velocityX = this.roundToDecimals(velocityX);
        velocityY = this.roundToDecimals(velocityY);
        
        const originalVelocity = { x: velocityX, y: velocityY, z: 0 };
        
        
        // Reset lucky clover for new ball
        this.luckyClover.reset();
        
        // Reset purple peg multiplier
        this.purplePegMultiplier = 1.0;
        
        // Reset peg hit sound scale for new shot
        if (this.audioManager) {
            this.audioManager.resetPegHitScale();
        }
        
        // Set lucky clover active state for this ball (from previous green peg hit)
        // This will be set when the ball is spawned
        
        // Hide trajectory guide when shooting
        this.hideTrajectoryGuide();
        
        // Check if John's power is active - if selectedPower is set from roulette, use it
        // (Roulette was already triggered when power turn became ready, not when player clicks)
        if (this.selectedCharacter?.id === 'john' && this.selectedPower) {
            // Execute shot with selected power (will consume selectedPower in handleShot)
            this.executeShot(spawnX, spawnY, spawnZ, targetX, targetY, originalVelocity);
            return;
        }
        
        // No power selected, proceed with normal shot
        this.executeShot(spawnX, spawnY, spawnZ, targetX, targetY, originalVelocity);
    }
    
    executeShot(spawnX, spawnY, spawnZ, targetX, targetY, originalVelocity) {
        // Play shoot sound
        if (this.audioManager) {
            this.audioManager.playSound('pegShoot', { volume: 1 });
        }
        
        // Check if power is available for this shot BEFORE decrementing
        const hasPower = this.powerTurnsRemaining > 0;
        
        // Check if John's power should be used for this shot (if selectedPower is set from roulette)
        const johnPowerUsed = this.johnPower.handleShot(spawnX, spawnY, spawnZ, targetX, targetY, originalVelocity);
        
        if (!johnPowerUsed) {
            // Normal shot or quill shot
            // Decrement balls remaining and update UI (unless in editor testing mode - unlimited balls)
            if (!(this.levelEditor && this.levelEditor.testingMode)) {
                this.ballsRemaining--;
                this.updateBallsRemainingUI();
            }
            
            // Check if quill shot should be active (based on power turns remaining, not just the flag)
            // Quill shot is available if: has power turns AND is Spikey AND quill shot was activated (flag is true)
            const isQuillShot = hasPower && this.selectedCharacter?.id === 'spikey' && this.quillShotActive;
            
            // Check if rocket should be active (based on power turns remaining, not just the flag)
            // Rocket is available if: has power turns AND is Buzz AND rocket was activated (flag is true)
            const isRocket = hasPower && this.selectedCharacter?.id === 'buzz' && this.rocketActive;
            
            // Check if mirror ball should be active (Mikey's power)
            const isMirrorBall = hasPower && this.selectedCharacter?.id === 'mikey';
            
            // Check if magnetic power should be active (Maddam's power)
            const isMagnetic = hasPower && this.selectedCharacter?.id === 'maddam' && this.magneticActive;
            
            const whiteBall = this.spawnBall(spawnX, spawnY, spawnZ, originalVelocity, originalVelocity, false, isQuillShot, isRocket);
            
            // If mirror ball power is active, create ghost ball
            if (isMirrorBall && whiteBall) {
                whiteBall.isMirrorBallActive = true;
                this.mikeyPower.createGhostBallVisual(whiteBall);
            }
            
            // If magnetic power is active, mark ball (magnets already created when shot ended)
            if (isMagnetic && whiteBall) {
                whiteBall.isMagnetic = true;
                // Reset flag so magnets can be reactivated on next shot end
                this.maddamPower.magnetismActivatedThisShot = false;
            }
            
            // Update power display immediately after spawning to show full fuel gauge for new rocket ball
            if (isRocket) {
                this.updatePowerDisplay();
            }
            
            // Consume quill shot flag after spawnBall (but keep power turns active for next shot if counter > 1)
            // Only consume if we actually used quill shot AND this was the last power turn
            if (isQuillShot && this.powerTurnsRemaining <= 1) {
                this.quillShotActive = false;
            }
            
            // Only consume rocket flag if we actually used rocket AND this was the last power turn
            if (isRocket && this.powerTurnsRemaining <= 1) {
                this.rocketActive = false;
            }
        }
        
        // Decrement power turns after shot is taken (if power was available)
        if (hasPower) {
            this.powerTurnsRemaining--;
            this.updatePowerTurnsUI();
            this.updatePowerDisplay();
            
            // Disable powers when counter reaches 0
            if (this.powerTurnsRemaining === 0) {
                this.luckyCloverEnabled = false;
                this.quillShotActive = false;
                this.magneticActive = false; // Disable magnetic power
                this.selectedPower = null;
                this.powerQueue = [];
                this.updatePowerDisplay();
                
                // Force hide magnets when power turns reach 0 and reset activation flag
                if (this.selectedCharacter?.id === 'maddam' && this.maddamPower) {
                    // Update magnet visuals one more time to scale them to 0
                    this.maddamPower.updateMagnetVisuals(0.001); // Small deltaTime to trigger update
                    // Reset flag so magnets can be reactivated when power is granted again
                    this.maddamPower.magnetismActivatedThisShot = false;
                }
            }
        }
    }
    
    spawnSpreadShot(spawnX, spawnY, spawnZ, targetX, targetY) {
        // Calculate base direction
        let dx = targetX - spawnX;
        let dy = targetY - spawnY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < 0.01) return;
        
        // Calculate angle in degrees (standard atan2: 0° = right, 90° = up, 180° = left, 270° = down)
        let angle = Math.atan2(dy, dx) * (180 / Math.PI);
        // Convert from -180 to 180 range to 0 to 360 range
        if (angle < 0) {
            angle += 360;
        }
        
        // Clamp angle to block 160° cone looking straight up (80° on each side of 90°)
        // Block from 10° to 170° (160° total)
        const blockedStart = 10;  // Start of blocked cone
        const blockedEnd = 170;   // End of blocked cone
        
        if (angle > blockedStart && angle < blockedEnd) {
            // Clamp to nearest boundary
            if (angle < 90) {
                // Closer to start boundary
                angle = blockedStart;
            } else {
                // Closer to end boundary
                angle = blockedEnd;
            }
        }
        
        // Convert back to radians for base angle
        const baseAngle = angle * (Math.PI / 180);
        const speed = this.ballShotSpeed;
        
        // Spawn 3 balls: -15°, 0°, +15°
        const angles = [-15 * Math.PI / 180, 0, 15 * Math.PI / 180];
        
        angles.forEach((angleOffset, index) => {
            const angle = baseAngle + angleOffset;
            const velocityX = Math.cos(angle) * speed;
            const velocityY = Math.sin(angle) * speed;
            
            // Round velocity
            const roundedVX = this.roundToDecimals(velocityX);
            const roundedVY = this.roundToDecimals(velocityY);
            
            const velocity = { x: roundedVX, y: roundedVY, z: 0 };
            const originalVelocity = { ...velocity };
            
            // Center ball is white, side balls are yellow
            const isYellow = index !== 1;
            
            this.spawnBall(spawnX, spawnY, spawnZ, velocity, originalVelocity, isYellow);
        });
        
        // Only decrement ball count once for spread shot (unless in editor testing mode - unlimited balls)
        if (!(this.levelEditor && this.levelEditor.testingMode)) {
            this.ballsRemaining--;
            this.updateBallsRemainingUI();
        }
    }
    
    spawnBomb(spawnX, spawnY, spawnZ, velocity) {
        const ballMaterial = this.physicsWorld.getBallMaterial();
        const bomb = new Bomb(this.scene, this.physicsWorld, { x: spawnX, y: spawnY, z: spawnZ }, velocity, ballMaterial);
        
        // Store initial position for radius check (like regular balls)
        bomb.initialPosition = { x: spawnX, y: spawnY, z: spawnZ };
        bomb.originalVelocity = velocity || { x: 0, y: 0, z: 0 };
        
        if (!this.bombs) {
            this.bombs = [];
        }
        this.bombs.push(bomb);
        
        // Decrement ball count (unless in editor testing mode - unlimited balls)
        if (!(this.levelEditor && this.levelEditor.testingMode)) {
            this.ballsRemaining--;
            this.updateBallsRemainingUI();
        }
    }
    
    explodeBomb(bomb) {
        if (!bomb || bomb.exploded) return;
        
        // Play explosion sound at point of detonation
        if (this.audioManager) {
            this.audioManager.playSound('pegExplosion', { volume: 0.8 });
        }
        
        bomb.explode();
        const bombPos = bomb.body.position;
        const explosionRadius = 1.5;
        
        
        // Find all pegs within explosion radius
        const pegsToHit = this.pegs.filter(peg => {
            const pegPos = peg.body.position;
            const dx = pegPos.x - bombPos.x;
            const dy = pegPos.y - bombPos.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            return distance <= explosionRadius;
        });
        
        // Track pegs hit by explosion for later removal
        const explosionHitPegs = [];
        const currentTime = performance.now() / 1000;
        
        // Separate purple pegs from other pegs
        const purplePegs = pegsToHit.filter(peg => peg.isPurple && !peg.hit);
        const otherPegs = pegsToHit.filter(peg => !peg.isPurple && !peg.hit);
        
        // Process purple pegs FIRST to activate multiplier before other pegs
        purplePegs.forEach(peg => {
            peg.onHit();
            if (this.audioManager) {
                this.audioManager.playPegHit();
            }
            explosionHitPegs.push(peg); // Track for removal
            
            // Add score for purple peg (flat 2000 points, no multiplier)
            const purplePoints = 2000;
            const finalPoints = purplePoints; // No multiplier for purple peg
            this.score += finalPoints;
            this.currentShotScore += finalPoints;
            
            // Activate 1.25x multiplier for following pegs
            this.purplePegMultiplier = 1.25;
            
            // Update UI
            this.updateScoreUI();
            this.updateFreeBallMeter();
            this.updateOrangePegMultiplier();
            
            // Ensure purple peg color changes to darker shade
            peg.mesh.material.color.setHex(0x9370db); // Medium purple (darker when hit)
            
            // Check for green peg (power activation) - purple pegs can also be green
            if (peg.isGreen) {
                // Peter the Leprechaun: add 3 turns per green peg hit
                if (this.selectedCharacter?.id === 'peter') {
                    this.powerTurnsRemaining += 3;
                    this.updatePowerTurnsUI();
                    this.updatePowerDisplay();
                    
                    // Show clover emoji at peg position
                    const pegPos = peg.body.position;
                    if (this.emojiEffect) {
                        this.emojiEffect.showEmoji('🍀', pegPos, 0.5);
                    }
                } else if (this.selectedCharacter?.id === 'mikey') {
                    // Mikey, the man in the mirror: add 2 turns per green peg hit
                    this.powerTurnsRemaining += 2;
                    this.updatePowerTurnsUI();
                } else if (this.selectedCharacter?.id === 'maddam') {
                    // Maddam Magna Thicke: add 1 turn per green peg hit
                    this.powerTurnsRemaining += 1;
                    this.updatePowerTurnsUI();
                } else {
                    // All other characters: add 1 turn per green peg hit
                    this.powerTurnsRemaining += 1;
                    this.updatePowerTurnsUI();
                }
                
                // John the Gunner: trigger roulette immediately when green peg is hit
                if (this.selectedCharacter?.id === 'john') {
                    // Trigger roulette immediately (will pause game and show UI)
                    if (!this.rouletteActive && !this.gamePaused) {
                        this.triggerRoulette();
                    } else {
                        // If roulette is already active, queue it
                        this.rouletteQueue.push({
                            timestamp: performance.now() / 1000
                        });
                    }
                }
                
                // Spikey the PufferFish: spawn spikes and activate quill shot
                if (this.selectedCharacter?.id === 'spikey') {
                    this.spikeyPower.onGreenPegHit(peg);
                    this.updatePowerDisplay();
                }
                
                // Buzz the Rocketeer: activate rocket power
                if (this.selectedCharacter?.id === 'buzz') {
                    this.buzzPower.onGreenPegHit(peg);
                    this.rocketActive = true; // Activate rocket for next shot
                    this.updatePowerDisplay();
                }
            }
            
            // Check for free ball
            if (this.currentShotScore >= this.freeBallThreshold) {
                const freeBallsAwarded = Math.floor(this.currentShotScore / this.freeBallThreshold);
                this.ballsRemaining += freeBallsAwarded;
                this.currentShotScore = this.currentShotScore % this.freeBallThreshold;
                this.updateBallsRemainingUI();
                this.updateFreeBallMeter();
            }
        });
        
        // Now process all other pegs (they will benefit from the purple peg multiplier if it was activated)
        otherPegs.forEach(peg => {
            peg.onHit();
            if (this.audioManager) {
                this.audioManager.playPegHit();
            }
            explosionHitPegs.push(peg); // Track for removal
            
            // Add score (now with purple peg multiplier if purple peg was hit)
            const totalMultiplier = this.orangePegMultiplier * this.purplePegMultiplier;
            const basePoints = peg.pointValue || 300;
            const finalPoints = Math.floor(basePoints * totalMultiplier);
            this.score += finalPoints;
            this.currentShotScore += finalPoints;
            
            // Update UI
            this.updateScoreUI();
            this.updateFreeBallMeter();
            
            // Check for orange peg
            if (peg.isOrange) {
                this.goalProgress++;
                this.updateGoalUI();
                this.updateOrangePegMultiplier();
            }
            
            // Check for green peg (power activation)
            if (peg.isGreen) {
                // Peter the Leprechaun: add 3 turns per green peg hit
                if (this.selectedCharacter?.id === 'peter') {
                    this.powerTurnsRemaining += 3;
                    this.updatePowerTurnsUI();
                    this.updatePowerDisplay();
                    
                    // Show clover emoji at peg position
                    const pegPos = peg.body.position;
                    if (this.emojiEffect) {
                        this.emojiEffect.showEmoji('🍀', pegPos, 0.5);
                    }
                } else if (this.selectedCharacter?.id === 'mikey') {
                    // Mikey, the man in the mirror: add 2 turns per green peg hit
                    this.powerTurnsRemaining += 2;
                    this.updatePowerTurnsUI();
                } else if (this.selectedCharacter?.id === 'maddam') {
                    // Maddam Magna Thicke: add 1 turn per green peg hit
                    this.powerTurnsRemaining += 1;
                    this.updatePowerTurnsUI();
                } else {
                    // All other characters: add 1 turn per green peg hit
                    this.powerTurnsRemaining += 1;
                    this.updatePowerTurnsUI();
                }
                
                // John the Gunner: trigger roulette immediately when green peg is hit
                if (this.selectedCharacter?.id === 'john') {
                    // Trigger roulette immediately (will pause game and show UI)
                    if (!this.rouletteActive && !this.gamePaused) {
                        this.triggerRoulette();
                    } else {
                        // If roulette is already active, queue it
                        this.rouletteQueue.push({
                            timestamp: performance.now() / 1000
                        });
                    }
                }
                
                // Spikey the PufferFish: spawn spikes and activate quill shot
                if (this.selectedCharacter?.id === 'spikey') {
                    this.spikeyPower.onGreenPegHit(peg);
                    this.updatePowerDisplay();
                }
                
                // Buzz the Rocketeer: activate rocket power
                if (this.selectedCharacter?.id === 'buzz') {
                    this.buzzPower.onGreenPegHit(peg);
                    this.rocketActive = true; // Activate rocket for next shot
                    this.updatePowerDisplay();
                }
            }
            
            // Check for free ball
            if (this.currentShotScore >= this.freeBallThreshold) {
                const freeBallsAwarded = Math.floor(this.currentShotScore / this.freeBallThreshold);
                this.ballsRemaining += freeBallsAwarded;
                this.currentShotScore = this.currentShotScore % this.freeBallThreshold;
                this.updateBallsRemainingUI();
                this.updateFreeBallMeter();
            }
        });
        
        // Convert bomb to regular ball instead of removing it
        bomb.convertToBall();
        
        // Remove from bombs array
        const bombIndex = this.bombs.indexOf(bomb);
        if (bombIndex !== -1) {
            this.bombs.splice(bombIndex, 1);
        }
        
        // Add to balls array as a regular ball
        const bombPosAtSpawn = bomb.initialPosition || { x: bombPos.x, y: bombPos.y, z: bombPos.z };
        
        // Set up ball properties
        bomb.hitPegs = [];
        bomb.initialPosition = bombPosAtSpawn;
        bomb.lastNewPegHitTime = currentTime;
        bomb.spawnTime = bomb.spawnTime || currentTime;
        bomb.luckyCloverActive = this.powerTurnsRemaining > 0;
        bomb.usedPower = this.powerTurnsRemaining > 0;
        bomb.shouldRemove = false;
        bomb.caught = false;
        
        // Store explosion-related data for peg removal
        bomb.explosionHitPegs = explosionHitPegs; // Store pegs hit by explosion
        bomb.explosionTime = currentTime; // Store when explosion happened
        
        // Store original velocity (use current velocity if available)
        if (!bomb.originalVelocity) {
            bomb.originalVelocity = {
                x: bomb.body.velocity.x,
                y: bomb.body.velocity.y,
                z: bomb.body.velocity.z
            };
        }
        
        // Add to balls array
        this.balls.push(bomb);
        
    }
    
    createTrajectoryGuide() {
        // Create a line geometry for the trajectory guide
        const points = [];
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({
            color: 0xffff00, // Yellow
            linewidth: 2,
            transparent: true,
            opacity: 0.6
        });
        
        this.trajectoryGuide = new THREE.Line(geometry, material);
        this.trajectoryGuide.visible = false;
        this.scene.add(this.trajectoryGuide);
        
        // Create mirrored trajectory guide for mikey's ghost ball (60% opacity of standard guide)
        const mirrorGeometry = new THREE.BufferGeometry().setFromPoints(points);
        const mirrorMaterial = new THREE.LineBasicMaterial({
            color: 0xffff00, // Yellow
            linewidth: 2,
            transparent: true,
            opacity: 0.36 // 60% of 0.6
        });
        
        this.mirrorTrajectoryGuide = new THREE.Line(mirrorGeometry, mirrorMaterial);
        this.mirrorTrajectoryGuide.visible = false;
        this.scene.add(this.mirrorTrajectoryGuide);
    }
    
    updateTrajectoryGuide() {
        // In editor testing mode, always show trajectory guide (unlimited balls)
        const hasBallsLeft = (this.levelEditor && this.levelEditor.testingMode) || this.ballsRemaining > 0;
        if (!this.trajectoryGuide || this.balls.length > 0 || !hasBallsLeft) {
            if (this.trajectoryGuide) {
                this.trajectoryGuide.visible = false;
            }
            if (this.mirrorTrajectoryGuide) {
                this.mirrorTrajectoryGuide.visible = false;
            }
            return;
        }
        
        // Get target position - use test aim angle if set, otherwise use mouse position
        let targetX, targetY;
        
        if (this.testAimAngle !== null) {
            // Use test aim angle (from keyboard)
            const angleRad = this.testAimAngle * (Math.PI / 180);
            const distance = 5; // Distance from spawn point for aiming
            targetX = Math.cos(angleRad) * distance;
            targetY = Math.sin(angleRad) * distance;
        } else {
            // Use mouse position
            const rect = this.canvas.getBoundingClientRect();
            // Ensure mouseX and mouseY are defined (default to center if not set)
            const mouseX = (this.mouseX !== undefined && this.mouseX !== null) ? this.mouseX : rect.width / 2;
            const mouseY = (this.mouseY !== undefined && this.mouseY !== null) ? this.mouseY : rect.height / 2;
            
            // Convert to normalized coordinates
            const normalizedX = (mouseX / rect.width) * 2 - 1;
            const normalizedY = 1 - (mouseY / rect.height) * 2;
            
            // Convert to world coordinates
            targetX = normalizedX * 6;
            targetY = normalizedY * 4.5;
        }
        
        // Spawn position (same as in handleClick)
        const spawnX = 0;
        const spawnY = 3.7;
        const spawnZ = 0;
        
        // Calculate direction and velocity
        let dx = targetX - spawnX;
        let dy = targetY - spawnY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < 0.01) {
            this.trajectoryGuide.visible = false;
            if (this.mirrorTrajectoryGuide) {
                this.mirrorTrajectoryGuide.visible = false;
            }
            return;
        }
        
        // Calculate angle in degrees (standard atan2: 0° = right, 90° = up, 180° = left, 270° = down)
        let angle = Math.atan2(dy, dx) * (180 / Math.PI);
        // Convert from -180 to 180 range to 0 to 360 range
        if (angle < 0) {
            angle += 360;
        }
        
        // Clamp angle to block 160° cone looking straight up (80° on each side of 90°)
        // Block from 10° to 170° (160° total)
        const blockedStart = 10;  // Start of blocked cone
        const blockedEnd = 170;   // End of blocked cone
        
        if (angle > blockedStart && angle < blockedEnd) {
            // Clamp to nearest boundary
            if (angle < 90) {
                // Closer to start boundary
                angle = blockedStart;
            } else {
                // Closer to end boundary
                angle = blockedEnd;
            }
        }
        
        // Convert back to radians and recalculate direction
        const angleRad = angle * (Math.PI / 180);
        const clampedDx = Math.cos(angleRad);
        const clampedDy = Math.sin(angleRad);
        
        // Use the same speed constant as handleClick
        const speed = this.ballShotSpeed;
        const velocityX = clampedDx * speed;
        const velocityY = clampedDy * speed;
        
        // Calculate trajectory points using physics simulation
        const points = this.calculateTrajectory(spawnX, spawnY, velocityX, velocityY);
        
        // Update the line geometry
        this.trajectoryGuide.geometry.setFromPoints(points);
        this.trajectoryGuide.visible = true;
        
        // Update mirrored trajectory guide for mikey's ghost ball if power is active
        const isMikeyPowerActive = this.selectedCharacter?.id === 'mikey' && this.powerTurnsRemaining > 0;
        if (isMikeyPowerActive && this.mirrorTrajectoryGuide) {
            // Calculate mirrored trajectory: same spawn position, but mirror velocity X
            // The ghost ball mirrors the white ball's path along X-axis
            const mirroredVelocityX = -velocityX; // Mirror velocity along X-axis
            const mirroredPoints = this.calculateTrajectory(spawnX, spawnY, mirroredVelocityX, velocityY);
            this.mirrorTrajectoryGuide.geometry.setFromPoints(mirroredPoints);
            this.mirrorTrajectoryGuide.visible = true;
        } else if (this.mirrorTrajectoryGuide) {
            this.mirrorTrajectoryGuide.visible = false;
        }
    }
    
    calculateTrajectory(startX, startY, velocityX, velocityY) {
        const points = [];
        const gravity = -9.82;
        const timeStep = 0.02; // 20ms steps
        const maxTime = 3.0; // Maximum trajectory time
        const maxPoints = 150; // Limit points for performance
        const maxRadius = 3.0; // Maximum distance from spawn point (3 units)
        
        let x = startX;
        let y = startY;
        let vx = velocityX;
        let vy = velocityY;
        let t = 0;
        
        points.push(new THREE.Vector3(x, y, 0));
        
        // Simulate trajectory until it goes out of bounds, exceeds radius, or hits max time/points
        while (t < maxTime && points.length < maxPoints) {
            t += timeStep;
            
            // Update position (simple Euler integration)
            x += vx * timeStep;
            y += vy * timeStep;
            vy += gravity * timeStep;
            
            // Calculate distance from spawn point
            const dx = x - startX;
            const dy = y - startY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            // Stop if exceeds 3 unit radius from spawn point
            if (distance > maxRadius) {
                break;
            }
            
            // Stop if out of bounds (below screen or too far left/right)
            if (y < -6 || x < -7 || x > 7) {
                break;
            }
            
            // Check for wall collisions (simplified - just stop at boundaries)
            if (x <= -6 || x >= 6) {
                // Bounce off wall (reverse X velocity)
                vx = -vx * 0.875; // Apply restitution
                x = Math.max(-6, Math.min(6, x)); // Clamp to wall
            }
            
            if (y >= 4.5) {
                // Bounce off ceiling (reverse Y velocity)
                vy = -vy * 0.875; // Apply restitution
                y = Math.min(4.5, y); // Clamp to ceiling
            }
            
            points.push(new THREE.Vector3(x, y, 0));
        }
        
        return points;
    }
    
    hideTrajectoryGuide() {
        if (this.trajectoryGuide) {
            this.trajectoryGuide.visible = false;
        }
        if (this.mirrorTrajectoryGuide) {
            this.mirrorTrajectoryGuide.visible = false;
        }
    }
    
    updateBallsRemainingUI() {
        if (this.ballsRemainingElement) {
            // Show "Unlimited" in editor testing mode
            if (this.levelEditor && this.levelEditor.testingMode) {
                this.ballsRemainingElement.textContent = `Balls: Unlimited`;
            } else {
                this.ballsRemainingElement.textContent = `Balls: ${this.ballsRemaining}`;
            }
        }
    }
    
    updateScoreUI() {
        if (this.scoreElement) {
            this.scoreElement.textContent = `Score: ${this.score}`;
        }
    }
    
    updateGoalUI() {
        if (this.goalElement) {
            this.goalElement.textContent = `Goal: ${this.goalProgress}/${this.goalTarget}`;
        }
    }
    
    updatePowerTurnsUI() {
        if (this.powerTurnsElement) {
            this.powerTurnsElement.textContent = `Power: ${this.powerTurnsRemaining}`;
        }
    }
    
    consumePower() {
        // Remove current power from queue and set next one
        if (this.powerQueue.length > 0) {
            this.powerQueue.shift();
            // Set next power in queue as current
            this.selectedPower = this.powerQueue.length > 0 ? this.powerQueue[0] : null;
            this.updatePowerDisplay();
        } else {
            this.selectedPower = null;
            this.updatePowerDisplay();
        }
    }
    
    updatePowerDisplay() {
        // Update power display at spawn point (works for all characters)
        if (!this.selectedCharacter || this.powerTurnsRemaining === 0) {
            // No power active - clear displays
            if (this.currentPowerDisplay) {
                this.currentPowerDisplay.textContent = '';
            }
            if (this.nextPowerDisplay) {
                this.nextPowerDisplay.textContent = '';
                // Remove background when no power
                this.nextPowerDisplay.style.background = 'transparent';
            }
            return;
        }
        
        const powerNames = {
            'spread': 'Spread Shot',
            'rapid': 'Rapid Shot',
            'explosion': 'Explosion',
            'quill': 'Quill Shot',
            'lucky': 'Lucky Clover'
        };
        
        // Determine current power based on character
        // Only show power name if power turns are available (power activates on shot, not immediately)
        let currentPowerName = '';
        if (this.selectedCharacter.id === 'john' && this.selectedPower) {
            currentPowerName = powerNames[this.selectedPower] || this.selectedPower;
        } else if (this.selectedCharacter.id === 'spikey' && this.quillShotActive && this.powerTurnsRemaining > 0) {
            currentPowerName = powerNames['quill'];
        } else if (this.selectedCharacter.id === 'peter' && this.powerTurnsRemaining > 0) {
            currentPowerName = powerNames['lucky'];
        } else if (this.selectedCharacter.id === 'buzz' && this.rocketActive && this.powerTurnsRemaining > 0) {
            currentPowerName = 'Rocket';
        } else if (this.selectedCharacter.id === 'mikey' && this.powerTurnsRemaining > 0) {
            currentPowerName = 'Mirror Ball';
        } else if (this.selectedCharacter.id === 'maddam' && this.powerTurnsRemaining > 0) {
            currentPowerName = 'Magnetic Pegs';
        }
        
        // Show current power
        if (this.currentPowerDisplay) {
            if (currentPowerName) {
                this.currentPowerDisplay.textContent = currentPowerName;
            } else {
                this.currentPowerDisplay.textContent = '';
            }
        }
        
        // Update rocket fuel gauge (only visible when rocket ball exists with fuel)
        if (this.rocketFuelGauge && this.rocketFuelGaugeFill) {
            const activeRocketBall = this.balls.find(ball => ball.isRocket && ball.rocketFuelRemaining !== undefined && ball.rocketFuelRemaining > 0);
            if (activeRocketBall && this.selectedCharacter?.id === 'buzz') {
                // Show gauge and update fill based on fuel remaining
                const maxFuel = 2.0; // Maximum fuel time in seconds
                const fuelPercent = Math.max(0, Math.min(100, (activeRocketBall.rocketFuelRemaining / maxFuel) * 100));
                this.rocketFuelGaugeFill.style.width = `${fuelPercent}%`;
                this.rocketFuelGauge.style.display = 'block';
            } else {
                // Hide gauge when no active rocket ball or fuel depleted
                this.rocketFuelGauge.style.display = 'none';
            }
        }
        
        // Show next powers (if queued)
        if (this.nextPowerDisplay) {
            const nextPowers = [];
            
            // For gunner, show queued powers
            if (this.selectedCharacter.id === 'john' && this.powerQueue.length > 1) {
                // Show all queued powers (skip first one as it's current)
                for (let i = 1; i < Math.min(this.powerQueue.length, 3); i++) {
                    const powerName = powerNames[this.powerQueue[i]] || this.powerQueue[i];
                    nextPowers.push(powerName);
                }
                // Add "+" if there are more than 2 total powers in queue
                if (this.powerQueue.length > 3) {
                    nextPowers.push('+');
                }
            }
            
            if (nextPowers.length > 0) {
                this.nextPowerDisplay.textContent = nextPowers.join(' | ');
                // Show background only when there's a power active
                this.nextPowerDisplay.style.background = 'rgba(0, 0, 0, 0.4)';
            } else {
                this.nextPowerDisplay.textContent = '';
                // Remove background when no next power
                this.nextPowerDisplay.style.background = 'transparent';
            }
        }
    }
    
    updateFreeBallMeter() {
        if (this.freeBallMeterFill) {
            const progress = Math.min(100, (this.currentShotScore / this.freeBallThreshold) * 100);
            this.freeBallMeterFill.style.width = `${progress}%`;
        }
    }
    
    checkGameOver() {
        // Game is over if:
        // 1. No balls remaining AND no active balls
        // 2. All orange pegs cleared (goalProgress >= goalTarget)
        // In editor testing mode, never consider game over due to no balls (unlimited balls)
        const noBallsLeft = !(this.levelEditor && this.levelEditor.testingMode) && 
                           this.ballsRemaining <= 0 && 
                           this.balls.length === 0;
        const allOrangePegsCleared = this.goalProgress >= this.goalTarget;
        
        if (noBallsLeft || allOrangePegsCleared) {
            // Clear roulette queue on game end to avoid overflow to next game
            if (this.rouletteQueue) {
                this.rouletteQueue = [];
            }
            this.showPlayAgainButton();
            this.showPlayAgainNewSeedButton();
        } else {
            this.hidePlayAgainButton();
            this.hidePlayAgainNewSeedButton();
        }
    }
    
    showPlayAgainButton() {
        if (this.playAgainButton) {
            this.playAgainButton.style.display = 'block';
        }
    }
    
    hidePlayAgainButton() {
        if (this.playAgainButton) {
            this.playAgainButton.style.display = 'none';
        }
    }
    
    showPlayAgainNewSeedButton() {
        if (this.playAgainNewSeedButton) {
            this.playAgainNewSeedButton.style.display = 'block';
        }
    }
    
    hidePlayAgainNewSeedButton() {
        if (this.playAgainNewSeedButton) {
            this.playAgainNewSeedButton.style.display = 'none';
        }
    }
    
    triggerRoulette() {
        // Pause the game
        this.gamePaused = true;
        this.rouletteActive = true;
        
        // Show roulette overlay
        const rouletteOverlay = document.querySelector('#roulette-overlay');
        if (rouletteOverlay) {
            rouletteOverlay.classList.add('active');
        }
        
        // Cycle through options
        const options = ['spread', 'rapid', 'explosion'];
        let currentIndex = 0;
        const cycleInterval = 100; // 100ms per option
        const totalCycles = 20; // Cycle 20 times before selecting
        let cycleCount = 0;
        
        const rouletteInterval = setInterval(() => {
            // Remove highlight from all options
            document.querySelectorAll('.roulette-option').forEach(opt => {
                opt.classList.remove('highlighted');
            });
            
            // Highlight current option
            const currentOption = document.querySelector(`#roulette-${options[currentIndex]}`);
            if (currentOption) {
                currentOption.classList.add('highlighted');
            }
            
            // Play roulette sound for each highlight
            if (this.audioManager) {
                this.audioManager.playSound('pegRoulette', { volume: 0.6 });
            }
            
            currentIndex = (currentIndex + 1) % options.length;
            cycleCount++;
            
            // After cycling, randomly select one
            if (cycleCount >= totalCycles) {
                clearInterval(rouletteInterval);
                
                // Random selection
                const selectedIndex = this.rng.randomInt(0, options.length);
                const selectedPowerName = options[selectedIndex];
                
                // Highlight selected option briefly
                document.querySelectorAll('.roulette-option').forEach(opt => {
                    opt.classList.remove('highlighted');
                });
                const selectedOption = document.querySelector(`#roulette-${selectedPowerName}`);
                if (selectedOption) {
                    selectedOption.classList.add('highlighted');
                }
                
                // Hide roulette after 1 second
                setTimeout(() => {
                    if (rouletteOverlay) {
                        rouletteOverlay.classList.remove('active');
                    }
                    this.gamePaused = false;
                    this.rouletteActive = false;
                    
                    // Add selected power to queue
                    this.powerQueue.push(selectedPowerName);
                    
                    // Update current power (first in queue)
                    if (this.powerQueue.length === 1) {
                        this.selectedPower = this.powerQueue[0];
                    }
                    
                    // Update power display
                    this.updatePowerDisplay();
                    
                    // If there are more roulettes in queue and power turns available, trigger next one
                    if (this.rouletteQueue.length > 0 && this.powerTurnsRemaining > 0 && this.balls.length === 0) {
                        this.triggerRoulette();
                        this.rouletteQueue.shift();
                    }
                }, 1000);
            }
        }, cycleInterval);
    }
    
    restartGame() {
        // Hide play again buttons
        this.hidePlayAgainButton();
        this.hidePlayAgainNewSeedButton();
        
        // Show character selector again for new character selection
        this.showCharacterSelector();
        
        // Clear selected character - user must choose again
        this.selectedCharacter = null;
        
        // Reset character selector UI
        const optionsContainer = document.querySelector('#character-options');
        if (optionsContainer) {
            document.querySelectorAll('.character-option').forEach(opt => {
                opt.classList.remove('selected');
            });
        }
        
        // Disable start button until character is selected
        const startButton = document.querySelector('#start-game-button');
        if (startButton) {
            startButton.disabled = true;
        }
        
        // Clear seed input
        const seedInput = this.seedInput || document.querySelector('#seed-input');
        if (seedInput) {
            seedInput.value = '';
        }
        
        // Clear roulette queue and power queue on restart
        if (this.rouletteQueue) {
            this.rouletteQueue = [];
        }
        if (this.powerQueue) {
            this.powerQueue = [];
        }
        this.selectedPower = null;
        this.updatePowerDisplay();
        
        // Reset RNG to initial seed for deterministic replay
        if (this.rng) {
            this.rng.reset();
        }
        
        // Reset game state
        this.ballsRemaining = 10;
        this.score = 0;
        this.goalProgress = 0;
        this.powerTurnsRemaining = 0;
        this.currentShotScore = 0;
        this.purplePegMultiplier = 1.0;
        this.orangePegMultiplier = 1.0;
        
        // Reset character powers
        this.peterPower.reset();
        this.johnPower.reset();
        this.spikeyPower.reset();
        this.buzzPower.reset();
        this.mikeyPower.reset();
        this.maddamPower.reset();
        
        // Clear all spikes
        if (this.spikes) {
            this.spikes.forEach(spike => spike.remove());
            this.spikes = [];
        }
        
        // Clear green peg spike hit pegs tracking
        this.greenPegSpikeHitPegs = [];
        
        // Reset test aim angle
        this.testAimAngle = null;
        
        // Clear all balls
        this.balls.forEach(ball => ball.remove());
        this.balls = [];
        
        // Clear all pegs
        this.pegs.forEach(peg => peg.remove());
        this.pegs = [];
        
        // Reset lucky clover
        this.luckyClover.reset();
        this.luckyClover.enabled = false;
        
        // Music continues playing - will restart when level loads after character selection
        
        // Update UI
        this.updateBallsRemainingUI();
        this.updateScoreUI();
        this.updateGoalUI();
        this.updatePowerTurnsUI();
        this.updateFreeBallMeter();
        this.updateOrangePegMultiplier();
        
        // Don't load level here - user must select character and click "Start Game" first
        // Level will be loaded when startGame() is called
    }
    
    restartGameWithNewSeed() {
        // Hide play again buttons
        this.hidePlayAgainButton();
        this.hidePlayAgainNewSeedButton();
        
        // Show character selector again for new character selection
        this.showCharacterSelector();
        
        // Clear selected character - user must choose again
        this.selectedCharacter = null;
        
        // Reset character selector UI
        const optionsContainer = document.querySelector('#character-options');
        if (optionsContainer) {
            document.querySelectorAll('.character-option').forEach(opt => {
                opt.classList.remove('selected');
            });
        }
        
        // Disable start button until character is selected
        const startButton = document.querySelector('#start-game-button');
        if (startButton) {
            startButton.disabled = true;
        }
        
        // Keep the same seed for "Play Again with the same layout"
        const seedInput = this.seedInput || document.querySelector('#seed-input');
        if (seedInput && this.currentSeed !== null) {
            // Set seed input to current seed so it will be reused
            seedInput.value = this.currentSeed.toString();
        }
        
        // Clear roulette queue and power queue on restart
        if (this.rouletteQueue) {
            this.rouletteQueue = [];
        }
        if (this.powerQueue) {
            this.powerQueue = [];
        }
        this.selectedPower = null;
        this.updatePowerDisplay();
        
        // Reset game state (seed will be reused when user starts new game)
        this.ballsRemaining = 10;
        this.score = 0;
        this.goalProgress = 0;
        this.powerTurnsRemaining = 0;
        this.currentShotScore = 0;
        this.purplePegMultiplier = 1.0;
        this.orangePegMultiplier = 1.0;
        
        // Reset character powers
        this.peterPower.reset();
        this.johnPower.reset();
        this.spikeyPower.reset();
        this.buzzPower.reset();
        this.mikeyPower.reset();
        this.maddamPower.reset();
        
        // Clear all spikes
        if (this.spikes) {
            this.spikes.forEach(spike => spike.remove());
            this.spikes = [];
        }
        
        // Clear green peg spike hit pegs tracking
        this.greenPegSpikeHitPegs = [];
        
        // Reset test aim angle
        this.testAimAngle = null;
        
        // Clear all balls
        this.balls.forEach(ball => ball.remove());
        this.balls = [];
        
        // Clear all pegs
        this.pegs.forEach(peg => peg.remove());
        this.pegs = [];
        
        // Reset lucky clover
        this.luckyClover.reset();
        this.luckyClover.enabled = false;
        
        // Music continues playing - will restart when level loads after character selection
        
        // Update UI
        this.updateBallsRemainingUI();
        this.updateScoreUI();
        this.updateGoalUI();
        this.updatePowerTurnsUI();
        this.updateFreeBallMeter();
        this.updateOrangePegMultiplier();
        
        // Don't load level here - user must select character and click "Start Game" first
        // Level will be loaded when startGame() is called (with new seed)
    }

    updateOrangePegMultiplier() {
        // Calculate percentage of orange pegs cleared
        // Total orange pegs = goalProgress (hit) + remaining orange pegs
        const remainingOrangePegs = this.pegs.filter(peg => peg.isOrange && !peg.hit).length;
        const totalOrangePegs = this.goalProgress + remainingOrangePegs;
        const percentage = totalOrangePegs > 0 ? (this.goalProgress / totalOrangePegs) * 100 : 0;
        
        // Determine multiplier based on percentage
        // Thresholds are exact: 40% = 2x, 60% = 3x, 80% = 5x, 90% = 10x
        // Store previous multiplier BEFORE calculating new one
        const previousMultiplier = this.orangePegMultiplier;
        if (percentage >= 90) {
            this.orangePegMultiplier = 8;
        } else if (percentage >= 80) {
            this.orangePegMultiplier = 5;
        } else if (percentage >= 60) {
            this.orangePegMultiplier = 3;
        } else if (percentage >= 40) {
            this.orangePegMultiplier = 2;
        } else {
            this.orangePegMultiplier = 1.0;
        }
        
        // Update music layers based on multiplier
        // Track 1: Always playing (base layer)
        // Track 2: Unmutes at 2x (40%)
        // Track 3: Unmutes at 3x (60%)
        // Track 4: Unmutes at 5x (80%)
        // Only update tracks when multiplier actually changes (prevents unnecessary fade-ins)
        // Track states are managed by multiplier value, not by track existence
        if (this.audioManager && this.musicStarted && previousMultiplier !== this.orangePegMultiplier) {
            
            // Determine mute states based on current multiplier value
            // Use clear if/else chain based on multiplier value
            let track2Muted, track3Muted, track4Muted;
            
            if (this.orangePegMultiplier >= 5) {
                // 5x (80%) or 8x (90%): All tracks unmuted
                track2Muted = false;
                track3Muted = false;
                track4Muted = false;
            } else if (this.orangePegMultiplier >= 3) {
                // 3x (60%): Tracks 2 and 3 unmuted, track 4 muted
                track2Muted = false;
                track3Muted = false;
                track4Muted = true;
            } else if (this.orangePegMultiplier >= 2) {
                // 2x (40%): Track 2 unmuted, tracks 3 and 4 muted
                track2Muted = false;
                track3Muted = true;
                track4Muted = true;
            } else {
                // 1x (below 40%): Tracks 2, 3, and 4 muted (only track 1 playing)
                track2Muted = true;
                track3Muted = true;
                track4Muted = true;
            }
            
            // Update mute states based on multiplier value (fade-in only happens when transitioning from muted to unmuted)
            this.audioManager.setMusicTrackMuted('PilotsOgg2', track2Muted);
            this.audioManager.setMusicTrackMuted('PilotsOgg3', track3Muted);
            this.audioManager.setMusicTrackMuted('PilotsOgg4', track4Muted);
        }
        
        // Clamp percentage for display (shouldn't exceed 100%)
        const clampedPercentage = Math.min(100, Math.max(0, percentage));
        
        // Update multiplier tracker bar
        if (this.multiplierTrackerFill) {
            this.multiplierTrackerFill.style.width = `${clampedPercentage}%`;
        }
        
        // Calculate total multiplier (orange peg multiplier * purple peg multiplier)
        // Orange peg multiplier is exactly as set: 1x, 2x, 3x, 5x, or 10x
        const totalMultiplier = this.orangePegMultiplier * this.purplePegMultiplier;
        
        // Update multiplier value display
        if (this.multiplierValue) {
            this.multiplierValue.textContent = `${totalMultiplier.toFixed(1)}x`;
        }
    }
    
    assignPurplePeg() {
        // Remove purple status from previous purple peg (if any)
        if (this.purplePeg && !this.purplePeg.hit) {
            // Reset to blue color if not hit
            this.purplePeg.mesh.material.color.setHex(0x4a90e2); // Blue
            this.purplePeg.isPurple = false;
            this.purplePeg.pointValue = 300; // Reset to base value (blue peg value)
            
            // If Maddam's power is active, remove magnet from the peg that's becoming blue
            if (this.selectedCharacter?.id === 'maddam' && this.maddamPower && this.purplePeg.magnetMesh) {
                // Remove magnet from this peg
                this.scene.remove(this.purplePeg.magnetMesh);
                this.purplePeg.magnetMesh.geometry.dispose();
                this.purplePeg.magnetMesh.material.dispose();
                this.purplePeg.magnetMesh = null;
                // Remove from magnetic pegs array
                const pegIndex = this.maddamPower.magneticPegs.indexOf(this.purplePeg);
                if (pegIndex !== -1) {
                    this.maddamPower.magneticPegs.splice(pegIndex, 1);
                }
            }
        }
        
        // Find all blue pegs (not orange, not green, not hit)
        const bluePegs = this.pegs.filter(peg => 
            !peg.isOrange && 
            !peg.isGreen && 
            !peg.hit &&
            !peg.isPurple
        );
        
        if (bluePegs.length === 0) {
            // No blue pegs available
            this.purplePeg = null;
            return;
        }
        
        // Randomly select one blue peg to be purple (using seeded RNG if available, otherwise Math.random)
        let randomIndex;
        if (this.rng && this.rng.randomInt) {
            randomIndex = this.rng.randomInt(0, bluePegs.length);
        } else {
            // Fallback to Math.random if RNG is not initialized (e.g., in level editor test mode)
            randomIndex = Math.floor(Math.random() * bluePegs.length);
        }
        this.purplePeg = bluePegs[randomIndex];
        this.purplePeg.isPurple = true;
        this.purplePeg.pointValue = 1500; // Purple peg value
        
        // Change color to purple (lighter purple for default state)
        this.purplePeg.mesh.material.color.setHex(0xba55d3); // Lighter purple
        
        // If Maddam's power is active, add magnet to the new purple peg
        if (this.selectedCharacter?.id === 'maddam' && this.maddamPower && 
            this.magneticActive && this.powerTurnsRemaining > 0) {
            // Check if peg already has a magnet
            if (!this.purplePeg.magnetMesh) {
                this.maddamPower.createMagnetVisual(this.purplePeg);
                this.maddamPower.magneticPegs.push(this.purplePeg);
            }
        }
    }

    spawnBall(x, y, z, velocity = null, originalVelocity = null, isYellow = false, isQuillShot = false, isRocket = false) {
        const ballMaterial = this.physicsWorld.getBallMaterial();
        const ball = new Ball(this.scene, this.physicsWorld, { x, y, z }, velocity, ballMaterial, isYellow);
        // Store original velocity for lucky clover perk
        ball.originalVelocity = originalVelocity || velocity;
        // Track which pegs this ball has hit
        ball.hitPegs = [];
        // Track initial position for radius check
        ball.initialPosition = { x, y, z };
        // Track time since last new peg hit for stuck detection
        ball.lastNewPegHitTime = performance.now() / 1000;
        // Track velocity for stuck detection
        ball.lastVelocity = 0;
        ball.lastHighVelocityTime = performance.now() / 1000;
        // Track spawn time for 5-second airtime check
        ball.spawnTime = performance.now() / 1000;
        // Track recent peg hits for stuck pattern detection (bouncing between same 2 pegs)
        ball.recentHitPegs = []; // Last 2 pegs hit
        ball.recentHitTimes = []; // Times of those hits
        ball.stuckPatternCheckTime = performance.now() / 1000; // Last time we checked for stuck pattern
        ball.stuckPatternCount = 0; // Consecutive intervals with stuck pattern detected
        // Track if lucky clover is active for this ball (based on power turns remaining)
        ball.luckyCloverActive = this.powerTurnsRemaining > 0;
        // Track if this ball used power (so we know to decrement when destroyed)
        ball.usedPower = this.powerTurnsRemaining > 0;
        // Track if this is a quill shot ball
        ball.isQuillShot = isQuillShot;
        ball.lastQuillShotTime = isQuillShot ? performance.now() / 1000 : 0;
        
        // Track if this is a rocket ball
        ball.isRocket = isRocket;
        if (isRocket) {
            ball.rocketFuelRemaining = 2.0; // 2 seconds of fuel
            ball.rocketThrustActive = false;
            ball.rocketThrustStartTime = 0;
            ball.rocketThrustPower = 0; // 0 to 1, builds up over 0.2s
            ball.rocketFuelRestoreCount = 0; // Track how many times fuel has been restored for diminishing returns
            ball.rocketThrustSound = null; // Track sound source to stop it when thrust ends
            this.buzzPower.attachRocketVisual(ball);
        }
        
        // Quill shot balls will have gravity counteracted in update loop (like rocket)
        // No need to set body.gravity here - we'll modify velocity directly
        
        // Enable lucky clover for this ball if power turns are available (power activates on shot, not on green peg hit)
        if (this.powerTurnsRemaining > 0 && this.selectedCharacter?.id === 'peter') {
            this.luckyClover.enabled = true;
        } else {
            // Disable if no power turns remaining or not Peter
            this.luckyClover.enabled = false;
        }
        this.balls.push(ball);
        return ball; // Return ball reference for mirror ball pairing
    }
    

    async loadLevel(levelPath) {
        try {
            const levelData = await LevelLoader.loadLevel(levelPath);
            
            if (!LevelLoader.validateLevel(levelData)) {
                // Invalid level data
                return;
            }

            
            // Create pegs from level data
            const pegMaterial = this.physicsWorld.getPegMaterial();
            
            // First, create all pegs as blue (base color from JSON)
            levelData.pegs.forEach(pegData => {
                // Handle color - can be hex string (#4a90e2) or number (4886754)
                let baseColor;
                if (pegData.color) {
                    if (typeof pegData.color === 'string') {
                        baseColor = LevelLoader.hexToNumber(pegData.color);
                    } else {
                        baseColor = pegData.color; // Already a number
                    }
                } else {
                    baseColor = 0x4a90e2; // Default blue color
                }
                
                // Round peg positions to 3 decimals for determinism (match ball position precision)
                const roundedX = this.roundToDecimals(pegData.x);
                const roundedY = this.roundToDecimals(pegData.y);
                
                // Get type and size from level data, default to round base if not specified
                const pegType = pegData.type || 'round';
                const pegSize = pegData.size || 'base';
                
                const peg = new Peg(
                    this.scene,
                    this.physicsWorld,
                    { x: roundedX, y: roundedY, z: 0 },
                    baseColor,
                    pegMaterial,
                    pegType,
                    pegSize
                );
                
                // Set base point value (will be updated for special pegs)
                peg.pointValue = 300; // Blue pegs are worth 400 points
                peg.isOrange = false;
                peg.isGreen = false;
                peg.isPurple = false;
                
                // Apply rotation if specified
                if (pegData.rotation !== undefined && pegData.rotation !== 0) {
                    peg.mesh.rotation.z = pegData.rotation;
                    // Update physics body rotation to match
                    const euler = new THREE.Euler(0, 0, pegData.rotation);
                    const quaternion = new THREE.Quaternion().setFromEuler(euler);
                    peg.body.quaternion.set(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
                }
                
                this.pegs.push(peg);
            });
            
            // Create characteristics from level data
            if (levelData.characteristics && Array.isArray(levelData.characteristics) && levelData.characteristics.length > 0) {
                import('./entities/Characteristic.js').then(({ Characteristic }) => {
                    levelData.characteristics.forEach(charData => {
                        const roundedX = this.roundToDecimals(charData.x);
                        const roundedY = this.roundToDecimals(charData.y);
                        const shapeType = charData.shape || 'rect'; // 'rect' or 'circle'
                        const size = charData.size || (shapeType === 'circle' ? { radius: 0.5 } : { width: 1, height: 1 });
                        const rotation = charData.rotation || 0;
                        const bounceType = charData.bounceType || 'normal';
                        
                        const characteristic = new Characteristic(
                            this.scene,
                            this.physicsWorld,
                            { x: roundedX, y: roundedY, z: charData.z || 0 },
                            shapeType,
                            size,
                            bounceType
                        );
                        
                        if (rotation !== 0) {
                            characteristic.setRotation(rotation);
                        }
                        
                        this.characteristics.push(characteristic);
                    });
                    console.log(`[Game] Loaded ${levelData.characteristics.length} characteristics`);
                }).catch(error => {
                    console.error('[Game] Error loading characteristics:', error);
                });
            }
            
            // Shapes and spacers are editor-only tools and should NOT load in the game
            // They are saved separately in *_dev.json files for editing purposes
            
            // Skip special peg assignment only for "Test Level" specifically (only blue pegs)
            // Other test levels like "test6" should still get special pegs
            const isTestLevel = levelData.name && (
                levelData.name.toLowerCase() === 'test level' || 
                levelData.name.toLowerCase() === 'test-level'
            );
            
            if (!isTestLevel) {
                // Randomly select pegs for special types
                const indices = Array.from({length: this.pegs.length}, (_, i) => i);
                // Fisher-Yates shuffle - use RNG if available, otherwise Math.random
                for (let i = indices.length - 1; i > 0; i--) {
                    let j;
                    if (this.rng && this.rng.randomInt) {
                        j = this.rng.randomInt(0, i + 1);
                    } else {
                        // Fallback to Math.random if RNG is not initialized
                        j = Math.floor(Math.random() * (i + 1));
                    }
                    [indices[i], indices[j]] = [indices[j], indices[i]];
                }
                
                // Select 2 green pegs (power pegs) first
                const greenIndices = indices.slice(0, 2);
                greenIndices.forEach(i => {
                    const peg = this.pegs[i];
                    peg.isGreen = true;
                    peg.pointValue = 800; // Green pegs are worth 1200 points
                    // Change color to green
                    peg.mesh.material.color.setHex(0x32cd32); // Green color
                });
                
                // Select 25 orange pegs from remaining indices (skip the 2 green ones)
                const orangeIndices = indices.slice(2, 27);
                orangeIndices.forEach(i => {
                    const peg = this.pegs[i];
                    peg.isOrange = true;
                    peg.pointValue = 500;
                    // Change color to orange
                    peg.mesh.material.color.setHex(0xff8c00); // Orange color
                });
                
                // Assign initial purple peg
                this.assignPurplePeg();
            } else {
            }
            
            // Music tracks are loaded on page load, so we don't need to load them here
            // When pegs are generated, play all tracks (they're already mounted)
            if (this.audioManager && this.pegs.length > 0) {
                // Play all music tracks (they're mounted but paused)
                this.audioManager.playMusicTracks();
                
                // Mark as started
                this.musicStarted = true;
                
                // Ensure correct mute states (track 1 unmuted, tracks 2-4 muted)
                this.audioManager.setMusicTrackMuted('PilotsOgg1', false);
                this.audioManager.setMusicTrackMuted('PilotsOgg2', true);
                this.audioManager.setMusicTrackMuted('PilotsOgg3', true);
                this.audioManager.setMusicTrackMuted('PilotsOgg4', true);
            }
            
            // Initialize orange peg multiplier tracker (this will set correct track states based on multiplier)
            this.updateOrangePegMultiplier();
        } catch (error) {
            // Failed to load level
        }
    }

    setupCollisionDetection() {
        // Use checkCollisions() as PRIMARY method (checks contacts array every frame)
        // beginContact event listener is a fallback for edge cases
        // postStep event listener checks contacts immediately after each physics substep
        // Both use processedContacts Set to prevent duplicate processing in the same frame
        this.processedContacts = new Set(); // Track contacts processed this frame
        
        // postStep fires after each physics substep - check contacts here for fast-moving objects
        // This catches contacts that are resolved within a single substep
        this.physicsWorld.world.addEventListener('postStep', () => {
            // Check contacts immediately after physics step
            const contacts = this.physicsWorld.world.contacts;
            if (contacts && contacts.length > 0) {
                for (let i = 0; i < contacts.length; i++) {
                    const contact = contacts[i];
                    if (!contact) continue;
                    
                    const bodyA = contact.bi;
                    const bodyB = contact.bj;
                    if (!bodyA || !bodyB) continue;
                    
                    const isBall = this.balls.some(b => b.body === bodyA || b.body === bodyB);
                    const isPeg = this.pegs.some(p => p.body === bodyA || p.body === bodyB);
                    const isSpike = this.spikes && this.spikes.some(s => s.body === bodyA || s.body === bodyB);
                    
                    // Ignore ball-spike collisions (spikes should not interact with balls)
                    if (isBall && isSpike) {
                        continue; // Skip this collision
                    }
                    
                    if (isBall && isPeg) {
                        const contactKey = `${Math.min(bodyA.id, bodyB.id)}-${Math.max(bodyA.id, bodyB.id)}`;
                        
                        if (!this.processedContacts.has(contactKey)) {
                            const peg = this.pegs.find(p => p.body === bodyA || p.body === bodyB);
                            const ball = this.balls.find(b => b.body === bodyA || b.body === bodyB);
                            
                            this.processedContacts.add(contactKey);
                            this.handleCollision(bodyA, bodyB);
                        }
                    }
                    
                    // Spike-peg collisions are now handled manually in the game loop
                    // (since spikes have collisionResponse = false to avoid ball interactions)
                }
            }
        });
        
        // Event listener for immediate collision detection (fallback)
        this.physicsWorld.world.addEventListener('beginContact', (event) => {
            try {
                // Try different event structures
                const contact = event.contact || event;
                if (!contact) return;
                
                const bodyA = contact.bi;
                const bodyB = contact.bj;
                
                if (!bodyA || !bodyB) return;
                
                // Check what types these bodies are
                const isBall = this.balls.some(b => b.body === bodyA || b.body === bodyB);
                const isPeg = this.pegs.some(p => p.body === bodyA || p.body === bodyB);
                const isWall = this.walls.some(w => w.body === bodyA || w.body === bodyB);
                const isSpike = this.spikes && this.spikes.some(s => s.body === bodyA || s.body === bodyB);
                
                // Ignore ball-spike collisions (spikes should not interact with balls)
                if (isBall && isSpike) {
                    return; // Skip this collision
                }
                const peg = isPeg ? this.pegs.find(p => p.body === bodyA || p.body === bodyB) : null;
                const ball = isBall ? this.balls.find(b => b.body === bodyA || b.body === bodyB) : null;
                
                // Create a unique key for this contact pair
                const contactKey = `${Math.min(bodyA.id, bodyB.id)}-${Math.max(bodyA.id, bodyB.id)}`;
                
                // Only process if not already processed this frame (prevents race condition with checkCollisions)
                if (!this.processedContacts.has(contactKey)) {
                    this.processedContacts.add(contactKey);
                    this.handleCollision(bodyA, bodyB);
                    
                    // Spike-peg collisions are now handled manually in the game loop
                    // (since spikes have collisionResponse = false to avoid ball interactions)
                }
            } catch (error) {
                // Fallback to contacts array if event structure is wrong
                // Event listener error, using contacts array
            }
        });
    }

    roundToDecimals(value, decimals = 3) {
        const factor = Math.pow(10, decimals);
        return Math.round(value * factor) / factor;
    }

    roundVec3(vec, decimals = 3) {
        vec.x = this.roundToDecimals(vec.x, decimals);
        vec.y = this.roundToDecimals(vec.y, decimals);
        vec.z = this.roundToDecimals(vec.z, decimals);
    }

    clampBallVelocity(ball) {
        // Clamp ball velocity to max rebound speed (only for rebounds, not initial shot)
        const velocity = ball.body.velocity;
        const speed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y + velocity.z * velocity.z);
        
        if (speed > this.maxReboundSpeed) {
            // Normalize and scale to max rebound speed
            // Round scale factor for determinism
            const scale = this.roundToDecimals(this.maxReboundSpeed / speed);
            velocity.x = this.roundToDecimals(velocity.x * scale);
            velocity.y = this.roundToDecimals(velocity.y * scale);
            velocity.z = this.roundToDecimals(velocity.z * scale);
            ball.body.velocity = velocity;
        }
        
        // Round velocity to 3 decimals for determinism
        this.roundVec3(ball.body.velocity);
    }

    handleSpikePegCollision(spike, peg) {
        // Spike hit a peg - treat it like a ball hit
        // Check if this is a new hit
        if (peg.hit) {
            return; // Already hit
        }
        
        // Mark spike as having hit this peg
        spike.hitPegs.push(peg);
        
        // Track peg hit by spike for ball removal tracking
        if (spike.parentBall) {
            // Spike from ball (quill shot) - track in ball
            if (!spike.parentBall.spikeHitPegs) {
                spike.parentBall.spikeHitPegs = [];
            }
            if (!spike.parentBall.spikeHitPegs.includes(peg)) {
                spike.parentBall.spikeHitPegs.push(peg);
            }
            // Also add to ball's hitPegs for removal tracking
            if (!spike.parentBall.hitPegs.includes(peg)) {
                spike.parentBall.hitPegs.push(peg);
            }
        } else {
            // Spike from green peg (not from ball) - track separately for removal
            if (!this.greenPegSpikeHitPegs.includes(peg)) {
                this.greenPegSpikeHitPegs.push(peg);
            }
        }
        
        // Call peg.onHit() to mark it as hit
        peg.onHit();
        
        // Check if this is a ghost ball hit (spike has parentBall with isMirrorBallActive)
        const isGhostBallHit = spike.parentBall && spike.parentBall.isMirrorBallActive;
        
        // Play peg hit sound (different sound for ghost ball)
        if (this.audioManager) {
            if (isGhostBallHit) {
                this.audioManager.playGhostBallPegHit();
            } else {
                this.audioManager.playPegHit();
            }
        }
        
        // Process scoring and effects (similar to ball-peg collision)
        // Check for green peg (power activation)
        if (peg.isGreen) {
            // Peter the Leprechaun: add 3 turns per green peg hit
            if (this.selectedCharacter?.id === 'peter') {
                this.powerTurnsRemaining += 3;
                this.updatePowerTurnsUI();
                this.updatePowerDisplay();
                
                // Show clover emoji at peg position
                const pegPos = peg.body.position;
                if (this.emojiEffect) {
                    this.emojiEffect.showEmoji('🍀', { x: pegPos.x, y: pegPos.y, z: pegPos.z || 0 }, 0.5);
                }
            } else if (this.selectedCharacter?.id === 'mikey') {
                // Mikey, the man in the mirror: add 2 turns per green peg hit
                this.powerTurnsRemaining += 2;
                this.updatePowerTurnsUI();
            } else {
                // All other characters: add 1 turn per green peg hit
                this.powerTurnsRemaining += 1;
                this.updatePowerTurnsUI();
            }
            
            // John the Gunner: trigger roulette immediately when green peg is hit
            if (this.selectedCharacter?.id === 'john') {
                // Trigger roulette immediately (will pause game and show UI)
                if (!this.rouletteActive && !this.gamePaused) {
                    this.triggerRoulette();
                } else {
                    // If roulette is already active, queue it
                    this.rouletteQueue.push({
                        timestamp: performance.now() / 1000
                    });
                }
            }
            
            // Spikey the PufferFish: spawn spikes and activate quill shot
            if (this.selectedCharacter?.id === 'spikey') {
                this.spikeyPower.onGreenPegHit(peg);
            }
            
            // Buzz the Rocketeer: activate rocket power
            if (this.selectedCharacter?.id === 'buzz') {
                this.buzzPower.onGreenPegHit(peg);
                this.rocketActive = true; // Activate rocket for next shot
            }
        }
        
        // Calculate score
        const totalMultiplier = this.orangePegMultiplier * this.purplePegMultiplier;
        let points = peg.pointValue;
        let finalPoints;
        
        if (peg.isPurple) {
            // Purple peg: flat 2000 points, no multiplier
            points = 2000;
            finalPoints = points; // No multiplier for purple peg
            this.purplePegMultiplier = 1.25;
            this.updateOrangePegMultiplier();
            peg.mesh.material.color.setHex(0x9370db);
        } else {
            if (peg.isOrange) {
                this.orangePegMultiplier = Math.min(this.orangePegMultiplier * 2, 10);
                this.updateOrangePegMultiplier();
            }
            // Apply multiplier to non-purple pegs
            finalPoints = Math.floor(points * totalMultiplier);
        }
        this.score += finalPoints;
        this.currentShotScore += finalPoints;
        
        // Update UI
        this.updateScoreUI();
        
        // Handle orange peg goal progress
        if (peg.isOrange) {
            this.goalProgress++;
            this.updateGoalUI();
        }
        
        // Handle purple peg multiplier
        // Only reposition purple peg if Peter's power is active
        // For other characters, purple peg just activates but doesn't reposition
        if (peg.isPurple && peg === this.purplePeg) {
            if (this.selectedCharacter?.id === 'peter' && this.powerTurnsRemaining > 0) {
                // Peter's special power: purple peg repositions on hit
                this.assignPurplePeg();
            }
            // For other characters, purple peg just activates (no reposition)
        }
        
        // If the active ball is out of play (no active balls), immediately destroy the peg
        // This prevents pegs hit by spikes after the ball is gone from never being removed
        if (this.balls.length === 0) {
            const pegIndex = this.pegs.indexOf(peg);
            if (pegIndex !== -1) {
                peg.remove();
                this.pegs.splice(pegIndex, 1);
                
                // Also remove from tracking arrays if present
                if (spike.parentBall && spike.parentBall.hitPegs) {
                    const ballPegIndex = spike.parentBall.hitPegs.indexOf(peg);
                    if (ballPegIndex !== -1) {
                        spike.parentBall.hitPegs.splice(ballPegIndex, 1);
                    }
                }
                if (spike.parentBall && spike.parentBall.spikeHitPegs) {
                    const spikePegIndex = spike.parentBall.spikeHitPegs.indexOf(peg);
                    if (spikePegIndex !== -1) {
                        spike.parentBall.spikeHitPegs.splice(spikePegIndex, 1);
                    }
                }
                if (this.greenPegSpikeHitPegs.includes(peg)) {
                    const greenSpikePegIndex = this.greenPegSpikeHitPegs.indexOf(peg);
                    if (greenSpikePegIndex !== -1) {
                        this.greenPegSpikeHitPegs.splice(greenSpikePegIndex, 1);
                    }
                }
            }
        }
        
    }
    
    handleCollision(bodyA, bodyB) {
        // Find the ball or bomb involved - try reference match first, then ID match as fallback
        let ball = this.balls.find(b => b.body === bodyA || b.body === bodyB);
        let bomb = this.bombs ? this.bombs.find(b => b.body === bodyA || b.body === bodyB) : null;
        
        // Fallback: if not found by reference, try by ID (for timing/race condition issues)
        if (!ball && bodyA && bodyB) {
            const ballById = this.balls.find(b => b.body.id === bodyA.id || b.body.id === bodyB.id);
            if (ballById) {
                ball = ballById;
            }
        }
        
        const entity = ball || bomb; // Use ball if found, otherwise bomb
        
        if (!entity) {
            return;
        }
        
        // Check for ball/bomb-peg collision FIRST - this is the most important
        const peg = this.pegs.find(p => p.body === bodyA || p.body === bodyB);
        
        // Process peg collision logic IMMEDIATELY if it's a ball-peg collision
        if (peg && ball) {
            try {
                // Clamp velocity after peg collision
                this.clampBallVelocity(ball);
                
                // Check if this is a new hit (peg not already hit)
                const isNewHit = !peg.hit;
                const wasAlreadyTracked = ball.hitPegs.includes(peg);
            
            // ALWAYS handle peg hit if it's new (even if already tracked, we need to ensure onHit is called)
            // The onHit() method itself checks if already hit, so it's safe to call
            if (isNewHit) {
                try {
                    peg.onHit();
                    
                    // Play peg hit sound
                    if (this.audioManager) {
                        this.audioManager.playPegHit();
                    }
                    
                    // Check for green peg (power activation) - only on first hit
                    if (peg.isGreen) {
                        // Peter the Leprechaun: add 3 turns per green peg hit
                        if (this.selectedCharacter?.id === 'peter') {
                            this.powerTurnsRemaining += 3;
                            this.updatePowerTurnsUI();
                            this.updatePowerDisplay();
                            
                            // Show clover emoji at peg position
                            const pegPos = peg.body.position;
                            if (this.emojiEffect) {
                                this.emojiEffect.showEmoji('🍀', pegPos, 0.5);
                            }
                        } else if (this.selectedCharacter?.id === 'mikey') {
                            // Mikey, the man in the mirror: add 2 turns per green peg hit
                            this.powerTurnsRemaining += 2;
                            this.updatePowerTurnsUI();
                        } else if (this.selectedCharacter?.id === 'maddam') {
                            // Maddam Magna Thicke: add 1 turn per green peg hit
                            this.powerTurnsRemaining += 1;
                            this.updatePowerTurnsUI();
                        } else {
                            // All other characters: add 1 turn per green peg hit
                            this.powerTurnsRemaining += 1;
                            this.updatePowerTurnsUI();
                        }
                        
                        // John the Gunner: trigger roulette immediately when green peg is hit
                        if (this.selectedCharacter?.id === 'john') {
                            // Trigger roulette immediately (will pause game and show UI)
                            if (!this.rouletteActive && !this.gamePaused) {
                                this.triggerRoulette();
                            } else {
                                // If roulette is already active, queue it
                                this.rouletteQueue.push({
                                    timestamp: performance.now() / 1000
                                });
                            }
                        }
                        
                        // Spikey the PufferFish: spawn spikes and activate quill shot
                        if (this.selectedCharacter?.id === 'spikey') {
                            this.spikeyPower.onGreenPegHit(peg);
                            this.updatePowerDisplay();
                        }
                        
                        // Buzz the Rocketeer: activate rocket power
                        if (this.selectedCharacter?.id === 'buzz') {
                            this.buzzPower.onGreenPegHit(peg);
                            this.rocketActive = true; // Activate rocket for next shot
                            this.updatePowerDisplay();
                        }
                        
                        // Mikey, the man in the mirror: mirror ball power activated on green peg hit
                        if (this.selectedCharacter?.id === 'mikey') {
                            this.mikeyPower.onGreenPegHit(peg);
                        } else if (this.selectedCharacter?.id === 'maddam') {
                            this.magneticActive = true;
                            this.maddamPower.onGreenPegHit(peg);
                            // Don't create magnet visuals yet - wait until shot ends and player is ready
                        }
                        if (this.selectedCharacter?.id === 'buzz') {
                            this.buzzPower.onGreenPegHit(peg);
                            this.rocketActive = true; // Activate rocket for next shot
                            this.updatePowerDisplay();
                        }
                    }
                    
                    // Check for orange peg (goal progress) - only on first hit by ANY ball
                    if (peg.isOrange) {
                        this.goalProgress++;
                        this.updateGoalUI();
                        this.updateOrangePegMultiplier();
                        
                        // Buzz's rocket power: orange pegs restore fuel during power shot with diminishing returns
                        // Starts at 0.35, decreases by 0.05 each time until reaching 0.15
                        if (this.selectedCharacter?.id === 'buzz' && ball.isRocket && ball.rocketFuelRemaining !== undefined) {
                            // Calculate fuel restore amount with diminishing returns
                            const baseFuel = 0.35; // Starting fuel restore
                            const minFuel = 0.15; // Minimum fuel restore (reached after 4 restores)
                            const decreasePerRestore = 0.025; // Decrease by 0.05 each time
                            
                            // Increment restore count
                            ball.rocketFuelRestoreCount = (ball.rocketFuelRestoreCount || 0) + 1;
                            
                            // Calculate fuel amount: base - (count * decrease), clamped to minimum
                            const fuelAmount = Math.max(minFuel, baseFuel - (ball.rocketFuelRestoreCount - 1) * decreasePerRestore);
                            
                            ball.rocketFuelRemaining = Math.min(2.5, ball.rocketFuelRemaining + fuelAmount);
                        }
                    }
                } catch (error) {
                    // ERROR in peg.onHit()
                }
            } else {
                // Peg already hit - play muffled sound at same pitch as last new peg
                if (this.audioManager) {
                    this.audioManager.playPegHitAlreadyHit();
                }
            }
            
            // Track this peg as hit by this ball (only if not already tracked)
            // IMPORTANT: Only reset 5-second timer on NEW peg hits
            // If ball is bouncing between already-hit pegs, timer keeps running - triggers removal after 5 seconds
            const currentTime = performance.now() / 1000;
            
            if (isNewHit) {
                // Reset all timers when hitting a truly NEW peg (not already hit)
                ball.lastNewPegHitTime = currentTime;
                // Reset 5-second timer on new peg hit (ball is making progress)
                ball.spawnTime = currentTime;
                // Reset velocity tracking when a new peg is hit (ball is moving/active)
                const ballVelocity = Math.sqrt(
                    ball.body.velocity.x * ball.body.velocity.x + 
                    ball.body.velocity.y * ball.body.velocity.y
                );
                ball.lastVelocity = ballVelocity;
                // Reset high velocity timer on new peg hit (ball is actively moving)
                ball.lastHighVelocityTime = currentTime;
            }
            // If hitting already-hit peg, DON'T reset spawnTime - this allows 5-second check to trigger
            
            // Track peg hit for stuck pattern detection (even if already hit by another ball)
            // This helps detect when ball is bouncing between same 2 pegs
            if (!ball.recentHitPegs) {
                ball.recentHitPegs = [];
                ball.recentHitTimes = [];
            }
            
            // Add this peg hit to recent hits
            ball.recentHitPegs.push(peg);
            ball.recentHitTimes.push(currentTime);
            
            // Keep only last 2 peg hits
            if (ball.recentHitPegs.length > 2) {
                ball.recentHitPegs.shift();
                ball.recentHitTimes.shift();
            }
            
            if (!wasAlreadyTracked) {
                    try {
                        if (!ball.hitPegs) {
                            ball.hitPegs = [];
                        }
                        
                        ball.hitPegs.push(peg);
                    } catch (error) {
                        // Continue anyway - don't let tracking errors stop processing
                    }
                    
                    // Check if this is the purple peg (main purple peg or temporary purple peg)
                    const isPurplePeg = peg === this.purplePeg || this.temporaryPurplePegs.includes(peg);
                    const isPeterGeneratedPurple = this.temporaryPurplePegs.includes(peg); // Peter's lucky bounce generated purple peg
                    
                    try {
                        if (isPurplePeg) {
                            // Activate 1.25x multiplier for following pegs
                            this.purplePegMultiplier = 1.25;
                            
                            // Update multiplier display
                            this.updateOrangePegMultiplier();
                            
                            // Calculate points: Peter's generated purple pegs get multiplier, regular purple peg is flat
                            const purplePoints = 2000;
                            let finalPoints;
                            if (isPeterGeneratedPurple) {
                                // Peter's lucky bounce purple pegs get the multiplier
                                const totalMultiplier = this.orangePegMultiplier * this.purplePegMultiplier;
                                finalPoints = Math.floor(purplePoints * totalMultiplier);
                            } else {
                                // Regular purple peg is flat (no multiplier)
                                finalPoints = purplePoints;
                            }
                            this.score += finalPoints;
                            this.currentShotScore += finalPoints;
                            
                            // Ensure purple peg color changes to darker shade (onHit should handle this, but ensure it)
                            peg.mesh.material.color.setHex(0x9370db); // Medium purple (darker when hit)
                        } else {
                            // Add score for regular pegs (after multiplier is activated)
                            const totalMultiplier = this.orangePegMultiplier * this.purplePegMultiplier;
                            const basePoints = peg.pointValue || 300;
                            const finalPoints = Math.floor(basePoints * totalMultiplier);
                            this.score += finalPoints;
                            this.currentShotScore += finalPoints;
                        }
                        } catch (error) {
                        // ERROR in purple check / score calculation
                        // Re-throw to be caught by outer try-catch
                        throw error;
                    }
                    // Update UI
                    this.updateScoreUI();
                    this.updateFreeBallMeter();
                    
                    // Check for free ball
                    if (this.currentShotScore >= this.freeBallThreshold) {
                        const freeBallsAwarded = Math.floor(this.currentShotScore / this.freeBallThreshold);
                        this.ballsRemaining += freeBallsAwarded;
                        this.currentShotScore = this.currentShotScore % this.freeBallThreshold;
                        this.updateBallsRemainingUI();
                        this.updateFreeBallMeter();
                    }
                    
                    // Lucky clover perk handling (every 3rd hit bounces with 75% momentum)
                    if (this.selectedCharacter?.id === 'peter') {
                        this.peterPower.handleLuckyCloverBounce(ball, peg);
                    }
                    
                    // Peter's special power: purple peg repositions on hit when power is active
                    if (this.selectedCharacter?.id === 'peter' && this.powerTurnsRemaining > 0) {
                        if (isPurplePeg) {
                            this.assignPurplePeg();
                        }
                    }
                    
                    // Mikey's mirror ball: trigger mirrored peg when white ball hits a peg
                    if (ball.isMirrorBallActive) {
                        // Find peg at mirrored X position (mirror along X-axis)
                        const mirroredX = -peg.body.position.x;
                        const pegY = peg.body.position.y;
                        
                        // Find peg at mirrored position (same Y, mirrored X)
                        const mirroredPeg = this.pegs.find(p => 
                            !p.hit && 
                            p !== peg &&
                            Math.abs(p.body.position.x - mirroredX) < 0.01 && 
                            Math.abs(p.body.position.y - pegY) < 0.01
                        );
                        
                        if (mirroredPeg) {
                            // Trigger the mirrored peg using the spike collision handler
                            this.handleSpikePegCollision({
                                hitPegs: [],
                                parentBall: ball
                            }, mirroredPeg);
                        }
                    }
                } else if (wasAlreadyTracked) {
                    // Peg already tracked - don't update last hit time or stuck check position
                    // We only care about new peg hits for stuck ball detection
                    // Also trigger lucky clover counter for already hit pegs
                    if (this.selectedCharacter?.id === 'peter') {
                        this.peterPower.handleLuckyCloverBounceAlreadyHit(ball, peg);
                    }
                }
                
            // Return early after processing peg collision - don't check walls/bucket
            return;
            } catch (error) {
                // ERROR in peg collision processing
                // Don't return here - let it fall through to other collision checks
            }
        }
        
        // Check for ball/bomb-wall collision
        const wall = this.walls.find(w => w.body === bodyA || w.body === bodyB);
        if (entity && wall) {
            // Clamp velocity after wall collision
            this.clampBallVelocity(entity);
            // Only track wall hits for balls (not bombs)
            if (ball) {
                const wallSide = wall.body.userData?.side || 'unknown';
                // Only log once per frame to avoid spam
                if (!ball.lastWallHit || ball.lastWallHit !== wallSide || ball.lastWallHitFrame !== this.frameCount) {
                    ball.lastWallHit = wallSide;
                    ball.lastWallHitFrame = this.frameCount;
                }
            }
            return;
        }
        
        // Check for ball/bomb-bucket collision (walls only, not catcher)
        if (entity && this.bucket) {
            const bucketPart = this.bucket.leftWall.body === bodyA || this.bucket.leftWall.body === bodyB
                ? this.bucket.leftWall
                : this.bucket.rightWall.body === bodyA || this.bucket.rightWall.body === bodyB
                ? this.bucket.rightWall
                : null;
            
            if (bucketPart) {
                // Clamp velocity after bucket wall collision (not catcher, that's a sensor)
                this.clampBallVelocity(entity);
            }
        }
        
        // Check for ball-bucket catcher collision (sensor, doesn't bounce)
        if (ball && this.bucket) {
            const bucketCatcher = this.bucket.topCatcher.body === bodyA || this.bucket.topCatcher.body === bodyB
                ? this.bucket.topCatcher
                : null;
            
            if (bucketCatcher) {
                // Ball caught! Destroy ball and increase ball count
                if (!ball.caught) {
                    ball.caught = true;
                    this.ballsRemaining++;
                    this.updateBallsRemainingUI();
                    
                    // Play bucket catch sound
                    if (this.audioManager) {
                        this.audioManager.playSound('pegBucket', { volume: 0.8 });
                    }
                    
                    // Mark ball for removal
                    ball.shouldRemove = true;
                }
            }
        }
    }

    checkCollisions() {
        // Check contacts array - this is the PRIMARY collision detection method
        // Event listeners can be unreliable, so we rely on checking contacts directly
        const contacts = this.physicsWorld.world.contacts;
        
        // Use a Set to track processed collisions this frame to avoid duplicates
        if (!this.processedContacts) {
            this.processedContacts = new Set();
        }
        
        // Clear processed contacts every frame for fresh detection
        this.processedContacts.clear();
        
        // Log all contacts for debugging - ALWAYS log, even if empty
        const contactSummary = contacts && contacts.length > 0 ? contacts.map((contact, idx) => {
            if (!contact) return null;
            const bodyA = contact.bi;
            const bodyB = contact.bj;
            if (!bodyA || !bodyB) return null;
            
            // Check what types these bodies are
            const isBall = this.balls.some(b => b.body === bodyA || b.body === bodyB);
            const isPeg = this.pegs.some(p => p.body === bodyA || p.body === bodyB);
            const isWall = this.walls.some(w => w.body === bodyA || w.body === bodyB);
            const peg = isPeg ? this.pegs.find(p => p.body === bodyA || p.body === bodyB) : null;
            const ball = isBall ? this.balls.find(b => b.body === bodyA || b.body === bodyB) : null;
            
            return {
                index: idx,
                bodyAId: bodyA.id,
                bodyBId: bodyB.id,
                isBall,
                isPeg,
                isWall,
                pegId: peg?.body?.id,
                ballId: ball?.body?.id,
                contactKey: `${Math.min(bodyA.id, bodyB.id)}-${Math.max(bodyA.id, bodyB.id)}`,
                // Check if this is the ball-peg contact we're looking for
                isBallPegContact: isBall && isPeg
            };
        }).filter(c => c !== null) : [];
        
        // Process contacts (logging removed)
        
        // Process all active contacts
        for (let i = 0; i < contacts.length; i++) {
            const contact = contacts[i];
            if (!contact) continue;
            
            const bodyA = contact.bi;
            const bodyB = contact.bj;
            
            if (!bodyA || !bodyB) continue;
            
            // Create a unique key for this contact pair
            const contactKey = `${Math.min(bodyA.id, bodyB.id)}-${Math.max(bodyA.id, bodyB.id)}`;
            
            // Skip if we've already processed this contact this frame
            // (could have been processed by beginContact event listener)
            if (this.processedContacts.has(contactKey)) {
                // Contact already processed, skipping
                continue;
            }
            this.processedContacts.add(contactKey);
            
            // Process contact
            const isPeg = this.pegs.some(p => p.body === bodyA || p.body === bodyB);
            const isBall = this.balls.some(b => b.body === bodyA || b.body === bodyB);
            
            this.handleCollision(bodyA, bodyB);
        }
    }

    setupResizeHandler() {
        window.addEventListener('resize', () => {
            this.handleResize();
        });
    }

    handleResize() {
        // Get the actual size of the canvas wrapper (CSS handles the 4:3 sizing)
        const width = this.canvasWrapper.clientWidth;
        const height = this.canvasWrapper.clientHeight;
        
        // Update renderer to match canvas wrapper size
        this.renderer.setSize(width, height);
        
        // Update pixel ratio on resize (in case DPI scaling changes)
        // Lowered to 1.5x for better 4K performance
        const maxPixelRatio = 1.5;
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxPixelRatio));
        
        // Orthographic camera doesn't need aspect ratio update, but we keep it for consistency
        // The view dimensions stay the same (12x9) regardless of screen resolution
    }

    startGameLoop() {
        // Initialize timing for determinism
        const now = performance.now();
        if (!this.lastTime) {
            this.lastTime = now;
        }
        if (!this.lastFrameTime) {
            this.lastFrameTime = now;
        }
        
        const animate = (currentTime) => {
            this.animationFrameId = requestAnimationFrame(animate);
            
            // Skip updates if game is paused
            if (this.gamePaused) {
                this.renderer.render(this.scene, this.camera);
                return;
            }
            
            // FPS cap for determinism - ensure consistent frame timing
            const now = performance.now();
            const elapsed = now - this.lastFrameTime;
            
            // Performance monitoring - track FPS and memory
            if (this.adaptiveSlowdownEnabled) {
                this.trackPerformance(elapsed, now);
                
                // Update FPS display
                if (this.fpsDisplayElement && this.fpsHistory.length > 0) {
                    const avgFPS = this.fpsHistory.reduce((a, b) => a + b, 0) / this.fpsHistory.length;
                    // Guard against invalid FPS values (Infinity, NaN)
                    const displayFPS = (isFinite(avgFPS) && avgFPS > 0) ? avgFPS : 0;
                    this.fpsDisplayElement.textContent = `FPS: ${displayFPS.toFixed(1)}`;
                }
                
                // Check memory usage periodically
                if (now - this.lastMemoryCheck > this.memoryCheckInterval) {
                    this.lastMemoryCheck = now;
                    this.checkMemoryUsage();
                }
            }
            
            // Adaptive slowdown: skip frames if performance is poor
            const slowdownMultiplier = this.getSlowdownMultiplier();
            const adjustedTargetFrameTime = this.targetFrameTime * slowdownMultiplier;
            
            // If we're ahead of schedule, wait to maintain target FPS (with slowdown adjustment)
            // But don't skip if we're already behind (prevents sluggishness on slower displays)
            if (elapsed < adjustedTargetFrameTime * 0.9) {
                // Only skip if we're significantly ahead (more than 10% early)
                // This prevents skipping when display can't maintain target FPS
                return;
            }
            
            // Update last frame time
            this.lastFrameTime = now;
            
            // Use fixed deltaTime for determinism (target frame time)
            // Keep deltaTime fixed to maintain consistent physics timing
            // Slowdown is handled via frame skipping, not by changing physics timestep
            const deltaTime = this.targetFrameTime;
            
            // Update lastTime for other timing calculations
            if (!this.lastTime) {
                this.lastTime = now;
            } else {
                this.lastTime += deltaTime; // Use fixed timestep
            }
            
            // Round deltaTime to 3 decimals for determinism
            const roundedDeltaTime = this.roundToDecimals(deltaTime);
            
            // Increment frame counter
            this.frameCount++;
            
            // Update physics
            if (this.physicsWorld) {
                // Convert to seconds - use fixed rounded deltaTime for determinism
                this.physicsWorld.update(roundedDeltaTime / 1000);
                
                // Check collisions immediately after physics update
                // This is the PRIMARY collision detection method
                this.checkCollisions();
            }
            
            // Round ball positions and velocities to 3 decimals for determinism
            this.balls.forEach(ball => {
                this.roundVec3(ball.body.position);
                this.roundVec3(ball.body.velocity);
            });
            
            // Round bomb positions and velocities for determinism
            if (this.bombs) {
                this.bombs.forEach(bomb => {
                    this.roundVec3(bomb.body.position);
                    this.roundVec3(bomb.body.velocity);
                });
            }
            
            // Round projectile spike positions for determinism
            if (this.spikes) {
                this.spikes.forEach(spike => {
                    if (spike.isProjectile) {
                        this.roundVec3(spike.body.position);
                        this.roundVec3(spike.body.velocity);
                    }
                });
            }
            
            // Update emoji effects
            if (this.emojiEffect) {
                this.emojiEffect.update(currentTime);
            }
            
            // Update bucket
            if (this.bucket) {
                this.bucket.update(deltaTime / 1000); // Convert to seconds
            }
            
            // Update bombs
            if (this.bombs) {
                this.bombs.forEach(bomb => {
                    bomb.update(currentTime);
                    
                    // Check if bomb should explode
                    if (bomb.shouldExplode(currentTime)) {
                        this.explodeBomb(bomb);
                    }
                });
            }
            
            // Handle rapid shot queue
            if (this.rapidShotQueue && this.rapidShotQueue.length > 0) {
                const currentTimeSeconds = currentTime / 1000;
                // Fire next rapid shot if enough time has passed (fires in quick succession)
                if (currentTimeSeconds - this.lastRapidShotTime >= this.rapidShotDelay) {
                    const shot = this.rapidShotQueue.shift();
                    // Play ball firing sound for each rapid shot ball
                    if (this.audioManager) {
                        this.audioManager.playSound('pegShoot', { volume: 1 });
                    }
                    this.spawnBall(shot.spawnX, shot.spawnY, shot.spawnZ, shot.originalVelocity, shot.originalVelocity, true); // Yellow ball
                    this.lastRapidShotTime = currentTimeSeconds;
                }
            }
            
            // Update all balls
            // Get current time once for all ball updates (in seconds)
            const currentTimeSeconds = performance.now() / 1000;
            
            // Update spikes and handle quill shot
            if (this.spikes) {
                // Iterate backwards to safely remove items
                for (let i = this.spikes.length - 1; i >= 0; i--) {
                    const spike = this.spikes[i];
                    spike.update();
                    
                    // Manual spike-peg collision detection (since collisionResponse is false)
                    // Check if the entire spike (line segment) intersects with any peg
                    // For projectile spikes: base at body.position, tip at body.position + direction * length
                    // For static spikes (including green peg spikes): base at startPosition, tip at startPosition + direction * currentLength
                    let spikeBasePos, spikeTipPos;
                    if (spike.isProjectile) {
                        const bodyPos = spike.body.position;
                        spikeBasePos = { x: bodyPos.x, y: bodyPos.y, z: bodyPos.z };
                        spikeTipPos = {
                            x: bodyPos.x + spike.direction.x * spike.length,
                            y: bodyPos.y + spike.direction.y * spike.length,
                            z: bodyPos.z + spike.direction.z * spike.length
                        };
                    } else {
                        // Static spike (green peg spike): base at startPosition, tip grows from there
                        // For green peg spikes, use startPosition directly (spike grows from center of peg)
                        const startPos = spike.startPosition || spike.body.position;
                        // Use current length (which grows over time for green peg spikes)
                        const currentLength = Math.max(spike.length, 0.05); // Minimum length for collision detection
                        spikeBasePos = { x: startPos.x, y: startPos.y, z: startPos.z };
                        spikeTipPos = {
                            x: startPos.x + spike.direction.x * currentLength,
                            y: startPos.y + spike.direction.y * currentLength,
                            z: startPos.z + spike.direction.z * currentLength
                        };
                    }
                    
                    for (const peg of this.pegs) {
                        if (spike.hitPegs.includes(peg)) continue; // Already hit this peg
                        
                        // Skip the source peg (green peg that spawned the spikes)
                        if (spike.isGreenPegSpike && spike.startPosition) {
                            const sourcePegDist = Math.sqrt(
                                Math.pow(spike.startPosition.x - peg.body.position.x, 2) +
                                Math.pow(spike.startPosition.y - peg.body.position.y, 2)
                            );
                            if (sourcePegDist < 0.1) continue; // Skip the source peg
                        }
                        
                        const pegPos = peg.body.position;
                        const pegRadius = 0.09;
                        
                        // Simplified and more reliable collision detection
                        // Check if any point along the spike line segment is within peg radius
                        const dx = spikeTipPos.x - spikeBasePos.x;
                        const dy = spikeTipPos.y - spikeBasePos.y;
                        const lineLength = Math.sqrt(dx * dx + dy * dy);
                        
                        let intersects = false;
                        
                        if (lineLength > 0.0001) {
                            // Normalize direction
                            const dirX = dx / lineLength;
                            const dirY = dy / lineLength;
                            
                            // Vector from base to peg center
                            const toPegX = pegPos.x - spikeBasePos.x;
                            const toPegY = pegPos.y - spikeBasePos.y;
                            
                            // Project peg center onto line segment
                            const projection = toPegX * dirX + toPegY * dirY;
                            
                            // Clamp projection to line segment bounds
                            const clampedProjection = Math.max(0, Math.min(lineLength, projection));
                            
                            // Find closest point on line segment to peg center
                            const closestX = spikeBasePos.x + clampedProjection * dirX;
                            const closestY = spikeBasePos.y + clampedProjection * dirY;
                            
                            // Distance from closest point to peg center
                            const distX = closestX - pegPos.x;
                            const distY = closestY - pegPos.y;
                            const distToPeg = Math.sqrt(distX * distX + distY * distY);
                            
                            // If distance is less than peg radius, spike hits peg
                            if (distToPeg <= pegRadius) {
                                intersects = true;
                            }
                        } else {
                            // Very short spike - just check if base or tip is inside peg
                            const distToBase = Math.sqrt(
                                Math.pow(spikeBasePos.x - pegPos.x, 2) + 
                                Math.pow(spikeBasePos.y - pegPos.y, 2)
                            );
                            const distToTip = Math.sqrt(
                                Math.pow(spikeTipPos.x - pegPos.x, 2) + 
                                Math.pow(spikeTipPos.y - pegPos.y, 2)
                            );
                            
                            if (distToBase <= pegRadius || distToTip <= pegRadius) {
                                intersects = true;
                            }
                        }
                        
                        if (intersects) {
                            this.handleSpikePegCollision(spike, peg);
                            
                            // Destroy quill shot spikes on impact
                            if (spike.isQuillShotSpike) {
                                spike.shouldRemove = true;
                            }
                            
                            break; // Only hit one peg per spike
                        }
                    }
                    
                    if (spike.isExpired()) {
                        spike.remove();
                        this.spikes.splice(i, 1);
                    }
                }
            }
            
            // Handle quill shot spike shooting from balls
            if (this.selectedCharacter?.id === 'spikey') {
                const deltaTimeSeconds = deltaTime / 1000; // Convert to seconds
                this.balls.forEach(ball => {
                    this.spikeyPower.updateQuillShot(ball, deltaTimeSeconds);
                });
            }
            
            // Handle mirror ball ghost ball updates
            if (this.selectedCharacter?.id === 'mikey') {
                this.balls.forEach(ball => {
                    if (ball.isMirrorBallActive && ball.ghostMesh) {
                        // Update ghost ball position to mirror white ball
                        this.mikeyPower.updateGhostBall(ball);
                        // Check if ghost ball passes through pegs
                        this.mikeyPower.checkGhostBallPegCollisions(ball);
                    }
                });
            }
            
            // Handle rocket thrust and visuals for rocket balls
            if (this.selectedCharacter?.id === 'buzz') {
                const deltaTimeSeconds = deltaTime / 1000; // Convert to seconds
                this.balls.forEach(ball => {
                    if (ball.isRocket) {
                        this.buzzPower.updateRocket(ball, deltaTimeSeconds);
                        // Update fuel gauge in real-time while rocket ball exists and has fuel
                        if (ball.rocketFuelRemaining !== undefined && ball.rocketFuelRemaining > 0) {
                            // Update fuel gauge directly for real-time updates
                            if (this.rocketFuelGauge && this.rocketFuelGaugeFill) {
                                const maxFuel = 2; // Maximum fuel time in seconds
                                const fuelPercent = Math.max(0, Math.min(100, (ball.rocketFuelRemaining / maxFuel) * 100));
                                this.rocketFuelGaugeFill.style.width = `${fuelPercent}%`;
                                this.rocketFuelGauge.style.display = 'block';
                            }
                        } else if (ball.rocketFuelRemaining !== undefined && ball.rocketFuelRemaining <= 0) {
                            // Hide gauge when fuel is depleted
                            if (this.rocketFuelGauge) {
                                this.rocketFuelGauge.style.display = 'none';
                            }
                        }
                    }
                });
                // If no rocket balls exist, hide the gauge
                const hasRocketBall = this.balls.some(ball => ball.isRocket && ball.rocketFuelRemaining !== undefined && ball.rocketFuelRemaining > 0);
                if (!hasRocketBall && this.rocketFuelGauge) {
                    this.rocketFuelGauge.style.display = 'none';
                }
            } else {
                // Hide gauge when not playing as Buzz
                if (this.rocketFuelGauge) {
                    this.rocketFuelGauge.style.display = 'none';
                }
            }
            
            // Handle magnetic power updates for magnetic balls and magnet visuals
            if (this.selectedCharacter?.id === 'maddam') {
                const deltaTimeSeconds = deltaTime / 1000; // Convert to seconds
                
                // Update magnet visuals (scales to 0 when power turns reach 0)
                this.maddamPower.updateMagnetVisuals(deltaTimeSeconds);
                
                // Update magnetism effects for active magnetic balls
                this.balls.forEach(ball => {
                    if (ball.isMagnetic) {
                        this.maddamPower.updateMagnetism(ball, deltaTimeSeconds);
                    }
                });
            }
            
            this.balls.forEach(ball => {
                ball.update();
                
                // Check if bomb-ball's explosion pegs should be removed (5 second rule)
                if (ball.explosionHitPegs && ball.explosionHitPegs.length > 0 && ball.explosionTime) {
                    const timeSinceExplosion = currentTimeSeconds - ball.explosionTime;
                    if (timeSinceExplosion >= 5.0) {
                        // Remove pegs hit by explosion after 5 seconds
                        ball.explosionHitPegs.forEach(peg => {
                            const pegIndex = this.pegs.indexOf(peg);
                            if (pegIndex !== -1) {
                                peg.remove();
                                this.pegs.splice(pegIndex, 1);
                            }
                        });
                        // Clear the array so we don't remove them again
                        ball.explosionHitPegs = [];
                    }
                }
                
                // Stuck check: peg pattern detection (primary) + fallback checks
                // Initialize tracking if missing
                if (!ball.lastNewPegHitTime) {
                    ball.lastNewPegHitTime = ball.spawnTime || currentTimeSeconds;
                }
                if (ball.lastVelocity === undefined) {
                    ball.lastVelocity = 0;
                    ball.lastHighVelocityTime = ball.spawnTime || currentTimeSeconds;
                }
                if (!ball.recentHitPegs) {
                    ball.recentHitPegs = [];
                    ball.recentHitTimes = [];
                }
                if (!ball.stuckPatternCheckTime) {
                    ball.stuckPatternCheckTime = ball.spawnTime || currentTimeSeconds;
                }
                
                const ballVelocity = Math.sqrt(
                    ball.body.velocity.x * ball.body.velocity.x + 
                    ball.body.velocity.y * ball.body.velocity.y
                );
                
                // Update lastVelocity continuously for comparison
                ball.lastVelocity = ballVelocity;
                
                // Only reset the timer if velocity is above a high threshold (ball is actively moving)
                // Small bounces when stuck won't reset the timer
                const highVelocityThreshold = 0.5;
                if (ballVelocity > highVelocityThreshold) {
                    ball.lastHighVelocityTime = currentTimeSeconds;
                }
                
                // PEG PATTERN CHECK: Check every 0.6 seconds if ball is bouncing between same 2 pegs
                const patternCheckInterval = 1.6;
                const timeSincePatternCheck = currentTimeSeconds - ball.stuckPatternCheckTime;
                let stuckPatternDetected = false;
                let patternCheckDetails = null;
                
                if (timeSincePatternCheck >= patternCheckInterval) {
                    ball.stuckPatternCheckTime = currentTimeSeconds;
                    
                    // Check if we have 2 recent peg hits
                    if (ball.recentHitPegs.length === 2 && ball.recentHitTimes.length === 2) {
                        const [peg1, peg2] = ball.recentHitPegs;
                        const [time1, time2] = ball.recentHitTimes;
                        
                        // Check if hits are within 0.2s of each other (rapid bouncing)
                        const timeBetweenHits = Math.abs(time2 - time1);
                        
                        // If the last 2 pegs are being hit rapidly (< 0.2s apart), it's a stuck pattern
                        // The pegs can be the same (bouncing on one peg) or different (bouncing between two)
                        // Either way, rapid hits indicate being stuck
                        if (timeBetweenHits < 0.2 && timeBetweenHits > 0) {
                            stuckPatternDetected = true;
                            ball.stuckPatternCount++;
                            patternCheckDetails = {
                                detected: true,
                                timeBetweenHits: timeBetweenHits.toFixed(3),
                                consecutiveCount: ball.stuckPatternCount,
                                peg1SameAsPeg2: peg1 === peg2
                            };
                        } else {
                            // Pattern broken - reset counter
                            ball.stuckPatternCount = 0;
                            patternCheckDetails = {
                                detected: false,
                                reason: timeBetweenHits >= 0.2 ? 'timeBetweenHits too large' : 'timeBetweenHits is 0',
                                timeBetweenHits: timeBetweenHits.toFixed(3),
                                consecutiveCount: 0
                            };
                        }
                    } else {
                        // Not enough pegs tracked yet - reset counter
                        ball.stuckPatternCount = 0;
                        patternCheckDetails = {
                            detected: false,
                            reason: 'not enough pegs tracked',
                            recentPegsCount: ball.recentHitPegs.length,
                            recentTimesCount: ball.recentHitTimes.length,
                            consecutiveCount: 0
                        };
                    }
                } else {
                    // If pattern was detected in previous check, continue counting
                    // (we check this outside the interval to avoid resetting the counter)
                    if (ball.stuckPatternCount > 0 && ball.recentHitPegs.length === 2 && ball.recentHitTimes.length === 2) {
                        const [time1, time2] = ball.recentHitTimes;
                        const timeBetweenHits = Math.abs(time2 - time1);
                        if (timeBetweenHits < 0.2 && timeBetweenHits > 0) {
                            stuckPatternDetected = true;
                        }
                    }
                    patternCheckDetails = {
                        intervalNotReached: true,
                        timeSincePatternCheck: timeSincePatternCheck.toFixed(3),
                        consecutiveCount: ball.stuckPatternCount
                    };
                }
                
                // Calculate times for fallback checks
                const timeSinceHighVelocity = currentTimeSeconds - ball.lastHighVelocityTime;
                const timeSinceSpawn = currentTimeSeconds - ball.spawnTime;
                
                // Minimum number of pegs hit before any stuck check can trigger (prevent early false positives)
                const minPegsHitForStuckCheck = 3;
                const hasEnoughPegsHit = ball.hitPegs && ball.hitPegs.length >= minPegsHitForStuckCheck;
                
                // Check each condition (only if enough pegs have been hit)
                const patternCheckPassed = hasEnoughPegsHit && stuckPatternDetected && ball.stuckPatternCount >= 2;
                const velocityCheckPassed = hasEnoughPegsHit && timeSinceHighVelocity >= 1.0;
                // 5-second check: If ball hasn't hit a NEW peg in 5 seconds, it's stuck
                // This only resets on new peg hits, so bouncing between already-hit pegs for 5 seconds triggers removal
                const spawnCheckPassed = timeSinceSpawn >= 5.0;
                
                // Stuck check logging removed - checks run silently
                
                // Check if ball should trigger peg removal (any of these conditions):
                // 1. Stuck pattern detected for 2 consecutive intervals (primary check - bouncing between same pegs)
                // 2. Velocity hasn't been high (above 0.5) in 1 second (velocity-based check)
                // 3. Ball hasn't hit a NEW peg in 5 seconds (5-second check - only resets on new peg hits)
                const shouldRemovePegs = (
                    patternCheckPassed ||
                    velocityCheckPassed ||
                    spawnCheckPassed
                ) && ball.hitPegs && ball.hitPegs.length > 0;
                
                if (shouldRemovePegs && ball.hitPegs.length > 0) {
                    // Start removing hit pegs in order with 0.15 second stagger
                    if (!ball.removingPegs) {
                        ball.removingPegs = true;
                        ball.pegRemoveStartTime = currentTimeSeconds;
                        ball.pegRemoveIndex = 0;
                        // Snapshot the hit pegs at the moment removal starts
                        // This ensures we only remove pegs that were hit up to this point
                        ball.pegsToRemove = [...ball.hitPegs];
                    }
                    
                    // Remove pegs one by one from the snapshot
                    const timeSinceRemoveStart = currentTimeSeconds - ball.pegRemoveStartTime;
                    const expectedIndex = Math.floor(timeSinceRemoveStart / 0.15);
                    
                    while (ball.pegRemoveIndex <= expectedIndex && ball.pegRemoveIndex < ball.pegsToRemove.length) {
                        const pegToRemove = ball.pegsToRemove[ball.pegRemoveIndex];
                        const pegIndex = this.pegs.indexOf(pegToRemove);
                        if (pegIndex !== -1) {
                            pegToRemove.remove();
                            this.pegs.splice(pegIndex, 1);
                        }
                        ball.pegRemoveIndex++;
                    }
                } else {
                    // Reset removal state if ball moves away or hits new peg
                    ball.removingPegs = false;
                    ball.pegsToRemove = null;
                }
            });
            
            // Hide trajectory guide if ball is active
            if (this.balls.length > 0) {
                this.hideTrajectoryGuide();
            } else if (this.ballsRemaining > 0) {
                // Show trajectory guide when no ball is active
                this.updateTrajectoryGuide();
                
                // Activate magnetism visuals when shot ends and player is ready for next shot
                // Only activate when no balls are active (shot has ended) AND power is available
                // The check for balls.length === 0 is already in the else if above, so we're safe here
                if (this.selectedCharacter?.id === 'maddam' && this.magneticActive && this.powerTurnsRemaining > 0) {
                    // Only activate if not already activated (prevents duplicate calls)
                    // This ensures magnets only appear when ready for next shot, not when green peg is hit mid-shot
                    if (!this.maddamPower.magnetismActivatedThisShot) {
                        this.maddamPower.activateMagnetism();
                        this.maddamPower.magnetismActivatedThisShot = true;
                    }
                } else {
                    // Reset flag when conditions not met
                    this.maddamPower.magnetismActivatedThisShot = false;
                }
            }
            
            // Collision detection is already called immediately after physics update (above)
            
            // Check for ball-bucket catcher collision (manual check for sensors)
            if (this.bucket) {
                this.balls.forEach(ball => {
                    if (!ball.caught && !ball.shouldRemove) {
                        const ballPos = ball.body.position;
                        const catcherPos = this.bucket.topCatcher.body.position;
                        const catcherHalfWidth = this.bucket.width / 2;
                        const catcherHalfHeight = this.bucket.wallThickness / 2;
                        
                        // Check if ball is within catcher bounds
                        const withinX = Math.abs(ballPos.x - catcherPos.x) < catcherHalfWidth + 0.1; // Ball radius is 0.1
                        const withinY = Math.abs(ballPos.y - catcherPos.y) < catcherHalfHeight + 0.1;
                        
                        if (withinX && withinY) {
                            // Ball caught!
                            ball.caught = true;
                            ball.shouldRemove = true;
                            this.ballsRemaining++;
                            this.updateBallsRemainingUI();
                            
                            // Play bucket catch sound
                            if (this.audioManager) {
                                this.audioManager.playSound('pegBucket', { volume: 0.8 });
                            }
                        }
                    }
                    
                    // Check if ghost ball (mirror ball) is caught by bucket
                    if (ball.isMirrorBallActive && ball.ghostMesh && !ball.ghostCaught) {
                        const ghostPos = ball.ghostMesh.position;
                        const catcherPos = this.bucket.topCatcher.body.position;
                        const catcherHalfWidth = this.bucket.width / 2;
                        const catcherHalfHeight = this.bucket.wallThickness / 2;
                        
                        // Check if ghost ball is within catcher bounds
                        const withinX = Math.abs(ghostPos.x - catcherPos.x) < catcherHalfWidth + 0.1; // Ball radius is 0.1
                        const withinY = Math.abs(ghostPos.y - catcherPos.y) < catcherHalfHeight + 0.1;
                        
                        if (withinX && withinY) {
                            // Ghost ball caught!
                            ball.ghostCaught = true;
                            this.ballsRemaining++;
                            this.updateBallsRemainingUI();
                            
                            // Play bucket catch sound
                            if (this.audioManager) {
                                this.audioManager.playSound('pegBucket', { volume: 0.8 });
                            }
                            
                            // Hide ghost ball when caught
                            if (ball.ghostMesh) {
                                ball.ghostMesh.visible = false;
                            }
                        }
                    }
                });
            }
            
            // Clean up bombs that are out of bounds
            if (this.bombs) {
                this.bombs = this.bombs.filter(bomb => {
                    if (bomb.body.position.y < -6) {
                        bomb.remove();
                        return false;
                    }
                    return true;
                });
            }
            
            // Clean up balls that are out of bounds or caught
            const ballsBeforeCleanup = this.balls.length;
            const ballsToRemove = [];
            this.balls = this.balls.filter(ball => {
                if (ball.shouldRemove || ball.isOutOfBounds()) {
                    ballsToRemove.push(ball);
                    return false;
                }
                return true;
            });
            
            // Only remove pegs if ALL balls are removed (wait until no balls remain)
            // This allows rapid shot/spread shot to continue with remaining balls
            if (ballsToRemove.length > 0 && this.balls.length === 0) {
                // All balls are gone - clean up removed balls
                ballsToRemove.forEach(ball => {
                    // Clean up ghost ball mesh if it exists (mirror ball)
                    if (ball.ghostMesh) {
                        this.scene.remove(ball.ghostMesh);
                        ball.ghostMesh.geometry.dispose();
                        ball.ghostMesh.material.dispose();
                        ball.ghostMesh = null;
                    }
                    ball.remove();
                });
                
                // Remove ALL hit pegs when all balls are removed (end of turn)
                // Iterate backwards to safely remove items from array
                for (let i = this.pegs.length - 1; i >= 0; i--) {
                    const peg = this.pegs[i];
                    if (peg.hit) {
                        peg.remove();
                        this.pegs.splice(i, 1);
                    }
                }
                
                // Disable lucky clover if no more power turns (only when all balls are removed)
                if (this.powerTurnsRemaining === 0) {
                    this.luckyClover.enabled = false;
                }
            } else if (ballsToRemove.length > 0) {
                // Some balls were removed but others remain - just clean up visuals, don't remove pegs
                ballsToRemove.forEach(ball => {
                    // Clean up ghost ball mesh if it exists (mirror ball)
                    if (ball.ghostMesh) {
                        this.scene.remove(ball.ghostMesh);
                        ball.ghostMesh.geometry.dispose();
                        ball.ghostMesh.material.dispose();
                        ball.ghostMesh = null;
                    }
                    ball.remove();
                });
            }
            
            // Reset free ball counter and reassign purple peg when all active balls are destroyed
            // (This handles cases where powers might add multiple balls)
            if (ballsBeforeCleanup > 0 && this.balls.length === 0) {
                this.currentShotScore = 0;
                this.updateFreeBallMeter();
                
                // Reset purple peg multiplier (only lasts for the shot where it was hit)
                this.purplePegMultiplier = 1.0;
                this.updateOrangePegMultiplier(); // Update display
                
                // Remove pegs hit by green peg spikes (spikes from green pegs, not from balls)
                // This happens when a shot ends (all balls removed)
                if (this.greenPegSpikeHitPegs.length > 0) {
                    this.greenPegSpikeHitPegs.forEach(peg => {
                        const pegIndex = this.pegs.indexOf(peg);
                        if (pegIndex !== -1) {
                            peg.remove();
                            this.pegs.splice(pegIndex, 1);
                        }
                    });
                    this.greenPegSpikeHitPegs = [];
                }
                
                // Clean up temporary purple pegs (created by Peter's lucky bounces)
                // They only last for the current turn
                this.temporaryPurplePegs.forEach(tempPeg => {
                    if (!tempPeg.hit) {
                        // Reset to blue color if not hit
                        tempPeg.mesh.material.color.setHex(0x4a90e2); // Blue
                        tempPeg.isPurple = false;
                        tempPeg.pointValue = 300; // Reset to base value (blue peg value)
                    }
                });
                this.temporaryPurplePegs = [];
                
                // Reassign purple peg (previous one will turn blue if not hit)
                this.assignPurplePeg();
                
                // Check if game is over (no balls left or all orange pegs cleared)
                this.checkGameOver();
            }
            
            // Check if John's queued roulette should be triggered when previous roulette completes
            // This handles cases where multiple green pegs were hit while a roulette was already active
            if (this.balls.length === 0 && this.selectedCharacter?.id === 'john' && 
                this.rouletteQueue.length > 0 && this.powerTurnsRemaining > 0 && 
                !this.rouletteActive && !this.gamePaused) {
                // Trigger next queued roulette if previous one completed
                this.triggerRoulette();
                // Remove the roulette from queue (it's being played now)
                this.rouletteQueue.shift();
            }
            
            // Also remove green peg spike hit pegs after 5 seconds if no balls are active
            if (this.balls.length === 0 && this.greenPegSpikeHitPegs.length > 0) {
                // Check if any spikes are still active
                const hasActiveSpikes = this.spikes && this.spikes.length > 0;
                if (!hasActiveSpikes) {
                    // All spikes expired, remove pegs hit by green peg spikes
                    this.greenPegSpikeHitPegs.forEach(peg => {
                        const pegIndex = this.pegs.indexOf(peg);
                        if (pegIndex !== -1) {
                            peg.remove();
                            this.pegs.splice(pegIndex, 1);
                        }
                    });
                    this.greenPegSpikeHitPegs = [];
                }
            }
            
            // Render
            this.renderer.render(this.scene, this.camera);
        };
        
        // Initial resize to set correct dimensions
        this.handleResize();
        
        this.lastTime = performance.now();
        animate(this.lastTime);
    }

    /**
     * Track performance and update slowdown mode
     */
    trackPerformance(elapsed, now) {
        // Calculate current FPS - guard against division by zero or very small values
        // If elapsed is 0 or very small, skip this frame's FPS calculation
        if (elapsed <= 0 || elapsed < 0.1) {
            // Skip invalid/too-fast frames to prevent Infinity FPS
            return;
        }
        
        const currentFPS = 1000 / elapsed;
        
        // Cap FPS at a reasonable maximum (e.g., 1000 FPS) to prevent Infinity values
        const cappedFPS = Math.min(currentFPS, 1000);
        
        // Add to history
        this.fpsHistory.push(cappedFPS);
        if (this.fpsHistory.length > this.fpsHistorySize) {
            this.fpsHistory.shift(); // Remove oldest
        }
        
        // Check FPS periodically to update performance mode
        if (now - this.lastFpsCheck > this.fpsCheckInterval) {
            this.lastFpsCheck = now;
            
            // Calculate average FPS over history
            if (this.fpsHistory.length > 0) {
                const avgFPS = this.fpsHistory.reduce((a, b) => a + b, 0) / this.fpsHistory.length;
                
                // Update performance mode based on average FPS
                if (avgFPS < 30) {
                    this.performanceMode = 'heavy_slowdown';
                } else if (avgFPS < 45) {
                    this.performanceMode = 'slowdown';
                } else {
                    this.performanceMode = 'normal';
                }
                
                // Optional: Log performance warnings
                if (avgFPS < 30 && this.fpsHistory.length === this.fpsHistorySize) {
                    console.warn(`Performance warning: Average FPS is ${avgFPS.toFixed(1)}. Enabling heavy slowdown.`);
                }
            }
        }
    }
    
    /**
     * Get slowdown multiplier based on current performance mode
     */
    getSlowdownMultiplier() {
        if (!this.adaptiveSlowdownEnabled) {
            return 1.0;
        }
        
        switch (this.performanceMode) {
            case 'heavy_slowdown':
                return 2.0; // Run physics at half speed (skip every other frame effectively)
            case 'slowdown':
                return 1.5; // Run physics at 2/3 speed
            case 'normal':
            default:
                return 1.0; // Normal speed
        }
    }
    
    /**
     * Check memory usage (if available)
     */
    checkMemoryUsage() {
        if (performance.memory) {
            const used = performance.memory.usedJSHeapSize / 1048576; // Convert to MB
            const total = performance.memory.totalJSHeapSize / 1048576;
            const limit = performance.memory.jsHeapSizeLimit / 1048576;
            
            // Warn if memory usage is high
            if (used / limit > 0.8) {
                console.warn(`Memory usage high: ${used.toFixed(1)}MB / ${limit.toFixed(1)}MB (${(used/limit*100).toFixed(1)}%)`);
            }
            
            return { used, total, limit };
        }
        return null;
    }

    dispose() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }
        
        // Clean up all balls
        this.balls.forEach(ball => ball.remove());
        this.balls = [];
        
        // Clean up all pegs
        this.pegs.forEach(peg => peg.remove());
        this.pegs = [];
        
        // Clean up all walls
        this.walls.forEach(wall => wall.remove());
        this.walls = [];
        
        // Clean up all spikes
        if (this.spikes) {
            this.spikes.forEach(spike => spike.remove());
            this.spikes = [];
        }
        
        // Clean up Three.js resources
        if (this.renderer) {
            this.renderer.dispose();
        }
    }
}

