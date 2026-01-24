# Character Power Architecture

## Overview

This document describes the new modular, event-based architecture for character powers in the Peggled game. This architecture replaces the previous approach where character logic was scattered throughout `Game.js`, making the codebase difficult to maintain and extend.

## Problems with the Old Approach

### 1. **Character Logic in Game.js**
- Character checks were scattered throughout the codebase (e.g., `if (this.selectedCharacter?.id === 'peter')`)
- Game.js became bloated with character-specific conditionals
- Adding a new character required modifying multiple sections of Game.js

### 2. **Power Initialization Issues**
- All character powers were initialized at game startup, even when not selected
- This wasted memory and processing resources
- Powers were stored as separate properties (e.g., `this.peterPower`, `this.johnPower`, etc.)
- No unified interface for power management

### 3. **Inconsistent Communication**
- No standardized way for Game.js to communicate with character powers
- Each character had different method signatures and behaviors
- Difficult to track which events triggered which character behaviors

## New Architecture Principles

### 1. **Single Active Power Instance**
- Only one power is instantiated at a time: `this.activePower`
- Power is created when a character is selected, not at game startup
- Power is destroyed/recreated when switching characters

### 2. **Event-Based Communication**
- Game.js communicates with powers through standardized event methods
- Powers respond to game events, not the other way around
- Clean separation of concerns: Game.js handles game logic, powers handle character-specific behavior

### 3. **Standardized Interface**
- All character powers implement the same base event methods
- Optional methods can be implemented as needed
- Consistent method signatures across all characters

## Standard Event Methods

All character power classes must implement these base methods:

### `onInit()`
Called when the power is first initialized (after character selection).

**When called:** After `new CharacterPower(game)` is instantiated

**Purpose:** Set up initial state, create UI elements, initialize timers, etc.

**Example:**
```javascript
onInit() {
    this.padActive = false;
    this.timerSeconds = 15;
    // Initialize any required state
}
```

### `onBallShot(params)`
Called when a ball is shot by the player.

**When called:** Before ball spawning, after shot calculation

**Parameters:**
```javascript
{
    spawnX: number,
    spawnY: number,
    spawnZ: number,
    originalVelocity: CANNON.Vec3,
    targetX: number,
    targetY: number
}
```

**Purpose:** Modify shot behavior, spawn multiple balls, override ball spawning, etc.

**Return value:** Optional. Can set `this.overrideSpawnBall = true` to prevent default ball spawning.

**Example:**
```javascript
onBallShot(params) {
    // Modify shot parameters
    // Or spawn custom balls
    // Or set overrideSpawnBall = true to handle spawning manually
}
```

### `onPegHit(ball, peg)`
Called when a ball collides with a peg.

**When called:** During collision handling, after basic collision physics

**Parameters:**
- `ball`: The ball object that hit the peg
- `peg`: The peg object that was hit

**Purpose:** Modify collision behavior, track peg hits, trigger special effects

**Return value:** Optional boolean. Return `true` to skip normal peg processing, `false` to continue.

**Example:**
```javascript
onPegHit(ball, peg) {
    // Track peg hits
    // Modify ball behavior
    // Return true to prevent normal peg processing
    return false; // Continue normal processing
}
```

### `onGreenPegHit(peg)`
Called when a green peg is hit.

**When called:** During collision handling, specifically for green pegs

**Parameters:**
- `peg`: The green peg that was hit

**Purpose:** Activate character powers, grant power turns, trigger special abilities

**Example:**
```javascript
onGreenPegHit(peg) {
    // Activate power
    this.activatePad();
    // Or grant power turns
    this.game.powerTurnsRemaining += 1;
}
```

### `onBallOutOfPlay(ball)`
Called when a ball goes out of bounds or is removed.

**When called:** When ball is removed from play (out of bounds, timeout, etc.)

**Parameters:**
- `ball`: The ball that went out of play

**Purpose:** Clean up ball-specific state, trigger effects, update power state

**Example:**
```javascript
onBallOutOfPlay(ball) {
    // Clean up ball-specific data
    // Update power state
    // Trigger effects
}
```

### `onLevelComplete()`
Called when the level is completed.

**When called:** After all orange pegs are cleared

**Purpose:** Clean up level-specific state, save progress, trigger animations

**Example:**
```javascript
onLevelComplete() {
    // Clean up timers
    // Save state
    // Trigger effects
}
```

### `onReset()`
Called when the game is reset or a new level starts.

**When called:** When starting a new level or resetting the game

**Purpose:** Reset all power state to initial values, clean up resources

**Example:**
```javascript
onReset() {
    this.padActive = false;
    this.timerSeconds = 15;
    // Reset all state
}
```

## Power Initialization Flow

### Character Selection
1. User selects a character from the character selector
2. `Game.js` creates a new instance: `this.activePower = new character.power(this)`
3. `onInit()` is called (if implemented)
4. Character is stored: `this.selectedCharacter = character`

### Game Start
1. `startGame()` is called
2. Game initializes (level loading, physics, etc.)
3. Power can access game state through `this.game` reference

