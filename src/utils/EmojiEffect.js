import * as THREE from 'three';

// Utility for displaying emoji effects that fade out
export class EmojiEffect {
    constructor(scene, camera, renderer) {
        this.scene = scene;
        this.camera = camera;
        this.renderer = renderer;
        this.activeEffects = [];
    }

    // Show an emoji at a world position that fades out over time
    showEmoji(emoji, worldPosition, duration = 0.5) {
        // Create a canvas texture with the emoji
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const context = canvas.getContext('2d');
        
        // Set font size and style
        context.font = '96px Arial';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        
        // Draw emoji
        context.fillText(emoji, 64, 64);
        
        // Create texture from canvas
        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;
        
        // Create sprite material
        const spriteMaterial = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            opacity: 1.0
        });
        
        // Create sprite
        const sprite = new THREE.Sprite(spriteMaterial);
        sprite.position.set(worldPosition.x, worldPosition.y, worldPosition.z || 0);
        sprite.scale.set(0.5, 0.5, 1); // Scale the sprite
        
        // Add to scene
        this.scene.add(sprite);
        
        // Store effect data
        const effect = {
            sprite: sprite,
            material: spriteMaterial,
            startTime: performance.now() / 1000, // Convert to seconds
            duration: duration,
            startOpacity: 1.0
        };
        
        this.activeEffects.push(effect);
        
        return effect;
    }

    // Update all active effects (call this in the game loop)
    update(currentTime) {
        const timeInSeconds = currentTime / 1000;
        
        // Update and remove faded effects
        this.activeEffects = this.activeEffects.filter(effect => {
            const elapsed = timeInSeconds - effect.startTime;
            const progress = elapsed / effect.duration;
            
            if (progress >= 1.0) {
                // Effect is done, remove it
                this.scene.remove(effect.sprite);
                effect.material.dispose();
                effect.sprite.material.map.dispose();
                return false;
            }
            
            // Fade out
            effect.material.opacity = effect.startOpacity * (1 - progress);
            
            return true;
        });
    }

    // Clean up all effects
    dispose() {
        this.activeEffects.forEach(effect => {
            this.scene.remove(effect.sprite);
            effect.material.dispose();
            if (effect.sprite.material.map) {
                effect.sprite.material.map.dispose();
            }
        });
        this.activeEffects = [];
    }
}

