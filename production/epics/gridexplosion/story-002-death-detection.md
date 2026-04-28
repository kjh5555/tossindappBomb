# Story 002: Explosion Death Detection

> **Epic**: GridExplosion
> **Status**: Ready
> **Layer**: Core
> **Type**: Logic
> **Manifest Version**: 2026-04-22

## Context

**GDD**: `design/gdd/grid-explosion.md`
**Requirements**: `TR-gridexplosion-005`, `TR-gridexplosion-006`, `TR-gridexplosion-007`
*(Requirement text lives in `docs/architecture/tr-registry.yaml` — read fresh at review time)*

**ADR Governing Implementation**: ADR-0002: FrameClock 결정론적 시간 모델 + ADR-0005: CellCoord 정규화
**ADR Decision Summary**: Player logical position is determined by `CellCoord` (from `PLAYER_MOVED` at t=0). Death detection compares the player's **logical coord** against the exploding cell within the same frame update. Processing order within a frame is: move resolution first, then explosion detection — ensuring a player who moved away from a cell does not die even if that cell explodes in the same tick. `PLAYER_KILLED` carries `playerIds[]` (array) to support simultaneous deaths.

**Engine**: Cocos Creator 3.8.6 (TypeScript) | **Risk**: LOW
**Engine Notes**: Pure TypeScript logic — no engine API involved in death detection itself. `CellCoord` equality uses `cellEquals()` helper, never `===` object comparison.

**Control Manifest Rules (Core layer)**:
- Required: `CellCoord = { row: 0-7, col: 0-7 }` — never `CellIndex` in game logic
- Required: explosion detection uses logical coord (set at `PLAYER_MOVED` t=0), not visual position
- Required: `PLAYER_KILLED { playerIds: PlayerId[], cellId: CellCoord, cause, timestamp }` for all deaths
- Forbidden: `CellIndex` (number) in GridSimulation death logic — always use `CellCoord`
- Forbidden: `{x, y}` coordinate system for grid cells

---

## Acceptance Criteria

*From GDD `design/gdd/grid-explosion.md`, scoped to this story:*

- [ ] **AC-5** (EC-2): Player located on a gate cell that explodes in the same frame as the player's move input — player survives. Processing order: move resolution → explosion detection. Player's logical coord is the destination cell at detection time.
- [ ] **AC-6**: Player who moves **onto** an already-`EXPLODED` cell is killed immediately. `PLAYER_KILLED(playerId, cellId, cause='DANGER_ZONE')` emitted. Player transitions to dead state. No duplicate judgment.
- [ ] **AC-7**: Two players on the same cell when it explodes → both die. `PLAYER_KILLED { playerIds: [id1, id2], cellId, cause='EXPLOSION' }` emitted as a single event. Processing order A→B vs B→A yields identical result.
- [ ] **AC-8**: `cause` field accuracy — (a) player on cell at moment of `Idle→Exploded` transition → `cause='EXPLOSION'`; (b) player moves onto already-`EXPLODED` cell → `cause='DANGER_ZONE'`.

---

## Implementation Notes

*Derived from ADR-0002 + ADR-0005 Implementation Guidelines:*

```typescript
// Frame update ordering (ADR-0002 § 3.1 Frame Update Path):
// 1. TouchInput.update() → PlayerMovement processes logical coord change → PLAYER_MOVED emitted
// 2. GridSimulation.update(dt) → gate timers advance → transitions detected
// 3. Death detection: for each cell transitioning Idle→Exploded,
//    collect all players whose logicalPosition === explodingCell
//    → emit PLAYER_KILLED { playerIds: [...], cellId, cause: 'EXPLOSION', timestamp }
//
// Danger zone (DANGER_ZONE cause): when PlayerMovement applies a move
// and the destination cell is already EXPLODED:
//   getCellState(targetCell) === 'EXPLODED' → emit PLAYER_KILLED immediately
//   cause: 'DANGER_ZONE' (not 'EXPLOSION' — different trigger path)
//
// Simultaneous death (EC-1):
//   Collect ALL players at the exploding cell before emitting PLAYER_KILLED.
//   Single emit with playerIds[] array — never one emit per player.
//
// Double-death guard (handled in Story 004 edge cases):
//   GridSimulation must not re-judge already-dead players.
```

