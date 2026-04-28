# Story 002: Input Buffering + Logical Coord + Event Split

> **Epic**: PlayerMovement
> **Status**: Complete
> **Layer**: Core
> **Type**: Logic
> **Manifest Version**: 2026-04-22

## Context

**GDD**: `design/gdd/player-movement.md`
**Requirements**: `TR-playermovement-004`, `TR-playermovement-005`, `TR-playermovement-006`, `TR-playermovement-007`, `TR-playermovement-014`
*(Requirement text lives in `docs/architecture/tr-registry.yaml` — read fresh at review time)*

**ADR Governing Implementation**: ADR-0008: Player Movement Event Split
**ADR Decision Summary**: On valid move: logical `CellCoord` updates immediately at `t=0` and `PLAYER_MOVED` is emitted (used by GridSimulation death detection). Visual tween runs for `MOVE_TWEEN_DURATION=0.1s` in parallel. `PLAYER_ARRIVED` is emitted at `t=0.1s` via `FrameClock.schedule(0.1)` (used by RoundManager for Goal Cell detection). A single-slot input buffer holds the latest direction input during an active tween; buffer auto-executes on tween completion; buffer is overwritten (not queued) if a second input arrives.

**Engine**: Cocos Creator 3.8.6 (TypeScript) | **Risk**: MEDIUM
**Engine Notes**: `FrameClock.schedule(fn, 0.1)` is the only deferred call mechanism — never use `setTimeout` or `cc.director.getScheduler()` for game-logic timing. Tween visual uses `cc.tween` or manual `lerp` in `update(dt)`; either is acceptable but must complete in exactly `MOVE_TWEEN_DURATION=0.1s`.

**Control Manifest Rules (Core layer)**:
- Required: `FrameClock.now()` for all time; `Date.now()` / `performance.now()` forbidden in game logic
- Required: `PLAYER_MOVED` at `t=0` (logical update, explosion detection uses this)
- Required: `PLAYER_ARRIVED` via `FrameClock.schedule(0.1s)` (Goal Cell detection uses this)
- Forbidden: `PLAYER_ARRIVED` emitted synchronously at `t=0`

---

## Acceptance Criteria

*From GDD `design/gdd/player-movement.md`, scoped to this story:*

- [ ] **AC-PM-4**: Logical coord updates immediately at `t=0` on valid input — `getCellCoord(playerId)` returns the destination cell at the moment `PLAYER_MOVED` is emitted, before visual tween begins.
- [ ] **AC-PM-5**: Input during tween — a valid direction input while a tween is active (`0 < t < 0.1s`) is stored in the single-slot buffer; move does not execute until tween completes.
- [ ] **AC-PM-6**: Buffer overwrite — second direction input during same tween replaces first in buffer (only latest input retained; buffer size = 1).
- [ ] **AC-PM-7**: Buffer auto-execute — on tween completion, if buffer holds a valid direction, that move executes immediately (logical coord updates, new tween starts).
- [ ] **AC-PM-14**: Buffer recompute on new position (EC-3) — buffered direction revalidated against new position on tween completion; invalid result (out of bounds) causes buffer consumption without move.
- [ ] **AC-PM-18**: `PLAYER_MOVED { playerId, from: CellCoord, to: CellCoord, timestamp }` emitted at `t=0` for every valid move; `timestamp` matches `clock.now()` at emission (±1ms).
- [ ] **AC-PM-18b**: `PLAYER_ARRIVED { playerId, cell: CellCoord, timestamp }` emitted at `t=0.1s` via `FrameClock.schedule`; `cell` matches move destination; NOT emitted at `t=0`.

---

## Implementation Notes

*Derived from ADR-0008 Implementation Guidelines:*

```typescript
// PlayerMovement — core move execution path
executeMove(playerId: PlayerId, direction: Direction8): void {
  if (this.tweenActive[playerId]) {
    // AC-PM-5/6: buffer (overwrite, not queue)
    this.inputBuffer[playerId] = direction;
    return;
  }
  const from = this.logicalCoord[playerId];
  const target = this.computeTarget(from, direction);
  if (!isValidCell(target)) return;  // boundary guard (Story 001)

  // AC-PM-4: logical coord update at t=0
  this.logicalCoord[playerId] = target;

  // AC-PM-18: PLAYER_MOVED at t=0
  this.eventBus.emit('PLAYER_MOVED', {
    playerId, from, to: target, timestamp: this.clock.now()
  });

  // Start visual tween
  this.tweenActive[playerId] = true;
  this.tweenElapsed[playerId] = 0;

  // AC-PM-18b: PLAYER_ARRIVED at t=0.1s via FrameClock.schedule
  const arrivedHandle = this.clock.schedule(() => {
    this.eventBus.emit('PLAYER_ARRIVED', {
      playerId, cell: target, timestamp: this.clock.now()
    });
    this.onTweenComplete(playerId);  // triggers buffer flush
  }, MOVE_TWEEN_DURATION);
  this.arrivedHandle[playerId] = arrivedHandle;
}

onTweenComplete(playerId: PlayerId): void {
  this.tweenActive[playerId] = false;
  const buffered = this.inputBuffer[playerId];
  this.inputBuffer[playerId] = null;
  if (buffered !== null) {
    // AC-PM-7/14: revalidate buffer direction from new position
    this.executeMove(playerId, buffered);
  }
}

// Constants:
export const MOVE_TWEEN_DURATION = 0.1;  // seconds
```

