// Seeded Random Number Generator using Mulberry32 algorithm
export class SeededRNG {
    constructor(seed) {
        this.seed = seed || Date.now();
        this.state = this.seed;
    }
    
    // Mulberry32 algorithm - fast and good quality
    next() {
        this.state = (this.state + 0x6D2B79F5) | 0;
        let t = Math.imul(this.state ^ (this.state >>> 15), this.state | 1);
        t = t ^ (t + Math.imul(t ^ (t >>> 7), t | 61));
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    
    // Generate random integer between min (inclusive) and max (exclusive)
    randomInt(min, max) {
        return Math.floor(this.next() * (max - min)) + min;
    }
    
    // Generate random float between min (inclusive) and max (exclusive)
    randomFloat(min, max) {
        return this.next() * (max - min) + min;
    }
    
    // Shuffle array using Fisher-Yates algorithm
    shuffle(array) {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = this.randomInt(0, i + 1);
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }
    
    // Reset to initial seed
    reset() {
        this.state = this.seed;
    }
    
    // Set new seed
    setSeed(seed) {
        this.seed = seed;
        this.state = seed;
    }
}

