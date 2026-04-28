# Story 003: Pattern Validation + GRID_STALLED Chain

> **Epic**: GridExplosion
> **Status**: Ready
> **Layer**: Core
> **Type**: Integration
> **Manifest Version**: 2026-04-22

## Context

**GDD**: `design/gdd/grid-explosion.md`
**Requirements**: `TR-gridexplosion-008`, `TR-gridexplosion-009`, `TR-gridexplosion-010`, `TR-gridexplosion-011`
*(Requirement text lives in `docs/architecture/tr-registry.yaml` — read fresh at review time)*

**ADR Governing Implementation**: ADR-0009: GRID_STALLED 3자 체인 canonical 흐름
**ADR Decision Summary**: `applyPattern()` validates `MIN_SAFE_CELLS=8` and BFS 4-directional connectivity before activating any gate timers. Failure emits `PATTERN_REJECTED`. After 3 consecutive rejections within a round, `GRID_STALLED` is emitted. The 3-way chain (PatternLibrary → RoundEscalation → PatternLibrary → GridSimulation) is handled entirely via EventBus flush queue — no synchronous recursion. GridSimulation's terminal action is `applyEmptyPattern()` when Tier 1 exhausts retries.

**Engine**: Cocos Creator 3.8.6 (TypeScript) | **Risk**: LOW
**Engine Notes**: Pure TypeScript BFS — no engine API. ADR-0001 EventBus flush queue prevents recursion structurally.

**Control Manifest Rules (Core layer)**:
- Required: runtime pattern validation — `64 - cells.length >= 8` AND BFS single connected region
- Required: 3 consecutive failures → `GRID_STALLED` emit
- Required: GRID_STALLED chain entirely via EventBus flush queue (no synchronous direct calls)
- Required: `GridSimulation.applyEmptyPattern()` as Tier 1 terminal handler
- Forbidden: GRID_STALLED chain implemented via synchronous direct call (PatternLibrary→RoundEscalation)
- Forbidden: `setGatePeriod()` during GRID_STALLED chain
- Guardrail: GRID_STALLED chain max depth 9 frames (~150ms at 60fps)

---

## Acceptance Criteria

*From GDD `design/gdd/grid-explosion.md`, scoped to this story:*

- [ ] **AC-9**: Valid pattern with exactly `MIN_SAFE_CELLS=8` Idle cells and BFS connectivity → `PATTERN_REJECTED` NOT emitted; all gate cells receive timers.
- [ ] **AC-10**: Pattern with 57 gate cells (only 7 safe cells) → `PATTERN_REJECTED(patternId)` emitted once; zero gate timers activated.
- [ ] **AC-11**: Pattern with 8 non-gate cells but disconnected (two separate islands, BFS fails) → `PATTERN_REJECTED(patternId)` emitted once; zero gate timers activated.
- [ ] **AC-12**: After `PATTERN_REJECTED`, simulation clock advances 3.0s → `GRID_STALLED` emitted exactly once within ±16ms of the 3.0s mark. (Integration with EventBus: GRID_STALLED reaches RoundEscalation handler, which emits `ESCALATION_COMPUTED(stalledFallback=true)`.)
- [ ] **EC-RM-5b integration**: `applyEmptyPattern()` can be called by the chain terminator; all gate cells revert to Idle; round continues without explosion until ROUND_CLEAR.

---

## Implementation Notes

*Derived from ADR-0009 Implementation Guidelines:*

```typescript
// applyPattern(p: ExplodePattern): void
// Step 1 — MIN_SAFE_CELLS check:
//   const safeCells = 64 - p.cells.length;
//   if (safeCells < MIN_SAFE_CELLS) { emit PATTERN_REJECTED; return; }
//
// Step 2 — BFS connectivity (F-5, 4-directional adjacent):
//   safeCellSet = all CellCoords NOT in p.cells
//   seed = safeCellSet[0]
//   bfsVisited = BFS from seed via 4-directional adjacency
//   if (bfsVisited.size !== safeCellSet.size) { emit PATTERN_REJECTED; return; }
//
// Step 3 — Activate gate timers:
//   for each cell in p.cells: assign gate timer with per-cell offset
//
// PATTERN_REJECTED counter (per-round):
//   increment failCount; if failCount >= 3: emit GRID_STALLED
//   reset failCount at ROUND_STARTED

// applyEmptyPattern(): void
//   Reset all gate cells to Idle; clear all gate timers for this round.
//   Called by chain terminator when Tier 1 fully exhausted.

// BFS adjacency: 4-directional only (|Δrow| + |Δcol| === 1)
// NOT 8-directional — GDD F-5 uses Manhattan distance = 1
```

