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
        
        // Center snap indicator (vertical line)
        this.centerSnapIndicator = null; // Vertical line shown when near center
        
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
        this.shapeForSettings = null; // Shape currently being edited in settings
        this.characteristicForSettings = null; // Characteristic currently being edited in settings
        
        // Characteristic management
        this.characteristics = []; // Array of characteristic objects
        this.selectedCharacteristic = null; // Currently selected characteristic
        
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
        
        // Handle resizing spacer, shape, or characteristic by dragging handle
        const objectToResize = this.selectedSpacer || this.selectedShape || this.selectedCharacteristic;
        if (this.isResizingSpacer && objectToResize && this.selectedHandle) {
            if (objectToResize.updateSize) {
                // It's a spacer, shape, or characteristic - use resizeSpacerByHandle (works for all)
                this.resizeSpacerByHandle(worldX, worldY);
            }
            return; // Don't update preview while resizing
        }
        
        // Handle dragging for move tool
        if (this.isDragging && this.movingPeg) {
            const newX = worldX - this.dragOffset.x;
            const newY = worldY - this.dragOffset.y;
            
            // Check for center snap (within 0.03 of x=0)
            const centerSnapThreshold = 0.03;
            const isNearCenter = Math.abs(newX) < centerSnapThreshold;
            
            // Show/hide center snap indicator
            if (isNearCenter) {
                this.showCenterSnapIndicator();
            } else {
                this.hideCenterSnapIndicator();
            }
            
            // Check if it's a spacer, shape, characteristic, or peg
            if (this.movingPeg.position !== undefined && this.movingPeg.containsPoint) {
                // It's a spacer, shape, or characteristic
                if (this.movingPeg.updateSize && this.movingPeg.containedPegs !== undefined) {
                    // It's a shape
                    this.moveShape(this.movingPeg, newX, newY);
                } else if (this.movingPeg.updateSize && this.movingPeg.body) {
                    // It's a characteristic (has updateSize, body, but no containedPegs)
                    this.moveCharacteristic(this.movingPeg, newX, newY);
                    // Update indicator position
                    if (this.selectionIndicator && this.movingPeg.mesh) {
                        this.selectionIndicator.position.copy(this.movingPeg.mesh.position);
                        this.selectionIndicator.position.z = this.movingPeg.mesh.position.z + 0.01;
                    }
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
        const shapeSettingsOverlay = document.getElementById('shape-settings-overlay');
        const characteristicSettingsOverlay = document.getElementById('characteristic-settings-overlay');
        if ((objectsModal && objectsModal.contains(event.target)) || 
            (fileOperationsModal && fileOperationsModal.contains(event.target)) ||
            (shapeSettingsOverlay && shapeSettingsOverlay.contains(event.target)) ||
            (characteristicSettingsOverlay && characteristicSettingsOverlay.contains(event.target))) {
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
            // Only proceed if we have a copy source and the click is not on a modal
            if (this.copySource) {
                // Double-check modal click - prevent paste when clicking on modals
                // The check at the top should catch this, but extra safety here
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
        } else if (this.selectedTool && this.selectedTool.category === 'settings') {
            // Settings tool - open settings for shape or characteristic
            const shape = this.findShapeAtPosition(this.mouseWorldPos.x, this.mouseWorldPos.y);
            if (shape) {
                this.openShapeSettings(shape);
            } else {
                const characteristic = this.findCharacteristicAtPosition(this.mouseWorldPos.x, this.mouseWorldPos.y);
                if (characteristic) {
                    this.openCharacteristicSettings(characteristic);
                }
            }
        } else if (this.selectedTool && this.selectedTool.category === 'resize') {
            // Resize tool - handled in mousedown
            // Click is just for selection if not resizing
        } else {
            // Place object at current mouse position
            this.placeObject(this.mouseWorldPos.x, this.mouseWorldPos.y);
        }
    }
    
    handleMouseDown(event) {
        // Handle for move tool or resize tool only
        if (!this.isActive || this.testingMode || !this.selectedTool) {
            return;
        }
        
        // Only handle move and resize tools here - other tools use click handler
        if (this.selectedTool.category !== 'move' && this.selectedTool.category !== 'resize') {
            return;
        }
        
        // Don't handle if clicking inside modals
        const objectsModal = document.getElementById('objects-modal');
        const fileOperationsModal = document.getElementById('file-operations-modal');
        const shapeSettingsOverlay = document.getElementById('shape-settings-overlay');
        const characteristicSettingsOverlay = document.getElementById('characteristic-settings-overlay');
        if ((objectsModal && objectsModal.contains(event.target)) || 
            (fileOperationsModal && fileOperationsModal.contains(event.target)) ||
            (shapeSettingsOverlay && shapeSettingsOverlay.contains(event.target)) ||
            (characteristicSettingsOverlay && characteristicSettingsOverlay.contains(event.target))) {
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
                        } else {
                            // Try characteristic
                            const characteristic = this.findCharacteristicAtPosition(this.mouseWorldPos.x, this.mouseWorldPos.y);
                            if (characteristic) {
                                this.movingPeg = characteristic;
                                this.isDragging = true;
                                this.dragOffset = {
                                    x: this.mouseWorldPos.x - characteristic.position.x,
                                    y: this.mouseWorldPos.y - characteristic.position.y
                                };
                                this.selectedCharacteristic = characteristic;
                                this.updateSelectionIndicator(characteristic);
                                event.stopPropagation();
                                event.preventDefault();
                            }
                        }
                    }
                }
            } else if (this.selectedTool.category === 'resize') {
            // Resize tool - check if clicking on a handle first (spacer, shape, or characteristic)
            const objectToResize = this.selectedSpacer || this.selectedShape || this.selectedCharacteristic;
            if (objectToResize && objectToResize.handles && objectToResize.handles.length > 0) {
                const handle = this.findHandleAtPosition(objectToResize, this.mouseWorldPos.x, this.mouseWorldPos.y);
                if (handle) {
                    // Start resizing by dragging this handle
                    this.selectedHandle = handle;
                    this.isResizingSpacer = true;
                    this.resizeStartPos = { x: this.mouseWorldPos.x, y: this.mouseWorldPos.y };
                    // Store start size - handle circles differently (they use radius)
                    if (objectToResize.shape === 'circle') {
                        this.resizeStartSize = { radius: objectToResize.size.radius || (objectToResize.size.width ? objectToResize.size.width / 2 : 0.5) };
                    } else {
                        this.resizeStartSize = { width: objectToResize.size.width, height: objectToResize.size.height };
                    }
                    event.stopPropagation();
                    event.preventDefault();
                    return;
                }
            }
            
            // Otherwise, find spacer or shape at mouse position
            const spacer = this.findSpacerAtPosition(this.mouseWorldPos.x, this.mouseWorldPos.y);
            if (spacer) {
                // Check if clicking on an existing handle first
                if (spacer.handles && spacer.handles.length > 0) {
                    const handle = this.findHandleAtPosition(spacer, this.mouseWorldPos.x, this.mouseWorldPos.y);
                    if (handle) {
                        // Start resizing by dragging this handle
                        this.selectedHandle = handle;
                        this.isResizingSpacer = true;
                        this.resizeStartPos = { x: this.mouseWorldPos.x, y: this.mouseWorldPos.y };
                        this.resizeStartSize = { width: spacer.size.width, height: spacer.size.height };
                        this.selectedSpacer = spacer;
                        event.stopPropagation();
                        event.preventDefault();
                        return;
                    }
                }
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
                    // Check if clicking on an existing handle first
                    if (shape.handles && shape.handles.length > 0) {
                        const handle = this.findHandleAtPosition(shape, this.mouseWorldPos.x, this.mouseWorldPos.y);
                        if (handle) {
                            // Start resizing by dragging this handle
                            this.selectedHandle = handle;
                            this.isResizingSpacer = true;
                            this.resizeStartPos = { x: this.mouseWorldPos.x, y: this.mouseWorldPos.y };
                            this.resizeStartSize = { width: shape.size.width, height: shape.size.height };
                            this.selectedShape = shape;
                            event.stopPropagation();
                            event.preventDefault();
                            return;
                        }
                    }
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
                } else {
                    const characteristic = this.findCharacteristicAtPosition(this.mouseWorldPos.x, this.mouseWorldPos.y);
                    if (characteristic) {
                        // Check if clicking on an existing handle first
                        if (characteristic.handles && characteristic.handles.length > 0) {
                            const handle = this.findHandleAtPosition(characteristic, this.mouseWorldPos.x, this.mouseWorldPos.y);
                            if (handle) {
                                // Start resizing by dragging this handle
                                this.selectedHandle = handle;
                                this.isResizingSpacer = true;
                                this.resizeStartPos = { x: this.mouseWorldPos.x, y: this.mouseWorldPos.y };
                                // Store start size - handle circles differently (they use radius)
                                if (characteristic.shape === 'circle') {
                                    this.resizeStartSize = { radius: characteristic.size.radius || (characteristic.size.width ? characteristic.size.width / 2 : 0.5) };
                                } else {
                                    this.resizeStartSize = { width: characteristic.size.width, height: characteristic.size.height };
                                }
                                this.selectedCharacteristic = characteristic;
                                event.stopPropagation();
                                event.preventDefault();
                                return;
                            }
                        }
                        // Hide handles on previously selected objects
                        if (this.selectedCharacteristic && this.selectedCharacteristic !== characteristic) {
                            this.selectedCharacteristic.removeHandles();
                        }
                        if (this.selectedSpacer) {
                            this.selectedSpacer.removeHandles();
                            this.selectedSpacer = null;
                        }
                        if (this.selectedShape) {
                            this.selectedShape.removeHandles();
                            this.selectedShape = null;
                        }
                        this.selectedCharacteristic = characteristic;
                        characteristic.createHandles(); // Show handles for selected characteristic
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
            const centerSnapThreshold = 0.03;
            
            // Get final X position before resetting
            let finalX = null;
            if (wasMoving) {
                if (wasMoving.position !== undefined) {
                    finalX = wasMoving.position.x;
                } else if (wasMoving.body) {
                    finalX = wasMoving.body.position.x;
                }
            }
            
            const shouldSnapToCenter = finalX !== null && Math.abs(finalX) < centerSnapThreshold;
            
            this.isDragging = false;
            this.movingPeg = null;
            this.dragOffset = { x: 0, y: 0 };
            
            // Hide center snap indicator
            this.hideCenterSnapIndicator();
            
            // Check if it's a spacer by checking if it's in the spacers array
            const isSpacer = wasMoving && this.spacers && this.spacers.includes(wasMoving);
            const isShape = wasMoving && this.shapes && this.shapes.includes(wasMoving);
            
            console.log('[MOVE END] Object being moved:', {
                wasMoving: !!wasMoving,
                isSpacer,
                isShape,
                finalX,
                shouldSnapToCenter
            });
            
            // Snap to center if near center
            if (shouldSnapToCenter && wasMoving) {
                console.log('[MOVE END] Snapping to center');
                if (isSpacer) {
                    // Spacer
                    const oldY = wasMoving.position.y;
                    wasMoving.moveTo({ x: 0, y: oldY, z: 0 });
                    const placedObj = this.placedObjects.find(obj => {
                        if (obj.category === 'spacer' && obj.position && wasMoving.position) {
                            const objX = obj.position.x;
                            const objY = obj.position.y;
                            const spacerX = wasMoving.position.x;
                            const spacerY = wasMoving.position.y;
                            const distance = Math.sqrt(
                                Math.pow(objX - spacerX, 2) + 
                                Math.pow(objY - spacerY, 2)
                            );
                            return distance < 0.05;
                        }
                        return false;
                    });
                    if (placedObj) {
                        placedObj.position.x = 0;
                    }
                } else if (isShape) {
                    // Shape
                    const oldY = wasMoving.position.y;
                    wasMoving.moveTo({ x: 0, y: oldY, z: 0 });
                    const placedObj = this.placedObjects.find(obj => {
                        if (obj.category === 'shape' && obj.position && wasMoving.position) {
                            const objX = obj.position.x;
                            const objY = obj.position.y;
                            const shapeX = wasMoving.position.x;
                            const shapeY = wasMoving.position.y;
                            const distance = Math.sqrt(
                                Math.pow(objX - shapeX, 2) + 
                                Math.pow(objY - shapeY, 2)
                            );
                            return distance < 0.05;
                        }
                        return false;
                    });
                    if (placedObj) {
                        placedObj.position.x = 0;
                    }
                } else if (wasMoving.body && wasMoving.mesh) {
                    // Peg
                    wasMoving.body.position.x = 0;
                    wasMoving.mesh.position.x = 0;
                    const placedObj = this.placedObjects.find(obj => {
                        if (obj.category === 'peg' && obj.position && wasMoving.body) {
                            const objX = obj.position.x;
                            const objY = obj.position.y;
                            const pegX = wasMoving.body.position.x;
                            const pegY = wasMoving.body.position.y;
                            const distance = Math.sqrt(
                                Math.pow(objX - pegX, 2) + 
                                Math.pow(objY - pegY, 2)
                            );
                            return distance < 0.05;
                        }
                        return false;
                    });
                    if (placedObj) {
                        placedObj.position.x = 0;
                    }
                }
            }
            
            // If moving a spacer, snap it to inside edge if it crosses level border
            if (isSpacer) {
                console.log('[MOVE END] Calling snapSpacerToBounds');
                this.snapSpacerToBounds(wasMoving);
            } else {
                console.log('[MOVE END] Not calling snapSpacerToBounds - not a spacer');
            }
            
            // Clear selection indicator when moving stops
            this.updateSelectionIndicator(null);
        }
    }
    
    handleKeyDown(event) {
        // Only handle for rotate tool
        if (!this.isActive || this.testingMode || !this.selectedTool || this.selectedTool.category !== 'rotate') {
            return;
        }
        
        // Check if we have a peg, shape, or characteristic selected
        const objectToRotate = this.selectedPeg || this.selectedShape || this.selectedCharacteristic;
        if (!objectToRotate) return;
        
        if (event.key === 'ArrowLeft') {
            // Rotate clockwise (flipped direction)
            if (this.selectedPeg) {
                this.rotatePeg(this.selectedPeg, 5);
                this.startRotateKeyRepeat(() => this.rotatePeg(this.selectedPeg, 5));
            } else if (this.selectedShape) {
                this.rotateShape(this.selectedShape, 5);
                this.startRotateKeyRepeat(() => this.rotateShape(this.selectedShape, 5));
            } else if (this.selectedCharacteristic) {
                this.rotateCharacteristic(this.selectedCharacteristic, 5);
                this.startRotateKeyRepeat(() => this.rotateCharacteristic(this.selectedCharacteristic, 5));
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
            } else if (this.selectedCharacteristic) {
                this.rotateCharacteristic(this.selectedCharacteristic, -5);
                this.startRotateKeyRepeat(() => this.rotateCharacteristic(this.selectedCharacteristic, -5));
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
    
    /**
     * Show center snap indicator (vertical line at x=0)
     */
    showCenterSnapIndicator() {
        if (this.centerSnapIndicator) {
            this.centerSnapIndicator.visible = true;
            return;
        }
        
        // Create vertical line at x=0 from bottom to top of level
        const points = [
            new THREE.Vector3(0, -4.5, 0.01), // Bottom of level
            new THREE.Vector3(0, 4.5, 0.01)   // Top of level
        ];
        
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({
            color: 0x00ff00, // Green
            linewidth: 2,
            transparent: true,
            opacity: 0.5
        });
        
        this.centerSnapIndicator = new THREE.Line(geometry, material);
        this.game.scene.add(this.centerSnapIndicator);
    }
    
    /**
     * Hide center snap indicator
     */
    hideCenterSnapIndicator() {
        if (this.centerSnapIndicator) {
            this.centerSnapIndicator.visible = false;
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
            // Shape preview - rectangle for line shape, circle for circle shape
            if (tool.type === 'circle') {
                // Circle shape preview
                const circleSizeMultiplier = 3; // Circle shapes are 3x the peg size
                let circleRadius = 1; // Default radius
                
                if (tool.size) {
                    const pegSize = this.pegSizes[tool.size];
                    if (typeof pegSize === 'number' && !isNaN(pegSize) && pegSize > 0) {
                        circleRadius = pegSize * circleSizeMultiplier;
                    }
                }
                
                geometry = new THREE.CircleGeometry(circleRadius, 32);
            } else {
                // Line shape preview - rectangle
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
            }
        } else if (tool.category === 'static') {
            // Characteristic preview
            if (tool.type === 'round') {
                // Default circle size (smallest) = 0.5
                // Each subsequent size is 50% bigger
                const defaultCircleRadius = 0.5;
                const circleSizes = {
                    small: defaultCircleRadius,              // 0.5 (default)
                    base: defaultCircleRadius * 1.5,         // 0.75 (50% bigger)
                    large: defaultCircleRadius * 1.5 * 1.5   // 1.125 (50% bigger than base)
                };
                
                const sizeName = tool.size || 'small';
                const radius = circleSizes[sizeName] || circleSizes.small;
                geometry = new THREE.CircleGeometry(radius, 32);
            } else {
                // Rectangular
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
            }
        } else {
            // For other categories, create a simple circle preview for now
            geometry = new THREE.CircleGeometry(0.1, 16);
        }
        
        // Use different colors for different tool types
        let previewColor = 0xffffff;
        let previewOpacity = 0.5;
        if (tool.category === 'static') {
            previewColor = 0x808080; // Grey
            previewOpacity = 0.5;
        } else if (tool.category === 'spacer') {
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
            // Place characteristic
            this.placeCharacteristic(worldX, worldY, tool);
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
        
        // Then check characteristics (they have boundaries, not just point distance)
        if (this.characteristics && this.characteristics.length > 0) {
            const characteristic = this.findCharacteristicAtPosition(worldX, worldY);
            if (characteristic) {
                // If characteristic is inside a shape, remove it from the shape first
                if (characteristic.parentShape) {
                    characteristic.parentShape.removeCharacteristic(characteristic);
                }
                
                // Remove characteristic
                characteristic.remove();
                const characteristicIndex = this.characteristics.indexOf(characteristic);
                if (characteristicIndex !== -1) {
                    this.characteristics.splice(characteristicIndex, 1);
                }
                
                // Remove from placed objects
                this.placedObjects = this.placedObjects.filter(obj => {
                    if (obj.category === 'characteristic' && obj.position) {
                        const objX = obj.position.x;
                        const objY = obj.position.y;
                        const charX = characteristic.position.x;
                        const charY = characteristic.position.y;
                        const distance = Math.sqrt(
                            Math.pow(objX - charX, 2) + 
                            Math.pow(objY - charY, 2)
                        );
                        return distance >= 0.05; // Keep if not matching
                    }
                    return true;
                });
                
                // Clear selection if this characteristic was selected
                if (this.selectedCharacteristic === characteristic) {
                    this.selectedCharacteristic = null;
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
        
        const oldX = peg.body.position.x;
        const oldY = peg.body.position.y;
        
        // Check if peg is already inside a shape
        const currentShape = peg.parentShape;
        
        // Constrain movement to spacer edges
        const constrainedPos = this.constrainPegToSpacerEdges(newX, newY, peg, oldX, oldY);
        const roundedX = this.roundToDecimals(constrainedPos.x);
        const roundedY = this.roundToDecimals(constrainedPos.y);
        
        // Check if new position is inside a shape
        const containingShape = this.findShapeAtPosition(roundedX, roundedY);
        
        // If peg is already inside a shape, check if it's still inside after movement
        if (currentShape) {
            if (containingShape === currentShape) {
                // Still inside the same shape - find insertion index and reinsert
                const insertionIndex = currentShape.findInsertionIndex(roundedX, roundedY);
                // Remove from current position
                const currentIndex = currentShape.containedPegs.indexOf(peg);
                if (currentIndex !== -1) {
                    currentShape.containedPegs.splice(currentIndex, 1);
                }
                // Reinsert at new position
                currentShape.addPeg(peg, insertionIndex);
                return; // addPeg will call rearrangePegs which will position the peg
            } else {
                // Moved outside or to different shape - remove from current shape
                currentShape.removePeg(peg);
            }
        }
        
        // Check if new position is inside a shape (and not already in it)
        if (containingShape && containingShape !== currentShape && containingShape.canTakeObjects !== false) {
            // Moved into a shape - find insertion index and add to it (only if shape can take objects)
            const insertionIndex = containingShape.findInsertionIndex(roundedX, roundedY);
            containingShape.addPeg(peg, insertionIndex);
            return; // addPeg will call rearrangePegs which will position the peg
        }
        
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
        // Work with pegs, shapes, or characteristics
        const peg = this.findPegAtPosition(worldX, worldY);
        if (peg) {
            this.selectedPeg = peg;
            this.selectedShape = null; // Clear shape selection
            this.selectedCharacteristic = null; // Clear characteristic selection
            this.updateSelectionIndicator(peg);
        } else {
            // Try shape
            const shape = this.findShapeAtPosition(worldX, worldY);
            if (shape) {
                this.selectedShape = shape;
                this.selectedPeg = null; // Clear peg selection
                this.selectedCharacteristic = null; // Clear characteristic selection
                this.updateSelectionIndicator(shape);
            } else {
                // Try characteristic
                const characteristic = this.findCharacteristicAtPosition(worldX, worldY);
                if (characteristic) {
                    this.selectedCharacteristic = characteristic;
                    this.selectedPeg = null; // Clear peg selection
                    this.selectedShape = null; // Clear shape selection
                    this.updateSelectionIndicator(characteristic);
                } else {
                    // Clear selection if clicking empty space
                    this.selectedPeg = null;
                    this.selectedShape = null;
                    this.selectedCharacteristic = null;
                    this.updateSelectionIndicator(null);
                }
            }
        }
        console.log('Selected for rotation:', peg ? 'Peg' : (this.selectedShape ? 'Shape' : (this.selectedCharacteristic ? 'Characteristic' : 'None')));
    }
    
    selectObjectForRotation(worldX, worldY) {
        // Alias for selectPegForRotation (now handles all objects)
        this.selectPegForRotation(worldX, worldY);
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
        // Works for spacers, shapes, and characteristics
        const objectToResize = this.selectedSpacer || this.selectedShape || this.selectedCharacteristic;
        if (!objectToResize || !this.selectedHandle) return;
        
        const deltaX = worldX - this.resizeStartPos.x;
        const deltaY = worldY - this.resizeStartPos.y;
        
        const handleIndex = this.selectedHandle.userData.handleIndex;
        const handleType = this.selectedHandle.userData.handleType;
        
        // Handle circular characteristics - maintain perfect circle (aspect ratio locked)
        // Cannon.js Sphere only supports perfect circles, not ellipses, so we must maintain circularity
        if (objectToResize.shape === 'circle') {
            // For circles, calculate distance from center to mouse to maintain perfect circularity
            // This automatically locks the aspect ratio (1:1) since we use distance, not separate width/height
            const centerX = objectToResize.position.x;
            const centerY = objectToResize.position.y;
            const distance = Math.sqrt(
                Math.pow(worldX - centerX, 2) + 
                Math.pow(worldY - centerY, 2)
            );
            const newRadius = Math.max(0.1, distance);
            
            objectToResize.updateSize({ radius: newRadius });
            
            // Update in placed objects
            const placedObj = this.placedObjects.find(obj => {
                if (obj.category === 'characteristic' && obj.position && objectToResize.position) {
                    const objX = obj.position.x;
                    const objY = obj.position.y;
                    const charX = objectToResize.position.x;
                    const charY = objectToResize.position.y;
                    const dist = Math.sqrt(
                        Math.pow(objX - charX, 2) + 
                        Math.pow(objY - charY, 2)
                    );
                    return dist < 0.05;
                }
                return false;
            });
            
            if (placedObj) {
                placedObj.size = { radius: newRadius };
            }
            return;
        }
        
        let newWidth = this.resizeStartSize.width;
        let newHeight = this.resizeStartSize.height;
        
        if (handleType === 'corner') {
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
        } else if (handleType === 'axis') {
            // Adjust size based on which axis handle is being dragged
            // 4: bottom, 5: right, 6: top, 7: left
            switch (handleIndex) {
                case 4: // Bottom - adjust height only
                    newHeight = this.resizeStartSize.height - deltaY * 2;
                    break;
                case 5: // Right - adjust width only
                    newWidth = this.resizeStartSize.width + deltaX * 2;
                    break;
                case 6: // Top - adjust height only
                    newHeight = this.resizeStartSize.height + deltaY * 2;
                    break;
                case 7: // Left - adjust width only
                    newWidth = this.resizeStartSize.width - deltaX * 2;
                    break;
            }
        }
        
        // If it's a circle shape, maintain aspect ratio (width == height)
        if (objectToResize === this.selectedShape && objectToResize.type === 'circle') {
            // Use the larger dimension to maintain circular shape
            const size = Math.max(newWidth, newHeight);
            newWidth = size;
            newHeight = size;
        }
        
        // Ensure minimum size
        newWidth = Math.max(0.2, newWidth);
        newHeight = Math.max(0.2, newHeight);
        
        // If it's a spacer, constrain size to level bounds
        if (objectToResize === this.selectedSpacer) {
            const levelBounds = {
                left: -6,
                right: 6,
                bottom: -4.5,
                top: 4.5
            };
            
            const spacerPos = objectToResize.position;
            let halfWidth = newWidth / 2;
            let halfHeight = newHeight / 2;
            
            // Constrain width to not exceed bounds
            if (spacerPos.x - halfWidth < levelBounds.left) {
                halfWidth = spacerPos.x - levelBounds.left;
                newWidth = halfWidth * 2;
            }
            if (spacerPos.x + halfWidth > levelBounds.right) {
                halfWidth = levelBounds.right - spacerPos.x;
                newWidth = halfWidth * 2;
            }
            
            // Constrain height to not exceed bounds
            if (spacerPos.y - halfHeight < levelBounds.bottom) {
                halfHeight = spacerPos.y - levelBounds.bottom;
                newHeight = halfHeight * 2;
            }
            if (spacerPos.y + halfHeight > levelBounds.top) {
                halfHeight = levelBounds.top - spacerPos.y;
                newHeight = halfHeight * 2;
            }
            
            // Ensure minimum size after constraints
            newWidth = Math.max(0.2, newWidth);
            newHeight = Math.max(0.2, newHeight);
        }
        
        const newSize = { width: newWidth, height: newHeight };
        objectToResize.updateSize(newSize);
        
        // Update in placed objects
        let category;
        if (objectToResize === this.selectedSpacer) {
            category = 'spacer';
        } else if (objectToResize === this.selectedCharacteristic) {
            category = 'characteristic';
        } else {
            category = 'shape';
        }
        
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
     * Unified constraint method for all objects (pegs, shapes, spacers)
     * Constrains movement to spacer edges - snap to edges when touching
     * Returns constrained position {x, y}
     * 
     * @param {number} newX - New X position
     * @param {number} newY - New Y position
     * @param {Object} object - The object being moved (peg, shape, or spacer)
     * @param {number} oldX - Old X position
     * @param {number} oldY - Old Y position
     * @param {Object} excludeSpacer - Optional spacer to exclude from checks (the one being moved)
     * @returns {Object} Constrained position {x, y}
     */
    constrainObjectToSpacers(newX, newY, object, oldX, oldY, excludeSpacer = null) {
        if (!this.spacers || this.spacers.length === 0) {
            return { x: newX, y: newY };
        }
        
        // Get object bounds based on type
        let newBounds, oldBounds, objectWidth, objectHeight;
        
        if (object.getBounds) {
            // It's a shape or spacer - use getBounds method
            // For shapes, getBounds accounts for rotation, but we need to calculate at new position
            // Temporarily update position to get bounds at new position
            const originalX = object.position.x;
            const originalY = object.position.y;
            
            // Temporarily set position to calculate bounds
            object.position.x = newX;
            object.position.y = newY;
            newBounds = object.getBounds();
            
            object.position.x = oldX;
            object.position.y = oldY;
            oldBounds = object.getBounds();
            
            // Restore original position
            object.position.x = originalX;
            object.position.y = originalY;
            
            objectWidth = newBounds.right - newBounds.left;
            objectHeight = newBounds.top - newBounds.bottom;
        } else {
            // It's a peg - use getPegBounds
            const pegType = object.type || 'round';
            const pegSize = object.size || 'base';
            newBounds = this.getPegBounds(newX, newY, pegType, pegSize);
            oldBounds = this.getPegBounds(oldX, oldY, pegType, pegSize);
            objectWidth = newBounds.right - newBounds.left;
            objectHeight = newBounds.top - newBounds.bottom;
        }
        
        let constrainedX = newX;
        let constrainedY = newY;
        
        // Calculate movement direction
        const deltaX = newX - oldX;
        const deltaY = newY - oldY;
        const absDeltaX = Math.abs(deltaX);
        const absDeltaY = Math.abs(deltaY);
        
        for (const spacer of this.spacers) {
            // Skip the spacer being moved (if it's a spacer)
            if (spacer === excludeSpacer || spacer === object) {
                continue;
            }
            
            const spacerBounds = spacer.getBounds();
            
            // Check if object would overlap spacer
            const wouldOverlap = newBounds.right > spacerBounds.left &&
                                 newBounds.left < spacerBounds.right &&
                                 newBounds.top > spacerBounds.bottom &&
                                 newBounds.bottom < spacerBounds.top;
            
            if (wouldOverlap) {
                if (absDeltaY > absDeltaX) {
                    // Moving primarily in Y direction
                    // Snap to top or bottom edge
                    if (deltaY < 0) {
                        // Moving up (toward spacer from below) - object bottom should touch spacer top
                        constrainedY = spacerBounds.top + objectHeight / 2;
                    } else {
                        // Moving down (toward spacer from above) - object top should touch spacer bottom
                        constrainedY = spacerBounds.bottom - objectHeight / 2;
                    }
                    // Allow X movement freely
                    constrainedX = newX;
                } else {
                    // Moving primarily in X direction
                    // Snap to left or right edge
                    if (deltaX > 0) {
                        // Moving right (toward spacer from left) - object right should touch spacer left
                        constrainedX = spacerBounds.left - objectWidth / 2;
                    } else {
                        // Moving left (toward spacer from right) - object left should touch spacer right
                        constrainedX = spacerBounds.right + objectWidth / 2;
                    }
                    // Allow Y movement freely
                    constrainedY = newY;
                }
                
                // Update bounds for next spacer check
                if (object.getBounds) {
                    const halfWidth = object.size.width / 2;
                    const halfHeight = object.size.height / 2;
                    newBounds.left = constrainedX - halfWidth;
                    newBounds.right = constrainedX + halfWidth;
                    newBounds.bottom = constrainedY - halfHeight;
                    newBounds.top = constrainedY + halfHeight;
                } else {
                    const pegType = object.type || 'round';
                    const pegSize = object.size || 'base';
                    newBounds = this.getPegBounds(constrainedX, constrainedY, pegType, pegSize);
                }
            }
        }
        
        return { x: constrainedX, y: constrainedY };
    }
    
    /**
     * Constrain shape movement to spacer edges - snap to edges when touching
     * Returns constrained position {x, y}
     * @deprecated Use constrainObjectToSpacers instead
     */
    constrainShapeToSpacerEdges(newX, newY, shape, oldX, oldY) {
        return this.constrainObjectToSpacers(newX, newY, shape, oldX, oldY);
    }
    
    /**
     * Constrain peg movement to spacer edges - snap to edges when touching
     * Returns constrained position {x, y}
     * @deprecated Use constrainObjectToSpacers instead
     */
    constrainPegToSpacerEdges(newX, newY, peg, oldX, oldY) {
        return this.constrainObjectToSpacers(newX, newY, peg, oldX, oldY);
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
        
        // Update rotation in placed objects
        const placedObj = this.placedObjects.find(obj => {
            if (obj.category === 'peg' && obj.position && peg.body && peg.body.position) {
                const objX = obj.position.x;
                const objY = obj.position.y;
                const pegX = peg.body.position.x;
                const pegY = peg.body.position.y;
                const distance = Math.sqrt(
                    Math.pow(objX - pegX, 2) + 
                    Math.pow(objY - pegY, 2)
                );
                return distance < 0.05;
            }
            return false;
        });
        
        if (placedObj) {
            placedObj.rotation = newZRotation;
        }
    }
    
    rotateShape(shape, angleDegrees) {
        if (!shape || !shape.mesh) return;
        
        // Convert degrees to radians
        const angleRadians = (angleDegrees * Math.PI) / 180;
        
        // Get current Z rotation from mesh
        const currentZRotation = shape.mesh.rotation.z || 0;
        const newZRotation = currentZRotation + angleRadians;
        
        // Update shape rotation (this will automatically rearrange pegs and characteristics)
        shape.setRotation(newZRotation);
        
        // Update indicator rotation if shape is selected
        if (this.selectionIndicator && this.selectedShape === shape) {
            this.selectionIndicator.rotation.z = newZRotation;
        }
    }
    
    rotateCharacteristic(characteristic, angleDegrees) {
        if (!characteristic || !characteristic.mesh) return;
        
        // Convert degrees to radians
        const angleRadians = (angleDegrees * Math.PI) / 180;
        
        // Get current Z rotation from mesh
        const currentZRotation = characteristic.mesh.rotation.z || 0;
        const newZRotation = currentZRotation + angleRadians;
        
        // Update characteristic rotation
        characteristic.setRotation(newZRotation);
        
        // Update indicator rotation if characteristic is selected
        if (this.selectionIndicator && this.selectedCharacteristic === characteristic) {
            this.selectionIndicator.rotation.z = newZRotation;
        }
        
        // Update in placed objects
        const placedObj = this.placedObjects.find(obj => {
            if (obj.category === 'characteristic' && obj.position && characteristic.position) {
                const objX = obj.position.x;
                const objY = obj.position.y;
                const charX = characteristic.position.x;
                const charY = characteristic.position.y;
                const distance = Math.sqrt(
                    Math.pow(objX - charX, 2) + 
                    Math.pow(objY - charY, 2)
                );
                return distance < 0.05;
            }
            return false;
        });
        
        if (placedObj) {
            placedObj.rotation = newZRotation;
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
                if (this.selectedPeg || this.selectedShape || this.selectedCharacteristic) {
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
        
        // Check if it's a characteristic (has shape property: 'rect' or 'circle')
        if (object.shape && (object.shape === 'rect' || object.shape === 'circle')) {
            // Characteristic outline
            if (object.shape === 'circle') {
                // Circle outline
                const radius = object.size?.radius || (object.size?.width ? object.size.width / 2 : 0.5);
                const outerRadius = radius + outlineSize;
                const innerRadius = radius;
                
                const shape = new THREE.Shape();
                shape.absarc(0, 0, outerRadius, 0, Math.PI * 2, false);
                const holePath = new THREE.Path();
                holePath.absarc(0, 0, innerRadius, 0, Math.PI * 2, true);
                shape.holes.push(holePath);
                geometry = new THREE.ShapeGeometry(shape);
            } else {
                // Rectangle outline
                const size = object.size || { width: 1, height: 1 };
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
            }
        } else if (object.type && (object.type === 'line' || object.type === 'circle')) {
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
                if (containingShape && containingShape.addPeg && containingShape.canTakeObjects !== false) {
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
                color: baseColor,
                rotation: 0 // Initialize rotation to 0
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
    
    placeCharacteristic(worldX, worldY, tool) {
        if (!this.game || !this.game.scene || !this.game.physicsWorld) return;
        
        // Import Characteristic dynamically
        import('../entities/Characteristic.js').then(({ Characteristic }) => {
            const roundedX = this.roundToDecimals(worldX);
            const roundedY = this.roundToDecimals(worldY);
            
            const toolType = tool.type || 'rect'; // 'rect' or 'round' (from tool)
            // Convert 'round' to 'circle' for Characteristic class
            const shapeType = toolType === 'round' ? 'circle' : 'rect';
            let defaultSize;
            
            if (shapeType === 'circle') {
                // Default circle size (smallest) = 0.5
                // Each subsequent size is 50% bigger
                const defaultCircleRadius = 0.5;
                const circleSizes = {
                    small: defaultCircleRadius,              // 0.5 (default)
                    base: defaultCircleRadius * 1.5,         // 0.75 (50% bigger)
                    large: defaultCircleRadius * 1.5 * 1.5   // 1.125 (50% bigger than base)
                };
                
                // Get size from tool, default to 'small' if not specified
                const sizeName = (tool && tool.size) ? tool.size : 'small';
                let radius = circleSizes[sizeName];
                
                // Fallback if sizeName is not in circleSizes
                if (typeof radius !== 'number' || isNaN(radius) || radius <= 0) {
                    console.warn('[LevelEditor] Invalid size name or radius:', sizeName, radius, 'using default small');
                    radius = circleSizes.small;
                }
                
                // Ensure final radius is valid
                if (typeof radius !== 'number' || isNaN(radius) || radius <= 0) {
                    console.error('[LevelEditor] Invalid calculated radius:', radius, 'using fallback 0.5');
                    radius = 0.5;
                }
                
                defaultSize = { radius: radius };
                console.log('[LevelEditor] Placing circular characteristic with size:', defaultSize, 'sizeName:', sizeName, 'radius:', radius);
            } else {
                defaultSize = { width: 1, height: 1 };
                // Ensure width and height are valid numbers
                if (typeof defaultSize.width !== 'number' || isNaN(defaultSize.width) || defaultSize.width <= 0) {
                    defaultSize.width = 1;
                }
                if (typeof defaultSize.height !== 'number' || isNaN(defaultSize.height) || defaultSize.height <= 0) {
                    defaultSize.height = 1;
                }
            }
            
            console.log('[LevelEditor] Creating characteristic:', { shapeType, defaultSize, position: { x: roundedX, y: roundedY, z: 0 } });
            
            const characteristic = new Characteristic(
                this.game.scene,
                this.game.physicsWorld,
                { x: roundedX, y: roundedY, z: 0 },
                shapeType,
                defaultSize,
                'normal' // Default bounce type
            );
            
            this.characteristics.push(characteristic);
            
            // Check if characteristic is being placed inside a shape
            try {
                const containingShape = this.findShapeAtPosition(roundedX, roundedY);
                if (containingShape && containingShape.addCharacteristic && containingShape.canTakeObjects !== false) {
                    containingShape.addCharacteristic(characteristic);
                }
            } catch (error) {
                console.error('Error adding characteristic to shape:', error);
            }
            
            // Store in placed objects (use toolType for consistency with tool system)
            this.placedObjects.push({
                category: 'characteristic',
                type: toolType, // Store as 'round' or 'rect' to match tool system
                shape: shapeType, // Store actual shape used by Characteristic ('circle' or 'rect')
                position: { x: roundedX, y: roundedY, z: 0 },
                size: defaultSize,
                rotation: 0,
                bounceType: 'normal' // Default bounce type
            });
            
            console.log('Characteristic placed at:', { x: roundedX, y: roundedY }, 'Type:', toolType, 'Shape:', shapeType, 'Size:', defaultSize);
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
                // tool.size is a string like 'small', 'base', 'large'
                // Map to actual numeric size (similar to how pegs work, but circles are tripled)
                const circleSizeMultiplier = 3; // Circle shapes are 3x the peg size
                let circleSize = 2; // Default size
                
                if (tool.size) {
                    const pegSize = this.pegSizes[tool.size];
                    if (typeof pegSize === 'number' && !isNaN(pegSize) && pegSize > 0) {
                        // Use peg size as base, multiply by circleSizeMultiplier for the radius
                        // Then double it for diameter (width/height)
                        circleSize = pegSize * circleSizeMultiplier * 2;
                    }
                }
                
                defaultSize = { width: circleSize, height: circleSize };
                
                // Ensure valid numbers
                if (typeof defaultSize.width !== 'number' || isNaN(defaultSize.width) || defaultSize.width <= 0) {
                    console.warn('[LevelEditor] Invalid circle shape size, using default:', tool.size);
                    defaultSize = { width: 2, height: 2 };
                }
                
                console.log('[LevelEditor] Placing circle shape with size:', defaultSize, 'tool.size:', tool.size);
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
                isEditorOnly: true,
                canTakeObjects: shape.canTakeObjects !== false // Default to true
            });
            
            // Clear selection after placing shape
            this.selectedTool = null;
            this.hidePreview();
            
            console.log('Shape placed at:', { x: roundedX, y: roundedY }, 'Type:', shapeType, 'Size:', defaultSize);
        });
    }
    
    moveSpacer(spacer, newX, newY) {
        if (!spacer) return;
        
        const oldX = spacer.position.x;
        const oldY = spacer.position.y;
        
        // Constrain movement to other spacer edges (same logic as shapes)
        const constrainedPos = this.constrainObjectToSpacers(newX, newY, spacer, oldX, oldY, spacer);
        const roundedX = this.roundToDecimals(constrainedPos.x);
        const roundedY = this.roundToDecimals(constrainedPos.y);
        
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
    
    /**
     * Snap spacer to inside edge if it crosses level border
     * Single check, single adjustment
     */
    snapSpacerToBounds(spacer) {
        if (!spacer) {
            console.log('[SNAP] No spacer provided');
            return;
        }
        
        // Level bounds: X: -6 to 6, Y: -4.5 to 4.5 (bottom is -4.5)
        const levelBounds = {
            left: -6,
            right: 6,
            bottom: -4.5,
            top: 4.5
        };
        
        const halfWidth = spacer.size.width / 2;
        const halfHeight = spacer.size.height / 2;
        let currentX = spacer.position.x;
        let currentY = spacer.position.y;
        
        // Calculate spacer edge coordinates
        const spacerLeft = currentX - halfWidth;
        const spacerRight = currentX + halfWidth;
        const spacerBottom = currentY - halfHeight;
        const spacerTop = currentY + halfHeight;
        
        console.log('[SNAP] Initial state:', {
            currentX,
            currentY,
            halfWidth,
            halfHeight,
            spacerEdges: {
                left: spacerLeft,
                right: spacerRight,
                bottom: spacerBottom,
                top: spacerTop
            },
            levelBounds,
            isOutOfBounds: {
                left: spacerLeft < levelBounds.left,
                right: spacerRight > levelBounds.right,
                bottom: spacerBottom < levelBounds.bottom,
                top: spacerTop > levelBounds.top
            }
        });
        
        // Single check and adjustment
        if (spacerLeft < levelBounds.left) {
            console.log('[SNAP] Crossing left edge:', {
                spacerLeft,
                levelBoundsLeft: levelBounds.left,
                difference: spacerLeft - levelBounds.left,
                newX: levelBounds.left + halfWidth
            });
            currentX = levelBounds.left + halfWidth;
        } else if (spacerRight > levelBounds.right) {
            console.log('[SNAP] Crossing right edge:', {
                spacerRight,
                levelBoundsRight: levelBounds.right,
                difference: spacerRight - levelBounds.right,
                newX: levelBounds.right - halfWidth
            });
            currentX = levelBounds.right - halfWidth;
        }
        
        if (spacerBottom < levelBounds.bottom) {
            console.log('[SNAP] Crossing bottom edge:', {
                spacerBottom,
                levelBoundsBottom: levelBounds.bottom,
                difference: spacerBottom - levelBounds.bottom,
                newY: levelBounds.bottom + halfHeight
            });
            currentY = levelBounds.bottom + halfHeight;
        } else if (spacerTop > levelBounds.top) {
            console.log('[SNAP] Crossing top edge:', {
                spacerTop,
                levelBoundsTop: levelBounds.top,
                difference: spacerTop - levelBounds.top,
                newY: levelBounds.top - halfHeight
            });
            currentY = levelBounds.top - halfHeight;
        }
        
        console.log('[SNAP] After adjustment:', {
            currentX,
            currentY,
            originalX: spacer.position.x,
            originalY: spacer.position.y,
            changed: currentX !== spacer.position.x || currentY !== spacer.position.y
        });
        
        // Update position if it changed
        if (currentX !== spacer.position.x || currentY !== spacer.position.y) {
            const roundedX = this.roundToDecimals(currentX);
            const roundedY = this.roundToDecimals(currentY);
            console.log('[SNAP] Updating position to:', { roundedX, roundedY });
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
                    return distance < 0.05;
                }
                return false;
            });
            
            if (placedObj) {
                placedObj.position.x = roundedX;
                placedObj.position.y = roundedY;
                console.log('[SNAP] Updated placed object');
            } else {
                console.log('[SNAP] No placed object found to update');
            }
        } else {
            console.log('[SNAP] No adjustment needed');
        }
    }
    
    moveShape(shape, newX, newY) {
        if (!shape) return;
        
        const oldX = shape.position.x;
        const oldY = shape.position.y;
        
        // Constrain movement to spacer edges (using unified method)
        const constrainedPos = this.constrainObjectToSpacers(newX, newY, shape, oldX, oldY);
        const roundedX = this.roundToDecimals(constrainedPos.x);
        const roundedY = this.roundToDecimals(constrainedPos.y);
        
        // Update shape position
        shape.moveTo({ x: roundedX, y: roundedY, z: 0 });
    }
    
    moveCharacteristic(characteristic, newX, newY) {
        if (!characteristic) return;
        
        const oldX = characteristic.position.x;
        const oldY = characteristic.position.y;
        
        // Constrain movement to spacer edges (using unified method)
        const constrainedPos = this.constrainObjectToSpacers(newX, newY, characteristic, oldX, oldY);
        const roundedX = this.roundToDecimals(constrainedPos.x);
        const roundedY = this.roundToDecimals(constrainedPos.y);
        
        // Check if characteristic is currently in a shape
        const currentShape = characteristic.parentShape;
        
        // Check if new position is inside a shape
        const containingShape = this.findShapeAtPosition(roundedX, roundedY);
        
        if (containingShape && containingShape !== currentShape && containingShape.canTakeObjects !== false) {
            // Moved into a different shape - add to it (only if shape can take objects)
            // For now, just add at the end (could implement findInsertionIndex for characteristics later)
            if (currentShape) {
                currentShape.removeCharacteristic(characteristic);
            }
            containingShape.addCharacteristic(characteristic);
        } else if (!containingShape && currentShape) {
            // Moved outside of shape - remove from current shape
            currentShape.removeCharacteristic(characteristic);
        } else if (containingShape && containingShape === currentShape) {
            // Still in same shape - let shape rearrange it
            // Don't call moveTo directly, let the shape handle positioning
            return;
        } else {
            // Not in any shape - update position directly
            characteristic.moveTo({ x: roundedX, y: roundedY, z: 0 });
        }
        
        // Update in placed objects
        const placedObj = this.placedObjects.find(obj => {
            if (obj.category === 'characteristic' && obj.position && characteristic.position) {
                const objX = obj.position.x;
                const objY = obj.position.y;
                const charX = characteristic.position.x;
                const charY = characteristic.position.y;
                const distance = Math.sqrt(
                    Math.pow(objX - charX, 2) + 
                    Math.pow(objY - charY, 2)
                );
                return distance < 0.05;
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
    
    findCharacteristicAtPosition(worldX, worldY) {
        if (!this.characteristics || this.characteristics.length === 0) return null;
        
        // Check characteristics (they have boundaries, not just point distance)
        for (const characteristic of this.characteristics) {
            if (characteristic.containsPoint(worldX, worldY)) {
                return characteristic;
            }
        }
        
        return null;
    }
    
    selectCopySource(worldX, worldY) {
        // First try to find a shape (shapes have priority so we copy the whole group)
        const shape = this.findShapeAtPosition(worldX, worldY);
        if (shape) {
            this.copySource = { type: 'shape', data: shape };
            this.createCopyPreview(shape);
            return;
        }
        
        // Then try to find a peg
        const peg = this.findPegAtPosition(worldX, worldY);
        if (peg) {
            // Only copy peg if it's not inside a shape
            if (!peg.parentShape) {
                this.copySource = { type: 'peg', data: peg };
                this.createCopyPreview(peg);
                return;
            }
        }
        
        // Then try to find a spacer
        const spacer = this.findSpacerAtPosition(worldX, worldY);
        if (spacer) {
            this.copySource = { type: 'spacer', data: spacer };
            this.createCopyPreview(spacer);
            return;
        }
        
        // Then try to find a characteristic
        const characteristic = this.findCharacteristicAtPosition(worldX, worldY);
        if (characteristic) {
            this.copySource = { type: 'characteristic', data: characteristic };
            this.createCopyPreview(characteristic);
            return;
        }
        
        // No object found - clear copy source
        this.copySource = null;
        if (this.copyPreview) {
            // Remove preview group and all children
            if (this.copyPreview.isGroup) {
                this.copyPreview.traverse((child) => {
                    if (child.geometry) child.geometry.dispose();
                    if (child.material) child.material.dispose();
                });
            } else {
                if (this.copyPreview.geometry) this.copyPreview.geometry.dispose();
                if (this.copyPreview.material) this.copyPreview.material.dispose();
            }
            this.game.scene.remove(this.copyPreview);
            this.copyPreview = null;
        }
    }
    
    createCopyPreview(source) {
        if (!this.game || !this.game.scene) return;
        
        // Remove existing preview
        if (this.copyPreview) {
            // Remove preview group and all children
            if (this.copyPreview.isGroup) {
                this.copyPreview.traverse((child) => {
                    if (child.geometry) child.geometry.dispose();
                    if (child.material) child.material.dispose();
                });
            } else {
                if (this.copyPreview.geometry) this.copyPreview.geometry.dispose();
                if (this.copyPreview.material) this.copyPreview.material.dispose();
            }
            this.game.scene.remove(this.copyPreview);
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
        } else if (source.shape && (source.shape === 'rect' || source.shape === 'circle')) {
            // Characteristic preview
            if (source.shape === 'circle') {
                const radius = source.size?.radius || (source.size?.width ? source.size.width / 2 : 0.5);
                const geometry = new THREE.CircleGeometry(radius, 32);
                const material = new THREE.MeshBasicMaterial({
                    color: 0x808080,
                    transparent: true,
                    opacity: 0.5
                });
                this.copyPreview = new THREE.Mesh(geometry, material);
            } else {
                // Rectangular characteristic
                const size = source.size || { width: 1, height: 1 };
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
                    color: 0x808080,
                    transparent: true,
                    opacity: 0.5
                });
                this.copyPreview = new THREE.Mesh(geometry, material);
            }
        } else if (source.size && !source.containedPegs) {
            // Spacer preview (has size but no containedPegs)
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
        } else if (source.containedPegs !== undefined) {
            // Shape with pegs - create a group preview
            const shapeGroup = new THREE.Group();
            
            // Create shape preview (transparent green)
            const size = source.size;
            const shape = new THREE.Shape();
            const halfWidth = size.width / 2;
            const halfHeight = size.height / 2;
            shape.moveTo(-halfWidth, -halfHeight);
            shape.lineTo(halfWidth, -halfHeight);
            shape.lineTo(halfWidth, halfHeight);
            shape.lineTo(-halfWidth, halfHeight);
            shape.closePath();
            const shapeGeometry = new THREE.ShapeGeometry(shape);
            const shapeMaterial = new THREE.MeshBasicMaterial({
                color: 0x00ff00,
                transparent: true,
                opacity: 0.2
            });
            const shapeMesh = new THREE.Mesh(shapeGeometry, shapeMaterial);
            shapeMesh.rotation.z = source.rotation || 0;
            shapeGroup.add(shapeMesh);
            
            // Create preview for each contained peg
            if (source.containedPegs && source.containedPegs.length > 0) {
                source.containedPegs.forEach(peg => {
                    if (!peg || !peg.body || !peg.mesh) return;
                    
                    let pegPreview;
                    const pegPos = peg.body.position;
                    
                    if (peg.type === 'round') {
                        const radius = peg.actualSize || 0.09;
                        const geometry = new THREE.CircleGeometry(radius, 16);
                        const material = new THREE.MeshBasicMaterial({
                            color: 0xffffff,
                            transparent: true,
                            opacity: 0.5
                        });
                        pegPreview = new THREE.Mesh(geometry, material);
                        pegPreview.position.set(pegPos.x - source.position.x, pegPos.y - source.position.y, 0.01);
                    } else {
                        // rect or dome
                        const height = (peg.actualSize || 0.09) * 2;
                        const width = height * 2;
                        const pegShape = new THREE.Shape();
                        pegShape.moveTo(-width / 2, -height / 2);
                        pegShape.lineTo(width / 2, -height / 2);
                        pegShape.lineTo(width / 2, height / 2);
                        pegShape.lineTo(-width / 2, height / 2);
                        pegShape.closePath();
                        const geometry = new THREE.ShapeGeometry(pegShape);
                        const material = new THREE.MeshBasicMaterial({
                            color: 0xffffff,
                            transparent: true,
                            opacity: 0.5
                        });
                        pegPreview = new THREE.Mesh(geometry, material);
                        pegPreview.position.set(pegPos.x - source.position.x, pegPos.y - source.position.y, 0.01);
                        pegPreview.rotation.z = peg.mesh.rotation.z || 0;
                    }
                    
                    shapeGroup.add(pegPreview);
                });
            }
            
            this.copyPreview = shapeGroup;
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
        
        // Store copy source locally before clearing (we'll need it in async callbacks)
        const copySourceToUse = this.copySource;
        
        // Clear copy source immediately (synchronously) so it can't be pasted again
        this.clearCopySource();
        
        if (copySourceToUse.type === 'peg') {
            const sourcePeg = copySourceToUse.data;
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
        } else if (copySourceToUse.type === 'spacer') {
            const sourceSpacer = copySourceToUse.data;
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
        } else if (copySourceToUse.type === 'shape') {
            const sourceShape = copySourceToUse.data;
            // Create new shape with same properties
            import('../entities/Shape.js').then(({ Shape }) => {
                const shape = new Shape(
                    this.game.scene,
                    { x: roundedX, y: roundedY, z: 0 },
                    sourceShape.type,
                    { width: sourceShape.size.width, height: sourceShape.size.height }
                );
                
                // Copy shape settings
                shape.align = sourceShape.align;
                shape.justify = sourceShape.justify;
                shape.gap = sourceShape.gap;
                shape.setRotation(sourceShape.rotation || 0);
                
                this.shapes.push(shape);
                
                // Store in placed objects
                this.placedObjects.push({
                    category: 'shape',
                    type: sourceShape.type,
                    position: { x: roundedX, y: roundedY, z: 0 },
                    size: { width: sourceShape.size.width, height: sourceShape.size.height },
                    isEditorOnly: true,
                    align: shape.align,
                    justify: shape.justify,
                    gap: shape.gap,
                    rotation: shape.rotation,
                    canTakeObjects: shape.canTakeObjects !== false // Default to true
                });
                
                // Copy contained pegs in order
                if (sourceShape.containedPegs && sourceShape.containedPegs.length > 0) {
                    import('../entities/Peg.js').then(({ Peg }) => {
                        const pegMaterial = this.game.physicsWorld.getPegMaterial();
                        
                        // Create pegs and add them to the shape in the same order
                        sourceShape.containedPegs.forEach((sourcePeg, index) => {
                            if (!sourcePeg || !sourcePeg.body) return;
                            
                            // Create new peg with same properties as source peg
                            const peg = new Peg(
                                this.game.scene,
                                this.game.physicsWorld,
                                { x: roundedX, y: roundedY, z: 0 }, // Will be repositioned by rearrangePegs
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
                            
                            // Add peg to shape at the same index
                            shape.addPeg(peg, index);
                            
                            // Store in placed objects
                            this.placedObjects.push({
                                category: 'peg',
                                type: sourcePeg.type,
                                size: sourcePeg.size,
                                position: { x: roundedX, y: roundedY, z: 0 }, // Will be updated by rearrangePegs
                                color: sourcePeg.color,
                                rotation: peg.mesh.rotation.z
                            });
                        });
                    });
                }
                
                // Copy contained characteristics in order
                if (sourceShape.containedCharacteristics && sourceShape.containedCharacteristics.length > 0) {
                    import('../entities/Characteristic.js').then(({ Characteristic }) => {
                        // Create characteristics and add them to the shape in the same order
                        sourceShape.containedCharacteristics.forEach((sourceChar, index) => {
                            if (!sourceChar || !sourceChar.mesh) return;
                            
                            // Create new characteristic with same properties as source characteristic
                            const bounceType = sourceChar.bounceType || 'normal';
                            const characteristic = new Characteristic(
                                this.game.scene,
                                this.game.physicsWorld,
                                { x: roundedX, y: roundedY, z: 0 }, // Will be repositioned by rearrangeCharacteristics
                                sourceChar.shape,
                                sourceChar.size,
                                bounceType
                            );
                            
                            // Copy rotation
                            if (sourceChar.rotation !== undefined) {
                                characteristic.setRotation(sourceChar.rotation);
                            }
                            
                            this.characteristics.push(characteristic);
                            
                            // Add characteristic to shape at the same index
                            shape.addCharacteristic(characteristic, index);
                            
                            // Store in placed objects
                            const toolType = sourceChar.shape === 'circle' ? 'round' : 'rect';
                            this.placedObjects.push({
                                category: 'characteristic',
                                type: toolType,
                                shape: sourceChar.shape,
                                position: { x: roundedX, y: roundedY, z: 0 }, // Will be updated by rearrangeCharacteristics
                                size: sourceChar.size,
                                rotation: characteristic.rotation || 0,
                                bounceType: bounceType
                            });
                        });
                    });
                }
            });
        } else if (copySourceToUse.type === 'characteristic') {
            const sourceCharacteristic = copySourceToUse.data;
            // Create new characteristic with same properties
            import('../entities/Characteristic.js').then(({ Characteristic }) => {
                const bounceType = sourceCharacteristic.bounceType || 'normal';
                const characteristic = new Characteristic(
                    this.game.scene,
                    this.game.physicsWorld,
                    { x: roundedX, y: roundedY, z: 0 },
                    sourceCharacteristic.shape, // 'rect' or 'circle'
                    sourceCharacteristic.size,
                    bounceType
                );
                
                // Copy rotation
                if (sourceCharacteristic.rotation !== undefined) {
                    characteristic.setRotation(sourceCharacteristic.rotation);
                }
                
                this.characteristics.push(characteristic);
                
                // Store in placed objects
                // Convert 'circle' back to 'round' for tool system consistency
                const toolType = sourceCharacteristic.shape === 'circle' ? 'round' : 'rect';
                this.placedObjects.push({
                    category: 'characteristic',
                    type: toolType, // Store as 'round' or 'rect' to match tool system
                    shape: sourceCharacteristic.shape, // Store actual shape used by Characteristic
                    position: { x: roundedX, y: roundedY, z: 0 },
                    size: sourceCharacteristic.size,
                    rotation: characteristic.rotation || 0,
                    bounceType: bounceType
                });
                
            });
        }
    }
    
    /**
     * Clear copy source and preview, and deselect copy tool
     */
    clearCopySource() {
        this.copySource = null;
        if (this.copyPreview) {
            // Remove preview group and all children
            if (this.copyPreview.isGroup) {
                this.copyPreview.traverse((child) => {
                    if (child.geometry) child.geometry.dispose();
                    if (child.material) child.material.dispose();
                });
            } else {
                if (this.copyPreview.geometry) this.copyPreview.geometry.dispose();
                if (this.copyPreview.material) this.copyPreview.material.dispose();
            }
            this.game.scene.remove(this.copyPreview);
            this.copyPreview = null;
        }
        
        // Deselect copy tool after placing
        if (this.selectedTool && this.selectedTool.category === 'copy') {
            this.selectedTool = null;
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
        this.initSettingsToolbar();
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
        
        // Circular shapes - only largest size (can be resized)
        const largestSize = 'large';
        const largestPegSize = this.pegSizes[largestSize];
        const item = this.createToolbarItem('circle-shape', largestSize, largestPegSize, 'circle');
        item.addEventListener('click', () => this.selectTool('shape', { type: 'circle', size: largestSize }));
        shapesItems.appendChild(item);
    }
    
    initStaticToolbar() {
        const staticItems = document.getElementById('static-items');
        if (!staticItems) return;
        
        // Rectangle static
        const rectItem = this.createToolbarItem('static-rect', 'rect', null, 'rectangle');
        rectItem.addEventListener('click', () => this.selectTool('static', { type: 'rect' }));
        staticItems.appendChild(rectItem);
        
        // Round static - 3 sizes
        // Default circle size (smallest) = 0.5
        // Each subsequent size is 50% bigger
        const defaultCircleRadius = 0.5;
        const circleSizes = {
            small: defaultCircleRadius,              // 0.5 (default)
            base: defaultCircleRadius * 1.5,         // 0.75 (50% bigger)
            large: defaultCircleRadius * 1.5 * 1.5   // 1.125 (50% bigger than base)
        };
        
        for (const [sizeName, radius] of Object.entries(circleSizes)) {
            const roundItem = this.createToolbarItem('static-round', 'round', radius, 'circle');
            roundItem.addEventListener('click', () => this.selectTool('static', { type: 'round', size: sizeName }));
            staticItems.appendChild(roundItem);
        }
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
    
    initSettingsToolbar() {
        const eraserItems = document.getElementById('eraser-items');
        if (!eraserItems) return;
        
        const settingsItem = this.createToolbarItem('settings', '⚙', null, 'settings');
        settingsItem.addEventListener('click', () => this.selectTool('settings', { type: 'settings' }));
        eraserItems.appendChild(settingsItem);
    }
    
    openShapeSettings(shape) {
        if (!shape) return;
        
        this.shapeForSettings = shape;
        this.createSettingsModal();
    }
    
    openCharacteristicSettings(characteristic) {
        if (!characteristic) return;
        
        this.characteristicForSettings = characteristic;
        this.createCharacteristicSettingsModal();
    }
    
    createSettingsModal() {
        // Remove existing modal if any
        const existingModal = document.getElementById('shape-settings-modal');
        if (existingModal) {
            existingModal.remove();
        }
        
        // Create overlay
        const overlay = document.createElement('div');
        overlay.id = 'shape-settings-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.7);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 10000;
            pointer-events: auto;
        `;
        
        // Create modal
        const modal = document.createElement('div');
        modal.id = 'shape-settings-modal';
        modal.style.cssText = `
            background: linear-gradient(135deg, #2a2a3e 0%, #1a1a2e 100%);
            border: 3px solid #6495ed;
            border-radius: 15px;
            padding: 20px;
            min-width: 400px;
            max-width: 600px;
        `;
        
        // Header
        const header = document.createElement('div');
        header.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
            border-bottom: 2px solid #6495ed;
            padding-bottom: 10px;
        `;
        
        const title = document.createElement('h2');
        title.textContent = 'Shape Settings';
        title.style.cssText = `
            color: white;
            font-size: 28px;
            margin: 0;
            text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
        `;
        
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '×';
        closeBtn.style.cssText = `
            background: rgba(255, 100, 100, 0.3);
            border: 2px solid #ff6464;
            border-radius: 8px;
            color: #ff6464;
            font-size: 32px;
            font-weight: bold;
            width: 50px;
            height: 50px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.3s ease;
            padding: 0;
            line-height: 1;
        `;
        closeBtn.addEventListener('click', () => this.closeShapeSettings());
        closeBtn.addEventListener('mouseenter', () => {
            closeBtn.style.background = 'rgba(255, 100, 100, 0.5)';
            closeBtn.style.transform = 'scale(1.1)';
        });
        closeBtn.addEventListener('mouseleave', () => {
            closeBtn.style.background = 'rgba(255, 100, 100, 0.3)';
            closeBtn.style.transform = 'scale(1)';
        });
        
        header.appendChild(title);
        header.appendChild(closeBtn);
        
        // Content
        const content = document.createElement('div');
        content.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 20px;
        `;
        
        // Align setting (only for line shapes)
        const alignGroup = document.createElement('div');
        alignGroup.style.cssText = `display: flex; flex-direction: column; gap: 10px;`;
        if (this.shapeForSettings.type === 'circle') {
            alignGroup.style.display = 'none'; // Hide align for circle shapes
        }
        const alignLabel = document.createElement('label');
        alignLabel.textContent = 'Vertical Align';
        alignLabel.style.cssText = `color: white; font-size: 16px; font-weight: bold;`;
        
        const alignSelect = document.createElement('select');
        alignSelect.id = 'shape-align-select';
        alignSelect.style.cssText = `
            padding: 10px;
            background: rgba(30, 40, 60, 0.9);
            border: 2px solid #6495ed;
            border-radius: 8px;
            color: white;
            font-size: 16px;
            cursor: pointer;
        `;
        ['top', 'middle', 'bottom'].forEach(value => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = value.charAt(0).toUpperCase() + value.slice(1);
            if (this.shapeForSettings.align === value) {
                option.selected = true;
            }
            alignSelect.appendChild(option);
        });
        alignSelect.addEventListener('change', (e) => {
            this.shapeForSettings.align = e.target.value;
            this.shapeForSettings.rearrangePegs();
            this.shapeForSettings.rearrangeCharacteristics();
        });
        
        alignGroup.appendChild(alignLabel);
        alignGroup.appendChild(alignSelect);
        
        // Justify setting (different options for line vs circle)
        const justifyGroup = document.createElement('div');
        justifyGroup.style.cssText = `display: flex; flex-direction: column; gap: 10px;`;
        const justifyLabel = document.createElement('label');
        justifyLabel.textContent = this.shapeForSettings.type === 'circle' ? 'Circle Justify' : 'Horizontal Justify';
        justifyLabel.style.cssText = `color: white; font-size: 16px; font-weight: bold;`;
        
        const justifySelect = document.createElement('select');
        justifySelect.id = 'shape-justify-select';
        justifySelect.style.cssText = `
            padding: 10px;
            background: rgba(30, 40, 60, 0.9);
            border: 2px solid #6495ed;
            border-radius: 8px;
            color: white;
            font-size: 16px;
            cursor: pointer;
        `;
        
        if (this.shapeForSettings.type === 'circle') {
            // Circle justify options (12 total)
            const circleOptions = [
                // Reference point (4 options)
                { value: 'top-center', label: 'Top Center' },
                { value: 'right-center', label: 'Right Center' },
                { value: 'bottom-center', label: 'Bottom Center' },
                { value: 'left-center', label: 'Left Center' },
                // Clockwise (4 options)
                { value: 'top-clockwise', label: 'Top Clockwise' },
                { value: 'right-clockwise', label: 'Right Clockwise' },
                { value: 'bottom-clockwise', label: 'Bottom Clockwise' },
                { value: 'left-clockwise', label: 'Left Clockwise' },
                // Counter-clockwise (4 options)
                { value: 'top-counter-clockwise', label: 'Top Counter-Clockwise' },
                { value: 'right-counter-clockwise', label: 'Right Counter-Clockwise' },
                { value: 'bottom-counter-clockwise', label: 'Bottom Counter-Clockwise' },
                { value: 'left-counter-clockwise', label: 'Left Counter-Clockwise' },
                // Space evenly (4 options)
                { value: 'top-evenly', label: 'Top Evenly' },
                { value: 'right-evenly', label: 'Right Evenly' },
                { value: 'bottom-evenly', label: 'Bottom Evenly' },
                { value: 'left-evenly', label: 'Left Evenly' }
            ];
            
            circleOptions.forEach(({ value, label }) => {
                const option = document.createElement('option');
                option.value = value;
                option.textContent = label;
                if (this.shapeForSettings.justify === value) {
                    option.selected = true;
                }
                justifySelect.appendChild(option);
            });
        } else {
            // Line justify options
            ['left', 'right', 'center', 'between', 'around'].forEach(value => {
                const option = document.createElement('option');
                option.value = value;
                option.textContent = value.charAt(0).toUpperCase() + value.slice(1);
                if (this.shapeForSettings.justify === value) {
                    option.selected = true;
                }
                justifySelect.appendChild(option);
            });
        }
        
        justifySelect.addEventListener('change', (e) => {
            this.shapeForSettings.justify = e.target.value;
            this.shapeForSettings.rearrangePegs();
            this.shapeForSettings.rearrangeCharacteristics();
        });
        
        justifyGroup.appendChild(justifyLabel);
        justifyGroup.appendChild(justifySelect);
        
        // Gap setting
        const gapGroup = document.createElement('div');
        gapGroup.style.cssText = `display: flex; flex-direction: column; gap: 10px;`;
        const gapLabel = document.createElement('label');
        gapLabel.textContent = 'Gap';
        gapLabel.style.cssText = `color: white; font-size: 16px; font-weight: bold;`;
        
        const gapInput = document.createElement('input');
        gapInput.id = 'shape-gap-input';
        gapInput.type = 'number';
        gapInput.step = '0.01';
        gapInput.min = '0';
        gapInput.value = this.shapeForSettings.gap;
        gapInput.style.cssText = `
            padding: 10px;
            background: rgba(30, 40, 60, 0.9);
            border: 2px solid #6495ed;
            border-radius: 8px;
            color: white;
            font-size: 16px;
        `;
        gapInput.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            if (!isNaN(value) && value >= 0) {
                this.shapeForSettings.gap = value;
                this.shapeForSettings.rearrangePegs();
                this.shapeForSettings.rearrangeCharacteristics();
            }
        });
        
        gapGroup.appendChild(gapLabel);
        gapGroup.appendChild(gapInput);
        
        // Can Take Objects checkbox
        const canTakeObjectsGroup = document.createElement('div');
        canTakeObjectsGroup.style.cssText = `display: flex; flex-direction: column; gap: 10px;`;
        const canTakeObjectsLabel = document.createElement('label');
        canTakeObjectsLabel.textContent = 'Can Take Objects';
        canTakeObjectsLabel.style.cssText = `color: white; font-size: 16px; font-weight: bold;`;
        
        const canTakeObjectsCheckbox = document.createElement('input');
        canTakeObjectsCheckbox.type = 'checkbox';
        canTakeObjectsCheckbox.id = 'shape-can-take-objects';
        canTakeObjectsCheckbox.checked = this.shapeForSettings.canTakeObjects !== false; // Default to true
        canTakeObjectsCheckbox.style.cssText = `
            width: 20px;
            height: 20px;
            cursor: pointer;
        `;
        canTakeObjectsCheckbox.addEventListener('change', (e) => {
            this.shapeForSettings.canTakeObjects = e.target.checked;
            
            // Update placed objects entry to sync with shape object
            const placedObj = this.placedObjects.find(obj => {
                if (obj.category === 'shape' && obj.position && this.shapeForSettings.position) {
                    const objX = obj.position.x;
                    const objY = obj.position.y;
                    const shapeX = this.shapeForSettings.position.x;
                    const shapeY = this.shapeForSettings.position.y;
                    const distance = Math.sqrt(
                        Math.pow(objX - shapeX, 2) + 
                        Math.pow(objY - shapeY, 2)
                    );
                    return distance < 0.05;
                }
                return false;
            });
            if (placedObj) {
                placedObj.canTakeObjects = e.target.checked;
            }
            
            // Don't remove existing objects when toggling - they should stay where they are
            // This setting only affects NEW placements, not existing contained objects
        });
        
        const canTakeObjectsContainer = document.createElement('div');
        canTakeObjectsContainer.style.cssText = `display: flex; align-items: center; gap: 10px;`;
        canTakeObjectsContainer.appendChild(canTakeObjectsCheckbox);
        canTakeObjectsContainer.appendChild(canTakeObjectsLabel);
        
        canTakeObjectsGroup.appendChild(canTakeObjectsContainer);
        
        content.appendChild(alignGroup);
        content.appendChild(justifyGroup);
        content.appendChild(gapGroup);
        content.appendChild(canTakeObjectsGroup);
        
        modal.appendChild(header);
        modal.appendChild(content);
        overlay.appendChild(modal);
        
        // Close on overlay click
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                this.closeShapeSettings();
            }
        });
        
        document.body.appendChild(overlay);
    }
    
    closeShapeSettings() {
        const overlay = document.getElementById('shape-settings-overlay');
        if (overlay) {
            overlay.remove();
        }
        this.shapeForSettings = null;
    }
    
    createCharacteristicSettingsModal() {
        // Remove existing modal if any
        const existingModal = document.getElementById('characteristic-settings-modal');
        if (existingModal) {
            existingModal.remove();
        }
        
        // Create overlay
        const overlay = document.createElement('div');
        overlay.id = 'characteristic-settings-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.7);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 10000;
            pointer-events: auto;
        `;
        
        // Create modal
        const modal = document.createElement('div');
        modal.id = 'characteristic-settings-modal';
        modal.style.cssText = `
            background: linear-gradient(135deg, #2a2a3e 0%, #1a1a2e 100%);
            border: 3px solid #6495ed;
            border-radius: 15px;
            padding: 20px;
            min-width: 400px;
            max-width: 600px;
        `;
        
        // Header
        const header = document.createElement('div');
        header.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
            border-bottom: 2px solid #6495ed;
            padding-bottom: 10px;
        `;
        
        const title = document.createElement('h2');
        title.textContent = 'Characteristic Settings';
        title.style.cssText = `
            color: white;
            font-size: 28px;
            margin: 0;
            text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
        `;
        
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '×';
        closeBtn.style.cssText = `
            background: rgba(255, 100, 100, 0.3);
            border: 2px solid #ff6464;
            border-radius: 8px;
            color: #ff6464;
            font-size: 32px;
            font-weight: bold;
            width: 50px;
            height: 50px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.3s ease;
            padding: 0;
            line-height: 1;
        `;
        closeBtn.addEventListener('click', () => this.closeCharacteristicSettings());
        closeBtn.addEventListener('mouseenter', () => {
            closeBtn.style.background = 'rgba(255, 100, 100, 0.5)';
            closeBtn.style.transform = 'scale(1.1)';
        });
        closeBtn.addEventListener('mouseleave', () => {
            closeBtn.style.background = 'rgba(255, 100, 100, 0.3)';
            closeBtn.style.transform = 'scale(1)';
        });
        
        header.appendChild(title);
        header.appendChild(closeBtn);
        
        // Content
        const content = document.createElement('div');
        content.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 20px;
        `;
        
        // Bounce Type setting
        const bounceGroup = document.createElement('div');
        bounceGroup.style.cssText = `display: flex; flex-direction: column; gap: 10px;`;
        const bounceLabel = document.createElement('label');
        bounceLabel.textContent = 'Bounce Type';
        bounceLabel.style.cssText = `color: white; font-size: 16px; font-weight: bold;`;
        
        const bounceSelect = document.createElement('select');
        bounceSelect.id = 'characteristic-bounce-select';
        bounceSelect.style.cssText = `
            padding: 10px;
            background: rgba(30, 40, 60, 0.9);
            border: 2px solid #6495ed;
            border-radius: 8px;
            color: white;
            font-size: 16px;
            cursor: pointer;
        `;
        
        const bounceTypes = [
            { value: 'normal', label: 'Normal (Grey)' },
            { value: 'dampened', label: 'Dampened (Dark Grey)' },
            { value: 'no-bounce', label: 'No Bounce (Very Dark)' },
            { value: 'super-bouncy', label: 'Super Bouncy (Crimson)' }
        ];
        
        bounceTypes.forEach(({ value, label }) => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = label;
            if (this.characteristicForSettings.bounceType === value) {
                option.selected = true;
            }
            bounceSelect.appendChild(option);
        });
        
        bounceSelect.addEventListener('change', (e) => {
            this.characteristicForSettings.setBounceType(e.target.value);
            
            // Update in placed objects
            const placedObj = this.placedObjects.find(obj => {
                if (obj.category === 'characteristic' && obj.position && this.characteristicForSettings.position) {
                    const objX = obj.position.x;
                    const objY = obj.position.y;
                    const charX = this.characteristicForSettings.position.x;
                    const charY = this.characteristicForSettings.position.y;
                    const distance = Math.sqrt(
                        Math.pow(objX - charX, 2) + 
                        Math.pow(objY - charY, 2)
                    );
                    return distance < 0.05;
                }
                return false;
            });
            
            if (placedObj) {
                placedObj.bounceType = e.target.value;
            }
        });
        
        bounceGroup.appendChild(bounceLabel);
        bounceGroup.appendChild(bounceSelect);
        
        content.appendChild(bounceGroup);
        
        modal.appendChild(header);
        modal.appendChild(content);
        overlay.appendChild(modal);
        
        // Close on overlay click
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                this.closeCharacteristicSettings();
            }
        });
        
        document.body.appendChild(overlay);
    }
    
    closeCharacteristicSettings() {
        const overlay = document.getElementById('characteristic-settings-overlay');
        if (overlay) {
            overlay.remove();
        }
        this.characteristicForSettings = null;
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
        } else if (shape === 'settings') {
            // Settings tool icon - gear symbol (SVG)
            preview.style.background = 'rgba(150, 100, 255, 0.5)';
            preview.style.width = '70%';
            preview.style.height = '70%';
            preview.style.position = 'relative';
            preview.innerHTML = '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 15.5A3.5 3.5 0 0 1 8.5 12A3.5 3.5 0 0 1 12 8.5a3.5 3.5 0 0 1 3.5 3.5a3.5 3.5 0 0 1-3.5 3.5m7.43-2.53c.04-.32.07-.64.07-.97c0-.33-.03-.66-.07-1l2.11-1.63c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.31-.61-.22l-2.49 1c-.52-.4-1.06-.73-1.69-.98l-.37-2.65A.506.506 0 0 0 14 2h-4c-.25 0-.46.18-.5.42l-.37 2.65c-.63.25-1.17.59-1.69.98l-2.49-1c-.22-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64L4.57 11c-.04.34-.07.67-.07 1c0 .33.03.65.07.97l-2.11 1.66c-.19.15-.25.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1.01c.52.4 1.06.74 1.69.99l.37 2.65c.04.24.25.42.5.42h4c.25 0 .46-.18.5-.42l.37-2.65c.63-.26 1.17-.59 1.69-.99l2.49 1.01c.22.08.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.66Z" fill="#9664ff"/></svg>';
            preview.style.color = '#9664ff';
            preview.style.display = 'flex';
            preview.style.alignItems = 'center';
            preview.style.justifyContent = 'center';
        }
        
        item.appendChild(preview);
        return item;
    }
    
    selectTool(category, toolData) {
        // Hide all spacer/shape/characteristic handles when switching away from resize tool
        if (category !== 'resize') {
            if (this.spacers) {
                this.spacers.forEach(spacer => {
                    if (spacer && spacer.removeHandles) {
                        spacer.removeHandles();
                    }
                });
            }
            if (this.shapes) {
                this.shapes.forEach(shape => {
                    if (shape && shape.removeHandles) {
                        shape.removeHandles();
                    }
                });
            }
            if (this.characteristics) {
                this.characteristics.forEach(characteristic => {
                    if (characteristic && characteristic.removeHandles) {
                        characteristic.removeHandles();
                    }
                });
            }
            this.selectedSpacer = null;
            this.selectedShape = null;
            this.selectedCharacteristic = null;
        }
        
        // Clear selection indicators when switching away from move/rotate tools
        if (category !== 'move' && category !== 'rotate') {
            this.updateSelectionIndicator(null);
            this.selectedPeg = null;
            // Don't clear selectedShape/selectedCharacteristic/selectedSpacer here - they might be needed for resize tool
        }
        
        this.selectedTool = { category, ...toolData };
        
        // If resize tool is selected, show handles on already-selected objects
        if (category === 'resize') {
            if (this.selectedSpacer && this.selectedSpacer.createHandles) {
                this.selectedSpacer.createHandles();
            }
            if (this.selectedShape && this.selectedShape.createHandles) {
                this.selectedShape.createHandles();
            }
            if (this.selectedCharacteristic && this.selectedCharacteristic.createHandles) {
                this.selectedCharacteristic.createHandles();
            }
        }
        
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
        } else if (category === 'settings') {
            previewText = 'Settings Tool (Click shape to edit settings)';
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
        
        // Build level data - ALL pegs with their final world coordinates (as if hand-placed)
        // This includes pegs inside shapes - they're saved with their actual positions
        const pegsInShapes = new Set();
        if (this.shapes && this.shapes.length > 0) {
            this.shapes.forEach(shape => {
                if (shape.containedPegs) {
                    shape.containedPegs.forEach(peg => {
                        pegsInShapes.add(peg);
                    });
                }
            });
        }
        
        // Use game.pegs if available, otherwise fallback
        const allPegs = (this.game && this.game.pegs) ? this.game.pegs : [];
        const allCharacteristics = (this.game && this.game.characteristics) ? this.game.characteristics : [];
        
        const levelData = {
            name: this.currentLevelName,
            pegs: allPegs.map(peg => {
                // Find peg in placedObjects to get color
                const pegObj = this.placedObjects.find(p => {
                    if (p.category === 'peg' && peg.body && p.position) {
                        const dx = peg.body.position.x - p.position.x;
                        const dy = peg.body.position.y - p.position.y;
                        return Math.sqrt(dx * dx + dy * dy) < 0.05;
                    }
                    return false;
                });
                
                // Get rotation from mesh, fallback to 0 if undefined or NaN
                let rotation = 0;
                if (peg.mesh && peg.mesh.rotation) {
                    rotation = peg.mesh.rotation.z || 0;
                    // Ensure rotation is a valid number
                    if (isNaN(rotation)) {
                        rotation = 0;
                    }
                }
                
                return {
                    x: peg.body.position.x,
                    y: peg.body.position.y,
                    z: peg.body.position.z || 0,
                    color: pegObj ? (pegObj.color || 0x4a90e2) : 0x4a90e2,
                    type: peg.type || 'round',
                    size: peg.size || 'base',
                    rotation: rotation
                };
            }),
            characteristics: allCharacteristics.map(char => {
                // Find characteristic in placedObjects to get bounceType
                const charObj = this.placedObjects.find(c => {
                    if (c.category === 'characteristic' && char.body && c.position) {
                        const dx = char.body.position.x - c.position.x;
                        const dy = char.body.position.y - c.position.y;
                        return Math.sqrt(dx * dx + dy * dy) < 0.05;
                    }
                    return false;
                });
                
                // Get rotation from characteristic object or mesh, fallback to 0
                let rotation = 0;
                if (char.rotation !== undefined && !isNaN(char.rotation)) {
                    rotation = char.rotation;
                } else if (char.mesh && char.mesh.rotation) {
                    rotation = char.mesh.rotation.z || 0;
                    if (isNaN(rotation)) {
                        rotation = 0;
                    }
                }
                
                return {
                    x: char.body.position.x,
                    y: char.body.position.y,
                    z: char.body.position.z || 0,
                    shape: char.shape || 'rect',
                    size: char.size,
                    rotation: rotation,
                    bounceType: charObj ? (charObj.bounceType || 'normal') : (char.bounceType || 'normal')
                };
            }),
            shapes: this.shapes.map(shape => {
                // Find corresponding placed object to get saved properties
                const obj = this.placedObjects.find(o => {
                    if (o.category === 'shape' && shape.position && o.position) {
                        const dx = shape.position.x - o.position.x;
                        const dy = shape.position.y - o.position.y;
                        return Math.sqrt(dx * dx + dy * dy) < 0.05;
                    }
                    return false;
                });
                
                const shapeData = {
                    x: shape.position.x,
                    y: shape.position.y,
                    z: shape.position.z || 0,
                    type: shape.type || 'line',
                    size: shape.size,
                    align: (obj && obj.align !== undefined) ? obj.align : (shape.type === 'circle' ? undefined : shape.align || 'middle'),
                    justify: (obj && obj.justify !== undefined) ? obj.justify : (shape.type === 'circle' ? shape.justify || 'top-center' : shape.justify || 'center'),
                    gap: (obj && obj.gap !== undefined) ? obj.gap : shape.gap || 0.1,
                    rotation: shape.rotation || 0,
                    canTakeObjects: (obj && obj.canTakeObjects !== undefined) ? obj.canTakeObjects : (shape.canTakeObjects !== false)
                };
                
                // Add contained pegs if any
                if (shape.containedPegs && shape.containedPegs.length > 0) {
                    shapeData.containedPegs = shape.containedPegs.map(peg => {
                        // Find peg in placedObjects to get color
                        const pegObj = this.placedObjects.find(p => {
                            if (p.category === 'peg' && peg.body && p.position) {
                                const dx = peg.body.position.x - p.position.x;
                                const dy = peg.body.position.y - p.position.y;
                                return Math.sqrt(dx * dx + dy * dy) < 0.05;
                            }
                            return false;
                        });
                        return {
                            x: peg.body.position.x,
                            y: peg.body.position.y,
                            z: peg.body.position.z || 0,
                            color: pegObj ? (pegObj.color || '#4a90e2') : '#4a90e2',
                            type: peg.type || 'round',
                            size: peg.size || 'base',
                            rotation: peg.mesh.rotation.z || 0
                        };
                    });
                }
                
                // Add contained characteristics if any
                if (shape.containedCharacteristics && shape.containedCharacteristics.length > 0) {
                    shapeData.containedCharacteristics = shape.containedCharacteristics.map(char => {
                        // Find characteristic in placedObjects to get bounceType
                        const charObj = this.placedObjects.find(c => {
                            if (c.category === 'characteristic' && char.body && c.position) {
                                const dx = char.body.position.x - c.position.x;
                                const dy = char.body.position.y - c.position.y;
                                return Math.sqrt(dx * dx + dy * dy) < 0.05;
                            }
                            return false;
                        });
                        return {
                            x: char.body.position.x,
                            y: char.body.position.y,
                            z: char.body.position.z || 0,
                            shape: char.shape || 'rect',
                            size: char.size,
                            rotation: char.rotation || 0,
                            bounceType: charObj ? (charObj.bounceType || 'normal') : (char.bounceType || 'normal')
                        };
                    });
                }
                
                return shapeData;
            }),
            spacers: this.placedObjects.filter(obj => obj.category === 'spacer').map(obj => ({
                x: obj.position.x,
                y: obj.position.y,
                z: obj.position.z || 0,
                size: obj.size || { width: 1, height: 1 }
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

