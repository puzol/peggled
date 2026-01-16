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

### Local Development

```bash
npm install
npm run dev
```

The game will be available at `http://localhost:3000` (or the IP address shown in the terminal for network access).

### Build for Production

```bash
npm run build
```

This creates a `dist/` folder with all static files ready for deployment.

### Deploy to GitHub Pages

The project is set up for automatic deployment to GitHub Pages using GitHub Actions.

1. **Enable GitHub Pages in your repository**:
   - Go to your repository on GitHub
   - Settings → Pages
   - Source: GitHub Actions
   - Save

2. **Push to trigger deployment**:
   - The workflow (`.github/workflows/deploy.yml`) will automatically build and deploy when you push to the `main` branch
   - After deployment, your game will be available at `https://[username].github.io/peggled/`

3. **Base path configuration**:
   - If your repository name is different, update `base: '/peggled/'` in `vite.config.js` to match your repo name
   - For a user site (`[username].github.io`), change `base: '/'`

**Note**: The game is fully static after building - no server needed! Vite bundles all dependencies (Three.js, Cannon.js) into static files that work in any browser.

## Architecture Decision

**Using separate components/modules** for:
- Better code organization
- Easier testing and debugging
- Reusability
- Maintainability

Each game entity is its own class that handles both Three.js rendering and physics.

