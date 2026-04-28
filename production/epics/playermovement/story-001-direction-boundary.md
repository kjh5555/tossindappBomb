# Story 001: Direction8 Movement + Boundary + JOY_THRESHOLD

> **Epic**: PlayerMovement
> **Status**: Complete
> **Layer**: Core
> **Type**: Logic
> **Manifest Version**: 2026-04-22

## Context

**GDD**: `design/gdd/player-movement.md`
**Requirements**: `TR-playermovement-001`, `TR-playermovement-002`, `TR-playermovement-003`, `TR-playermovement-010`
*(Requirement text lives in `docs/architecture/tr-registry.yaml` — read fresh at review time)*

**ADR Governing Implementation**: ADR-0005: CellCoord 정규화
**ADR Decision Summary**: All grid positions use `CellCoord = {row:0-7, col:0-7}`. Boundary rejection silently drops the move (no event emitted). `cellEquals()` and `isValidCell()` helpers from `CellCoord.ts`. `CellIndex = row*8+col` is serialization-only — never used in movement logic.

**Engine**: Cocos Creator 3.8.6 (TypeScript) | **Risk**: LOW
**Engine Notes**: Pure TypeScript movement math — no engine API. `direction = round(swipe_angle / 45) % 8` formula is floating-point safe (integer result).

**Control Manifest Rules (Core layer)**:
- Required: `CellCoord = { row: 0-7, col: 0-7 }` for all cell references
- Required: boundary rejection drops move silently — no `PLAYER_MOVED` emitted
- Forbidden: `CellIndex` (number) in movement logic — serialization only
- Forbidden: `{x, y}` coordinate system for grid cells

---

## Acceptance Criteria

*From GDD `design/gdd/player-movement.md`, scoped to this story:*

- [ ] **AC-PM-1**: Direction8 delta accuracy — for each direction 0–7, `target = { row: current.row + Δrow[dir], col: current.col + Δcol[dir] }` matches F-2 delta table exactly.
- [ ] **AC-PM-2**: Boundary rejection — player at boundary cell attempting out-of-bounds move: logical `CellCoord` unchanged after the attempt.
- [ ] **AC-PM-3**: Boundary rejection does not consume buffer — if a buffer entry exists when a boundary-out move is attempted, the buffer entry is preserved after the failed move.
- [ ] **AC-PM-10**: `JOY_THRESHOLD=18px` — joystick displacement < 18px does not activate any direction; no move issued; no event emitted.
- [ ] **AC-PM-12**: Moving toward an `Imminent` (about-to-explode) cell is allowed — no pre-emptive block; move processes normally.
- [ ] **AC-PM-20**: F-1 angle mapping — `direction = round(swipe_angle / 45) % 8` produces correct Direction8 index at boundary angles (22.5°, 67.5°, 112.5°, 157.5°, 202.5°, 247.5°, 292.5°, 337.5°).

---

## Implementation Notes

*Derived from ADR-0005 Implementation Guidelines:*

```typescript
// Direction8 delta table (F-2):
const DELTA: Record<number, {dRow: number, dCol: number}> = {
  0: {dRow:  0, dCol: +1},  // 우(→)
  1: {dRow: +1, dCol: +1},  // 우하(↘)
  2: {dRow: +1, dCol:  0},  // 하(↓)
  3: {dRow: +1, dCol: -1},  // 좌하(↙)
  4: {dRow:  0, dCol: -1},  // 좌(←)
  5: {dRow: -1, dCol: -1},  // 좌상(↖)
  6: {dRow: -1, dCol:  0},  // 상(↑)
  7: {dRow: -1, dCol: +1},  // 우상(↗)
};

// Joystick angle → Direction8 (F-1):
function angleToDirection8(angleDeg: number): number {
  return Math.round(angleDeg / 45) % 8;
}

// Boundary check (F-3, ADR-0005 isValidCell):
function isValidCell(coord: CellCoord): boolean {
  return coord.row >= 0 && coord.row <= 7 && coord.col >= 0 && coord.col <= 7;
}

// Move attempt:
function tryMove(playerId, direction: number, joystickMagnitude: number): void {
  if (joystickMagnitude < JOY_THRESHOLD) return;  // AC-PM-10
  const delta = DELTA[direction];
  const target: CellCoord = {
    row: this.logicalCoord[playerId].row + delta.dRow,
    col: this.logicalCoord[playerId].col + delta.dCol,
  };
  if (!isValidCell(target)) return;  // AC-PM-2: silent drop, buffer untouched
  // ... proceed to buffer/tween logic (Story 002)
}

// Constants:
export const JOY_THRESHOLD  = 18;   // px
export const MOVE_REPEAT    = 0.22; // seconds — hold-to-repeat cadence
```

