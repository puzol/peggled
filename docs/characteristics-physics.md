# Characteristics Physics Behavior

## Current Behavior: Dampening Effect

Characteristics (rectangles and circles) currently exhibit a **dampening effect** when the ball bounces off them, rather than the normal bouncy behavior seen with pegs and walls.

## Root Cause

The dampening behavior is caused by **missing physics material configuration**:

1. **No Material Assigned**: Characteristics are created without a `material` property on their Cannon.js physics body (see `Characteristic.js` line 96-99). The body is created with only `mass: 0` and `shape`, but no material.

2. **No Contact Material Defined**: In `PhysicsWorld.js`, contact materials are defined for:
   - `ball-wall`: restitution 0.875 (bouncy)
   - `ball-peg`: restitution 0.875 (bouncy)
   - **Missing**: `ball-characteristic` contact material

3. **Default Physics Behavior**: When no material or contact material is specified, Cannon.js uses default material properties, which typically have:
   - Lower `restitution` (less bouncy, more energy loss)
   - Default `friction` values
   - Default `damping` values

This results in the ball losing more energy on each bounce, creating the dampening effect.

## Technical Details

### Current Implementation
```javascript
// Characteristic.js - createPhysicsBody()
this.body = new CANNON.Body({
    mass: 0, // Static body
    shape: physicsShape
    // ❌ No material property
});
```

### Expected Implementation (for normal bounce)
```javascript
// Should use a material like pegs do
this.body = new CANNON.Body({
    mass: 0,
    shape: physicsShape,
    material: characteristicMaterial // ✅ Material needed
});

// PhysicsWorld.js should define:
const ballCharacteristicContact = new CANNON.ContactMaterial(
    this.ballMaterial,
    this.characteristicMaterial,
    {
        friction: 0.3,
        restitution: 0.875 // Same as pegs/walls
    }
);
```

## Future Enhancement: Configurable Bounce Behavior

**This dampening behavior should be made configurable via the Settings Tool** in the level editor.

### Proposed Settings:
- **Bounce Type**: 
  - `Normal` (restitution: 0.875) - Standard bouncy behavior like pegs/walls
  - `Dampened` (restitution: 0.3-0.5) - Current behavior, energy loss on bounce
  - `Super Bouncy` (restitution: 1.0+) - Extra bouncy, energy gain
  - `No Bounce` (restitution: 0.0) - Ball stops/sticks on contact

### Implementation Notes:
1. Add `bounceType` or `restitution` property to Characteristic class
2. Create characteristic material(s) in PhysicsWorld with different restitution values
3. Define contact materials for each bounce type
4. Add UI controls in the Settings Tool overlay for selecting bounce behavior
5. Store bounce type in `placedObjects` for level saving/loading

### Use Cases:
- **Dampening**: Useful for creating "sticky" surfaces, energy-absorbing barriers, or slowing down fast-moving balls
- **Normal Bounce**: Standard gameplay behavior, consistent with pegs
- **Super Bouncy**: Create interesting ricochet effects, speed boosts
- **No Bounce**: Create walls that stop the ball completely

## Related Files
- `src/entities/Characteristic.js` - Characteristic physics body creation
- `src/physics/PhysicsWorld.js` - Material and contact material definitions
- `src/utils/LevelEditor.js` - Settings tool implementation (to be enhanced)

