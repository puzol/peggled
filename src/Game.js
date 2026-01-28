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
import { ArkanoidPower } from './characters/ArkanoidPower.js';
import { I8Power } from './characters/I8Power.js';
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
        this.ballRadius = 0.1; // Default ball radius
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

        // Orange peg multiplier system
        this.orangePegMultiplier = 1.0; // Base multiplier from orange peg progress (2x at 40%, 3x at 60%, 5x at 80%, 10x at 90%)
        
        // Maximum rebound speed for collisions with pegs, walls, and bucket
        this.maxReboundSpeed = 7.5;
        
        // Ball shot speed constant (reduced by 15%, 30%, 10%, and 30%)
        this.ballShotSpeed = 10;
        this.ballSpawnX = 0;
        this.ballSpawnY = 3.7;
        this.ballSpawnZ = 0;

        // Ball reset timer
        this.ballBaseResetTime = 5; // seconds
        this.ballResetTime = 5; // seconds
        
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
        this.freeBallMeterFill = container.querySelector('#free-ball-meter-fill');
        this.multiplierTrackerFill = container.querySelector('#multiplier-tracker-fill');
        this.multiplierValue = container.querySelector('#multiplier-value');
        this.playAgainButton = container.querySelector('#play-again-button');
        this.playAgainNewSeedButton = container.querySelector('#play-again-new-seed-button');
        this.seedValueElement = container.querySelector('#seed-value');
        this.copySeedButton = container.querySelector('#copy-seed-button');
        // Seed input is in character selector, not game container
        this.seedInput = document.querySelector('#seed-input');
        
        this.currentMiliseconds = Date.now();
        this.oneOrTwo = this.currentMiliseconds % 2;
        this.tracks = ['track1', 'track2'];
        
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
        this.mouseX = 0;
        this.mouseY = 0;
        
        // Mobile touch controls
        this.touchActive = false;
        this.touchId = null;
        this.analogueStick = null;
        this.analogueStickOuter = null;
        this.analogueStickInner = null;
        this.stickOriginX = 0;
        this.stickOriginY = 0;
        this.stickMaxRadius = 0; // Will be set based on outer circle size
        
        // Page visibility pause state
        this.visibilityPaused = false;
        this.musicMutedByVisibility = false; // Track if music was muted due to visibility
        
        // Character system
        this.selectedCharacter = null;
        this.characters = [
            {
                id: 'peter',
                name: 'Peter the Leprechaun',
                powerName: 'Lucky Clover',
                power: PeterPower,
                powerDescription: 'Every 3rd peg hit bounces the ball with 75% of original shot momentum and generates a purple peg'
            },
            // {
            //     id: 'john',
            //     name: 'John, the Gunner',
            //     powerName: 'Roulette Power',
            //     power: JohnPower,
            //     powerDescription: 'Green pegs trigger a roulette with 3 random powers: Spread Shot, Rapid Shot, or Explosion'
            // },
            // {
            //     id: 'spikey',
            //     name: 'Spikey the PufferFish',
            //     powerName: 'Spike Power',
            //     power: SpikeyPower,
            //     powerDescription: 'On green peg hit, spawn 8 spikes around the peg. Powers up next shot with quill shot (shoots spikes from ball).'
            // },
            // {
            //     id: 'buzz',
            //     name: 'Buzz, the Rocketeer',
            //     powerName: 'Rocket Power',
            //     power: BuzzPower,
            //     powerDescription: 'On green peg hit, adds a rocket power shot. Hold Ctrl to activate thrust, giving control of the ball.'
            // },
            // {
            //     id: 'mikey',
            //     name: 'Mikey, the man in the mirror',
            //     powerName: 'Mirror Ball',
            //     power: MikeyPower,
            //     powerDescription: 'On green peg hit, grants a power move. On shot, shoots 2 balls: white ball and ethereal mirror ball that reflects along X-axis.'
            // },
            {
                id: 'maddam',
                name: 'Maddam Magna Thicke',
                powerName: 'Magnetic Pegs',
                power: MaddamPower,
                powerDescription: 'On green peg hit, grants a power for the next shot. Orange, Green, and Purple pegs gain magnetism, pulling the white ball within 1.5 points radius.'
            },
            {
                id: 'arkanoid',
                name: 'Arkanoid',
                powerName: 'Brick Breaker',
                power: ArkanoidPower,
                powerDescription: 'On green peg hit, bucket drops and a paddle rises. Bounce the ball off the paddle - first bounce removes gravity for 10 seconds!'
            },
            {
                id: 'i8',
                name: 'The i8',
                powerName: 'I Ate',
                power: I8Power,
                powerDescription: 'On peg hit, the ball "eats" the peg and grows larger. When it exceeds 3x size, it explodes, hitting nearby pegs and launching upward!'
            }
        ];
        
        this.activePower = null; // Currently active power system instance

        this.levelEditor = new LevelEditor(this);

        // Seeded RNG system - will be initialized in startGame() after seed input is checked
        this.rng = null;
        this.currentSeed = null;
        this.selectedLevelPath = null; // Path to selected level JSON file
        
        // Testing controls
        this.testAimAngle = null; // Set by number keys 1-6
        
        // Click handling
        this.setupClickHandler();
        
        // Mobile touch controls
        this.setupTouchControls();
        
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
            { name: 'Level 3', path: 'levels/level3.json' }
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
        
        // Clear existing character options (in case this is called multiple times)
        optionsContainer.innerHTML = '';
        
        // Create character option elements
        this.characters.forEach(character => {
            const option = document.createElement('div');
            option.className = 'character-option';
            option.innerHTML = `
                <div class="character-name">${character.name}</div>
                <div class="character-power">${character.powerName}: ${character.powerDescription}</div>
            `;
            
            option.addEventListener('click', () => {
                this.activePower = null; // Clear any existing active power

                // Remove selected class from all options
                document.querySelectorAll('.character-option').forEach(opt => {
                    opt.classList.remove('selected');
                });

                this.activePower = new character.power(this); // Create new instance of selected character power
                
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

                this.activePower = null; // Clear any existing active power
                
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

                        // After: this.selectedCharacter = selectedCharacter;
                        this.activePower = new selectedCharacter.power(this);  // Instantiate the power for the random selection
                        
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
            const track2Name = this.audioManager.getTrackName(2);
            const track3Name = this.audioManager.getTrackName(3);
            const track4Name = this.audioManager.getTrackName(4);
            if (track2Name) this.audioManager.setMusicTrackMuted(track2Name, true);
            if (track3Name) this.audioManager.setMusicTrackMuted(track3Name, true);
            if (track4Name) this.audioManager.setMusicTrackMuted(track4Name, true);
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
            await this.audioManager.loadMusicTracks('track' + (this.oneOrTwo + 1), `${import.meta.env.BASE_URL}sounds/`);
        }
    }

    async init() {
        this.setupScene();
        this.setupRenderer();
        this.setupCamera();
        this.setupPhysics();
        this.setupLighting();
        this.setupResizeHandler();

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
        
        // Hide play again buttons initially
        this.hidePlayAgainButton();
        this.hidePlayAgainNewSeedButton();
        
        // Create trajectory guide
        this.createTrajectoryGuide();
        
        // Initialize mobile touch controls
        this.initTouchControls();
        
        // Set up collision detection
        this.setupCollisionDetection();
        
        // Set up page visibility handling (pause when minimized)
        this.setupPageVisibility();
        
        this.startGameLoop();

        this.activePower.onInit(); // Call onInit for the power
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
        
        // Use click for shooting new ball
        this.canvas.addEventListener('click', (event) => {
            this.handleClick(event);
        });
    }
    
    initTouchControls() {
        // Get analogue stick elements
        const uiOverlay = this.container.querySelector('#ui-overlay');
        if (uiOverlay) {
            this.analogueStick = uiOverlay.querySelector('#analogue-stick');
            this.analogueStickOuter = uiOverlay.querySelector('#analogue-stick-outer');
            this.analogueStickInner = uiOverlay.querySelector('#analogue-stick-inner');
            
            if (this.analogueStickOuter) {
                // Calculate max radius (half of outer circle size minus inner circle radius)
                const outerSize = parseFloat(getComputedStyle(this.analogueStickOuter).width);
                const innerSize = parseFloat(getComputedStyle(this.analogueStickInner).width);
                this.stickMaxRadius = (outerSize - innerSize) / 2;
            }
        }
    }
    
    setupTouchControls() {
        // Touch event handlers for mobile aiming and shooting
        this.canvas.addEventListener('touchstart', (event) => {
            this.handleTouchStart(event);
        }, { passive: false });
        
        this.canvas.addEventListener('touchmove', (event) => {
            this.handleTouchMove(event);
        }, { passive: false });
        
        this.canvas.addEventListener('touchend', (event) => {
            this.handleTouchEnd(event);
        }, { passive: false });
        
        this.canvas.addEventListener('touchcancel', (event) => {
            this.handleTouchEnd(event);
        }, { passive: false });
    }
    
    handleTouchStart(event) {
        // Don't handle touch if level editor is active and not in testing mode
        if (this.levelEditor && this.levelEditor.isActive && !this.levelEditor.testingMode) {
            return;
        }
        
        // Only handle first touch
        if (this.touchActive || event.touches.length === 0) {
            return;
        }
        
        const touch = event.touches[0];
        const rect = this.canvas.getBoundingClientRect();
        const touchX = touch.clientX - rect.left;
        const touchY = touch.clientY - rect.top;
        
        // Check if touch is on UI elements (seed display, buttons, etc.)
        const uiOverlay = this.container.querySelector('#ui-overlay');
        if (uiOverlay) {
            const elementsAtPoint = document.elementsFromPoint(touch.clientX, touch.clientY);
            const isUITouch = elementsAtPoint.some(el => {
                return el !== this.canvas && 
                       el !== this.analogueStick &&
                       el !== this.analogueStickOuter &&
                       el !== this.analogueStickInner &&
                       (uiOverlay.contains(el) || el.closest('#ui-overlay'));
            });
            
            if (isUITouch) {
                return; // Don't handle touch on UI elements
            }
        }
        
        event.preventDefault();
    }
    
    handleTouchMove(event) {
        if (!this.touchActive || event.touches.length === 0) {
            return;
        }
        
        // Find the touch with matching ID
        let touch = null;
        for (let i = 0; i < event.touches.length; i++) {
            if (event.touches[i].identifier === this.touchId) {
                touch = event.touches[i];
                break;
            }
        }
        
        if (!touch) {
            return;
        }
        
        event.preventDefault();
        
        const rect = this.canvas.getBoundingClientRect();
        const touchX = touch.clientX - rect.left;
        const touchY = touch.clientY - rect.top;
        
        // Normal aiming mode - update stick and aim
        // Update stick inner circle position
        this.updateAnalogueStick(touchX, touchY);
        
        // Calculate aim position as if finger was at aim guide origin
        this.updateAimFromTouch(touchX, touchY);
    }
    
    handleTouchEnd(event) {
        if (!this.touchActive) {
            return;
        }
        
        // Check if the touch that ended matches our active touch
        let touchEnded = false;
        if (event.changedTouches) {
            for (let i = 0; i < event.changedTouches.length; i++) {
                if (event.changedTouches[i].identifier === this.touchId) {
                    touchEnded = true;
                    break;
                }
            }
        }
        
        if (!touchEnded && event.touches.length > 0) {
            // Touch still active, just update position
            return;
        }
        
        event.preventDefault();
        
        // Hide analogue stick
        this.hideAnalogueStick();
        
        // Shoot on touch release (if conditions are met)
        if (this.balls.length === 0 && this.ballsRemaining > 0) {
            // Use the current mouse position (updated by updateAimFromTouch) for shooting
            // This ensures the ball shoots in the direction of the aim guide, not the initial touch
            const rect = this.canvas.getBoundingClientRect();
            const syntheticEvent = {
                clientX: this.mouseX + rect.left,
                clientY: this.mouseY + rect.top
            };
            this.handleClick(syntheticEvent);
        }
        
        // Reset touch state
        this.touchActive = false;
        this.touchId = null;
        this.touchRocketThrust = false;
    }
    
    showAnalogueStick(x, y) {
        if (!this.analogueStick) return;
        
        const uiOverlay = this.container.querySelector('#ui-overlay');
        if (!uiOverlay) return;
        
        const overlayRect = uiOverlay.getBoundingClientRect();
        const canvasRect = this.canvas.getBoundingClientRect();
        
        // Position stick relative to canvas position within overlay
        const relativeX = x;
        const relativeY = y;
        
        this.analogueStick.style.left = `${relativeX}px`;
        this.analogueStick.style.top = `${relativeY}px`;
        this.analogueStick.classList.add('active');
        
        // Reset inner circle to center
        if (this.analogueStickInner) {
            this.analogueStickInner.style.left = '50%';
            this.analogueStickInner.style.top = '50%';
        }
    }
    
    updateAnalogueStick(touchX, touchY) {
        if (!this.analogueStick || !this.analogueStickInner) return;
        
        // Calculate offset from stick origin
        const dx = touchX - this.stickOriginX;
        const dy = touchY - this.stickOriginY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Clamp to max radius
        const clampedDistance = Math.min(distance, this.stickMaxRadius);
        const angle = Math.atan2(dy, dx);
        
        // Calculate inner circle position (relative to outer circle center)
        const offsetX = Math.cos(angle) * clampedDistance;
        const offsetY = Math.sin(angle) * clampedDistance;
        
        // Update inner circle position (50% is center, add offset)
        const outerSize = parseFloat(getComputedStyle(this.analogueStickOuter).width);
        const innerSize = parseFloat(getComputedStyle(this.analogueStickInner).width);
        const centerOffset = outerSize / 2;
        
        this.analogueStickInner.style.left = `${50 + (offsetX / outerSize) * 100}%`;
        this.analogueStickInner.style.top = `${50 + (offsetY / outerSize) * 100}%`;
    }
    
    hideAnalogueStick() {
        if (this.analogueStick) {
            this.analogueStick.classList.remove('active');
        }
    }
    
    updateAimFromTouch(touchX, touchY) {
        // Calculate offset from stick origin (in screen pixels)
        const dx = touchX - this.stickOriginX;
        const dy = touchY - this.stickOriginY;
        
        // Convert screen offset to world coordinate offset
        const rect = this.canvas.getBoundingClientRect();
        // Normalize: screen coordinates to -1 to 1 range
        const normalizedDx = (dx / rect.width) * 2;
        const normalizedDy = -(dy / rect.height) * 2; // Flip Y axis (screen Y increases down, world Y increases up)
        
        // Convert to world coordinates (camera view is 12 units wide, 9 units tall)
        const worldDx = normalizedDx * 6;
        const worldDy = normalizedDy * 4.5;
        
        // Aim guide origin in world coordinates (spawn position)
        const spawnX = 0;
        const spawnY = 3.7;
        
        // Calculate target position as if finger movement was relative to spawn position
        // This makes the aim work as if the finger was placed at the aim guide origin
        const targetX = spawnX + worldDx;
        const targetY = spawnY + worldDy;
        
        // Calculate direction from spawn to target
        let aimDx = targetX - spawnX;
        let aimDy = targetY - spawnY;
        const distance = Math.sqrt(aimDx * aimDx + aimDy * aimDy);
        
        if (distance < 0.01) {
            // Too close, don't update aim - use default straight down
            this.mouseX = rect.width / 2;
            this.mouseY = rect.height * 0.7; // Below center
            if (this.balls.length === 0 && this.ballsRemaining > 0) {
                this.updateTrajectoryGuide();
            }
            return;
        }
        
        // Calculate angle in degrees
        let angle = Math.atan2(aimDy, aimDx) * (180 / Math.PI);
        if (angle < 0) {
            angle += 360;
        }
        
        // Apply angle limits (blocked from 10° to 170°)
        const blockedStart = 10;
        const blockedEnd = 170;
        
        if (angle > blockedStart && angle < blockedEnd) {
            // Clamp to nearest boundary
            if (angle < 90) {
                angle = blockedStart;
            } else {
                angle = blockedEnd;
            }
        }
        
        // Convert clamped angle back to world coordinates
        const angleRad = angle * (Math.PI / 180);
        const clampedDx = Math.cos(angleRad);
        const clampedDy = Math.sin(angleRad);
        
        // Calculate target position at a fixed distance from spawn
        const aimDistance = 5;
        const finalTargetX = spawnX + clampedDx * aimDistance;
        const finalTargetY = spawnY + clampedDy * aimDistance;
        
        // Convert final target position back to screen coordinates for mouse position
        const finalNormalizedX = finalTargetX / 6;
        const finalNormalizedY = finalTargetY / 4.5;
        
        // Convert normalized coordinates to screen coordinates
        this.mouseX = (finalNormalizedX + 1) * rect.width / 2;
        this.mouseY = (1 - finalNormalizedY) * rect.height / 2;
        
        // Update trajectory guide
        if (this.balls.length === 0 && this.ballsRemaining > 0) {
            this.updateTrajectoryGuide();
        }
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
    
    setupPageVisibility() {
        // Pause game and mute music when page becomes hidden (browser minimized, tab switched, etc.)
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                // Page is hidden - pause game and mute music
                this.pauseGameForVisibility();
            } else {
                // Page is visible - resume game and unmute music
                this.resumeGameForVisibility();
            }
        });
        
        // Also handle page blur/focus for additional mobile browser support
        window.addEventListener('blur', () => {
            this.pauseGameForVisibility();
        });
        
        window.addEventListener('focus', () => {
            this.resumeGameForVisibility();
        });
    }
    
    pauseGameForVisibility() {
        // Don't pause if already paused by visibility
        if (this.visibilityPaused) {
            return;
        }
        
        this.visibilityPaused = true;
        
        // Pause the game
        this.gamePaused = true;
        
        // Mute all music tracks (only if music is currently playing)
        if (this.audioManager && this.audioManager.activeMusic && this.audioManager.activeMusic.loaded) {
            // Check if any track is currently playing (not muted)
            const hasUnmutedTracks = this.audioManager.activeMusic.tracks.some(track => !track.muted);
            
            if (hasUnmutedTracks) {
                this.musicMutedByVisibility = true;
                // Mute all active music tracks
                this.audioManager.activeMusic.tracks.forEach(track => {
                    if (!track.muted) {
                        this.audioManager.setMusicTrackMuted(track.name, true);
                    }
                });
            } else {
                this.musicMutedByVisibility = false;
            }
        }
    }
    
    resumeGameForVisibility() {
        // Don't resume if not paused by visibility
        if (!this.visibilityPaused) {
            return;
        }
        
        this.visibilityPaused = false;
        
        // Resume the game
        this.gamePaused = false;
        
        // Unmute music tracks only if we muted them due to visibility
        if (this.musicMutedByVisibility && this.audioManager && this.audioManager.activeMusic && this.audioManager.activeMusic.loaded) {
            // Unmute all active music tracks (restore to their previous state)
            this.audioManager.activeMusic.tracks.forEach(track => {
                if (track.muted) {
                    this.audioManager.setMusicTrackMuted(track.name, false);
                }
            });
            this.musicMutedByVisibility = false;
        }
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
            targetY = normalizedY * 4.5 + 0.5; // Slight offset to account for spawn height
        }
        
        // Calculate direction from spawn point to mouse position
        let dx = targetX - this.ballSpawnX;
        let dy = targetY - this.ballSpawnY;
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

        // No power selected, proceed with normal shot
        this.executeShot(this.ballSpawnX, this.ballSpawnY, this.ballSpawnZ, targetX, targetY, originalVelocity);

        this.activePower.onBallShot({
            spawnX: this.ballSpawnX,
            spawnY: this.ballSpawnY,
            spawnZ: this.ballSpawnZ,
            originalVelocity,
            originalVelocity,
            targetX,
            targetY
        });
    }
    
    executeShot(spawnX, spawnY, spawnZ, targetX, targetY, originalVelocity) {
        // Play shoot sound
        if (this.audioManager) {
            this.audioManager.playSound('pegShoot', { volume: 1 });
        }
        
        // Check if power is available for this shot BEFORE decrementing
        const hasPower = this.powerTurnsRemaining > 0;

        // Decrement balls remaining and update UI (unless in editor testing mode - unlimited balls)
        if (!(this.levelEditor && this.levelEditor.testingMode)) {
            this.ballsRemaining--;
            this.updateBallsRemainingUI();
        }

        // Spawn the ball (unless power overrides)
        if (!this.activePower?.overrideSpawnBall) {
            this.spawnBall(spawnX, spawnY, spawnZ, originalVelocity, originalVelocity);
            this.activePower.ballInPlay();
        }
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
    }
    
    updateTrajectoryGuide() {
        // In editor testing mode, always show trajectory guide (unlimited balls)
        const hasBallsLeft = (this.levelEditor && this.levelEditor.testingMode) || this.ballsRemaining > 0;
        // Show trajectory guide even when André's power is active (for reference)
        // Don't hide if André's power is active (user wants to see both the guide and draw)
        if (!this.trajectoryGuide || this.balls.length > 0 || !hasBallsLeft) {
            if (this.trajectoryGuide) {
                this.trajectoryGuide.visible = false;
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
            targetY = normalizedY * 4.5 + 0.5; // Slight offset to account for spawn height
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
    updateFreeBallMeter() {
        if (this.freeBallMeterFill) {
            // Calculate progress
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
    
    restartGame() {
        // Hide play again buttons
        this.activePower.onReset();
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
        if (this.powerQueue) {
            this.powerQueue = [];
        }
        this.selectedPower = null;
        
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
        
        // Reset test aim angle
        this.testAimAngle = null;
        
        // Clear all balls
        this.balls.forEach(ball => ball.remove());
        this.balls = [];
        
        // Clear all pegs
        this.pegs.forEach(peg => peg.remove());
        this.pegs = [];
        
        // Music continues playing - will restart when level loads after character selection
        
        // Update UI
        this.updateBallsRemainingUI();
        this.updateScoreUI();
        this.updateGoalUI();
        this.updateFreeBallMeter();
        this.updateOrangePegMultiplier();
        
        // Don't load level here - user must select character and click "Start Game" first
        // Level will be loaded when startGame() is called
    }
    
    restartGameWithNewSeed() {
        // Hide play again buttons
        this.activePower.onReset();
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

        if (this.powerQueue) {
            this.powerQueue = [];
        }
        this.selectedPower = null;
        
        // Reset game state (seed will be reused when user starts new game)
        this.ballsRemaining = 10;
        this.score = 0;
        this.goalProgress = 0;
        this.powerTurnsRemaining = 0;
        this.currentShotScore = 0;
        this.purplePegMultiplier = 1.0;
        this.orangePegMultiplier = 1.0;
        
        // Reset test aim angle
        this.testAimAngle = null;
        
        // Clear all balls
        this.balls.forEach(ball => ball.remove());
        this.balls = [];
        
        // Clear all pegs
        this.pegs.forEach(peg => peg.remove());
        this.pegs = [];
        
        // Music continues playing - will restart when level loads after character selection
        
        // Update UI
        this.updateBallsRemainingUI();
        this.updateScoreUI();
        this.updateGoalUI();
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
            const track2Name = this.audioManager.getTrackName(2);
            const track3Name = this.audioManager.getTrackName(3);
            const track4Name = this.audioManager.getTrackName(4);
            if (track2Name) this.audioManager.setMusicTrackMuted(track2Name, track2Muted);
            if (track3Name) this.audioManager.setMusicTrackMuted(track3Name, track3Muted);
            if (track4Name) this.audioManager.setMusicTrackMuted(track4Name, track4Muted);
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
            this.purplePeg.color = 0x4a90e2; // Update stored color
            if (this.purplePeg.mesh.material && this.purplePeg.mesh.material.uniforms) {
                // Lighten color to compensate for shader darkening
                const lightenColor = (hexColor, factor) => {
                    const r = ((hexColor >> 16) & 0xFF) * factor;
                    const g = ((hexColor >> 8) & 0xFF) * factor;
                    const b = (hexColor & 0xFF) * factor;
                    return ((Math.min(255, r) << 16) | (Math.min(255, g) << 8) | Math.min(255, b));
                };
                const lightenedColor = lightenColor(0x4a90e2, 1.3);
                this.purplePeg.mesh.material.uniforms.pegColor.value.setHex(lightenedColor);
                // Also update bounce color if it's normal (since normal uses peg color)
                if (this.purplePeg.bounceType === 'normal') {
                    this.purplePeg.mesh.material.uniforms.bounceColor.value.setHex(lightenedColor);
                }
            }
            this.purplePeg.isPurple = false;
            this.purplePeg.pointValue = 300; // Reset to base value (blue peg value)
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
        
        // Change color to purple (lighter purple for default state) - update shader uniforms
        this.purplePeg.color = 0xba55d3; // Update stored color
        if (this.purplePeg.mesh.material && this.purplePeg.mesh.material.uniforms) {
            // Lighten color to compensate for shader darkening
            const lightenColor = (hexColor, factor) => {
                const r = ((hexColor >> 16) & 0xFF) * factor;
                const g = ((hexColor >> 8) & 0xFF) * factor;
                const b = (hexColor & 0xFF) * factor;
                return ((Math.min(255, r) << 16) | (Math.min(255, g) << 8) | Math.min(255, b));
            };
            const lightenedColor = lightenColor(0xba55d3, 1.3);
            this.purplePeg.mesh.material.uniforms.pegColor.value.setHex(lightenedColor);
            // Also update bounce color if it's normal (since normal uses peg color)
            if (this.purplePeg.bounceType === 'normal') {
                this.purplePeg.mesh.material.uniforms.bounceColor.value.setHex(lightenedColor);
            }
        }
    }

    spawnBall(x, y, z, velocity = null, originalVelocity = null, isYellow = false, isQuillShot = false, isRocket = false, isI8 = false) {
        if(this.activePower.onBallShot.overrideSpawnBall) {
            return;
        }
        const ballMaterial = this.physicsWorld.getBallMaterial();
        const ball = new Ball(this, this.scene, this.physicsWorld, { x, y, z }, velocity, ballMaterial, isYellow);
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
        // Track if this ball used power (so we know to decrement when destroyed)
        ball.usedPower = this.powerTurnsRemaining > 0;
        // Track if this is a quill shot ball
        ball.isQuillShot = isQuillShot;
        ball.lastQuillShotTime = isQuillShot ? performance.now() / 1000 : 0;
        
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
                
                // Get type, size, and bounceType from level data, default to round base normal if not specified
                const pegType = pegData.type || 'round';
                const pegSize = pegData.size || 'base';
                const pegBounceType = pegData.bounceType || 'normal';
                
                const peg = new Peg(
                    this,
                    this.scene,
                    this.physicsWorld,
                    { x: roundedX, y: roundedY, z: 0 },
                    baseColor,
                    pegMaterial,
                    pegType,
                    pegSize,
                    pegBounceType
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
                    // Change color to green - update shader uniforms
                    peg.color = 0x32cd32; // Update stored color
                    if (peg.mesh.material && peg.mesh.material.uniforms) {
                        // Lighten color to compensate for shader darkening
                        const lightenColor = (hexColor, factor) => {
                            const r = ((hexColor >> 16) & 0xFF) * factor;
                            const g = ((hexColor >> 8) & 0xFF) * factor;
                            const b = (hexColor & 0xFF) * factor;
                            return ((Math.min(255, r) << 16) | (Math.min(255, g) << 8) | Math.min(255, b));
                        };
                        const lightenedColor = lightenColor(0x32cd32, 1.3);
                        peg.mesh.material.uniforms.pegColor.value.setHex(lightenedColor);
                        // Also update bounce color if it's normal (since normal uses peg color)
                        if (peg.bounceType === 'normal') {
                            peg.mesh.material.uniforms.bounceColor.value.setHex(lightenedColor);
                        }
                    }
                });
                
                // Select 25 orange pegs from remaining indices (skip the 2 green ones)
                const orangeIndices = indices.slice(2, 27);
                orangeIndices.forEach(i => {
                    const peg = this.pegs[i];
                    peg.isOrange = true;
                    peg.pointValue = 500;
                    // Change color to orange - update shader uniforms
                    peg.color = 0xff8c00; // Update stored color
                    if (peg.mesh.material && peg.mesh.material.uniforms) {
                        // Lighten color to compensate for shader darkening
                        const lightenColor = (hexColor, factor) => {
                            const r = ((hexColor >> 16) & 0xFF) * factor;
                            const g = ((hexColor >> 8) & 0xFF) * factor;
                            const b = (hexColor & 0xFF) * factor;
                            return ((Math.min(255, r) << 16) | (Math.min(255, g) << 8) | Math.min(255, b));
                        };
                        const lightenedColor = lightenColor(0xff8c00, 1.3);
                        peg.mesh.material.uniforms.pegColor.value.setHex(lightenedColor);
                        // Also update bounce color if it's normal (since normal uses peg color)
                        if (peg.bounceType === 'normal') {
                            peg.mesh.material.uniforms.bounceColor.value.setHex(lightenedColor);
                        }
                    }
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
                const track1Name = this.audioManager.getTrackName(1);
                const track2Name = this.audioManager.getTrackName(2);
                const track3Name = this.audioManager.getTrackName(3);
                const track4Name = this.audioManager.getTrackName(4);
                if (track1Name) this.audioManager.setMusicTrackMuted(track1Name, false);
                if (track2Name) this.audioManager.setMusicTrackMuted(track2Name, true);
                if (track3Name) this.audioManager.setMusicTrackMuted(track3Name, true);
                if (track4Name) this.audioManager.setMusicTrackMuted(track4Name, true);
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
                    
                    if (isBall) {
                        const contactKey = `${Math.min(bodyA.id, bodyB.id)}-${Math.max(bodyA.id, bodyB.id)}`;
                        
                        if (!this.processedContacts.has(contactKey)) {
                            const peg = this.pegs.find(p => p.body === bodyA || p.body === bodyB);
                            const ball = this.balls.find(b => b.body === bodyA || b.body === bodyB);
                            
                            this.processedContacts.add(contactKey);
                            this.handleCollision(bodyA, bodyB);
                        }
                    }
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
                const peg = isPeg ? this.pegs.find(p => p.body === bodyA || p.body === bodyB) : null;
                const ball = isBall ? this.balls.find(b => b.body === bodyA || b.body === bodyB) : null;
                
                // Create a unique key for this contact pair
                const contactKey = `${Math.min(bodyA.id, bodyB.id)}-${Math.max(bodyA.id, bodyB.id)}`;
                
                // Only process if not already processed this frame (prevents race condition with checkCollisions)
                if (!this.processedContacts.has(contactKey)) {
                    this.processedContacts.add(contactKey);
                    this.handleCollision(bodyA, bodyB);
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
    
    handleCollision(bodyA, bodyB) {
        // Find the ball or bomb involved - try reference match first, then ID match as fallback
        let ball = this.balls.find(b => b.body === bodyA || b.body === bodyB);
        
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
        
        // Check for ball-characteristic collision
        const characteristic = this.characteristics.find(c => c.body === bodyA || c.body === bodyB);
        
        // Process characteristic collision logic BEFORE peg collision (if both exist, peg takes priority)
        if (characteristic && ball && !peg) {
            try {
                // Fix collisions for rectangular/circular characteristics to prevent collision loss
                // For rectangular: normalize corner collisions to use only one face
                // For circular: handle large ball overlap to prevent physics confusion
                // This must be done BEFORE clampBallVelocity to override physics response
                // DISABLED: Testing behavior without normalizers
                let collisionNormalized = false;
                // if (ball.body) {
                //     if (characteristic.shape === 'rect') {
                //         collisionNormalized = this.normalizeCornerCollisionCharacteristic(ball, characteristic);
                //     } else if (characteristic.shape === 'circle') {
                //         collisionNormalized = this.normalizeRoundCharacteristicCollision(ball, characteristic);
                //     }
                // }
                
                // Clamp velocity after characteristic collision (unless collision was normalized, which already handled velocity)
                // if (!collisionNormalized) {
                    this.clampBallVelocity(ball);
                // }
            } catch (error) {
                console.error('[Game] Error handling characteristic collision:', error);
            }
        }
        
        // Process peg collision logic IMMEDIATELY if it's a ball-peg collision
        if (peg && ball) {
            try {
                // Fix collisions for rectangular/dome/round pegs to prevent collision loss
                // For rectangular/dome: normalize corner collisions to use only one face
                // For round: handle large ball overlap to prevent physics confusion
                // This must be done BEFORE clampBallVelocity to override physics response
                // DISABLED: Testing behavior without normalizers
                let collisionNormalized = false;
                // if (ball.body) {
                //     if (peg.type === 'rect' || peg.type === 'dome') {
                //         collisionNormalized = this.normalizeCornerCollision(ball, peg);
                //     } else if (peg.type === 'round') {
                //         collisionNormalized = this.normalizeRoundPegCollision(ball, peg);
                //     }
                // }
                
                // Clamp velocity after peg collision (unless collision was normalized, which already handled velocity)
                // if (!collisionNormalized) {
                    this.clampBallVelocity(ball);
                // }

                this.activePower.onPegHit(peg, ball);
                
                // Check if this is a new hit (peg not already hit)
                const isNewHit = !peg.hit;
                const wasAlreadyTracked = ball.hitPegs.includes(peg);
            
            // ALWAYS handle peg hit if it's new (even if already tracked, we need to ensure onHit is called)
            // The onHit() method itself checks if already hit, so it's safe to call
            if (isNewHit) {
                try {
                    peg.onHit(ball);
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
                const isPurplePeg = peg === this.purplePeg;

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
            // Also ensure collisionResponse is always enabled (safety check for collision bugs)
            this.balls.forEach(ball => {
                this.roundVec3(ball.body.position);
                this.roundVec3(ball.body.velocity);
                
                // Safety check: Ensure collisionResponse is always enabled
                // This prevents the ball from phasing through objects after collisions
                if (ball.body && ball.body.collisionResponse === false) {
                    ball.body.collisionResponse = true;
                }
                
                // Ensure body is awake (not sleeping)
                if (ball.body && ball.body.sleepState !== 0) {
                    ball.body.wakeUp();
                }
            });

            if (this.activePower.powerActive){
                this.activePower.update(currentTime, roundedDeltaTime / 1000); // Convert to seconds
            }
            
            // Update emoji effects
            this.activePower.onAnimate(currentTime, roundedDeltaTime);
            
            // Update bucket
            if (this.bucket) {
                this.bucket.update(deltaTime / 1000); // Convert to seconds
            }
            
            // Update all balls
            // Get current time once for all ball updates (in seconds)
            const currentTimeSeconds = performance.now() / 1000;
            
            // Update all balls
            this.balls.forEach(ball => {
                ball.update();
            });
            
            this.balls.forEach(ball => {
                ball.update();
                
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
                // 5-second check: If ball hasn't hit a NEW peg in 5 seconds, it's stuck (or 2 seconds if Arkanoid active)
                const stuckTimerDuration = this.ballResetTime;
                const spawnCheckPassed = timeSinceSpawn >= stuckTimerDuration;
                
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
            } else if (ballsToRemove.length > 0) {
                // Some balls were removed but others remain - just clean up visuals, don't remove pegs
                ballsToRemove.forEach(ball => {
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
                
                // Reassign purple peg (previous one will turn blue if not hit)
                this.assignPurplePeg();
                
                // Check if game is over (no balls left or all orange pegs cleared)
                this.checkGameOver();

                this.activePower.onBallOutOfPlay();
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

    /**
     * Normalize corner collisions for rectangular/dome pegs
     * When a ball hits a corner (multiple faces), calculate which face is primary
     * and adjust velocity to only reflect off that face to prevent physics confusion
     */
    /**
     * Normalize corner collisions for rectangular/dome pegs
     * When a ball hits a corner (multiple faces), calculate which face is primary
     * and adjust velocity to only reflect off that face to prevent physics confusion
     * Returns true if corner collision was normalized (velocity was adjusted)
     */
    normalizeCornerCollision(ball, peg) {
        if (!ball || !ball.body || !peg || !peg.body) return false;
        
        const ballPos = ball.body.position;
        const ballVel = ball.body.velocity;
        const pegPos = peg.body.position;
        
        // Calculate relative position
        const relX = ballPos.x - pegPos.x;
        const relY = ballPos.y - pegPos.y;
        
        // Get peg dimensions
        const height = peg.actualSize * 2;
        const width = height * 2; // 2:1 aspect ratio
        const halfWidth = width / 2;
        const halfHeight = height / 2;
        
        // Determine which face the ball is primarily hitting based on approach angle
        // Use velocity direction to determine primary face (not just position)
        const velX = ballVel.x;
        const velY = ballVel.y;
        const velMag = Math.sqrt(velX * velX + velY * velY);
        
        if (velMag < 0.01) return false; // Too slow, skip
        
        // Normalize velocity to get direction
        const velDirX = velX / velMag;
        const velDirY = velY / velMag;
        
        // Calculate which face is primary based on velocity direction
        // If velocity is more horizontal, use vertical face (left/right)
        // If velocity is more vertical, use horizontal face (top/bottom)
        const absVelX = Math.abs(velDirX);
        const absVelY = Math.abs(velDirY);
        
        let primaryNormalX = 0;
        let primaryNormalY = 0;
        
        if (absVelX > absVelY) {
            // More horizontal velocity - use left/right face
            if (velDirX < 0) {
                // Moving left, hit right face
                primaryNormalX = 1;
                primaryNormalY = 0;
            } else {
                // Moving right, hit left face
                primaryNormalX = -1;
                primaryNormalY = 0;
            }
        } else {
            // More vertical velocity - use top/bottom face
            if (velDirY < 0) {
                // Moving down, hit top face
                primaryNormalX = 0;
                primaryNormalY = 1;
            } else {
                // Moving up, hit bottom face
                primaryNormalX = 0;
                primaryNormalY = -1;
            }
        }
        
        // Check if ball is near a corner (within corner threshold)
        const cornerThreshold = Math.min(halfWidth, halfHeight) * 0.4; // 40% of smaller dimension
        const distFromCornerX = Math.abs(Math.abs(relX) - halfWidth);
        const distFromCornerY = Math.abs(Math.abs(relY) - halfHeight);
        const isNearCorner = distFromCornerX < cornerThreshold && distFromCornerY < cornerThreshold;
        
        if (!isNearCorner) return false; // Not a corner collision, let physics handle it normally
        
        // If near corner, apply normalized bounce using only primary face
        // Calculate reflection using only the primary face normal
        // This prevents physics confusion from multiple simultaneous face contacts
        const dot = velX * primaryNormalX + velY * primaryNormalY;
        const reflectX = velX - 2 * dot * primaryNormalX;
        const reflectY = velY - 2 * dot * primaryNormalY;
        
        // Apply restitution (bounciness) - get from contact material or use default
        const restitution = 0.875; // Default bounce
        ball.body.velocity.x = reflectX * restitution;
        ball.body.velocity.y = reflectY * restitution;
        
        // Ensure body is awake and collision response is enabled
        ball.body.wakeUp();
        ball.body.collisionResponse = true;
        
        return true; // Collision was normalized
    }

    /**
     * Normalize round peg collisions when ball is large
     * Large balls can overlap significantly with round pegs, causing physics confusion
     * This ensures proper collision response even when ball is much larger than peg
     */
    normalizeRoundPegCollision(ball, peg) {
        if (!ball || !ball.body || !peg || !peg.body) return false;
        
        // Only normalize for large balls (i8 power or other large ball scenarios)
        const ballRadius = ball.currentRadius || ball.body.shapes[0]?.radius || 0.1;
        const pegRadius = peg.actualSize;
        
        // Check if ball is significantly larger than peg (could cause overlap issues)
        if (ballRadius <= pegRadius * 1.5) return false; // Normal size, let physics handle it
        
        const ballPos = ball.body.position;
        const ballVel = ball.body.velocity;
        const pegPos = peg.body.position;
        
        // Calculate relative position and distance
        const relX = ballPos.x - pegPos.x;
        const relY = ballPos.y - pegPos.y;
        const distance = Math.sqrt(relX * relX + relY * relY);
        const minDistance = ballRadius + pegRadius;
        
        // Check if ball is overlapping or very close to peg (within 5% of min distance)
        const overlapThreshold = minDistance * 0.05;
        const isOverlapping = distance < minDistance + overlapThreshold;
        
        if (!isOverlapping) return false; // Not overlapping, let physics handle it normally
        
        // Calculate collision normal (from peg center to ball center)
        if (distance < 0.001) return false; // Too close, can't determine direction
        
        const normalX = relX / distance;
        const normalY = relY / distance;
        
        // Calculate reflection using the normal
        const velX = ballVel.x;
        const velY = ballVel.y;
        const dot = velX * normalX + velY * normalY;
        
        // Only reflect if ball is moving towards peg (negative dot product)
        if (dot >= 0) return false; // Moving away, let physics handle it
        
        // Calculate reflection
        const reflectX = velX - 2 * dot * normalX;
        const reflectY = velY - 2 * dot * normalY;
        
        // Apply restitution (bounciness)
        const restitution = 0.875; // Default bounce
        ball.body.velocity.x = reflectX * restitution;
        ball.body.velocity.y = reflectY * restitution;
        
        // Push ball out of overlap if needed
        if (distance < minDistance) {
            const overlap = minDistance - distance;
            const pushX = normalX * overlap * 1.1; // 1.1 for safety margin
            const pushY = normalY * overlap * 1.1;
            ball.body.position.x += pushX;
            ball.body.position.y += pushY;
        }
        
        // Ensure body is awake and collision response is enabled
        ball.body.wakeUp();
        ball.body.collisionResponse = true;
        
        return true; // Collision was normalized
    }

    /**
     * Normalize corner collisions for rectangular characteristics
     * Similar to normalizeCornerCollision for pegs, but adapted for characteristics
     */
    normalizeCornerCollisionCharacteristic(ball, characteristic) {
        if (!ball || !ball.body || !characteristic || !characteristic.body) return false;
        
        const ballPos = ball.body.position;
        const ballVel = ball.body.velocity;
        const charPos = characteristic.body.position;
        
        // Calculate relative position
        const relX = ballPos.x - charPos.x;
        const relY = ballPos.y - charPos.y;
        
        // Get characteristic dimensions
        const halfWidth = characteristic.size.width / 2;
        const halfHeight = characteristic.size.height / 2;
        
        // Account for rotation
        const cos = Math.cos(characteristic.rotation);
        const sin = Math.sin(characteristic.rotation);
        
        // Transform relative position to local coordinate system
        const localX = relX * cos + relY * sin;
        const localY = -relX * sin + relY * cos;
        
        // Determine which face the ball is primarily hitting based on approach angle
        // Use velocity direction to determine primary face (not just position)
        const velX = ballVel.x;
        const velY = ballVel.y;
        const velMag = Math.sqrt(velX * velX + velY * velY);
        
        if (velMag < 0.01) return false; // Too slow, skip
        
        // Normalize velocity to get direction
        const velDirX = velX / velMag;
        const velDirY = velY / velMag;
        
        // Transform velocity to local coordinate system
        const localVelX = velDirX * cos + velDirY * sin;
        const localVelY = -velDirX * sin + velDirY * cos;
        
        // Calculate which face is primary based on velocity direction
        const absVelX = Math.abs(localVelX);
        const absVelY = Math.abs(localVelY);
        
        let primaryNormalX = 0;
        let primaryNormalY = 0;
        
        if (absVelX > absVelY) {
            // More horizontal velocity - use left/right face
            if (localVelX < 0) {
                // Moving left, hit right face
                primaryNormalX = 1;
                primaryNormalY = 0;
            } else {
                // Moving right, hit left face
                primaryNormalX = -1;
                primaryNormalY = 0;
            }
        } else {
            // More vertical velocity - use top/bottom face
            if (localVelY < 0) {
                // Moving down, hit top face
                primaryNormalX = 0;
                primaryNormalY = 1;
            } else {
                // Moving up, hit bottom face
                primaryNormalX = 0;
                primaryNormalY = -1;
            }
        }
        
        // Transform normal back to world coordinates
        const worldNormalX = primaryNormalX * cos - primaryNormalY * sin;
        const worldNormalY = primaryNormalX * sin + primaryNormalY * cos;
        
        // Check if ball is near a corner (within corner threshold)
        const cornerThreshold = Math.min(halfWidth, halfHeight) * 0.4; // 40% of smaller dimension
        const distFromCornerX = Math.abs(Math.abs(localX) - halfWidth);
        const distFromCornerY = Math.abs(Math.abs(localY) - halfHeight);
        const isNearCorner = distFromCornerX < cornerThreshold && distFromCornerY < cornerThreshold;
        
        if (!isNearCorner) return false; // Not a corner collision, let physics handle it normally
        
        // If near corner, apply normalized bounce using only primary face
        const dot = velX * worldNormalX + velY * worldNormalY;
        const reflectX = velX - 2 * dot * worldNormalX;
        const reflectY = velY - 2 * dot * worldNormalY;
        
        // Apply restitution (bounciness) - get from contact material or use default
        const restitution = 0.875; // Default bounce
        ball.body.velocity.x = reflectX * restitution;
        ball.body.velocity.y = reflectY * restitution;
        
        // Ensure body is awake and collision response is enabled
        ball.body.wakeUp();
        ball.body.collisionResponse = true;
        
        return true; // Collision was normalized
    }

    /**
     * Normalize round characteristic collisions when ball is large
     * Similar to normalizeRoundPegCollision, but adapted for characteristics
     */
    normalizeRoundCharacteristicCollision(ball, characteristic) {
        if (!ball || !ball.body || !characteristic || !characteristic.body) return false;
        
        const ballPos = ball.body.position;
        const ballRadius = ball.currentRadius || ball.body.shapes[0]?.radius || 0.1;
        const charPos = characteristic.body.position;
        
        // Get characteristic radius
        let charRadius = 0.5; // Default
        if (characteristic.size && typeof characteristic.size === 'object') {
            if (typeof characteristic.size.radius === 'number' && !isNaN(characteristic.size.radius) && characteristic.size.radius > 0) {
                charRadius = characteristic.size.radius;
            } else if (typeof characteristic.size.width === 'number' && !isNaN(characteristic.size.width) && characteristic.size.width > 0) {
                charRadius = characteristic.size.width / 2;
            }
        }
        
        // Calculate distance between centers
        const dx = ballPos.x - charPos.x;
        const dy = ballPos.y - charPos.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // If ball is not overlapping or is too far, let physics handle
        if (distance >= ballRadius + charRadius) return false;
        
        // Only normalize for large balls (i8 power or other large ball scenarios)
        // For normal-sized balls, let physics handle it
        if (ballRadius <= charRadius * 1.5) return false;
        
        // Calculate overlap depth
        const overlap = (ballRadius + charRadius) - distance;
        
        // If there's overlap, push the ball out
        if (overlap > 0) {
            // Calculate normalized collision normal (from characteristic center to ball center)
            const normalX = dx / distance;
            const normalY = dy / distance;
            
            // Adjust ball position to resolve overlap
            ball.body.position.x += normalX * overlap;
            ball.body.position.y += normalY * overlap;
            
            // Calculate reflection using the normal
            const ballVel = ball.body.velocity;
            const dot = ballVel.x * normalX + ballVel.y * normalY;
            const reflectX = ballVel.x - 2 * dot * normalX;
            const reflectY = ballVel.y - 2 * dot * normalY;
            
            // Apply restitution (bounciness)
            const restitution = 0.875; // Default bounce
            ball.body.velocity.x = reflectX * restitution;
            ball.body.velocity.y = reflectY * restitution;
            
            // Ensure body is awake and collision response is enabled
            ball.body.wakeUp();
            ball.body.collisionResponse = true;
            
            return true; // Collision was normalized
        }
        return false;
    }

    /**
     * Remove nearby already-hit pegs from the removal queue when i8 ball is in auto-remove state
     * This prevents the queue from breaking and ensures all nearby hit pegs are removed immediately
     */
    removeNearbyHitPegsFromQueue(ball, centerPosition) {
        if (!ball || !ball.isI8 || ball.currentRadius < ball.originalRadius * 1.5) return;
        if (!ball.pegsToRemove || ball.pegsToRemove.length === 0) return;
        
        const checkRadius = ball.currentRadius * 2; // Check within 2x ball radius
        const centerX = centerPosition.x;
        const centerY = centerPosition.y;
        
        // Find nearby already-hit pegs that are in the removal queue
        const pegsToRemove = [];
        for (const peg of ball.pegsToRemove) {
            if (!peg || !peg.body || !peg.hit) continue;
            
            const pegPos = peg.body.position;
            const dx = pegPos.x - centerX;
            const dy = pegPos.y - centerY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance <= checkRadius) {
                pegsToRemove.push(peg);
            }
        }
        
        // Remove found pegs from the game and queue
        for (const peg of pegsToRemove) {
            const pegIndex = this.pegs.indexOf(peg);
            if (pegIndex !== -1) {
                peg.remove();
                this.pegs.splice(pegIndex, 1);
            }
            
            // Remove from ball's hitPegs array if present
            const ballPegIndex = ball.hitPegs.indexOf(peg);
            if (ballPegIndex !== -1) {
                ball.hitPegs.splice(ballPegIndex, 1);
            }
            
            // Remove from removal queue
            const queueIndex = ball.pegsToRemove.indexOf(peg);
            if (queueIndex !== -1) {
                ball.pegsToRemove.splice(queueIndex, 1);
                // Adjust removal index if we removed a peg that was before the current index
                if (queueIndex < ball.pegRemoveIndex) {
                    ball.pegRemoveIndex--;
                }
            }
        }
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
        
        // Clean up Three.js resources
        if (this.renderer) {
            this.renderer.dispose();
        }
    }
}

