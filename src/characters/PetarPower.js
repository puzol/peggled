/**
 * Petar the Leprechaun - Lucky Clover Power
 * On green peg hit: activates lucky clover power for 3 turns
 * Every 3rd peg hit bounces the ball with 75% of original shot momentum
 */
export class PetarPower {
    constructor(game) {
        this.game = game;
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
            // Every 3rd hit is lucky
            const originalVel = ball.originalVelocity;
            if (originalVel) {
                const bounceVelX = originalVel.x * 0.75;
                const bounceVelY = originalVel.y * 0.75;
                const bounceVelZ = originalVel.z * 0.75;

                // Round bounce velocity
                const roundedVX = this.game.roundToDecimals(bounceVelX);
                const roundedVY = this.game.roundToDecimals(bounceVelY);
                const roundedVZ = this.game.roundToDecimals(bounceVelZ);

                ball.body.velocity.set(roundedVX, roundedVY, roundedVZ);

                // Show clover emoji at peg position
                const pegPos = peg.body.position;
                if (this.game.emojiEffect) {
                    this.game.emojiEffect.showEmoji('🍀', { x: pegPos.x, y: pegPos.y, z: pegPos.z || 0 }, 0.5);
                }
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
            const originalVel = ball.originalVelocity;
            if (originalVel) {
                const bounceVelX = originalVel.x * 0.75;
                const bounceVelY = originalVel.y * 0.75;
                const bounceVelZ = originalVel.z * 0.75;

                const roundedVX = this.game.roundToDecimals(bounceVelX);
                const roundedVY = this.game.roundToDecimals(bounceVelY);
                const roundedVZ = this.game.roundToDecimals(bounceVelZ);

                ball.body.velocity.set(roundedVX, roundedVY, roundedVZ);

                const pegPos = peg.body.position;
                if (this.game.emojiEffect) {
                    this.game.emojiEffect.showEmoji('🍀', { x: pegPos.x, y: pegPos.y, z: pegPos.z || 0 }, 0.5);
                }
                return true;
            }
        }
        return false;
    }

    /**
     * Reset power state
     */
    reset() {
        // Power state is managed by Game.js
    }
}

