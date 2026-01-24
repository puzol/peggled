import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export class Ball {
    constructor(scene, physicsWorldWrapper, position = { x: 0, y: 5, z: 0 }, velocity = null, ballMaterial = null, isYellow = false) {
        this.scene = scene;
        this.physicsWorldWrapper = physicsWorldWrapper;
        this.isYellow = isYellow;
        
        // Visual representation (Three.js)
        this.createMesh(position);
        
        // Physics body (Cannon.js)
        this.createPhysicsBody(position, velocity, ballMaterial);
        
        // Link the visual to the physics body
        this.syncVisualToPhysics();
    }

    createMesh(position) {
        // Pure white circle for 2D - reduced by 50% (0.2 * 0.5 = 0.1)
        // Yellow for bonus balls (spread shot, rapid shot)
        const geometry = new THREE.CircleGeometry(0.1, 16);
        const material = new THREE.MeshBasicMaterial({
            color: this.isYellow ? 0xffff00 : 0xffffff // Yellow or white
        });
        
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.set(position.x, position.y, position.z);
        // CircleGeometry is already in XY plane, perfect for 2D view
        this.mesh.renderOrder = 0; // Ensure ball renders after rocket (rocket has renderOrder -1)
        
        this.scene.add(this.mesh);
    }

    createPhysicsBody(position, velocity, ballMaterial) {
        // Reduced by 50% (0.2 * 0.5 = 0.1)
        const shape = new CANNON.Sphere(0.1);
        this.body = new CANNON.Body({
            mass: 1,
            shape: shape,
            material: ballMaterial || new CANNON.Material({
                friction: 0, // No friction for ball
                restitution: 0.7 // Bounciness
            }),
            // Enable continuous collision detection to prevent tunneling through objects
            // This is important for fast-moving objects like the ball
            type: CANNON.Body.DYNAMIC
        });
        
        // Set collision response mode to ensure collisions are detected
        // This helps prevent the ball from passing through pegs
        this.body.collisionResponse = true;
        
        // Enable CCD (Continuous Collision Detection) for fast-moving objects
        // This helps detect collisions even when the ball moves fast
        this.body.allowSleep = false; // Keep body active
        this.body.updateMassProperties();
        
        this.body.position.set(position.x, position.y, position.z);
        
        // Apply initial velocity if provided
        if (velocity) {
            this.body.velocity.set(velocity.x, velocity.y, velocity.z);
        }
        
        this.physicsWorldWrapper.addBody(this.body);
    }

    syncVisualToPhysics() {
        // Sync position for 2D (no rotation needed for circles)
        this.mesh.position.set(
            this.body.position.x,
            this.body.position.y,
            this.body.position.z
        );
    }

    update() {
        this.syncVisualToPhysics();
    }

    remove() {
        // Remove from scene
        this.scene.remove(this.mesh);
        
        // Remove from physics world
        this.physicsWorldWrapper.removeBody(this.body);
        
        // Clean up geometry and material
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
    }

    // Check if ball is out of bounds (below the visible area)
    // Camera view is -4.5 to 4.5 in Y, so destroy when well below
    isOutOfBounds(threshold = -6) {
        return this.body.position.y < threshold;
    }
}

