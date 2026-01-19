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
    }

    /**
     * Handle green peg hit - activate lucky clover power
     */
    onGreenPegHit(peg) {
        // Just add power turns - power activates on shot, not on green peg hit
        this.game.powerTurnsRemaining += 3;
        this.game.updatePowerTurnsUI();
        this.game.updatePowerDisplay();
        
        // Show clover emoji at peg position
        const pegPos = peg.body.position;
        if (this.game.emojiEffect) {
            this.game.emojiEffect.showEmoji('🍀', { x: pegPos.x, y: pegPos.y, z: pegPos.z || 0 }, 0.5);
        }
    }

    /**
     * Handle peg hit during lucky clover - check if it's the 3rd hit
     * Returns true if lucky bounce was applied
     */
    handleLuckyCloverBounce(ball, peg) {
        // Check if lucky clover is enabled (either via luckyClover.enabled or luckyCloverEnabled flag)
        if (!this.game.luckyClover || (!this.game.luckyClover.enabled && !this.game.luckyCloverEnabled)) {
            return false;
        }

        const hitCount = ball.hitPegs.length; // Total hits including this one
        const isLuckyHit = hitCount % 3 === 0;

        if (isLuckyHit) {
            // Check if this peg has already triggered lucky bounce for this 3-hit cycle
            const pegId = `${peg.body.position.x}_${peg.body.position.y}`;
            if (this.luckyBounceTriggeredPegs.has(pegId)) {
                return false; // Already triggered for this peg in this cycle
            }
            
            // Every 3rd hit is lucky - use flat bounce velocity 
            // Use current direction but set speed to flat value
            const currentVel = ball.body.velocity;
            const currentSpeed = Math.sqrt(currentVel.x * currentVel.x + currentVel.y * currentVel.y);
            
            if (currentSpeed > 0) {
                // Preserve direction, set speed to 6.5
                const normalizedX = currentVel.x / currentSpeed;
                const normalizedY = currentVel.y / currentSpeed;
                const bounceSpeed = 6.5;
                
                ball.body.velocity.set(normalizedX * bounceSpeed, normalizedY * bounceSpeed, 0);
                
                // Mark this peg as having triggered lucky bounce
                this.luckyBounceTriggeredPegs.add(pegId);

                // Show clover emoji at peg position
                const pegPos = peg.body.position;
                if (this.game.emojiEffect) {
                    this.game.emojiEffect.showEmoji('🍀', { x: pegPos.x, y: pegPos.y, z: pegPos.z || 0 }, 0.5);
                }
                
                // Generate a new temporary purple peg on lucky bounce
                this.generateTemporaryPurplePeg();
                
                return true;
            }
        }
        return false;
    }

    /**
     * Handle lucky clover for already hit pegs (when ball bounces back)
     */
    handleLuckyCloverBounceAlreadyHit(ball, peg) {
        // Check if lucky clover is enabled (either via luckyClover.enabled or luckyCloverEnabled flag)
        if (!this.game.luckyClover || (!this.game.luckyClover.enabled && !this.game.luckyCloverEnabled)) {
            return false;
        }

        const hitCount = ball.hitPegs.length;
        if (hitCount % 3 === 0) {
            // Check if this peg has already triggered lucky bounce for this 3-hit cycle
            const pegId = `${peg.body.position.x}_${peg.body.position.y}`;
            if (this.luckyBounceTriggeredPegs.has(pegId)) {
                return false; // Already triggered for this peg in this cycle
            }
            
            // Use flat bounce velocity (10)
            // Use current direction but set speed to flat value
            const currentVel = ball.body.velocity;
            const currentSpeed = Math.sqrt(currentVel.x * currentVel.x + currentVel.y * currentVel.y);
            
            if (currentSpeed > 0) {
                // Preserve direction, set speed to 10
                const normalizedX = currentVel.x / currentSpeed;
                const normalizedY = currentVel.y / currentSpeed;
                const bounceSpeed = 10;
                
                ball.body.velocity.set(normalizedX * bounceSpeed, normalizedY * bounceSpeed, 0);
                
                // Mark this peg as having triggered lucky bounce
                this.luckyBounceTriggeredPegs.add(pegId);

                const pegPos = peg.body.position;
                if (this.game.emojiEffect) {
                    this.game.emojiEffect.showEmoji('🍀', { x: pegPos.x, y: pegPos.y, z: pegPos.z || 0 }, 0.5);
                }
                
                // Generate a new temporary purple peg on lucky bounce
                this.generateTemporaryPurplePeg();
                
                return true;
            }
        }
        return false;
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
        
        // Change color to purple (lighter purple for default state)
        newPurplePeg.mesh.material.color.setHex(0xba55d3); // Lighter purple
        
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

