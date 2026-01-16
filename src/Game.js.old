import * as THREE from 'three';
import { PhysicsWorld } from './physics/PhysicsWorld.js';
import { Ball } from './entities/Ball.js';
import { Peg } from './entities/Peg.js';
import { Wall } from './entities/Wall.js';
import { Bucket } from './entities/Bucket.js';
import { Bomb } from './entities/Bomb.js';
import { LevelLoader } from './utils/LevelLoader.js';
import { LuckyClover } from './utils/LuckyClover.js';
import { EmojiEffect } from './utils/EmojiEffect.js';
import { SeededRNG } from './utils/SeededRNG.js';

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
        
        // UI elements
        this.ballsRemainingElement = container.querySelector('#balls-remaining');
        this.scoreElement = container.querySelector('#score');
        this.goalElement = container.querySelector('#goal');
        this.powerTurnsElement = container.querySelector('#power-turns');
        this.freeBallMeterFill = container.querySelector('#free-ball-meter-fill');
        this.multiplierTrackerFill = container.querySelector('#multiplier-tracker-fill');
        this.multiplierValue = container.querySelector('#multiplier-value');
        this.playAgainButton = container.querySelector('#play-again-button');
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
        
        // Trajectory guide
        this.trajectoryGuide = null;
        this.mouseX = 0;
        this.mouseY = 0;
        
        // Character system
        this.selectedCharacter = null;
        this.characters = [
            {
                id: 'petar',
                name: 'Petar the Leprechaun',
                power: 'Lucky Clover',
                powerDescription: 'Every 3rd peg hit bounces the ball with 75% of original shot momentum'
            },
            {
                id: 'john',
                name: 'John, the Gunner',
                power: 'Roulette Power',
                powerDescription: 'Green pegs trigger a roulette with 3 random powers: Spread Shot, Rapid Shot, or Explosion'
            }
        ];
        
        // John the Gunner power system
        this.gamePaused = false;
        this.rouletteActive = false;
        this.selectedPower = null; // 'spread', 'rapid', or 'explosion'
        this.rapidShotQueue = []; // Queue for rapid shot balls
        this.rapidShotDelay = 0.3; // Delay between rapid shots (seconds)
        this.lastRapidShotTime = 0;
        
        // Perks
        this.luckyClover = new LuckyClover();
        this.luckyCloverEnabled = false; // Disabled by default, enabled by green pegs
        
        // Seeded RNG system - will be initialized in startGame() after seed input is checked
        this.rng = null;
        this.currentSeed = null;
        
        // Testing controls
        this.testAimAngle = null; // Set by number keys 1-6
        
        // Click handling
        this.setupClickHandler();
        
        // Set up keyboard controls for testing
        this.setupKeyboardControls();
        
        // Set up character selector
        this.setupCharacterSelector();
        
        // Set up copy seed button
        if (this.copySeedButton) {
            this.copySeedButton.addEventListener('click', () => {
                this.copySeedToClipboard();
            });
        }
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
                console.error('Failed to copy seed:', err);
            });
        }
    }
    
    updateSeedDisplay() {
        if (this.seedValueElement && this.currentSeed !== null) {
            this.seedValueElement.textContent = this.currentSeed;
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
                console.warn(`Invalid seed value: "${seedValue}", generating new seed`);
                seed = Date.now();
            } else {
                console.log(`Using provided seed: ${seed}`);
            }
        } else {
            // Generate new seed
            seed = Date.now();
            console.log(`No seed provided, generating new seed: ${seed}`);
        }
        
        // Initialize RNG with seed
        this.currentSeed = seed;
        this.rng = new SeededRNG(seed);
        console.log(`🎲 Game seed: ${seed}`);
        
        // Update seed display
        this.updateSeedDisplay();
        
        // Hide character selector
        const characterSelector = document.querySelector('#character-selector');
        if (characterSelector) {
            characterSelector.style.display = 'none';
        }
        
        // Initialize game components
        this.init();
    }

    async init() {
        console.log('Game initializing...');
        this.setupScene();
        this.setupRenderer();
        this.setupCamera();
        this.setupPhysics();
        this.setupLighting();
        this.setupResizeHandler();
        
        // Initialize emoji effects (needs scene, camera, renderer)
        this.emojiEffect = new EmojiEffect(this.scene, this.camera, this.renderer);
        
        // Initialize emoji effects (needs scene, camera, renderer)
        this.emojiEffect = new EmojiEffect(this.scene, this.camera, this.renderer);
        
        // Load level
        await this.loadLevel('/levels/level1.json');
        
        // Initialize UI
        this.updateBallsRemainingUI();
        this.updateScoreUI();
        this.updateGoalUI();
        this.updatePowerTurnsUI();
        
        // Hide play again button initially
        this.hidePlayAgainButton();
        
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
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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
        
        console.log('=== CREATING WALL ENTITIES ===');
        console.log('Left:', left, 'Right:', right, 'Ceiling:', top);
        
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
        
        console.log('Created', this.walls.length, 'wall entities');
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
        
        this.canvas.addEventListener('click', (event) => {
            this.handleClick(event);
        });
    }
    
    setupKeyboardControls() {
        // Keyboard controls for testing
        window.addEventListener('keydown', (event) => {
            // Number keys 1-6: Set test aim angles
            if (event.key >= '1' && event.key <= '6') {
                const keyNum = parseInt(event.key, 10);
                this.setTestAimAngle(keyNum);
            }
            
            // Space key: Shoot
            if (event.key === ' ') {
                event.preventDefault(); // Prevent page scroll
                this.handleKeyboardShoot();
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
        console.log(`🎯 Test aim angle set to ${this.testAimAngle}° (key ${keyNum})`);
        
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
        // Check if there's an active bomb to manually detonate
        if (this.bombs && this.bombs.length > 0 && this.balls.length === 0) {
            // Manually detonate the first active bomb
            const bomb = this.bombs[0];
            if (bomb && !bomb.exploded) {
                this.explodeBomb(bomb);
                return; // Don't shoot a new ball after detonating
            }
        }
        
        // Don't allow firing if there's already an active ball
        if (this.balls.length > 0) {
            return;
        }
        
        // Don't allow firing if no balls remaining
        if (this.ballsRemaining <= 0) {
            return;
        }
        
        // Get target position - use test aim angle if set, otherwise use mouse position
        let targetX, targetY;
        let mouseX, mouseY, normalizedX, normalizedY; // Declare these outside for console.log
        
        if (this.testAimAngle !== null) {
            // Use test aim angle (from keyboard)
            const angleRad = this.testAimAngle * (Math.PI / 180);
            const distance = 5; // Distance from spawn point for aiming
            targetX = Math.cos(angleRad) * distance;
            targetY = Math.sin(angleRad) * distance;
            // Clear test aim angle after use
            this.testAimAngle = null;
            // Set defaults for console.log
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
        let angle = Math.atan2(dy, dx) * (180 / Math.PI);
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
        const angleRad = angle * (Math.PI / 180);
        const clampedDx = Math.cos(angleRad);
        const clampedDy = Math.sin(angleRad);
        
        // Normalize direction and apply speed
        const speed = this.ballShotSpeed;
        let velocityX = clampedDx * speed;
        let velocityY = clampedDy * speed;
        
        // Round initial velocity to 3 decimals for determinism
        velocityX = this.roundToDecimals(velocityX);
        velocityY = this.roundToDecimals(velocityY);
        
        const originalVelocity = { x: velocityX, y: velocityY, z: 0 };
        
        console.log('🎯 SHOOTING BALL:', { 
            mouseX: mouseX !== null ? mouseX.toFixed(2) : 'N/A (keyboard)', 
            mouseY: mouseY !== null ? mouseY.toFixed(2) : 'N/A (keyboard)',
            normalizedX: normalizedX !== null ? normalizedX.toFixed(3) : 'N/A (keyboard)', 
            normalizedY: normalizedY !== null ? normalizedY.toFixed(3) : 'N/A (keyboard)',
            targetX: targetX.toFixed(3), 
            targetY: targetY.toFixed(3), 
            spawnX, 
            spawnY,
            dx: dx.toFixed(3), 
            dy: dy.toFixed(3), 
            distance: distance.toFixed(3),
            velocityX: velocityX.toFixed(3), 
            velocityY: velocityY.toFixed(3)
        });
        
        // Reset lucky clover for new ball
        this.luckyClover.reset();
        
        // Reset purple peg multiplier
        this.purplePegMultiplier = 1.0;
        
        // Set lucky clover active state for this ball (from previous green peg hit)
        // This will be set when the ball is spawned
        
        // Hide trajectory guide when shooting
        this.hideTrajectoryGuide();
        
        // Check if John's power is active
        if (this.selectedCharacter && this.selectedCharacter.id === 'john' && this.selectedPower) {
            if (this.selectedPower === 'spread') {
                // Spread shot: 3 balls at +15°, 0°, -15°
                this.spawnSpreadShot(spawnX, spawnY, spawnZ, targetX, targetY);
                this.selectedPower = null; // Consume power
            } else if (this.selectedPower === 'rapid') {
                // Rapid shot: initial shot + 2 more in succession
                // Only decrement ball count once
                this.ballsRemaining--;
                this.updateBallsRemainingUI();
                
                // Fire initial shot (white ball)
                this.spawnBall(spawnX, spawnY, spawnZ, originalVelocity, originalVelocity, false);
                
                // Queue 2 more shots (yellow balls)
                if (!this.rapidShotQueue) {
                    this.rapidShotQueue = [];
                }
                this.rapidShotQueue.push({
                    spawnX, spawnY, spawnZ,
                    targetX, targetY,
                    originalVelocity
                });
                this.rapidShotQueue.push({
                    spawnX, spawnY, spawnZ,
                    targetX, targetY,
                    originalVelocity
                });
                this.lastRapidShotTime = performance.now() / 1000;
                this.selectedPower = null; // Consume power
            } else if (this.selectedPower === 'explosion') {
                // Explosion: spawn bomb
                this.spawnBomb(spawnX, spawnY, spawnZ, originalVelocity);
                this.selectedPower = null; // Consume power
            }
        } else {
            // Normal shot
            // Decrement balls remaining and update UI
            this.ballsRemaining--;
            this.updateBallsRemainingUI();
            
            this.spawnBall(spawnX, spawnY, spawnZ, originalVelocity, originalVelocity, false);
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
        
        // Only decrement ball count once for spread shot
        this.ballsRemaining--;
        this.updateBallsRemainingUI();
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
        
        // Decrement ball count
        this.ballsRemaining--;
        this.updateBallsRemainingUI();
    }
    
    explodeBomb(bomb) {
        if (!bomb || bomb.exploded) return;
        
        bomb.explode();
        const bombPos = bomb.body.position;
        const explosionRadius = 1.5;
        
        console.log('💣 Bomb exploded at:', bombPos, 'radius:', explosionRadius);
        
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
            explosionHitPegs.push(peg); // Track for removal
            
            // Add score for purple peg (before multiplier is activated)
            const totalMultiplierBefore = this.orangePegMultiplier * this.purplePegMultiplier;
            const purplePoints = 2000;
            const finalPoints = Math.floor(purplePoints * totalMultiplierBefore);
            this.score += finalPoints;
            this.currentShotScore += finalPoints;
            
            // Activate 1.25x multiplier for following pegs
            this.purplePegMultiplier = 1.25;
            console.log('💜 Purple peg hit by explosion! 1.25x multiplier activated');
            
            // Update UI
            this.updateScoreUI();
            this.updateFreeBallMeter();
            this.updateOrangePegMultiplier();
            
            // Ensure purple peg color changes to darker shade
            peg.mesh.material.color.setHex(0x9370db); // Medium purple (darker when hit)
            
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
        
        console.log('💣 Bomb converted to regular ball');
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
        if (!this.trajectoryGuide || this.balls.length > 0 || this.ballsRemaining <= 0) {
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
            this.ballsRemainingElement.textContent = `Balls: ${this.ballsRemaining}`;
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
        const noBallsLeft = this.ballsRemaining <= 0 && this.balls.length === 0;
        const allOrangePegsCleared = this.goalProgress >= this.goalTarget;
        
        if (noBallsLeft || allOrangePegsCleared) {
            this.showPlayAgainButton();
        } else {
            this.hidePlayAgainButton();
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
            
            currentIndex = (currentIndex + 1) % options.length;
            cycleCount++;
            
            // After cycling, randomly select one
            if (cycleCount >= totalCycles) {
                clearInterval(rouletteInterval);
                
                // Random selection
                const selectedIndex = this.rng.randomInt(0, options.length);
                this.selectedPower = options[selectedIndex];
                
                // Highlight selected option briefly
                document.querySelectorAll('.roulette-option').forEach(opt => {
                    opt.classList.remove('highlighted');
                });
                const selectedOption = document.querySelector(`#roulette-${options[selectedIndex]}`);
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
                    
                    // Store power for next shot
                    console.log(`🎰 Power selected: ${this.selectedPower}`);
                }, 1000);
            }
        }, cycleInterval);
    }
    
    restartGame() {
        // Hide play again button
        this.hidePlayAgainButton();
        
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
        
        // Reset John's power system
        this.gamePaused = false;
        this.rouletteActive = false;
        this.selectedPower = null;
        this.rapidShotQueue = [];
        this.lastRapidShotTime = 0;
        
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
        
        // Update UI
        this.updateBallsRemainingUI();
        this.updateScoreUI();
        this.updateGoalUI();
        this.updatePowerTurnsUI();
        this.updateFreeBallMeter();
        this.updateOrangePegMultiplier();
        
        // Reload level
        this.loadLevel('/levels/level1.json');
    }

    updateOrangePegMultiplier() {
        // Calculate percentage of orange pegs cleared
        // Total orange pegs = goalProgress (hit) + remaining orange pegs
        const remainingOrangePegs = this.pegs.filter(peg => peg.isOrange && !peg.hit).length;
        const totalOrangePegs = this.goalProgress + remainingOrangePegs;
        const percentage = totalOrangePegs > 0 ? (this.goalProgress / totalOrangePegs) * 100 : 0;
        
        // Determine multiplier based on percentage
        // Thresholds are exact: 40% = 2x, 60% = 3x, 80% = 5x, 90% = 10x
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
        
        // Randomly select one blue peg to be purple (using seeded RNG)
        const randomIndex = this.rng.randomInt(0, bluePegs.length);
        this.purplePeg = bluePegs[randomIndex];
        this.purplePeg.isPurple = true;
        this.purplePeg.pointValue = 1500; // Purple peg value
        
        // Change color to purple (lighter purple for default state)
        this.purplePeg.mesh.material.color.setHex(0xba55d3); // Lighter purple
        
        console.log('💜 Purple peg assigned');
    }

    spawnBall(x, y, z, velocity = null, originalVelocity = null, isYellow = false) {
        const ballMaterial = this.physicsWorld.getBallMaterial();
        const ball = new Ball(this.scene, this.physicsWorld, { x, y, z }, velocity, ballMaterial, isYellow);
        // Store original velocity for lucky clover perk
        ball.originalVelocity = originalVelocity || velocity;
        // Track which pegs this ball has hit
        ball.hitPegs = [];
        // Track initial position for radius check
        ball.initialPosition = { x, y, z };
        // Track time since last new peg hit
        ball.lastNewPegHitTime = performance.now() / 1000;
        // Track spawn time for 5-second airtime check
        ball.spawnTime = performance.now() / 1000;
        // Track if lucky clover is active for this ball (based on power turns remaining)
        ball.luckyCloverActive = this.powerTurnsRemaining > 0;
        // Track if this ball used power (so we know to decrement when destroyed)
        ball.usedPower = this.powerTurnsRemaining > 0;
        // Enable lucky clover for this ball if power turns are available
        if (this.powerTurnsRemaining > 0) {
            this.luckyClover.enabled = true;
            // Decrement power turns (will be decremented when ball is destroyed)
        } else {
            // Disable if no power turns remaining
            this.luckyClover.enabled = false;
        }
        this.balls.push(ball);
    }

    async loadLevel(levelPath) {
        try {
            const levelData = await LevelLoader.loadLevel(levelPath);
            
            if (!LevelLoader.validateLevel(levelData)) {
                console.error('Invalid level data');
                return;
            }

            console.log(`Loading level: ${levelData.name}`);
            
            // Create pegs from level data
            const pegMaterial = this.physicsWorld.getPegMaterial();
            
            // First, create all pegs as blue (base color from JSON)
            levelData.pegs.forEach(pegData => {
                const baseColor = pegData.color 
                    ? LevelLoader.hexToNumber(pegData.color) 
                    : 0x4a90e2; // Default blue color
                
                const peg = new Peg(
                    this.scene,
                    this.physicsWorld,
                    { x: pegData.x, y: pegData.y, z: 0 },
                    baseColor,
                    pegMaterial
                );
                
                // Set base point value (will be updated for special pegs)
                peg.pointValue = 300; // Blue pegs are worth 400 points
                peg.isOrange = false;
                peg.isGreen = false;
                peg.isPurple = false;
                
                this.pegs.push(peg);
            });
            
            // Randomly select pegs for special types
            const indices = Array.from({length: this.pegs.length}, (_, i) => i);
            // Fisher-Yates shuffle
            for (let i = indices.length - 1; i > 0; i--) {
                const j = this.rng.randomInt(0, i + 1);
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
            
            console.log(`Loaded ${this.pegs.length} pegs (${greenIndices.length} green, ${orangeIndices.length} orange)`);
            
            // Assign initial purple peg
            this.assignPurplePeg();
            
            // Initialize orange peg multiplier tracker
            this.updateOrangePegMultiplier();
        } catch (error) {
            console.error('Failed to load level:', error);
        }
    }

    setupCollisionDetection() {
        // Use both event listeners and contacts array checking for maximum reliability
        // Event listener for immediate collision detection
        this.physicsWorld.world.addEventListener('beginContact', (event) => {
            try {
                // Try different event structures
                const contact = event.contact || event;
                if (!contact) return;
                
                const bodyA = contact.bi;
                const bodyB = contact.bj;
                
                if (!bodyA || !bodyB) return;
                
                this.handleCollision(bodyA, bodyB);
            } catch (error) {
                // Fallback to contacts array if event structure is wrong
                console.warn('Event listener error, using contacts array:', error);
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
            const scale = this.maxReboundSpeed / speed;
            velocity.x *= scale;
            velocity.y *= scale;
            velocity.z *= scale;
            ball.body.velocity = velocity;
        }
        
        // Round velocity to 3 decimals for determinism
        this.roundVec3(ball.body.velocity);
    }

    handleCollision(bodyA, bodyB) {
        // Find the ball or bomb involved
        const ball = this.balls.find(b => b.body === bodyA || b.body === bodyB);
        const bomb = this.bombs ? this.bombs.find(b => b.body === bodyA || b.body === bodyB) : null;
        const entity = ball || bomb; // Use ball if found, otherwise bomb
        if (!entity) return;
        
        // Check for ball/bomb-peg collision
        const peg = this.pegs.find(p => p.body === bodyA || p.body === bodyB);
        if (entity && peg) {
            // Clamp velocity after peg collision
            this.clampBallVelocity(entity);
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
        
        // Only process peg collision logic if it's a peg
        if (!peg) return;
        
        // Only process peg interactions for balls (bombs don't interact with pegs until they explode)
        if (!ball) return;
        
        const isNewHit = !peg.hit;
        const wasAlreadyTracked = ball.hitPegs.includes(peg);
        
        // Handle new peg hits
        if (isNewHit) {
            peg.onHit();
            
            // Track this peg as hit by this ball
            if (!wasAlreadyTracked) {
                ball.hitPegs.push(peg);
                ball.lastNewPegHitTime = performance.now() / 1000; // Update time
                
                // Check if this is the purple peg
                if (peg === this.purplePeg) {
                    // Purple peg hit - worth 1500 points and activates 1.25x multiplier
                    // Calculate multiplier before activating purple peg multiplier
                    const totalMultiplierBefore = this.orangePegMultiplier * this.purplePegMultiplier;
                    const purplePoints = 2000;
                    const finalPoints = Math.floor(purplePoints * totalMultiplierBefore);
                    this.score += finalPoints;
                    this.currentShotScore += finalPoints;
                    
                    // Activate 1.25x multiplier for following pegs
                    this.purplePegMultiplier = 1.25;
                    console.log('💜 Purple peg hit! 1.25x multiplier activated');
                    
                    // Update multiplier display
                    this.updateOrangePegMultiplier();
                    
                    // Ensure purple peg color changes to darker shade (onHit should handle this, but ensure it)
                    peg.mesh.material.color.setHex(0x9370db); // Medium purple
                } else {
                    // Regular peg - apply total multiplier (orange * purple)
                    const totalMultiplier = this.orangePegMultiplier * this.purplePegMultiplier;
                    const basePoints = peg.pointValue || 400;
                    const finalPoints = Math.floor(basePoints * totalMultiplier);
                    this.score += finalPoints;
                    this.currentShotScore += finalPoints;
                }
                
                this.updateScoreUI();
                this.updateFreeBallMeter();
                
                // Check for free ball (when current shot score reaches threshold)
                if (this.currentShotScore >= this.freeBallThreshold) {
                    // Award free ball
                    const freeBallsAwarded = Math.floor(this.currentShotScore / this.freeBallThreshold);
                    this.ballsRemaining += freeBallsAwarded;
                    this.currentShotScore = this.currentShotScore % this.freeBallThreshold; // Keep remainder
                    this.updateBallsRemainingUI();
                    this.updateFreeBallMeter();
                    console.log(`🎁 Free ball awarded! Balls remaining: ${this.ballsRemaining}`);
                }
                
                    // If orange peg, increment goal progress
                    if (peg.isOrange) {
                        this.goalProgress++;
                        this.updateGoalUI();
                        // Update orange peg multiplier
                        this.updateOrangePegMultiplier();
                        
                        // Check if all orange pegs are cleared (will check again when ball is destroyed)
                        if (this.goalProgress >= this.goalTarget) {
                            // Will show play again button when ball is destroyed
                        }
                    }
                
                // If green peg (power peg), activate character's power
                if (peg.isGreen) {
                    // Activate power based on selected character
                    if (this.selectedCharacter && this.selectedCharacter.id === 'petar') {
                        // Petar the Leprechaun: Lucky Clover power
                        // Add 3 turns (stackable - hitting multiple green pegs adds more turns)
                        this.powerTurnsRemaining += 3;
                        this.updatePowerTurnsUI();
                        console.log(`🍀 Lucky Clover power added! Turns remaining: ${this.powerTurnsRemaining}`);
                        
                        // Show clover emoji at peg position
                        if (this.emojiEffect) {
                            const pegPos = peg.body.position;
                            this.emojiEffect.showEmoji('🍀', { x: pegPos.x, y: pegPos.y, z: 0 }, 0.5);
                        }
                    } else if (this.selectedCharacter && this.selectedCharacter.id === 'john') {
                        // John the Gunner: Roulette Power
                        // Pause game and show roulette
                        this.triggerRoulette();
                    }
                }
            }
        }
        
        // Check for lucky clover perk (only if enabled for THIS ball)
        // Allow already-hit pegs to count towards the counter
        if (ball.luckyCloverActive && ball.originalVelocity) {
            const activated = this.luckyClover.onPegHit(ball, ball.originalVelocity);
            
            // If lucky clover activated (4th bounce), show clover emoji at ball position
            if (activated && this.emojiEffect) {
                const ballPos = ball.body.position;
                this.emojiEffect.showEmoji('🍀', { x: ballPos.x, y: ballPos.y, z: 0 }, 0.5);
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
                    console.log('🎯 Ball caught! Balls remaining:', this.ballsRemaining);
                    
                    // Mark ball for removal
                    ball.shouldRemove = true;
                }
            }
        }
    }

    checkCollisions() {
        // Check contacts array - this is the primary collision detection method
        // Event listeners can be unreliable, so we rely on checking contacts directly
        const contacts = this.physicsWorld.world.contacts;
        
        // Use a Set to track processed collisions this frame to avoid duplicates
        if (!this.processedContacts) {
            this.processedContacts = new Set();
        }
        
        // Clear processed contacts every frame for fresh detection
        this.processedContacts.clear();
        
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
            if (this.processedContacts.has(contactKey)) continue;
            this.processedContacts.add(contactKey);
            
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
        
        // Orthographic camera doesn't need aspect ratio update, but we keep it for consistency
        // The view dimensions stay the same (12x9)
    }

    startGameLoop() {
        const animate = (currentTime) => {
            this.animationFrameId = requestAnimationFrame(animate);
            
            // Skip updates if game is paused
            if (this.gamePaused) {
                this.renderer.render(this.scene, this.camera);
                return;
            }
            
            // Increment frame counter
            this.frameCount++;
            
            // Calculate delta time
            const deltaTime = currentTime - this.lastTime;
            this.lastTime = currentTime;
            
            // Update physics
            if (this.physicsWorld) {
                this.physicsWorld.update(deltaTime / 1000); // Convert to seconds
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
                    this.spawnBall(shot.spawnX, shot.spawnY, shot.spawnZ, shot.originalVelocity, shot.originalVelocity, true); // Yellow ball
                    this.lastRapidShotTime = currentTimeSeconds;
                }
            }
            
            // Update all balls
            // Get current time once for all ball updates (in seconds)
            const currentTimeSeconds = performance.now() / 1000;
            
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
                
                // Check if ball is stuck or in air too long
                const timeSinceLastNewPeg = currentTimeSeconds - ball.lastNewPegHitTime;
                const timeSinceSpawn = currentTimeSeconds - ball.spawnTime;
                const ballPos = ball.body.position;
                const dx = ballPos.x - ball.initialPosition.x;
                const dy = ballPos.y - ball.initialPosition.y;
                const distanceFromStart = Math.sqrt(dx * dx + dy * dy);
                
                // Check if ball should trigger peg removal:
                // 1. Within 2 units of start and hasn't hit new peg in 2 seconds, OR
                // 2. Ball has been in air for 5 seconds
                const shouldRemovePegs = (distanceFromStart < 2.0 && timeSinceLastNewPeg >= 2.0) || timeSinceSpawn >= 5.0;
                
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
            
            // Check for collisions between balls and pegs
            this.checkCollisions();
            
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
                            console.log('🎯 Ball caught! Balls remaining:', this.ballsRemaining);
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
            this.balls = this.balls.filter(ball => {
                if (ball.shouldRemove || ball.isOutOfBounds()) {
                    // Destroy all pegs that were hit by this ball (both caught and out-of-bounds balls)
                    ball.hitPegs.forEach(peg => {
                        const pegIndex = this.pegs.indexOf(peg);
                        if (pegIndex !== -1) {
                            peg.remove();
                            this.pegs.splice(pegIndex, 1);
                        }
                    });
                    
                    // If this is a bomb-ball, also remove pegs hit by the explosion
                    if (ball.explosionHitPegs && ball.explosionHitPegs.length > 0) {
                        ball.explosionHitPegs.forEach(peg => {
                            const pegIndex = this.pegs.indexOf(peg);
                            if (pegIndex !== -1) {
                                peg.remove();
                                this.pegs.splice(pegIndex, 1);
                            }
                        });
                    }
                    
                    // Decrement power turns after ball is destroyed (one turn used)
                    // Only decrement if this ball actually used the power (had it when spawned)
                    if (ball.usedPower && this.powerTurnsRemaining > 0) {
                        this.powerTurnsRemaining--;
                        this.updatePowerTurnsUI();
                    }
                    
                    // Disable lucky clover if no more power turns
                    if (this.powerTurnsRemaining === 0) {
                        this.luckyClover.enabled = false;
                    }
                    
                    ball.remove();
                    return false;
                }
                return true;
            });
            
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
            }
            
            // Render
            this.renderer.render(this.scene, this.camera);
        };
        
        // Initial resize to set correct dimensions
        this.handleResize();
        
        this.lastTime = performance.now();
        animate(this.lastTime);
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

