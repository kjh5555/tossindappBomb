# Story 004: Event Schema + Edge Cases + Performance

> **Epic**: GridExplosion
> **Status**: Ready
> **Layer**: Core
> **Type**: Logic
> **Manifest Version**: 2026-04-22

## Context

**GDD**: `design/gdd/grid-explosion.md`
**Requirements**: `TR-gridexplosion-004`, `TR-gridexplosion-006`, `TR-gridexplosion-007`, `TR-gridexplosion-012`
*(Requirement text lives in `docs/architecture/tr-registry.yaml` — read fresh at review time)*

**ADR Governing Implementation**: ADR-0002: FrameClock 결정론적 시간 모델 + ADR-0005: CellCoord 정규화 + ADR-0006: Gate Period 튜닝
**ADR Decision Summary**: All timestamps must equal `clock.now()` at emission (±1ms). `CellCoord` boundary `{row:0-7, col:0-7}` — out-of-range coords emit `console.warn` and are silently ignored. `setGatePeriod()` preserves the current Exploded cell's remaining T_EX by only changing the period constant, never resetting phase offsets mid-cycle.

**Engine**: Cocos Creator 3.8.6 (TypeScript) | **Risk**: LOW
**Engine Notes**: Pure TypeScript logic — no engine API involved. Performance tests run via `performance.now()` in the test harness only (never in game code). `clock.now()` is the only time source in production code.

**Control Manifest Rules (Core layer)**:
- Required: `clock.now()` for all event timestamps; `Date.now()` / `performance.now()` forbidden in game logic
- Required: `CellCoord = { row: 0-7, col: 0-7 }` — out-of-bounds coords → `console.warn` + ignore
- Required: `CELL_EXPLODED { cellId, killedPlayerIds[] }` — single emit per cell transition, array may be empty
- Forbidden: `ROUND_END` emitted by GridSimulation — that is RoundManager's responsibility
- Forbidden: re-judging already-dead players (`playerIsAlive()` guard required before each death check)

---

## Acceptance Criteria

*From GDD `design/gdd/grid-explosion.md`, scoped to this story:*

- [ ] **AC-16**: `CELL_EXPLODED` event schema: when 2 players are on the same gate cell at `Idle→Exploded` — `cellId` matches, `killedPlayerIds[]` contains both IDs, event emitted exactly 1 time.
- [ ] **AC-17**: When no player is on an exploding cell — `PLAYER_KILLED` NOT emitted; `CELL_EXPLODED(cellId, [])` emitted once.
- [ ] **AC-18**: All events (`CELL_STATE_CHANGED`, `PLAYER_KILLED`, `CELL_EXPLODED`, `PATTERN_REJECTED`, `GRID_STALLED`) carry a `timestamp` field matching `clock.now()` at emission (±1ms).
- [ ] **AC-19**: `update(dt)` for 64 cells over 1,000 iterations — max execution time < 16.6ms; average < 4ms.
- [ ] **AC-20**: Worst-case 64-cell simultaneous `Idle→Exploded` transition in a single frame — execution time < 16.6ms; exactly 64 `CELL_STATE_CHANGED` and 64 `CELL_EXPLODED` events emitted.
- [ ] **AC-21**: Double-death guard — player already marked dead is excluded from subsequent explosion checks in the same frame; `PLAYER_KILLED` emitted exactly once regardless of how many cells explode simultaneously beneath them.
- [ ] **AC-22**: `setGatePeriod(1.6)` called while a gate cell has 0.3s T_EX remaining — residual `≈0.3s` preserved; next Idle duration = `1.6 - 0.35 = 1.25s`; phase offset unchanged.
- [ ] **AC-23**: When the last surviving player's cell explodes — `PLAYER_KILLED` and `CELL_EXPLODED` emitted normally; `ROUND_END` NOT emitted by GridSimulation; remaining cell timers continue running.
- [ ] **AC-24**: `ExplodePattern` containing out-of-range coords (`{row:-1,col:0}`, `{row:8,col:8}`) — `console.warn` issued for each invalid coord; valid coords processed normally; no exception thrown; system continues.

---

## Implementation Notes

*Derived from ADR-0002 + ADR-0005 + ADR-0006 Implementation Guidelines:*

