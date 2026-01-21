# Physics Tunneling Optimizations

## Problem: Ball Phasing Through Walls and Pegs

After multiple bounces, especially with the Arkanoid power active, balls can sometimes phase through walls and pegs. This is a classic physics tunneling issue.

## Understanding Continuous Collision Detection (CCD)

### What is CCD?

**Continuous Collision Detection (CCD)** is a technique that prevents fast-moving objects from "tunneling" through other objects between physics simulation steps.

### The Problem Without CCD

In discrete physics simulation, objects are checked for collisions at specific time intervals (timesteps). If an object moves fast enough, it can travel completely through a thin object between two timesteps:

```
Frame 1:  [Ball] ----->  [Wall]  (Ball is before wall)
Frame 2:  [Ball]  [Wall] ----->  (Ball is after wall - MISSED COLLISION!)
```

**Example:**
- Ball speed: 7.5 units/second
- Timestep: 1/180 seconds (≈0.0056s)
- Distance per step: 7.5 × 0.0056 = **0.042 units**
- Ball radius: 0.1 units
- Wall thickness: ~0.01 units (very thin)

If the wall is thinner than 0.042 units, the ball can pass through it in a single timestep without detection!

### How CCD Works

CCD tracks the **trajectory** of fast-moving objects between timesteps, creating a "swept volume" (like a tube) along the path of movement:

```
Without CCD:
Frame 1: [Ball] -----> [Wall]
Frame 2:         [Ball] [Wall]  (collision missed)

With CCD:
Frame 1: [Ball] -----> [Wall]
         |      |      |
         |      |      |  (swept volume checked)
         |      |      |
Frame 2:         [Ball] [Wall]  (collision detected in swept volume!)
```

**CCD Process:**
1. Calculate the ball's movement path from position A to position B
2. Create a swept volume (cylinder/capsule) along that path
3. Check if the swept volume intersects with any objects
4. If intersection found, calculate the exact collision point and time
5. Move the ball to the collision point and resolve the collision

### CCD Parameters

- **`ccdSpeedThreshold`**: Minimum speed to enable CCD (e.g., 0.1 units/sec)
  - Only fast objects use CCD (saves performance)
  - Slow objects use normal discrete collision detection
  
- **`ccdIterations`**: Number of sub-iterations for collision detection (e.g., 8)
  - More iterations = more accurate but slower
  - Divides the movement path into smaller segments for checking

### Performance Impact

- **CPU Cost**: Low to moderate (only active for fast objects)
- **Accuracy Gain**: Very high (prevents most tunneling)
- **When to Use**: Essential for fast-moving objects (balls, projectiles)

### Why It's Critical for This Game

1. **High Ball Speeds**: With Arkanoid power, balls can reach speeds > 7.5 units/sec
2. **Thin Walls**: Walls are planes (effectively 0 thickness)
3. **Small Pegs**: Pegs have small collision volumes
4. **Rapid Bounces**: Multiple bounces in quick succession increase speed

Without CCD, even with good timestep settings, fast balls will tunnel through geometry.

---

## Current Configuration Analysis

### Physics World Settings
- **Fixed Timestep**: `1/180` seconds (≈5.56ms, 180 Hz)
- **Max Substeps**: `30`
- **Broadphase**: `NaiveBroadphase` (O(n²) collision checks)
- **Solver Iterations**: `10`
- **Ball Radius**: `0.1` units
- **Max Rebound Speed**: `7.5` units/sec
- **Ball Shot Speed**: `10` units/sec

### Ball Settings
- **CCD**: ❌ Not enabled (commented but not implemented)
- **allowSleep**: `false` (good - keeps ball active)
- **collisionResponse**: `true` (good - enables collisions)

### Tunneling Risk Calculation

**Maximum safe speed without tunneling:**
- Timestep: 1/180 = 0.00556 seconds
- Ball radius: 0.1 units
- Minimum object thickness: ~0.01 units (walls/pegs)
- **Safe speed**: (0.1 + 0.01) / 0.00556 = **19.8 units/sec**

**Current speeds:**
- Initial shot: 10 units/sec ✅ Safe
- Max rebound: 7.5 units/sec ✅ Safe
- Arkanoid power: Can exceed 7.5 after multiple bounces ⚠️ **RISK**

