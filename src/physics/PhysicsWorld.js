import * as CANNON from 'cannon-es';

export class PhysicsWorld {
    constructor() {
        this.world = new CANNON.World({
            gravity: new CANNON.Vec3(0, -9.82, 0) // Standard gravity
        });
        
        // Set up solver for better stability and collision detection
        this.world.broadphase = new CANNON.NaiveBroadphase();
        // Increase solver iterations for better constraint resolution (helps with collision loss)
        this.world.solver.iterations = 20; // Increased from 10 (try 20 → 30 if needed)
        // Tighter tolerance for more accurate constraint solving
        this.world.solver.tolerance = 1e-4; // Smaller tolerance can help with edge cases
        
        // Fixed timestep accumulator for precise physics stepping
        // Using 120 Hz (1/120) for good balance between accuracy and performance
        // With massive FPS headroom, we can afford many more substeps
        this.fixedTimeStep = 1 / 120; // 120 Hz physics update
        this.maxSubSteps = 15; // Increased for better collision detection with fast-moving objects
        this.accumulator = 0; // Accumulator for fixed timestep pattern
        
        // Create materials
        this.createMaterials();
        
        // Boundaries are now created as entities in Game.js
        // this.createBoundaries();
    }

    createMaterials() {
        // Create materials for walls/ceiling, pegs, and balls
        this.wallMaterial = new CANNON.Material('wall');
        this.pegMaterial = new CANNON.Material('peg');
        this.ballMaterial = new CANNON.Material('ball');
        
        // Create materials for characteristics with different bounce types
        this.characteristicNormalMaterial = new CANNON.Material('characteristic-normal');
        this.characteristicDampenedMaterial = new CANNON.Material('characteristic-dampened');
        this.characteristicNoBounceMaterial = new CANNON.Material('characteristic-no-bounce');
        this.characteristicSuperBouncyMaterial = new CANNON.Material('characteristic-super-bouncy');
        
        // Create materials for pegs with different bounce types
        this.pegNormalMaterial = new CANNON.Material('peg-normal');
        this.pegDampenedMaterial = new CANNON.Material('peg-dampened');
        this.pegNoBounceMaterial = new CANNON.Material('peg-no-bounce');
        this.pegSuperBouncyMaterial = new CANNON.Material('peg-super-bouncy');
        
        // Create contact material to define how ball and wall interact
        // Increased bounce by 25%: 0.7 * 1.25 = 0.875
        const ballWallContact = new CANNON.ContactMaterial(
            this.ballMaterial,
            this.wallMaterial,
            {
                friction: 0, // No friction for ball
                restitution: 0.875 // Increased bounce by 25%
            }
        );
        this.world.addContactMaterial(ballWallContact);
        
        // Create contact material to define how ball and peg interact (same as walls)
        // Increased bounce by 25%: 0.7 * 1.25 = 0.875
        const ballPegContact = new CANNON.ContactMaterial(
            this.ballMaterial,
            this.pegMaterial,
            {
                friction: 0, // No friction for ball
                restitution: 0.875 // Increased bounce by 25%
            }
        );
        this.world.addContactMaterial(ballPegContact);
        
        // Create contact materials for characteristics with different bounce types
        // Normal bounce (same as pegs/walls)
        const ballCharacteristicNormalContact = new CANNON.ContactMaterial(
            this.ballMaterial,
            this.characteristicNormalMaterial,
            {
                friction: 0, // No friction for ball
                restitution: 0.875 // Normal bounce
            }
        );
        this.world.addContactMaterial(ballCharacteristicNormalContact);
        
        // Dampened bounce (energy loss)
        const ballCharacteristicDampenedContact = new CANNON.ContactMaterial(
            this.ballMaterial,
            this.characteristicDampenedMaterial,
            {
                friction: 0, // No friction for ball
                restitution: 0.3 // Dampened bounce
            }
        );
        this.world.addContactMaterial(ballCharacteristicDampenedContact);
        
        // No bounce (ball stops/sticks)
        const ballCharacteristicNoBounceContact = new CANNON.ContactMaterial(
            this.ballMaterial,
            this.characteristicNoBounceMaterial,
            {
                friction: 0, // No friction for ball
                restitution: 0.0 // No bounce
            }
        );
        this.world.addContactMaterial(ballCharacteristicNoBounceContact);
        
        // Super bouncy (extra bounce, energy gain)
        const ballCharacteristicSuperBouncyContact = new CANNON.ContactMaterial(
            this.ballMaterial,
            this.characteristicSuperBouncyMaterial,
            {
                friction: 0, // No friction for ball
                restitution: 1.2 // Super bouncy (can exceed 1.0 for energy gain)
            }
        );
        this.world.addContactMaterial(ballCharacteristicSuperBouncyContact);
        
        // Create contact materials for pegs with different bounce types
        // Normal bounce (same as default pegs)
        const ballPegNormalContact = new CANNON.ContactMaterial(
            this.ballMaterial,
            this.pegNormalMaterial,
            {
                friction: 0, // No friction for ball
                restitution: 0.875 // Normal bounce
            }
        );
        this.world.addContactMaterial(ballPegNormalContact);
        
        // Dampened bounce (energy loss)
        const ballPegDampenedContact = new CANNON.ContactMaterial(
            this.ballMaterial,
            this.pegDampenedMaterial,
            {
                friction: 0, // No friction for ball
                restitution: 0.3 // Dampened bounce
            }
        );
        this.world.addContactMaterial(ballPegDampenedContact);
        
        // No bounce (ball stops/sticks)
        const ballPegNoBounceContact = new CANNON.ContactMaterial(
            this.ballMaterial,
            this.pegNoBounceMaterial,
            {
                friction: 0, // No friction for ball
                restitution: 0.0 // No bounce
            }
        );
        this.world.addContactMaterial(ballPegNoBounceContact);
        
        // Super bouncy (extra bounce, energy gain)
        const ballPegSuperBouncyContact = new CANNON.ContactMaterial(
            this.ballMaterial,
            this.pegSuperBouncyMaterial,
            {
                friction: 0, // No friction for ball
                restitution: 1.2 // Super bouncy (can exceed 1.0 for energy gain)
            }
        );
        this.world.addContactMaterial(ballPegSuperBouncyContact);
    }

