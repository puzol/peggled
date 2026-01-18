/**
 * John the Gunner - Roulette Power
 * On green peg hit: triggers a roulette with 3 random powers
 * Powers: Spread Shot, Rapid Shot, or Explosion
 */
export class JohnPower {
    constructor(game) {
        this.game = game;
    }

    /**
     * Handle green peg hit - trigger roulette
     */
    onGreenPegHit(peg) {
        if (typeof this.game.triggerRoulette === 'function') {
            this.game.triggerRoulette();
        }
    }

    /**
     * Handle shot with active power
     * Returns true if power was consumed
     */
    handleShot(spawnX, spawnY, spawnZ, targetX, targetY, originalVelocity) {
        if (!this.game.selectedCharacter || this.game.selectedCharacter.id !== 'john') {
            return false;
        }

        if (!this.game.selectedPower) {
            return false;
        }

        if (this.game.selectedPower === 'spread') {
            // Spread shot: 3 balls at +15°, 0°, -15°
            this.game.spawnSpreadShot(spawnX, spawnY, spawnZ, targetX, targetY);
            this.game.consumePower(); // Consume power from queue
            return true;
        } else if (this.game.selectedPower === 'rapid') {
            // Rapid shot: initial shot + 2 more in succession
            // Only decrement ball count once
            this.game.ballsRemaining--;
            this.game.updateBallsRemainingUI();

            // Fire initial shot (white ball)
            this.game.spawnBall(spawnX, spawnY, spawnZ, originalVelocity, originalVelocity, false);

            // Queue 2 more shots (yellow balls)
            if (!this.game.rapidShotQueue) {
                this.game.rapidShotQueue = [];
            }
            this.game.rapidShotQueue.push({
                spawnX, spawnY, spawnZ,
                targetX, targetY,
                originalVelocity
            });
            this.game.rapidShotQueue.push({
                spawnX, spawnY, spawnZ,
                targetX, targetY,
                originalVelocity
            });
            this.game.lastRapidShotTime = performance.now() / 1000;
            this.game.consumePower(); // Consume power from queue
            return true;
        } else if (this.game.selectedPower === 'explosion') {
            // Explosion: spawn bomb
            this.game.spawnBomb(spawnX, spawnY, spawnZ, originalVelocity);
            this.game.consumePower(); // Consume power from queue
            return true;
        }

        return false;
    }

    /**
     * Reset power state
     */
    reset() {
        this.game.gamePaused = false;
        this.game.rouletteActive = false;
        this.game.selectedPower = null;
        this.game.rouletteQueue = []; // Clear roulette queue
        this.game.rapidShotQueue = [];
        this.game.lastRapidShotTime = 0;
    }
}