```typescript
// AC-16 / AC-17: CELL_EXPLODED emit (always single emit, killedPlayerIds may be [])
// After collecting all players at the exploding cell:
//   const victims = players.filter(p => p.isAlive && cellEquals(p.logicalCoord, cellId));
//   if (victims.length > 0) emit PLAYER_KILLED { playerIds: victims.map(p=>p.id), cellId, cause:'EXPLOSION', timestamp: clock.now() }
//   emit CELL_EXPLODED { cellId, killedPlayerIds: victims.map(p=>p.id), timestamp: clock.now() }
// Note: CELL_EXPLODED is always emitted (even empty). PLAYER_KILLED only when victims.length > 0.

// AC-18: Timestamp requirement
// Every event emitter call must capture clock.now() once at the start of the transition,
// then pass the same captured value to all related events in that transition.
// Never call clock.now() twice for the same logical transition.

// AC-21: Double-death guard
// GridSimulation maintains a per-frame Set<PlayerId> of players already killed this tick.
// Before adding a player to victims: if (killedThisFrame.has(p.id)) skip.
// Clear killedThisFrame at the start of each update(dt).

// AC-22: setGatePeriod during Exploded (EC-5):
// setGatePeriod only updates this.gatePeriod constant.
// It does NOT reset any cell's offset or current phase accumulator.
// Phase formula: phase(t) = ((t + offset) % NEW_GATE_PERIOD + NEW_GATE_PERIOD) % NEW_GATE_PERIOD
// Remaining T_EX is the distance from current phase to SAFE_WIN — unchanged because
// the phase accumulator (t) has not been reset.

// AC-23: System boundary — no ROUND_END
// GridSimulation has no reference to RoundManager and no knowledge of
// survivor count. It never emits ROUND_END. Timer loop continues unconditionally
// until ROUND_CLEAR or ROUND_END arrives via EventBus from RoundManager.

// AC-24: Boundary check in applyPattern()
// for each coord in pattern.cells:
//   if (coord.row < 0 || coord.row > 7 || coord.col < 0 || coord.col > 7) {
//     console.warn(`applyPattern: out-of-range coord ${JSON.stringify(coord)} — ignored`);
//     continue;
//   }

// Performance (AC-19/AC-20):
// update(dt) iterates at most 64 cells with O(1) per-cell phase formula.
// No allocations inside the hot loop — pre-allocate victim arrays outside.
// Event emission deferred to EventBus flush queue (ADR-0001) — no synchronous recursion.
```

- `killedThisFrame` set is cleared at the top of every `update(dt)` call.
- `CELL_EXPLODED` is always emitted on `Idle→Exploded` transition (even with empty `killedPlayerIds`). It is the signal RoundManager uses to track explosion count.
- Performance budget: 64 cells × O(1) phase formula = O(64). Target < 1ms per frame; < 16.6ms is the hard ceiling.

---

## Out of Scope

*Handled by neighbouring stories — do not implement here:*

- **Story 001**: Cell state machine cycling, gate period timing, `setGatePeriod` range guard
- **Story 002**: Basic `PLAYER_KILLED` path (AC-5/6/7/8) — AC-21 extends but does not replace it
- **Story 003**: `applyPattern()` BFS validation, `PATTERN_REJECTED`, `GRID_STALLED` chain
- **RoundManager**: Survivor count tracking, `ROUND_END` decision — explicitly out of GridSimulation scope

---

## QA Test Cases

- **AC-16**: CELL_EXPLODED schema — 2 players same cell
  - Given: 2 players `p1`, `p2` at `{row:3,col:3}`; gate cell `{row:3,col:3}` transitions `Idle→Exploded`
  - When: `update(dt)` triggers the transition
  - Then: `CELL_EXPLODED` emitted exactly 1 time; `killedPlayerIds` = `[p1.id, p2.id]` (order irrelevant); `cellId` = `{row:3,col:3}`; `PLAYER_KILLED` emitted 1 time with `playerIds: [p1.id, p2.id]`
  - Edge cases: 3 players same cell → single CELL_EXPLODED with 3 IDs; 0 players → CELL_EXPLODED with `[]`

- **AC-17**: No PLAYER_KILLED when cell empty
  - Given: gate cell `{row:0,col:0}` transitions `Idle→Exploded`; no player at that coord
  - When: `update(dt)` triggers transition
  - Then: `PLAYER_KILLED` emitted 0 times; `CELL_EXPLODED({row:0,col:0}, [])` emitted 1 time
  - Edge cases: all 64 gate cells explode simultaneously with no players → 64 CELL_EXPLODED events, 0 PLAYER_KILLED

