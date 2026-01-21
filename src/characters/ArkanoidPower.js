import * as THREE from 'three';
import * as CANNON from 'cannon-es';

/**
 * Arkanoid Power - Brick Breaker/Pong style power
 * On green peg hit: bucket drops, pad rises, ball bounces off pad
 * On first pad bounce: gravity removed, 5-second timer starts
 * After 5 seconds: gravity restored, pad hides, bucket returns
 */
export class ArkanoidPower {
    constructor(game) {
        this.game = game;
        this.pad = null;
        this.padBody = null;
        this.padActive = false;
        this.padBounced = false; // Track if ball has bounced off pad
        this.timerActive = false;
        this.timerSeconds = 10; // Default timer duration (can be changed in activatePad)
        this.timerInterval = null;
        this.timerUI = null;
        this.targetSpeed = 8; // Target speed - updated on pad bounces, maintained on peg bounces
        this.bucketHidden = false;
        this.ballBouncedBeforeOut = false; // Track if ball bounced before going out
        this.ballsNeedingSpeedCorrection = new Set(); // Track balls that need speed correction next frame
        this.queuedActivation = false; // Track if pad should activate on next shot (green peg hit while already active)
        this.greenPegHitWhilePadActive = false; // Simple flag: was a green peg hit while pad was active?
    }

    /**
     * Handle green peg hit - activate pad immediately (like Spikey's spikes)
     * If pad is already active in the same shot, queue activation for next shot
     */
    onGreenPegHit(peg) {
        console.log('[Arkanoid] onGreenPegHit called', {
            padActive: this.padActive,
            timerActive: this.timerActive,
            timerSeconds: this.timerSeconds
        });
        
        if (!this.padActive) {
            // Pad is not active - activate immediately
            console.log('[Arkanoid] Activating pad immediately (not active)');
            this.activatePad();
        } else {
            // Pad is already active - second green peg hit!
            // Add base timer value to current timer
            const baseTimerValue = 10; // Base timer duration (matches default timerSeconds)
            if (this.timerActive) {
                // Timer is running - add time to it
                this.timerSeconds += baseTimerValue;
                console.log('[Arkanoid] Second green peg hit - added', baseTimerValue, 'seconds to timer. New time:', this.timerSeconds);
                // Update UI
                if (this.timerUI) {
                    this.timerUI.textContent = this.timerSeconds;
                }
            } else {
                // Timer not started yet - will use this value when timer starts
                this.timerSeconds += baseTimerValue;
                console.log('[Arkanoid] Second green peg hit - timer not active yet, added', baseTimerValue, 'seconds. Will start with:', this.timerSeconds);
                // Update UI
                if (this.timerUI) {
                    this.timerUI.textContent = this.timerSeconds;
                }
            }
        }
    }

    /**
     * Activate the pad (called immediately on green peg hit)
     */
    activatePad() {
        console.log('[Arkanoid] activatePad called', {
            padActive: this.padActive,
            queuedActivation: this.queuedActivation
        });
        
        if (this.padActive) {
            console.log('[Arkanoid] Pad already active, skipping activation');
            return;
        }
        
        this.padActive = true;
        this.padBounced = false;
        this.ballBouncedBeforeOut = false;
        this.targetSpeed = 8; // Reset target speed
        this.previousBallCount = 0;
        this.queuedActivation = false; // Clear queue when pad activates
        // Don't clear greenPegHitWhilePadActive - it will be used on next shot
        
        console.log('[Arkanoid] Pad activation started');
        
        // Hide bucket
        this.hideBucket();
        
        // Create pad
        this.createPad();
        
        // Create timer UI immediately (frozen at 10 seconds until first bounce)
        this.createTimerUI();
        this.timerSeconds = 10;
        if (this.timerUI) {
            this.timerUI.textContent = this.timerSeconds;
        }
        
        // Remove all pegs that are waiting for 5-second timer (explosionHitPegs)
        // This clears any pegs that were hit by explosions but haven't been removed yet
        if (this.game.balls) {
            this.game.balls.forEach(ball => {
                if (ball.explosionHitPegs && ball.explosionHitPegs.length > 0) {
                    ball.explosionHitPegs.forEach(peg => {
                        const pegIndex = this.game.pegs.indexOf(peg);
                        if (pegIndex !== -1) {
                            peg.remove();
                            this.game.pegs.splice(pegIndex, 1);
                        }
                    });
                    // Clear the array
                    ball.explosionHitPegs = [];
                }
            });
        }
        
        // Also check bombs
        if (this.game.bombs) {
            this.game.bombs.forEach(bomb => {
                if (bomb.explosionHitPegs && bomb.explosionHitPegs.length > 0) {
                    bomb.explosionHitPegs.forEach(peg => {
                        const pegIndex = this.game.pegs.indexOf(peg);
                        if (pegIndex !== -1) {
                            peg.remove();
                            this.game.pegs.splice(pegIndex, 1);
                        }
                    });
                    // Clear the array
                    bomb.explosionHitPegs = [];
                }
            });
        }
    }