- Use `cellEquals(a, b)` from `CellCoord.ts` for all cell comparisons — never `a === b` (object identity fails).
- `PLAYER_KILLED` event is emitted by `GridSimulation` (death from explosion/danger zone). `PLAYER_KILLED` from server authority reconciliation is a separate path (ADR-0010, Story 004).
- The `PLAYER_KILLED` array design (not per-player events) is critical for "공정한 죽음" — simultaneous deaths are indistinguishable.

---

## Out of Scope

*Handled by neighbouring stories — do not implement here:*

- **Story 001**: Cell state machine, gate period timing, `setGatePeriod`
- **Story 003**: `applyPattern()`, `PATTERN_REJECTED`, `GRID_STALLED` chain
- **Story 004**: Double-death guard (AC-21), boundary coordinate rejection (AC-24), performance benchmarks (AC-19, AC-20)

---

## QA Test Cases

- **AC-5**: Move-first ordering (EC-2)
  - Given: player at `{row:3,col:3}`; gate cell `{row:3,col:3}` expires in ≤1 tick; player move input → `{row:3,col:4}` arrives same tick
  - When: `update(dt)` processes move first, then explosion detection
  - Then: `PLAYER_KILLED` NOT emitted; player at `{row:3,col:4}` (ALIVE); `CELL_EXPLODED` for `{row:3,col:3}` emitted with empty `killedPlayerIds[]`
  - Edge cases: player moves to destination that is also exploding → `DANGER_ZONE` death from destination; player move rejected (boundary) → stays on source → `EXPLOSION` death

- **AC-6**: Danger zone landing
  - Given: cell `{row:2,col:2}` is in `EXPLODED` state; player at `{row:2,col:1}` moves to `{row:2,col:2}`
  - When: `PlayerMovement` applies logical coord change, `getCellState({row:2,col:2}) === 'EXPLODED'`
  - Then: `PLAYER_KILLED { playerIds: [id], cellId: {row:2,col:2}, cause: 'DANGER_ZONE' }` emitted immediately; no duplicate
  - Edge cases: player moves to `IDLE` cell that becomes `EXPLODED` within same tick → `EXPLOSION` cause, not `DANGER_ZONE`; two players both land on same `EXPLODED` cell → single `PLAYER_KILLED` with both IDs

- **AC-7**: Simultaneous death array
  - Given: cell `{row:4,col:4}` with two players `p1` and `p2`; gate explodes
  - When: explosion detection runs (processing order p1 then p2, and p2 then p1)
  - Then: both orderings produce exactly 1 `PLAYER_KILLED` event; `playerIds` contains both `p1` and `p2`; both orderings produce identical events
  - Edge cases: 3 players on same cell; 0 players on exploding cell → `playerIds: []`, `PLAYER_KILLED` NOT emitted (AC-17)

- **AC-8**: `cause` field accuracy
  - Given: (a) player on gate cell at moment of `Idle→Exploded`; (b) player moves onto already-`EXPLODED` cell
  - When: explosion event fires for (a); move applied for (b)
  - Then: (a) `cause === 'EXPLOSION'`; (b) `cause === 'DANGER_ZONE'`; no null/undefined causes
  - Edge cases: server-reconciled kill (ADR-0010) uses separate path — not tested here

---

## Test Evidence

**Story Type**: Logic
**Required evidence**: `tests/unit/gridexplosion/death_detection_test.ts` — must exist and pass

**Status**: [ ] Not yet created

---

## Dependencies

- Depends on: Story 001 must be DONE (death detection requires functional cell state machine)
- Unlocks: Story 004 (edge cases build on death detection), Story 003 (independent — can be done in parallel)
