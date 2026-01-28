import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export class Peg {
    constructor(game, scene, physicsWorldWrapper, position = { x: 0, y: 0, z: 0 }, color = 0xff6b6b, pegMaterial = null, type = 'round', size = 'base', bounceType = 'normal') {
        this.game = game;
        this.scene = scene;
        this.physicsWorldWrapper = physicsWorldWrapper;
        this.color = color;
        this.hit = false;
        this.type = type; // 'round', 'rect', or 'dome'
        this.size = size; // 'small', 'base', or 'large'
        this.bounceType = bounceType; // 'normal', 'dampened', 'no-bounce', 'super-bouncy'
        
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
            // Rectangle peg - 2:1 width to height ratio, height equals round peg diameter
            // Round peg diameter = 2 * actualSize (radius), so height = 2 * actualSize
            // Use ShapeGeometry to create rectangle in XY plane (no rotation needed)
            const height = this.actualSize * 2; // Match round peg diameter (height)
            const width = height * 2; // 2:1 aspect ratio (width:height)
            const shape = new THREE.Shape();
            shape.moveTo(-width / 2, -height / 2);
            shape.lineTo(width / 2, -height / 2);
            shape.lineTo(width / 2, height / 2);
            shape.lineTo(-width / 2, height / 2);
            shape.closePath();
            geometry = new THREE.ShapeGeometry(shape);
        } else if (this.type === 'dome') {
            // Rounded-top rectangular peg - rectangle with rounded top
            // Height equals round peg diameter (2 * actualSize) to match round peg heights
            const height = this.actualSize * 2; // Match round peg diameter (height)
            const width = height * 2; // 2:1 aspect ratio (width:height)
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
        
        // Create radial gradient material
        const material = this.createRadialGradientMaterial();
        
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.set(position.x, position.y, position.z);
        
        this.scene.add(this.mesh);
    }
    
    createRadialGradientMaterial() {
        // Get bounce type color (50% outside)
        // For 'normal' bounce type, use peg color instead of gray
        let bounceColor = this.getColorForBounceType(this.bounceType);
        if (this.bounceType === 'normal') {
            bounceColor = this.color; // Use peg color for normal bounce type
        }
        // Get peg color (50% inside)
        const pegColor = this.color;
        
        // Lighten colors to compensate for shader darkening
        // Convert to RGB, lighten, then back to hex
        const lightenColor = (hexColor, factor) => {
            const r = ((hexColor >> 16) & 0xFF) * factor;
            const g = ((hexColor >> 8) & 0xFF) * factor;
            const b = (hexColor & 0xFF) * factor;
            return ((Math.min(255, r) << 16) | (Math.min(255, g) << 8) | Math.min(255, b));
        };
        
        // Lighten both colors by ~30% to compensate for shader darkening
        const lightenedBounceColor = lightenColor(bounceColor, 1.3);
        const lightenedPegColor = lightenColor(pegColor, 1.3);
        
        // Determine max distance based on peg type
        // For round pegs: maxDist = 0.5 (radius)
        // For rectangular pegs: maxDist = 0.707 (corner distance)
        const maxDist = (this.type === 'round') ? 0.5 : 0.707;
        
        // Create shader material with radial gradient
        // Convert hex numbers to proper Color objects
        const bounceColorObj = new THREE.Color();
        bounceColorObj.setHex(lightenedBounceColor);
        const pegColorObj = new THREE.Color();
        pegColorObj.setHex(lightenedPegColor);
        
        const material = new THREE.ShaderMaterial({
            uniforms: {
                bounceColor: { value: bounceColorObj },
                pegColor: { value: pegColorObj },
                transitionPoint: { value: 0.5 }, // 50% = outside, 50% = inside
                maxDist: { value: maxDist } // Max distance for this peg type
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform vec3 bounceColor;
                uniform vec3 pegColor;
                uniform float transitionPoint;
                uniform float maxDist;
                varying vec2 vUv;
                
                void main() {
                    // Calculate distance from center (0.5, 0.5) to current UV coordinate
                    vec2 center = vec2(0.5, 0.5);
                    float dist = distance(vUv, center);
                    
                    // Normalize distance: 0.0 at center, 1.0 at edge
                    float normalizedDist = dist / maxDist;
                    
                    // Clamp to 0-1 range
                    normalizedDist = clamp(normalizedDist, 0.0, 1.0);
                    
                    // Hard transition at transitionPoint (50% = 0.5)
                    // Outside (normalizedDist > 0.5): bounceColor (50% of radius)
                    // Inside (normalizedDist <= 0.5): pegColor (50% of radius)
                    vec3 finalColor = normalizedDist > transitionPoint ? bounceColor : pegColor;
                    
                    gl_FragColor = vec4(finalColor, 1.0);
                }
            `,
            side: THREE.DoubleSide
        });
        
        return material;
    }
    
    getColorForBounceType(bounceType) {
        switch (bounceType) {
            case 'dampened':
                return 0x505050; // Darker grey
            case 'no-bounce':
                return 0x202020; // Very dark grey
            case 'super-bouncy':
                return 0xb01030; // Crimson
            case 'normal':
            default:
                return 0x808080; // Regular grey
        }
    }
    
    setBounceType(bounceType) {
        this.bounceType = bounceType;
        
        // Update visual material
        if (this.mesh && this.mesh.material) {
            // Lighten color function
            const lightenColor = (hexColor, factor) => {
                const r = ((hexColor >> 16) & 0xFF) * factor;
                const g = ((hexColor >> 8) & 0xFF) * factor;
                const b = (hexColor & 0xFF) * factor;
                return ((Math.min(255, r) << 16) | (Math.min(255, g) << 8) | Math.min(255, b));
            };
            
            if (this.mesh.material.uniforms) {
                // For 'normal' bounce type, use peg color instead of gray
                let bounceColor = this.getColorForBounceType(bounceType);
                if (bounceType === 'normal') {
                    bounceColor = this.color; // Use peg color for normal bounce type
                }
                // Lighten colors to compensate for shader darkening
                const lightenedBounceColor = lightenColor(bounceColor, 1.3);
                const lightenedPegColor = lightenColor(this.color, 1.3);
                
                this.mesh.material.uniforms.bounceColor.value.setHex(lightenedBounceColor);
                this.mesh.material.uniforms.pegColor.value.setHex(lightenedPegColor);
            } else {
                // If material doesn't have uniforms, recreate it as shader
                const oldMaterial = this.mesh.material;
                this.mesh.material = this.createRadialGradientMaterial();
                if (oldMaterial.dispose) {
                    oldMaterial.dispose();
                }
            }
        }
        
        // Update physics material
        if (this.body) {
            const newMaterial = this.physicsWorldWrapper.getPegMaterial(bounceType);
            this.body.material = newMaterial;
            if (this.body.userData) {
                this.body.userData.bounceType = bounceType;
            }
        }
    }

    createPhysicsBody(position, pegMaterial) {
        // Always use bounce type material - ignore provided pegMaterial to ensure correct bounce behavior
        const material = this.physicsWorldWrapper.getPegMaterial(this.bounceType);
        
        this.body = new CANNON.Body({
            mass: 0, // Static body
            material: material
        });
        
        // Store bounce type in userData
        this.body.userData = this.body.userData || {};
        this.body.userData.bounceType = this.bounceType;
        
        if (this.type === 'round') {
            // Use sphere for round pegs
            // Validate size to prevent invalid spheres
            const radius = Math.max(0.001, this.actualSize); // Ensure minimum radius
            const shape = new CANNON.Sphere(radius);
            this.body.addShape(shape);
        } else if (this.type === 'rect') {
            // Use box for rectangular pegs
            // Height equals round peg diameter (2 * actualSize) to match round peg heights
            const height = this.actualSize * 2; // Match round peg diameter (height)
            const width = height * 2; // 2:1 aspect ratio (width:height)
            // Box half extents: [halfWidth, halfHeight, halfDepth]
            // For 2D game with camera looking down +Z, box should be flat in XY plane
            // Use larger depth (0.1) to ensure reliable collision detection
            const shape = new CANNON.Box(new CANNON.Vec3(width / 2, height / 2, 0.1));
            this.body.addShape(shape);
        } else if (this.type === 'dome') {
            // Dome peg: rounded profile + blunt top, flat bottom, extruded in Z
            const height = this.actualSize * 2;
            const width  = height * 2;      // 2:1 aspect
            const depth  = 0.15;
            const z      = depth / 2;

            const halfWidth  = width / 2;
            const halfHeight = height / 2;

            const topY    =  halfHeight;
            const bottomY = -halfHeight;

            // Controls
            const topFlatFrac = 0.28;             // bluntness of top (0.2–0.35 feels good)
            const cornerYFrac = 0.25;             // where the curve starts (0.15–0.35)
            const arcSegments = 6;                // higher = smoother (4–10)

            // Derived
            const topFlatHalf = halfWidth * topFlatFrac;
            const cornerY     = bottomY + height * (0.5 + cornerYFrac * 0.5); 
            // Alternative, if you prefer your existing definition:
            // const cornerY = halfHeight * cornerYFrac;

            // ---- Build 2D profile (front face) in CCW order ----
            // Order: bottom-left -> bottom-right -> right vertical -> (arc up) -> top flat -> (arc down) -> left vertical
            const profile = [];

            // Bottom (flat)
            profile.push([-halfWidth, bottomY]);
            profile.push([ halfWidth, bottomY]);

            // Right vertical up to cornerY (keeps “flat-face” behavior for most of the side)
            profile.push([ halfWidth, cornerY]);

            // Rounded arc from right vertical to top flat corner
            // Use a quarter-ellipse arc that ends at (topFlatHalf, topY)
            {
            const rx = halfWidth - topFlatHalf; // horizontal radius of the rounded shoulder
            const ry = topY - cornerY;          // vertical radius

            // Add intermediate arc points (exclude endpoints to avoid duplicates)
            for (let i = 1; i < arcSegments; i++) {
                const a = (i / arcSegments) * (Math.PI / 2); // 0..pi/2
                const x = topFlatHalf + rx * Math.cos(a);    // goes halfWidth -> topFlatHalf
                const y = cornerY     + ry * Math.sin(a);    // goes cornerY  -> topY
                profile.push([x, y]);
            }
            }

            // Top flat (blunt)
            profile.push([ topFlatHalf, topY]);
            profile.push([-topFlatHalf, topY]);

            // Left arc down from top flat to left vertical at cornerY
            {
            const rx = halfWidth - topFlatHalf;
            const ry = topY - cornerY;

            for (let i = arcSegments - 1; i >= 1; i--) {
                const a = (i / arcSegments) * (Math.PI / 2); // pi/2..0
                const x = -(topFlatHalf + rx * Math.cos(a));
                const y =  cornerY     + ry * Math.sin(a);
                profile.push([x, y]);
            }
            }

            // Left vertical down to cornerY
            profile.push([-halfWidth, cornerY]);

            // ---- Convert profile to 3D vertices (extruded) ----
            const vertices = [];
            for (const [x, y] of profile) vertices.push(new CANNON.Vec3(x, y,  z));
            const frontVertexCount = vertices.length;

            const backVertexStart = frontVertexCount;
            for (let i = 0; i < frontVertexCount; i++) {
            const v = vertices[i];
            vertices.push(new CANNON.Vec3(v.x, v.y, -z));
            }

            // ---- Faces ----
            const faces = [];

            // Front face (CCW when viewed from +Z)
            faces.push([...Array(frontVertexCount).keys()]);

            // Back face (CCW when viewed from -Z) => reverse
            faces.push(
            [...Array(frontVertexCount).keys()]
                .map(i => backVertexStart + i)
                .reverse()
            );

            // Side faces (quads)
            for (let i = 0; i < frontVertexCount; i++) {
            const next = (i + 1) % frontVertexCount;
            faces.push([
                i,
                backVertexStart + i,
                backVertexStart + next,
                next
            ]);
            }

            try {
            const convexShape = new CANNON.ConvexPolyhedron({ vertices, faces });

            // These help after programmatic convex creation
            convexShape.updateBoundingSphereRadius?.();
            this.body.addShape(convexShape);
            this.body.updateBoundingRadius?.();
            this.body.aabbNeedsUpdate = true;

            this.createConvexPolyhedronWireframe(vertices, faces);
            } catch (error) {
            console.error('Error creating ConvexPolyhedron for dome peg:', error);
            console.warn('Falling back to box shape for dome peg');
            const boxShape = new CANNON.Box(new CANNON.Vec3(width / 2, height / 2, depth / 2));
            this.body.addShape(boxShape);
            }

        } else {
            // Default to sphere
            const shape = new CANNON.Sphere(this.actualSize);
            this.body.addShape(shape);
        }
        
        this.body.position.set(position.x, position.y, position.z);
        this.physicsWorldWrapper.addBody(this.body);
    }

    // Create wireframe visualization for ConvexPolyhedron (for debugging)
    createConvexPolyhedronWireframe(vertices, faces) {
        const points = [];
        
        // Add edges from faces - each face's perimeter
        faces.forEach(face => {
            for (let i = 0; i < face.length; i++) {
                const v1 = vertices[face[i]];
                const v2 = vertices[face[(i + 1) % face.length]];
                points.push(new THREE.Vector3(v1.x, v1.y, v1.z));
                points.push(new THREE.Vector3(v2.x, v2.y, v2.z));
            }
        });
        
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        
        const material = new THREE.LineBasicMaterial({
            color: 0x00ff00, // Green wireframe
            linewidth: 1
        });
        
        this.wireframe = new THREE.LineSegments(geometry, material);
        // Attach wireframe as child of mesh so it follows position and rotation
        this.mesh.add(this.wireframe);
        this.wireframe.position.set(0, 0, 0); // Relative to parent mesh
    }

    // Called when ball hits the peg
    onHit(ball) {
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
            
            // Update material color
            if (this.mesh.material && this.mesh.material.uniforms) {
                // Shader material - lighten and update the peg color (inside 50%)
                const lightenColor = (hexColor, factor) => {
                    const r = ((hexColor >> 16) & 0xFF) * factor;
                    const g = ((hexColor >> 8) & 0xFF) * factor;
                    const b = (hexColor & 0xFF) * factor;
                    return ((Math.min(255, r) << 16) | (Math.min(255, g) << 8) | Math.min(255, b));
                };
                const lightenedColor = lightenColor(newColor, 1.3);
                this.mesh.material.uniforms.pegColor.value.setHex(lightenedColor);
                
                // Also update bounce color if it's normal (since normal uses peg color)
                if (this.bounceType === 'normal') {
                    this.mesh.material.uniforms.bounceColor.value.setHex(lightenedColor);
                }
            } else {
                // Fallback for non-shader materials
                this.mesh.material.color.setHex(newColor);
            }

            // Play peg hit sound
            if (this.game.audioManager) {
                this.game.audioManager.playPegHit();
            }
            
            // Check for orange peg (goal progress) - only on first hit by ANY ball
            if (this.isOrange) {
                this.game.goalProgress++;
                this.game.updateGoalUI();
                this.game.updateOrangePegMultiplier();
            }
            if (this.isGreen) {
                this.game.activePower.onGreenPegHit(this);
            }

            if(this.isPurple) {
                this.game.assignPurplePeg();
            }

            if (this.size === 'small') {
                const pegIndex = this.game.pegs.indexOf(this);
                if (pegIndex !== -1) {
                    this.remove();
                    this.game.pegs.splice(pegIndex, 1);
                    // Remove from ball's hitPegs array if present
                    const ballPegIndex = ball.hitPegs.indexOf(this);
                    if (ballPegIndex !== -1) {
                        ball.hitPegs.splice(ballPegIndex, 1);
                    }
                    // Skip rest of peg hit logic since peg is removed
                    return;
                }
            }

            this.game.activePower.onPegHit(this, null);
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
        // Update material color
        if (this.mesh.material && this.mesh.material.uniforms) {
            // Shader material - lighten and update the peg color (inside 50%)
            const lightenColor = (hexColor, factor) => {
                const r = ((hexColor >> 16) & 0xFF) * factor;
                const g = ((hexColor >> 8) & 0xFF) * factor;
                const b = (hexColor & 0xFF) * factor;
                return ((Math.min(255, r) << 16) | (Math.min(255, g) << 8) | Math.min(255, b));
            };
            const lightenedColor = lightenColor(originalColor, 1.3);
            this.mesh.material.uniforms.pegColor.value.setHex(lightenedColor);
            
            // Also update bounce color if it's normal (since normal uses peg color)
            if (this.bounceType === 'normal') {
                this.mesh.material.uniforms.bounceColor.value.setHex(lightenedColor);
            }
        } else {
            // Fallback for non-shader materials
            this.mesh.material.color.setHex(originalColor);
        }
    }

    remove() {
        // Remove magnet visual if it exists
        if (this.magnetMesh) {
            this.scene.remove(this.magnetMesh);
            this.magnetMesh.geometry.dispose();
            this.magnetMesh.material.dispose();
            this.magnetMesh = null;
        }
        
        // Remove wireframe if it exists
        if (this.wireframe) {
            this.scene.remove(this.wireframe);
            this.wireframe.geometry.dispose();
            this.wireframe.material.dispose();
            this.wireframe = null;
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

