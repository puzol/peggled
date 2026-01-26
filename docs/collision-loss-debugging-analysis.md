# Collision Loss Debugging Analysis

## Problem Description

The ball loses collision with **ALL objects** (not just the one hit) and loses velocity. This suggests a fundamental issue with the physics body state, not just a single collision detection problem.

## ChatGPT's Debugging Suggestion

Log these ball body properties when collision loss occurs:

```javascript
console.log({
  pos: ball.body.position,
  vel: ball.body.velocity,
  quat: ball.body.quaternion,
  type: ball.body.type,
  sleepState: ball.body.sleepState,
  collisionResponse: ball.body.collisionResponse,
  group: ball.body.collisionFilterGroup,
  mask: ball.body.collisionFilterMask,
});
```

## Analysis of Each Property

### 1. `ball.body.position`
**What to check**: Is the ball in a valid position? Has it teleported?
- **Potential issue**: If position becomes NaN or invalid, physics engine might disable the body
- **Check**: `isNaN(ball.body.position.x)` or extreme values

### 2. `ball.body.velocity`
**What to check**: Has velocity been zeroed or set to invalid values?
- **Potential issue**: Zero velocity might cause body to sleep (even with `allowSleep = false`)
- **Potential issue**: NaN velocity would break physics calculations
- **Check**: `ball.body.velocity.length()` - if it's 0 or NaN, that's the problem

### 3. `ball.body.quaternion`
**What to check**: Has rotation become invalid?
- **Potential issue**: Invalid quaternion could cause physics engine to disable body
- **Check**: Quaternion should be normalized (length ~1.0)

### 4. `ball.body.type`
**What to check**: Has body type changed from `CANNON.Body.DYNAMIC`?
- **Potential issue**: If type changes to `STATIC` or `KINEMATIC`, body stops responding to physics
- **Expected**: Should always be `CANNON.Body.DYNAMIC` (value: 1)
- **Check**: `ball.body.type !== CANNON.Body.DYNAMIC`

### 5. `ball.body.sleepState`
**What to check**: Is the body sleeping?
- **Potential issue**: Even with `allowSleep = false`, body might sleep if velocity is zero
- **Expected**: Should be `0` (awake) or `1` (sleepy) but not `2` (sleeping)
- **Check**: `ball.body.sleepState === 2` means body is sleeping

### 6. `ball.body.collisionResponse`
**What to check**: Has collision response been disabled?
- **Potential issue**: If set to `false`, body won't collide with anything
- **Expected**: Should always be `true`
- **Check**: `ball.body.collisionResponse === false`
- **Note**: Game.js already has safety checks for this, but they might not catch it in time

### 7. `ball.body.collisionFilterGroup`
**What to check**: Has collision group been changed?
- **Potential issue**: If group is set to a value that doesn't match any objects, no collisions occur
- **Expected**: Should match the collision filter setup (usually `-1` for default)
- **Check**: Compare with other bodies' collisionFilterMask

### 8. `ball.body.collisionFilterMask`
**What to check**: Has collision mask been changed?
- **Potential issue**: If mask is `0`, body won't collide with anything
- **Expected**: Should allow collisions with pegs, walls, etc.
- **Check**: `ball.body.collisionFilterMask === 0`

## Root Cause Hypotheses

Based on the codebase analysis, here are the most likely causes:

### Hypothesis 1: Shape Removal/Addition Issues (I8Power)
**Location**: `I8Power.js` - `updateBallSize()`

**Problem**: When ball size changes, we do:
```javascript
ball.body.removeShape(oldShape);
ball.body.addShape(newShape);
ball.body.updateMassProperties();
```

**Potential issues**:
- If `removeShape` fails or shape is already removed, body might be in invalid state
- If `addShape` happens before `removeShape` completes, body might have multiple shapes
- `updateMassProperties()` might reset some body state
- Timing issue: shape change during physics step could cause corruption

**Evidence**: This happens during size animation, which is frequent

### Hypothesis 2: Body Going to Sleep
**Location**: Multiple places

**Problem**: Even with `allowSleep = false`, Cannon.js might still put body to sleep if:
- Velocity becomes zero (or very low)
- Body is stationary for a frame
- Physics engine thinks body is at rest

**Evidence**: If velocity is lost, body might appear "sleeping" to physics engine

### Hypothesis 3: Invalid Physics State After Size Change
**Location**: `I8Power.js` - `updateBallSize()`

**Problem**: After changing shape:
- Bounding radius might be incorrect
- Mass properties might be wrong
- Body might need to be re-added to world
- Collision bounds might not update properly

**Evidence**: `updateBoundingRadius()` is called, but might not be enough

### Hypothesis 4: Collision Filter Corruption
**Location**: Unknown

**Problem**: Collision filters might be getting modified somewhere:
- Accidentally set to 0
- Group/mask mismatch
- Filter changed during shape update

**Evidence**: Would explain why ball stops colliding with EVERYTHING

### Hypothesis 5: Body Type Change
**Location**: Unknown

**Problem**: Body type might be changing from DYNAMIC:
- Accidentally set to STATIC
- Set to KINEMATIC
- Type property corrupted

