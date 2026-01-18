// Entry point for the Peggle clone game
import { Game } from './Game.js';

// Initialize the game when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Show level editor button only on localhost
    const levelEditorButton = document.getElementById('level-editor-button');
    if (levelEditorButton && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
        levelEditorButton.style.display = 'block';
    }
    
    const gameContainer = document.getElementById('game-container');
    const game = new Game(gameContainer);
    // Game will start after character selection
    // setupCharacterSelector() is called in constructor
});

