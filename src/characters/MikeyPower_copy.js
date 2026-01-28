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
    }

    /**
     * Handle green peg hit - add mirror ball power to queue
     */
    onGreenPegHit(peg) {
        // Power turns are already added in Game.js (1 turn per green peg)
        // This method is called to match the pattern of other character powers
    }

    /**
     * Create ghost ball visual (mirrored ball with reduced opacity)
     */
    createGhostBallVisual(whiteBall) {
        // Create a visual-only ghost ball that mirrors the white ball
        const geometry = new THREE.CircleGeometry(0.1, 16);
        const material = new THREE.MeshBasicMaterial({
            color: 0xffffff, // White
            transparent: true,
            opacity: 0.6
        });
        
        const ghostMesh = new THREE.Mesh(geometry, material);
        ghostMesh.position.set(-whiteBall.body.position.x, whiteBall.body.position.y, whiteBall.body.position.z || 0);
        
        this.game.scene.add(ghostMesh);
        
        // Store ghost ball reference on white ball
        whiteBall.ghostMesh = ghostMesh;
        whiteBall.isMirrorBall = true;
    }

    /**
     * Update ghost ball position to mirror white ball
     */
    updateGhostBall(whiteBall) {
        if (whiteBall.ghostMesh && whiteBall.body) {
            // Mirror position along X-axis
            whiteBall.ghostMesh.position.set(
                -whiteBall.body.position.x,
                whiteBall.body.position.y,
                whiteBall.body.position.z || 0
            );
        }
    }

    /**
     * Check if ghost ball passes through pegs and trigger them
     */
    checkGhostBallPegCollisions(whiteBall) {
        if (!whiteBall.ghostMesh || !whiteBall.body) return;
        
        const ghostPos = whiteBall.ghostMesh.position;
        const whitePos = whiteBall.body.position;
        
        // Get previous position (from last frame)
        if (!whiteBall.lastGhostPos) {
            whiteBall.lastGhostPos = { x: ghostPos.x, y: ghostPos.y };
            return;
        }
        
        // Check line intersection from last position to current position
        const pegs = this.game.pegs;
        const ballRadius = 0.1;
        
        for (const peg of pegs) {
            if (peg.hit || !peg.body) continue;
            
            const pegPos = peg.body.position;
            const pegRadius = 0.15; // Approximate peg radius
            
            // Check if ghost ball path intersects with peg
            const distToLine = this.distancePointToLineSegment(
                pegPos.x, pegPos.y,
                whiteBall.lastGhostPos.x, whiteBall.lastGhostPos.y,
                ghostPos.x, ghostPos.y
            );
            
            if (distToLine <= ballRadius + pegRadius) {
                // Ghost ball passed through this peg - trigger it using spike collision handler
                this.game.handleSpikePegCollision({
                    hitPegs: [],
                    parentBall: whiteBall
                }, peg);
            }
        }
        
        // Update last position
        whiteBall.lastGhostPos = { x: ghostPos.x, y: ghostPos.y };
    }

    /**
     * Calculate distance from a point to a line segment
     */
    distancePointToLineSegment(px, py, x1, y1, x2, y2) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const lengthSq = dx * dx + dy * dy;
        
        if (lengthSq === 0) {
            // Line segment is a point
            const distX = px - x1;
            const distY = py - y1;
            return Math.sqrt(distX * distX + distY * distY);
        }
        
        const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSq));
        const projX = x1 + t * dx;
        const projY = y1 + t * dy;
        
        const distX = px - projX;
        const distY = py - projY;
        return Math.sqrt(distX * distX + distY * distY);
    }

    /**
     * Reset power state
     */
    reset() {
        // Power state is managed by Game.js
    }
}