- `MOVE_REPEAT=0.22s` governs hold-to-repeat timing but is tested in integration with joystick input (out of scope for this unit story — Story 002 covers tween/buffer interaction).
- `Imminent` cell state does not exist in the current state machine (removed per OQ-3 — Warning stage eliminated). AC-PM-12 verifies that only `EXPLODED` state triggers death, not an "imminent" pre-state.

---

## Out of Scope

*Handled by neighbouring stories — do not implement here:*

- **Story 002**: Input buffering, logical coord update, `PLAYER_MOVED`/`PLAYER_ARRIVED` events
- **Story 003**: Death handling, `PLAYER_KILLED` reaction, tween snap on round end
- **Story 004**: Server authority, `MOVE` message, remote player coord update

---

## QA Test Cases

- **AC-PM-1**: Direction8 delta table
  - Given: player at `{row:3,col:3}`; each direction 0–7 tested in sequence
  - When: `tryMove(playerId, direction, 20)` called for each direction
  - Then: resulting target coord matches F-2 delta table: dir=0→`{3,4}`, dir=1→`{4,4}`, dir=2→`{4,3}`, dir=3→`{4,2}`, dir=4→`{3,2}`, dir=5→`{2,2}`, dir=6→`{2,3}`, dir=7→`{2,4}`
  - Edge cases: player at `{0,0}` testing valid directions only (dirs 0,1,2 — others would be boundary)

- **AC-PM-2 + AC-PM-3**: Boundary rejection
  - Given: player at `{0,3}`; direction=6 (up, Δrow=-1)
  - When: `tryMove` called with magnitude=25
  - Then: player coord remains `{0,3}`; `PLAYER_MOVED` NOT emitted; if buffer holds direction=0, buffer still holds direction=0 after failed attempt
  - Edge cases: player at `{7,7}` trying dirs 0,1,2 (all valid); player at `{0,0}` trying all 8 dirs — only dirs 0,1,2 are valid

- **AC-PM-10**: JOY_THRESHOLD
  - Given: joystick magnitude = 17px (below 18px threshold)
  - When: `tryMove(playerId, 0, 17)` called
  - Then: no move; `PLAYER_MOVED` NOT emitted; logical coord unchanged
  - Edge cases: magnitude=18 → move executes (threshold inclusive); magnitude=0 → no move; magnitude=17.9 → no move

- **AC-PM-20**: Angle mapping boundaries
  - Given: angles [22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5] degrees
  - When: `angleToDirection8(angle)` called for each
  - Then: each maps to the correct Direction8 boundary index per `round(angle/45) % 8`
  - Edge cases: angle=0° → dir=0 (right); angle=360° → dir=0; angle=22.4° → dir=0; angle=22.6° → dir=1

---

## Test Evidence

**Story Type**: Logic
**Required evidence**: `tests/unit/playermovement/grid_movement_test.ts` — must exist and pass

**Status**: [x] `tests/unit/playermovement/grid_movement_test.ts` — 21 tests passing

---

## Dependencies

- Depends on: None (first PlayerMovement story; direction math is standalone)
- Unlocks: Story 002 (buffering builds on the move attempt logic), Story 003 (death handling requires valid movement)

## Completion Notes
**Completed**: 2026-04-22
**Criteria**: 6/6 passing (전부 자동 검증)
**Deviations**: ADVISORY — Math.round half-up 동작으로 boundary angles (22.5°→dir 1, 337.5°→dir 0). GDD F-1에 반올림 방향 미지정; JavaScript 표준 동작 따름.
**Test Evidence**: Logic: `tests/unit/playermovement/grid_movement_test.ts` — 21 tests passing
**Code Review**: Skipped — Lean mode
