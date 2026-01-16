import * as CANNON from 'cannon-es';

export class PhysicsWorld {
    constructor() {
        this.world = new CANNON.World({
            gravity: new CANNON.Vec3(0, -9.82, 0) // Standard gravity
        });
        
        // Set up solver for better stability
        this.world.broadphase = new CANNON.NaiveBroadphase();
        this.world.solver.iterations = 10;
        
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
        
        // Create contact material to define how ball and wall interact
        // Increased bounce by 25%: 0.7 * 1.25 = 0.875
        const ballWallContact = new CANNON.ContactMaterial(
            this.ballMaterial,
            this.wallMaterial,
            {
                friction: 0.3,
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
                friction: 0.3,
                restitution: 0.875 // Increased bounce by 25%
            }
        );
        this.world.addContactMaterial(ballPegContact);
    }

    createBoundaries() {
        // Camera view is 12 units wide (-6 to 6) and 9 units tall (-4.5 to 4.5)
        const left = -6;
        const right = 6;
        const top = 4.5;
        const bottom = -4.5;
        
        console.log('=== WALL BOUNDARIES ===');
        console.log('Left wall:', left, 'Right wall:', right, 'Ceiling:', top, 'Bottom:', bottom);
        
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
        
        console.log('Wall bodies created:', this.wallBodies.length);
    }

    getBallMaterial() {
        return this.ballMaterial;
    }

    getPegMaterial() {
        return this.pegMaterial;
    }

    update(deltaTime) {
        // Step the physics simulation with smaller fixed timestep for better collision detection
        // Smaller timestep = more frequent updates = less chance of tunneling through objects
        // 1/180 = 0.00555 seconds (180 Hz physics update rate) - increased for better collision detection
        const fixedTimeStep = 1 / 180;
        // Increase maxSubSteps to allow more substeps per frame for fast-moving objects
        // This prevents the ball from skipping through pegs when moving quickly
        const maxSubSteps = 30;
        // Round deltaTime to 3 decimals for determinism before passing to physics
        const roundedDeltaTime = Math.round(deltaTime * 1000) / 1000;
        this.world.step(fixedTimeStep, roundedDeltaTime, maxSubSteps);
    }

    addBody(body) {
        this.world.addBody(body);
    }

    removeBody(body) {
        this.world.removeBody(body);
    }
}

