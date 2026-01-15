# Peggle Clone - Three.js

A Three.js implementation of the classic Peggle game.

## Project Structure

```
peggled/
├── index.html
├── levels/
│   └── level1.json       # Level data (peg positions)
├── src/
│   ├── main.js           # Entry point, initializes game
│   ├── Game.js           # Main game controller
│   ├── entities/
│   │   ├── Ball.js       # Ball physics and rendering
│   │   ├── Peg.js        # Peg entity (lights up when hit)
│   │   ├── Bucket.js     # Bucket that catches balls
│   │   └── Cannon.js     # Ball launcher/cannon
│   ├── physics/
│   │   └── PhysicsWorld.js # Physics engine setup (Cannon.js)
│   ├── utils/
│   │   ├── LevelLoader.js # Loads level data from JSON
│   │   ├── constants.js  # Game constants
│   │   └── helpers.js    # Utility functions
│   └── scenes/
│       └── GameScene.js  # Three.js scene setup
└── package.json
```

## Level Format

Levels are stored as JSON files in the `levels/` directory. Each level file contains:

```json
{
  "name": "Level 1",
  "pegs": [
    { "x": -4, "y": 3, "color": "#ff6b6b" },
    { "x": 0, "y": 0, "color": "#4ecdc4" }
  ]
}
```

- `name`: Level name (optional, for display)
- `pegs`: Array of peg objects
  - `x`, `y`: World coordinates (camera view is -6 to 6 in X, -4.5 to 4.5 in Y)
  - `color`: Hex color string (optional, defaults to red #ff6b6b)

## Setup

```bash
npm install
npm run dev
```

## Architecture Decision

**Using separate components/modules** for:
- Better code organization
- Easier testing and debugging
- Reusability
- Maintainability

Each game entity is its own class that handles both Three.js rendering and physics.

