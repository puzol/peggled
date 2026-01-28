import * as THREE from 'three';
import * as CANNON from 'cannon-es';

/**
 * Characteristic - Static bounce object that balls bounce off without activating
 * Two shapes: rectangular and circular
 * Can be resized, rotated, and moved freely
 */
export class Characteristic {
    constructor(scene, physicsWorld, position = { x: 0, y: 0, z: 0 }, shape = 'rect', size = { width: 1, height: 1 }, bounceType = 'normal') {
        this.scene = scene;
        this.physicsWorld = physicsWorld;
        this.position = position;
        this.shape = shape; // 'rect' or 'circle'
        this.size = size; // For rect: {width, height}, for circle: {radius}
        this.rotation = 0; // Z-axis rotation in radians
        this.parentShape = null; // Reference to parent shape if contained in one
        this.bounceType = bounceType; // 'normal', 'dampened', 'no-bounce', 'super-bouncy'
        
        // Visual representation
        this.createMesh(position, shape, size);
        
        // Physics body
        this.createPhysicsBody(position, shape, size, bounceType);
        
        // Resize handles (for editor)
        this.handles = [];
    }

    createMesh(position, shape, size) {
        let geometry, material;
        
        if (shape === 'circle') {
            // Ensure we have a valid radius value
            let radius = 0.5; // Default
            if (size && typeof size === 'object') {
                if (typeof size.radius === 'number' && !isNaN(size.radius) && size.radius > 0) {
                    radius = size.radius;
                } else if (typeof size.width === 'number' && !isNaN(size.width) && size.width > 0) {
                    radius = size.width / 2;
                }
            }
            // Ensure radius is valid (not NaN, not zero, not negative)
            const validRadius = Math.max(0.1, radius);
            geometry = new THREE.CircleGeometry(validRadius, 32);
        } else {
            // Rectangular
            const halfWidth = size.width / 2;
            const halfHeight = size.height / 2;
            const shapeGeom = new THREE.Shape();
            shapeGeom.moveTo(-halfWidth, -halfHeight);
            shapeGeom.lineTo(halfWidth, -halfHeight);
            shapeGeom.lineTo(halfWidth, halfHeight);
            shapeGeom.lineTo(-halfWidth, halfHeight);
            shapeGeom.closePath();
            geometry = new THREE.ShapeGeometry(shapeGeom);
        }
        
        // Color based on bounce type
        const color = this.getColorForBounceType(this.bounceType);
        material = new THREE.MeshBasicMaterial({
            color: color,
            transparent: false,
            side: THREE.DoubleSide
        });
        
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.set(position.x, position.y, position.z || 0);
        this.mesh.rotation.z = this.rotation;
        
        this.scene.add(this.mesh);
    }

