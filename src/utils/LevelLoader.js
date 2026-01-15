export class LevelLoader {
    /**
     * Load a level from a JSON file
     * @param {string} levelPath - Path to the level JSON file
     * @returns {Promise<Object>} Level data with pegs array
     */
    static async loadLevel(levelPath) {
        try {
            const response = await fetch(levelPath);
            if (!response.ok) {
                throw new Error(`Failed to load level: ${response.statusText}`);
            }
            const levelData = await response.json();
            return levelData;
        } catch (error) {
            console.error('Error loading level:', error);
            throw error;
        }
    }

    /**
     * Convert hex color string to number
     * @param {string} hexColor - Hex color string (e.g., "#ff6b6b")
     * @returns {number} Color as number (e.g., 0xff6b6b)
     */
    static hexToNumber(hexColor) {
        // Remove # if present and convert to number
        return parseInt(hexColor.replace('#', ''), 16);
    }

    /**
     * Validate level data structure
     * @param {Object} levelData - Level data to validate
     * @returns {boolean} True if valid
     */
    static validateLevel(levelData) {
        if (!levelData || !Array.isArray(levelData.pegs)) {
            console.error('Invalid level data: missing pegs array');
            return false;
        }

        // Validate each peg has required fields
        for (const peg of levelData.pegs) {
            if (typeof peg.x !== 'number' || typeof peg.y !== 'number') {
                console.error('Invalid peg: missing x or y coordinates');
                return false;
            }
        }

        return true;
    }
}

