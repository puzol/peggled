import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export class Spike {
    constructor(scene, physicsWorldWrapper, startPosition, direction, length = 0.2, lifetime = 0.1, velocity = null, isGreenPegSpike = false) {
        this.scene = scene;
        this.physicsWorldWrapper = physicsWorldWrapper;
        this.fullLength = length; // Target length
        this.length = isGreenPegSpike ? 0 : length; // Start at 0 for green peg spikes (animated growth)
        this.lifetime = lifetime;
        this.spawnTime = performance.now() / 1000;
        this.isProjectile = velocity !== null; // If velocity provided, it's a projectile
        this.isGreenPegSpike = isGreenPegSpike; // Green peg spikes grow at half speed
        this.startPosition = startPosition instanceof THREE.Vector3 ? startPosition.clone() : new THREE.Vector3(startPosition.x, startPosition.y, startPosition.z || 0);
        
        // Track distance traveled for projectile spikes (for white ball spikes)
        this.distanceTraveled = 0;
        this.maxTravelDistance = velocity !== null ? 2.0 : null; // 2 points for white ball spikes
        this.lastPosition = this.startPosition.clone(); // Track last position for distance calculation
        this.initialVelocity = velocity ? new CANNON.Vec3(velocity.x, velocity.y, velocity.z || 0) : null; // Store initial velocity for maintaining constant speed
        
        // Ensure direction is a THREE.Vector3
        const dir = direction instanceof THREE.Vector3 ? direction.clone() : new THREE.Vector3(direction.x, direction.y, direction.z || 0);
        this.direction = dir.normalize();
        
        // Ensure startPosition is a THREE.Vector3
        const startPos = this.startPosition;
        
        // Calculate end position (use current length, will grow over time for green peg spikes)
        // For green peg spikes, start with a visible length so mesh is visible (especially for vertical spikes)
        // Store direction before calculating end position to ensure it's available
        const initialLength = this.isGreenPegSpike && this.length === 0 ? 0.1 : this.length;
        const endPosition = startPos.clone().add(this.direction.clone().multiplyScalar(Math.max(initialLength, 0.1)));
        
        // Visual representation (line)
        // For green peg spikes, pass the direction explicitly to ensure correct perpendicular calculation
        this.createMesh(startPos, endPosition, this.direction);
        
        // Physics body (thin box for collision detection)
        this.createPhysicsBody(startPos, endPosition, velocity);
        
        // Track which pegs this spike has hit
        this.hitPegs = [];
    }

    createMesh(startPos, endPos, directionOverride = null) {
        // Create a triangle geometry for the spike
        // Base at start (ball), tip at end
        // Base thickness: almost as big as the ball (0.1 radius) = 0.09 (90% of ball diameter)
        const baseThickness = 0.09;
        
        // Calculate direction and perpendicular for triangle base
        // Use directionOverride if provided (for green peg spikes), otherwise calculate from positions
        let dir;
        if (directionOverride) {
            dir = directionOverride.clone().normalize();
        } else {
            dir = endPos.clone().sub(startPos);
            const length = Math.max(dir.length(), 0.01); // Ensure minimum length for visibility
            dir.normalize();
        }
        const length = endPos.clone().sub(startPos).length();
        
        // Calculate perpendicular for triangle base
        // Handle vertical spikes (top/bottom): use a different perpendicular
        let perp;
        // Check for vertical spikes (90° = up, 270° = down)
        // dir.y = 1 for 90°, dir.y = -1 for 270°, dir.x = 0 for both
        const isVertical = Math.abs(dir.y) > 0.9 && Math.abs(dir.x) < 0.5;
        
        // For vertical spikes, always use horizontal perpendicular for proper width
        if (isVertical) {
            // Vertical spike (up or down) - use horizontal perpendicular
            perp = new THREE.Vector3(1, 0, 0); // Horizontal perpendicular for vertical spikes
        } else {
            // Horizontal or diagonal spike - use standard perpendicular
            const perpVec = new THREE.Vector3(-dir.y, dir.x, 0);
            const perpLength = perpVec.length();
            if (perpLength > 0.001) {
                perp = perpVec.normalize(); // Perpendicular in XY plane
            } else {
                // Fallback: if perpendicular is too small, use a default
                perp = new THREE.Vector3(1, 0, 0);
            }
        }
        
        // Calculate triangle vertices in local space (tip at origin, base at -length)
        // For vertical spikes, ensure the triangle has proper width (always use horizontal base)
        // Use larger base thickness for vertical spikes to ensure visibility
        const effectiveBaseThickness = isVertical ? 0.15 : baseThickness; // Larger base for vertical spikes
        const baseHalf = perp.clone().multiplyScalar(effectiveBaseThickness / 2);
        const tip = new THREE.Vector3(0, 0, 0); // Tip at origin
        const baseCenter = new THREE.Vector3(-length, 0, 0); // Base center
        const baseLeft = baseCenter.clone().add(baseHalf); // Base left vertex
        const baseRight = baseCenter.clone().sub(baseHalf); // Base right vertex
        
        // Create triangle geometry using vertices
        // Use counter-clockwise winding for correct face direction
        const geometry = new THREE.BufferGeometry();
        const vertices = new Float32Array([
            baseLeft.x, baseLeft.y, 0,  // Base left
            tip.x, tip.y, 0,            // Tip
            baseRight.x, baseRight.y, 0  // Base right
        ]);
        geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        geometry.computeVertexNormals();
        geometry.computeBoundingBox(); // Ensure bounding box is computed
        
        const material = new THREE.MeshBasicMaterial({
            color: 0xffffff, // White spikes
            side: THREE.DoubleSide
        });
        
        this.mesh = new THREE.Mesh(geometry, material);
        // Position mesh at end position (tip), then rotate to point in direction
        this.mesh.position.copy(endPos);
        
        // Calculate rotation to point in the direction
        // For vertical spikes (90° = up, 270° = down), ensure correct rotation
        const angle = Math.atan2(dir.y, dir.x);
        this.mesh.rotation.z = angle;
        
        // Ensure mesh is visible for vertical spikes by forcing update
        this.mesh.updateMatrix();
        this.mesh.visible = true;
        
        this.scene.add(this.mesh);
    }

    createPhysicsBody(startPos, endPos, velocity = null) {
        const thickness = 0.05;
        const shape = new CANNON.Sphere(thickness);
        
        if (this.isProjectile && velocity) {
            // Projectile spike - dynamic body that moves
            this.body = new CANNON.Body({
                mass: 0.1, // Small mass for projectile
                shape: shape,
                material: new CANNON.Material({
                    friction: 0,
                    restitution: 0
                }),
                type: CANNON.Body.DYNAMIC
            });
            
            // Position at start position
            this.body.position.set(startPos.x, startPos.y, startPos.z);
            
            // Set velocity
            this.body.velocity.set(velocity.x, velocity.y, velocity.z || 0);
            
            // Set collisionResponse to false - spikes should not physically interact with anything
            // We'll manually detect spike-peg collisions for scoring
            this.body.collisionResponse = false;
            
            // Add to physics world first
            this.physicsWorldWrapper.addBody(this.body);
            
            // Disable gravity for projectile spikes so they fly in straight lines
            // Must be done AFTER adding to world for Cannon.js
            // Initialize gravity if not already present, then set to zero
            if (!this.body.gravity) {
                this.body.gravity = new CANNON.Vec3(0, 0, 0);
            } else {
                this.body.gravity.set(0, 0, 0);
            }
        } else {
            // Static spike - doesn't move
            this.body = new CANNON.Body({
                mass: 0, // Static body (doesn't move)
                shape: shape,
                material: new CANNON.Material({
                    friction: 0,
                    restitution: 0
                }),
                type: CANNON.Body.KINEMATIC // Kinematic so it doesn't fall
            });
            
            // Position at the end of the spike (where it can hit things)
            this.body.position.set(endPos.x, endPos.y, endPos.z);
            // Set collisionResponse to false - spikes should not physically interact with anything
            // We'll manually detect spike-peg collisions for scoring
            this.body.collisionResponse = false;
            
            // Add to physics world
            this.physicsWorldWrapper.addBody(this.body);
        }
    }

    update() {
        const currentTime = performance.now() / 1000;
        const elapsed = currentTime - this.spawnTime;
        
        // Animate growth for green peg spikes (grow at half speed)
        if (this.isGreenPegSpike && this.length < this.fullLength) {
            // Growth speed: half of normal (normal would be fullLength / 0.1, half is fullLength / 0.2)
            const growthSpeed = this.fullLength / 0.2; // Half speed (takes 0.2s to reach full length)
            const growthDelta = growthSpeed * (1/60); // Assume 60fps, will be adjusted by actual frame time if available
            this.length = Math.min(this.length + growthDelta, this.fullLength);
            
            // Update mesh geometry to reflect new length
            this.updateMeshForGrowth();
            
            // Update physics body position to match new tip position
            const tipPos = this.startPosition.clone().add(this.direction.clone().multiplyScalar(this.length));
            this.body.position.set(tipPos.x, tipPos.y, tipPos.z);
        }
        
        // Update visual for projectile spikes
        if (this.isProjectile) {
            // Maintain constant velocity to counteract gravity (fly in straight line)
            if (this.initialVelocity) {
                this.body.velocity.set(this.initialVelocity.x, this.initialVelocity.y, this.initialVelocity.z || 0);
            }
            
            // Track distance traveled for white ball spikes
            const prevPos = this.lastPosition || this.startPosition.clone();
            const currentPos = this.body.position;
            const distanceThisFrame = Math.sqrt(
                Math.pow(currentPos.x - prevPos.x, 2) +
                Math.pow(currentPos.y - prevPos.y, 2) +
                Math.pow(currentPos.z - (prevPos.z || 0), 2)
            );
            this.distanceTraveled += distanceThisFrame;
            this.lastPosition = currentPos.clone();
            
            // Remove if traveled max distance (2 points for white ball spikes)
            if (this.maxTravelDistance && this.distanceTraveled >= this.maxTravelDistance) {
                this.shouldRemove = true;
                return; // Exit early if should remove
            }
            
            // Update triangle position and rotation to follow the projectile
            // Calculate tip position (current position + direction * length)
            const tipPos = new THREE.Vector3(
                currentPos.x + this.direction.x * this.length,
                currentPos.y + this.direction.y * this.length,
                currentPos.z + this.direction.z * this.length
            );
            
            // Position mesh at tip position
            this.mesh.position.copy(tipPos);
            
            // Update rotation to point in direction of travel
            const angle = Math.atan2(this.direction.y, this.direction.x);
            this.mesh.rotation.z = angle;
        }
        
        // Check if spike should be removed
        if (elapsed >= this.lifetime) {
            this.shouldRemove = true;
        }
    }
    
    updateMeshForGrowth() {
        // Recreate mesh geometry with new length for growing spikes
        if (!this.isGreenPegSpike) return;
        
        const baseThickness = 0.09;
        // Ensure minimum length for visibility (especially for top/bottom spikes)
        const length = Math.max(this.length, 0.05);
        
        // Calculate direction and perpendicular for triangle base
        const dir = this.direction;
        
        // Calculate perpendicular - handle vertical spikes (top/bottom)
        let perp;
        // Check for vertical spikes (90° = up, 270° = down)
        const isVertical = Math.abs(dir.y) > 0.9 && Math.abs(dir.x) < 0.5;
        if (isVertical) {
            // Vertical spike (up or down) - use horizontal perpendicular
            perp = new THREE.Vector3(1, 0, 0); // Horizontal perpendicular for vertical spikes
        } else {
            // Horizontal or diagonal spike - use standard perpendicular
            const perpVec = new THREE.Vector3(-dir.y, dir.x, 0);
            const perpLength = perpVec.length();
            if (perpLength > 0.001) {
                perp = perpVec.normalize(); // Perpendicular in XY plane
            } else {
                // Fallback: if perpendicular is too small, use a default
                perp = new THREE.Vector3(1, 0, 0);
            }
        }
        
        // Calculate triangle vertices in local space (tip at origin, base at -length)
        // For vertical spikes, ensure the triangle has proper width
        // Use larger base thickness for vertical spikes to ensure visibility
        const effectiveBaseThickness = isVertical ? 0.15 : baseThickness; // Larger base for vertical spikes
        const baseHalf = perp.clone().multiplyScalar(effectiveBaseThickness / 2);
        const tip = new THREE.Vector3(0, 0, 0); // Tip at origin
        const baseCenter = new THREE.Vector3(-length, 0, 0); // Base center
        const baseLeft = baseCenter.clone().add(baseHalf); // Base left vertex
        const baseRight = baseCenter.clone().sub(baseHalf); // Base right vertex
        
        // Update geometry vertices
        const positions = this.mesh.geometry.attributes.position;
        if (positions && positions.array.length >= 9) {
            positions.array[0] = baseLeft.x;   // Base left x
            positions.array[1] = baseLeft.y;   // Base left y
            positions.array[2] = 0;            // Base left z
            positions.array[3] = tip.x;        // Tip x
            positions.array[4] = tip.y;        // Tip y
            positions.array[5] = 0;            // Tip z
            positions.array[6] = baseRight.x;  // Base right x
            positions.array[7] = baseRight.y;  // Base right y
            positions.array[8] = 0;            // Base right z
            positions.needsUpdate = true;
            // Force geometry update for vertical spikes
            this.mesh.geometry.computeVertexNormals();
            this.mesh.geometry.computeBoundingBox();
        }
        
        // Update mesh position to tip position
        const tipPos = this.startPosition.clone().add(this.direction.clone().multiplyScalar(length));
        this.mesh.position.copy(tipPos);
        
        // Update rotation to point in direction
        const angle = Math.atan2(this.direction.y, this.direction.x);
        this.mesh.rotation.z = angle;
    }

    isExpired() {
        return this.shouldRemove || false;
    }

    remove() {
        // Remove from scene
        if (this.mesh) {
            this.scene.remove(this.mesh);
            this.mesh.geometry.dispose();
            this.mesh.material.dispose();
        }
        
        // Remove from physics world
        if (this.body) {
            this.physicsWorldWrapper.removeBody(this.body);
        }
    }
}

