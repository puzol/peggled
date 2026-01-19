import * as THREE from 'three';

/**
 * Shape - Container for pegs that can arrange them using flex-like properties
 * Types: 'line' (horizontal line of pegs), 'circle' (circular arrangement)
 */
export class Shape {
    constructor(scene, position = { x: 0, y: 0, z: 0 }, type = 'line', size = null) {
        this.scene = scene;
        this.position = position;
        this.type = type; // 'line' or 'circle'
        this.isEditorOnly = true; // Mark as editor-only element
        
        // Default size for line shape: width = 2 (units), height = double round peg height
        const roundPegDiameter = 0.09 * 2; // Base round peg diameter
        const defaultHeight = roundPegDiameter * 2; // Double the height
        
        if (!size) {
            if (type === 'line') {
                this.size = { width: 2, height: defaultHeight };
            } else {
                // Circle shape - default size
                this.size = { width: 2, height: 2 };
            }
        } else {
            this.size = size;
        }
        
        // Flex properties for peg arrangement
        this.align = 'middle'; // 'top', 'middle', 'bottom' - vertical alignment
        this.justify = 'center'; // 'left', 'right', 'center', 'between', 'around' - horizontal distribution
        this.gap = 0.1; // Gap between pegs
        
        // Store pegs contained in this shape
        this.containedPegs = [];
        
        // Rotation (in radians)
        this.rotation = 0;
        
        // Visual representation (Three.js)
        this.createMesh(position, this.size);
        
        // Resize handles (for editor)
        this.handles = [];
    }

