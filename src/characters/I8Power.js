import * as THREE from 'three';
import * as CANNON from 'cannon-es';

/**
 * The i8 - "I Ate" Power
 * On peg hit: ball "eats" the peg, increasing in size by the peg's height
 * When ball exceeds 3x original size: explodes, hitting pegs in 1.5 radius
 * Explosion sets ball velocity: y=8, x=5 (preserving x direction)
 */
export class I8Power {
    constructor(game) {
        this.game = game;
        this.ballOriginalScale = this.game.ballRadius;
        this.ballTargetScale = this.ballOriginalScale;
        this.ballCurrentScale = this.ballOriginalScale;
        this.explosionRadius = 1.5;
        // this.specialPegs = ['purple', 'green', 'orange']; // Peg colors that don't contribute to size
        this.specialPegIncrease = 0.065; // Smize increase for special pegs (orange, purple, green)
        this.regularPegIncrease = 0.035; // Size increase for regular pegs
        this.powerActive = false;
        this.powerCount = 0;
        this.explosionYVelocity = 8;
        this.explosionXVelocity = 5;
        this.ballGrowthRate = 0.3 // per second
        this.ballScaleThreshold = this.ballOriginalScale * 3;
        this.ballIsInPlay = false;
    }

    onInit(){
        return
    }

    onBallShot(){

        if(this.powerCount > 0){
            this.powerActive = true;
        } else {
            this.powerActive = false;
            this.ballTargetScale = this.ballOriginalScale;
        }

        if(this.powerCount > 0){
            this.powerCount--;
            this.updatePowerTurnsUI();
        }
    }

    ballInPlay(){
        this.ballIsInPlay = true;
        console.log('Ball in play', this.ballIsInPlay, this.powerActive);
    }

    onPegHit(peg, ball){
        
        if(this.powerActive && peg.hit == false) {
            if(peg.isGreen || peg.isOrange || peg.isPurple){                 
                this.ballTargetScale += this.specialPegIncrease;
                console.log('Special peg hit, special size increase.');
            }else{
                this.ballTargetScale += this.regularPegIncrease;
                console.log('Regular peg hit, regular size increase.');
            }
        }
    }

    onGreenPegHit(peg) {
        this.powerCount += 2;
        this.updatePowerTurnsUI();
    }

    onBallOutOfPlay() {
        this.ballIsInPlay = false;
        this.ballTargetScale = this.ballOriginalScale;
    }

    onLevelComplete() {
        return;
    }

    onReset() {
        return;
    }

    update() {
        return;
    }

    onAnimate(currentTime, deltaTime) {
        if (this.ballInPlay && this.powerActive) {
            console.log('Updating ball scale...', 'ball in play', this.game.balls[0].ballRadius);
        }
    }
    
    explode() {
        const ballPos = this.game.ball.body.position;
        this.game.pegs.forEach(peg => {
            if (!peg.hit) {
                const dist = ballPos.distanceTo(peg.body.position);
                if (dist <= this.explosionRadius) {
                    console.log('Peg hit by explosion:', peg);
                }
            }
        });
        
        // Set velocity
        const velX = this.game.balls[0].body.velocity.x >= 0 ? this.explosionXVelocity : -this.explosionXVelocity;
        this.game.balls[0].body.velocity.set(velX, this.explosionYVelocity, 0);

        // Reset target to original after explosion
        this.ballTargetScale = this.ballOriginalScale;
        console.log('Explosion triggered!');
    }
    
    updatePowerTurnsUI() {
        
        if (this.game.powerTurnsElement) {
            this.game.powerTurnsElement.textContent = `Power: ${this.powerCount}`;
        }
    }

    reset(){
        return;
    }
}

