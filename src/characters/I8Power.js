import * as THREE from 'three';
import * as CANNON from 'cannon-es';

/**
 * The i8 - "I Ate" Power
 * On peg hit: ball "eats" the peg, increasing in size by the peg's height
 * When ball exceeds 3x original size: explodes, hitting pegs in 1.5 radius
 * Explosion sets ball velocity: y=8, x=5 (preserving x direction)
 */
export class I8Power {
    constructor(game) {
        this.game = game;
        this.ballOriginalScale = 0.1;
        this.ballTargetScale = this.ballOriginalScale;
        this.ballCurrentScale = this.ballOriginalScale;
        this.explosionRadius = 0.6;
        // this.specialPegs = ['purple', 'green', 'orange']; // Peg colors that don't contribute to size
        this.specialPegIncrease = 0.04; // Smize increase for special pegs (orange, purple, green)
        this.regularPegIncrease = 0.0125; // Size increase for regular pegs
        this.powerActive = false;
        this.powerCount = 0;
        this.explosionYVelocity = 6;
        this.explosionXVelocity = 4;
        this.ballGrowthRate = 2; // per second
        this.ballScaleThreshold = .2;
        this.ballIsInPlay = false;
        this.activeBall = null; // Track the active ball for size animation
        this.explosionTriggered = false; // Prevent multiple explosion triggers
    }

    onInit(){
        this.game.ballRadius = this.ballOriginalScale;
    }

    onBallShot(){
        if(this.powerCount > 0){
            this.powerActive = true;
        } else {
            this.powerActive = false;
            this.ballTargetScale = this.ballOriginalScale;
        }

        if(this.powerCount > 0){
            this.powerCount--;
            this.updatePowerTurnsUI();
        }

        // Initialize ball scale tracking when ball is shot
        if (this.powerActive && this.game.balls.length > 0) {
            this.activeBall = this.game.balls[0];
            // Store original radius on the ball if not already set
            if (!this.activeBall.originalRadius) {
                this.activeBall.originalRadius = this.activeBall.ballRadius;
            }
            // Reset scales to current ball size (rounded to 3 decimals)
            const initialRadius = Math.round(this.activeBall.ballRadius * 1000) / 1000;
            this.ballCurrentScale = initialRadius;
            this.ballTargetScale = initialRadius;
            this.explosionTriggered = false; // Reset explosion flag
        }
    }

    ballInPlay(){
        this.ballIsInPlay = true;
        // Ensure we have the active ball reference
        if (this.game.balls.length > 0 && !this.activeBall) {
            this.activeBall = this.game.balls[0];
            if (!this.activeBall.originalRadius) {
                this.activeBall.originalRadius = this.activeBall.ballRadius;
            }
            const initialRadius = Math.round(this.activeBall.ballRadius * 1000) / 1000;
            this.ballCurrentScale = initialRadius;
            this.ballTargetScale = initialRadius;
        }
    }

    onPegHit(peg, ball){
        if(this.powerActive && peg.hit == false) {
            peg.size = 'small'; // Treat as small peg for scoring
            // Ensure we have the active ball reference
            if (ball && !this.activeBall) {
                this.activeBall = ball;
                if (!this.activeBall.originalRadius) {
                    this.activeBall.originalRadius = this.activeBall.ballRadius;
                }
            }
            
            // Update target scale based on peg type
            if(peg.isGreen || peg.isOrange || peg.isPurple){                 
                this.ballTargetScale += this.specialPegIncrease;
            }else{
                this.ballTargetScale += this.regularPegIncrease;
            }
            // Round target scale to 3 decimals
            this.ballTargetScale = Math.round(this.ballTargetScale * 1000) / 1000;
            
            // Check if target scale exceeds threshold (trigger explosion immediately)
            if (this.ballTargetScale >= this.ballScaleThreshold && !this.explosionTriggered) {
                this.triggerExplosion(ball);
            }
        }
    }

    onGreenPegHit(peg) {
        this.powerCount += 1;
        this.updatePowerTurnsUI();
    }

    onBallOutOfPlay() {
        this.ballIsInPlay = false;
        const resetScale = Math.round(this.ballOriginalScale * 1000) / 1000;
        this.ballTargetScale = resetScale;
        this.ballCurrentScale = resetScale;
        this.activeBall = null;
        this.explosionTriggered = false;
    }

    onLevelComplete() {
        return;
    }

    onReset() {
        return;
    }

    update() {
        return;
    }

    onAnimate(currentTime, deltaTime) {
        // Only animate if power is active and we have an active ball
        if (!this.powerActive || !this.ballIsInPlay || !this.activeBall || this.game.balls.length === 0) {
            return;
        }

        // Ensure we have the correct ball reference
        if (this.game.balls[0] !== this.activeBall) {
            this.activeBall = this.game.balls[0];
            if (!this.activeBall.originalRadius) {
                this.activeBall.originalRadius = this.activeBall.ballRadius;
            }
        }

        // Check if we need to animate towards target scale
        if (Math.abs(this.ballCurrentScale - this.ballTargetScale) > 0.001) {
            // Convert deltaTime from milliseconds to seconds
            const deltaSeconds = deltaTime / 1000;
            
            // Calculate growth amount per frame (ballGrowthRate is per second)
            const growthAmount = this.ballGrowthRate * deltaSeconds;
            
            // Interpolate current scale towards target scale
            if (this.ballCurrentScale < this.ballTargetScale) {
                this.ballCurrentScale = Math.min(
                    this.ballCurrentScale + growthAmount,
                    this.ballTargetScale
                );
            } else {
                this.ballCurrentScale = Math.max(
                    this.ballCurrentScale - growthAmount,
                    this.ballTargetScale
                );
            }

            // Round to 3 decimals
            this.ballCurrentScale = Math.round(this.ballCurrentScale * 1000) / 1000;

            // Update the ball's actual radius and visual/physics representation
            this.updateBallSize(this.activeBall, this.ballCurrentScale);

            // Reset explosion flag if ball is below threshold (allows re-triggering after reset)
            if (this.ballCurrentScale < this.ballScaleThreshold && this.ballTargetScale < this.ballScaleThreshold) {
                this.explosionTriggered = false;
            }
        }
    }
    
