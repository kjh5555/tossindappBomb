# Story 003: Death Handling + Edge Cases

> **Epic**: PlayerMovement
> **Status**: Complete
> **Layer**: Core
> **Type**: Logic
> **Manifest Version**: 2026-04-22

## Context

**GDD**: `design/gdd/player-movement.md`
**Requirements**: `TR-playermovement-008`, `TR-playermovement-009`, `TR-playermovement-011`, `TR-playermovement-015`
*(Requirement text lives in `docs/architecture/tr-registry.yaml` — read fresh at review time)*

**ADR Governing Implementation**: ADR-0008: Player Movement Event Split + ADR-0005: CellCoord 정규화
**ADR Decision Summary**: On `PLAYER_KILLED`: cancel pending `PLAYER_ARRIVED` schedule via stored handle, clear input buffer, set player state to Dead — no further moves processed. On `ROUND_CLEAR`/`GAME_OVER`: snap active tween to destination immediately, cancel pending arrived schedule. Logical coord is the canonical position for all game logic (explosion, occupied-cell collision checks); visual position lags by up to 0.1s and is irrelevant for game outcomes.

**Engine**: Cocos Creator 3.8.6 (TypeScript) | **Risk**: MEDIUM
**Engine Notes**: `FrameClock.cancel(handle)` must exist — verify IFrameClock interface includes `cancel(handle)`. If using `cc.tween`, call `tween.stop()` on snap. If using manual lerp, set `tweenElapsed = MOVE_TWEEN_DURATION` to force completion.

**Control Manifest Rules (Core layer)**:
- Required: `PLAYER_KILLED` handler cancels pending `PLAYER_ARRIVED` schedule to prevent post-death Goal Cell hit
- Required: `ROUND_CLEAR`/`GAME_OVER` handler snaps tween and cancels pending arrived schedule
- Required: logical coord (set at `PLAYER_MOVED t=0`) is the only coord for explosion detection
- Forbidden: `CellIndex` in death logic — always `CellCoord`

---

## Acceptance Criteria

*From GDD `design/gdd/player-movement.md`, scoped to this story:*

