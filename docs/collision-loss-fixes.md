# Collision Loss Fixes for Cannon.js Physics

This document outlines fixes for the "collision loss" problem where the ball sometimes phases through pegs, especially with large balls and sharp-cornered pegs (rectangles, domes).

## Problem

The ball occasionally phases through pegs, particularly when:
- The ball is large (I8 power, >= 1.5x original size)
- Hitting pegs with sharp corners (rectangles, domes)
- Moving at high velocities
- Physics timestep is too large relative to ball speed

## Solutions

### 1. Fixed Timestep + Multiple Substeps (Most Important)

**Problem**: Variable timestep can cause fast-moving objects to skip through colliders.

**Solution**: Use a fixed timestep with an accumulator pattern that allows multiple substeps per frame.

```javascript
const fixedTimeStep = 1 / 120;  // 120 Hz physics update (or 1/180 for faster balls)
const maxSubSteps = 6;          // Increase to 8-10 if needed (we have FPS headroom)
let accumulator = 0;

function animate(timeMs) {
  requestAnimationFrame(animate);

  const dt = Math.min(0.05, (timeMs - lastTimeMs) / 1000); // Clamp big frame spikes
  lastTimeMs = timeMs;

  accumulator += dt;
  let substeps = 0;

  while (accumulator >= fixedTimeStep && substeps < maxSubSteps) {
    world.step(fixedTimeStep);
    accumulator -= fixedTimeStep;
    substeps++;
  }

  renderer.render(scene, camera);
}
```

**Key Points**:
- If ball moves more than ~0.25–0.5× its radius per substep, you're in the danger zone
- More substeps = better collision detection but higher CPU cost
- Fixed timestep ensures deterministic physics

**Implementation Status**: ✅ Implemented in `PhysicsWorld.js` with accumulator pattern

### 2. Increase Solver Quality

**Problem**: Default solver settings may not be sufficient for fast-moving objects and complex collisions.

**Solution**: Increase solver iterations and adjust tolerance.

```javascript
world.solver.iterations = 20;  // Try 10 → 20 → 30 (default is usually 10)
world.solver.tolerance = 1e-4; // Smaller tolerance can help (default is usually 1e-6)
```

**Key Points**:
- More iterations = better constraint resolution but higher CPU cost
- Lower tolerance = more accurate but potentially slower
- Cannon-es documentation recommends iterations as a quality knob

**Implementation Status**: ✅ Implemented in `PhysicsWorld.js` (iterations: 20, tolerance: 1e-4)

### 3. Add "Rounding" to Sharp Colliders

**Problem**: Sharp corners can cause contact detection issues when the ball hits two faces simultaneously.

**Solution**: Even if visuals are sharp, physics colliders should have slight fillets/bevels.

**Options**:
- Replace box/hex collider with a `ConvexPolyhedron` that's slightly inflated/beveled
- Build a compound: polygon + small spheres on corners (cheap and robust)
- This dramatically reduces "hit corner → miss contact next frame"

**Implementation Status**: ⚠️ Partially implemented via collision normalization in `Game.js`
- `normalizeCornerCollision()` handles corner hits by selecting primary face
- Could be improved with actual beveled colliders

### 4. Avoid Trimesh for Dynamic Gameplay Colliders

**Problem**: Trimesh colliders can have edge detection issues.

**Solution**: Use `Box` or `ConvexPolyhedron` for simple shapes. Use `Trimesh` mainly for static terrain.

**Implementation Status**: ✅ Already using Box and ConvexPolyhedron for pegs

### 5. Clamp Extreme Velocities / Use "Bullet Style" Fallback

**Problem**: Cannon.js doesn't have robust CCD (Continuous Collision Detection) like Bullet/PhysX.

**Solution**: For fast-moving balls, implement a raycast/sweep fallback:

```javascript
// If speed * dt > k * radius (k ~ 0.5), do a raycast/sweep
if (speed * dt > 0.5 * radius) {
  // Raycast from previous position to next position
  // If hit: place ball at impact point + normal * radius
  // Then reflect velocity manually
}
```

This gives you "CCD enough" for one fast-moving sphere without changing engines.

**Implementation Status**: ⚠️ Not yet implemented - could be added if issues persist

## Current Implementation

### PhysicsWorld.js

- **Fixed Timestep**: `1/120` (120 Hz physics update)
- **Max Substeps**: `30` (allows up to 30 substeps per frame)
- **Solver Iterations**: `20` (increased from default 10)
- **Solver Tolerance**: `1e-4` (tighter than default)
- **Accumulator Pattern**: Manual accumulator for precise control

### Game.js Collision Normalization

- **Corner Collision Normalization**: `normalizeCornerCollision()` for rect/dome pegs
- **Round Peg Normalization**: `normalizeRoundPegCollision()` for round pegs
- **Characteristic Normalization**: Similar normalization for characteristics

## Performance Considerations

- **FPS Headroom**: We have massive FPS headroom, so we can afford more substeps
- **Current Settings**: 30 max substeps at 120 Hz should handle most cases
- **Monitoring**: Watch FPS display to ensure performance remains acceptable

## Testing

Test collision loss fixes with:
1. I8 power with large balls (>= 1.5x original size)
2. Fast-moving balls
3. Corner hits on rectangular/dome pegs
4. Multiple balls in play simultaneously

## References

- Cannon-es documentation: https://github.com/pmndrs/cannon-es
- ChatGPT suggestions for Peggle-like collision issues
- Game development best practices for fast-moving objects

