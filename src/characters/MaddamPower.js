import * as THREE from 'three';
import * as CANNON from 'cannon-es';

/**
 * Maddam Magna Thicke - Magnetic Pegs Power
 * On green peg hit: grants a power for the next shot
 * Power: Magnetic Pegs - Orange, Green, and Purple pegs gain magnetism
 * White ball has a detection radius of 1.5 points
 * If magnetic pegs are in range, they affect the white ball's velocity:
 * - Add a pull force of 15 towards magnetic pegs
 * - Reduce gravity to 5 while pull force is active
 */
export class MaddamPower {
    constructor(game) {
        this.game = game;
        this.powerActive = false;
        this.magnetsActive = false;
        this.powerCount = 0; // Track the number of power turns
        this.magneticPegs = []; // Track which pegs have magnetism
        this.magnetTexture = null;
        this.textureLoader = new THREE.TextureLoader();
        this.scaleTransitionSpeed = 1.0 / 0.3; // Speed for 0.3s transition (per second)
        this.rotationTransitionSpeed = 1.0 / 0.05; // Speed for 0.05s rotation transition (per second) - very fast
        this.magnetismActivatedThisShot = false; // Track if magnets activated for current shot
        this.magnetSoundHandle = null; // Handle for looping magnet sound
        this.magnetSoundTime = 0; // Time accumulator for volume oscillation
        this.magnetSoundTime = 0; // Time accumulator for volume oscillation
        this.magneticPegDamping = 0.5; // Damping  factor for magnetic pegs
        this.baseDetectionRadius = 1.6; // Base detection radius
    }

    /* 
        * Standard Event list for all Power classes:
    */

    onInit(){
        return;
    }

    onBallShot(){

        if(this.powerCount > 0){
            this.powerActive = true;
            this.powerCount--;
            this.updatePowerTurnsUI();

            if(this.magnetsActive == false){
                this.magnetsActive = true;
            }
        } else {
            this.powerActive = false;
        }

        if(this.magnetsActive == true){
            this.findMagneticPegs();
        }
    }

    ballInPlay(){
        return;
    }

    onPegHit(peg, ball){
        return;
    }

    onGreenPegHit(peg) {
        this.powerCount += 1;
        this.updatePowerTurnsUI();
    }

    onBallOutOfPlay(){

        if(this.powerCount <= 0 && this.magnetsActive == true){
            this.magnetsActive = false;
            for (const peg of this.magneticPegs) {
                if (peg.magnetMesh) {
                    this.game.scene.remove(peg.magnetMesh);
                    peg.magnetMesh.geometry.dispose();
                    peg.magnetMesh.material.dispose();
                    peg.magnetMesh = null;
                }
            }
            
            this.magneticPegs = [];
        }
        
        if(this.magneticPegs.length > 0){
            for (const peg of this.magneticPegs) {
                if (peg.magnetMesh) {
                    this.game.scene.remove(peg.magnetMesh);
                    peg.magnetMesh.geometry.dispose();
                    peg.magnetMesh.material.dispose();
                    peg.magnetMesh = null;
                }
            }
            this.magneticPegs = [];
        }
    }

    onLevelComplete(){
        return;
    }

    onReset(){
        return;
    }

    update(){
        return;
    }

    onAnimate(currentTime, deltaTime){
        if(this.game.balls.length > 0 && this.magnetsActive == true){
            this.updateMagnetism(this.game.balls[0], deltaTime / 1000);
            this.updateMagnetVisuals(deltaTime / 1000);
        }
    }

    updatePowerTurnsUI() {
        
        if (this.game.powerTurnsElement) {
            this.game.powerTurnsElement.textContent = `Power: ${this.powerCount}`;
        }
    }

    findMagneticPegs(){

        for (const peg of this.game.pegs) {
            if (!peg.hit && (peg.isOrange || peg.isGreen || peg.isPurple) && !peg.isBlue) {
                const alreadyHasMagnet = this.magneticPegs.includes(peg);
                
                if (!alreadyHasMagnet) {
                    this.magneticPegs.push(peg);
                }
                
                // Create magnet visual for this peg (if not already created)
                if (!peg.magnetMesh) {
                    this.createMagnetVisual(peg);
                } else {
                    // Reset scale to 0 to restart animation on new power shot
                    peg.magnetCurrentScale = 0;
                    peg.magnetMesh.scale.set(0, 0, 0);
                }
            }
        }
    }

