// Entry point for the Peggle clone game
import { Game } from './Game.js';

// Initialize the game when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Show level editor button only on localhost
    const levelEditorButton = document.getElementById('level-editor-button');
    const objectsButton = document.getElementById('objects-button');
    const hostname = window.location.hostname;
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
    
    if (levelEditorButton) {
        levelEditorButton.style.display = isLocalhost ? 'block' : 'none';
    }
    
    // Objects button should be hidden initially (only shows after level is created)
    if (objectsButton) {
        objectsButton.style.display = 'none';
    }
    
    const gameContainer = document.getElementById('game-container');
    const game = new Game(gameContainer);
    // Game will start after character selection
    // setupCharacterSelector() is called in constructor
});

