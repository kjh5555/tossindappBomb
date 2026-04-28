# Story 002: Deterministic Pattern Selection + Recency Window

> **Epic**: PatternLibrary
> **Status**: Complete
> **Layer**: Core
> **Type**: Logic
> **Manifest Version**: 2026-04-22

## Context

**GDD**: `design/gdd/pattern-library.md`
**Requirements**: `TR-patternlibrary-003`, `TR-patternlibrary-004`, `TR-patternlibrary-011`
*(Requirement text lives in `docs/architecture/tr-registry.yaml` — read fresh at review time)*

**ADR Governing Implementation**: ADR-0007: Pattern Library Schema + Loading
**ADR Decision Summary**: `selectPattern(ctx: DifficultyContext, seed: number)` filters the pool to `bfsVerified=true` records for `ctx.tier`, removes the last `N_recent` used `patternId`s, then picks `candidates[seed % candidates.length]`. Same `seed` + same pool → same result every call. `N_recent = min(3, floor(tier_pool_size / 2))` auto-shrinks when the candidate pool narrows. `recentIds: string[]` is a per-session ring buffer capped at `MAX_RECENT_WINDOW=3`.

**Engine**: Cocos Creator 3.8.6 (TypeScript) | **Risk**: LOW
**Engine Notes**: Pure TypeScript — no engine API. Determinism depends only on the `seed` integer and array order, both of which are stable across platforms.

**Control Manifest Rules (Core layer)**:
- Required: `N_recent = min(3, floor(tier_pool_size / 2))` — computed per call, not cached
- Required: `selected_index = seed % candidates.length` — no `Math.random()`
- Required: `DifficultyContext { tier: 1|2|3, roundNumber: number }` as selection input
- Forbidden: `Math.random()` or any non-deterministic selection

---

## Acceptance Criteria

*From GDD `design/gdd/pattern-library.md`, scoped to this story:*

- [ ] **AC-PL-5**: Deterministic selection — `selectPattern(ctx, seed)` called 100 times with identical `ctx` and `seed` always returns the same `patternId`.
- [ ] **AC-PL-6**: Recency window active — within N_recent rounds, the same `patternId` is not selected again. Tier 1 pool of 7 → `N_recent=3`; Tier 3 pool of 5 → `N_recent=2`; verified by checking consecutive round outputs.
- [ ] **AC-PL-10**: N_recent auto-shrink — when `tier_pool_size=4`, `N_recent = min(3, floor(4/2)) = 2`; selection still succeeds without throwing; no "empty candidate pool" exception.
- [ ] **EC-5 passthrough**: First round (`roundNumber=1`, empty `recentIds`) — recency exclusion not applied; full tier pool available; normal selection proceeds.
- [ ] **EC-2 fallback**: If recency exclusion leaves 0 candidates, progressively reduce `N_recent` by 1 until candidates exist; if still 0 at `N_recent=0`, defer to Story 003's GRID_STALLED path.

---

## Implementation Notes

*Derived from ADR-0007 Implementation Guidelines:*

```typescript
// PatternLibrary.selectPattern(ctx: DifficultyContext, seed: number): ExplodePattern | null
//
// Step 1 — filter pool by tier + bfsVerified:
//   const tierPool = PATTERNS.filter(p => p.tier === ctx.tier && p.bfsVerified);
//   if (tierPool.length === 0) return null; // → Story 003 handles GRID_STALLED
//
// Step 2 — recency exclusion:
//   const nRecent = Math.min(MAX_RECENT_WINDOW, Math.floor(tierPool.length / 2));
//   const excluded = this.recentIds.slice(-nRecent);  // last N recent patternIds
//   let candidates = tierPool.filter(p => !excluded.includes(p.patternId));
//
//   // EC-2: progressively shrink if candidates empty
//   let window = nRecent;
//   while (candidates.length === 0 && window > 0) {
//     window--;
//     const exc = this.recentIds.slice(-window);
//     candidates = tierPool.filter(p => !exc.includes(p.patternId));
//   }
//   if (candidates.length === 0) return null; // → Story 003: GRID_STALLED
//
// Step 3 — deterministic pick:
//   const record = candidates[seed % candidates.length];
//
// Step 4 — update recentIds ring buffer:
//   this.recentIds.push(record.patternId);
//   if (this.recentIds.length > MAX_RECENT_WINDOW) this.recentIds.shift();
//
// Step 5 — strip metadata:
//   return this.toExplodePattern(record);

// Constants (src/core/patterns/PatternConstants.ts):
export const MAX_RECENT_WINDOW = 3;

// recentIds is reset on ROUND_STARTED each session (new game clears history)
// recentIds does NOT reset between rounds mid-session — recency persists across rounds
```