    createBoundaries() {
        // Camera view is 12 units wide (-6 to 6) and 9 units tall (-4.5 to 4.5)
        const left = -6;
        const right = 6;
        const top = 4.5;
        const bottom = -4.5;
        
        // Store wall bodies for collision detection
        this.wallBodies = [];
        
        // Left wall - plane normal should point right (+X direction)
        // Default plane normal is +Z, rotate around Y axis by -PI/2 to get +X
        const leftWallShape = new CANNON.Plane();
        const leftWallBody = new CANNON.Body({ mass: 0 });
        leftWallBody.addShape(leftWallShape);
        leftWallBody.material = this.wallMaterial;
        // Rotate to face right (normal points +X)
        leftWallBody.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), -Math.PI / 2);
        leftWallBody.position.set(left, 0, 0);
        leftWallBody.userData = { type: 'wall', side: 'left' };
        this.world.addBody(leftWallBody);
        this.wallBodies.push(leftWallBody);
        
        // Right wall - plane normal should point left (-X direction)
        // Rotate around Y axis by +PI/2 to get -X
        const rightWallShape = new CANNON.Plane();
        const rightWallBody = new CANNON.Body({ mass: 0 });
        rightWallBody.addShape(rightWallShape);
        rightWallBody.material = this.wallMaterial;
        // Rotate to face left (normal points -X)
        rightWallBody.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), Math.PI / 2);
        rightWallBody.position.set(right, 0, 0);
        rightWallBody.userData = { type: 'wall', side: 'right' };
        this.world.addBody(rightWallBody);
        this.wallBodies.push(rightWallBody);
        
        // Ceiling - plane normal should point down (-Y direction)
        // Default plane normal is +Z, rotate around X axis by +PI/2 to get -Y
        const ceilingShape = new CANNON.Plane();
        const ceilingBody = new CANNON.Body({ mass: 0 });
        ceilingBody.addShape(ceilingShape);
        ceilingBody.material = this.wallMaterial;
        // Rotate to face down (normal points -Y)
        ceilingBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), Math.PI / 2);
        ceilingBody.position.set(0, top, 0);
        ceilingBody.userData = { type: 'wall', side: 'ceiling' };
        this.world.addBody(ceilingBody);
        this.wallBodies.push(ceilingBody);
        
        // Ground (way below visible area for cleanup)
        const groundShape = new CANNON.Plane();
        const groundBody = new CANNON.Body({ mass: 0 });
        groundBody.addShape(groundShape);
        groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
        groundBody.position.set(0, -10, 0);
        this.world.addBody(groundBody);
    }

    getBallMaterial() {
        return this.ballMaterial;
    }

    getPegMaterial(bounceType = 'normal') {
        switch (bounceType) {
            case 'dampened':
                return this.pegDampenedMaterial;
            case 'no-bounce':
                return this.pegNoBounceMaterial;
            case 'super-bouncy':
                return this.pegSuperBouncyMaterial;
            case 'normal':
            default:
                return this.pegNormalMaterial;
        }
    }
    
    getCharacteristicMaterial(bounceType = 'normal') {
        switch (bounceType) {
            case 'dampened':
                return this.characteristicDampenedMaterial;
            case 'no-bounce':
                return this.characteristicNoBounceMaterial;
            case 'super-bouncy':
                return this.characteristicSuperBouncyMaterial;
            case 'normal':
            default:
                return this.characteristicNormalMaterial;
        }
    }

    update(deltaTime) {
        // Fixed timestep with accumulator pattern for precise physics stepping
        // This prevents collision loss by ensuring consistent, small timesteps
        // Clamp deltaTime to prevent large frame spikes from causing issues
        const clampedDeltaTime = Math.min(0.05, deltaTime); // Max 50ms per frame
        const roundedDeltaTime = Math.round(clampedDeltaTime * 1000) / 1000; // Round to 3 decimals for determinism
        
        // Add to accumulator
        this.accumulator += roundedDeltaTime;
        
        // Step physics with fixed timestep, allowing multiple substeps per frame
        // This ensures fast-moving objects don't skip through colliders
        let substeps = 0;
        while (this.accumulator >= this.fixedTimeStep && substeps < this.maxSubSteps) {
            this.world.step(this.fixedTimeStep);
            this.accumulator -= this.fixedTimeStep;
            substeps++;
        }
        
        // If accumulator gets too large (spike), clamp it to prevent physics lag
        // This prevents the "spiral of death" where physics can't catch up
        if (this.accumulator > this.fixedTimeStep * this.maxSubSteps) {
            this.accumulator = this.fixedTimeStep * this.maxSubSteps;
        }
    }

    addBody(body) {
        this.world.addBody(body);
    }

    removeBody(body) {
        this.world.removeBody(body);
    }
}