    createMesh(position, size) {
        // Create rectangle shape (for both line and circle types initially)
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
            color: 0x00ff00, // Green for shape containers
            transparent: true,
            opacity: 0.2,
            side: THREE.DoubleSide
        });
        
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.set(position.x, position.y, position.z || 0);
        this.mesh.rotation.z = this.rotation;
        
        // Add outline
        const edges = new THREE.EdgesGeometry(geometry);
        const outlineMaterial = new THREE.LineBasicMaterial({
            color: 0x00cc00, // Darker green outline
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
        
        // Four corner handles
        const corners = [
            { x: -halfWidth, y: -halfHeight }, // Bottom-left
            { x: halfWidth, y: -halfHeight },  // Bottom-right
            { x: halfWidth, y: halfHeight },   // Top-right
            { x: -halfWidth, y: halfHeight }   // Top-left
        ];
        
        corners.forEach((corner, index) => {
            const handleGeometry = new THREE.CircleGeometry(handleSize, 8);
            const handleMaterial = new THREE.MeshBasicMaterial({
                color: 0x00ff00, // Green handles for shapes
                transparent: true,
                opacity: 0.8
            });
            const handle = new THREE.Mesh(handleGeometry, handleMaterial);
            handle.position.set(corner.x, corner.y, 0.01); // Slightly above
            handle.userData.handleIndex = index;
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
     * Update shape size and regenerate mesh
     */
    updateSize(newSize) {
        this.size = newSize;
        
        // Remove old mesh
        if (this.mesh) {
            this.scene.remove(this.mesh);
            if (this.outline) {
                this.mesh.remove(this.outline);
                this.outline.geometry.dispose();
                this.outline.material.dispose();
            }
            this.mesh.geometry.dispose();
            this.mesh.material.dispose();
        }
        
        // Create new mesh with new size
        this.createMesh(this.position, newSize);
        
        // Recreate handles if they existed
        if (this.handles.length > 0) {
            this.createHandles();
        }
        
        // Rearrange contained pegs
        this.rearrangePegs();
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
     * Check if a point is within shape boundaries
     */
    containsPoint(x, y) {
        const bounds = this.getBounds();
        return x >= bounds.left && x <= bounds.right &&
               y >= bounds.bottom && y <= bounds.top;
    }
    
    /**
     * Move shape to new position
     */
    moveTo(newPosition) {
        this.position = newPosition;
        this.mesh.position.set(newPosition.x, newPosition.y, newPosition.z || 0);
        // Rearrange pegs when shape moves
        this.rearrangePegs();
    }
    
    /**
     * Set rotation and update mesh
     */
    setRotation(angleRadians) {
        this.rotation = angleRadians;
        if (this.mesh) {
            this.mesh.rotation.z = angleRadians;
        }
    }
    
    /**
     * Add a peg to this shape
     */
    addPeg(peg) {
        if (!this.containedPegs.includes(peg)) {
            this.containedPegs.push(peg);
            peg.parentShape = this; // Reference to parent shape
            this.rearrangePegs();
        }
    }
    
    /**
     * Remove a peg from this shape
     */
    removePeg(peg) {
        const index = this.containedPegs.indexOf(peg);
        if (index !== -1) {
            this.containedPegs.splice(index, 1);
            peg.parentShape = null;
            this.rearrangePegs();
        }
    }
    
    /**
     * Rearrange pegs within the shape using flex properties
     */
    rearrangePegs() {
        if (this.type !== 'line' || this.containedPegs.length === 0) {
            return; // Only line shapes for now
        }
        
        // Use local coordinate system (before rotation)
        const halfWidth = this.size.width / 2;
        const halfHeight = this.size.height / 2;
        const availableWidth = this.size.width;
        
        // Calculate total width of all pegs plus gaps
        // For now, assume all pegs are round and base size (0.18 diameter)
        const pegDiameter = 0.18; // Base round peg diameter
        const totalPegsWidth = this.containedPegs.length * pegDiameter;
        const totalGapsWidth = (this.containedPegs.length - 1) * this.gap;
        const totalWidth = totalPegsWidth + totalGapsWidth;
        
        // Calculate positions in local coordinate system (along X axis, centered on Y)
        let startXLocal;
        if (this.justify === 'left') {
            startXLocal = -halfWidth + pegDiameter / 2;
        } else if (this.justify === 'right') {
            startXLocal = halfWidth - totalWidth + pegDiameter / 2;
        } else if (this.justify === 'center') {
            startXLocal = -totalWidth / 2 + pegDiameter / 2;
        } else if (this.justify === 'between') {
            const spaceBetween = this.containedPegs.length > 1 ? 
                (availableWidth - totalPegsWidth) / (this.containedPegs.length - 1) : 0;
            startXLocal = -halfWidth + pegDiameter / 2;
        } else if (this.justify === 'around') {
            const spaceAround = this.containedPegs.length > 0 ? 
                (availableWidth - totalPegsWidth) / this.containedPegs.length : 0;
            startXLocal = -halfWidth + spaceAround / 2 + pegDiameter / 2;
        }
        
        // Calculate Y position in local coordinates based on align
        let yLocal;
        if (this.align === 'top') {
            yLocal = halfHeight - pegDiameter / 2;
        } else if (this.align === 'bottom') {
            yLocal = -halfHeight + pegDiameter / 2;
        } else {
            // middle (default)
            yLocal = 0;
        }
        
        // Get rotation angle
        const cos = Math.cos(this.rotation);
        const sin = Math.sin(this.rotation);
        
        // Position each peg
        this.containedPegs.forEach((peg, index) => {
            if (!peg || !peg.body || !peg.mesh) return;
            
            // Calculate local X position
            let xLocal;
            if (this.justify === 'between') {
                const spaceBetween = this.containedPegs.length > 1 ? 
                    (availableWidth - totalPegsWidth) / (this.containedPegs.length - 1) : 0;
                xLocal = -halfWidth + pegDiameter / 2 + index * (pegDiameter + spaceBetween);
            } else if (this.justify === 'around') {
                const spaceAround = this.containedPegs.length > 0 ? 
                    (availableWidth - totalPegsWidth) / this.containedPegs.length : 0;
                xLocal = -halfWidth + spaceAround / 2 + pegDiameter / 2 + index * (pegDiameter + spaceAround);
            } else {
                xLocal = startXLocal + index * (pegDiameter + this.gap);
            }
            
            // Rotate local position to world space
            const xWorld = this.position.x + (xLocal * cos - yLocal * sin);
            const yWorld = this.position.y + (xLocal * sin + yLocal * cos);
            
            // Update peg position in world space
            peg.body.position.set(xWorld, yWorld, 0);
            peg.mesh.position.set(xWorld, yWorld, peg.mesh.position.z || 0);
        });
    }
    
    /**
     * Remove shape from scene
     */
    remove() {
        this.removeHandles();
        
        // Remove all contained pegs
        this.containedPegs.forEach(peg => {
            if (peg.remove) {
                peg.remove();
            }
        });
        this.containedPegs = [];
        
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

