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
    }

    /**
     * Handle green peg hit - activate power for next shot
     */
    onGreenPegHit(peg) {
        // Add 1 power turn per green peg hit
        this.game.powerTurnsRemaining += 1;
        this.game.updatePowerTurnsUI();
        this.game.updatePowerDisplay();
    }

    /**
     * Initialize ball with i8 power (track original size)
     * Called when ball is spawned
     */
    initializeBall(ball) {
        if (!ball) return;
        
        // Store original radius (ball starts at 0.1)
        ball.originalRadius = 0.1;
        ball.currentRadius = 0.1;
        ball.isI8 = true;
        ball.i8ProcessedPegs = new Set(); // Track processed pegs to prevent double-processing
    }

    /**
     * Handle peg hit - increase ball size by peg height
     * Returns true if explosion was triggered (peg should not be processed normally)
     */
    onPegHit(ball, peg) {
        if (!ball || !ball.isI8 || !peg) return false;
        
        console.log('[I8Power] onPegHit called:', {
            ballRadius: ball.currentRadius,
            originalRadius: ball.originalRadius,
            pegHit: peg.hit,
            pegType: peg.type,
            pegIsOrange: peg.isOrange,
            pegIsPurple: peg.isPurple,
            pegIsGreen: peg.isGreen
        });
        
        // Don't grow if peg is already hit (shouldn't happen, but safety check)
        if (peg.hit) {
            console.log('[I8Power] onPegHit: Peg already hit, returning false');
            return false;
        }
        
        // Track which pegs we've processed in this call to prevent double-processing
        // This prevents the same peg from being processed multiple times if onPegHit is called again
        if (!ball.i8ProcessedPegs) {
            ball.i8ProcessedPegs = new Set();
        }
        
        // If we've already processed this peg in this ball's lifetime, skip it
        // Use a unique identifier for the peg (body ID or position)
        const pegId = peg.body ? peg.body.id : `${peg.body?.position?.x}_${peg.body?.position?.y}`;
        if (ball.i8ProcessedPegs.has(pegId)) {
            console.log('[I8Power] onPegHit: Peg already processed by i8, returning false', { pegId });
            return false;
        }
        
        // Mark this peg as processed
        ball.i8ProcessedPegs.add(pegId);
        
        // Calculate peg height based on type
        let pegHeight = 0;
        if (peg.type === 'round') {
            // Round peg: height is diameter (2 * radius)
            pegHeight = peg.actualSize * 2;
        } else if (peg.type === 'rect' || peg.type === 'dome') {
            // Rect/Dome peg: height is 2 * actualSize
            pegHeight = peg.actualSize * 2;
        } else {
            // Default: use actualSize as fallback
            pegHeight = peg.actualSize * 2;
        }
        
        // Calculate new ball radius (rounded to 2 decimals to prevent floating point issues)
        const newRadius = Math.round((ball.currentRadius + (pegHeight * 0.15)) * 100) / 100;
        const maxRadius = Math.round((ball.originalRadius * 3) * 100) / 100; // 3x original size triggers explosion
        
        // Only do pre-size-increase peg check if new size would be < 3x
        // If new size would be >= 3x, let the explosion handle pegs to avoid double-hitting
        const willTriggerExplosion = newRadius >= maxRadius;
        
        console.log('[I8Power] Size calculation:', {
            currentRadius: ball.currentRadius,
            pegHeight: pegHeight,
            newRadius: newRadius,
            maxRadius: maxRadius,
            willTriggerExplosion: willTriggerExplosion
        });
        
        // Before size increase, check if any pegs are within the new ball radius
        // If so, process ALL their effects and remove them immediately (like small pegs) before size increase
        // This prevents the normal collision flow from processing them again
        // BUT: only if we won't trigger an explosion (explosion will handle pegs)
        const ballPos = ball.body.position;
        const pegsToHit = willTriggerExplosion ? [] : this.game.pegs.filter(pegToCheck => {
            // Include ALL pegs within radius, including the triggering peg
            // Exclude already hit pegs
            if (!pegToCheck.body || pegToCheck.hit) return false;
            
            const pegPos = pegToCheck.body.position;
            const dx = pegPos.x - ballPos.x;
            const dy = pegPos.y - ballPos.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const checkRadius = newRadius + 0.05; // Check radius with safety margin
            return distance <= checkRadius;
        });
        
        console.log('[I8Power] Pre-size-increase check:', {
            pegsToHitCount: pegsToHit.length,
            includesTriggeringPeg: pegsToHit.includes(peg),
            pegsToHitDetails: pegsToHit.map(p => ({
                isOrange: p.isOrange,
                isPurple: p.isPurple,
                isGreen: p.isGreen,
                hit: p.hit
            }))
        });
        
        // Process ALL pegs that would be inside the new ball size
        // This includes the triggering peg - process it here and remove it to prevent double-processing
        for (const pegToHit of pegsToHit) {
            console.log('[I8Power] Processing peg from pre-size-increase check:', {
                isTriggeringPeg: pegToHit === peg,
                isOrange: pegToHit.isOrange,
                isPurple: pegToHit.isPurple,
                isGreen: pegToHit.isGreen,
                hit: pegToHit.hit
            });
            
            // Mark peg as hit first to prevent double-processing
            pegToHit.onHit();
            
            if (this.game.audioManager) {
                this.game.audioManager.playPegHit();
            }
            
            // Handle special peg effects
            if (pegToHit.isGreen) {
                // Handle green peg power activation
                if (this.game.selectedCharacter?.id === 'peter') {
                    this.game.powerTurnsRemaining += 3;
                    this.game.updatePowerTurnsUI();
                    this.game.updatePowerDisplay();
                } else if (this.game.selectedCharacter?.id === 'mikey') {
                    this.game.powerTurnsRemaining += 2;
                    this.game.updatePowerTurnsUI();
                } else if (this.game.selectedCharacter?.id === 'maddam') {
                    this.game.powerTurnsRemaining += 1;
                    this.game.updatePowerTurnsUI();
                } else if (this.game.selectedCharacter?.id === 'arkanoid' && this.game.arkanoidPower) {
                    const wasPadActive = this.game.arkanoidPower.padActive;
                    this.game.arkanoidPower.onGreenPegHit(pegToHit);
                    this.game.arkanoidActive = true;
                    this.game.updatePowerDisplay();
                    if (!wasPadActive) {
                        this.game.powerTurnsRemaining += 1;
                        this.game.updatePowerTurnsUI();
                    }
                } else if (this.game.selectedCharacter?.id === 'i8') {
                    this.onGreenPegHit(pegToHit);
                    this.game.i8Active = true;
                    this.game.updatePowerDisplay();
                } else {
                    this.game.powerTurnsRemaining += 1;
                    this.game.updatePowerTurnsUI();
                }
            }
            
            if (pegToHit.isOrange) {
                this.game.goalProgress++;
                this.game.updateGoalUI();
                this.game.updateOrangePegMultiplier();
            }
            
            // Handle purple peg (check if it's the main purple peg or temporary)
            const isPurplePeg = pegToHit === this.game.purplePeg || this.game.temporaryPurplePegs?.includes(pegToHit);
            const isPeterGeneratedPurple = this.game.temporaryPurplePegs?.includes(pegToHit);
            
            if (isPurplePeg) {
                // Activate 1.25x multiplier for following pegs
                this.game.purplePegMultiplier = 1.25;
                this.game.updateOrangePegMultiplier();
                
                // Calculate points: Peter's generated purple pegs get multiplier, regular purple peg is flat
                const purplePoints = 2000;
                let finalPoints;
                if (isPeterGeneratedPurple) {
                    // Peter's lucky bounce purple pegs get the multiplier
                    const totalMultiplier = this.game.orangePegMultiplier * this.game.purplePegMultiplier;
                    finalPoints = Math.floor(purplePoints * totalMultiplier);
                } else {
                    // Regular purple peg is flat (no multiplier)
                    finalPoints = purplePoints;
                }
                this.game.score += finalPoints;
                this.game.currentShotScore += finalPoints;
                this.game.updateScoreUI();
                this.game.updateFreeBallMeter();
            } else {
                // Regular peg scoring (with multiplier)
                const totalMultiplier = this.game.orangePegMultiplier * this.game.purplePegMultiplier;
                const basePoints = pegToHit.pointValue || 300;
                const finalPoints = Math.floor(basePoints * totalMultiplier);
                this.game.score += finalPoints;
                this.game.currentShotScore += finalPoints;
                this.game.updateScoreUI();
                this.game.updateFreeBallMeter();
            }
            
            // Check for free ball
            if (this.game.currentShotScore >= this.game.freeBallThreshold) {
                const freeBallsAwarded = Math.floor(this.game.currentShotScore / this.game.freeBallThreshold);
                this.game.ballsRemaining += freeBallsAwarded;
                this.game.currentShotScore = this.game.currentShotScore % this.game.freeBallThreshold;
                this.game.updateBallsRemainingUI();
                this.game.updateFreeBallMeter();
            }
            
            // Remove peg immediately (like small pegs) - BEFORE size increase
            const pegIndex = this.game.pegs.indexOf(pegToHit);
            if (pegIndex !== -1) {
                pegToHit.remove();
                this.game.pegs.splice(pegIndex, 1);
                
                // Remove from ball's hitPegs array if present
                if (ball.hitPegs) {
                    const ballPegIndex = ball.hitPegs.indexOf(pegToHit);
                    if (ballPegIndex !== -1) {
                        ball.hitPegs.splice(ballPegIndex, 1);
                    }
                }
                
                // Remove from removal queue if present
                if (ball.pegsToRemove) {
                    const queueIndex = ball.pegsToRemove.indexOf(pegToHit);
                    if (queueIndex !== -1) {
                        ball.pegsToRemove.splice(queueIndex, 1);
                        if (queueIndex < ball.pegRemoveIndex) {
                            ball.pegRemoveIndex--;
                        }
                    }
                }
            }
        }
        
        // Check if we processed the triggering peg in the pre-size-increase check
        const triggeringPegProcessed = pegsToHit.includes(peg);
        
        // Now increase ball radius (rounded to 2 decimals)
        ball.currentRadius = Math.round(newRadius * 100) / 100;
        
        // Update ball size (both visual and physics)
        this.updateBallSize(ball);
        
        // Check if ball exceeds 3x original size
        if (ball.currentRadius >= ball.originalRadius * 3) {
            // Trigger explosion (will handle nearby pegs and reset ball size)
            this.triggerExplosion(ball);
            // Return true to skip normal peg processing - explosion already handled everything
            return true;
        }
        
        // If we processed the triggering peg in the pre-size-increase check, return true to skip normal processing
        // Otherwise, return false to let normal collision flow handle it
        return triggeringPegProcessed;
    }

    /**
     * Update ball size (visual and physics)
     */
    updateBallSize(ball) {
        if (!ball || !ball.mesh || !ball.body) return;
        
        // Round current radius to 2 decimals
        ball.currentRadius = Math.round(ball.currentRadius * 100) / 100;
        
        // Update visual mesh
        const newGeometry = new THREE.CircleGeometry(ball.currentRadius, 16);
        const oldGeometry = ball.mesh.geometry;
        ball.mesh.geometry = newGeometry;
        oldGeometry.dispose(); // Clean up old geometry
        
        // Update physics body
        // Remove old shape and add new one
        const oldShape = ball.body.shapes[0];
        if (oldShape) {
            ball.body.removeShape(oldShape);
        }
        
        const newShape = new CANNON.Sphere(ball.currentRadius);
        ball.body.addShape(newShape);
        ball.body.updateMassProperties();
        
        // Critical: Ensure collision detection works after size change
        // Force body to be awake and collision response enabled
        ball.body.wakeUp();
        ball.body.collisionResponse = true;
        
        // Enable Continuous Collision Detection (CCD) for large balls
        // This prevents the ball from phasing through objects, especially important for large balls
        if (ball.currentRadius >= ball.originalRadius * 1.5) {
            // Enable CCD for large balls to prevent tunneling through pegs
            ball.body.ccdSpeedThreshold = 0; // Always use CCD when large
            ball.body.ccdIterations = 10; // More iterations for better detection
        } else {
            // Disable CCD for smaller balls (normal behavior)
            ball.body.ccdSpeedThreshold = -1; // Disable CCD
        }
        
        // Force physics world to update collision bounds
        // This helps prevent the ball from phasing through objects after size change
        if (this.game.physicsWorld && this.game.physicsWorld.world) {
            // Trigger a collision check on next frame by ensuring body is active
            ball.body.updateBoundingRadius();
        }
        
        // If ball is large and overlapping with pegs, push it out
        // This prevents the ball from getting stuck inside pegs
        if (ball.currentRadius >= ball.originalRadius * 1.5) {
            this.preventPegOverlap(ball);
        }
        
        // Force collision check after every size increase to ensure collisions are detected
        // This helps prevent the ball from phasing through objects after size change
        if (this.game.checkCollisions) {
            // Use setTimeout to ensure physics has updated the new shape
            setTimeout(() => {
                if (this.game.checkCollisions && ball.body) {
                    // Ensure body is awake and collision response is enabled
                    ball.body.wakeUp();
                    ball.body.collisionResponse = true;
                    // Force collision check
                    this.game.checkCollisions();
                }
            }, 10); // Small delay to let physics update after size change
        }
    }

    /**
     * Prevent ball from overlapping with pegs when large
     * Pushes ball away from overlapping pegs to prevent getting stuck
     */
    preventPegOverlap(ball) {
        if (!ball || !ball.body || !this.game.pegs) return;
        
        const ballPos = ball.body.position;
        const ballRadius = ball.currentRadius;
        
        // Check all pegs for overlap
        for (const peg of this.game.pegs) {
            if (!peg.body || peg.hit) continue;
            
            const pegPos = peg.body.position;
            const dx = pegPos.x - ballPos.x;
            const dy = pegPos.y - ballPos.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            // Calculate minimum distance (ball radius + peg size)
            let pegRadius = 0;
            if (peg.type === 'round') {
                pegRadius = peg.actualSize;
            } else if (peg.type === 'rect' || peg.type === 'dome') {
                // For rectangular pegs, use half the diagonal as effective radius
                const height = peg.actualSize * 2;
                const width = height * 2;
                pegRadius = Math.sqrt(width * width + height * height) / 2;
            } else {
                pegRadius = peg.actualSize;
            }
            
            const minDistance = ballRadius + pegRadius;
            
            // If overlapping, push ball away
            if (distance < minDistance && distance > 0) {
                const overlap = minDistance - distance;
                const pushX = (dx / distance) * overlap * 1.1; // 1.1 for safety margin
                const pushY = (dy / distance) * overlap * 1.1;
                
                // Move ball away from peg
                ball.body.position.x -= pushX;
                ball.body.position.y -= pushY;
                
                // Wake up body to ensure physics processes the position change
                ball.body.wakeUp();
            }
        }
    }

    /**
     * Trigger explosion when ball exceeds 3x size
     */
    triggerExplosion(ball) {
        if (!ball || !ball.body) return;
        
        const ballPos = ball.body.position;
        const explosionRadius = 0.1;
        
        // Brief pause for tactile feedback and to let physics catch up
        // This helps prevent collision detection issues after size reset
        const pauseDuration = 0.05; // 50ms pause
        this.game.gamePaused = true;
        
        // Play explosion sound
        if (this.game.audioManager) {
            this.game.audioManager.playSound('pegExplosion', { volume: 0.8 });
        }
        
        // Resume after brief pause
        setTimeout(() => {
            this.game.gamePaused = false;
        }, pauseDuration * 1000);
        
        // Find all pegs within explosion radius (including the one that triggered the explosion)
        const pegsToHit = this.game.pegs.filter(peg => {
            const pegPos = peg.body.position;
            const dx = pegPos.x - ballPos.x;
            const dy = pegPos.y - ballPos.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            return distance <= explosionRadius;
        });
        
        // Track pegs hit by explosion for later removal
        const explosionHitPegs = [];
        
        // Check if ball is >= 1.5x size (before explosion resets it) - if so, remove pegs immediately
        const shouldRemoveImmediately = ball.currentRadius >= ball.originalRadius * 1.5;
        
        // Separate purple pegs from other pegs (only process unhit pegs, like Gunner's explosion)
        const purplePegs = pegsToHit.filter(peg => peg.isPurple && !peg.hit);
        const otherPegs = pegsToHit.filter(peg => !peg.isPurple && !peg.hit);
        
        // Process purple pegs FIRST to activate multiplier before other pegs
        purplePegs.forEach(peg => {
            peg.onHit();
            if (this.game.audioManager) {
                this.game.audioManager.playPegHit();
            }
            
            // Arkanoid power: remove pegs immediately when hit by explosion (if auto-remove is enabled)
            const isArkanoidActive = this.game.arkanoidPower && this.game.arkanoidActive && this.game.arkanoidPower.padActive && this.game.arkanoidPower.autoRemovePegs;
            if (isArkanoidActive) {
                const pegIndex = this.game.pegs.indexOf(peg);
                if (pegIndex !== -1) {
                    peg.remove();
                    this.game.pegs.splice(pegIndex, 1);
                    return; // Skip to next peg
                }
            }
            
            explosionHitPegs.push(peg);
            
            // Add score for purple peg (flat 2000 points, no multiplier)
            const purplePoints = 2000;
            const finalPoints = purplePoints;
            this.game.score += finalPoints;
            this.game.currentShotScore += finalPoints;
            
            // Activate 1.25x multiplier for following pegs
            this.game.purplePegMultiplier = 1.25;
            
            // Update UI
            this.game.updateScoreUI();
            this.game.updateFreeBallMeter();
            this.game.updateOrangePegMultiplier();
            
            // Ensure purple peg color changes to darker shade
            if (peg.mesh && peg.mesh.material && peg.mesh.material.uniforms) {
                const lightenColor = (hexColor, factor) => {
                    const r = ((hexColor >> 16) & 0xFF) * factor;
                    const g = ((hexColor >> 8) & 0xFF) * factor;
                    const b = (hexColor & 0xFF) * factor;
                    return ((Math.min(255, r) << 16) | (Math.min(255, g) << 8) | Math.min(255, b));
                };
                const lightenedColor = lightenColor(0x9370db, 1.3);
                peg.mesh.material.uniforms.pegColor.value.setHex(lightenedColor);
            }
            
            // Check for green peg (power activation) - purple pegs can also be green
            if (peg.isGreen) {
                // Handle green peg power activation (same as normal green peg hit)
                if (this.game.selectedCharacter?.id === 'peter') {
                    this.game.powerTurnsRemaining += 3;
                    this.game.updatePowerTurnsUI();
                    this.game.updatePowerDisplay();
                } else if (this.game.selectedCharacter?.id === 'mikey') {
                    this.game.powerTurnsRemaining += 2;
                    this.game.updatePowerTurnsUI();
                } else if (this.game.selectedCharacter?.id === 'maddam') {
                    this.game.powerTurnsRemaining += 1;
                    this.game.updatePowerTurnsUI();
                } else if (this.game.selectedCharacter?.id === 'arkanoid' && this.game.arkanoidPower) {
                    const wasPadActive = this.game.arkanoidPower.padActive;
                    this.game.arkanoidPower.onGreenPegHit(peg);
                    this.game.arkanoidActive = true;
                    this.game.updatePowerDisplay();
                    if (!wasPadActive) {
                        this.game.powerTurnsRemaining += 1;
                        this.game.updatePowerTurnsUI();
                    }
                } else if (this.game.selectedCharacter?.id === 'i8') {
                    this.onGreenPegHit(peg);
                    this.game.i8Active = true;
                    this.game.updatePowerDisplay();
                } else {
                    this.game.powerTurnsRemaining += 1;
                    this.game.updatePowerTurnsUI();
                }
            }
            
            // Check for free ball
            if (this.game.currentShotScore >= this.game.freeBallThreshold) {
                const freeBallsAwarded = Math.floor(this.game.currentShotScore / this.game.freeBallThreshold);
                this.game.ballsRemaining += freeBallsAwarded;
                this.game.currentShotScore = this.game.currentShotScore % this.game.freeBallThreshold;
                this.game.updateBallsRemainingUI();
                this.game.updateFreeBallMeter();
            }
            
            // i8 power: if ball is >= 1.5x size, remove pegs immediately (like small pegs)
            if (shouldRemoveImmediately) {
                const pegIndex = this.game.pegs.indexOf(peg);
                if (pegIndex !== -1) {
                    peg.remove();
                    this.game.pegs.splice(pegIndex, 1);
                    const explosionIndex = explosionHitPegs.indexOf(peg);
                    if (explosionIndex !== -1) {
                        explosionHitPegs.splice(explosionIndex, 1);
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
                    
                    return; // Skip to next peg
                }
            }
            
            // Small pegs are removed immediately after collision
            if (peg.size === 'small') {
                const pegIndex = this.game.pegs.indexOf(peg);
                if (pegIndex !== -1) {
                    peg.remove();
                    this.game.pegs.splice(pegIndex, 1);
                    const explosionIndex = explosionHitPegs.indexOf(peg);
                    if (explosionIndex !== -1) {
                        explosionHitPegs.splice(explosionIndex, 1);
                    }
                    return; // Skip to next peg
                }
            }
        });
        
        // Now process all other pegs (they will benefit from the purple peg multiplier if it was activated)
        otherPegs.forEach(peg => {
            peg.onHit();
            if (this.game.audioManager) {
                this.game.audioManager.playPegHit();
            }
            
            // Arkanoid power: remove pegs immediately when hit by explosion (if auto-remove is enabled)
            const isArkanoidActive = this.game.arkanoidPower && this.game.arkanoidActive && this.game.arkanoidPower.padActive && this.game.arkanoidPower.autoRemovePegs;
            if (isArkanoidActive) {
                const pegIndex = this.game.pegs.indexOf(peg);
                if (pegIndex !== -1) {
                    peg.remove();
                    this.game.pegs.splice(pegIndex, 1);
                    return; // Skip to next peg
                }
            }
            
            explosionHitPegs.push(peg);
            
            // Add score (now with purple peg multiplier if purple peg was hit)
            const totalMultiplier = this.game.orangePegMultiplier * this.game.purplePegMultiplier;
            const basePoints = peg.pointValue || 300;
            const finalPoints = Math.floor(basePoints * totalMultiplier);
            this.game.score += finalPoints;
            this.game.currentShotScore += finalPoints;
            
            // Update UI
            this.game.updateScoreUI();
            this.game.updateFreeBallMeter();
            
            // Check for orange peg (goal progress)
            if (peg.isOrange) {
                this.game.goalProgress++;
                this.game.updateGoalUI();
                this.game.updateOrangePegMultiplier();
            }
            
            // Check for green peg (power activation)
            if (peg.isGreen) {
                // Handle green peg power activation
                if (this.game.selectedCharacter?.id === 'peter') {
                    this.game.powerTurnsRemaining += 3;
                    this.game.updatePowerTurnsUI();
                    this.game.updatePowerDisplay();
                } else if (this.game.selectedCharacter?.id === 'mikey') {
                    this.game.powerTurnsRemaining += 2;
                    this.game.updatePowerTurnsUI();
                } else if (this.game.selectedCharacter?.id === 'maddam') {
                    this.game.powerTurnsRemaining += 1;
                    this.game.updatePowerTurnsUI();
                } else if (this.game.selectedCharacter?.id === 'arkanoid' && this.game.arkanoidPower) {
                    const wasPadActive = this.game.arkanoidPower.padActive;
                    this.game.arkanoidPower.onGreenPegHit(peg);
                    this.game.arkanoidActive = true;
                    this.game.updatePowerDisplay();
                    if (!wasPadActive) {
                        this.game.powerTurnsRemaining += 1;
                        this.game.updatePowerTurnsUI();
                    }
                } else if (this.game.selectedCharacter?.id === 'i8') {
                    this.onGreenPegHit(peg);
                    this.game.i8Active = true;
                    this.game.updatePowerDisplay();
                } else {
                    this.game.powerTurnsRemaining += 1;
                    this.game.updatePowerTurnsUI();
                }
            }
            
            // Check for free ball
            if (this.game.currentShotScore >= this.game.freeBallThreshold) {
                const freeBallsAwarded = Math.floor(this.game.currentShotScore / this.game.freeBallThreshold);
                this.game.ballsRemaining += freeBallsAwarded;
                this.game.currentShotScore = this.game.currentShotScore % this.game.freeBallThreshold;
                this.game.updateBallsRemainingUI();
                this.game.updateFreeBallMeter();
            }
            
            // i8 power: if ball is >= 1.5x size, remove pegs immediately (like small pegs)
            if (shouldRemoveImmediately) {
                const pegIndex = this.game.pegs.indexOf(peg);
                if (pegIndex !== -1) {
                    peg.remove();
                    this.game.pegs.splice(pegIndex, 1);
                    const explosionIndex = explosionHitPegs.indexOf(peg);
                    if (explosionIndex !== -1) {
                        explosionHitPegs.splice(explosionIndex, 1);
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
                    
                    return; // Skip to next peg
                }
            }
            
            // Small pegs are removed immediately after collision
            if (peg.size === 'small') {
                const pegIndex = this.game.pegs.indexOf(peg);
                if (pegIndex !== -1) {
                    peg.remove();
                    this.game.pegs.splice(pegIndex, 1);
                    const explosionIndex = explosionHitPegs.indexOf(peg);
                    if (explosionIndex !== -1) {
                        explosionHitPegs.splice(explosionIndex, 1);
                    }
                    return; // Skip to next peg
                }
            }
        });
        
        // Store explosion-related data for peg removal (like Gunner's explosion)
        // Only schedule for removal if ball was NOT >= 1.5x (otherwise already removed)
        if (!shouldRemoveImmediately && explosionHitPegs.length > 0) {
            // Store pegs for 5-second removal (Game.js update loop handles this)
            ball.explosionHitPegs = explosionHitPegs;
            ball.explosionTime = performance.now() / 1000;
        } else {
            // All pegs already removed, clear explosion data
            ball.explosionHitPegs = [];
            ball.explosionTime = null;
        }
        
        // Reset ball size back to original FIRST, then change velocity (rounded to 2 decimals)
        ball.currentRadius = Math.round(ball.originalRadius * 100) / 100;
        this.updateBallSize(ball);
        
        // Set ball velocity: y=5 (upward), x=3 (preserve direction)
        const currentVel = ball.body.velocity;
        const xDirection = currentVel.x >= 0 ? 1 : -1; // Preserve x direction
        ball.body.velocity.set(xDirection * 3, 5, 0);
        
        // Update originalVelocity for bounce calculations
        ball.originalVelocity = { x: xDirection * 3, y: 5, z: 0 };
        
        // Force collision check after explosion to ensure ball doesn't phase through objects
        // This is especially important after size reset - use setTimeout to ensure physics has updated
        setTimeout(() => {
            if (this.game.checkCollisions && ball.body) {
                // Ensure body is awake and collision response is enabled
                ball.body.wakeUp();
                ball.body.collisionResponse = true;
                // Force collision check
                this.game.checkCollisions();
            }
        }, 20); // Small delay to let physics update after size change
    }

    /**
     * Reset power state
     */
    reset() {
        // No persistent state to reset
    }
}