    /**
     * Hide the bucket
     */
    hideBucket() {
        if (!this.game.bucket || this.bucketHidden) return;
        
        this.bucketHidden = true;
        // Move bucket down off screen
        const bucketParts = [this.game.bucket.leftWall, this.game.bucket.rightWall, this.game.bucket.topCatcher];
        bucketParts.forEach(part => {
            if (part && part.mesh) {
                part.mesh.visible = false;
            }
            if (part && part.body) {
                part.body.position.y = -10; // Move far down
            }
        });
    }

    /**
     * Show the bucket
     */
    showBucket() {
        if (!this.game.bucket || !this.bucketHidden) return;
        
        this.bucketHidden = false;
        // Restore bucket position
        const bucketY = -4.1;
        const bucketParts = [this.game.bucket.leftWall, this.game.bucket.rightWall, this.game.bucket.topCatcher];
        bucketParts.forEach(part => {
            if (part && part.mesh) {
                part.mesh.visible = true;
            }
            if (part && part.body) {
                if (part === this.game.bucket.leftWall) {
                    part.body.position.set(
                        this.game.bucket.currentX - this.game.bucket.width / 2,
                        bucketY,
                        0
                    );
                } else if (part === this.game.bucket.rightWall) {
                    part.body.position.set(
                        this.game.bucket.currentX + this.game.bucket.width / 2,
                        bucketY,
                        0
                    );
                } else {
                    part.body.position.set(
                        this.game.bucket.currentX,
                        bucketY,
                        0
                    );
                }
            }
        });
    }

    /**
     * Create the Arkanoid pad
     */
    createPad() {
        if (!this.game.scene || !this.game.physicsWorld) return;
        
        const padWidth = 1.2;
        const padHeight = 0.15;
        const padY = -4.0; // Slightly above bucket position
        
        // Create visual pad
        const padGeometry = new THREE.BoxGeometry(padWidth, padHeight, 0.1);
        const padMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
        this.pad = new THREE.Mesh(padGeometry, padMaterial);
        
        // Create physics body for pad
        const padShape = new CANNON.Box(new CANNON.Vec3(padWidth / 2, padHeight / 2, 0.05));
        this.padBody = new CANNON.Body({
            mass: 0, // Static body
            type: CANNON.Body.KINEMATIC,
            shape: padShape,
            material: this.game.physicsWorld.wallMaterial
        });
        
        // Set initial pad position at target Y, X will be updated in update loop
        const initialX = this.getPadXPosition();
        this.pad.position.set(initialX, padY, 0);
        this.padBody.position.set(initialX, padY, 0);
        
        this.game.scene.add(this.pad);
        this.game.physicsWorld.addBody(this.padBody);
    }

    /**
     * Set up mouse tracking for pad movement
     */
    setupMouseTracking() {
        // Mouse tracking is handled in Game.js's handleMouseMove
        // We'll update pad position in updatePadPosition
    }

    /**
     * Get the X position for the pad based on mouse position
     */
    getPadXPosition() {
        if (!this.game.canvas) {
            return 0;
        }
        
        const rect = this.game.canvas.getBoundingClientRect();
        
        // Get mouse position - use stored mouseX if available, otherwise get from event
        let mouseX;
        if (this.game.mouseX !== undefined && this.game.mouseX !== null) {
            // mouseX is already relative to canvas (clientX - rect.left)
            mouseX = this.game.mouseX;
        } else {
            // Fallback: center of screen
            mouseX = rect.width / 2;
        }
        
        // Convert to normalized coordinates (-1 to 1)
        const normalizedX = (mouseX / rect.width) * 2 - 1;
        
        // Convert to 2D world coordinates
        // Camera view is 12 units wide (-6 to 6)
        const worldX = normalizedX * 6;
        
        // Clamp pad position to screen bounds
        const padWidth = 1.2;
        const minX = -6 + padWidth / 2;
        const maxX = 6 - padWidth / 2;
        const clampedX = Math.max(minX, Math.min(maxX, worldX));
        
        return clampedX;
    }