    /**
     * Update ball size (visual and physics) with animated radius
     */
    updateBallSize(ball, newRadius) {
        if (!ball || !ball.mesh || !ball.body) return;
        
        // Round radius to 3 decimals before updating
        const roundedRadius = Math.round(newRadius * 1000) / 1000;
        
        // Update ball's radius property
        ball.ballRadius = roundedRadius;
        
        // Update visual mesh geometry
        const newGeometry = new THREE.CircleGeometry(roundedRadius, 16);
        const oldGeometry = ball.mesh.geometry;
        ball.mesh.geometry = newGeometry;
        oldGeometry.dispose(); // Clean up old geometry
        
        // Update physics body shape
        const oldShape = ball.body.shapes[0];
        if (oldShape) {
            ball.body.removeShape(oldShape);
        }
        
        const newShape = new CANNON.Sphere(roundedRadius);
        ball.body.addShape(newShape);
        ball.body.updateMassProperties();
        
        // Ensure collision detection works after size change
        ball.body.wakeUp();
        ball.body.collisionResponse = true;
        
        // Enable Continuous Collision Detection (CCD) for large balls
        if (roundedRadius >= (ball.originalRadius || this.ballOriginalScale) * 1.5) {
            ball.body.ccdSpeedThreshold = 0; // Always use CCD when large
            ball.body.ccdIterations = 10;
        } else {
            ball.body.ccdSpeedThreshold = -1; // Disable CCD for smaller balls
        }
        
        // Force physics world to update collision bounds
        ball.body.updateBoundingRadius();
    }

    /**
     * Trigger explosion when ball target scale exceeds threshold
     */
    triggerExplosion(ball) {
        if (!ball || !ball.body || this.explosionTriggered) return;
        
        this.explosionTriggered = true; // Prevent multiple triggers
        
        const ballPos = ball.body.position;
        
        // Brief pause for tactile feedback and to let physics catch up
        // This helps prevent collision detection issues after size reset
        const pauseDuration = 0.03; // 50ms pause
        this.game.gamePaused = true;
        
        // Find all pegs within explosion radius
        const pegsToHit = this.game.pegs.filter(peg => {
            if (peg.hit) return false; // Skip already hit pegs
            const pegPos = peg.body.position;
            const dx = pegPos.x - ballPos.x;
            const dy = pegPos.y - ballPos.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            return distance <= this.explosionRadius;
        });
        
        // Remove pegs immediately (like small pegs)
        pegsToHit.forEach(peg => {
            // Call onHit() to trigger peg effects (scoring, sounds, etc.)
            if (!peg.hit) {
                // peg.size = 'small'; // Treat as small peg for scoring
                peg.onHit(ball);
            }
            
            // Remove peg from game
            const pegIndex = this.game.pegs.indexOf(peg);
            if (pegIndex !== -1) {
                peg.remove();
                this.game.pegs.splice(pegIndex, 1);
            }
            
            // Remove from ball's hitPegs array if present
            if (ball.hitPegs) {
                const ballPegIndex = ball.hitPegs.indexOf(peg);
                if (ballPegIndex !== -1) {
                    ball.hitPegs.splice(ballPegIndex, 1);
                }
            }
            
            // Remove from removal queue if present
            if (ball.pegsToRemove) {
                const queueIndex = ball.pegsToRemove.indexOf(peg);
                if (queueIndex !== -1) {
                    ball.pegsToRemove.splice(queueIndex, 1);
                    if (queueIndex < ball.pegRemoveIndex) {
                        ball.pegRemoveIndex--;
                    }
                }
            }
        });
        
        // Reset ball size to original (animated)
        const originalRadius = ball.originalRadius || this.ballOriginalScale;
        this.ballCurrentScale = Math.round(originalRadius * 1000) / 1000;
        this.ballTargetScale = Math.round(originalRadius * 1000) / 1000;
        this.updateBallSize(ball, this.ballCurrentScale);
        
        // Resume after brief pause
        setTimeout(() => {
            this.game.gamePaused = false;
        }, pauseDuration * 1000);
        
        // Set explosion velocity (preserve x direction)
        const xDirection = ball.body.velocity.x >= 0 ? 1 : -1;
        ball.body.velocity.set(xDirection * this.explosionXVelocity, this.explosionYVelocity, 0);
        
        // Reset explosion flag after a short delay to allow ball to reset below threshold
        // This ensures the explosion can trigger again if the ball grows past threshold again
        setTimeout(() => {
            if (this.ballCurrentScale < this.ballScaleThreshold && this.ballTargetScale < this.ballScaleThreshold) {
                this.explosionTriggered = false;
            }
        }, 100);
    }
    
    updatePowerTurnsUI() {
        
        if (this.game.powerTurnsElement) {
            this.game.powerTurnsElement.textContent = `Power: ${this.powerCount}`;
        }
    }

    reset(){
        return;
    }
}

