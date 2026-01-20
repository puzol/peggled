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
        // For line shapes: align ('top', 'middle', 'bottom'), justify ('left', 'right', 'center', 'between', 'around')
        // For circle shapes: only justify (no align)
        // Circle justify options (12 total):
        //   Reference point: 'top-center', 'right-center', 'bottom-center', 'left-center' (spreads from reference)
        //   Clockwise: 'top-clockwise', 'right-clockwise', 'bottom-clockwise', 'left-clockwise'
        //   Counter-clockwise: 'top-counter-clockwise', 'right-counter-clockwise', 'bottom-counter-clockwise', 'left-counter-clockwise'
        //   Space evenly: 'top-evenly', 'right-evenly', 'bottom-evenly', 'left-evenly'
        this.align = 'middle'; // 'top', 'middle', 'bottom' - vertical alignment (line shapes only)
        this.justify = type === 'circle' ? 'top-center' : 'center'; // Default justify based on shape type
        this.gap = 0.1; // Gap between pegs (used for spacing calculations)
        
        // Store pegs contained in this shape
        this.containedPegs = [];
        
        // Store characteristics contained in this shape
        this.containedCharacteristics = [];
        
        // Whether this shape can accept objects (pegs and characteristics)
        this.canTakeObjects = true;
        
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
                color: 0x00ff00, // Green handles for shapes
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
                color: 0x00aa00, // Darker green handles for axis
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
        
        // Rearrange contained pegs and characteristics
        this.rearrangePegs();
        this.rearrangeCharacteristics();
    }
    
    /**
     * Get bounding box (for collision detection)
     */
    getBounds() {
        // Calculate world-space bounds considering rotation
        const halfWidth = this.size.width / 2;
        const halfHeight = this.size.height / 2;

        // Get all four corners in local space
        const corners = [
            { x: -halfWidth, y: -halfHeight },
            { x: halfWidth, y: -halfHeight },
            { x: halfWidth, y: halfHeight },
            { x: -halfWidth, y: halfHeight }
        ];

        // Transform corners to world space
        const cos = Math.cos(this.rotation);
        const sin = Math.sin(this.rotation);
        
        const worldCorners = corners.map(corner => {
            const worldX = this.position.x + (corner.x * cos - corner.y * sin);
            const worldY = this.position.y + (corner.x * sin + corner.y * cos);
            return { x: worldX, y: worldY };
        });

        // Find min/max bounds
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
    
    /**
     * Check if a point is within shape boundaries (accounting for rotation)
     */
    containsPoint(x, y) {
        // Transform point to local coordinate system
        const dx = x - this.position.x;
        const dy = y - this.position.y;
        
        // Rotate point back to local space (inverse rotation)
        const cos = Math.cos(-this.rotation);
        const sin = Math.sin(-this.rotation);
        const localX = dx * cos - dy * sin;
        const localY = dx * sin + dy * cos;
        
        // Check if point is within local bounds
        const halfWidth = this.size.width / 2;
        const halfHeight = this.size.height / 2;
        
        return localX >= -halfWidth && localX <= halfWidth &&
               localY >= -halfHeight && localY <= halfHeight;
    }
    
    /**
     * Move shape to new position
     */
    moveTo(newPosition) {
        this.position = newPosition;
        this.mesh.position.set(newPosition.x, newPosition.y, newPosition.z || 0);
        // Rearrange pegs and characteristics when shape moves
        this.rearrangePegs();
        this.rearrangeCharacteristics();
    }
    
    /**
     * Set rotation and update mesh
     */
    setRotation(angleRadians) {
        this.rotation = angleRadians;
        if (this.mesh) {
            this.mesh.rotation.z = angleRadians;
        }
        // Rearrange pegs and characteristics when shape rotates
        this.rearrangePegs();
        this.rearrangeCharacteristics();
    }
    
    /**
     * Find the insertion index for a peg based on world position
     * Returns the index where the peg should be inserted
     */
    findInsertionIndex(worldX, worldY) {
        if (this.containedPegs.length === 0) {
            return 0; // If empty, insert at start
        }
        
        if (this.type === 'circle') {
            return this.findInsertionIndexCircle(worldX, worldY);
        } else if (this.type === 'line') {
            return this.findInsertionIndexLine(worldX, worldY);
        }
        
        return 0;
    }
    
    /**
     * Find insertion index for a circle shape
     */
    findInsertionIndexCircle(worldX, worldY) {
        // Transform world position to local coordinate system
        const dx = worldX - this.position.x;
        const dy = worldY - this.position.y;
        const cos = Math.cos(-this.rotation);
        const sin = Math.sin(-this.rotation);
        const localX = dx * cos - dy * sin;
        const localY = dx * sin + dy * cos;
        
        // Calculate angle of click position
        const clickAngle = Math.atan2(localY, localX);
        
        // Parse justify option to get reference point and mode
        const justifyParsed = this.parseCircleJustify(this.justify);
        const startAngle = this.getReferenceAngle(justifyParsed.reference);
        
        const pegDiameter = 0.18;
        const radius = Math.min(this.size.width, this.size.height) / 2;
        const effectiveRadius = Math.max(radius - pegDiameter / 2, pegDiameter / 2);
        
        // Calculate angles for existing pegs
        let angles = [];
        
        if (justifyParsed.mode === 'center') {
            // Reference point justify - centers objects around the reference point
            // Uses gap setting for spacing, symmetric around the reference
            const angularGap = (this.gap + pegDiameter) / effectiveRadius;
            
            if (this.containedPegs.length === 1) {
                // Single peg at reference point
                angles = [startAngle];
            } else if (this.containedPegs.length % 2 === 1) {
                // Odd number: center peg at reference, then spread equally on both sides
                const centerIndex = Math.floor(this.containedPegs.length / 2);
                for (let i = 0; i < this.containedPegs.length; i++) {
                    const offset = (i - centerIndex) * angularGap;
                    angles.push(startAngle + offset);
                }
            } else {
                // Even number: spread equally on both sides, no peg at reference
                const halfCount = this.containedPegs.length / 2;
                for (let i = 0; i < this.containedPegs.length; i++) {
                    // For even: positions are at -0.5, -1.5, ..., 0.5, 1.5, ... gaps from center
                    const offset = (i - halfCount + 0.5) * angularGap;
                    angles.push(startAngle + offset);
                }
            }
        } else if (justifyParsed.mode === 'clockwise') {
            for (let i = 0; i < this.containedPegs.length; i++) {
                const angularGap = (this.gap + pegDiameter) / effectiveRadius;
                angles.push(startAngle - i * angularGap); // Subtract for clockwise
            }
        } else if (justifyParsed.mode === 'counter-clockwise') {
            for (let i = 0; i < this.containedPegs.length; i++) {
                const angularGap = (this.gap + pegDiameter) / effectiveRadius;
                angles.push(startAngle + i * angularGap); // Add for counter-clockwise
            }
        } else if (justifyParsed.mode === 'evenly') {
            const fullCircle = Math.PI * 2;
            for (let i = 0; i < this.containedPegs.length; i++) {
                const angleOffset = (fullCircle / this.containedPegs.length) * i;
                angles.push(startAngle + angleOffset);
            }
        }
        
        // Normalize click angle to [0, 2π] range
        let normalizedClickAngle = clickAngle;
        while (normalizedClickAngle < 0) normalizedClickAngle += Math.PI * 2;
        while (normalizedClickAngle >= Math.PI * 2) normalizedClickAngle -= Math.PI * 2;
        
        // Normalize peg angles to [0, 2π] range and find insertion point
        const normalizedAngles = angles.map(angle => {
            let normalized = angle;
            while (normalized < 0) normalized += Math.PI * 2;
            while (normalized >= Math.PI * 2) normalized -= Math.PI * 2;
            return normalized;
        });
        
        // Sort normalized angles with their original indices
        const sortedIndices = normalizedAngles.map((angle, index) => ({ angle, index }))
            .sort((a, b) => a.angle - b.angle);
        
        // Find where click angle should be inserted
        for (let i = 0; i < sortedIndices.length; i++) {
            if (normalizedClickAngle < sortedIndices[i].angle) {
                // Find the original index before sorting
                return sortedIndices[i].index;
            }
        }
        
        // If click is after all pegs, insert at end
        return this.containedPegs.length;
    }
    
    /**
     * Find insertion index for a line shape
     */
    findInsertionIndexLine(worldX, worldY) {
        // Transform world position to local coordinate system
        const dx = worldX - this.position.x;
        const dy = worldY - this.position.y;
        const cos = Math.cos(-this.rotation);
        const sin = Math.sin(-this.rotation);
        const localX = dx * cos - dy * sin;
        
        // Calculate where pegs would be positioned (in local space)
        const halfWidth = this.size.width / 2;
        const availableWidth = this.size.width;
        const pegDiameter = 0.18;
        const totalPegsWidth = this.containedPegs.length * pegDiameter;
        const totalGapsWidth = (this.containedPegs.length - 1) * this.gap;
        const totalWidth = totalPegsWidth + totalGapsWidth;
        
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
        
        // Find which position the localX falls into
        for (let i = 0; i < this.containedPegs.length; i++) {
            let pegXLocal;
            if (this.justify === 'between') {
                const spaceBetween = this.containedPegs.length > 1 ? 
                    (availableWidth - totalPegsWidth) / (this.containedPegs.length - 1) : 0;
                pegXLocal = -halfWidth + pegDiameter / 2 + i * (pegDiameter + spaceBetween);
            } else if (this.justify === 'around') {
                const spaceAround = this.containedPegs.length > 0 ? 
                    (availableWidth - totalPegsWidth) / this.containedPegs.length : 0;
                pegXLocal = -halfWidth + spaceAround / 2 + pegDiameter / 2 + i * (pegDiameter + spaceAround);
            } else {
                pegXLocal = startXLocal + i * (pegDiameter + this.gap);
            }
            
            // Check if localX is before this peg position
            if (localX < pegXLocal) {
                return i; // Insert before this peg
            }
        }
        
        // If we get here, insert at the end
        return this.containedPegs.length;
    }
    
    /**
     * Add a peg to this shape at a specific insertion index
     */
    addPeg(peg, insertionIndex = null) {
        if (this.containedPegs.includes(peg)) {
            // Peg already in shape - remove it first to reinsert
            this.removePeg(peg);
        }
        
        if (insertionIndex === null) {
            // No specific position - add at end
            this.containedPegs.push(peg);
        } else {
            // Insert at specific index
            this.containedPegs.splice(insertionIndex, 0, peg);
        }
        
        peg.parentShape = this; // Reference to parent shape
        this.rearrangePegs();
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
     * Add a characteristic to this shape
     */
    addCharacteristic(characteristic, insertionIndex = null) {
        if (this.containedCharacteristics.includes(characteristic)) {
            // Characteristic already in shape - remove it first to reinsert
            this.removeCharacteristic(characteristic);
        }
        
        if (insertionIndex === null) {
            // No specific position - add at end
            this.containedCharacteristics.push(characteristic);
        } else {
            // Insert at specific index
            this.containedCharacteristics.splice(insertionIndex, 0, characteristic);
        }
        
        characteristic.parentShape = this; // Reference to parent shape
        // Set rotation to match shape's rotation when adding
        characteristic.setRotation(this.rotation);
        this.rearrangeCharacteristics();
    }
    
    /**
     * Remove a characteristic from this shape
     */
    removeCharacteristic(characteristic) {
        const index = this.containedCharacteristics.indexOf(characteristic);
        if (index !== -1) {
            this.containedCharacteristics.splice(index, 1);
            characteristic.parentShape = null;
            this.rearrangeCharacteristics();
        }
    }
    
    /**
     * Rearrange characteristics within the shape using flex properties
     */
    rearrangeCharacteristics() {
        if (this.containedCharacteristics.length === 0) {
            return;
        }
        
        if (this.type === 'circle') {
            this.rearrangeCharacteristicsCircle();
        } else if (this.type === 'line') {
            this.rearrangeCharacteristicsLine();
        }
    }
    
    /**
     * Rearrange characteristics in a line shape
     */
    rearrangeCharacteristicsLine() {
        
        // Use local coordinate system (before rotation)
        const halfWidth = this.size.width / 2;
        const halfHeight = this.size.height / 2;
        const availableWidth = this.size.width;
        
        // Calculate total width of all characteristics plus gaps
        // Get actual width of each characteristic
        let totalCharsWidth = 0;
        const charWidths = [];
        this.containedCharacteristics.forEach(char => {
            if (!char || !char.size) return;
            let width;
            if (char.shape === 'circle') {
                width = (char.size.radius || 0.5) * 2; // Diameter
            } else {
                width = char.size.width || 1.0;
            }
            charWidths.push(width);
            totalCharsWidth += width;
        });
        
        const totalGapsWidth = (this.containedCharacteristics.length - 1) * this.gap;
        const totalWidth = totalCharsWidth + totalGapsWidth;
        
        // Calculate positions in local coordinate system (along X axis, centered on Y)
        let startXLocal;
        if (this.justify === 'left') {
            startXLocal = -halfWidth + (charWidths[0] || 1.0) / 2;
        } else if (this.justify === 'right') {
            startXLocal = halfWidth - totalWidth + (charWidths[0] || 1.0) / 2;
        } else if (this.justify === 'center') {
            startXLocal = -totalWidth / 2 + (charWidths[0] || 1.0) / 2;
        } else if (this.justify === 'between') {
            const spaceBetween = this.containedCharacteristics.length > 1 ? 
                (availableWidth - totalCharsWidth) / (this.containedCharacteristics.length - 1) : 0;
            startXLocal = -halfWidth + (charWidths[0] || 1.0) / 2;
        } else if (this.justify === 'around') {
            const spaceAround = this.containedCharacteristics.length > 0 ? 
                (availableWidth - totalCharsWidth) / this.containedCharacteristics.length : 0;
            startXLocal = -halfWidth + spaceAround / 2 + (charWidths[0] || 1.0) / 2;
        }
        
        // Calculate Y position in local coordinates based on align
        let yLocal;
        if (this.align === 'top') {
            // Use average height of characteristics
            let avgHeight = 0;
            this.containedCharacteristics.forEach(char => {
                if (char && char.size) {
                    if (char.shape === 'circle') {
                        avgHeight += (char.size.radius || 0.5) * 2;
                    } else {
                        avgHeight += char.size.height || 1.0;
                    }
                }
            });
            avgHeight = avgHeight / this.containedCharacteristics.length || 0.5;
            yLocal = halfHeight - avgHeight / 2;
        } else if (this.align === 'bottom') {
            let avgHeight = 0;
            this.containedCharacteristics.forEach(char => {
                if (char && char.size) {
                    if (char.shape === 'circle') {
                        avgHeight += (char.size.radius || 0.5) * 2;
                    } else {
                        avgHeight += char.size.height || 1.0;
                    }
                }
            });
            avgHeight = avgHeight / this.containedCharacteristics.length || 0.5;
            yLocal = -halfHeight + avgHeight / 2;
        } else {
            // middle (default)
            yLocal = 0;
        }
        
        // Get rotation angle
        const cos = Math.cos(this.rotation);
        const sin = Math.sin(this.rotation);
        
        // Position each characteristic
        let currentX = startXLocal;
        this.containedCharacteristics.forEach((characteristic, index) => {
            if (!characteristic || !characteristic.mesh || !characteristic.body) return;
            
            const charWidth = charWidths[index] || 1.0;
            
            // Calculate local X position
            let xLocal;
            if (this.justify === 'between') {
                const spaceBetween = this.containedCharacteristics.length > 1 ? 
                    (availableWidth - totalCharsWidth) / (this.containedCharacteristics.length - 1) : 0;
                if (index === 0) {
                    xLocal = -halfWidth + charWidth / 2;
                } else {
                    let prevX = -halfWidth + charWidths[0] / 2;
                    for (let i = 1; i < index; i++) {
                        prevX += charWidths[i] + spaceBetween;
                    }
                    xLocal = prevX + charWidth / 2 + spaceBetween;
                }
            } else if (this.justify === 'around') {
                const spaceAround = this.containedCharacteristics.length > 0 ? 
                    (availableWidth - totalCharsWidth) / this.containedCharacteristics.length : 0;
                if (index === 0) {
                    xLocal = -halfWidth + spaceAround / 2 + charWidth / 2;
                } else {
                    let prevX = -halfWidth + spaceAround / 2 + charWidths[0] / 2;
                    for (let i = 1; i < index; i++) {
                        prevX += charWidths[i] + spaceAround;
                    }
                    xLocal = prevX + charWidth / 2 + spaceAround;
                }
            } else {
                // left, right, center
                if (index === 0) {
                    xLocal = startXLocal;
                } else {
                    xLocal = currentX + charWidth / 2;
                }
                currentX = xLocal + charWidth / 2 + this.gap;
            }
            
            // Rotate local position to world space
            const xWorld = this.position.x + (xLocal * cos - yLocal * sin);
            const yWorld = this.position.y + (xLocal * sin + yLocal * cos);
            
            // Update characteristic position and rotation in world space
            characteristic.moveTo({ x: xWorld, y: yWorld, z: 0 });
            // Characteristics rotate with the shape (their rotation matches the shape's rotation)
            characteristic.setRotation(this.rotation);
        });
    }
    
    /**
     * Rearrange characteristics in a circle shape with advanced justify options
     */
    rearrangeCharacteristicsCircle() {
        // Get average size of characteristics for radius calculation
        let totalSize = 0;
        let count = 0;
        this.containedCharacteristics.forEach(char => {
            if (!char || !char.size) return;
            let size;
            if (char.shape === 'circle') {
                size = (char.size.radius || 0.5) * 2; // Diameter
            } else {
                size = Math.max(char.size.width || 1.0, char.size.height || 1.0);
            }
            totalSize += size;
            count++;
        });
        const avgSize = count > 0 ? totalSize / count : 1.0;
        
        const radius = Math.min(this.size.width, this.size.height) / 2;
        const effectiveRadius = Math.max(radius - avgSize / 2, avgSize / 2); // Account for characteristic size
        
        // Parse justify option to get reference point and mode
        const justifyParsed = this.parseCircleJustify(this.justify);
        const startAngle = this.getReferenceAngle(justifyParsed.reference);
        
        // Calculate angles for each characteristic based on justify mode
        let angles = [];
        
        if (justifyParsed.mode === 'center') {
            // Reference point justify - centers objects around the reference point
            // Uses gap setting for spacing, symmetric around the reference
            const angularGap = (this.gap + avgSize) / effectiveRadius;
            
            if (this.containedCharacteristics.length === 1) {
                // Single characteristic at reference point
                angles = [startAngle];
            } else if (this.containedCharacteristics.length % 2 === 1) {
                // Odd number: center characteristic at reference, then spread equally on both sides
                const centerIndex = Math.floor(this.containedCharacteristics.length / 2);
                for (let i = 0; i < this.containedCharacteristics.length; i++) {
                    const offset = (i - centerIndex) * angularGap;
                    angles.push(startAngle + offset);
                }
            } else {
                // Even number: spread equally on both sides, no characteristic at reference
                const halfCount = this.containedCharacteristics.length / 2;
                for (let i = 0; i < this.containedCharacteristics.length; i++) {
                    // For even: positions are at -0.5, -1.5, ..., 0.5, 1.5, ... gaps from center
                    const offset = (i - halfCount + 0.5) * angularGap;
                    angles.push(startAngle + offset);
                }
            }
        } else if (justifyParsed.mode === 'clockwise') {
            // Clockwise - starts from reference, adds clockwise (negative angle in math coords)
            for (let i = 0; i < this.containedCharacteristics.length; i++) {
                // Use gap to determine angular spacing
                const angularGap = (this.gap + avgSize) / effectiveRadius;
                angles.push(startAngle - i * angularGap); // Subtract for clockwise
            }
        } else if (justifyParsed.mode === 'counter-clockwise') {
            // Counter-clockwise - starts from reference, adds counter-clockwise (positive angle in math coords)
            for (let i = 0; i < this.containedCharacteristics.length; i++) {
                const angularGap = (this.gap + avgSize) / effectiveRadius;
                angles.push(startAngle + i * angularGap); // Add for counter-clockwise
            }
        } else if (justifyParsed.mode === 'evenly') {
            // Space evenly - evenly distributed around circle, starting from reference
            const fullCircle = Math.PI * 2;
            for (let i = 0; i < this.containedCharacteristics.length; i++) {
                const angleOffset = (fullCircle / this.containedCharacteristics.length) * i;
                angles.push(startAngle + angleOffset);
            }
        }
        
        // Position each characteristic at calculated angle
        const cos = Math.cos(this.rotation);
        const sin = Math.sin(this.rotation);
        
        this.containedCharacteristics.forEach((characteristic, index) => {
            if (!characteristic || !characteristic.mesh || !characteristic.body) return;
            
            const angle = angles[index];
            
            // Calculate position in local coordinate system (before shape rotation)
            const localX = Math.cos(angle) * effectiveRadius;
            const localY = Math.sin(angle) * effectiveRadius;
            
            // Rotate local position to world space (apply shape rotation)
            const xWorld = this.position.x + (localX * cos - localY * sin);
            const yWorld = this.position.y + (localX * sin + localY * cos);
            
            // Update characteristic position and rotation in world space
            characteristic.moveTo({ x: xWorld, y: yWorld, z: 0 });
            // Characteristics rotate with the shape (their rotation matches the shape's rotation)
            characteristic.setRotation(this.rotation);
        });
    }
    
    /**
     * Rearrange pegs within the shape using flex properties
     */
    rearrangePegs() {
        if (this.containedPegs.length === 0) {
            return;
        }
        
        if (this.type === 'circle') {
            this.rearrangePegsCircle();
        } else if (this.type === 'line') {
            this.rearrangePegsLine();
        }
    }
    
    /**
     * Rearrange pegs in a line shape
     */
    rearrangePegsLine() {
        
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
            
            // For rectangle and dome pegs, rotate them to match the shape's rotation
            // Round pegs don't need rotation since they're symmetrical
            if (peg.type === 'rect' || peg.type === 'dome') {
                // Rectangle pegs should align with the shape's direction (along the line)
                // The shape's rotation determines the peg's rotation
                peg.mesh.rotation.z = this.rotation;
                
                // Update physics body rotation to match
                const euler = new THREE.Euler(0, 0, this.rotation);
                const quaternion = new THREE.Quaternion().setFromEuler(euler);
                peg.body.quaternion.set(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
            }
        });
    }
    
    /**
     * Rearrange pegs in a circle shape with advanced justify options
     */
    rearrangePegsCircle() {
        const pegDiameter = 0.18; // Base round peg diameter
        const radius = Math.min(this.size.width, this.size.height) / 2;
        const effectiveRadius = Math.max(radius - pegDiameter / 2, pegDiameter / 2); // Account for peg size
        
        // Parse justify option to get reference point and mode
        const justifyParsed = this.parseCircleJustify(this.justify);
        const startAngle = this.getReferenceAngle(justifyParsed.reference);
        
        // Calculate angles for each peg based on justify mode
        let angles = [];
        
        if (justifyParsed.mode === 'center') {
            // Reference point justify - centers objects around the reference point
            // Uses gap setting for spacing, symmetric around the reference
            const angularGap = (this.gap + pegDiameter) / effectiveRadius;
            
            if (this.containedPegs.length === 1) {
                // Single peg at reference point
                angles = [startAngle];
            } else if (this.containedPegs.length % 2 === 1) {
                // Odd number: center peg at reference, then spread equally on both sides
                const centerIndex = Math.floor(this.containedPegs.length / 2);
                for (let i = 0; i < this.containedPegs.length; i++) {
                    const offset = (i - centerIndex) * angularGap;
                    angles.push(startAngle + offset);
                }
            } else {
                // Even number: spread equally on both sides, no peg at reference
                const halfCount = this.containedPegs.length / 2;
                for (let i = 0; i < this.containedPegs.length; i++) {
                    // For even: positions are at -0.5, -1.5, ..., 0.5, 1.5, ... gaps from center
                    const offset = (i - halfCount + 0.5) * angularGap;
                    angles.push(startAngle + offset);
                }
            }
        } else if (justifyParsed.mode === 'clockwise') {
            // Clockwise - starts from reference, adds clockwise (negative angle in math coords)
            for (let i = 0; i < this.containedPegs.length; i++) {
                // Use gap to determine angular spacing
                const angularGap = (this.gap + pegDiameter) / effectiveRadius;
                angles.push(startAngle - i * angularGap); // Subtract for clockwise
            }
        } else if (justifyParsed.mode === 'counter-clockwise') {
            // Counter-clockwise - starts from reference, adds counter-clockwise (positive angle in math coords)
            for (let i = 0; i < this.containedPegs.length; i++) {
                const angularGap = (this.gap + pegDiameter) / effectiveRadius;
                angles.push(startAngle + i * angularGap); // Add for counter-clockwise
            }
        } else if (justifyParsed.mode === 'evenly') {
            // Space evenly - evenly distributed around circle, starting from reference
            const fullCircle = Math.PI * 2;
            for (let i = 0; i < this.containedPegs.length; i++) {
                const angleOffset = (fullCircle / this.containedPegs.length) * i;
                angles.push(startAngle + angleOffset);
            }
        }
        
        // Position each peg at calculated angle
        const cos = Math.cos(this.rotation);
        const sin = Math.sin(this.rotation);
        
        this.containedPegs.forEach((peg, index) => {
            if (!peg || !peg.body || !peg.mesh) return;
            
            const angle = angles[index];
            
            // Calculate position in local coordinate system (before shape rotation)
            const localX = Math.cos(angle) * effectiveRadius;
            const localY = Math.sin(angle) * effectiveRadius;
            
            // Rotate local position to world space (apply shape rotation)
            const xWorld = this.position.x + (localX * cos - localY * sin);
            const yWorld = this.position.y + (localX * sin + localY * cos);
            
            // Update peg position in world space
            peg.body.position.set(xWorld, yWorld, 0);
            peg.mesh.position.set(xWorld, yWorld, peg.mesh.position.z || 0);
            
            // For rectangle and dome pegs, rotate them so their bottom faces the center of the circle
            // Round pegs don't need rotation since they're symmetrical
            if (peg.type === 'rect' || peg.type === 'dome') {
                // Calculate the angle from peg position to center (pointing inward)
                // The peg is at angle `angle` from center, so to face center it needs to rotate
                // If peg's bottom initially points down (-Y, angle -Math.PI/2), and center is at angle + Math.PI from peg,
                // then rotation = (angle + Math.PI) - (-Math.PI/2) = angle + 3*Math.PI/2
                // But we also need to account for shape rotation
                const angleToCenter = angle + Math.PI;
                const baseRotation = angleToCenter + Math.PI / 2; // Rotate from -Y (down) to point toward center
                const finalRotation = baseRotation + this.rotation;
                
                // Update mesh rotation
                peg.mesh.rotation.z = finalRotation;
                
                // Update physics body rotation
                const euler = new THREE.Euler(0, 0, finalRotation);
                const quaternion = new THREE.Quaternion().setFromEuler(euler);
                peg.body.quaternion.set(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
            }
        });
    }
    
    /**
     * Parse circle justify option into reference point and mode
     */
    parseCircleJustify(justify) {
        // Reference point modes: 'top-center', 'right-center', 'bottom-center', 'left-center'
        if (justify.endsWith('-center')) {
            return {
                reference: justify.split('-')[0], // 'top', 'right', 'bottom', 'left'
                mode: 'center'
            };
        }
        // Clockwise modes: 'top-clockwise', etc.
        if (justify.endsWith('-clockwise')) {
            return {
                reference: justify.replace('-clockwise', ''),
                mode: 'clockwise'
            };
        }
        // Counter-clockwise modes: 'top-counter-clockwise', etc.
        if (justify.endsWith('-counter-clockwise')) {
            return {
                reference: justify.replace('-counter-clockwise', ''),
                mode: 'counter-clockwise'
            };
        }
        // Space evenly modes: 'top-evenly', etc.
        if (justify.endsWith('-evenly')) {
            return {
                reference: justify.replace('-evenly', ''),
                mode: 'evenly'
            };
        }
        
        // Default to top-center if unknown
        return { reference: 'top', mode: 'center' };
    }
    
    /**
     * Get starting angle (in radians) for a reference point
     * Standard math coordinates: 0° = right, 90° = top (counter-clockwise), -90° = bottom
     */
    getReferenceAngle(reference) {
        switch (reference) {
            case 'top':
                return Math.PI / 2; // 90° (top)
            case 'right':
                return 0; // 0° (right)
            case 'bottom':
                return -Math.PI / 2; // -90° (bottom)
            case 'left':
                return Math.PI; // 180° (left)
            default:
                return Math.PI / 2; // Default to top
        }
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
        
        // Remove all contained characteristics
        this.containedCharacteristics.forEach(characteristic => {
            if (characteristic.remove) {
                characteristic.remove();
            }
        });
        this.containedCharacteristics = [];
        
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

