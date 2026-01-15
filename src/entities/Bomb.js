import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export class Bomb {
    constructor(scene, physicsWorldWrapper, position = { x: 0, y: 5, z: 0 }, velocity = null, ballMaterial = null) {
        this.scene = scene;
        this.physicsWorldWrapper = physicsWorldWrapper;
        this.explosionRadius = 1.5;
        this.explodeTime = 2.0; // 2 seconds
        this.spawnTime = performance.now() / 1000;
        this.exploded = false;
        
        // Visual representation (Three.js)
        this.createMesh(position);
        
        // Physics body (Cannon.js)
        this.createPhysicsBody(position, velocity, ballMaterial);
        
        // Link the visual to the physics body
        this.syncVisualToPhysics();
        
        // Pulsation animation
        this.pulseDirection = 1;
        this.baseColor = 0xdc143c; // Crimson
        this.lightColor = 0xff6347; // Lighter crimson
    }

    createMesh(position) {
        // Circle for bomb - same size as ball
        const geometry = new THREE.CircleGeometry(0.1, 16);
        const material = new THREE.MeshBasicMaterial({
            color: this.baseColor
        });
        
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.set(position.x, position.y, position.z);
        
        this.scene.add(this.mesh);
    }

    createPhysicsBody(position, velocity, ballMaterial) {
        const shape = new CANNON.Sphere(0.1);
        this.body = new CANNON.Body({
            mass: 1,
            shape: shape,
            material: ballMaterial || new CANNON.Material({
                friction: 0.3,
                restitution: 0.7
            }),
            type: CANNON.Body.DYNAMIC
        });
        
        this.body.collisionResponse = true;
        this.body.position.set(position.x, position.y, position.z);
        
        // Apply initial velocity if provided
        if (velocity) {
            this.body.velocity.set(velocity.x, velocity.y, velocity.z);
        }
        
        this.physicsWorldWrapper.addBody(this.body);
    }

    roundToDecimals(value, decimals = 3) {
        const factor = Math.pow(10, decimals);
        return Math.round(value * factor) / factor;
    }

    roundVec3(vec) {
        vec.x = this.roundToDecimals(vec.x);
        vec.y = this.roundToDecimals(vec.y);
        vec.z = this.roundToDecimals(vec.z);
    }

    syncVisualToPhysics() {
        // Round position for determinism
        this.roundVec3(this.body.position);
        
        this.mesh.position.set(
            this.body.position.x,
            this.body.position.y,
            this.body.position.z
        );
    }

    update(currentTime) {
        this.syncVisualToPhysics();
        
        // Only pulsate if not exploded (after explosion, it becomes a regular white ball)
        // If currentTime is not provided, it means we're being called as a ball (no pulsation)
        if (!this.exploded && currentTime !== undefined) {
            // Pulsation effect - alternate between two shades of crimson
            const elapsed = (currentTime / 1000) - this.spawnTime;
            const pulseSpeed = 3; // pulses per second
            const pulseValue = Math.sin(elapsed * pulseSpeed * Math.PI * 2);
            
            // Interpolate between base and light color
            const t = (pulseValue + 1) / 2; // Normalize to 0-1
            const r1 = (this.baseColor >> 16) & 0xff;
            const g1 = (this.baseColor >> 8) & 0xff;
            const b1 = this.baseColor & 0xff;
            const r2 = (this.lightColor >> 16) & 0xff;
            const g2 = (this.lightColor >> 8) & 0xff;
            const b2 = this.lightColor & 0xff;
            
            const r = Math.round(r1 + (r2 - r1) * t);
            const g = Math.round(g1 + (g2 - g1) * t);
            const b = Math.round(b1 + (b2 - b1) * t);
            
            const color = (r << 16) | (g << 8) | b;
            this.mesh.material.color.setHex(color);
        }
    }
    
    convertToBall() {
        // Turn white and stop pulsation
        this.exploded = true;
        this.mesh.material.color.setHex(0xffffff); // White
    }
    
    shouldExplode(currentTime) {
        const elapsed = (currentTime / 1000) - this.spawnTime;
        return elapsed >= this.explodeTime && !this.exploded;
    }
    
    explode() {
        this.exploded = true;
    }
    
    // Check if bomb/ball is out of bounds (below the visible area)
    // Camera view is -4.5 to 4.5 in Y, so destroy when well below
    isOutOfBounds(threshold = -6) {
        return this.body.position.y < threshold;
    }

    remove() {
        this.scene.remove(this.mesh);
        this.physicsWorldWrapper.removeBody(this.body);
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
    }
}

