# Story 003: Runtime Validation + GRID_STALLED Chain

> **Epic**: PatternLibrary
> **Status**: Complete
> **Layer**: Core
> **Type**: Integration
> **Manifest Version**: 2026-04-22

## Context

**GDD**: `design/gdd/pattern-library.md`
**Requirements**: `TR-patternlibrary-005`, `TR-patternlibrary-006`, `TR-patternlibrary-007`
*(Requirement text lives in `docs/architecture/tr-registry.yaml` — read fresh at review time)*

**ADR Governing Implementation**: ADR-0009: GRID_STALLED 3자 체인 canonical 흐름
**ADR Decision Summary**: `PatternLibrary.getPattern(ctx, seed)` runs secondary runtime BFS validation (MIN_SAFE_CELLS=8 + single-region BFS) after `selectPattern()`. On failure: emit `PATTERN_REJECTED`, increment `failCount`. After 3 consecutive failures: emit `GRID_STALLED`. The `stalledFallback=true` path re-enters `getPattern()` with `ctx.tier` demoted by 1 (F-RE-3), retrying ×3 before re-emitting `GRID_STALLED`. All events emitted via EventBus flush queue — no synchronous calls to GridSimulation or RoundEscalation.

**Engine**: Cocos Creator 3.8.6 (TypeScript) | **Risk**: LOW
**Engine Notes**: Pure TypeScript BFS — no engine API. ADR-0001 EventBus flush queue prevents synchronous GRID_STALLED chain recursion structurally.

**Control Manifest Rules (Core layer)**:
- Required: runtime secondary validation — `64 - cells.length >= 8` AND BFS single connected region
- Required: 3 consecutive validation failures (across all `getPattern()` calls in a round) → emit `GRID_STALLED`
- Required: GRID_STALLED chain entirely via EventBus flush queue — no synchronous direct calls
- Forbidden: `setGatePeriod()` during GRID_STALLED chain
- Guardrail: GRID_STALLED chain max depth 9 frames (~150ms at 60fps)

---

## Acceptance Criteria

*From GDD `design/gdd/pattern-library.md`, scoped to this story:*

- [ ] **AC-PL-7**: `PATTERN_REJECTED { patternId, reason, timestamp }` emitted on runtime validation failure (MIN_SAFE_CELLS or BFS). Zero gate timers activated from the rejected pattern.
- [ ] **AC-PL-8**: After 3 consecutive validation failures in a round, `GRID_STALLED { roundNumber, timestamp }` emitted exactly once. `failCount` resets to 0 on `ROUND_STARTED`. Retry count is exactly 3 (not 2, not 4).
- [ ] **AC-PL-9**: `DifficultyContext.tier` value of `0` (invalid) → `PATTERN_REJECTED { reason: 'INVALID_TIER' }` emitted; tier=1 fallback re-selection attempted once; if re-selection also fails → `GRID_STALLED`.
- [ ] **EC-3 integration**: `stalledFallback=true` path — tier demoted by 1, `getPattern()` retried ×3 before re-emitting `GRID_STALLED`. Demotion from Tier 1 → stays Tier 1 (floor). All retry events emitted via EventBus (no synchronous chain).

---

## Implementation Notes

*Derived from ADR-0009 Implementation Guidelines:*

```typescript
// PatternLibrary.getPattern(ctx: DifficultyContext, seed: number, stalledFallback = false): void
//
// Step 0 — invalid tier guard (EC-4):
//   if (ctx.tier < 1 || ctx.tier > 3) {
//     emit PATTERN_REJECTED { patternId: null, reason: 'INVALID_TIER', timestamp: clock.now() }
//     ctx = { ...ctx, tier: 1 };  // fallback once
//   }
//
// Step 1 — select candidate:
//   const pattern = this.selectPattern(ctx, seed);  // Story 002
//   if (pattern === null) { this.handleFailure(ctx.roundNumber); return; }
//
// Step 2 — runtime secondary BFS validation:
//   const safeCells = ALL_COORDS.filter(c => !pattern.cells.some(g => cellEquals(g, c)));
//   if (safeCells.length < MIN_SAFE_CELLS) {
//     emit PATTERN_REJECTED { patternId: pattern.patternId, reason: 'MIN_SAFE_CELLS', timestamp: clock.now() }
//     this.handleFailure(ctx.roundNumber); return;
//   }
//   const bfsCount = bfs4(safeCells);
//   if (bfsCount !== safeCells.length) {
//     emit PATTERN_REJECTED { patternId: pattern.patternId, reason: 'BFS_DISCONNECTED', timestamp: clock.now() }
//     this.handleFailure(ctx.roundNumber); return;
//   }
//
// Step 3 — valid: hand off to GridSimulation via EventBus
//   emit PATTERN_READY { pattern, timestamp: clock.now() }
//   this.failCount = 0;
//
// handleFailure(roundNumber: number): void
//   this.failCount++;
//   if (this.failCount >= MAX_RETRY_COUNT) {
//     emit GRID_STALLED { roundNumber, timestamp: clock.now() }
//     this.failCount = 0;
//   }
//
// stalledFallback path (called by RoundEscalation handler on GRID_STALLED):
//   const demotedTier = Math.max(1, ctx.tier - 1) as 1|2|3;
//   this.getPattern({ ...ctx, tier: demotedTier }, seed, true);
//
// ROUND_STARTED handler: this.failCount = 0; this.recentIds = [];

// Constants:
export const MAX_RETRY_COUNT = 3;
export const MIN_SAFE_CELLS   = 8;  // shared with GridSimulation — must match
```

