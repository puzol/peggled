import * as THREE from 'three';

/**
 * Level Editor - Tool for creating and editing levels
 */
export class LevelEditor {
    constructor(game) {
        this.game = game;
        this.isActive = false;
        this.testingMode = false; // Whether we're in test/play mode vs edit mode
        this.selectedTool = null;
        this.placedObjects = [];
        this.undoStack = [];
        this.redoStack = [];
        this.originalPegs = []; // Store pegs before testing
        this.previewMesh = null; // Preview object that follows cursor
        this.mouseWorldPos = { x: 0, y: 0 }; // Current mouse position in world coordinates
        this.currentLevelName = null; // Current level name
        this.levelLoaded = false; // Whether a level is currently loaded
        
        // Move tool state
        this.movingPeg = null; // Peg currently being moved
        this.isDragging = false; // Whether we're currently dragging a peg
        this.dragOffset = { x: 0, y: 0 }; // Offset from peg center when drag started
        
        // Rotate tool state
        this.selectedPeg = null; // Peg selected for rotation
        this.rotateKeyRepeatTimer = null; // Timer for holding rotate keys
        
        // Selection indicator
        this.selectionIndicator = null; // Outline mesh for selected peg
        
        // Spacer management
        this.spacers = []; // Array of spacer objects
        this.selectedSpacer = null; // Currently selected spacer for resizing
        this.isResizingSpacer = false; // Whether currently resizing a spacer
        this.selectedHandle = null; // Handle currently being dragged
        this.resizeStartPos = { x: 0, y: 0 }; // Mouse position when resize started
        this.resizeStartSize = { width: 0, height: 0 }; // Spacer size when resize started
        
        // Shape management
        this.shapes = []; // Array of shape objects
        this.selectedShape = null; // Currently selected shape
        
        // Copy tool state
        this.copySource = null; // Object to be copied (peg, spacer, etc.)
        this.copyPreview = null; // Preview mesh for copy
        
        // Peg sizes
        this.basePegSize = 0.09; // Base round peg size
        this.pegSizes = {
            small: this.basePegSize * 0.5,  // 50% smaller
            base: this.basePegSize,          // Base size
            large: this.basePegSize * 1.5    // 50% larger
        };
        
        this.initUI();
        // Setup placement listeners after a short delay to ensure canvas is ready
        setTimeout(() => {
            this.setupPlacementListeners();
        }, 100);
    }
    
    setupPlacementListeners() {
        // Listen for mouse move to update preview and mouse position
        // Use capture phase to ensure our handlers run first
        if (this.game && this.game.canvas) {
            // Remove existing listeners if any (to avoid duplicates)
            const existingMousemove = this._mousemoveHandler;
            const existingClick = this._clickHandler;
            
            if (existingMousemove) {
                this.game.canvas.removeEventListener('mousemove', existingMousemove, true);
            }
            if (existingClick) {
                this.game.canvas.removeEventListener('click', existingClick, true);
            }
            
            // Create new handlers
            this._mousemoveHandler = (event) => {
                this.handleMouseMove(event);
            };
            this._clickHandler = (event) => {
                this.handlePlacementClick(event);
            };
            this._mousedownHandler = (event) => {
                this.handleMouseDown(event);
            };
            this._mouseupHandler = (event) => {
                this.handleMouseUp(event);
            };
            
            // Add listeners with capture phase (true = capture phase)
            this.game.canvas.addEventListener('mousemove', this._mousemoveHandler, true);
            this.game.canvas.addEventListener('click', this._clickHandler, true);
            this.game.canvas.addEventListener('mousedown', this._mousedownHandler, true);
            this.game.canvas.addEventListener('mouseup', this._mouseupHandler, true);
            
            // Add keyboard listener for rotate tool
            this._keydownHandler = (event) => {
                this.handleKeyDown(event);
            };
            this._keyupHandler = (event) => {
                this.handleKeyUp(event);
            };
            window.addEventListener('keydown', this._keydownHandler);
            window.addEventListener('keyup', this._keyupHandler);
        }
    }
    
    handleMouseMove(event) {
        // Only handle if editor is active and not in testing mode
        if (!this.isActive || this.testingMode) {
            if (this.previewMesh) {
                this.hidePreview();
            }
            return;
        }
        
        // Convert mouse coordinates to world coordinates (same logic as Game.js)
        const rect = this.game.canvas.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;
        
        // Convert to normalized coordinates (-1 to 1)
        const normalizedX = (mouseX / rect.width) * 2 - 1;
        const normalizedY = 1 - (mouseY / rect.height) * 2; // Flip Y
        
        // Convert to 2D world coordinates
        // Camera view is 12 units wide (-6 to 6), 9 units tall (-4.5 to 4.5)
        const worldX = normalizedX * 6;
        const worldY = normalizedY * 4.5;
        
        this.mouseWorldPos = { x: worldX, y: worldY };
        
        // Handle resizing spacer or shape by dragging handle
        const objectToResize = this.selectedSpacer || this.selectedShape;
        if (this.isResizingSpacer && objectToResize && this.selectedHandle) {
            if (objectToResize.updateSize) {
                // It's a shape or spacer - use resizeSpacerByHandle (works for both)
                this.resizeSpacerByHandle(worldX, worldY);
            }
            return; // Don't update preview while resizing
        }
        
        // Handle dragging for move tool
        if (this.isDragging && this.movingPeg) {
            const newX = worldX - this.dragOffset.x;
            const newY = worldY - this.dragOffset.y;
            
            // Check if it's a spacer, shape, or peg
            if (this.movingPeg.position !== undefined && this.movingPeg.containsPoint) {
                // It's a spacer or shape
                if (this.movingPeg.updateSize) {
                    // It's a shape
                    this.moveShape(this.movingPeg, newX, newY);
                } else {
                    // It's a spacer
                    this.moveSpacer(this.movingPeg, newX, newY);
                }
            } else {
                // It's a peg
                this.movePeg(this.movingPeg, newX, newY);
                // Update indicator position
                if (this.selectionIndicator && this.movingPeg.mesh) {
                    this.selectionIndicator.position.copy(this.movingPeg.mesh.position);
                    this.selectionIndicator.position.z = this.movingPeg.mesh.position.z + 0.01;
                }
            }
            return; // Don't update preview while dragging
        }
        
        // Update copy preview position if copy tool is active
        if (this.selectedTool && this.selectedTool.category === 'copy' && this.copyPreview && this.copySource) {
            this.copyPreview.position.set(worldX, worldY, 0.01);
        }
        
        // Update preview if tool is selected
        if (this.selectedTool && this.selectedTool.category !== 'move' && this.selectedTool.category !== 'rotate' && this.selectedTool.category !== 'copy' && this.selectedTool.category !== 'resize') {
            this.updatePreview(worldX, worldY);
        } else {
            this.hidePreview();
        }
    }
    
    handlePlacementClick(event) {
        console.log('Editor click handler:', {
            isActive: this.isActive,
            testingMode: this.testingMode,
            selectedTool: this.selectedTool,
            target: event.target
        });
        
        // Only handle if editor is active, tool is selected, and not in testing mode
        if (!this.isActive || this.testingMode || !this.selectedTool) {
            console.log('Click handler early return');
            return;
        }
        
        // Don't place if clicking inside modals
        const objectsModal = document.getElementById('objects-modal');
        const fileOperationsModal = document.getElementById('file-operations-modal');
        if ((objectsModal && objectsModal.contains(event.target)) || 
            (fileOperationsModal && fileOperationsModal.contains(event.target))) {
            console.log('Click inside modal, ignoring');
            return;
        }
        
        // Prevent game's click handler from processing this click
        event.stopPropagation();
        event.preventDefault();
        
        console.log('Placing/erasing object at:', this.mouseWorldPos);
        
        // Check if eraser tool is selected
        if (this.selectedTool && this.selectedTool.category === 'eraser') {
            this.eraseObject(this.mouseWorldPos.x, this.mouseWorldPos.y);
        } else if (this.selectedTool && this.selectedTool.category === 'copy') {
            // Copy tool - select source object or place copy
            if (this.copySource) {
                this.placeCopy(this.mouseWorldPos.x, this.mouseWorldPos.y);
            } else {
                this.selectCopySource(this.mouseWorldPos.x, this.mouseWorldPos.y);
            }
        } else if (this.selectedTool && this.selectedTool.category === 'move') {
            // Move tool - find peg at click position (handled in mousedown)
            // Click is just for selection if not dragging
        } else if (this.selectedTool && this.selectedTool.category === 'rotate') {
            // Rotate tool - select peg at click position
            this.selectPegForRotation(this.mouseWorldPos.x, this.mouseWorldPos.y);
        } else {
            // Place object at current mouse position
            this.placeObject(this.mouseWorldPos.x, this.mouseWorldPos.y);
        }
    }
    
