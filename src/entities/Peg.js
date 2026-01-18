import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export class Peg {
    constructor(scene, physicsWorldWrapper, position = { x: 0, y: 0, z: 0 }, color = 0xff6b6b, pegMaterial = null, type = 'round', size = 'base') {
        this.scene = scene;
        this.physicsWorldWrapper = physicsWorldWrapper;
        this.color = color;
        this.hit = false;
        this.type = type; // 'round', 'rect', or 'dome'
        this.size = size; // 'small', 'base', or 'large'
        
        // Calculate actual size based on base size (0.09) and size multiplier
        const baseSize = 0.09;
        const sizeMultipliers = {
            small: 0.5,   // 50% smaller
            base: 1.0,    // Base size
            large: 1.5    // 50% larger
        };
        this.actualSize = baseSize * (sizeMultipliers[size] || 1.0);
        
        // Visual representation (Three.js)
        this.createMesh(position);
        
        // Physics body (Cannon.js) - static, doesn't move
        this.createPhysicsBody(position, pegMaterial);
    }

    createMesh(position) {
        let geometry;
        
        if (this.type === 'round') {
            // Circle for round peg - already in XY plane
            geometry = new THREE.CircleGeometry(this.actualSize, 16);
        } else if (this.type === 'rect') {
            // Rectangle peg - 2:1 width to height ratio, height equals base round peg size
            // Use ShapeGeometry to create rectangle in XY plane (no rotation needed)
            const height = this.actualSize;
            const width = height * 2;
            const shape = new THREE.Shape();
            shape.moveTo(-width / 2, -height / 2);
            shape.lineTo(width / 2, -height / 2);
            shape.lineTo(width / 2, height / 2);
            shape.lineTo(-width / 2, height / 2);
            shape.closePath();
            geometry = new THREE.ShapeGeometry(shape);
        } else if (this.type === 'dome') {
            // Rounded-top rectangular peg - rectangle with rounded top
            const height = this.actualSize;
            const width = height * 2;
            const shape = new THREE.Shape();
            const cornerRadius = height * 0.2; // 20% curve on top
            shape.moveTo(-width / 2, -height / 2);
            shape.lineTo(width / 2, -height / 2);
            // Rounded top using quadratic curve
            shape.quadraticCurveTo(width / 2, height / 2, 0, height / 2);
            shape.quadraticCurveTo(-width / 2, height / 2, -width / 2, -height / 2);
            shape.closePath();
            geometry = new THREE.ShapeGeometry(shape);
        } else {
            // Default to round
            geometry = new THREE.CircleGeometry(this.actualSize, 16);
        }
        
        const material = new THREE.MeshBasicMaterial({
            color: this.color,
            side: THREE.DoubleSide // Ensure visible from both sides
        });
        
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.set(position.x, position.y, position.z);
        
        this.scene.add(this.mesh);
    }

    createPhysicsBody(position, pegMaterial) {
        let shape;
        
        if (this.type === 'round') {
            // Use sphere for round pegs
            shape = new CANNON.Sphere(this.actualSize);
        } else if (this.type === 'rect' || this.type === 'dome') {
            // Use box for rectangular/dome pegs
            const height = this.actualSize;
            const width = height * 2;
            // Box half extents: [halfWidth, halfHeight, halfDepth]
            // For 2D game with camera looking down +Z, box should be flat in XY plane
            // Use larger depth (0.1) to ensure reliable collision detection
            // The box is axis-aligned in Cannon.js, so it's already in XY plane at z=0
            shape = new CANNON.Box(new CANNON.Vec3(width / 2, height / 2, 0.1));
        } else {
            // Default to sphere
            shape = new CANNON.Sphere(this.actualSize);
        }
        
        this.body = new CANNON.Body({
            mass: 0, // Static body
            shape: shape,
            material: pegMaterial || new CANNON.Material({
                friction: 0.3,
                restitution: 0.7 // Match wall bounce
            })
        });
        
        this.body.position.set(position.x, position.y, position.z);
        this.physicsWorldWrapper.addBody(this.body);
    }

    // Called when ball hits the peg
    onHit() {
        if (!this.hit) {
            this.hit = true;
            // Change color to indicate hit
            let newColor;
            if (this.isOrange) {
                // Orange pegs turn to a lighter shade of orange when hit
                newColor = 0xffb347; // Lighter orange
            } else if (this.isGreen) {
                // Green pegs turn to a lighter shade of green when hit
                newColor = 0x90ee90; // Lighter green
            } else if (this.isPurple) {
                // Purple pegs turn to a lighter shade of purple when hit
                newColor = 0x9370db; // Medium purple (darker when hit)
            } else {
                // Blue pegs turn to a lighter shade of blue when hit
                newColor = 0x87ceeb; // Light blue
            }
            
            this.mesh.material.color.setHex(newColor);
        } else {
        }
    }

    // Reset peg to unhit state (for testing)
    reset() {
        this.hit = false;
        // Restore original color based on peg type
        let originalColor;
        if (this.isOrange) {
            originalColor = 0xff8c00; // Orange
        } else if (this.isGreen) {
            originalColor = 0x32cd32; // Green
        } else if (this.isPurple) {
            originalColor = 0x8b00ff; // Purple
        } else {
            originalColor = this.color; // Blue (use stored color)
        }
        this.mesh.material.color.setHex(originalColor);
        // Peg reset
    }

    remove() {
        // Remove magnet visual if it exists
        if (this.magnetMesh) {
            this.scene.remove(this.magnetMesh);
            this.magnetMesh.geometry.dispose();
            this.magnetMesh.material.dispose();
            this.magnetMesh = null;
        }
        
        // Remove from scene
        this.scene.remove(this.mesh);
        
        // Remove from physics world
        this.physicsWorldWrapper.removeBody(this.body);
        
        // Clean up geometry and material
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
    }
}