    /**
     * Update pad position based on mouse (using same method as editor)
     */
    updatePadPosition() {
        if (!this.padActive || !this.pad || !this.padBody) {
            return;
        }
        
        const clampedX = this.getPadXPosition();
        const padY = -4.0;
        
        this.pad.position.x = clampedX;
        this.pad.position.y = padY;
        this.padBody.position.x = clampedX;
        this.padBody.position.y = padY;
    }


    /**
     * Check for ball-pad collision and handle bounce
     */
    checkBallPadCollision(ball) {
        if (!this.padActive || !this.pad || !this.padBody || !ball || !ball.body) return false;
        
        const ballPos = ball.body.position;
        const padPos = this.padBody.position;
        const padWidth = 1.2;
        const padHeight = 0.15;
        const ballRadius = 0.1;
        
        // Check if ball is colliding with pad
        const dx = ballPos.x - padPos.x;
        const dy = ballPos.y - padPos.y;
        const distanceX = Math.abs(dx);
        const distanceY = Math.abs(dy);
        
        // Collision if ball is within pad bounds (check both X and Y)
        // Use slightly larger collision area for better hitreg
        const collisionPadding = 0.05; // Extra padding for better detection
        const isWithinX = distanceX < padWidth / 2 + ballRadius + collisionPadding;
        const isWithinY = distanceY < padHeight / 2 + ballRadius + collisionPadding;
        const isMovingDown = ball.body.velocity.y < 0;
        
        // Ball must be close to pad and moving down (or very close to pad)
        // Check if ball is above pad and moving down, or already touching pad
        const isAbovePad = ballPos.y > padPos.y;
        const isVeryClose = distanceY < padHeight / 2 + ballRadius + collisionPadding;
        
        if (isWithinX && isWithinY && ((isMovingDown && isAbovePad) || isVeryClose)) {
            // Prevent multiple bounces in same frame
            if (ball.lastPadBounceTime === undefined) {
                ball.lastPadBounceTime = 0;
            }
            const currentTime = performance.now() / 1000;
            if (currentTime - ball.lastPadBounceTime < 0.1) {
                return false; // Too soon since last bounce
            }
            ball.lastPadBounceTime = currentTime;
            
            // Mark that ball has bounced before going out
            this.ballBouncedBeforeOut = true;
            
            // Calculate bounce direction based on hit position
            // Further from center = more angle
            const hitPosition = dx / (padWidth / 2); // -1 to 1, where 0 is center
            const maxAngle = Math.PI / 3; // 60 degrees max angle
            const bounceAngle = hitPosition * maxAngle;
            
            // Calculate bounce velocity direction
            const bounceDirX = Math.sin(bounceAngle);
            const bounceDirY = Math.cos(bounceAngle); // Always bounce up
            
            // Play pad bounce sound (roulette sound pitched down)
            if (this.game.audioManager) {
                this.game.audioManager.playSound('pegRoulette', { volume: 0.6, pitch: 0.5 });
            }
            
            // On first bounce, remove gravity and start timer countdown
            if (!this.padBounced) {
                this.padBounced = true;
                this.removeGravity(ball);
                // Timer UI already exists, just start the countdown
                this.startTimer();
                
                // Set target speed to 6 on first bounce
                this.targetSpeed = 8;
                
                // Set velocity to target speed on first bounce
                ball.body.velocity.set(
                    bounceDirX * this.targetSpeed,
                    bounceDirY * this.targetSpeed,
                    0
                );
            } else {
                // Subsequent bounces: increase target speed by 0.5
                this.targetSpeed += 0.75;
                
                // Clamp target speed to 16 to prevent tunneling (increased from maxReboundSpeed)
                const maxSpeed = 12;
                this.targetSpeed = Math.min(this.targetSpeed, maxSpeed);
                
                // Apply bounce direction with target speed
                ball.body.velocity.set(
                    bounceDirX * this.targetSpeed,
                    bounceDirY * this.targetSpeed,
                    0
                );
            }
            
            return true;
        }
        
        return false;
    }

    /**
     * Remove gravity from ball (similar to rocket power)
     */
    removeGravity(ball) {
        if (!ball || !ball.body) return;
        
        // Mark ball as no-gravity
        ball.noGravity = true;
        
        // Also mark all balls in the game as no-gravity (in case multiple balls exist)
        this.game.balls.forEach(b => {
            if (b && b.body) {
                b.noGravity = true;
            }
        });
    }