    handleMouseDown(event) {
        // Handle for move tool or resize tool
        if (!this.isActive || this.testingMode || !this.selectedTool) {
            return;
        }
        
        // Don't handle if clicking inside modals
        const objectsModal = document.getElementById('objects-modal');
        const fileOperationsModal = document.getElementById('file-operations-modal');
        if ((objectsModal && objectsModal.contains(event.target)) || 
            (fileOperationsModal && fileOperationsModal.contains(event.target))) {
            return;
        }
        
        if (this.selectedTool.category === 'move') {
            // Move tool - find peg or spacer at mouse position
            const peg = this.findPegAtPosition(this.mouseWorldPos.x, this.mouseWorldPos.y);
            if (peg) {
                this.movingPeg = peg;
                this.isDragging = true;
                const pegPos = peg.body.position;
                this.dragOffset = {
                    x: this.mouseWorldPos.x - pegPos.x,
                    y: this.mouseWorldPos.y - pegPos.y
                };
                this.updateSelectionIndicator(peg);
                event.stopPropagation();
                event.preventDefault();
            } else {
                // Try spacer
                const spacer = this.findSpacerAtPosition(this.mouseWorldPos.x, this.mouseWorldPos.y);
                if (spacer) {
                    this.movingPeg = spacer; // Reuse movingPeg for spacer
                    this.isDragging = true;
                    this.dragOffset = {
                        x: this.mouseWorldPos.x - spacer.position.x,
                        y: this.mouseWorldPos.y - spacer.position.y
                    };
                    this.selectedSpacer = spacer;
                    event.stopPropagation();
                    event.preventDefault();
                } else {
                    // Try shape
                    const shape = this.findShapeAtPosition(this.mouseWorldPos.x, this.mouseWorldPos.y);
                    if (shape) {
                        this.movingPeg = shape; // Reuse movingPeg for shape
                        this.isDragging = true;
                        this.dragOffset = {
                            x: this.mouseWorldPos.x - shape.position.x,
                            y: this.mouseWorldPos.y - shape.position.y
                        };
                        this.selectedShape = shape;
                        event.stopPropagation();
                        event.preventDefault();
                    }
                }
            }
        } else if (this.selectedTool.category === 'resize') {
            // Resize tool - check if clicking on a handle first (spacer or shape)
            const objectToResize = this.selectedSpacer || this.selectedShape;
            if (objectToResize && objectToResize.handles && objectToResize.handles.length > 0) {
                const handle = this.findHandleAtPosition(objectToResize, this.mouseWorldPos.x, this.mouseWorldPos.y);
                if (handle) {
                    // Start resizing by dragging this handle
                    this.selectedHandle = handle;
                    this.isResizingSpacer = true;
                    this.resizeStartPos = { x: this.mouseWorldPos.x, y: this.mouseWorldPos.y };
                    this.resizeStartSize = { width: objectToResize.size.width, height: objectToResize.size.height };
                    event.stopPropagation();
                    event.preventDefault();
                    return;
                }
            }
            
            // Otherwise, find spacer or shape at mouse position
            const spacer = this.findSpacerAtPosition(this.mouseWorldPos.x, this.mouseWorldPos.y);
            if (spacer) {
                // Hide handles on previously selected objects
                if (this.selectedSpacer && this.selectedSpacer !== spacer) {
                    this.selectedSpacer.removeHandles();
                }
                if (this.selectedShape) {
                    this.selectedShape.removeHandles();
                    this.selectedShape = null;
                }
                this.selectedSpacer = spacer;
                spacer.createHandles(); // Show handles for selected spacer
                event.stopPropagation();
                event.preventDefault();
            } else {
                const shape = this.findShapeAtPosition(this.mouseWorldPos.x, this.mouseWorldPos.y);
                if (shape) {
                    // Hide handles on previously selected objects
                    if (this.selectedSpacer) {
                        this.selectedSpacer.removeHandles();
                        this.selectedSpacer = null;
                    }
                    if (this.selectedShape && this.selectedShape !== shape) {
                        this.selectedShape.removeHandles();
                    }
                    this.selectedShape = shape;
                    shape.createHandles(); // Show handles for selected shape
                    event.stopPropagation();
                    event.preventDefault();
                } else if (this.selectedShape) {
                    // If shape is already selected (from rotate tool), show handles for it
                    this.selectedShape.createHandles();
                    event.stopPropagation();
                    event.preventDefault();
                }
            }
        }
    }
    
    handleMouseUp(event) {
        // Handle resize end first
        if (this.isResizingSpacer) {
            this.isResizingSpacer = false;
            this.selectedHandle = null;
            // Handles remain visible for continued resizing
        }
        
        // Handle move end
        if (this.isDragging) {
            const wasMoving = this.movingPeg;
            this.isDragging = false;
            this.movingPeg = null;
            this.dragOffset = { x: 0, y: 0 };
            // Clear selection indicator when moving stops
            this.updateSelectionIndicator(null);
        }
    }
    
    handleKeyDown(event) {
        // Only handle for rotate tool
        if (!this.isActive || this.testingMode || !this.selectedTool || this.selectedTool.category !== 'rotate') {
            return;
        }
        
        // Check if we have a peg or shape selected
        const objectToRotate = this.selectedPeg || this.selectedShape;
        if (!objectToRotate) return;
        
        if (event.key === 'ArrowLeft') {
            // Rotate clockwise (flipped direction)
            if (this.selectedPeg) {
                this.rotatePeg(this.selectedPeg, 5);
                this.startRotateKeyRepeat(() => this.rotatePeg(this.selectedPeg, 5));
            } else if (this.selectedShape) {
                this.rotateShape(this.selectedShape, 5);
                this.startRotateKeyRepeat(() => this.rotateShape(this.selectedShape, 5));
            }
            event.preventDefault();
        } else if (event.key === 'ArrowRight') {
            // Rotate counterclockwise (flipped direction)
            if (this.selectedPeg) {
                this.rotatePeg(this.selectedPeg, -5);
                this.startRotateKeyRepeat(() => this.rotatePeg(this.selectedPeg, -5));
            } else if (this.selectedShape) {
                this.rotateShape(this.selectedShape, -5);
                this.startRotateKeyRepeat(() => this.rotateShape(this.selectedShape, -5));
            }
            event.preventDefault();
        }
    }
    
