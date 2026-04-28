# Story 004: Server Authority — MOVE Message + Remote Coord Update

> **Epic**: PlayerMovement
> **Status**: Ready
> **Layer**: Core
> **Type**: Integration
> **Manifest Version**: 2026-04-22

## Context

**GDD**: `design/gdd/player-movement.md`
**Requirements**: `TR-playermovement-012`, `TR-playermovement-013`
*(Requirement text lives in `docs/architecture/tr-registry.yaml` — read fresh at review time)*

**ADR Governing Implementation**: ADR-0010: Server Authority
**ADR Decision Summary**: Client sends `MOVE { direction: Direction8, fromCell: CellIndex, timestamp: simulatedTime }` to server via WebSocket on each valid local move. Server broadcasts `PLAYER_MOVE { playerId, toCell: CellIndex, timestamp }` to all clients. On receiving remote `PLAYER_MOVE`, the local client updates the remote player's logical `CellCoord` without local input validation (server is authoritative). Local player moves are applied optimistically — no waiting for server acknowledgment.

**Engine**: Cocos Creator 3.8.6 (TypeScript) | **Risk**: LOW
**Engine Notes**: `CellIndex = row*8 + col` is the wire format for `MOVE` messages. All internal game logic still uses `CellCoord`. Conversion: `CellIndex = coord.row * 8 + coord.col`; reverse: `row = Math.floor(index/8)`, `col = index % 8`.

**Control Manifest Rules (Core layer)**:
- Required: `MOVE { direction: Direction8, fromCell: CellIndex, timestamp: simulatedTime }` — `CellIndex` (not `CellCoord`) in wire message
- Required: remote `PLAYER_MOVE` broadcast triggers logical coord update for remote player, no local validation
- Forbidden: `CellCoord` in WebSocket wire messages — always `CellIndex` for network serialization

---

## Acceptance Criteria

*From GDD `design/gdd/player-movement.md`, scoped to this story:*

- [ ] **AC (TR-012)**: On every valid local move, `MOVE { direction, fromCell: CellIndex, timestamp: clock.now() }` message sent to server via WebSocket. `fromCell` is the `CellIndex` of the player's position at the moment of input (before logical coord update). No `MOVE` message sent for boundary-rejected moves.
- [ ] **AC (TR-013)**: On receiving `PLAYER_MOVE { playerId, toCell: CellIndex, timestamp }` broadcast from server, remote player's logical `CellCoord` updated to `{ row: floor(toCell/8), col: toCell%8 }` immediately. Visual tween starts from current rendered position to new logical position.
- [ ] **AC (optimistic)**: Local player's move applies immediately (before server acknowledgment). No move-blocking wait for server response.

---

## Implementation Notes

*Derived from ADR-0010 Implementation Guidelines:*

```typescript
// Sending MOVE message on local move (TR-012):
executeMove(playerId: PlayerId, direction: Direction8): void {
  // ... (Stories 001-003 logic) ...
  const fromCell: CellIndex = this.logicalCoord[playerId].row * 8
                              + this.logicalCoord[playerId].col;
  // Logical coord update happens first (optimistic), then send
  this.logicalCoord[playerId] = target;  // optimistic apply
  this.webSocket.send('MOVE', {
    direction,
    fromCell,  // CellIndex of position before move
    timestamp: this.clock.now(),
  });
  // ... tween + events (Story 002) ...
}

// Receiving PLAYER_MOVE broadcast (TR-013):
onRemotePlayerMove(msg: PlayerMoveMessage): void {
  const { playerId, toCell, timestamp } = msg;
  if (playerId === this.localPlayerId) return;  // local player: server echo, ignore
  const newCoord: CellCoord = {
    row: Math.floor(toCell / 8),
    col: toCell % 8,
  };
  this.logicalCoord[playerId] = newCoord;
  // Start visual tween from current rendered position to newCoord (no local validation)
  this.startTweenForRemote(playerId, newCoord);
}

// CellIndex conversion helpers (src/core/grid/CellCoord.ts):
export function coordToIndex(coord: CellCoord): CellIndex {
  return coord.row * 8 + coord.col;
}
export function indexToCoord(index: CellIndex): CellCoord {
  return { row: Math.floor(index / 8), col: index % 8 };
}
```

- `fromCell` in the outgoing `MOVE` message is the position **before** the logical coord update. Capture it before applying the optimistic move.
- Remote player moves do NOT go through local boundary checking — the server is authoritative. A remote player's `toCell` is trusted and applied directly.
- OQ-PL-2 (seed delivery timing) is analogous: this story assumes the WebSocket connection is live. If not connected, `MOVE` message is dropped silently (retry/reconnect is WebSocketClient epic scope).

---

## Out of Scope

*Handled by neighbouring stories — do not implement here:*

- **Story 001-003**: Local movement logic, buffering, death handling
- **WebSocketClient epic**: Connection management, reconnection, message framing
- **GridExplosion Story 002**: Death detection for remote players (uses their logical coord set here)

---

## QA Test Cases

- **AC (TR-012)**: MOVE message on valid local move
  - Given: `MockWebSocket` spy; player at `{row:3,col:3}` (CellIndex=27); valid direction=0 (right)
  - When: `executeMove(localId, 0)` called
  - Then: `webSocket.send` called with `{ direction:0, fromCell:27, timestamp: clock.now() }`; `fromCell=27` (pre-move position); message NOT sent if boundary move rejected
  - Edge cases: boundary-rejected move → no `MOVE` message; MOVE message sent before `PLAYER_MOVED` event? No — order: logical update → `PLAYER_MOVED` event → `MOVE` message (or simultaneous, either acceptable)

- **AC (TR-013)**: Remote PLAYER_MOVE broadcast
  - Given: remote player `r1` at `{row:2,col:2}` (CellIndex=18); `PLAYER_MOVE { playerId:r1, toCell:19 }` received
  - When: `onRemotePlayerMove` processes
  - Then: `getLogicalCoord(r1) === {row:2,col:3}`; visual tween starts toward `{2,3}`; no boundary validation applied; no `PLAYER_MOVED` event emitted for remote update
  - Edge cases: `toCell` for local player → ignored (server echo); invalid `toCell` (e.g., >63) → clamp or log+ignore; remote player already dead → update still applies (server authority)

- **AC (optimistic)**: No blocking wait
  - Given: `MockWebSocket` configured with artificial 200ms latency
  - When: local player moves
  - Then: `logicalCoord` updated and `PLAYER_MOVED` emitted at `t=0`; visual tween starts at `t=0`; does not wait for server response before applying move
  - Edge cases: server never responds → local move still applied; server sends correction → reconciliation is WebSocketClient epic scope

---

## Test Evidence

**Story Type**: Integration
**Required evidence**: `tests/integration/playermovement/server_authority_test.ts` — must exist and pass

**Status**: [ ] Not yet created

---

## Dependencies

- Depends on: Story 003 must be DONE; WebSocketClient epic must be DONE (provides `IWebSocket` interface)
- Unlocks: Story 005 (playtest requires full pipeline including server sync)
