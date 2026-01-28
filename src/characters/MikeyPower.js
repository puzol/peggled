import * as THREE from 'three';

/**
 * Mikey, the man in the mirror - Mirror Ball Power
 * On green peg hit: grants a power move
 * Power: Mirror Ball - shoots 2 balls: white ball and ethereal mirror ball
 * Mirror ball reflects white ball's path along X-axis and triggers pegs in mirrored positions
 */
export class MikeyPower {
    constructor(game) {
        this.game = game;
        this.powerActive = false;
        this.powerCount = 0;
    }
    
    /* 
        * Standard Event list for all Power classes:
    */

    onInit(){
        return;
    }

    onBallShot(){
        return;
    }

    ballInPlay(){
        return;
    }

    onGreenPegHit(peg) {
        this.powerCount += 2;
        this.updatePowerTurnsUI();
    }

    onBallOutOfPlay() {
        return;
    }

    onLevelComplete(){
        this.powerActive = false;
        this.powerCount = 0;
        this.updatePowerTurnsUI();
    }

    onReset(){
        return;
    }

    update(){
        return;
    }

    onAnimate(currentTime, deltaTime){
        return;
    }
    
    updatePowerTurnsUI() {
        
        if (this.game.powerTurnsElement) {
            this.game.powerTurnsElement.textContent = `Power: ${this.powerCount}`;
        }
    }
    
    reset() {
        // Power state is managed by Game.js
    }
}

