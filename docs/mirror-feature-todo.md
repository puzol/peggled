# Mirror Feature Implementation TODO

## Overview
Add a 'Mirrored' checkbox to the Settings tool that creates a mirrored duplicate of objects around the Y-axis. The mirror copy and original should stay synchronized.

## Tasks

### 1. Add Mirror Property to Objects
- [ ] Add `mirrored` boolean property to all object types (pegs, shapes, characteristics, spacers, etc.)
- [ ] Add `mirrorPair` reference to link original and mirror objects
- [ ] Store mirror state in `placedObjects` entries

### 2. Add Mirror Checkbox to Settings UI
- [ ] Add 'Mirrored' checkbox to `createSettingsModal()` for shapes
- [ ] Add 'Mirrored' checkbox to `createCharacteristicSettingsModal()` for characteristics
- [ ] Add 'Mirrored' checkbox to settings for other object types (pegs, spacers, etc.) if they have settings panels

### 3. Create Mirror Copy Functionality
- [ ] Implement `createMirrorCopy()` function that:
  - Creates a duplicate of the object
  - Mirrors position around Y-axis (x becomes -x)
  - Sets `mirrored: true` on the copy
  - Links original and copy via `mirrorPair`
  - Handles all object types (pegs, shapes, characteristics, spacers, walls, spikes, buckets)

### 4. Mirror Shape Justify Settings
- [ ] Implement `mirrorJustify()` function to mirror justify settings:
  - Line shapes: 'left' ↔ 'right', 'center' stays 'center', 'between'/'around' stay same
  - Circle shapes: 'left-center' ↔ 'right-center', 'top-center' ↔ 'top-center', 'bottom-center' ↔ 'bottom-center'
  - Circle shapes: 'left-clockwise' ↔ 'right-clockwise', etc.
  - Apply mirrored justify when creating mirror copy

### 5. Sync Changes Between Original and Mirror
- [ ] Implement `syncToMirror()` function that syncs:
  - Position changes (mirror X coordinate)
  - Property changes (size, rotation, color, etc.)
  - Child element additions/removals
- [ ] Hook into existing move/update functions to trigger sync
- [ ] Ensure bidirectional sync (changes to mirror also reflect on original)

### 6. Handle Child Elements in Shapes
- [ ] When shape is mirrored, automatically mirror all contained pegs and characteristics
- [ ] When child is added to original, add mirrored child to mirror copy
- [ ] When child is removed from original, remove from mirror copy
- [ ] Maintain child order and positions

### 7. Handle Mirror Toggle Off
- [ ] When 'Mirrored' is unchecked on either object:
  - Remove `mirrored` property from both
  - Clear `mirrorPair` references
  - Optionally remove the mirror copy (or keep it as independent object)

### 8. Save/Load Mirror State
- [ ] Ensure mirror state is saved in level JSON
- [ ] Restore mirror relationships when loading levels
- [ ] Handle edge cases (mirror pair missing, etc.)

### 9. Testing
- [ ] Test mirroring for all object types
- [ ] Test justify mirroring for shapes
- [ ] Test child element synchronization
- [ ] Test toggling mirror on/off
- [ ] Test save/load with mirrored objects

