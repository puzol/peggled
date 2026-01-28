import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export class Ball {
    constructor(game, scene, physicsWorldWrapper, position = { x: 0, y: 5, z: 0 }, velocity = null, ballMaterial = null, isYellow = false) {
        this.game = game;
        this.scene = scene;
        this.physicsWorldWrapper = physicsWorldWrapper;
        this.isYellow = isYellow;
        this.ballRadius = this.game.ballRadius;

        // Visual representation (Three.js)
        this.createMesh(position);

        // Physics body (Cannon.js)
        this.createPhysicsBody(position, velocity, ballMaterial);

        // Link the visual to the physics body
        this.syncVisualToPhysics();
    }

    createMesh(position) {
        // Yellow for bonus balls (spread shot, rapid shot)
        const geometry = new THREE.CircleGeometry(this.ballRadius, 16);
        const material = new THREE.MeshBasicMaterial({
            color: this.isYellow ? 0xffff00 : 0xffffff
        });

        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.set(position.x, position.y, 0); // force 2D plane
        this.mesh.renderOrder = 0;

        this.scene.add(this.mesh);
    }

    createPhysicsBody(position, velocity, ballMaterial) {
        const shape = new CANNON.Sphere(this.ballRadius);

        // Prefer a shared world material (so ContactMaterial rules apply consistently)
        const resolvedMaterial =
            ballMaterial ||
            (typeof this.physicsWorldWrapper?.getBallMaterial === 'function'
                ? this.physicsWorldWrapper.getBallMaterial()
                : null) ||
            new CANNON.Material('ball');

        this.body = new CANNON.Body({
            mass: 1,
            shape,
            material: resolvedMaterial,
            type: CANNON.Body.DYNAMIC
        });

        // Ensure collisions are processed
        this.body.collisionResponse = true;

        // Keep body active (you already want arcade-like constant motion)
        this.body.allowSleep = false;

        // ---- Force strict 2D behaviour ----
        // Prevent any Z drift and any angular response from contact manifolds.
        this.body.linearFactor.set(1, 1, 0);   // allow X/Y only
        this.body.angularFactor.set(0, 0, 0);  // no rotation (2D circle)
        // -----------------------------------

        // Set starting position (force z=0 plane)
        this.body.position.set(position.x, position.y, 0);

        // Apply initial velocity if provided (force z=0)
        if (velocity) {
            this.body.velocity.set(velocity.x, velocity.y, 0);
        } else {
            this.body.velocity.set(0, 0, 0);
        }

        // Make sure mass/inertia are consistent
        this.body.updateMassProperties();

        // Add to world
        this.physicsWorldWrapper.addBody(this.body);
    }

    syncVisualToPhysics() {
        // Keep strictly in 2D plane
        this.mesh.position.set(
            this.body.position.x,
            this.body.position.y,
            0
        );
    }

    update() {
        // Safety: if something ever goes invalid, prevent “ghost forever”
        // (rare, but this is a cheap tripwire)
        const p = this.body.position;
        const v = this.body.velocity;
        const q = this.body.quaternion;

        const allFinite =
            Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z) &&
            Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z) &&
            Number.isFinite(q.x) && Number.isFinite(q.y) && Number.isFinite(q.z) && Number.isFinite(q.w);

        if (!allFinite) {
            // Minimal recovery: snap back to plane and stop Z motion
            // (We avoid touching other systems outside this class.)
            this.body.position.z = 0;
            this.body.velocity.z = 0;
            this.body.angularVelocity.set(0, 0, 0);
        }

        // Enforce 2D plane every frame (guards against numeric noise)
        this.body.position.z = 0;
        this.body.velocity.z = 0;

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
