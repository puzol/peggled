# Multiplayer Architecture

## Overview

The multiplayer system allows two players to play the same game in turns, with each player running their own instance of the game synchronized via a shared seed and bucket position data.

## Key Concepts

### Deterministic Simulation

- Both players use the **same seed** to generate identical game states
- Peg layout (orange, green, purple assignments) is identical
- Physics simulation is deterministic (with 3-decimal rounding)
- Same shot angle produces identical results on both clients

### Bucket Synchronization

The bucket moves continuously and cannot be controlled by the seed alone. To keep simulations in sync:

1. **When Player 1 shoots:**
   - Player 1 captures the current bucket position at the moment of shot
   - Shot data (angle, seed) + bucket position is sent to the server
   - Server broadcasts to Player 2

2. **While Player 2 waits:**
   - Player 2's bucket is **frozen** at the received position
   - This ensures both simulations start from the same bucket state

3. **When Player 2 receives shot data:**
   - Player 2 sets bucket to the received position
   - Player 2 starts the shot simulation
   - Both players' buckets resume normal movement from the same point

## Data Flow

```
Player 1 (Shooter)
    ↓
    [Shoot] → Capture bucket position
    ↓
    Send: { seed, angle, bucketX, timestamp }
    ↓
Server
    ↓
    Broadcast to Player 2
    ↓
Player 2 (Spectator)
    ↓
    Freeze bucket at received position
    ↓
    Start simulation with received angle
    ↓
    Resume bucket movement
```

## Message Format

### Shot Message
```javascript
{
    type: 'shot',
    playerId: 'player1',
    seed: 1234567890,
    angle: 225,  // degrees
    bucketX: 0.5,  // normalized position (-1 to 1)
    timestamp: 1234567890123  // milliseconds
}
```

### Bucket Position
- Bucket position is normalized to -1 to 1 range
- -1 = left wall
- 0 = center
- 1 = right wall
- This allows position to be calculated at any point in the bucket's cycle

## Implementation Notes

### Server Requirements
- WebSocket server for real-time communication
- Room/matchmaking system
- Seed generation and distribution
- Shot data relay

### Client Requirements
- WebSocket client
- Bucket position capture on shot
- Bucket freeze/unfreeze functionality
- Shot replay from received data

## Future Enhancements

- Multiple game modes (1v1, tournament)
- Spectator mode
- Replay system
- Leaderboards
- Chat system

