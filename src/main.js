// Entry point for the Peggle clone game
import { Game } from './Game.js';

// Initialize the game when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const gameContainer = document.getElementById('game-container');
    const game = new Game(gameContainer);
    // Game will start after character selection
    // setupCharacterSelector() is called in constructor
});