    /**
     * Start timer countdown with audio cues
     * Timer UI should already exist (created when pad appears)
     * Uses the current timerSeconds value (set in activatePad)
     */
    startTimer() {
        if (this.timerActive) return;
        
        this.timerActive = true;
        // Don't reset timerSeconds - use the value already set in activatePad
        
        // Update UI immediately
        if (this.timerUI) {
            this.timerUI.textContent = this.timerSeconds;
        }
        
        // Play sound immediately for first second
        if (this.game.audioManager) {
            this.game.audioManager.playSound('pegRoulette', { volume: 0.6 });
        }
        
        // Countdown timer
        this.timerInterval = setInterval(() => {
            this.timerSeconds--;
            
            // Play sound for each second
            if (this.game.audioManager && this.timerSeconds > 0) {
                this.game.audioManager.playSound('pegRoulette', { volume: 0.6 });
            }
            
            // Update UI
            if (this.timerUI) {
                this.timerUI.textContent = this.timerSeconds;
            }
            
            // Timer finished
            if (this.timerSeconds <= 0) {
                this.stopTimer();
                this.deactivatePad(); // This will reset the flag
            }
        }, 1000);
    }

    /**
     * Stop timer
     */
    stopTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        
        this.timerActive = false;
        
        // Remove timer UI
        if (this.timerUI) {
            this.timerUI.remove();
            this.timerUI = null;
        }
    }

    /**
     * Create timer UI at shooting area
     */
    createTimerUI() {
        // Remove existing timer if any
        if (this.timerUI) {
            this.timerUI.remove();
        }
        
        // Create timer element
        this.timerUI = document.createElement('div');
        this.timerUI.id = 'arkanoid-timer';
        this.timerUI.textContent = this.timerSeconds;
        this.timerUI.style.cssText = `
            position: absolute;
            top: 20%;
            left: 50%;
            transform: translateX(-50%);
            font-size: 48px;
            font-weight: bold;
            color: white;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.8);
            z-index: 1000;
            pointer-events: none;
        `;
        
        document.body.appendChild(this.timerUI);
    }

    /**
     * Deactivate pad and restore bucket
     */
    deactivatePad() {
        console.log('[Arkanoid] deactivatePad called', {
            padActive: this.padActive
        });
        
        if (!this.padActive) {
            console.log('[Arkanoid] Pad not active, skipping deactivation');
            return;
        }
        
        // Restore gravity to all balls
        this.game.balls.forEach(ball => {
            if (ball.noGravity) {
                ball.noGravity = false;
            }
        });
        
        // Stop timer if active
        this.stopTimer();
        
        // Hide pad
        this.hidePad();
        
        // Show bucket
        this.showBucket();
        
        // Reset state (but preserve greenPegHitWhilePadActive flag)
        const preserveFlag = this.greenPegHitWhilePadActive;
        this.padActive = false;
        this.padBounced = false;
        this.ballBouncedBeforeOut = false;
        this.targetSpeed = 6;
        this.previousBallCount = 0;
        this.ballsNeedingSpeedCorrection.clear();
        this.queuedActivation = false;
        this.greenPegHitWhilePadActive = preserveFlag; // Preserve flag through deactivation
        console.log('[Arkanoid] deactivatePad: reset state, preserved greenPegHitWhilePadActive:', preserveFlag);
        
        // Reset arkanoidActive flag in Game.js
        if (this.game) {
            this.game.arkanoidActive = false;
        }
    }

    /**
     * Hide the pad
     */
    hidePad() {
        if (this.pad) {
            // Animate pad dropping
            const startY = this.pad.position.y;
            const targetY = -6;
            const duration = 0.3;
            const startTime = performance.now();
            
            const animatePadDrop = () => {
                const elapsed = (performance.now() - startTime) / 1000;
                const progress = Math.min(elapsed / duration, 1);
                
                const currentY = startY + (targetY - startY) * progress;
                
                this.pad.position.y = currentY;
                if (this.padBody) {
                    this.padBody.position.y = currentY;
                }
                
                if (progress < 1) {
                    requestAnimationFrame(animatePadDrop);
                } else {
                    // Remove pad after animation
                    if (this.pad) {
                        this.game.scene.remove(this.pad);
                        this.pad.geometry.dispose();
                        this.pad.material.dispose();
                        this.pad = null;
                    }
                    if (this.padBody) {
                        this.game.physicsWorld.removeBody(this.padBody);
                        this.padBody = null;
                    }
                }
            };
            
            animatePadDrop();
        }
    }

    /**
     * Update ball speed on peg bounce
     * Corrects ball speed to match target speed (maintains speed, doesn't increase)
     * Also marks ball for correction next frame for safety
     */
    onPegBounce(ball) {
        if (this.padActive && this.padBounced && ball && ball.body) {
            // Ensure target speed doesn't exceed 16 (increased from maxReboundSpeed)
            const maxSpeed = 16;
            this.targetSpeed = Math.min(this.targetSpeed, maxSpeed);
            
            // Get current velocity
            const currentVel = ball.body.velocity;
            const currentSpeed = Math.sqrt(currentVel.x * currentVel.x + currentVel.y * currentVel.y);
            
            // If speed doesn't match target, correct it
            if (Math.abs(currentSpeed - this.targetSpeed) > 0.01) {
                // Normalize current direction and apply target speed
                if (currentSpeed > 0.01) {
                    const dirX = currentVel.x / currentSpeed;
                    const dirY = currentVel.y / currentSpeed;
                    ball.body.velocity.set(
                        dirX * this.targetSpeed,
                        dirY * this.targetSpeed,
                        0
                    );
                }
            }
            
            // Mark ball for correction next frame (safety measure)
            this.ballsNeedingSpeedCorrection.add(ball);
        }
    }

    /**
     * Update pad and check collisions (called from Game.js animate loop)
     */
    update(deltaTime) {
        if (!this.padActive) {
            return;
        }
        
        if (!this.pad || !this.padBody) {
            return;
        }
        
        // ALWAYS update pad X position to track mouse
        const clampedX = this.getPadXPosition();
        const padY = -4.0; // Fixed Y position
        
        this.pad.position.x = clampedX;
        this.pad.position.y = padY;
        this.padBody.position.x = clampedX;
        this.padBody.position.y = padY;
        
        // Track previous ball count to detect new balls
        if (!this.previousBallCount) {
            this.previousBallCount = this.game.balls.length;
        }
        
        // If a new ball appears while pad is active, reset bounce flag
        if (this.game.balls.length > 0 && this.previousBallCount === 0) {
            this.ballBouncedBeforeOut = false;
        }
        this.previousBallCount = this.game.balls.length;
        
        // Check if ball went out of play (no active balls)
        if (this.game.balls.length === 0) {
            // Ball went out - deactivate pad immediately (shot ended)
            this.deactivatePad();
            return;
        }
        
        // Check ball-pad collisions (only if balls exist)
        this.game.balls.forEach(ball => {
            this.checkBallPadCollision(ball);
        });
        
        // Counteract gravity and maintain target speed for balls with noGravity flag
        this.game.balls.forEach(ball => {
            if (ball.noGravity && ball.body && this.padBounced) {
                // Safety check: Ensure collisionResponse is always enabled
                // This prevents the ball from phasing through objects
                if (ball.body.collisionResponse === false) {
                    ball.body.collisionResponse = true;
                }
                
                // Ensure body is awake (not sleeping)
                if (ball.body.sleepState !== 0) {
                    ball.body.wakeUp();
                }
                
                const currentVel = ball.body.velocity;
                
                // Counteract gravity
                const gravityCounteract = 9.82 * deltaTime;
                ball.body.velocity.set(
                    currentVel.x,
                    currentVel.y + gravityCounteract,
                    currentVel.z || 0
                );
                
                // Maintain target speed (safety check - correct speed if it drifts)
                const currentSpeed = Math.sqrt(
                    ball.body.velocity.x * ball.body.velocity.x + 
                    ball.body.velocity.y * ball.body.velocity.y
                );
                
                // If speed doesn't match target, correct it (with small threshold to avoid jitter)
                // Also correct if ball was marked for correction from peg bounce
                const needsCorrection = this.ballsNeedingSpeedCorrection.has(ball) || 
                                       Math.abs(currentSpeed - this.targetSpeed) > 0.1;
                
                if (needsCorrection && currentSpeed > 0.01) {
                    const dirX = ball.body.velocity.x / currentSpeed;
                    const dirY = ball.body.velocity.y / currentSpeed;
                    ball.body.velocity.set(
                        dirX * this.targetSpeed,
                        dirY * this.targetSpeed,
                        0
                    );
                    
                    // Remove from correction set after correcting
                    this.ballsNeedingSpeedCorrection.delete(ball);
                }
            }
        });
    }

    /**
     * Reset power state
     */
    reset() {
        this.stopTimer();
        this.deactivatePad();
        this.padActive = false;
        this.padBounced = false;
        this.ballBouncedBeforeOut = false;
        this.targetSpeed = 6;
        this.bucketHidden = false;
        this.previousBallCount = 0;
        this.ballsNeedingSpeedCorrection.clear();
        this.queuedActivation = false;
        this.greenPegHitWhilePadActive = false;
        this.queuedActivation = false;
    }
}
