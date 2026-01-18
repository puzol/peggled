import * as THREE from 'three';
import * as CANNON from 'cannon-es';

/**
 * Buzz the Rocketeer - Rocket Power
 * On green peg hit: adds a rocket power shot to the queue
 * Power: Rocket - hold Ctrl to activate thrust, giving control of the ball
 */
export class BuzzPower {
    constructor(game) {
        this.game = game;
        this.rocketTexture = null;
        this.flameTexture = null;
        this.textureLoader = new THREE.TextureLoader();
    }

    /**
     * Handle green peg hit - add rocket power to queue
     * Note: rocketActive flag is set in Game.js when green peg is hit
     */
    onGreenPegHit(peg) {
        // Power turns are already added in Game.js (1 turn per green peg)
        // This method is called to match the pattern of other character powers
        // The rocketActive flag is set in Game.js when green peg is hit
    }

    /**
     * Attach rocket visual to ball (rocket sprite + flame)
     */
    attachRocketVisual(ball) {
        // Create rocket sprite (SVG texture)
        // Ball radius is 0.1, so twice the ball size = 0.2, then 50% bigger = 0.3
        const rocketSize = 0.3; // Twice the ball size + 50% = 3x ball size
        const rocketGeometry = new THREE.PlaneGeometry(rocketSize, rocketSize * 2); // Tall rocket
        
        // Load rocket texture
        if (!this.rocketTexture) {
            this.rocketTexture = this.textureLoader.load(`${import.meta.env.BASE_URL}assets/svg/pegRocket.svg`);
        }
        
        const rocketMaterial = new THREE.MeshBasicMaterial({
            map: this.rocketTexture,
            transparent: true,
            depthTest: true, // Enable depth test for proper z-ordering
            depthWrite: true, // Write to depth buffer
            side: THREE.DoubleSide
        });
        
        const rocketMesh = new THREE.Mesh(rocketGeometry, rocketMaterial);
        rocketMesh.position.set(0, 0, -0.05); // Behind ball (lower z-index)
        rocketMesh.renderOrder = -1; // Render before ball mesh to appear behind
        ball.mesh.add(rocketMesh);
        ball.rocketMesh = rocketMesh;
        
        // Create flame sprite (smaller, at bottom of rocket)
        const flameSize = 0.08;
        const flameGeometry = new THREE.PlaneGeometry(flameSize, flameSize);
        
        // Load flame texture
        if (!this.flameTexture) {
            this.flameTexture = this.textureLoader.load(`${import.meta.env.BASE_URL}assets/svg/pegFlame.svg`);
        }
        
        const flameMaterial = new THREE.MeshBasicMaterial({
            map: this.flameTexture,
            transparent: true,
            depthTest: false,
            side: THREE.DoubleSide
        });
        
                const flameMesh = new THREE.Mesh(flameGeometry, flameMaterial);
        flameMesh.position.set(0, -rocketSize * 0.8, -0.06); // At bottom of rocket, even lower z
        rocketMesh.add(flameMesh);
        ball.flameMesh = flameMesh;
        ball.flameVisible = false;
    }