### During Gameplay
- Game.js calls power event methods at appropriate times
- Power responds to events and modifies game behavior
- Power can access game state but should not directly modify core game logic

## Communication Pattern

### Game.js → Power
Game.js calls power methods when events occur:

```javascript
// In Game.js
if (this.activePower) {
    this.activePower.onBallShot(params);
}

if (this.activePower) {
    this.activePower.onPegHit(ball, peg);
}

if (peg.isGreen && this.activePower) {
    this.activePower.onGreenPegHit(peg);
}
```

### Power → Game.js
Powers access game state through `this.game`:

```javascript
// In Power class
this.game.score += points;
this.game.powerTurnsRemaining += 1;
this.game.updateScoreUI();
this.game.spawnBall(x, y, z, velocity);
```

**Important:** Powers should use game methods and properties, not directly manipulate internal state unless necessary.

## Implementation Guidelines

### 1. **Keep Game.js Clean**
- No character-specific conditionals in Game.js
- Use `this.activePower` to delegate to character logic
- Game.js should only know about the active power, not individual characters

### 2. **Standardize Method Signatures**
- All event methods should have consistent signatures
- Use objects for complex parameters
- Return values should be consistent (boolean for skip/continue, etc.)

### 3. **Handle Missing Methods Gracefully**
- Game.js should check if methods exist before calling
- Powers can implement only the methods they need
- Use optional chaining: `this.activePower?.onPegHit(ball, peg)`

### 4. **State Management**
- Powers should manage their own state
- Don't store power state in Game.js
- Use `onReset()` to clean up state

### 5. **Performance**
- Only instantiate the active power
- Clean up resources in `onReset()` or destructor
- Avoid expensive operations in event handlers

## Example: Arkanoid Power

```javascript
export class ArkanoidPower {
    constructor(game) {
        this.game = game;
        this.padActive = false;
        this.timerSeconds = 15;
        this.overrideSpawnBall = false;
    }

    onInit() {
        // Initialize pad state
        this.padActive = false;
    }

    onBallShot(params) {
        // Check if pad should activate
        if (this.queuedActivation) {
            this.activatePad();
        }
    }

    onPegHit(ball, peg) {
        // Handle pad bounce logic
        if (this.padActive && this.isPadBounce(ball)) {
            this.handlePadBounce(ball);
        }
    }

    onGreenPegHit(peg) {
        // Activate pad on green peg hit
        if (!this.padActive) {
            this.activatePad();
        } else {
            // Extend timer if already active
            this.timerSeconds += this.baseTimerValue;
        }
    }

    onBallOutOfPlay(ball) {
        // Clean up ball-specific state
    }

    onLevelComplete() {
        // Clean up pad
        this.deactivatePad();
    }

    onReset() {
        // Reset all state
        this.padActive = false;
        this.timerSeconds = 15;
        this.deactivatePad();
    }
}
```

## Adding a New Character

### Step 1: Create Power Class
Create a new file: `src/characters/NewCharacterPower.js`

```javascript
export class NewCharacterPower {
    constructor(game) {
        this.game = game;
        // Initialize state
    }

    // Implement required event methods
    onInit() { }
    onBallShot(params) { }
    onPegHit(ball, peg) { }
    onGreenPegHit(peg) { }
    onBallOutOfPlay(ball) { }
    onLevelComplete() { }
    onReset() { }
}
```

### Step 2: Add to Character List
In `Game.js`, add to `this.characters` array:

```javascript
{
    id: 'newcharacter',
    name: 'New Character Name',
    powerName: 'Power Name',
    power: NewCharacterPower,
    powerDescription: 'Description of the power'
}
```

### Step 3: Import Power Class
Add import at top of `Game.js`:

```javascript
import { NewCharacterPower } from './characters/NewCharacterPower.js';
```

### Step 4: Implement Character Logic
Implement the event methods with character-specific behavior. No changes needed in Game.js beyond the character list!

## Migration Notes

### From Old to New
- Old: `if (this.selectedCharacter?.id === 'peter') { ... }`
- New: `this.activePower.onGreenPegHit(peg)`

- Old: `this.peterPower = new PeterPower(this)` (in constructor)
- New: `this.activePower = new character.power(this)` (on selection)

- Old: Character logic scattered in Game.js
- New: All character logic in power class files

### Preserving Old Code
The old `Game.js` is preserved as `_old_Game.js` for reference when migrating character logic.

## Benefits

1. **Maintainability**: Character logic is isolated and easy to find
2. **Extensibility**: Adding new characters requires minimal changes to Game.js
3. **Performance**: Only active power is instantiated
4. **Testability**: Powers can be tested independently
5. **Readability**: Clear separation of concerns
6. **Consistency**: Standardized interface across all characters

## Future Enhancements

- Power inheritance/base class for common functionality
- Power configuration system (JSON-based character definitions)
- Power event system (powers can emit events to Game.js)
- Power state serialization for save/load
- Power analytics (track which powers are used most)