- `failCount` is per-round — reset on `ROUND_STARTED`.
- Secondary validation here is **defense-in-depth** on top of Story 001's build-time check. Runtime game state (e.g., occupied cells reducing effective safe zone) can cause patterns that were BFS-valid at build time to fail at runtime.
- `stalledFallback=true` is invoked by the RoundEscalation handler (Feature layer), which receives `GRID_STALLED` via EventBus, not via direct synchronous call.

---

## Out of Scope

*Handled by neighbouring stories — do not implement here:*

- **Story 001**: `PatternRecord` data, BFS algorithm in build-time test
- **Story 002**: `selectPattern()` candidate filtering and recency window
- **RoundEscalation** (Feature layer): GRID_STALLED handler, tier demotion decision (F-RE-3), `stalledFallback` invocation

---

## QA Test Cases

- **AC-PL-7**: PATTERN_REJECTED on validation failure
  - Given: a pattern with 57 gate cells (7 safe — fails MIN_SAFE_CELLS); `getPattern()` called; EventBus spy attached
  - When: `getPattern(ctx, seed)` executes runtime validation
  - Then: `PATTERN_REJECTED { reason: 'MIN_SAFE_CELLS', patternId, timestamp }` emitted once; `PATTERN_READY` NOT emitted; `failCount` incremented to 1
  - Edge cases: BFS-disconnected pattern (8 safe cells, 2 islands) → `PATTERN_REJECTED { reason: 'BFS_DISCONNECTED' }`; pattern with exactly 8 safe cells in connected line → passes validation

- **AC-PL-8**: GRID_STALLED after exactly 3 failures
  - Given: `getPattern` configured to always return invalid patterns (stub); EventBus spy
  - When: `getPattern` called 3 times in the same round
  - Then: `PATTERN_REJECTED` emitted 3 times; `GRID_STALLED { roundNumber, timestamp }` emitted exactly once after 3rd call; `failCount` reset to 0 after GRID_STALLED
  - Edge cases: 2 failures → reset via valid selection on 3rd → `failCount=0`, no GRID_STALLED; `ROUND_STARTED` between failures → `failCount` resets to 0; failures across tier boundaries still count

- **AC-PL-9**: Invalid tier fallback
  - Given: `ctx = { tier: 0, roundNumber: 3 }`; EventBus spy
  - When: `getPattern(ctx, seed)` called
  - Then: `PATTERN_REJECTED { reason: 'INVALID_TIER' }` emitted; re-attempt with `tier=1` executed; if tier=1 selection succeeds → `PATTERN_READY` emitted; if tier=1 also fails → `failCount` incremented
  - Edge cases: `tier=4` → same INVALID_TIER path; `tier=undefined` → same; tier=1 fallback itself hitting an empty pool → GRID_STALLED path

- **EC-3 stalledFallback integration**: Tier demotion + retry ×3
  - Given: `PatternLibrary` with EventBus and a mock RoundEscalation handler; all Tier 2 patterns made invalid (stub); `getPattern` called with `stalledFallback=true, tier=2`
  - When: handler demotes to tier=1, calls `getPattern` with `stalledFallback=true, tier=1`; Tier 1 patterns also invalid
  - Then: 3 `PATTERN_REJECTED` from Tier 1 → `GRID_STALLED` re-emitted; chain completed entirely via EventBus flush frames (no synchronous callstack overflow); max chain depth ≤ 9 frames
  - Edge cases: Tier 1 already (floor clamp) → re-selects from Tier 1 ×3 before GRID_STALLED; valid pattern found on 2nd retry → chain stops, `PATTERN_READY` emitted, `failCount` reset

---

## Test Evidence

**Story Type**: Integration
**Required evidence**: `tests/integration/patternlibrary/stalled_chain_test.ts` — must exist and pass

**Status**: [ ] Not yet created

---

## Dependencies

- Depends on: Story 001 (schema + data) and Story 002 (selectPattern) must be DONE; GridExplosion Story 001 must be DONE (EventBus integration requires functional GridSimulation state machine)
- Unlocks: Story 004 (playtest can only run once the full selection + validation pipeline is live)

## Completion Notes
**Completed**: 2026-04-22
**Criteria**: 4/4 passing (AC-PL-7, AC-PL-8, AC-PL-9, EC-3)
**Deviations**: `PatternLibrary` constructor extended to accept optional `clock` and `eventBus` params (pattern pool stays first arg — backward compatible). `stalledFallback` flag accepted but unused internally; retry counting via `failCount` is identical for both paths (RoundEscalation manages demotion). `PATTERN_REJECTED.patternId` changed to `string | null` in GameEvents to accommodate INVALID_TIER path.
**Test Evidence**: Integration: tests/integration/patternlibrary/stalled_chain_test.ts — 24 tests, all pass
**Code Review**: Skipped (Lean mode)