    createMagnetVisual(peg) {
        // Ensure texture is loaded before creating visual
        if (!this.magnetTexture) {
            this.magnetTexture = this.textureLoader.load(`${import.meta.env.BASE_URL}assets/svg/pegMagnet.svg`);
        }
        
        // Peg size is 0.09 (from Peg.js)
        const pegSize = peg.actualSize;
        const magnetSize = pegSize * 3.0; // 3x the peg size (double the 1.5x)
        const magnetRadius = pegSize + 0.02; // Offset from peg center (peg size + small offset)
        
        const magnetGeometry = new THREE.PlaneGeometry(magnetSize, magnetSize);
        const magnetMaterial = new THREE.MeshBasicMaterial({
            map: this.magnetTexture,
            transparent: true,
            depthTest: true,
            depthWrite: true,
            side: THREE.DoubleSide
        });
        
        const magnetMesh = new THREE.Mesh(magnetGeometry, magnetMaterial);
        
        // Position magnet at radius offset from peg (will be updated when rotating toward ball)
        const pegPos = peg.body.position;
        magnetMesh.position.set(pegPos.x, pegPos.y - magnetRadius, (pegPos.z || 0) - 0.01);
        magnetMesh.scale.set(0, 0, 0); // Start at scale 0
        
        // Add to scene (not to peg.mesh, so it can rotate independently)
        this.game.scene.add(magnetMesh);
        peg.magnetMesh = magnetMesh;
        peg.magnetBaseScale = magnetSize; // Store base scale for scaling to peg size
        peg.magnetRadius = magnetRadius; // Store radius for rotation around peg
        peg.magnetCurrentScale = 0; // Track current scale for smooth transition
        peg.magnetCurrentRotation = Math.PI; // Track current rotation (start pointing down)
    }