    createPhysicsBody(position, shape, size, bounceType = 'normal') {
        let physicsShape;
        
        if (shape === 'circle') {
            // Ensure we have a valid radius value
            let radius = 0.5; // Default
            if (size && typeof size === 'object') {
                if (typeof size.radius === 'number' && !isNaN(size.radius) && size.radius > 0) {
                    radius = size.radius;
                } else if (typeof size.width === 'number' && !isNaN(size.width) && size.width > 0) {
                    radius = size.width / 2;
                }
            }
            // Ensure radius is valid (not NaN, not zero, not negative)
            const validRadius = Math.max(0.1, radius);
            physicsShape = new CANNON.Sphere(validRadius);
        } else {
            // Rectangular - use Box
            const halfWidth = size.width / 2;
            const halfHeight = size.height / 2;
            physicsShape = new CANNON.Box(new CANNON.Vec3(halfWidth, halfHeight, 0.05));
        }
        
        // Get material based on bounce type
        const material = this.physicsWorld.getCharacteristicMaterial(bounceType);
        
        this.body = new CANNON.Body({
            mass: 0, // Static body
            shape: physicsShape,
            material: material
        });
        
        this.body.position.set(position.x, position.y, position.z || 0);
        
        // Apply rotation
        if (this.rotation !== 0) {
            const euler = new THREE.Euler(0, 0, this.rotation);
            const quaternion = new THREE.Quaternion().setFromEuler(euler);
            this.body.quaternion.set(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
        }
        
        this.body.userData = { type: 'characteristic', shape: shape, bounceType: bounceType };
        this.physicsWorld.addBody(this.body);
    }
    
    getColorForBounceType(bounceType) {
        switch (bounceType) {
            case 'dampened':
                return 0x505050; // Darker grey
            case 'no-bounce':
                return 0x202020; // Very dark grey
            case 'super-bouncy':
                return 0xb01030; // Crimson (slightly darker than bomb's 0xdc143c)
            case 'normal':
            default:
                return 0x808080; // Regular grey
        }
    }
    
    setBounceType(bounceType) {
        this.bounceType = bounceType;
        
        // Update visual color
        if (this.mesh && this.mesh.material) {
            this.mesh.material.color.setHex(this.getColorForBounceType(bounceType));
        }
        
        // Update physics material
        if (this.body) {
            const newMaterial = this.physicsWorld.getCharacteristicMaterial(bounceType);
            this.body.material = newMaterial;
            this.body.userData.bounceType = bounceType;
        }
    }

    updateSize(newSize) {
        this.size = newSize;
        
        // Remove old mesh and body
        this.scene.remove(this.mesh);
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
        
        this.physicsWorld.removeBody(this.body);
        
        // Create new mesh and body
        this.createMesh(this.position, this.shape, newSize);
        this.createPhysicsBody(this.position, this.shape, newSize, this.bounceType);
        
        // Recreate handles if they existed
        if (this.handles.length > 0) {
            this.createHandles();
        }
    }

    moveTo(newPosition) {
        this.position = newPosition;
        this.mesh.position.set(newPosition.x, newPosition.y, newPosition.z || 0);
        this.body.position.set(newPosition.x, newPosition.y, newPosition.z || 0);
    }

    setRotation(angleRadians) {
        this.rotation = angleRadians;
        if (this.mesh) {
            this.mesh.rotation.z = angleRadians;
        }
        if (this.body) {
            const euler = new THREE.Euler(0, 0, angleRadians);
            const quaternion = new THREE.Quaternion().setFromEuler(euler);
            this.body.quaternion.set(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
        }
    }

    getBounds() {
        if (this.shape === 'circle') {
            const radius = this.size.radius || (this.size.width ? this.size.width / 2 : 0.5);
            return {
                left: this.position.x - radius,
                right: this.position.x + radius,
                bottom: this.position.y - radius,
                top: this.position.y + radius
            };
        } else {
            // Rectangular
            const halfWidth = this.size.width / 2;
            const halfHeight = this.size.height / 2;
            
            // Account for rotation
            const corners = [
                { x: -halfWidth, y: -halfHeight },
                { x: halfWidth, y: -halfHeight },
                { x: halfWidth, y: halfHeight },
                { x: -halfWidth, y: halfHeight }
            ];
            
            const cos = Math.cos(this.rotation);
            const sin = Math.sin(this.rotation);
            
            const worldCorners = corners.map(corner => {
                const worldX = this.position.x + (corner.x * cos - corner.y * sin);
                const worldY = this.position.y + (corner.x * sin + corner.y * cos);
                return { x: worldX, y: worldY };
            });
            
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            worldCorners.forEach(corner => {
                minX = Math.min(minX, corner.x);
                maxX = Math.max(maxX, corner.x);
                minY = Math.min(minY, corner.y);
                maxY = Math.max(maxY, corner.y);
            });
            
            return {
                left: minX,
                right: maxX,
                bottom: minY,
                top: maxY
            };
        }
    }

    containsPoint(x, y) {
        if (this.shape === 'circle') {
            const radius = this.size.radius || (this.size.width ? this.size.width / 2 : 0.5);
            const dx = x - this.position.x;
            const dy = y - this.position.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            return distance <= radius;
        } else {
            // Transform point to local coordinate system
            const localX = (x - this.position.x) * Math.cos(-this.rotation) - (y - this.position.y) * Math.sin(-this.rotation);
            const localY = (x - this.position.x) * Math.sin(-this.rotation) + (y - this.position.y) * Math.cos(-this.rotation);
            
            const halfWidth = this.size.width / 2;
            const halfHeight = this.size.height / 2;
            
            return localX >= -halfWidth && localX <= halfWidth &&
                   localY >= -halfHeight && localY <= halfHeight;
        }
    }

    createHandles() {
        // Remove existing handles
        this.removeHandles();
        
        if (this.shape === 'circle') {
            // For circles, create 8 handles around the circumference
            const radius = this.size.radius || (this.size.width ? this.size.width / 2 : 0.5);
            const handleSize = 0.15;
            
            // 8 handles: 4 axis (top, right, bottom, left) + 4 diagonal
            const angles = [0, Math.PI / 4, Math.PI / 2, 3 * Math.PI / 4, Math.PI, 5 * Math.PI / 4, 3 * Math.PI / 2, 7 * Math.PI / 4];
            angles.forEach((angle, index) => {
                const handleGeometry = new THREE.CircleGeometry(handleSize, 8);
                const handleMaterial = new THREE.MeshBasicMaterial({
                    color: 0x808080, // Grey handles
                    transparent: true,
                    opacity: 0.8
                });
                const handle = new THREE.Mesh(handleGeometry, handleMaterial);
                handle.position.set(
                    Math.cos(angle) * radius,
                    Math.sin(angle) * radius,
                    0.01
                );
                handle.userData.handleIndex = index;
                handle.userData.handleType = index < 4 ? 'axis' : 'diagonal';
                this.mesh.add(handle);
                this.handles.push(handle);
            });
        } else {
            // Rectangular - same as spacer/shape
            const halfWidth = this.size.width / 2;
            const halfHeight = this.size.height / 2;
            const handleSize = 0.15;
            
            // Four corner handles (indices 0-3)
            const corners = [
                { x: -halfWidth, y: -halfHeight }, // Bottom-left
                { x: halfWidth, y: -halfHeight },  // Bottom-right
                { x: halfWidth, y: halfHeight },   // Top-right
                { x: -halfWidth, y: halfHeight }   // Top-left
            ];
            
            corners.forEach((corner, index) => {
                const handleGeometry = new THREE.CircleGeometry(handleSize, 8);
                const handleMaterial = new THREE.MeshBasicMaterial({
                    color: 0x808080, // Grey handles
                    transparent: true,
                    opacity: 0.8
                });
                const handle = new THREE.Mesh(handleGeometry, handleMaterial);
                handle.position.set(corner.x, corner.y, 0.01);
                handle.userData.handleIndex = index;
                handle.userData.handleType = 'corner';
                this.mesh.add(handle);
                this.handles.push(handle);
            });
            
            // Four axis handles (indices 4-7)
            const axisHandles = [
                { x: 0, y: -halfHeight }, // Bottom (index 4)
                { x: halfWidth, y: 0 },   // Right (index 5)
                { x: 0, y: halfHeight },  // Top (index 6)
                { x: -halfWidth, y: 0 }  // Left (index 7)
            ];
            
            axisHandles.forEach((pos, index) => {
                const handleGeometry = new THREE.CircleGeometry(handleSize, 8);
                const handleMaterial = new THREE.MeshBasicMaterial({
                    color: 0x606060, // Darker grey for axis
                    transparent: true,
                    opacity: 0.8
                });
                const handle = new THREE.Mesh(handleGeometry, handleMaterial);
                handle.position.set(pos.x, pos.y, 0.01);
                handle.userData.handleIndex = index + 4;
                handle.userData.handleType = 'axis';
                this.mesh.add(handle);
                this.handles.push(handle);
            });
        }
    }

    removeHandles() {
        this.handles.forEach(handle => {
            this.mesh.remove(handle);
            handle.geometry.dispose();
            handle.material.dispose();
        });
        this.handles = [];
    }

    remove() {
        // Remove from scene
        this.scene.remove(this.mesh);
        if (this.mesh.geometry) this.mesh.geometry.dispose();
        if (this.mesh.material) this.mesh.material.dispose();
        
        // Remove from physics world
        if (this.body) {
            this.physicsWorld.removeBody(this.body);
        }
        
        // Remove handles
        this.removeHandles();
    }
}