- `recentIds` is reset when a new game session starts, not between rounds.
- `seed` is a positive integer from the server (WebSocket). Modulo on `candidates.length` is safe as long as candidates is non-empty (guarded above).
- `selectPattern` returns `null` when the pool is empty — the caller (Story 003's `getPattern()`) handles null → GRID_STALLED escalation.

---

## Out of Scope

*Handled by neighbouring stories — do not implement here:*

- **Story 001**: `PatternRecord` schema, `PatternData.ts` static data, `toExplodePattern()`
- **Story 003**: `PATTERN_REJECTED` and `GRID_STALLED` event emission when `selectPattern` returns `null` or runtime validation fails
- **Story 004**: Playtest verification of pattern feel

---

## QA Test Cases

- **AC-PL-5**: Deterministic selection
  - Given: `PatternLibrary` with fixed 20-record dataset; `ctx = { tier: 1, roundNumber: 5 }`; `seed = 42`
  - When: `selectPattern(ctx, 42)` called 100 times (resetting `recentIds` between each call)
  - Then: all 100 calls return the same `patternId`; result is `PATTERNS.filter(t===1, bfsVerified)[42 % candidates.length].patternId`
  - Edge cases: `seed=0` → selects index 0; `seed = candidates.length` → wraps to index 0; `seed = Number.MAX_SAFE_INTEGER` → valid modulo result

- **AC-PL-6**: Recency window
  - Given: Tier 1 pool of 7 patterns (N_recent=3); simulate 5 consecutive rounds with different seeds
  - When: `selectPattern` called 5 times in sequence, updating `recentIds`
  - Then: none of the last 3 selected `patternId`s appears in the next selection's candidate pool; if forced seed would pick an excluded pattern, the exclusion overrides and a different pattern is selected
  - Edge cases: round 1 (empty recentIds → no exclusion); Tier 3 pool of 5 → N_recent=2

- **AC-PL-10**: N_recent auto-shrink
  - Given: custom 4-pattern pool for a tier (simulating depleted pool); `recentIds` has 3 entries
  - When: `selectPattern` called
  - Then: `N_recent = min(3, floor(4/2)) = 2` applied; only last 2 excluded; selection succeeds; no exception thrown
  - Edge cases: pool size 2 → N_recent=1; pool size 1 → N_recent=0 (no exclusion); pool size 0 → returns null (not a shrink case, handled by Story 003)

- **EC-5**: First round empty recency
  - Given: freshly constructed `PatternLibrary`; `recentIds = []`; `ctx = { tier: 2, roundNumber: 1 }`
  - When: `selectPattern(ctx, seed)` called
  - Then: no exclusion applied; full Tier 2 pool of 8 patterns is the candidate pool; deterministic pick by `seed % 8`
  - Edge cases: roundNumber=1 with non-empty recentIds (e.g., after session reset didn't clear) → test that only recentIds content matters, not roundNumber

- **EC-2**: Progressive N_recent shrink to zero
  - Given: 3-pattern pool; `recentIds = [P1, P2, P3]` (all 3 recent)
  - When: `selectPattern` called (N_recent starts at min(3, floor(3/2))=1; candidates = pool minus last 1 = 2 patterns — selection succeeds)
  - Then: successuful selection with reduced window; log or observable that window was shrunk
  - Edge cases: pool=2, recentIds=[A,B] — N_recent=1, exclude last 1, candidates=[A or B depending on which is less recent]; pool=1, recentIds=[A] — N_recent=0, full pool used

---

## Test Evidence

**Story Type**: Logic
**Required evidence**: `tests/unit/patternlibrary/pattern_selection_test.ts` — must exist and pass

**Status**: [ ] Not yet created

---

## Dependencies

- Depends on: Story 001 must be DONE (`PatternRecord` schema and `PATTERNS` data required)
- Unlocks: Story 003 (runtime validation calls `selectPattern` as the first step)

## Completion Notes
**Completed**: 2026-04-22
**Criteria**: 5/5 passing (AC-PL-5, AC-PL-6, AC-PL-10, EC-5, EC-2)
**Deviations**: `patternPool` constructor parameter added for testability (not in ADR, functionally equivalent — production default is PATTERNS)
**Test Evidence**: Logic: tests/unit/patternlibrary/pattern_selection_test.ts — 22 tests, all pass
**Code Review**: Skipped (Lean mode)