**Evidence**: Would cause complete physics shutdown

## Debugging Strategy

### Step 1: Add Comprehensive Logging
Add the ChatGPT-suggested logging in these locations:

1. **Before/after `updateBallSize()` in I8Power.js**
   - Log state before shape change
   - Log state after shape change
   - Compare to detect what changed

2. **In Game.js collision handler**
   - Log state when collision is detected
   - Log state when collision is lost

3. **In Game.js main loop (before physics step)**
   - Log state of all balls
   - Detect when state becomes invalid

### Step 2: Add State Validation
Create a validation function:

```javascript
validateBallState(ball) {
  const issues = [];
  
  if (!ball.body) {
    issues.push('Body is null');
    return issues;
  }
  
  // Check position
  if (isNaN(ball.body.position.x) || isNaN(ball.body.position.y)) {
    issues.push('Position is NaN');
  }
  
  // Check velocity
  if (isNaN(ball.body.velocity.x) || isNaN(ball.body.velocity.y)) {
    issues.push('Velocity is NaN');
  }
  if (ball.body.velocity.length() === 0) {
    issues.push('Velocity is zero');
  }
  
  // Check type
  if (ball.body.type !== CANNON.Body.DYNAMIC) {
    issues.push(`Body type is ${ball.body.type}, expected DYNAMIC`);
  }
  
  // Check sleep state
  if (ball.body.sleepState === 2) {
    issues.push('Body is sleeping');
  }
  
  // Check collision response
  if (ball.body.collisionResponse === false) {
    issues.push('Collision response is disabled');
  }
  
  // Check collision filters
  if (ball.body.collisionFilterMask === 0) {
    issues.push('Collision filter mask is 0');
  }
  
  return issues;
}
```

### Step 3: Add Safety Checks
Add defensive checks in critical places:

1. **After shape changes in I8Power**:
   ```javascript
   // After updateBallSize
   ball.body.wakeUp();
   ball.body.collisionResponse = true;
   ball.body.type = CANNON.Body.DYNAMIC;
   ball.body.allowSleep = false;
   ```

2. **Before physics step**:
   ```javascript
   // Validate all balls before physics update
   this.balls.forEach(ball => {
     const issues = this.validateBallState(ball);
     if (issues.length > 0) {
       console.error('Ball state issues:', issues, ball);
       // Attempt to fix
       this.fixBallState(ball);
     }
   });
   ```

### Step 4: Investigate Shape Change Timing
The shape change in `updateBallSize()` happens during animation, which could be:
- During a physics step
- Between physics steps
- During collision detection

**Suggestion**: Ensure shape changes happen at safe times:
- Only between physics steps
- Or pause physics during shape change
- Or use a queue to defer shape changes

## Specific Suggestions

### Suggestion 1: Safer Shape Updates
Instead of removing/adding shapes, consider:
- Creating a new body and transferring state
- Or using a shape pool
- Or ensuring shape change happens only when safe

### Suggestion 2: Force Body State After Size Change
After `updateBallSize()`, explicitly set all critical properties:
```javascript
ball.body.wakeUp();
ball.body.collisionResponse = true;
ball.body.type = CANNON.Body.DYNAMIC;
ball.body.allowSleep = false;
// Re-validate collision filters
// Force velocity if it's zero
if (ball.body.velocity.length() < 0.01) {
  // Restore previous velocity or apply minimum
}
```

### Suggestion 3: Add Collision Filter Safety
Ensure collision filters are never modified:
```javascript
// In Ball.js constructor, store original filters
this.originalCollisionGroup = this.body.collisionFilterGroup;
this.originalCollisionMask = this.body.collisionFilterMask;

// In safety check, restore if changed
if (ball.body.collisionFilterMask !== ball.originalCollisionMask) {
  ball.body.collisionFilterMask = ball.originalCollisionMask;
}
```

### Suggestion 4: Monitor Body Removal
Check if body is accidentally removed from world:
```javascript
// Check if body is in world
if (!this.physicsWorld.world.bodies.includes(ball.body)) {
  console.error('Body not in physics world!');
  this.physicsWorld.addBody(ball.body);
}
```

### Suggestion 5: Add Velocity Preservation
If velocity is lost, preserve it:
```javascript
// Before shape change
const savedVelocity = ball.body.velocity.clone();

// After shape change
if (ball.body.velocity.length() < 0.01) {
  ball.body.velocity.set(savedVelocity.x, savedVelocity.y, savedVelocity.z);
}
```

## Implementation Priority

1. **High Priority**: Add logging (ChatGPT's suggestion) to identify which property is changing
2. **High Priority**: Add state validation function
3. **Medium Priority**: Add safety checks after shape changes
4. **Medium Priority**: Investigate shape change timing
5. **Low Priority**: Implement more robust shape update mechanism

## Expected Outcomes

After implementing logging, we should be able to identify:
- **Which property** is changing (position, velocity, type, etc.)
- **When** it changes (during size update, during collision, etc.)
- **What value** it changes to (NaN, 0, false, etc.)

This will narrow down the root cause and allow for a targeted fix.