- [ ] **AC-PM-8**: Dead state — after `PLAYER_KILLED` received, all subsequent move inputs are ignored; logical coord unchanged.
- [ ] **AC-PM-9**: Dead state buffer clear — `PLAYER_KILLED` received while buffer holds a direction: buffer cleared; no move executes after death.
- [ ] **AC-PM-11**: Source cell explosion during tween (EC-1) — while tween runs (player's logical coord already at destination), source cell transitions `Idle→Exploded`: player NOT killed (logical coord is at destination, not source).
- [ ] **AC-PM-13**: Landing on `EXPLODED` cell — player moves to a cell already in `EXPLODED` state: `PLAYER_KILLED { cause: 'DANGER_ZONE' }` emitted by GridSimulation immediately after logical coord update; verified via integration with GridSimulation.
- [ ] **AC-PM-15**: Cross movement (EC-4) — Player A moves `X→Y`, Player B moves `Y→X` simultaneously: both complete their moves; A at Y, B at X; no collision block; no occupied-cell rejection.
- [ ] **AC-PM-16**: Death + buffer same tick (EC-6) — `PLAYER_KILLED` received in same tick as buffered input: death processing runs first; buffer cleared; no move executes.
- [ ] **AC-PM-17**: Round end tween snap (EC-7) — `ROUND_CLEAR` or `GAME_OVER` received while tween active: visual position snaps to logical coord immediately; pending `PLAYER_ARRIVED` cancelled (no spurious Goal Cell detection post-round).
- [ ] **AC-PM-19**: Multi-player same cell — two players move to the same destination cell simultaneously: both succeed (no occupied-cell rejection for same-tick arrivals); both logical coords set to destination.

---

## Implementation Notes

*Derived from ADR-0008 Implementation Guidelines:*

```typescript
// PLAYER_KILLED handler:
onPlayerKilled(event: PlayerKilledEvent): void {
  const { playerIds } = event;
  for (const id of playerIds) {
    this.playerState[id] = 'Dead';
    this.inputBuffer[id] = null;           // AC-PM-9
    if (this.arrivedHandle[id] !== null) {
      this.clock.cancel(this.arrivedHandle[id]);  // AC-PM-8 — cancel PLAYER_ARRIVED
      this.arrivedHandle[id] = null;
    }
    this.tweenActive[id] = false;
  }
}

// ROUND_CLEAR / GAME_OVER handler:
onRoundEnd(): void {
  for (const [id, active] of Object.entries(this.tweenActive)) {
    if (active) {
      // AC-PM-17: snap visual to logical coord
      this.snapTween(id);  // sets tweenElapsed = MOVE_TWEEN_DURATION or stops cc.tween
      if (this.arrivedHandle[id] !== null) {
        this.clock.cancel(this.arrivedHandle[id]);  // cancel post-round PLAYER_ARRIVED
        this.arrivedHandle[id] = null;
      }
      this.tweenActive[id] = false;
    }
  }
}

// Move guard — check player state before any move:
executeMove(playerId, direction): void {
  if (this.playerState[playerId] === 'Dead') return;  // AC-PM-8
  // ... (Story 002 logic)
}

// AC-PM-11: EC-1 — source cell explosion during tween
// This is NOT handled by PlayerMovement. GridSimulation reads logicalCoord[playerId]
// (which is already at destination since t=0). The source cell explosion triggers
// GridSimulation death check against logicalCoord, which is destination — no death.

// AC-PM-19: same-cell simultaneous moves — no occupied-cell rejection for same-tick
// Occupied-cell rejection (TR-playermovement-011) applies to moves targeting a cell
// already occupied by another LIVE player at move-decision time. In the same tick,
// both moves are computed from prior positions — neither blocks the other.
// After both moves apply, both players share the cell. This is valid per EC-4.
```

- `arrivedHandle[playerId]` is the `IFrameClock` schedule handle from Story 002. This story adds the cancellation path.
- The `IFrameClock` interface must expose `cancel(handle: ScheduleHandle): void` — verify before implementing.
- Occupied-cell collision (TR-playermovement-011): reject a move to a cell currently occupied by another alive player at the time of move decision. This is a same-tick exception for EC-4 only — if A is at X and B is at X and C tries to move to X in a new input, C is blocked.

---

## Out of Scope

*Handled by neighbouring stories — do not implement here:*

- **Story 001**: Boundary rejection, direction mapping
- **Story 002**: `arrivedHandle` creation, tween logic, buffer management
- **Story 004**: Server MOVE message, remote player positions
- **GridExplosion Story 002**: `PLAYER_KILLED` event emission itself — PlayerMovement only *receives* it

---

## QA Test Cases

- **AC-PM-8 + AC-PM-9**: Dead state
  - Given: player alive; buffer holds direction=2; `PLAYER_KILLED { playerIds:[id] }` received
  - When: `onPlayerKilled` processes; then direction=0 input; then tween time elapses
  - Then: `playerState[id] === 'Dead'`; buffer = null; no `PLAYER_MOVED` emitted after death; logical coord unchanged
  - Edge cases: `PLAYER_KILLED` for a player not currently tweening — still sets Dead state; dead player input ignored even after round restarts (state reset required at round start)

- **AC-PM-11**: Source cell explosion during tween (EC-1)
  - Given: player at `{3,3}` starts move to `{3,4}`; `logicalCoord = {3,4}` at `t=0`; at `t=0.05s`, `GridSimulation` checks death for `{3,3}` (Idle→Exploded)
  - When: GridSimulation explosion detection runs at `t=0.05s`
  - Then: `getLogicalCoord(playerId) === {3,4}` (not `{3,3}`); `cellEquals(logicalCoord, {3,3}) === false`; player NOT killed
  - Edge cases: player moves TO a cell that simultaneously explodes → `{3,4}` explodes at same tick as move → `PLAYER_KILLED` with `cause='EXPLOSION'` (GridSimulation story 002 AC-5)

- **AC-PM-16**: Death + buffer same tick (EC-6)
  - Given: player tweening; buffer=direction=2; in same `update(dt)` call: `PLAYER_KILLED` received and buffer input would execute
  - When: frame update processes both events
  - Then: death handler runs first (event priority); buffer cleared; no move; `PLAYER_ARRIVED` cancelled
  - Edge cases: `PLAYER_KILLED` arrives mid-tween vs. at tween boundary — both cancel arrived

- **AC-PM-17**: Round end tween snap
  - Given: player at logical `{3,4}`, visual lerp at 50% between `{3,3}` and `{3,4}`; `ROUND_CLEAR` received; `arrivedHandle` active
  - When: `onRoundEnd()` processes
  - Then: visual position snaps to `{3,4}` (logical coord position); `arrivedHandle` cancelled; no `PLAYER_ARRIVED` emitted; `tweenActive = false`
  - Edge cases: `GAME_OVER` same as `ROUND_CLEAR`; multiple players in tween simultaneously → all snapped

- **AC-PM-15 + AC-PM-19**: Cross movement and same-cell arrival
  - Given: Player A at `{3,3}`, Player B at `{3,4}`; A moves right (→ `{3,4}`), B moves left (← `{3,3}`) same tick
  - When: both `executeMove` calls processed
  - Then: `logicalCoord[A] === {3,4}`; `logicalCoord[B] === {3,3}`; both `PLAYER_MOVED` emitted; no occupied-cell rejection (swap is valid per EC-4)
  - Edge cases: Player C tries to move to `{3,3}` in same tick as A+B swap — C is blocked if `{3,3}` was A's old position (now B's destination)

---

## Test Evidence

**Story Type**: Logic
**Required evidence**: `tests/unit/playermovement/death_edge_cases_test.ts` — must exist and pass

**Status**: [ ] Not yet created

---

## Dependencies

- Depends on: Story 001 and Story 002 must be DONE
- Unlocks: Story 004 (server authority builds on full local movement pipeline)

## Completion Notes
**Completed**: 2026-04-22
**Criteria**: 8/8 passing (AC-PM-8, AC-PM-9, AC-PM-11, AC-PM-13, AC-PM-15, AC-PM-16, AC-PM-17, AC-PM-19)
**Deviations**: `onPlayerKilled(playerIds: PlayerId[])` takes array directly rather than wrapped event object (no `PlayerKilledEvent` type exists yet — functionally equivalent). `cancelSchedule(fn)` used instead of `clock.cancel(handle)` — handle IS the fn reference in this implementation.
**Test Evidence**: Logic: tests/unit/playermovement/death_edge_cases_test.ts — 43 tests, all pass
**Code Review**: Skipped (Lean mode)
