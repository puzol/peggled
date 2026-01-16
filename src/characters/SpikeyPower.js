import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Spike } from '../entities/Spike.js';

/**
 * Spikey the PufferFish - Spike Power
 * On green peg hit: spawn 8 spikes around the peg, activate quill shot for next ball
 * Quill shot: ball shoots spikes every 0.2s in 8 directions
 */
export class SpikeyPower {
    constructor(game) {
        this.game = game;
        this.quillShotSpikeAngle = 0; // Current angle for quill shot spikes (clockwise rotation)
    }

    /**
     * Handle green peg hit - spawn spikes and activate quill shot
     */
    onGreenPegHit(peg) {
        this.spawnSpikesAroundPeg(peg);
        this.game.quillShotActive = true; // Power up next shot
    }

    /**
     * Spawn 8 spikes radiating from the peg center, all at the same time
     * Pattern: Plus (+) merged with X (×) - every 45 degrees (0°, 45°, 90°, 135°, 180°, 225°, 270°, 315°)
     */
    spawnSpikesAroundPeg(peg) {
        const pegPos = peg.body.position;
        const spikeLength = 1.0; // Increased to 1.0 points

        // Explicit angles for 8 directions: plus (+) merged with x (×) pattern
        // Angles: 0°, 45°, 90°, 135°, 180°, 225°, 270°, 315°
        const angles = [0, 45, 90, 135, 180, 225, 270, 315];
        
        // Spawn all spikes at once
        for (let i = 0; i < angles.length; i++) {
            // Convert degrees to radians
            const angleRad = (angles[i] * Math.PI) / 180;
            const direction = new THREE.Vector3(
                Math.cos(angleRad),
                Math.sin(angleRad),
                0
            );

            const startPos = new THREE.Vector3(pegPos.x, pegPos.y, pegPos.z);
            // Pass isGreenPegSpike=true to indicate this is a green peg spike (for half-speed growth)
            // Increased lifetime to 2.0 seconds so spikes stay alive longer
            const spike = new Spike(this.game.scene, this.game.physicsWorld, startPos, direction, spikeLength, 2.0, null, true);

            if (!this.game.spikes) {
                this.game.spikes = [];
            }
            this.game.spikes.push(spike);
        }
    }

    /**
     * Shoot quill shot spikes from ball center in radial fashion, clockwise
     * Spawn one after another clockwise (staggered)
     * Pattern: Plus (+) merged with X (×) - every 45 degrees
     */
    shootQuillShotSpikes(ball) {
        const ballPos = ball.body.position;
        const numSpikes = 8;
        const ballRadius = 0.1; // Ball radius from Ball.js
        const ballDiameter = ballRadius * 2; // 0.2 - spike should be as long as ball diameter
        const spikeLength = ballDiameter; // Spike length = ball diameter
        const spikeVelocity = 3; // Velocity for travel (increased for longer travel path)
        const spikeLifetime = 2.0; // Long lifetime for travel (will be destroyed on impact)
        const spawnDelay = 0.05; // Delay between each spike spawn (50ms)

        // Get current angle (starts at 0, increments clockwise)
        const baseAngle = this.quillShotSpikeAngle;

        // Track spikes spawned by this ball for peg removal tracking
        if (!ball.spikeHitPegs) {
            ball.spikeHitPegs = [];
        }

        // Spawn spikes one after another clockwise with delay
        // Pattern: 0°, 45°, 90°, 135°, 180°, 225°, 270°, 315° (every 45 degrees)
        for (let i = 0; i < numSpikes; i++) {
            setTimeout(() => {
                // Calculate angle (clockwise rotation, evenly spaced - every 45 degrees)
                const angle = baseAngle + (i / numSpikes) * Math.PI * 2;
                const direction = new THREE.Vector3(
                    Math.cos(angle),
                    Math.sin(angle),
                    0
                );

                const startPos = new THREE.Vector3(ballPos.x, ballPos.y, ballPos.z);

                // Create velocity vector for projectile
                const velocity = new CANNON.Vec3(
                    direction.x * spikeVelocity,
                    direction.y * spikeVelocity,
                    0
                );

                const spike = new Spike(this.game.scene, this.game.physicsWorld, startPos, direction, spikeLength, spikeLifetime, velocity);

                // Link spike to ball for tracking
                spike.parentBall = ball;
                // Mark as quill shot spike for destruction on impact
                spike.isQuillShotSpike = true;

                if (!this.game.spikes) {
                    this.game.spikes = [];
                }
                this.game.spikes.push(spike);
            }, i * spawnDelay * 1000); // Convert to milliseconds
        }

        // Increment angle for next shot (clockwise rotation)
        this.quillShotSpikeAngle += (Math.PI / 4); // Rotate 45 degrees each shot
        if (this.quillShotSpikeAngle >= Math.PI * 2) {
            this.quillShotSpikeAngle -= Math.PI * 2;
        }
    }

    /**
     * Update quill shot spikes for a ball
     * Called every frame for quill shot balls
     */
    updateQuillShot(ball) {
        if (ball.isQuillShot) {
            const currentTimeSeconds = performance.now() / 1000;
            // Reduced spawn rate: shoot spikes every 0.3 seconds (was 0.2)
            if (currentTimeSeconds - ball.lastQuillShotTime >= 0.3) {
                this.shootQuillShotSpikes(ball);
                ball.lastQuillShotTime = currentTimeSeconds;
            }
        }
    }

    /**
     * Reset power state
     */
    reset() {
        this.game.quillShotActive = false;
        this.quillShotSpikeAngle = 0;
    }
}