    /**
     * Update rocket visuals and thrust for a ball
     * Called every frame for rocket balls
     */
    updateRocket(ball, deltaTime) {
        if (!ball.isRocket || !ball.rocketMesh) return;
        
        const ballPos = ball.body.position;
        const currentTime = performance.now() / 1000;
        
        // Update rocket fuel
        if (ball.rocketThrustActive && ball.rocketFuelRemaining > 0) {
            const fuelUsed = deltaTime;
            ball.rocketFuelRemaining = Math.max(0, ball.rocketFuelRemaining - fuelUsed);
            
            // Thrust power is already at full (1.0) - no ramp up needed
            // ball.rocketThrustPower is set to 1.0 on activation
            
            // Counteract gravity by directly modifying velocity instead of applying force
            // This prevents force accumulation that interferes with collision response
            // Normal gravity is -9.82, so we add +9.82 * deltaTime to velocity.y
            const currentVel = ball.body.velocity;
            const gravityCounteract = 9.82 * deltaTime; // Amount to add to counteract gravity this frame
            ball.body.velocity.set(currentVel.x, currentVel.y + gravityCounteract, currentVel.z || 0);
            
            // Show flame when thrusting
            if (ball.flameMesh) {
                ball.flameMesh.visible = ball.rocketFuelRemaining > 0;
                ball.flameVisible = ball.rocketFuelRemaining > 0;
            }
            
            // Apply thrust velocity towards cursor
            if (this.game.mouseX !== undefined && this.game.mouseY !== undefined) {
                const rect = this.game.canvas.getBoundingClientRect();
                const normalizedX = (this.game.mouseX / rect.width) * 2 - 1;
                const normalizedY = 1 - (this.game.mouseY / rect.height) * 2;
                const targetX = normalizedX * 6;
                const targetY = normalizedY * 4.5;
                
                // Direction from ball to cursor
                const dx = targetX - ballPos.x;
                const dy = targetY - ballPos.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance > 0.01) {
                    // Normalize direction
                const dirX = dx / distance;
                const dirY = dy / distance;
                
                // Apply thrust (quadruple the original: 3.0 * 4 = 12.0)
                const thrustVelocity = 12.0 * ball.rocketThrustPower;
                const thrustX = dirX * thrustVelocity;
                const thrustY = dirY * thrustVelocity;
                    
                    // Get current velocity and add thrust
                    const currentVel = ball.body.velocity;
                    const newVelX = currentVel.x + thrustX * deltaTime;
                    const newVelY = currentVel.y + thrustY * deltaTime;
                    
                    // Cap maximum velocity (quadruple: 3.0 * 4 = 12.0)
                    const speed = Math.sqrt(newVelX * newVelX + newVelY * newVelY);
                    const maxSpeed = 12.0; // Max velocity quadrupled
                    if (speed > maxSpeed) {
                        const scale = maxSpeed / speed;
                        ball.body.velocity.set(newVelX * scale, newVelY * scale, 0);
                    } else {
                        ball.body.velocity.set(newVelX, newVelY, 0);
                    }
                }
            }
            
            // Stop thrust when fuel runs out
            if (ball.rocketFuelRemaining <= 0) {
                ball.rocketThrustActive = false;
                // Update originalVelocity to current velocity after thrust ends
                // This ensures bounces are based on actual current speed, not original shot speed
                const currentVel = ball.body.velocity;
                ball.originalVelocity = { x: currentVel.x, y: currentVel.y, z: currentVel.z || 0 };
                // Stop thrust sound
                if (ball.rocketThrustSound) {
                    if (ball.rocketThrustSound.stop) {
                        // Web Audio API source
                        ball.rocketThrustSound.stop();
                    } else if (ball.rocketThrustSound.pause) {
                        // HTML5 Audio element
                        ball.rocketThrustSound.pause();
                        ball.rocketThrustSound.currentTime = 0;
                    }
                    ball.rocketThrustSound = null;
                }
                if (ball.flameMesh) {
                    ball.flameMesh.visible = false;
                    ball.flameVisible = false;
                }
            }
        } else {
            // Hide flame when not thrusting
            if (ball.flameMesh) {
                ball.flameMesh.visible = false;
                ball.flameVisible = false;
            }
        }
        
        // Rotate rocket towards cursor position
        if (this.game.mouseX !== undefined && this.game.mouseY !== undefined) {
            const rect = this.game.canvas.getBoundingClientRect();
            const normalizedX = (this.game.mouseX / rect.width) * 2 - 1;
            const normalizedY = 1 - (this.game.mouseY / rect.height) * 2;
            const targetX = normalizedX * 6;
            const targetY = normalizedY * 4.5;
            
            // Calculate angle from ball to cursor
            const dx = targetX - ballPos.x;
            const dy = targetY - ballPos.y;
            const angle = Math.atan2(dy, dx);
            
            // Rotate rocket mesh (around Z axis, but plane is in XY, so rotate around Z)
            ball.rocketMesh.rotation.z = angle - Math.PI / 2; // -90° offset so rocket points up by default
        }
    }

    /**
     * Reset power state
     */
    reset() {
        this.game.rocketActive = false;
    }
}