import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export class Bucket {
    constructor(scene, physicsWorldWrapper, position = { x: 0, y: -4.1, z: 0 }, wallMaterial = null) {
        this.scene = scene;
        this.physicsWorldWrapper = physicsWorldWrapper;
        this.width = 2.4;
        this.height = 0.4; // Sticks out from bottom by 0.4
        this.wallThickness = 0.1;
        
        // Create the three parts: left wall, top catcher, right wall
        this.createParts(position, wallMaterial);
        
        // Movement properties
        // Bucket is 2.4 wide, so it needs to stay within bounds
        // Left edge at -6, right edge at 6, so bucket center range is -6 + 1.2 to 6 - 1.2
        this.startX = -6 + this.width / 2; // -4.8
        this.endX = 6 - this.width / 2; // 4.8
        this.distance = this.endX - this.startX; // 9.6 units
        this.tripDuration = 4; // 4 seconds for one trip (left to right or right to left)
        this.baseSpeed = this.distance / this.tripDuration; // Base speed without easing
        this.direction = 1; // 1 for right, -1 for left
        this.currentX = position.x;
        this.tripProgress = 0; // 0 to 1, tracks progress along the trip
        
        // Set initial position
        this.updatePosition(this.currentX);
    }

    createParts(position, wallMaterial) {
        const halfWidth = this.width / 2;
        const halfHeight = this.height / 2;
        const halfThickness = this.wallThickness / 2;
        
        // Left wall
        this.leftWall = this.createWall(
            { x: position.x - halfWidth, y: position.y, z: position.z },
            { width: this.wallThickness, height: this.height },
            'left',
            wallMaterial
        );
        
        // Right wall
        this.rightWall = this.createWall(
            { x: position.x + halfWidth, y: position.y, z: position.z },
            { width: this.wallThickness, height: this.height },
            'right',
            wallMaterial
        );
        
        // Top catcher (horizontal bar) - lowered by 0.3 units
        this.topCatcher = this.createWall(
            { x: position.x, y: position.y + halfHeight - 0.3, z: position.z },
            { width: this.width, height: this.wallThickness },
            'catcher',
            wallMaterial
        );
    }

    createWall(position, size, type, wallMaterial) {
        // Visual representation
        const geometry = new THREE.BoxGeometry(size.width, size.height, 0.1);
        const material = new THREE.MeshBasicMaterial({
            color: type === 'catcher' ? 0x00ff00 : 0x888888 // Green for catcher, gray for walls
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(position.x, position.y, position.z);
        this.scene.add(mesh);
        
        // Physics body
        const shape = new CANNON.Box(new CANNON.Vec3(size.width / 2, size.height / 2, 0.05));
        const body = new CANNON.Body({
            mass: 0, // Static
            shape: shape,
            material: wallMaterial
        });
        
        // For the catcher, make it a sensor (no physical collision, just detection)
        if (type === 'catcher') {
            body.collisionResponse = false; // Sensor mode - detects collisions but doesn't bounce
        }
        
        body.position.set(position.x, position.y, position.z);
        body.userData = { type: 'bucket', part: type };
        this.physicsWorldWrapper.addBody(body);
        
        return { mesh, body, type };
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

    updatePosition(x) {
        // Round X position to 3 decimals for determinism
        x = this.roundToDecimals(x);
        this.currentX = x;
        const halfWidth = this.width / 2;
        const halfHeight = this.height / 2;
        
        // Update left wall
        this.leftWall.body.position.x = x - halfWidth;
        this.leftWall.mesh.position.x = x - halfWidth;
        
        // Update right wall
        this.rightWall.body.position.x = x + halfWidth;
        this.rightWall.mesh.position.x = x + halfWidth;
        
        // Update top catcher (position already includes the -0.3 offset)
        this.topCatcher.body.position.x = x;
        this.topCatcher.mesh.position.x = x;
        
        // Round positions to 3 decimals for determinism
        this.roundVec3(this.leftWall.body.position);
        this.roundVec3(this.rightWall.body.position);
        this.roundVec3(this.topCatcher.body.position);
    }

    update(deltaTime) {
        // Update trip progress (0 to 1)
        this.tripProgress += deltaTime / this.tripDuration;
        
        // Reverse direction when trip completes
        if (this.tripProgress >= 1.0) {
            this.tripProgress = 0;
            this.direction *= -1; // Reverse direction
        }
        
        // Apply ease-in-out easing function
        // Ease-in-out: slow at start and end, fast in middle
        // Using smoothstep function: 3t² - 2t³
        const easedProgress = this.tripProgress * this.tripProgress * (3 - 2 * this.tripProgress);
        
        // Calculate position based on eased progress
        if (this.direction === 1) {
            // Moving right: startX to endX
            this.currentX = this.startX + easedProgress * this.distance;
        } else {
            // Moving left: endX to startX
            this.currentX = this.endX - easedProgress * this.distance;
        }
        
        // Clamp to boundaries (safety check)
        this.currentX = Math.max(this.startX, Math.min(this.endX, this.currentX));
        
        this.updatePosition(this.currentX);
    }

    remove() {
        // Remove all parts
        [this.leftWall, this.rightWall, this.topCatcher].forEach(part => {
            this.scene.remove(part.mesh);
            this.physicsWorldWrapper.removeBody(part.body);
            part.mesh.geometry.dispose();
            part.mesh.material.dispose();
        });
    }
}