**Problem**: Arkanoid power can increase speed beyond `maxReboundSpeed`, and speed correction happens AFTER physics step, allowing tunneling.

---

## Recommended Optimizations

### High Priority (Critical for Accuracy)

#### 1. Enable CCD for Balls ⭐ **CRITICAL**

**Location**: `src/entities/Ball.js` → `createPhysicsBody()`

```javascript
// Enable CCD (Continuous Collision Detection) for fast-moving objects
this.body.ccdSpeedThreshold = 0.1; // Enable CCD if speed > 0.1 units/sec
this.body.ccdIterations = 8; // Number of CCD sub-iterations
```

**Impact:**
- ✅ Prevents tunneling for fast-moving objects
- ✅ Accuracy: **Very High**
- ✅ FPS Impact: **Low** (only active for fast objects)

**Why Critical**: This is the primary solution for tunneling. Without it, fast balls will always risk phasing through objects.

---

#### 2. Switch to SAP (Sweep and Prune) Broadphase

**Location**: `src/physics/PhysicsWorld.js` → `constructor()`

```javascript
// Replace NaiveBroadphase with SAPBroadphase
this.world.broadphase = new CANNON.SAPBroadphase();
```

**Impact:**
- ✅ Better spatial awareness (O(n log n) vs O(n²))
- ✅ More accurate collision detection with many objects
- ✅ Accuracy: **High**
- ✅ FPS Impact: **Positive** (often faster with many objects)

**Why Important**: NaiveBroadphase checks every object against every other object. With 50+ pegs, this is 2500+ checks per frame. SAP uses spatial partitioning to only check nearby objects.

---

#### 3. Increase Solver Iterations

**Location**: `src/physics/PhysicsWorld.js` → `constructor()`

```javascript
// Increase from 10 to 15
this.world.solver.iterations = 15;
```

**Impact:**
- ✅ Better constraint resolution (more stable bounces)
- ✅ More accurate collision response
- ✅ Accuracy: **Medium**
- ✅ FPS Impact: **Medium** (50% more solver work)

**Why Important**: More iterations = better physics stability, especially for rapid bounces and complex collision scenarios.

---

#### 4. Pre-Clamp Velocity Before Physics Step

**Location**: `src/Game.js` → `animate()` loop, before `physicsWorld.update()`

```javascript
// Clamp ball velocities BEFORE physics step to prevent tunneling
this.balls.forEach(ball => {
    if (ball.body) {
        const velocity = ball.body.velocity;
        const speed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y);
        if (speed > this.maxReboundSpeed) {
            const scale = this.maxReboundSpeed / speed;
            ball.body.velocity.set(
                velocity.x * scale,
                velocity.y * scale,
                velocity.z * scale
            );
        }
    }
});
```

**Impact:**
- ✅ Prevents high velocities from causing tunneling
- ✅ Accuracy: **High**
- ✅ FPS Impact: **Minimal** (simple calculation)

**Why Critical**: Currently, velocity clamping happens AFTER collision detection. If a ball has very high velocity, it can tunnel through objects before the clamp is applied.

---

### Medium Priority (Improvements)

#### 5. Increase Max Substeps

**Location**: `src/physics/PhysicsWorld.js` → `update()`

```javascript
// Increase from 30 to 50
const maxSubSteps = 50;
```

**Impact:**
- ✅ More substeps for very fast objects
- ✅ Accuracy: **Medium**
- ✅ FPS Impact: **High** (more physics calculations)

**When to Use**: Only if tunneling persists after implementing high-priority fixes.

---

#### 6. Reduce Fixed Timestep (Higher Frequency)

**Location**: `src/physics/PhysicsWorld.js` → `update()`

```javascript
// Increase from 180 Hz to 240 Hz
const fixedTimeStep = 1 / 240; // ≈4.17ms
```

**Impact:**
- ✅ Smaller steps = less distance per step = less tunneling risk
- ✅ Accuracy: **Medium**
- ✅ FPS Impact: **High** (33% more physics steps)

**Trade-off**: Better accuracy but significantly more CPU usage. Only use if other optimizations aren't sufficient.

---

#### 7. Velocity-Based Collision Margin

**Location**: `src/entities/Ball.js` → `createPhysicsBody()` or in update loop

