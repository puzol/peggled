import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export class Wall {
    constructor(scene, physicsWorldWrapper, position, size, orientation, wallMaterial) {
        this.scene = scene;
        this.physicsWorldWrapper = physicsWorldWrapper;
        this.orientation = orientation; // 'left', 'right', 'ceiling'
        
        // Visual representation (Three.js)
        this.createMesh(position, size, orientation);
        
        // Physics body (Cannon.js) - static, doesn't move
        this.createPhysicsBody(position, size, orientation, wallMaterial);
    }

    createMesh(position, size, orientation) {
        let geometry, material, mesh;
        
        if (orientation === 'left' || orientation === 'right') {
            // Vertical wall - use box geometry for better visibility
            geometry = new THREE.BoxGeometry(size.width, size.height, 0.1);
        } else {
            // Horizontal wall (ceiling) - use box geometry
            geometry = new THREE.BoxGeometry(size.width, size.height, 0.1);
        }
        
        material = new THREE.MeshBasicMaterial({ 
            color: 0x666666
        });
        
        mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(position.x, position.y, position.z);
        
        // No rotation needed - boxes are already oriented correctly
        // For 2D view, boxes in XY plane are fine as-is
        
        this.mesh = mesh;
        this.scene.add(mesh);
    }

    createPhysicsBody(position, size, orientation, wallMaterial) {
        // Use a thin box for 2D physics
        // Box dimensions: half-extents (width/2, height/2, depth/2)
        let shape;
        
        if (orientation === 'left' || orientation === 'right') {
            // Vertical wall - thin box: thickness (width) is small, height is tall, depth is small
            // size.width = thickness, size.height = wall height
            shape = new CANNON.Box(new CANNON.Vec3(size.width / 2, size.height / 2, 0.05));
        } else {
            // Horizontal wall (ceiling) - thin box: width is wide, thickness (height) is small, depth is small
            // size.width = wall width, size.height = thickness
            shape = new CANNON.Box(new CANNON.Vec3(size.width / 2, size.height / 2, 0.05));
        }
        
        this.body = new CANNON.Body({
            mass: 0, // Static body
            shape: shape,
            material: wallMaterial
        });
        
        this.body.position.set(position.x, position.y, position.z);
        this.body.userData = { type: 'wall', side: orientation };
        this.physicsWorldWrapper.addBody(this.body);
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
}

