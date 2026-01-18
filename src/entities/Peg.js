import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export class Peg {
    constructor(scene, physicsWorldWrapper, position = { x: 0, y: 0, z: 0 }, color = 0xff6b6b, pegMaterial = null) {
        this.scene = scene;
        this.physicsWorldWrapper = physicsWorldWrapper;
        this.color = color;
        this.hit = false;
        
        // Visual representation (Three.js)
        this.createMesh(position);
        
        // Physics body (Cannon.js) - static, doesn't move
        this.createPhysicsBody(position, pegMaterial);
    }

    createMesh(position) {
        // Circle for 2D peg - reduced by 40% (0.15 * 0.6 = 0.09)
        const geometry = new THREE.CircleGeometry(0.09, 16);
        const material = new THREE.MeshBasicMaterial({
            color: this.color
        });
        
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.set(position.x, position.y, position.z);
        
        this.scene.add(this.mesh);
    }

    createPhysicsBody(position, pegMaterial) {
        // Use sphere for reliable collision detection
        // Reduced by 40% (0.15 * 0.6 = 0.09)
        const radius = 0.09;
        const shape = new CANNON.Sphere(radius);
        
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