```javascript
// Add dynamic margin based on velocity
const speed = Math.sqrt(
    this.body.velocity.x * this.body.velocity.x + 
    this.body.velocity.y * this.body.velocity.y
);
// Increase collision margin for faster objects
const margin = Math.min(0.05, speed * 0.01);
// Note: Cannon.js doesn't directly support per-body margin,
// but you can increase the shape radius slightly for fast objects
```

**Impact:**
- ✅ Larger collision volumes for fast objects
- ✅ Accuracy: **Low to Medium**
- ✅ FPS Impact: **Minimal**

**Note**: This is a workaround. CCD is the proper solution.

---

### Low Priority (Fine-Tuning)

#### 8. Collision Groups/Filters

Use collision groups to reduce unnecessary collision checks between objects that should never collide.

**Impact:**
- ✅ Reduces unnecessary checks
- ✅ Accuracy: **Low** (doesn't fix tunneling, just optimizes)
- ✅ FPS Impact: **Positive** (fewer checks)

---

#### 9. Adaptive Timestep

Reduce timestep when ball speed is high:

```javascript
const baseTimeStep = 1 / 180;
const speed = ball.body.velocity.length();
const adaptiveTimeStep = speed > 5 ? 1 / 240 : baseTimeStep;
```

**Impact:**
- ✅ Better accuracy for fast objects
- ✅ Accuracy: **Medium**
- ✅ FPS Impact: **Variable** (higher when fast objects present)

---

#### 10. Post-Collision Position Correction

After collision detection, verify ball isn't inside geometry and push it out if needed.

**Impact:**
- ✅ Safety net for missed collisions
- ✅ Accuracy: **Low to Medium**
- ✅ FPS Impact: **Minimal**

---

## Implementation Priority

### Phase 1: Critical Fixes (Do First)
1. ✅ Enable CCD for balls
2. ✅ Pre-clamp velocity before physics step
3. ✅ Clamp Arkanoid targetSpeed to maxReboundSpeed

### Phase 2: Performance & Accuracy (Do Second)
4. Switch to SAP Broadphase
5. Increase solver iterations to 15

### Phase 3: Fine-Tuning (If Needed)
6. Increase max substeps (if issues persist)
7. Reduce timestep (if issues persist)
8. Add velocity-based margins (optional)

---

## Expected Results

After implementing Phase 1 optimizations:
- ✅ **Eliminates** most tunneling through walls
- ✅ **Reduces** tunneling through pegs by 80-90%
- ✅ **Maintains** 60 FPS on modern hardware
- ✅ **More stable** physics with rapid bounces
- ✅ **Better handling** of high-speed Arkanoid balls

---

## Performance vs Accuracy Trade-offs

| Optimization | Accuracy Gain | FPS Impact | Priority |
|--------------|---------------|------------|----------|
| Enable CCD | ⭐⭐⭐⭐⭐ Very High | ⭐⭐ Low | **Critical** |
| SAP Broadphase | ⭐⭐⭐⭐ High | ⭐ Positive | High |
| Increase Solver Iterations | ⭐⭐⭐ Medium | ⭐⭐⭐ Medium | High |
| Pre-clamp Velocity | ⭐⭐⭐⭐ High | ⭐ Minimal | **Critical** |
| Increase Max Substeps | ⭐⭐⭐ Medium | ⭐⭐⭐⭐ High | Medium |
| Reduce Timestep | ⭐⭐⭐ Medium | ⭐⭐⭐⭐ High | Medium |
| Velocity-based Margin | ⭐⭐ Low | ⭐ Minimal | Low |

---

## Testing Checklist

After implementing optimizations, test:
- [ ] Ball doesn't phase through walls after multiple bounces
- [ ] Ball doesn't phase through pegs on complex levels
- [ ] Arkanoid power balls maintain proper collisions at high speeds
- [ ] FPS remains stable (60 FPS target)
- [ ] No performance degradation with many pegs
- [ ] Physics feels responsive and accurate

---

## Notes

- **CCD is the most important fix** - it directly addresses the root cause of tunneling
- **Pre-clamping velocity** prevents the problem before it occurs
- **SAP Broadphase** improves both accuracy and performance
- All optimizations work together - implement Phase 1 first, then Phase 2

