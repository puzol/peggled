// Lucky Clover perk - every 3rd peg hit bounces ball with 75% of original shot momentum
export class LuckyClover {
    constructor() {
        this.enabled = false; // Disabled by default, enabled by green pegs
        this.hitCount = 0;
    }

    reset() {
        this.hitCount = 0;
    }

    onPegHit(ball, originalVelocity) {
        if (!this.enabled || !originalVelocity) return false;

        this.hitCount++;
        
        // Every 3rd hit triggers the lucky bounce
        if (this.hitCount % 3 === 0) {
            // Calculate original speed
            const originalSpeed = Math.sqrt(originalVelocity.x * originalVelocity.x + originalVelocity.y * originalVelocity.y);
            const bounceSpeed = originalSpeed * 0.75;
            
            // Get current ball velocity direction
            const currentVel = ball.body.velocity;
            const currentSpeed = Math.sqrt(currentVel.x * currentVel.x + currentVel.y * currentVel.y);
            
            // Normalize current direction
            if (currentSpeed > 0.01) {
                const dirX = currentVel.x / currentSpeed;
                const dirY = currentVel.y / currentSpeed;
                
                // Apply bounce in current direction with 75% of original speed
                ball.body.velocity.set(dirX * bounceSpeed, dirY * bounceSpeed, 0);
                return true;
            }
        }
        
        return false;
    }
}

