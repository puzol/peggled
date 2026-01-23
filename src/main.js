// Entry point for the Peggle clone game
import { Game } from './Game.js';

// Initialize the game when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Display build version (timestamp injected at build time)
    const buildVersionElement = document.getElementById('build-version');
    if (buildVersionElement && typeof __BUILD_TIMESTAMP__ !== 'undefined') {
        buildVersionElement.textContent = `v${__BUILD_TIMESTAMP__}`;
    }
    
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
    
    // Mobile fullscreen handling - hide URL bar
    const handleMobileFullscreen = () => {
        // Prevent default touch behaviors that might show URL bar
        document.addEventListener('touchstart', (e) => {
            if (e.touches.length > 1) {
                e.preventDefault(); // Prevent pinch zoom
            }
        }, { passive: false });
        
        document.addEventListener('touchmove', (e) => {
            if (e.touches.length > 1) {
                e.preventDefault(); // Prevent pinch zoom
            }
        }, { passive: false });
        
        // Try to enter fullscreen on first user interaction
        const enterFullscreen = () => {
            // Check if we're on mobile
            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
            if (!isMobile) return;
            
            // Try to scroll to hide URL bar (works on some browsers)
            window.scrollTo(0, 1);
            
            // Try Fullscreen API (works on some browsers)
            if (document.documentElement.requestFullscreen) {
                document.documentElement.requestFullscreen().catch(() => {
                    // Fullscreen not available or denied
                });
            } else if (document.documentElement.webkitRequestFullscreen) {
                document.documentElement.webkitRequestFullscreen();
            } else if (document.documentElement.mozRequestFullScreen) {
                document.documentElement.mozRequestFullScreen();
            } else if (document.documentElement.msRequestFullscreen) {
                document.documentElement.msRequestFullscreen();
            }
        };
        
        // Enter fullscreen on first touch/click
        let fullscreenAttempted = false;
        const attemptFullscreen = () => {
            if (!fullscreenAttempted) {
                fullscreenAttempted = true;
                enterFullscreen();
            }
        };
        
        document.addEventListener('touchstart', attemptFullscreen, { once: true });
        document.addEventListener('click', attemptFullscreen, { once: true });
        
        // Also try on orientation change
        window.addEventListener('orientationchange', () => {
            setTimeout(() => {
                window.scrollTo(0, 1);
            }, 100);
        });
    };
    
    handleMobileFullscreen();
    
    const gameContainer = document.getElementById('game-container');
    const game = new Game(gameContainer);
    // Game will start after character selection
    // setupCharacterSelector() is called in constructor
});