    handleKeyUp(event) {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            this.stopRotateKeyRepeat();
        }
    }
    
    updatePreview(worldX, worldY) {
        if (!this.selectedTool) return;
        
        // Create or update preview mesh
        if (!this.previewMesh) {
            this.createPreviewMesh();
        }
        
        if (this.previewMesh) {
            // Position preview at cursor (z should match the initial z position from createPreviewMesh)
            this.previewMesh.position.set(worldX, worldY, 0.01);
            this.previewMesh.visible = true;
        }
    }
    
    hidePreview() {
        if (this.previewMesh) {
            this.previewMesh.visible = false;
        }
    }
    
    createPreviewMesh() {
        if (!this.selectedTool || !this.game || !this.game.scene) return;
        
        // Don't create preview mesh for eraser, move, rotate, copy, or resize tools
        if (this.selectedTool.category === 'eraser' || 
            this.selectedTool.category === 'move' || 
            this.selectedTool.category === 'rotate' ||
            this.selectedTool.category === 'copy' ||
            this.selectedTool.category === 'resize') {
            return;
        }
        
        const tool = this.selectedTool;
        let geometry;
        
        if (tool.category === 'peg') {
            if (tool.type === 'round') {
                // Round peg preview - already in XY plane
                const radius = this.pegSizes[tool.size] || this.pegSizes.base;
                geometry = new THREE.CircleGeometry(radius, 16);
            } else if (tool.type === 'rect') {
                // Rectangular peg preview - use ShapeGeometry for XY plane
                // Height should match round peg diameter (2 * radius), so height = 2 * pegSizes
                const height = (this.pegSizes[tool.size] || this.pegSizes.base) * 2;
                const width = height * 2; // 2:1 ratio (width:height)
                const shape = new THREE.Shape();
                shape.moveTo(-width / 2, -height / 2);
                shape.lineTo(width / 2, -height / 2);
                shape.lineTo(width / 2, height / 2);
                shape.lineTo(-width / 2, height / 2);
                shape.closePath();
                geometry = new THREE.ShapeGeometry(shape);
            } else if (tool.type === 'dome') {
                // Dome peg preview - rectangle with rounded top
                // Height should match round peg diameter (2 * radius), so height = 2 * pegSizes
                const height = (this.pegSizes[tool.size] || this.pegSizes.base) * 2;
                const width = height * 2; // 2:1 ratio (width:height)
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
                return; // Unknown peg type
            }
        } else if (tool.category === 'spacer') {
            // Spacer preview - rectangle
            const defaultSize = { width: 1, height: 1 };
            const shape = new THREE.Shape();
            const halfWidth = defaultSize.width / 2;
            const halfHeight = defaultSize.height / 2;
            shape.moveTo(-halfWidth, -halfHeight);
            shape.lineTo(halfWidth, -halfHeight);
            shape.lineTo(halfWidth, halfHeight);
            shape.lineTo(-halfWidth, halfHeight);
            shape.closePath();
            geometry = new THREE.ShapeGeometry(shape);
        } else if (tool.category === 'shape') {
            // Shape preview - rectangle for line shape
            const roundPegDiameter = 0.09 * 2; // Base round peg diameter
            const defaultHeight = roundPegDiameter * 2; // Double the height
            const previewWidth = 2;
            const previewHeight = defaultHeight;
            
            const shape = new THREE.Shape();
            const halfWidth = previewWidth / 2;
            const halfHeight = previewHeight / 2;
            shape.moveTo(-halfWidth, -halfHeight);
            shape.lineTo(halfWidth, -halfHeight);
            shape.lineTo(halfWidth, halfHeight);
            shape.lineTo(-halfWidth, halfHeight);
            shape.closePath();
            geometry = new THREE.ShapeGeometry(shape);
        } else {
            // For other categories, create a simple circle preview for now
            geometry = new THREE.CircleGeometry(0.1, 16);
        }
        
        // Use different colors for different tool types
        let previewColor = 0xffffff;
        let previewOpacity = 0.5;
        if (tool.category === 'spacer') {
            previewColor = 0xffff00; // Yellow
            previewOpacity = 0.3;
        } else if (tool.category === 'shape') {
            previewColor = 0x00ff00; // Green
            previewOpacity = 0.2;
        }
        
        const material = new THREE.MeshBasicMaterial({
            color: previewColor,
            transparent: true,
            opacity: previewOpacity,
            side: THREE.DoubleSide,
            depthWrite: false // Prevent z-fighting
        });
        
        this.previewMesh = new THREE.Mesh(geometry, material);
        this.previewMesh.visible = false;
        this.previewMesh.position.z = 0.01; // Slightly above pegs to ensure visibility
        this.previewMesh.renderOrder = 999; // Render on top
        
        this.game.scene.add(this.previewMesh);
        console.log('Preview mesh created:', this.previewMesh, 'Type:', tool.type, 'Size:', tool.size);
    }
    
    placeObject(worldX, worldY) {
        if (!this.selectedTool || !this.game) return;
        
        const tool = this.selectedTool;
        
        if (tool.category === 'peg') {
            this.placePeg(worldX, worldY, tool);
        } else if (tool.category === 'shape') {
            this.placeShape(worldX, worldY, tool);
        } else if (tool.category === 'static') {
            // TODO: Implement static object placement
            console.log('Static object placement not yet implemented');
        } else if (tool.category === 'spacer') {
            this.placeSpacer(worldX, worldY);
        } else if (tool.category === 'eraser') {
            // Eraser is handled in handlePlacementClick directly
            this.eraseObject(worldX, worldY);
        } else if (tool.category === 'copy') {
            // Copy tool - select source object
            this.selectCopySource(worldX, worldY);
        }
    }
    
    eraseObject(worldX, worldY) {
        // First check shapes (they have boundaries, not just point distance)
        if (this.shapes && this.shapes.length > 0) {
            const shape = this.findShapeAtPosition(worldX, worldY);
            if (shape) {
                // Remove shape and all contained pegs (handled in shape.remove())
                shape.remove();
                const shapeIndex = this.shapes.indexOf(shape);
                if (shapeIndex !== -1) {
                    this.shapes.splice(shapeIndex, 1);
                }
                
                // Remove from placed objects
                this.placedObjects = this.placedObjects.filter(obj => {
                    if (obj.category === 'shape' && obj.position) {
                        const objX = obj.position.x;
                        const objY = obj.position.y;
                        const shapeX = shape.position.x;
                        const shapeY = shape.position.y;
                        const distance = Math.sqrt(
                            Math.pow(objX - shapeX, 2) + 
                            Math.pow(objY - shapeY, 2)
                        );
                        return distance >= 0.05; // Keep if not matching
                    }
                    return true;
                });
                
                // Clear selection if this shape was selected
                if (this.selectedShape === shape) {
                    this.selectedShape = null;
                    this.updateSelectionIndicator(null);
                }
                return;
            }
        }
        
        // Then check spacers (they have boundaries, not just point distance)
        if (this.spacers && this.spacers.length > 0) {
            const spacer = this.findSpacerAtPosition(worldX, worldY);
            if (spacer) {
                // Remove spacer
                spacer.remove();
                const spacerIndex = this.spacers.indexOf(spacer);
                if (spacerIndex !== -1) {
                    this.spacers.splice(spacerIndex, 1);
                }
                
                // Remove from placed objects
                this.placedObjects = this.placedObjects.filter(obj => {
                    if (obj.category === 'spacer' && obj.position) {
                        const objX = obj.position.x;
                        const objY = obj.position.y;
                        const spacerX = spacer.position.x;
                        const spacerY = spacer.position.y;
                        const distance = Math.sqrt(
                            Math.pow(objX - spacerX, 2) + 
                            Math.pow(objY - spacerY, 2)
                        );
                        return distance >= 0.05; // Keep if not matching
                    }
                    return true;
                });
                
                // Clear selection if this spacer was selected
                if (this.selectedSpacer === spacer) {
                    this.selectedSpacer = null;
                    this.updateSelectionIndicator(null);
                }
                return;
            }
        }
        
        // Then check pegs
        if (!this.game || !this.game.pegs) return;
        
        const eraseRadius = 0.2; // Radius to check for pegs to erase
        
        // Find pegs near the click position
        const pegsToRemove = [];
        this.game.pegs.forEach((peg, index) => {
            if (peg && peg.body && peg.body.position) {
                const pegPos = peg.body.position;
                const distance = Math.sqrt(
                    Math.pow(pegPos.x - worldX, 2) + 
                    Math.pow(pegPos.y - worldY, 2)
                );
                
                if (distance <= eraseRadius) {
                    pegsToRemove.push({ peg, index });
                }
            }
        });
        
        // Remove found pegs
        pegsToRemove.forEach(({ peg }) => {
            // If peg is inside a shape, remove it from the shape
            if (peg.parentShape) {
                peg.parentShape.removePeg(peg);
            }
            
            // Remove from scene and physics world
            if (peg.remove) {
                peg.remove();
            }
            
            // Remove from array
            const arrayIndex = this.game.pegs.indexOf(peg);
            if (arrayIndex !== -1) {
                this.game.pegs.splice(arrayIndex, 1);
            }
            
            // Remove from placed objects
            this.placedObjects = this.placedObjects.filter(obj => {
                // Match by position (with some tolerance)
                if (obj.position && peg.body && peg.body.position) {
                    const objX = obj.position.x;
                    const objY = obj.position.y;
                    const pegX = peg.body.position.x;
                    const pegY = peg.body.position.y;
                    const distance = Math.sqrt(
                        Math.pow(objX - pegX, 2) + 
                        Math.pow(objY - pegY, 2)
                    );
                    return distance > 0.05; // Keep if not close to erased peg
                }
                return true;
            });
        });
        
        if (pegsToRemove.length > 0) {
            console.log(`Erased ${pegsToRemove.length} peg(s) at (${worldX.toFixed(2)}, ${worldY.toFixed(2)})`);
        }
    }
    
    findPegAtPosition(worldX, worldY) {
        if (!this.game || !this.game.pegs) return null;
        
        const selectRadius = 0.2; // Radius to check for pegs
        
        // Find nearest peg to the position
        let closestPeg = null;
        let closestDistance = Infinity;
        
        this.game.pegs.forEach(peg => {
            if (peg && peg.body && peg.body.position) {
                const pegPos = peg.body.position;
                const distance = Math.sqrt(
                    Math.pow(pegPos.x - worldX, 2) + 
                    Math.pow(pegPos.y - worldY, 2)
                );
                
                if (distance <= selectRadius && distance < closestDistance) {
                    closestDistance = distance;
                    closestPeg = peg;
                }
            }
        });
        
        return closestPeg;
    }
    
    movePeg(peg, newX, newY) {
        if (!peg || !peg.body || !peg.mesh) return;
        
        // Constrain movement to spacer edges
        const constrainedPos = this.constrainPegToSpacerEdges(newX, newY, peg, peg.body.position.x, peg.body.position.y);
        const roundedX = this.roundToDecimals(constrainedPos.x);
        const roundedY = this.roundToDecimals(constrainedPos.y);
        
        // Update physics body position
        peg.body.position.set(roundedX, roundedY, peg.body.position.z || 0);
        
        // Update visual mesh position
        peg.mesh.position.set(roundedX, roundedY, peg.mesh.position.z || 0);
        
        // Update position in placedObjects
        const placedObj = this.placedObjects.find(obj => {
            if (obj.position && peg.body && peg.body.position) {
                const objX = obj.position.x;
                const objY = obj.position.y;
                const pegX = peg.body.position.x;
                const pegY = peg.body.position.y;
                const distance = Math.sqrt(
                    Math.pow(objX - pegX, 2) + 
                    Math.pow(objY - pegY, 2)
                );
                return distance < 0.05; // Close enough to be the same peg
            }
            return false;
        });
        
        if (placedObj) {
            placedObj.position.x = roundedX;
            placedObj.position.y = roundedY;
        }
    }
    
    selectPegForRotation(worldX, worldY) {
        // Work with pegs or shapes
        const peg = this.findPegAtPosition(worldX, worldY);
        if (peg) {
            this.selectedPeg = peg;
            this.selectedShape = null; // Clear shape selection
            this.updateSelectionIndicator(peg);
        } else {
            // Try shape
            const shape = this.findShapeAtPosition(worldX, worldY);
            if (shape) {
                this.selectedShape = shape;
                this.selectedPeg = null; // Clear peg selection
                this.updateSelectionIndicator(shape);
            } else {
                // Clear selection if clicking empty space
                this.selectedPeg = null;
                this.selectedShape = null;
                this.updateSelectionIndicator(null);
            }
        }
        console.log('Selected peg for rotation:', peg ? 'Found' : 'None', 'Shape:', this.selectedShape ? 'Found' : 'None');
    }
    
    findHandleAtPosition(spacer, worldX, worldY) {
        if (!spacer || !spacer.handles || spacer.handles.length === 0) return null;
        
        const handleRadius = 0.2; // Radius to detect handle clicks
        
        for (const handle of spacer.handles) {
            // Get world position of handle
            const handleWorldPos = new THREE.Vector3();
            handle.getWorldPosition(handleWorldPos);
            
            const distance = Math.sqrt(
                Math.pow(handleWorldPos.x - worldX, 2) + 
                Math.pow(handleWorldPos.y - worldY, 2)
            );
            
            if (distance <= handleRadius) {
                return handle;
            }
        }
        
        return null;
    }
    
    resizeSpacerByHandle(worldX, worldY) {
        // Works for both spacers and shapes
        const objectToResize = this.selectedSpacer || this.selectedShape;
        if (!objectToResize || !this.selectedHandle) return;
        
        const deltaX = worldX - this.resizeStartPos.x;
        const deltaY = worldY - this.resizeStartPos.y;
        
        const handleIndex = this.selectedHandle.userData.handleIndex;
        
        let newWidth = this.resizeStartSize.width;
        let newHeight = this.resizeStartSize.height;
        
        // Adjust size based on which corner handle is being dragged
        // 0: bottom-left, 1: bottom-right, 2: top-right, 3: top-left
        switch (handleIndex) {
            case 0: // Bottom-left
                newWidth = this.resizeStartSize.width - deltaX * 2;
                newHeight = this.resizeStartSize.height - deltaY * 2;
                break;
            case 1: // Bottom-right
                newWidth = this.resizeStartSize.width + deltaX * 2;
                newHeight = this.resizeStartSize.height - deltaY * 2;
                break;
            case 2: // Top-right
                newWidth = this.resizeStartSize.width + deltaX * 2;
                newHeight = this.resizeStartSize.height + deltaY * 2;
                break;
            case 3: // Top-left
                newWidth = this.resizeStartSize.width - deltaX * 2;
                newHeight = this.resizeStartSize.height + deltaY * 2;
                break;
        }
        
        // Ensure minimum size
        newWidth = Math.max(0.2, newWidth);
        newHeight = Math.max(0.2, newHeight);
        
        const newSize = { width: newWidth, height: newHeight };
        objectToResize.updateSize(newSize);
        
        // Update in placed objects
        const category = objectToResize === this.selectedSpacer ? 'spacer' : 'shape';
        const placedObj = this.placedObjects.find(obj => {
            if (obj.category === category && obj.position && objectToResize.position) {
                const objX = obj.position.x;
                const objY = obj.position.y;
                const objectX = objectToResize.position.x;
                const objectY = objectToResize.position.y;
                const distance = Math.sqrt(
                    Math.pow(objX - objectX, 2) + 
                    Math.pow(objY - objectY, 2)
                );
                return distance < 0.05;
            }
            return false;
        });
        
        if (placedObj) {
            placedObj.size = { width: newWidth, height: newHeight };
        }
    }
    
    /**
     * Get bounding box for a peg at a given position
     */
    getPegBounds(x, y, pegType, pegSize) {
        const baseSize = 0.09;
        const sizeMultipliers = { small: 0.5, base: 1.0, large: 1.5 };
        const actualSize = baseSize * (sizeMultipliers[pegSize] || 1.0);
        
        if (pegType === 'round') {
            const radius = actualSize;
            return {
                left: x - radius,
                right: x + radius,
                bottom: y - radius,
                top: y + radius
            };
        } else {
            // rect or dome
            const height = actualSize * 2;
            const width = height * 2;
            return {
                left: x - width / 2,
                right: x + width / 2,
                bottom: y - height / 2,
                top: y + height / 2
            };
        }
    }
    
    /**
     * Check if a peg at the given position overlaps with any spacer
     */
    checkPegOverlapsSpacer(x, y, pegType, pegSize) {
        if (!this.spacers || this.spacers.length === 0) return false;
        
        const pegBounds = this.getPegBounds(x, y, pegType, pegSize);
        
        for (const spacer of this.spacers) {
            const spacerBounds = spacer.getBounds();
            
            // Check for overlap
            if (pegBounds.right > spacerBounds.left &&
                pegBounds.left < spacerBounds.right &&
                pegBounds.top > spacerBounds.bottom &&
                pegBounds.bottom < spacerBounds.top) {
                return true; // Overlaps
            }
        }
        
        return false;
    }
    
    /**
     * Constrain peg movement to spacer edges - snap to edges when touching
     * Returns constrained position {x, y}
     */
    constrainPegToSpacerEdges(newX, newY, peg, oldX, oldY) {
        if (!this.spacers || this.spacers.length === 0) {
            return { x: newX, y: newY };
        }
        
        const pegType = peg.type || 'round';
        const pegSize = peg.size || 'base';
        let constrainedX = newX;
        let constrainedY = newY;
        
        // Get current peg bounds
        const newPegBounds = this.getPegBounds(newX, newY, pegType, pegSize);
        const oldPegBounds = this.getPegBounds(oldX, oldY, pegType, pegSize);
        
        for (const spacer of this.spacers) {
            const spacerBounds = spacer.getBounds();
            
            // Check if peg would overlap spacer
            const wouldOverlap = newPegBounds.right > spacerBounds.left &&
                                 newPegBounds.left < spacerBounds.right &&
                                 newPegBounds.top > spacerBounds.bottom &&
                                 newPegBounds.bottom < spacerBounds.top;
            
            if (wouldOverlap) {
                // Calculate movement direction
                const deltaX = newX - oldX;
                const deltaY = newY - oldY;
                
                // Check if moving primarily in X or Y direction
                const absDeltaX = Math.abs(deltaX);
                const absDeltaY = Math.abs(deltaY);
                
                // Get peg dimensions for calculating constraint
                const pegBoundsAtNewPos = this.getPegBounds(newX, newY, pegType, pegSize);
                const pegHeight = pegBoundsAtNewPos.top - pegBoundsAtNewPos.bottom;
                const pegWidth = pegBoundsAtNewPos.right - pegBoundsAtNewPos.left;
                
                if (absDeltaY > absDeltaX) {
                    // Moving primarily in Y direction
                    // Snap to top or bottom edge
                    if (deltaY < 0) {
                        // Moving up (toward spacer from below) - peg bottom should touch spacer top
                        constrainedY = spacerBounds.top + pegHeight / 2;
                    } else {
                        // Moving down (toward spacer from above) - peg top should touch spacer bottom
                        constrainedY = spacerBounds.bottom - pegHeight / 2;
                    }
                    // Allow X movement freely
                    constrainedX = newX;
                } else {
                    // Moving primarily in X direction
                    // Snap to left or right edge
                    if (deltaX > 0) {
                        // Moving right (toward spacer from left) - peg right should touch spacer left
                        constrainedX = spacerBounds.left - pegWidth / 2;
                    } else {
                        // Moving left (toward spacer from right) - peg left should touch spacer right
                        constrainedX = spacerBounds.right + pegWidth / 2;
                    }
                    // Allow Y movement freely
                    constrainedY = newY;
                }
            }
        }
        
        return { x: constrainedX, y: constrainedY };
    }
    
    rotatePeg(peg, angleDegrees) {
        if (!peg || !peg.body || !peg.mesh) return;
        
        // Convert degrees to radians
        const angleRadians = (angleDegrees * Math.PI) / 180;
        
        // Get current Z rotation from mesh (it's simpler to track here)
        const currentZRotation = peg.mesh.rotation.z || 0;
        const newZRotation = currentZRotation + angleRadians;
        
        // Update visual mesh rotation
        peg.mesh.rotation.z = newZRotation;
        
        // Update physics body rotation (create quaternion from Z-axis rotation)
        const euler = new THREE.Euler(0, 0, newZRotation);
        const quaternion = new THREE.Quaternion().setFromEuler(euler);
        peg.body.quaternion.set(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
        
        // Update indicator rotation
        if (this.selectionIndicator) {
            this.selectionIndicator.rotation.z = newZRotation;
        }
    }
    
    rotateShape(shape, angleDegrees) {
        if (!shape || !shape.mesh) return;
        
        // Convert degrees to radians
        const angleRadians = (angleDegrees * Math.PI) / 180;
        
        // Get current Z rotation from mesh
        const currentZRotation = shape.mesh.rotation.z || 0;
        const newZRotation = currentZRotation + angleRadians;
        
        // Update shape rotation
        shape.setRotation(newZRotation);
        
        // Update indicator rotation if shape is selected
        if (this.selectionIndicator && this.selectedShape === shape) {
            this.selectionIndicator.rotation.z = newZRotation;
        }
    }
    
    startRotateKeyRepeat(callback) {
        // Clear any existing timer
        if (this.rotateKeyRepeatTimer) {
            clearInterval(this.rotateKeyRepeatTimer);
        }
        
        // Start repeating after initial delay (for first press)
        // Then repeat every 50ms when holding
        this.rotateKeyRepeatTimer = setTimeout(() => {
            this.rotateKeyRepeatTimer = setInterval(() => {
                if (this.selectedPeg || this.selectedShape) {
                    callback();
                } else {
                    this.stopRotateKeyRepeat();
                }
            }, 50); // Repeat every 50ms when holding
        }, 300); // Initial delay of 300ms before starting repeat
    }
    
    stopRotateKeyRepeat() {
        if (this.rotateKeyRepeatTimer) {
            clearTimeout(this.rotateKeyRepeatTimer);
            clearInterval(this.rotateKeyRepeatTimer);
            this.rotateKeyRepeatTimer = null;
        }
    }
    
    updateSelectionIndicator(object) {
        if (!this.game || !this.game.scene) return;
        
        // Remove existing indicator
        if (this.selectionIndicator) {
            this.game.scene.remove(this.selectionIndicator);
            if (this.selectionIndicator.geometry) this.selectionIndicator.geometry.dispose();
            if (this.selectionIndicator.material) this.selectionIndicator.material.dispose();
            this.selectionIndicator = null;
        }
        
        // If no object selected, don't show indicator
        if (!object || !object.mesh) return;
        
        // Create outline based on object type (peg or shape)
        let geometry;
        const outlineSize = 0.03; // Thickness of outline
        
        // Check if it's a shape
        if (object.type && (object.type === 'line' || object.type === 'circle')) {
            // Shape outline - rectangle
            const size = object.size || { width: 2, height: 0.36 };
            const outerWidth = size.width + outlineSize * 2;
            const outerHeight = size.height + outlineSize * 2;
            const innerWidth = size.width;
            const innerHeight = size.height;
            
            const shape = new THREE.Shape();
            // Outer rectangle
            shape.moveTo(-outerWidth / 2, -outerHeight / 2);
            shape.lineTo(outerWidth / 2, -outerHeight / 2);
            shape.lineTo(outerWidth / 2, outerHeight / 2);
            shape.lineTo(-outerWidth / 2, outerHeight / 2);
            shape.closePath();
            
            // Inner hole
            const holePath = new THREE.Path();
            holePath.moveTo(-innerWidth / 2, -innerHeight / 2);
            holePath.lineTo(innerWidth / 2, -innerHeight / 2);
            holePath.lineTo(innerWidth / 2, innerHeight / 2);
            holePath.lineTo(-innerWidth / 2, innerHeight / 2);
            holePath.closePath();
            shape.holes.push(holePath);
            
            geometry = new THREE.ShapeGeometry(shape);
        } else if (object.type === 'round') {
            // Circle outline - larger radius
            const radius = object.actualSize || 0.09;
            const outerRadius = radius + outlineSize;
            const innerRadius = radius;
            
            // Use ring geometry or create two circles
            const shape = new THREE.Shape();
            shape.absarc(0, 0, outerRadius, 0, Math.PI * 2, false);
            const holePath = new THREE.Path();
            holePath.absarc(0, 0, innerRadius, 0, Math.PI * 2, true);
            shape.holes.push(holePath);
            geometry = new THREE.ShapeGeometry(shape);
        } else if (object.type === 'rect' || object.type === 'dome') {
            // Rectangle outline
            const height = (object.actualSize || 0.09) * 2;
            const width = height * 2;
            const outerWidth = width + outlineSize * 2;
            const outerHeight = height + outlineSize * 2;
            const innerWidth = width;
            const innerHeight = height;
            
            const shape = new THREE.Shape();
            // Outer rectangle
            shape.moveTo(-outerWidth / 2, -outerHeight / 2);
            shape.lineTo(outerWidth / 2, -outerHeight / 2);
            shape.lineTo(outerWidth / 2, outerHeight / 2);
            shape.lineTo(-outerWidth / 2, outerHeight / 2);
            shape.closePath();
            
            // Inner hole
            const holePath = new THREE.Path();
            holePath.moveTo(-innerWidth / 2, -innerHeight / 2);
            holePath.lineTo(innerWidth / 2, -innerHeight / 2);
            holePath.lineTo(innerWidth / 2, innerHeight / 2);
            holePath.lineTo(-innerWidth / 2, innerHeight / 2);
            holePath.closePath();
            shape.holes.push(holePath);
            
            geometry = new THREE.ShapeGeometry(shape);
        } else {
            return; // Unknown type
        }
        
        const material = new THREE.MeshBasicMaterial({
            color: 0x00ff00, // Green outline
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.8
        });
        
        this.selectionIndicator = new THREE.Mesh(geometry, material);
        this.selectionIndicator.position.copy(object.mesh.position);
        this.selectionIndicator.rotation.z = object.mesh.rotation.z || 0;
        this.selectionIndicator.position.z = object.mesh.position.z + 0.01; // Slightly above object
        this.selectionIndicator.renderOrder = 1000; // Render on top
        
        this.game.scene.add(this.selectionIndicator);
    }
    
    placePeg(worldX, worldY, tool) {
        // Import Peg dynamically
        import('../entities/Peg.js').then(({ Peg }) => {
            // Check if game is initialized - if not, wait a bit and try again
            if (!this.game) {
                console.error('Cannot place peg: game not available');
                return;
            }
            
            // Ensure scene and physicsWorld are initialized
            if (!this.game.scene || !this.game.physicsWorld) {
                console.error('Cannot place peg: scene or physicsWorld not initialized', {
                    hasScene: !!this.game.scene,
                    hasPhysicsWorld: !!this.game.physicsWorld
                });
                // Try to initialize if init exists
                if (this.game.init && typeof this.game.init === 'function') {
                    this.game.init();
                }
                return;
            }
            
            const pegMaterial = this.game.physicsWorld.getPegMaterial();
            const baseColor = 0x4a90e2; // Blue peg
            
            // Round coordinates for determinism
            const roundedX = this.roundToDecimals(worldX);
            const roundedY = this.roundToDecimals(worldY);
            
            // Check if position overlaps with any spacer
            if (this.checkPegOverlapsSpacer(roundedX, roundedY, tool.type || 'round', tool.size || 'base')) {
                console.log('Cannot place peg: overlaps with spacer');
                return; // Don't place peg if it overlaps a spacer
            }
            
            console.log('Creating peg at:', { x: roundedX, y: roundedY, z: 0 });
            
            // Get type and size from tool
            const pegType = tool.type || 'round';
            const pegSize = tool.size || 'base';
            
            const peg = new Peg(
                this.game.scene,
                this.game.physicsWorld,
                { x: roundedX, y: roundedY, z: 0 },
                baseColor,
                pegMaterial,
                pegType,
                pegSize
            );
            
            peg.pointValue = 300;
            peg.isOrange = false;
            peg.isGreen = false;
            peg.isPurple = false;
            
            this.game.pegs.push(peg);
            console.log('Peg created, total pegs:', this.game.pegs.length, 'Peg mesh:', peg.mesh);
            
            // Check if peg is being placed inside a shape
            try {
                const containingShape = this.findShapeAtPosition(roundedX, roundedY);
                if (containingShape && containingShape.addPeg) {
                    containingShape.addPeg(peg);
                }
            } catch (error) {
                console.error('Error adding peg to shape:', error);
            }
            
            // Store in placed objects
            this.placedObjects.push({
                category: 'peg',
                type: tool.type,
                size: tool.size,
                position: { x: roundedX, y: roundedY, z: 0 },
                color: baseColor
            });
        });
    }
    
    roundToDecimals(value, decimals = 3) {
        const factor = Math.pow(10, decimals);
        return Math.round(value * factor) / factor;
    }
    
    placeSpacer(worldX, worldY) {
        if (!this.game || !this.game.scene) return;
        
        // Import Spacer dynamically
        import('../entities/Spacer.js').then(({ Spacer }) => {
            const roundedX = this.roundToDecimals(worldX);
            const roundedY = this.roundToDecimals(worldY);
            
            // Default spacer size (1x1 unit)
            const defaultSize = { width: 1, height: 1 };
            
            const spacer = new Spacer(
                this.game.scene,
                { x: roundedX, y: roundedY, z: 0 },
                defaultSize
            );
            
            // Don't show handles on placement - only when resize tool is selected
            // spacer.createHandles();
            
            this.spacers.push(spacer);
            
            // Store in placed objects
            this.placedObjects.push({
                category: 'spacer',
                type: 'spacer',
                position: { x: roundedX, y: roundedY, z: 0 },
                size: defaultSize,
                isEditorOnly: true
            });
            
            // Clear selection after placing spacer (like other tools)
            this.selectedTool = null;
            this.hidePreview();
            
            console.log('Spacer placed at:', { x: roundedX, y: roundedY }, 'Size:', defaultSize);
        });
    }
    
    placeShape(worldX, worldY, tool) {
        if (!this.game || !this.game.scene) return;
        
        // Import Shape dynamically
        import('../entities/Shape.js').then(({ Shape }) => {
            const roundedX = this.roundToDecimals(worldX);
            const roundedY = this.roundToDecimals(worldY);
            
            const shapeType = tool.type || 'line';
            
            // Default size for line shape: width = 2, height = double round peg height
            const roundPegDiameter = 0.09 * 2; // Base round peg diameter
            const defaultHeight = roundPegDiameter * 2; // Double the height
            
            let defaultSize;
            if (shapeType === 'line') {
                defaultSize = { width: 2, height: defaultHeight };
            } else {
                // Circle shape - use size from tool if provided
                defaultSize = tool.size ? { width: tool.size * 4, height: tool.size * 4 } : { width: 2, height: 2 };
            }
            
            const shape = new Shape(
                this.game.scene,
                { x: roundedX, y: roundedY, z: 0 },
                shapeType,
                defaultSize
            );
            
            this.shapes.push(shape);
            
            // Store in placed objects
            this.placedObjects.push({
                category: 'shape',
                type: shapeType,
                position: { x: roundedX, y: roundedY, z: 0 },
                size: defaultSize,
                isEditorOnly: true
            });
            
            // Clear selection after placing shape
            this.selectedTool = null;
            this.hidePreview();
            
            console.log('Shape placed at:', { x: roundedX, y: roundedY }, 'Type:', shapeType, 'Size:', defaultSize);
        });
    }
    
    moveSpacer(spacer, newX, newY) {
        if (!spacer) return;
        
        const roundedX = this.roundToDecimals(newX);
        const roundedY = this.roundToDecimals(newY);
        
        // Update spacer position
        spacer.moveTo({ x: roundedX, y: roundedY, z: 0 });
        
        // Update in placed objects
        const placedObj = this.placedObjects.find(obj => {
            if (obj.category === 'spacer' && obj.position && spacer.position) {
                const objX = obj.position.x;
                const objY = obj.position.y;
                const spacerX = spacer.position.x;
                const spacerY = spacer.position.y;
                const distance = Math.sqrt(
                    Math.pow(objX - spacerX, 2) + 
                    Math.pow(objY - spacerY, 2)
                );
                return distance < 0.05; // Close enough to be the same spacer
            }
            return false;
        });
        
        if (placedObj) {
            placedObj.position.x = roundedX;
            placedObj.position.y = roundedY;
        }
    }
    
    moveShape(shape, newX, newY) {
        if (!shape) return;
        
        const roundedX = this.roundToDecimals(newX);
        const roundedY = this.roundToDecimals(newY);
        
        // Update shape position
        shape.moveTo({ x: roundedX, y: roundedY, z: 0 });
        
        // Update in placed objects
        const placedObj = this.placedObjects.find(obj => {
            if (obj.category === 'shape' && obj.position && shape.position) {
                const objX = obj.position.x;
                const objY = obj.position.y;
                const shapeX = shape.position.x;
                const shapeY = shape.position.y;
                const distance = Math.sqrt(
                    Math.pow(objX - shapeX, 2) + 
                    Math.pow(objY - shapeY, 2)
                );
                return distance < 0.05; // Close enough to be the same shape
            }
            return false;
        });
        
        if (placedObj) {
            placedObj.position.x = roundedX;
            placedObj.position.y = roundedY;
        }
    }
    
    findSpacerAtPosition(worldX, worldY) {
        if (!this.spacers || this.spacers.length === 0) return null;
        
        // Check each spacer's bounds
        for (const spacer of this.spacers) {
            if (spacer.containsPoint(worldX, worldY)) {
                return spacer;
            }
        }
        
        return null;
    }
    
    findShapeAtPosition(worldX, worldY) {
        if (!this.shapes || this.shapes.length === 0) return null;
        
        // Check each shape's bounds
        for (const shape of this.shapes) {
            if (shape.containsPoint(worldX, worldY)) {
                return shape;
            }
        }
        
        return null;
    }
    
    selectCopySource(worldX, worldY) {
        // First try to find a peg
        const peg = this.findPegAtPosition(worldX, worldY);
        if (peg) {
            this.copySource = { type: 'peg', data: peg };
            this.createCopyPreview(peg);
            return;
        }
        
        // Then try to find a spacer
        const spacer = this.findSpacerAtPosition(worldX, worldY);
        if (spacer) {
            this.copySource = { type: 'spacer', data: spacer };
            this.createCopyPreview(spacer);
            return;
        }
        
        // No object found - clear copy source
        this.copySource = null;
        if (this.copyPreview) {
            this.game.scene.remove(this.copyPreview);
            if (this.copyPreview.geometry) this.copyPreview.geometry.dispose();
            if (this.copyPreview.material) this.copyPreview.material.dispose();
            this.copyPreview = null;
        }
    }
    
    createCopyPreview(source) {
        if (!this.game || !this.game.scene) return;
        
        // Remove existing preview
        if (this.copyPreview) {
            this.game.scene.remove(this.copyPreview);
            if (this.copyPreview.geometry) this.copyPreview.geometry.dispose();
            if (this.copyPreview.material) this.copyPreview.material.dispose();
        }
        
        // Create preview based on source type
        if (source.type === 'round') {
            const radius = source.actualSize || 0.09;
            const geometry = new THREE.CircleGeometry(radius, 16);
            const material = new THREE.MeshBasicMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: 0.5
            });
            this.copyPreview = new THREE.Mesh(geometry, material);
        } else if (source.type === 'rect' || source.type === 'dome') {
            const height = (source.actualSize || 0.09) * 2;
            const width = height * 2;
            const shape = new THREE.Shape();
            shape.moveTo(-width / 2, -height / 2);
            shape.lineTo(width / 2, -height / 2);
            shape.lineTo(width / 2, height / 2);
            shape.lineTo(-width / 2, height / 2);
            shape.closePath();
            const geometry = new THREE.ShapeGeometry(shape);
            const material = new THREE.MeshBasicMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: 0.5
            });
            this.copyPreview = new THREE.Mesh(geometry, material);
        } else if (source.size) {
            // Spacer preview
            const size = source.size;
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
                color: 0xffff00,
                transparent: true,
                opacity: 0.3
            });
            this.copyPreview = new THREE.Mesh(geometry, material);
        }
        
        if (this.copyPreview) {
            this.copyPreview.position.z = 0.01;
            this.copyPreview.renderOrder = 999;
            this.game.scene.add(this.copyPreview);
        }
    }
    
    placeCopy(worldX, worldY) {
        if (!this.copySource) return;
        
        const roundedX = this.roundToDecimals(worldX);
        const roundedY = this.roundToDecimals(worldY);
        
        if (this.copySource.type === 'peg') {
            const sourcePeg = this.copySource.data;
            // Create new peg with same properties
            import('../entities/Peg.js').then(({ Peg }) => {
                const pegMaterial = this.game.physicsWorld.getPegMaterial();
                const peg = new Peg(
                    this.game.scene,
                    this.game.physicsWorld,
                    { x: roundedX, y: roundedY, z: 0 },
                    sourcePeg.color,
                    pegMaterial,
                    sourcePeg.type,
                    sourcePeg.size
                );
                
                // Copy rotation
                peg.mesh.rotation.z = sourcePeg.mesh.rotation.z || 0;
                const euler = new THREE.Euler(0, 0, peg.mesh.rotation.z);
                const quaternion = new THREE.Quaternion().setFromEuler(euler);
                peg.body.quaternion.set(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
                
                peg.pointValue = sourcePeg.pointValue || 300;
                peg.isOrange = sourcePeg.isOrange || false;
                peg.isGreen = sourcePeg.isGreen || false;
                peg.isPurple = sourcePeg.isPurple || false;
                
                this.game.pegs.push(peg);
                
                // Store in placed objects
                this.placedObjects.push({
                    category: 'peg',
                    type: sourcePeg.type,
                    size: sourcePeg.size,
                    position: { x: roundedX, y: roundedY, z: 0 },
                    color: sourcePeg.color,
                    rotation: peg.mesh.rotation.z
                });
            });
        } else if (this.copySource.type === 'spacer') {
            const sourceSpacer = this.copySource.data;
            // Create new spacer with same properties
            import('../entities/Spacer.js').then(({ Spacer }) => {
                const spacer = new Spacer(
                    this.game.scene,
                    { x: roundedX, y: roundedY, z: 0 },
                    sourceSpacer.size
                );
                
                // Don't show handles on copy - only when resize tool is selected
                // spacer.createHandles();
                
                this.spacers.push(spacer);
                
                // Store in placed objects
                this.placedObjects.push({
                    category: 'spacer',
                    type: 'spacer',
                    position: { x: roundedX, y: roundedY, z: 0 },
                    size: sourceSpacer.size,
                    isEditorOnly: true
                });
            });
        }
    }
    
    initUI() {
        // Get UI elements - file operations modal
        this.editorButton = document.getElementById('level-editor-button');
        this.objectsButton = document.getElementById('objects-button');
        this.fileOperationsOverlay = document.getElementById('file-operations-overlay');
        this.fileOperationsClose = document.getElementById('file-operations-close');
        this.editorNew = document.getElementById('level-editor-new');
        this.editorLoad = document.getElementById('level-editor-load');
        this.editorSave = document.getElementById('level-editor-save');
        this.editorTest = document.getElementById('level-editor-test');
        this.fileInput = document.getElementById('level-editor-file-input');
        
        // Get UI elements - objects toolbar modal
        this.objectsOverlay = document.getElementById('objects-overlay');
        this.objectsClose = document.getElementById('objects-close');
        
        // Set up event listeners
        if (this.editorButton) {
            this.editorButton.addEventListener('click', () => this.openFileOperations());
        }
        
        if (this.objectsButton) {
            this.objectsButton.addEventListener('click', () => this.openObjects());
        }
        
        if (this.fileOperationsClose) {
            this.fileOperationsClose.addEventListener('click', () => this.closeFileOperations());
        }
        
        if (this.editorNew) {
            this.editorNew.addEventListener('click', () => this.newLevel());
        }
        
        if (this.editorLoad) {
            this.editorLoad.addEventListener('click', () => this.fileInput?.click());
        }
        
        if (this.editorSave) {
            this.editorSave.addEventListener('click', () => this.saveLevel());
        }
        
        if (this.editorTest) {
            this.editorTest.addEventListener('click', () => this.toggleTestMode());
        }
        
        if (this.fileInput) {
            this.fileInput.addEventListener('change', (e) => this.loadLevelFromFile(e.target.files[0]));
        }
        
        // Close on overlay click
        if (this.fileOperationsOverlay) {
            this.fileOperationsOverlay.addEventListener('click', (e) => {
                if (e.target === this.fileOperationsOverlay) {
                    this.closeFileOperations();
                }
            });
        }
        
        if (this.objectsClose) {
            this.objectsClose.addEventListener('click', () => this.closeObjects());
        }
        
        if (this.objectsOverlay) {
            this.objectsOverlay.addEventListener('click', (e) => {
                if (e.target === this.objectsOverlay) {
                    this.closeObjects();
                }
            });
        }
        
        // Initialize toolbars
        this.initPegsToolbar();
        this.initShapesToolbar();
        this.initStaticToolbar();
        this.initSpacersToolbar();
        this.initEraserToolbar();
        this.initMoveToolbar();
        this.initRotateToolbar();
        this.initCopyToolbar();
        this.initResizeToolbar();
    }
    
    openFileOperations() {
        if (this.fileOperationsOverlay) {
            this.fileOperationsOverlay.classList.add('active');
            // Hide character selector and level selector
            if (this.game) {
                if (this.game.hideCharacterSelector) {
                    this.game.hideCharacterSelector();
                }
                if (this.game.hideLevelSelector) {
                    this.game.hideLevelSelector();
                }
            }
        }
    }
    
    closeFileOperations() {
        if (this.fileOperationsOverlay) {
            this.fileOperationsOverlay.classList.remove('active');
        }
    }
    
    openObjects() {
        if (this.objectsOverlay) {
            this.objectsOverlay.classList.add('active');
            this.isActive = true;
            // Update preview if tool is selected
            if (this.selectedTool && this.game && this.game.scene) {
                if (!this.previewMesh) {
                    this.createPreviewMesh();
                }
            }
        }
    }
    
    closeObjects() {
        if (this.objectsOverlay) {
            this.objectsOverlay.classList.remove('active');
            // Keep isActive true if tool is selected (for placement)
            if (!this.selectedTool) {
                this.isActive = false;
                this.hidePreview();
            }
        }
    }
    
    initPegsToolbar() {
        const pegsItems = document.getElementById('pegs-items');
        if (!pegsItems) return;
        
        // Round pegs - 3 sizes
        for (const [sizeName, size] of Object.entries(this.pegSizes)) {
            const item = this.createToolbarItem('round', sizeName, size, 'circle');
            item.addEventListener('click', () => this.selectTool('peg', { type: 'round', size: sizeName }));
            pegsItems.appendChild(item);
        }
        
        // Rectangular pegs - 3 sizes (2:1 ratio, height = base peg)
        for (const [sizeName, height] of Object.entries(this.pegSizes)) {
            const width = height * 2; // 2:1 ratio
            const item = this.createToolbarItem('rect', sizeName, { width, height }, 'rectangle');
            item.addEventListener('click', () => this.selectTool('peg', { type: 'rect', size: sizeName }));
            pegsItems.appendChild(item);
        }
        
        // Rounded-top rectangular pegs - 3 sizes (extra 20% curve)
        for (const [sizeName, height] of Object.entries(this.pegSizes)) {
            const width = height * 2;
            const curveHeight = height * 0.2; // 20% curve
            const item = this.createToolbarItem('dome', sizeName, { width, height, curveHeight }, 'dome');
            item.addEventListener('click', () => this.selectTool('peg', { type: 'dome', size: sizeName }));
            pegsItems.appendChild(item);
        }
    }
    
    initShapesToolbar() {
        const shapesItems = document.getElementById('shapes-items');
        if (!shapesItems) return;
        
        // Line shape
        const lineItem = this.createToolbarItem('line-shape', 'line', null, 'line');
        lineItem.addEventListener('click', () => this.selectTool('shape', { type: 'line' }));
        shapesItems.appendChild(lineItem);
        
        // Circular shapes - 3 sizes (each for 16 pegs)
        for (const [sizeName, pegSize] of Object.entries(this.pegSizes)) {
            const item = this.createToolbarItem('circle-shape', sizeName, pegSize, 'circle');
            item.addEventListener('click', () => this.selectTool('shape', { type: 'circle', size: sizeName }));
            shapesItems.appendChild(item);
        }
    }
    
    initStaticToolbar() {
        const staticItems = document.getElementById('static-items');
        if (!staticItems) return;
        
        // Rectangle static
        const rectItem = this.createToolbarItem('static-rect', 'rect', null, 'rectangle');
        rectItem.addEventListener('click', () => this.selectTool('static', { type: 'rect' }));
        staticItems.appendChild(rectItem);
        
        // Round static
        const roundItem = this.createToolbarItem('static-round', 'round', null, 'circle');
        roundItem.addEventListener('click', () => this.selectTool('static', { type: 'round' }));
        staticItems.appendChild(roundItem);
    }
    
    initSpacersToolbar() {
        const spacersItems = document.getElementById('spacers-items');
        if (!spacersItems) return;
        
        const spacerItem = this.createToolbarItem('spacer', 'point', null, 'point');
        spacerItem.addEventListener('click', () => this.selectTool('spacer', { type: 'point' }));
        spacersItems.appendChild(spacerItem);
    }
    
    initEraserToolbar() {
        const eraserItems = document.getElementById('eraser-items');
        if (!eraserItems) return;
        
        const eraserItem = this.createToolbarItem('eraser', 'eraser', null, 'eraser');
        eraserItem.addEventListener('click', () => this.selectTool('eraser', { type: 'eraser' }));
        eraserItems.appendChild(eraserItem);
    }
    
    initMoveToolbar() {
        const eraserItems = document.getElementById('eraser-items');
        if (!eraserItems) return;
        
        const moveItem = this.createToolbarItem('move', 'move', null, 'move');
        moveItem.addEventListener('click', () => this.selectTool('move', { type: 'move' }));
        eraserItems.appendChild(moveItem);
    }
    
    initRotateToolbar() {
        const eraserItems = document.getElementById('eraser-items');
        if (!eraserItems) return;
        
        const rotateItem = this.createToolbarItem('rotate', 'rotate', null, 'rotate');
        rotateItem.addEventListener('click', () => this.selectTool('rotate', { type: 'rotate' }));
        eraserItems.appendChild(rotateItem);
    }
    
    initCopyToolbar() {
        const eraserItems = document.getElementById('eraser-items');
        if (!eraserItems) return;
        
        const copyItem = this.createToolbarItem('copy', 'copy', null, 'copy');
        copyItem.addEventListener('click', () => this.selectTool('copy', { type: 'copy' }));
        eraserItems.appendChild(copyItem);
    }
    
    initResizeToolbar() {
        const eraserItems = document.getElementById('eraser-items');
        if (!eraserItems) return;
        
        const resizeItem = this.createToolbarItem('resize', 'resize', null, 'resize');
        resizeItem.addEventListener('click', () => this.selectTool('resize', { type: 'resize' }));
        eraserItems.appendChild(resizeItem);
    }
    
    createToolbarItem(id, label, data, shape) {
        const item = document.createElement('div');
        item.className = 'toolbar-item';
        item.dataset.toolId = id;
        item.dataset.toolLabel = label;
        
        const preview = document.createElement('div');
        preview.className = 'toolbar-item-preview';
        
        // Create simple visual representation with size variations
        if (shape === 'circle') {
            preview.style.borderRadius = '50%';
            preview.style.background = 'rgba(100, 150, 255, 0.5)';
            
            // Size varies based on label: small = 40%, base = 70%, large = 90%
            if (label === 'small') {
                preview.style.width = '40%';
                preview.style.height = '40%';
            } else if (label === 'base') {
                preview.style.width = '70%';
                preview.style.height = '70%';
            } else if (label === 'large') {
                preview.style.width = '90%';
                preview.style.height = '90%';
            } else {
                // Default for shapes without size
                preview.style.width = '80%';
                preview.style.height = '80%';
            }
        } else if (shape === 'rectangle') {
            preview.style.background = 'rgba(100, 150, 255, 0.5)';
            // Size varies: small = 35%x25%, base = 60%x40%, large = 85%x55%
            if (label === 'small') {
                preview.style.width = '35%';
                preview.style.height = '25%';
            } else if (label === 'base') {
                preview.style.width = '60%';
                preview.style.height = '40%';
            } else if (label === 'large') {
                preview.style.width = '85%';
                preview.style.height = '55%';
            } else {
                preview.style.width = '70%';
                preview.style.height = '50%';
            }
        } else if (shape === 'dome') {
            preview.style.background = 'rgba(100, 150, 255, 0.5)';
            preview.style.borderRadius = '50% 50% 0 0';
            // Size varies: small = 35%x20%, base = 60%x35%, large = 85%x50%
            if (label === 'small') {
                preview.style.width = '35%';
                preview.style.height = '20%';
            } else if (label === 'base') {
                preview.style.width = '60%';
                preview.style.height = '35%';
            } else if (label === 'large') {
                preview.style.width = '85%';
                preview.style.height = '50%';
            } else {
                preview.style.width = '70%';
                preview.style.height = '40%';
            }
        } else if (shape === 'line') {
            preview.style.background = 'rgba(100, 150, 255, 0.5)';
            preview.style.width = '90%';
            preview.style.height = '20%';
        } else if (shape === 'point') {
            // Rectangular spacer (no border radius)
            preview.style.background = 'rgba(255, 255, 100, 0.5)';
            preview.style.width = '60%';
            preview.style.height = '40%';
        } else if (shape === 'eraser') {
            // Eraser icon - red X or eraser symbol
            preview.style.background = 'rgba(255, 100, 100, 0.5)';
            preview.style.width = '70%';
            preview.style.height = '70%';
            preview.style.position = 'relative';
            preview.innerHTML = '×';
            preview.style.fontSize = '40px';
            preview.style.color = '#ff6464';
            preview.style.fontWeight = 'bold';
            preview.style.display = 'flex';
            preview.style.alignItems = 'center';
            preview.style.justifyContent = 'center';
        } else if (shape === 'move') {
            // Move tool icon - arrow cross
            preview.style.background = 'rgba(100, 255, 100, 0.5)';
            preview.style.width = '70%';
            preview.style.height = '70%';
            preview.style.position = 'relative';
            preview.innerHTML = '↔';
            preview.style.fontSize = '30px';
            preview.style.color = '#64ff64';
            preview.style.fontWeight = 'bold';
            preview.style.display = 'flex';
            preview.style.alignItems = 'center';
            preview.style.justifyContent = 'center';
        } else if (shape === 'rotate') {
            // Rotate tool icon - circular arrow
            preview.style.background = 'rgba(255, 200, 100, 0.5)';
            preview.style.width = '70%';
            preview.style.height = '70%';
            preview.style.position = 'relative';
            preview.innerHTML = '↻';
            preview.style.fontSize = '30px';
            preview.style.color = '#ffc864';
            preview.style.fontWeight = 'bold';
            preview.style.display = 'flex';
            preview.style.alignItems = 'center';
            preview.style.justifyContent = 'center';
        } else if (shape === 'copy') {
            // Copy tool icon - duplicate symbol
            preview.style.background = 'rgba(150, 150, 255, 0.5)';
            preview.style.width = '70%';
            preview.style.height = '70%';
            preview.style.position = 'relative';
            preview.innerHTML = '⧉';
            preview.style.fontSize = '30px';
            preview.style.color = '#9696ff';
            preview.style.fontWeight = 'bold';
            preview.style.display = 'flex';
            preview.style.alignItems = 'center';
            preview.style.justifyContent = 'center';
        } else if (shape === 'resize') {
            // Resize tool icon - resize symbol
            preview.style.background = 'rgba(255, 150, 100, 0.5)';
            preview.style.width = '70%';
            preview.style.height = '70%';
            preview.style.position = 'relative';
            preview.innerHTML = '↔';
            preview.style.fontSize = '30px';
            preview.style.color = '#ff9664';
            preview.style.fontWeight = 'bold';
            preview.style.display = 'flex';
            preview.style.alignItems = 'center';
            preview.style.justifyContent = 'center';
        }
        
        item.appendChild(preview);
        return item;
    }
    
    selectTool(category, toolData) {
        // Hide all spacer handles when switching away from resize tool
        if (category !== 'resize') {
            if (this.spacers) {
                this.spacers.forEach(spacer => {
                    if (spacer && spacer.removeHandles) {
                        spacer.removeHandles();
                    }
                });
            }
            this.selectedSpacer = null;
        }
        
        // Clear selection indicators when switching away from move/rotate tools
        if (category !== 'move' && category !== 'rotate') {
            this.updateSelectionIndicator(null);
            this.selectedPeg = null;
        }
        
        this.selectedTool = { category, ...toolData };
        
        // Update UI - remove previous selection
        document.querySelectorAll('.toolbar-item').forEach(item => {
            item.classList.remove('selected');
        });
        
        // Highlight selected tool
        const selectedItems = document.querySelectorAll(`[data-tool-id*="${toolData.type || category}"]`);
        selectedItems.forEach(item => {
            if (item.dataset.toolLabel === (toolData.size || toolData.type || category)) {
                item.classList.add('selected');
            }
        });
        
        // Update selected object preview in footer
        this.updateSelectedPreview(category, toolData);
        
        // Create preview mesh for new tool (always create if editor is active)
        if (this.previewMesh) {
            this.game.scene.remove(this.previewMesh);
            if (this.previewMesh.geometry) this.previewMesh.geometry.dispose();
            if (this.previewMesh.material) this.previewMesh.material.dispose();
            this.previewMesh = null;
        }
        
        // Create preview mesh if editor is active (even if modal is open, it will be used when modal closes)
        if (this.isActive && !this.testingMode && this.game && this.game.scene) {
            this.createPreviewMesh();
        }
    }
    
    updateSelectedPreview(category, toolData) {
        let previewText = 'None';
        let previewClass = '';
        
        if (category === 'peg') {
            const sizeName = toolData.size || 'base';
            const typeName = toolData.type || 'round';
            previewText = `${typeName.charAt(0).toUpperCase() + typeName.slice(1)} Peg (${sizeName})`;
            previewClass = typeName === 'rect' ? 'rect' : (typeName === 'dome' ? 'dome' : '');
        } else if (category === 'shape') {
            const shapeType = toolData.type || 'Unknown';
            previewText = `${shapeType.charAt(0).toUpperCase() + shapeType.slice(1)} Shape`;
            previewClass = shapeType === 'line' ? 'line' : '';
        } else if (category === 'static') {
            const staticType = toolData.type || 'Unknown';
            previewText = `${staticType.charAt(0).toUpperCase() + staticType.slice(1)} Static`;
            previewClass = staticType === 'rect' ? 'rect' : '';
        } else if (category === 'spacer') {
            previewText = 'Spacer';
            previewClass = 'rect';
        } else if (category === 'move') {
            previewText = 'Move Tool';
            previewClass = '';
        } else if (category === 'rotate') {
            previewText = 'Rotate Tool (Arrow Keys)';
            previewClass = '';
        } else if (category === 'copy') {
            previewText = 'Copy Tool (Click object to copy)';
            previewClass = '';
        } else if (category === 'resize') {
            previewText = 'Resize Tool (Click spacer to resize)';
            previewClass = '';
        }
        
        const previewElement = document.getElementById('level-editor-selected-preview');
        if (previewElement) {
            previewElement.textContent = `Selected: ${previewText}`;
        }
        
        const shapePreviewElement = document.getElementById('level-editor-shape-preview');
        if (shapePreviewElement) {
            shapePreviewElement.className = previewClass;
        }
    }
    
    
    toggleTestMode() {
        if (this.testingMode) {
            // Continue editing - reset to placed pegs
            this.continueEditing();
        } else {
            // Test now - save current pegs and enable shooting
            this.startTesting();
        }
    }
    
    startTesting() {
        this.testingMode = true;
        
        // Store current pegs data for restoration (positions, colors, type, size, rotation, etc.)
        // Store as serializable data, not references
        this.originalPegs = this.game.pegs.map(peg => {
            const position = peg.body.position;
            const rotation = peg.mesh.rotation.z || 0; // Z rotation
            return {
                x: position.x,
                y: position.y,
                z: position.z,
                color: peg.color || 0x4a90e2,
                type: peg.type || 'round', // Preserve peg type
                size: peg.size || 'base',  // Preserve peg size
                rotation: rotation          // Preserve rotation
            };
        });
        
        // Close modals but keep editor active state (we're still editing, just testing)
        if (this.fileOperationsOverlay) {
            this.fileOperationsOverlay.classList.remove('active');
        }
        if (this.objectsOverlay) {
            this.objectsOverlay.classList.remove('active');
        }
        
        this.updateTestButton();
    }
    
    continueEditing() {
        this.testingMode = false;
        
        // Clear all current pegs (from test state)
        if (this.game && this.game.pegs) {
            this.game.pegs.forEach(peg => {
                if (peg.remove) {
                    peg.remove();
                }
            });
            this.game.pegs = [];
        }
        
        // Clear balls if any are active
        if (this.game && this.game.balls) {
            this.game.balls.forEach(ball => ball.remove());
            this.game.balls = [];
        }
        
        // Restore pegs from before testing (reset to original placed pegs)
        if (this.originalPegs && this.originalPegs.length > 0 && this.game.physicsWorld) {
            const pegMaterial = this.game.physicsWorld.getPegMaterial();
            
            // Import Peg class to recreate pegs
            import('../entities/Peg.js').then(({ Peg }) => {
                this.originalPegs.forEach(pegData => {
                    // Restore peg with preserved type and size
                    const peg = new Peg(
                        this.game.scene,
                        this.game.physicsWorld,
                        { x: pegData.x, y: pegData.y, z: pegData.z || 0 },
                        pegData.color,
                        pegMaterial,
                        pegData.type || 'round',  // Restore peg type
                        pegData.size || 'base'    // Restore peg size
                    );
                    
                    // Restore rotation if it was saved
                    if (pegData.rotation !== undefined) {
                        peg.mesh.rotation.z = pegData.rotation;
                        // Also update physics body rotation
                        const euler = new THREE.Euler(0, 0, pegData.rotation);
                        const quaternion = new THREE.Quaternion().setFromEuler(euler);
                        peg.body.quaternion.set(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
                    }
                    
                    peg.pointValue = 300;
                    peg.isOrange = false;
                    peg.isGreen = false;
                    peg.isPurple = false;
                    
                    this.game.pegs.push(peg);
                });
            });
        }
        
        // Reopen objects modal if needed
        if (this.objectsOverlay && this.levelLoaded) {
            this.objectsOverlay.classList.add('active');
        }
        
        this.updateTestButton();
    }
    
    updateTestButton() {
        if (this.editorTest) {
            if (this.testingMode) {
                this.editorTest.textContent = 'Continue Editing';
            } else {
                this.editorTest.textContent = 'Test Now';
            }
        }
    }
    
    async newLevel() {
        // Prompt for level name
        const levelName = prompt('Enter level name:');
        if (levelName === null) {
            // User cancelled
            return;
        }
        
        // Store level name
        this.currentLevelName = levelName || 'Untitled Level';
        
        // Set levelLoaded flag BEFORE initializing game to prevent level1.json from loading
        this.levelLoaded = true;
        
        // Ensure game is initialized (scene and physicsWorld must exist)
        if (this.game && (!this.game.scene || !this.game.physicsWorld)) {
            if (this.game.init && typeof this.game.init === 'function') {
                await this.game.init();
            }
        }
        
        // Clear all placed objects
        this.placedObjects = [];
        this.undoStack = [];
        this.redoStack = [];
        
        // Clear all pegs from the game scene (after init to ensure they're removed)
        if (this.game && this.game.pegs) {
            // Remove all pegs from scene and physics world
            this.game.pegs.forEach(peg => {
                if (peg.remove) {
                    peg.remove();
                }
            });
            this.game.pegs = [];
        }
        
        // Clear selected tool
        this.selectedTool = null;
        document.querySelectorAll('.toolbar-item').forEach(item => {
            item.classList.remove('selected');
        });
        
        // Mark level as loaded and switch button
        this.levelLoaded = true;
        this.switchToObjectsButton();
        
        // Close file operations modal
        this.closeFileOperations();
        
        console.log('New blank level created:', this.currentLevelName);
    }
    
    switchToObjectsButton() {
        // Hide Level Editor button, show Objects button
        if (this.editorButton) {
            this.editorButton.style.display = 'none';
        }
        if (this.objectsButton) {
            this.objectsButton.style.display = 'block';
        }
    }
    
    switchToEditorButton() {
        // Show Level Editor button, hide Objects button
        if (this.editorButton) {
            this.editorButton.style.display = 'block';
        }
        if (this.objectsButton) {
            this.objectsButton.style.display = 'none';
        }
        this.levelLoaded = false;
    }
    
    async loadLevelFromFile(file) {
        if (!file) return;
        
        try {
            const text = await file.text();
            const levelData = JSON.parse(text);
            // TODO: Load level data and place objects
            console.log('Level loaded:', levelData);
        } catch (error) {
            console.error('Error loading level:', error);
        }
    }
    
    saveLevel() {
        if (!this.currentLevelName) {
            alert('Please create or load a level first.');
            return;
        }
        
        // Build level data with type and size information
        const levelData = {
            name: this.currentLevelName,
            pegs: this.placedObjects.filter(obj => obj.category === 'peg').map(obj => ({
                x: obj.position.x,
                y: obj.position.y,
                z: obj.position.z || 0,
                color: obj.color || '#4a90e2',
                type: obj.type || 'round',
                size: obj.size || 'base'
            }))
        };
        
        // Convert to JSON and create download
        const jsonString = JSON.stringify(levelData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `${this.currentLevelName.replace(/\s+/g, '_')}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        console.log('Level saved:', levelData);
    }
}