- **AC-18**: Timestamp on all events
  - Given: `MockFrameClock` pinned to `t=5.500`; gate cell transitioning `Idle→Exploded` with a player on it
  - When: `update(dt)` triggers transition at pinned time
  - Then: `CELL_STATE_CHANGED.timestamp === 5.500 ± 0.001`; `PLAYER_KILLED.timestamp === 5.500 ± 0.001`; `CELL_EXPLODED.timestamp === 5.500 ± 0.001`
  - Edge cases: `PATTERN_REJECTED.timestamp` matches clock at `applyPattern()` call time; `GRID_STALLED.timestamp` matches clock at 3rd-rejection schedule time

- **AC-19**: Performance — 1,000 update iterations
  - Given: `GridSimulation` with 32 gate cells in mixed IDLE/EXPLODED states
  - When: `update(0.016)` called 1,000 times in a tight loop; measure wall-clock via `performance.now()` in test only
  - Then: max single-iteration time < 16.6ms; total / 1000 (average) < 4ms
  - Edge cases: all 64 cells in IDLE; all 64 in EXPLODED (no transitions); mixed mid-transition

- **AC-20**: Worst-case 64-cell simultaneous explosion
  - Given: 64 gate cells all with `offset=0` and `GATE_PERIOD=2.0`; clock advances to trigger all simultaneously
  - When: single `update(dt)` frame
  - Then: `CELL_STATE_CHANGED` count = 64; `CELL_EXPLODED` count = 64; wall-clock time < 16.6ms
  - Edge cases: all 64 have players on them → 64 PLAYER_KILLED (or batched per-cell single emits); note: 64-gate pattern would fail MIN_SAFE_CELLS check in production, but performance test bypasses applyPattern

- **AC-21**: Double-death guard
  - Given: player `p1` is at `{row:2,col:2}`; two gate cells `{row:2,col:2}` and `{row:2,col:2}` (same coord, impossible in practice) OR test via two cells `{row:2,col:2}` and a separate cell forcing a re-evaluation; simulate by having `killedThisFrame` populated before second cell check
  - When: explosion detection runs for both cells
  - Then: `PLAYER_KILLED` emitted exactly 1 time containing `p1.id`; second check skips `p1` due to `killedThisFrame` guard
  - Edge cases: 3 cells all beneath same player → still 1 PLAYER_KILLED; player at non-exploding cell → not in killedThisFrame

- **AC-22**: setGatePeriod preserves Exploded residual
  - Given: gate cell entered EXPLODED at `t=10.0`; `T_EX=0.35s`; at `t=10.05` (0.3s remaining) call `setGatePeriod(1.6)`
  - When: clock advances to `t=10.35`
  - Then: cell transitions back to IDLE at `t≈10.35 ±0.016`; next explosion at `t≈10.35 + 1.25 = 11.60 ±0.016`
  - Edge cases: `setGatePeriod` called at exact EXPLODED entry → full T_EX preserved; called at last tick of EXPLODED → immediate transition handled correctly

- **AC-23**: No ROUND_END from GridSimulation
  - Given: 1 player `p1` alive at `{row:4,col:4}`; gate cell `{row:4,col:4}` transitions `Idle→Exploded`; EventBus spy attached to all event types
  - When: `update(dt)` processes the transition
  - Then: `PLAYER_KILLED` emitted; `CELL_EXPLODED` emitted; `ROUND_END` NOT emitted; spy confirms no ROUND_END event; remaining gate timers continue advancing on subsequent `update(dt)` calls
  - Edge cases: all 6 players die simultaneously → still no ROUND_END from GridSimulation

- **AC-24**: Out-of-bounds coordinate rejection
  - Given: `ExplodePattern` with cells `[{row:-1,col:0}, {row:3,col:3}, {row:8,col:8}, {row:0,col:-1}]`
  - When: `applyPattern(p)` called
  - Then: `console.warn` called for each of the 3 invalid coords; `{row:3,col:3}` processed normally as a gate cell; no exception thrown; `getCellState({row:3,col:3})` reflects gate status
  - Edge cases: all 64 coords invalid → warn 64 times, no gate cells activated; `{row:7,col:7}` is valid (inclusive boundary)

---

## Test Evidence

**Story Type**: Logic
**Required evidence**: `tests/unit/gridexplosion/events_edge_cases_test.ts` — must exist and pass

**Status**: [ ] Not yet created

---

## Dependencies

- Depends on: Story 001 (state machine) and Story 002 (death detection) must be DONE
- Unlocks: None within this epic — Story 004 closes the GridExplosion Logic story set