    updateMagnetism(ball, deltaTime) {
        if (!ball || !this.magnetsActive || !this.magneticPegs || this.magneticPegs.length === 0) {
            return;
        }
        const ballPos = ball.body.position;
        const detectionRadius = this.baseDetectionRadius; // Detection radius in points (increased from 1.2)
        
        // Use same visibility logic as updateMagnetVisuals - magnets should animate if visible
        const hasActiveMagneticBall = this.magnetsActive;
        const powerActive = this.game.magneticActive && this.game.powerTurnsRemaining > 0;
        const shouldShow = powerActive || hasActiveMagneticBall;
        
        let hasMagneticPull = false;
        let totalPullX = 0;
        let totalPullY = 0;
        let pullCount = 0;
        let hasMagnetInRange = false; // Track if any magnet is in range

        // Update magnet visuals for all magnetic pegs when ball is active
        for (const peg of this.magneticPegs) {
            if (peg.hit || !peg.body || !peg.magnetMesh) continue;

            const pegPos = peg.body.position;
            const dx = pegPos.x - ballPos.x;
            const dy = pegPos.y - ballPos.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const sizeMultiplier = peg.actualSize * 10;
            const inRange = distance <= detectionRadius * sizeMultiplier && distance > 0.01;

            // Update magnet position and rotation based on ball location
            // Use shouldShow instead of powerActive so magnets animate as long as they're visible
            const validDeltaTime = deltaTime > 0 ? deltaTime : 0.016; // Default to ~60fps if invalid
            const rotationTransitionSpeed = this.rotationTransitionSpeed * validDeltaTime;
            
            // Initialize rotation if needed
            if (peg.magnetCurrentRotation === undefined) {
                peg.magnetCurrentRotation = Math.PI; // Start pointing down
            }
            
            if (shouldShow && inRange) {
                const angle = Math.atan2(dy, dx);
                // Calculate target rotation to point at ball with top side
                // angle = Math.atan2(dy, dx) where dx = peg.x - ball.x, dy = peg.y - ball.y
                // This gives angle from ball to peg. To point from peg to ball, add 180°
                // SVG is rotated 90° CW (points right at 0°), so to point up we need -90°
                // To point at ball with top (up): angle from peg to ball - 90°
                const angleToBall = angle + Math.PI; // Flip to point from peg to ball
                const targetRotation = angleToBall - Math.PI / 2;
                
                // Smooth rotation interpolation
                peg.magnetCurrentRotation = this.smoothRotation(peg.magnetCurrentRotation, targetRotation, rotationTransitionSpeed);
                
                // Position magnet at radius offset from peg center, based on CURRENT rotation
                // Convert rotation back to position angle: rotation + 90° gives the angle from peg to magnet position
                const positionAngle = peg.magnetCurrentRotation + Math.PI / 2;
                const offsetX = Math.cos(positionAngle) * peg.magnetRadius;
                const offsetY = Math.sin(positionAngle) * peg.magnetRadius;
                peg.magnetMesh.position.set(
                    pegPos.x + offsetX,
                    pegPos.y + offsetY,
                    (pegPos.z || 0) - 0.01
                );
                
                peg.magnetMesh.rotation.z = peg.magnetCurrentRotation;
            } else if (shouldShow) {
                // Smooth rotation to pointing down (resting position)
                const restingRotation = Math.PI; // Point down: SVG points up (0°), so 180° points down
                peg.magnetCurrentRotation = this.smoothRotation(peg.magnetCurrentRotation, restingRotation, rotationTransitionSpeed);
                
                // Position magnet at radius offset from peg center, based on CURRENT rotation
                const positionAngle = peg.magnetCurrentRotation + Math.PI / 2;
                const offsetX = Math.cos(positionAngle) * peg.magnetRadius;
                const offsetY = Math.sin(positionAngle) * peg.magnetRadius;
                peg.magnetMesh.position.set(
                    pegPos.x + offsetX,
                    pegPos.y + offsetY,
                    (pegPos.z || 0) - 0.01
                );
                
                peg.magnetMesh.rotation.z = peg.magnetCurrentRotation;
            }

            if (inRange) {
                hasMagnetInRange = true; // At least one magnet is in range
                
                // Normalize direction from ball to peg
                const dirX = dx / distance;
                const dirY = dy / distance;

                // Calculate pull force based on distance (3-stage linear interpolation)
                // At radius 0.85: force = 15
                // At radius 1.25: force = 10
                // At radius 1.5: force = 5
                let pullForce;
                if (distance <= 0.85 * sizeMultiplier) {
                    // Stage 1: Maximum pull at close range
                    pullForce = 15;
                } else if (distance <= 1.25 * sizeMultiplier) {
                    // Stage 2: Interpolate between 15 and 10
                    const t = (distance - 0.85) / (1.25 - 0.85); // 0 to 1
                    pullForce = 15 + t * (10 - 15); // 15 down to 10
                } else {
                    // Stage 3: Interpolate between 10 and 5
                    const t = (distance - 1.25 * sizeMultiplier) / (1.5 * sizeMultiplier - 1.25 * sizeMultiplier); // 0 to 1
                    pullForce = 10 + t * (5 - 10); // 10 down to 5
                }
                
                totalPullX += dirX * pullForce * sizeMultiplier;
                totalPullY += dirY * pullForce * sizeMultiplier;
                pullCount++;
                hasMagneticPull = true;
            }
        }

        if (hasMagneticPull && pullCount > 0) {
            // Average pull direction if multiple pegs are in range
            const avgPullX = totalPullX / pullCount;
            const avgPullY = totalPullY / pullCount;

            const currentVel = ball.body.velocity;

            // Add pull force (accumulate over time with deltaTime)
            const pullX = avgPullX * deltaTime;
            const pullY = avgPullY * deltaTime;
            
            const newVelX = currentVel.x + pullX;
            const newVelY = currentVel.y + pullY;

            // Apply new velocity without clamping
            ball.body.velocity.set(newVelX, newVelY, currentVel.z || 0);

            // Reduce gravity to 5 while pull force is active
            // Normal gravity is -9.82, reduce to 5 means we counteract 9.82 - 5 = 4.82
            const gravityCounteract = 7.82 * deltaTime;
            ball.body.velocity.set(
                ball.body.velocity.x,
                ball.body.velocity.y + gravityCounteract,
                ball.body.velocity.z || 0
            );
        }
        
        // Update magnet sound - play when at least one magnet is in range
        this.updateMagnetSound(hasMagnetInRange, deltaTime);
    }

    updateMagnetSound(hasMagnetInRange, deltaTime) {
        if (!this.game.audioManager) return;
        
        const audioManager = this.game.audioManager;
        
        if (hasMagnetInRange) {
            // Start or update magnet sound
            if (!this.magnetSoundHandle) {
                // Start sound with fade in
                this.magnetSoundHandle = audioManager.playMagnetSound();
                this.magnetSoundTime = 0;
            } else {
                // Update volume oscillation (oscillate from 0.4 to 0.9)
                this.magnetSoundTime += deltaTime;
                const oscillationSpeed = 1.0; // Oscillations per second
                const oscillation = Math.sin(this.magnetSoundTime * oscillationSpeed * Math.PI * 2);
                const volume = 0.65 + (oscillation * 0.25); // Oscillate from 0.4 to 0.9 (0.65 ± 0.25)
                audioManager.updateMagnetSoundVolume(this.magnetSoundHandle, volume);
            }
        } else {
            // Stop magnet sound
            if (this.magnetSoundHandle) {
                audioManager.stopMagnetSound(this.magnetSoundHandle);
                this.magnetSoundHandle = null;
                this.magnetSoundTime = 0;
            }
        }
    }