- `FrameClock.schedule` returns a handle. Store it in `arrivedHandle[playerId]` — Story 003 cancels it on `PLAYER_KILLED`.
- Visual `lerp` is a separate `update(dt)` concern; it reads `logicalCoord` and the tween elapsed time. The logical coord is already at the destination from `t=0` — the lerp only affects the rendered position.
- `inputBuffer` is a `Map<PlayerId, Direction8 | null>` — single slot per player, null when empty.

---

## Out of Scope

*Handled by neighbouring stories — do not implement here:*

- **Story 001**: `JOY_THRESHOLD`, direction mapping, boundary guard
- **Story 003**: `arrivedHandle` cancellation on `PLAYER_KILLED`, tween snap on `ROUND_CLEAR`
- **Story 004**: Server `MOVE` message, remote player coord update

---

## QA Test Cases

- **AC-PM-4**: Logical coord at t=0
  - Given: player at `{row:3,col:3}`; `MockFrameClock` at `t=5.0`; no active tween
  - When: `executeMove(playerId, 0)` (direction=right)
  - Then: `getCellCoord(playerId)` immediately returns `{row:3,col:4}`; `PLAYER_MOVED.to === {row:3,col:4}`; visual tween starts from `{3,3}` toward `{3,4}` but logical position is already `{3,4}`
  - Edge cases: rapid back-to-back moves (each starting before prior tween completes → buffered)

- **AC-PM-5 + AC-PM-6**: Buffer single slot overwrite
  - Given: tween active (`tweenActive=true`); buffer empty
  - When: direction=0 input, then direction=4 input (both during same tween)
  - Then: after first input: `buffer=0`; after second input: `buffer=4` (0 overwritten); no move executes mid-tween
  - Edge cases: 5 rapid inputs during single tween → only last direction stored

- **AC-PM-7 + AC-PM-14**: Buffer auto-execute with revalidation
  - Given: player at `{row:0,col:6}`; tween active toward `{row:0,col:7}`; buffer holds direction=0 (right, would go to col=8)
  - When: `FrameClock` advances 0.1s → tween completes
  - Then: `onTweenComplete` runs; `executeMove(playerId, 0)` attempted from new position `{0,7}`; `isValidCell({0,8})=false` → buffer consumed, no move; player remains at `{row:0,col:7}`
  - Edge cases: buffer holds valid direction from new position → move executes immediately; buffer holds direction=4 (left from `{0,7}` → `{0,6}`) → valid, executes

- **AC-PM-18 + AC-PM-18b**: Event timing
  - Given: `MockFrameClock` at `t=10.0`; player moves from `{3,3}` to `{3,4}`
  - When: `executeMove` called at `t=10.0`; clock advanced to `t=10.1`
  - Then: `PLAYER_MOVED` emitted at `t=10.0` with `timestamp=10.0 ±0.001`; `PLAYER_ARRIVED` emitted at `t=10.1` with `cell={3,4}` and `timestamp=10.1 ±0.001`; `PLAYER_ARRIVED` NOT emitted at `t=10.0`
  - Edge cases: two players moving simultaneously → each gets independent `PLAYER_ARRIVED` at own `t+0.1s`

---

## Test Evidence

**Story Type**: Logic
**Required evidence**: `tests/unit/playermovement/input_buffer_event_test.ts` — must exist and pass

**Status**: [ ] Not yet created

---

## Dependencies

- Depends on: Story 001 must be DONE (`isValidCell`, `computeTarget` required)
- Unlocks: Story 003 (death handling cancels `arrivedHandle` from this story)

## Completion Notes
**Completed**: 2026-04-22
**Criteria**: 7/7 passing (AC-PM-4, AC-PM-5, AC-PM-6, AC-PM-7, AC-PM-14, AC-PM-18, AC-PM-18b)
**Deviations**: None
**Test Evidence**: Logic: tests/unit/playermovement/input_buffer_event_test.ts — 16 tests, all pass
**Code Review**: Skipped (Lean mode)
