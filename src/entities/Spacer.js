import * as THREE from 'three';

/**
 * Spacer - Editor-only element for defining boundaries
 * Objects cannot overlap spacers and will stick to their boundaries
 */
export class Spacer {
    constructor(scene, position = { x: 0, y: 0, z: 0 }, size = { width: 1, height: 1 }) {
        this.scene = scene;
        this.position = position;
        this.size = size;
        this.isEditorOnly = true; // Mark as editor-only element
        
        // Visual representation (Three.js)
        this.createMesh(position, size);
        
        // Resize handles (for editor)
        this.handles = [];
        this.selectedHandle = null;
    }

    createMesh(position, size) {
        // Create rectangle shape
        const shape = new THREE.Shape();
        const halfWidth = size.width / 2;
        const halfHeight = size.height / 2;
        shape.moveTo(-halfWidth, -halfHeight);
        shape.lineTo(halfWidth, -halfHeight);
        shape.lineTo(halfWidth, halfHeight);
        shape.lineTo(-halfWidth, halfHeight);
        shape.closePath();
        
        const geometry = new THREE.ShapeGeometry(shape);
        const material = new THREE.MeshBasicMaterial({
            color: 0xffff00, // Yellow for visibility
            transparent: true,
            opacity: 0.3,
            side: THREE.DoubleSide
        });
        
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.set(position.x, position.y, position.z || 0);
        
        // Add outline
        const edges = new THREE.EdgesGeometry(geometry);
        const outlineMaterial = new THREE.LineBasicMaterial({
            color: 0xffaa00, // Orange outline
            linewidth: 2
        });
        this.outline = new THREE.LineSegments(edges, outlineMaterial);
        this.mesh.add(this.outline);
        
        this.scene.add(this.mesh);
    }
    
    /**
     * Create resize handles at corners
     */
    createHandles() {
        // Remove existing handles
        this.removeHandles();
        
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
                color: 0xff0000, // Red handles
                transparent: true,
                opacity: 0.8
            });
            const handle = new THREE.Mesh(handleGeometry, handleMaterial);
            handle.position.set(corner.x, corner.y, 0.01); // Slightly above
            handle.userData.handleIndex = index;
            handle.userData.handleType = 'corner';
            this.mesh.add(handle);
            this.handles.push(handle);
        });
        
        // Four axis handles (indices 4-7): middle of each edge
        const axisHandles = [
            { x: 0, y: -halfHeight }, // Bottom (index 4)
            { x: halfWidth, y: 0 },   // Right (index 5)
            { x: 0, y: halfHeight },  // Top (index 6)
            { x: -halfWidth, y: 0 }  // Left (index 7)
        ];
        
        axisHandles.forEach((pos, index) => {
            const handleGeometry = new THREE.CircleGeometry(handleSize, 8);
            const handleMaterial = new THREE.MeshBasicMaterial({
                color: 0xff8800, // Orange handles for axis
                transparent: true,
                opacity: 0.8
            });
            const handle = new THREE.Mesh(handleGeometry, handleMaterial);
            handle.position.set(pos.x, pos.y, 0.01); // Slightly above
            handle.userData.handleIndex = index + 4; // 4, 5, 6, 7
            handle.userData.handleType = 'axis';
            this.mesh.add(handle);
            this.handles.push(handle);
        });
    }
    
    removeHandles() {
        this.handles.forEach(handle => {
            this.mesh.remove(handle);
            handle.geometry.dispose();
            handle.material.dispose();
        });
        this.handles = [];
    }
    
    /**
     * Update spacer size and regenerate mesh
     */
    updateSize(newSize) {
        this.size = newSize;
        
        // Remove old mesh
        if (this.mesh) {
            this.scene.remove(this.mesh);
            this.mesh.geometry.dispose();
            this.mesh.material.dispose();
        }
        
        // Create new mesh with new size
        this.createMesh(this.position, newSize);
        
        // Recreate handles if they existed
        if (this.handles.length > 0) {
            this.createHandles();
        }
    }
    
    /**
     * Get bounding box (for collision detection)
     */
    getBounds() {
        const halfWidth = this.size.width / 2;
        const halfHeight = this.size.height / 2;
        return {
            left: this.position.x - halfWidth,
            right: this.position.x + halfWidth,
            bottom: this.position.y - halfHeight,
            top: this.position.y + halfHeight
        };
    }
    
    /**
     * Check if a point is within spacer boundaries
     */
    containsPoint(x, y) {
        const bounds = this.getBounds();
        return x >= bounds.left && x <= bounds.right &&
               y >= bounds.bottom && y <= bounds.top;
    }
    
    /**
     * Move spacer to new position
     */
    moveTo(newPosition) {
        this.position = newPosition;
        this.mesh.position.set(newPosition.x, newPosition.y, newPosition.z || 0);
    }
    
    /**
     * Remove spacer from scene
     */
    remove() {
        this.removeHandles();
        
        if (this.outline) {
            this.mesh.remove(this.outline);
            this.outline.geometry.dispose();
            this.outline.material.dispose();
        }
        
        if (this.mesh) {
            this.scene.remove(this.mesh);
            this.mesh.geometry.dispose();
            this.mesh.material.dispose();
        }
    }
}

