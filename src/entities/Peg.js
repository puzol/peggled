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
            // Dome peg: Use ConvexPolyhedron with 6 vertices (hexagon) for better collision
            // Height equals round peg diameter (2 * actualSize) to match round peg heights
            const height = this.actualSize * 2; // Match round peg diameter (height)
            const width = height * 2; // 2:1 aspect ratio (width:height)
            const depth = 0.15; // Slightly thicker depth for better collision reliability (was 0.1)
            const z = depth / 2; // Front face z position
            
            // Create 6 vertices forming a symmetrical hexagon dome:
            // - Bottom: flat (2 vertices at same Y)
            // - Left side: flat vertical (2 vertices at same X)
            // - Top: flat horizontal (2 vertices at same Y, for flat top face)
            // - 2 corner faces connect top to sides
            const vertices = [];
            
            // Define symmetrical dimensions
            const halfWidth = width / 2;
            const halfHeight = height / 2;
            const topY = halfHeight; // Flat top Y position
            const cornerY = halfHeight * 0.25; // Where corner transition starts (lowered to make sides shorter)
            const bottomY = -halfHeight; // Flat bottom Y position
            
            // Vertex order (CCW when viewed from front):
            // 0: Bottom left
            vertices.push(new CANNON.Vec3(-halfWidth, bottomY, z));
            // 1: Bottom right
            vertices.push(new CANNON.Vec3(halfWidth, bottomY, z));
            // 2: Right side top (vertical side continues to corner)
            vertices.push(new CANNON.Vec3(halfWidth, cornerY, z));
            // 3: Top right (flat top face starts)
            vertices.push(new CANNON.Vec3(halfWidth * 0.6, topY, z));
            // 4: Top left (flat top face ends)
            vertices.push(new CANNON.Vec3(-halfWidth * 0.6, topY, z));
            // 5: Left side top (vertical side continues to corner)
            vertices.push(new CANNON.Vec3(-halfWidth, cornerY, z));
            
            const frontVertexCount = vertices.length; // 6 vertices
            
            // Create back face vertices (z = -depth/2) - same XY coordinates
            const backVertexStart = frontVertexCount;
            for (let i = 0; i < frontVertexCount; i++) {
                const frontVert = vertices[i];
                vertices.push(new CANNON.Vec3(frontVert.x, frontVert.y, -z));
            }
            
            // Define faces - vertices must be CCW when viewed from outside
            // For ConvexPolyhedron: face normals point outward (use right-hand rule)
            const faces = [];
            
            // Front face (z = +depth/2): 6 vertices in CCW order when viewed from +Z (outside)
            // Order: 0 (bottom-left) -> 1 (bottom-right) -> 2 (right-side-top) -> 3 (top-right) -> 4 (top-left) -> 5 (left-side-top)
            faces.push([0, 1, 2, 3, 4, 5]);
            
            // Back face (z = -depth/2): 6 vertices in CCW order when viewed from -Z (outside)
            // Reverse order for back face (CCW from -Z side)
            faces.push([backVertexStart + 0, backVertexStart + 5, backVertexStart + 4, backVertexStart + 3, backVertexStart + 2, backVertexStart + 1]);
            
            // Side faces: For each edge, create a quad face
            // The quad must be CCW when viewed from outside (perpendicular to the edge)
            // For an edge going from vertex i to next, the outside is to the left of the direction
            // Try: i -> backI -> backNext -> next (this forms a CCW quad from outside)
            for (let i = 0; i < frontVertexCount; i++) {
                const next = (i + 1) % frontVertexCount;
                faces.push([
                    i,                      // Current front
                    backVertexStart + i,    // Current back
                    backVertexStart + next, // Next back
                    next                    // Next front
                ]);
            }
            
            // Create ConvexPolyhedron shape
            try {
                const convexShape = new CANNON.ConvexPolyhedron({ vertices, faces });
                this.body.addShape(convexShape);
                
                // Create wireframe visualization for debugging
                this.createConvexPolyhedronWireframe(vertices, faces);
            } catch (error) {
                console.error('Error creating ConvexPolyhedron for dome peg:', error);
                // Fallback to simple box to allow level to load
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

