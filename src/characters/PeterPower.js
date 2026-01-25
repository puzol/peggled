import { EmojiEffect } from '../utils/EmojiEffect.js';

/**
 * Peter the Leprechaun - Lucky Clover Power
 * On green peg hit: activates lucky clover power for 3 turns
 * Every 3rd peg hit bounces the ball with 25% of original shot momentum and generates a purple peg
 * When power is active: hitting purple peg will activate and reposition it
 */
export class PeterPower {
    constructor(game) {
        this.game = game;
        // Track which pegs have already triggered lucky bounce for current 3-hit cycle
        this.luckyBounceTriggeredPegs = new Set();
        this.powerActive = false;
        this.powerCount = 0;
        this.luckyBounceCount = 0;
        this.luckyBounceTarget = 3;
        this.emojiEffect = null;
        this.temporaryPurplePegs = [];
    }

    /* 
        * Standard Event list for all Power classes:
    */

    onInit(){
        this.emojiEffect = new EmojiEffect(this.game.scene, this.game.camera, this.game.renderer);
    }

    onBallShot(){
        if(this.powerCount > 0){
            this.powerActive = true;
        } else {
            this.powerActive = false;
        }

        if(this.powerCount > 0){
            this.powerCount--;
            this.updatePowerTurnsUI();
        }
    }

    onPegHit(peg, ball){
        this.luckyBounceCount++;

        if(this.powerActive && peg.hit == false) {
            if(this.luckyBounceCount % this.luckyBounceTarget == 0){
                this.emojiEffect.showEmoji('🍀', { x: peg.body.position.x, y: peg.body.position.y, z: peg.body.position.z || 0 }, 0.5);
                // this.luckyBounce(ball);
            }

            if(peg.isPurple){
                console.log('is purple');
            }
        }
    }
    
    onGreenPegHit(peg) {
        this.powerCount += 3;
        this.updatePowerTurnsUI();
        // this.game.updatePowerDisplay();
        
        // Show clover emoji at peg position
        // let pegPos = peg.body.position;
        if (this.emojiEffect) {
            this.emojiEffect.showEmoji('🍀', { x: peg.body.position.x, y: peg.body.position.y, z: peg.body.position.z || 0 }, 0.5);
        }
    }

    onBallOutOfPlay(){
        this.luckyBounceCount = 0;
    }

    onLevelComplete(){
        this.powerActive = false;
        this.powerCount = 0;
        this.updatePowerTurnsUI();
    }

    onReset(){
        console.log('PeterPower: onReset called');
        return;
    }

    update(){
        return;
    }

    onAnimate(currentTime, deltaTime){
        if (this.emojiEffect) {
            this.emojiEffect.update(currentTime);
        }
    }
    
    updatePowerTurnsUI() {
        
        if (this.game.powerTurnsElement) {
            this.game.powerTurnsElement.textContent = `Power: ${this.powerCount}`;
        }
    }

    /**
     * Handle peg hit during lucky clover - check if it's the 3rd hit
     * Returns true if lucky bounce was applied
     */
    luckyBounce(ball){
        const currentVel = ball.body.velocity;
        const currentSpeed = Math.sqrt(currentVel.x * currentVel.x + currentVel.y * currentVel.y);
            
        const normalizedX = currentVel.x / currentSpeed;
        const normalizedY = currentVel.y / currentSpeed;
        const bounceSpeed = 5.5;
        
        ball.body.velocity.set(normalizedX * bounceSpeed, normalizedY * bounceSpeed, 0);
    }
    
    /**
     * Generate a temporary purple peg (only lasts for current turn)
     */
    generateTemporaryPurplePeg() {
        // Find all blue pegs (not orange, not green, not hit, not already purple)
        const bluePegs = this.game.pegs.filter(peg => 
            !peg.isOrange && 
            !peg.isGreen && 
            !peg.hit &&
            !peg.isPurple
        );
        
        if (bluePegs.length === 0) {
            // No blue pegs available
            return;
        }
        
        // Randomly select one blue peg to be purple (using seeded RNG)
        const randomIndex = this.game.rng.randomInt(0, bluePegs.length);
        const newPurplePeg = bluePegs[randomIndex];
        newPurplePeg.isPurple = true;
        newPurplePeg.pointValue = 1500; // Purple peg value
        
        // Change color to purple (lighter purple for default state) - update shader uniforms
        newPurplePeg.color = 0xba55d3; // Update stored color
        if (newPurplePeg.mesh.material && newPurplePeg.mesh.material.uniforms) {
            // Lighten color to compensate for shader darkening
            const lightenColor = (hexColor, factor) => {
                const r = ((hexColor >> 16) & 0xFF) * factor;
                const g = ((hexColor >> 8) & 0xFF) * factor;
                const b = (hexColor & 0xFF) * factor;
                return ((Math.min(255, r) << 16) | (Math.min(255, g) << 8) | Math.min(255, b));
            };
            const lightenedColor = lightenColor(0xba55d3, 1.3);
            newPurplePeg.mesh.material.uniforms.pegColor.value.setHex(lightenedColor);
            // Also update bounce color if it's normal (since normal uses peg color)
            if (newPurplePeg.bounceType === 'normal') {
                newPurplePeg.mesh.material.uniforms.bounceColor.value.setHex(lightenedColor);
            }
        }
        
        // Add to temporary purple pegs array
        this.game.temporaryPurplePegs.push(newPurplePeg);
    }

    /**
     * Reset power state
     */
    reset() {
        // Power state is managed by Game.js
        // Clear lucky bounce tracking for new ball
        this.luckyBounceTriggeredPegs.clear();
    }
}