    updateMagnetVisuals(deltaTime) {
        if (!this.magneticPegs || this.magneticPegs.length === 0) {
            return;
        }

        // Check if there's an active magnetic ball in play
        const hasActiveMagneticBall = this.game.balls.some(ball => ball && this.magnetsActive);
        
        // Magnets should be visible if:
        // 1. There's an active magnetic ball in play (during power shot), OR
        // 2. Power is available AND no balls are active (shot ended, ready for next power shot)
        // Don't show magnets just because powerTurnsRemaining > 0 - only show when actually using magnetism
        const powerAvailable = this.game.magneticActive && this.game.powerTurnsRemaining > 0;
        const shotEnded = this.game.balls.length === 0; // No active balls
        const powerActive = powerAvailable && shotEnded; // Power available AND shot has ended (ready for next power shot)
        const shouldShow = hasActiveMagneticBall || powerActive;
        const targetScale = shouldShow ? 1.0 : 0.0;
        const transitionSpeed = this.scaleTransitionSpeed * deltaTime;

        // Ensure deltaTime is valid (prevent issues with 0 or negative values)
        const validDeltaTime = deltaTime > 0 ? deltaTime : 0.016; // Default to ~60fps if invalid
        const validTransitionSpeed = this.scaleTransitionSpeed * validDeltaTime;

        // Update all magnet visuals
        for (const peg of this.magneticPegs) {
            if (!peg.body || !peg.magnetMesh) continue;
            
            // If peg is hit during magnetism, hide the magnet immediately
            if (peg.hit) {
                // Hide magnet when peg is hit (scale to 0)
                if (peg.magnetCurrentScale === undefined) {
                    peg.magnetCurrentScale = 0;
                } else {
                    // Smoothly hide magnet when peg is hit
                    peg.magnetCurrentScale = Math.max(0, peg.magnetCurrentScale - validTransitionSpeed);
                }
                peg.magnetMesh.scale.set(
                    peg.magnetCurrentScale,
                    peg.magnetCurrentScale,
                    peg.magnetCurrentScale
                );
                continue; // Stop updating this magnet after peg is hit
            }

            // Ensure magnetCurrentScale is initialized
            if (peg.magnetCurrentScale === undefined) {
                peg.magnetCurrentScale = 0;
            }

            // Smooth scale transition (0.3s)
            if (peg.magnetCurrentScale < targetScale) {
                peg.magnetCurrentScale = Math.min(targetScale, peg.magnetCurrentScale + validTransitionSpeed);
            } else if (peg.magnetCurrentScale > targetScale) {
                peg.magnetCurrentScale = Math.max(targetScale, peg.magnetCurrentScale - validTransitionSpeed);
            }

            peg.magnetMesh.scale.set(
                peg.magnetCurrentScale,
                peg.magnetCurrentScale,
                peg.magnetCurrentScale
            );

            // Position and rotate magnet
            const pegPos = peg.body.position;
            
            // Default position below peg when power active but ball not in range
            if (shouldShow && !hasActiveMagneticBall) {
                peg.magnetMesh.position.set(
                    pegPos.x,
                    pegPos.y - peg.magnetRadius,
                    (pegPos.z || 0) - 0.01
                );
                // SVG points up originally, to point down we need 180° rotation
                peg.magnetMesh.rotation.z = Math.PI; // Point down (180°)
            }
        }
    }

    smoothRotation(current, target, speed) {
        // Normalize angles to [0, 2π)
        const normalizeAngle = (angle) => {
            angle = angle % (Math.PI * 2);
            if (angle < 0) angle += Math.PI * 2;
            return angle;
        };
        
        current = normalizeAngle(current);
        target = normalizeAngle(target);
        
        // Calculate the shortest path (handles wrap-around)
        let diff = target - current;
        if (diff > Math.PI) diff -= Math.PI * 2;
        if (diff < -Math.PI) diff += Math.PI * 2;
        
        // Interpolate
        if (Math.abs(diff) < speed) {
            return target;
        }
        return normalizeAngle(current + Math.sign(diff) * speed);
    }
    
    reset() {
        return;
    }
}