- `applyPattern()` must NOT activate any timers if validation fails — the check must precede all timer allocation.
- `PATTERN_REJECTED` includes `{ patternId: string, reason: string, timestamp: number }`.
- The `failCount` counter is scoped per-round (reset on `ROUND_STARTED`).
- The 3.0s GRID_STALLED timeout starts from the moment of the 3rd consecutive rejection — implemented via `FrameClock.schedule(fn, 3.0)` that emits `GRID_STALLED`.

---

## Out of Scope

*Handled by neighbouring stories — do not implement here:*

- **Story 001**: Cell state machine cycling, gate period timing
- **Story 002**: Death detection (`PLAYER_KILLED`) when players hit exploding cells
- **Story 004**: Edge case EC-5 (`setGatePeriod` during Exploded state), EC-7 (boundary coords in pattern)
- **RoundEscalation**: GRID_STALLED handler and tier demotion (Feature layer, S2-S1)

---

## QA Test Cases

- **AC-9**: Valid 56-gate + 8-safe-connected pattern
  - Given: `ExplodePattern` with 56 cells; remaining 8 cells form a single connected region (verified BFS)
  - When: `applyPattern(p)` called
  - Then: `PATTERN_REJECTED` NOT emitted; 56 gate cells each have active timers; `getCellState(safeCell)` = `IDLE` for all 8 safe cells
  - Edge cases: exactly 8 safe cells (MIN boundary); safe cells in a single line (still connected); L-shaped safe region

- **AC-10**: MIN_SAFE_CELLS violation (57 gate cells)
  - Given: `ExplodePattern` with 57 cells (7 safe)
  - When: `applyPattern(p)` called
  - Then: `PATTERN_REJECTED { patternId, reason: 'MIN_SAFE_CELLS', timestamp }` emitted once; zero gate timers created; all cells remain `IDLE`
  - Edge cases: 64 gate cells (0 safe); 63 gate cells (1 safe)

- **AC-11**: BFS connectivity violation (disconnected islands)
  - Given: `ExplodePattern` where 8 non-gate cells form 2 separate 4-cell islands with no 4-directional path between them; `bfsVerified=false` in PatternRecord
  - When: `applyPattern(p)` called
  - Then: `PATTERN_REJECTED { reason: 'BFS_DISCONNECTED' }` emitted once; zero gate timers; all cells `IDLE`
  - Edge cases: 3 disconnected cells (1 island of 6, 1 isolated cell, 1 isolated cell); BFS with exactly 2 components

- **AC-12**: GRID_STALLED after 3 consecutive rejections + 3.0s
  - Given: 3 consecutive `applyPattern()` calls with invalid patterns; EventBus and RoundEscalation handler connected
  - When: `FrameClock` advances 3.0s after the 3rd rejection
  - Then: `GRID_STALLED { roundNumber, timestamp }` emitted exactly once ±16ms after 3.0s; `ESCALATION_COMPUTED { ctx: { stalledFallback: true } }` received by spy in the following flush frame
  - Edge cases: 2 rejections then 1 valid → counter resets, no GRID_STALLED; GRID_STALLED emitted mid-round (players still alive, timers keep running)

- **EC-RM-5b**: `applyEmptyPattern()` terminal
  - Given: GRID_STALLED chain exhausts Tier 1 (3 more failures after demotion)
  - When: chain terminator calls `applyEmptyPattern()`
  - Then: all 64 cells return `IDLE`; no gate timers active; no `CELL_STATE_CHANGED` from this call; round continues (ROUND_CLEAR from timeout or Goal Cell)
  - Edge cases: `applyEmptyPattern()` called when some cells are already `EXPLODED` → resets them to IDLE too

---

## Test Evidence

**Story Type**: Integration
**Required evidence**: `tests/integration/gridexplosion/pattern_validation_test.ts` — must exist and pass

**Status**: [ ] Not yet created

---

## Dependencies

- Depends on: Story 001 must be DONE (applyPattern builds on the state machine)
- Unlocks: Story 004 (EC-7 boundary coordinates in applyPattern)
