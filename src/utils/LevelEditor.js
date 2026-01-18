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
            
            // Add listeners with capture phase (true = capture phase)
            this.game.canvas.addEventListener('mousemove', this._mousemoveHandler, true);
            this.game.canvas.addEventListener('click', this._clickHandler, true);
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
        
        // Update preview if tool is selected
        if (this.selectedTool) {
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
        
        // Don't place if clicking inside modal
        const modal = document.getElementById('level-editor-modal');
        if (modal && modal.contains(event.target)) {
            console.log('Click inside modal, ignoring');
            return;
        }
        
        // Prevent game's click handler from processing this click
        event.stopPropagation();
        event.preventDefault();
        
        console.log('Placing object at:', this.mouseWorldPos);
        // Place object at current mouse position
        this.placeObject(this.mouseWorldPos.x, this.mouseWorldPos.y);
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
        
        const tool = this.selectedTool;
        let geometry;
        
        if (tool.category === 'peg') {
            if (tool.type === 'round') {
                // Round peg preview
                const radius = this.pegSizes[tool.size] || this.pegSizes.base;
                geometry = new THREE.CircleGeometry(radius, 16);
            } else if (tool.type === 'rect') {
                // Rectangular peg preview
                const height = this.pegSizes[tool.size] || this.pegSizes.base;
                const width = height * 2; // 2:1 ratio
                geometry = new THREE.PlaneGeometry(width, height);
            } else if (tool.type === 'dome') {
                // Dome peg preview (simplified as rounded rectangle)
                const height = this.pegSizes[tool.size] || this.pegSizes.base;
                const width = height * 2;
                geometry = new THREE.PlaneGeometry(width, height);
            } else {
                return; // Unknown peg type
            }
        } else {
            // For other categories, create a simple circle preview for now
            geometry = new THREE.CircleGeometry(0.1, 16);
        }
        
        const material = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.5,
            side: THREE.DoubleSide,
            depthWrite: false // Prevent z-fighting
        });
        
        this.previewMesh = new THREE.Mesh(geometry, material);
        this.previewMesh.visible = false;
        this.previewMesh.position.z = 0.01; // Slightly above pegs to ensure visibility
        this.previewMesh.renderOrder = 999; // Render on top
        
        // Rotate plane geometry to face camera (for 2D view, rotate -90 degrees around X axis)
        if (tool.category === 'peg' && (tool.type === 'rect' || tool.type === 'dome')) {
            this.previewMesh.rotation.x = -Math.PI / 2;
        }
        
        this.game.scene.add(this.previewMesh);
        console.log('Preview mesh created:', this.previewMesh);
    }
    
    placeObject(worldX, worldY) {
        if (!this.selectedTool || !this.game) return;
        
        const tool = this.selectedTool;
        
        if (tool.category === 'peg') {
            this.placePeg(worldX, worldY, tool);
        } else if (tool.category === 'shape') {
            // TODO: Implement shape placement
            console.log('Shape placement not yet implemented');
        } else if (tool.category === 'static') {
            // TODO: Implement static object placement
            console.log('Static object placement not yet implemented');
        } else if (tool.category === 'spacer') {
            // TODO: Implement spacer placement
            console.log('Spacer placement not yet implemented');
        }
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
            
            console.log('Creating peg at:', { x: roundedX, y: roundedY, z: 0 });
            
            const peg = new Peg(
                this.game.scene,
                this.game.physicsWorld,
                { x: roundedX, y: roundedY, z: 0 },
                baseColor,
                pegMaterial
            );
            
            peg.pointValue = 300;
            peg.isOrange = false;
            peg.isGreen = false;
            peg.isPurple = false;
            
            // TODO: Apply size and shape based on tool.type and tool.size
            // For now, all pegs are created as base round pegs
            
            this.game.pegs.push(peg);
            console.log('Peg created, total pegs:', this.game.pegs.length, 'Peg mesh:', peg.mesh);
            
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
    
    initUI() {
        // Get UI elements
        this.editorButton = document.getElementById('level-editor-button');
        this.editorOverlay = document.getElementById('level-editor-overlay');
        this.editorClose = document.getElementById('level-editor-close');
        this.editorNew = document.getElementById('level-editor-new');
        this.editorLoad = document.getElementById('level-editor-load');
        this.editorSave = document.getElementById('level-editor-save');
        this.editorTest = document.getElementById('level-editor-test');
        this.editorCloseFooter = document.getElementById('level-editor-close-footer');
        this.fileInput = document.getElementById('level-editor-file-input');
        
        // Set up event listeners
        if (this.editorButton) {
            this.editorButton.addEventListener('click', () => this.openEditor());
        }
        
        if (this.editorClose) {
            this.editorClose.addEventListener('click', () => this.closeEditor());
        }
        
        if (this.editorCloseFooter) {
            this.editorCloseFooter.addEventListener('click', () => this.closeEditor());
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
        if (this.editorOverlay) {
            this.editorOverlay.addEventListener('click', (e) => {
                if (e.target === this.editorOverlay) {
                    this.closeEditor();
                }
            });
        }
        
        // Initialize toolbars
        this.initPegsToolbar();
        this.initShapesToolbar();
        this.initStaticToolbar();
        this.initSpacersToolbar();
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
        }
        
        item.appendChild(preview);
        return item;
    }
    
    selectTool(category, toolData) {
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
    
    openEditor() {
        if (this.editorOverlay) {
            this.editorOverlay.classList.add('active');
            this.isActive = true;
            this.testingMode = false;
            
            // Hide character selector
            if (this.game && this.game.hideCharacterSelector) {
                this.game.hideCharacterSelector();
            }
            
            // Clear level and create blank level
            this.newLevel();
            
            // Update test button text
            this.updateTestButton();
        }
    }
    
    closeEditor() {
        if (this.editorOverlay) {
            this.editorOverlay.classList.remove('active');
            // Keep isActive true if tool is selected (for placement)
            // If no tool selected, deactivate editor
            if (!this.selectedTool) {
                this.isActive = false;
                this.hidePreview();
            } else {
                // Tool is selected, explicitly keep active for placement
                this.isActive = true;
                // Ensure preview mesh is created for selected tool
                if (this.selectedTool && this.game && this.game.scene) {
                    if (!this.previewMesh) {
                        this.createPreviewMesh();
                    }
                }
            }
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
        
        // Store current pegs data for restoration (positions, colors, etc.)
        // Store as serializable data, not references
        this.originalPegs = this.game.pegs.map(peg => {
            const position = peg.body.position;
            return {
                x: position.x,
                y: position.y,
                z: position.z,
                color: peg.color || 0x4a90e2
            };
        });
        
        // Close modal but keep editor active state (we're still editing, just testing)
        if (this.editorOverlay) {
            this.editorOverlay.classList.remove('active');
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
                    const peg = new Peg(
                        this.game.scene,
                        this.game.physicsWorld,
                        { x: pegData.x, y: pegData.y, z: pegData.z || 0 },
                        pegData.color,
                        pegMaterial
                    );
                    
                    peg.pointValue = 300;
                    peg.isOrange = false;
                    peg.isGreen = false;
                    peg.isPurple = false;
                    
                    this.game.pegs.push(peg);
                });
            });
        }
        
        // Reopen modal
        if (this.editorOverlay) {
            this.editorOverlay.classList.add('active');
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
    
    newLevel() {
        // Clear all placed objects
        this.placedObjects = [];
        this.undoStack = [];
        this.redoStack = [];
        
        // Clear all pegs from the game scene
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
        
        console.log('New blank level created');
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
        // TODO: Save level to git-ignored directory
        const levelData = {
            name: 'Custom Level',
            pegs: this.placedObjects.filter(obj => obj.category === 'peg').map(obj => ({
                x: obj.position.x,
                y: obj.position.y,
                color: obj.color || '#4a90e2'
            }))
        };
        
        // For now, just log - will implement file save later
        console.log('Level data to save:', levelData);
    }
}

