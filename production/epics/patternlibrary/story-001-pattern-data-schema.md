# Story 001: Pattern Data Schema + Static Loading

> **Epic**: PatternLibrary
> **Status**: Complete
> **Layer**: Core
> **Type**: Logic
> **Manifest Version**: 2026-04-22

## Context

**GDD**: `design/gdd/pattern-library.md`
**Requirements**: `TR-patternlibrary-001`, `TR-patternlibrary-002`, `TR-patternlibrary-009`, `TR-patternlibrary-010`
*(Requirement text lives in `docs/architecture/tr-registry.yaml` — read fresh at review time)*

**ADR Governing Implementation**: ADR-0007: Pattern Library Schema + Loading
**ADR Decision Summary**: Pattern data is a static TypeScript import (`PATTERNS: PatternRecord[]`) — no `resources.load()`, no async loading. `PatternRecord` carries full metadata including `bfsVerified: boolean` set at authoring time. `ExplodePattern` strips all metadata, delivering only `{ cells: CellCoord[], patternId: string }` to `GridSimulation`. Build-time CI test validates every record has `bfsVerified=true` and `64 - cells.length >= 8` before shipping.

**Engine**: Cocos Creator 3.8.6 (TypeScript) | **Risk**: LOW
**Engine Notes**: Static TypeScript import only — zero engine API involvement. No `cc.resources`, no bundle loading. Pattern data lives in `src/core/patterns/PatternData.ts` as a plain array constant.

**Control Manifest Rules (Core layer)**:
- Required: `PatternRecord` schema `{ patternId, cells: CellCoord[], tier: 1|2|3, category, symmetryAxis, bfsVerified: boolean }`
- Required: `ExplodePattern { cells: CellCoord[], patternId: string }` — no metadata exposed to GridSimulation
- Required: `MIN_POOL_PER_TIER = 6`; MVP distribution T1=7, T2=8, T3=5 (total 20)
- Forbidden: `resources.load()` or any async loading for pattern data
- Forbidden: `bfsVerified=false` records shipping in PatternData.ts (CI build gate)

---

## Acceptance Criteria

*From GDD `design/gdd/pattern-library.md`, scoped to this story:*

- [ ] **AC-PL-1**: Build-time BFS validation — all `PatternRecord.bfsVerified === true`. Unit test that runs as part of CI fails if any record has `bfsVerified=false`.
- [ ] **AC-PL-2**: Safe cell guarantee — all `PatternRecord` satisfy `64 - cells.length >= 8`. Unit test validates every record.
- [ ] **AC-PL-3**: MVP pattern count — total `PatternRecord` count = 20; Tier 1 = 7, Tier 2 = 8, Tier 3 = 5.
- [ ] **AC-PL-4**: Category coverage — all 5 categories (LINE, CROSS, DIAGONAL, ISLAND, COMPOSITE) present in all 3 tiers (15 minimum slots, each ≥ 1 record). 
- [ ] **AC-PL-11**: `ExplodePattern` contract — output `{ cells: CellCoord[], patternId: string }` exactly; all `cells` coords have `row ∈ [0,7]` and `col ∈ [0,7]`; no extra metadata fields.

---

## Implementation Notes

*Derived from ADR-0007 Implementation Guidelines:*

```typescript
// src/core/patterns/PatternData.ts
export const PATTERNS: PatternRecord[] = [
  {
    patternId: 'T1-LINE-H-001',
    cells: [ /* CellCoord[] — gate cells (not safe cells) */ ],
    tier: 1,
    category: 'LINE',
    symmetryAxis: 'H',
    bfsVerified: true,  // set manually at authoring time; CI validates
  },
  // ... 19 more records
];

// PatternRecord type (src/core/patterns/PatternTypes.ts):
export interface PatternRecord {
  patternId: string;          // unique: T{tier}-{category}-{axis}-{seq}
  cells: CellCoord[];         // gate cells (exploding cells)
  tier: 1 | 2 | 3;
  category: 'LINE' | 'CROSS' | 'DIAGONAL' | 'ISLAND' | 'COMPOSITE';
  symmetryAxis: 'H' | 'V' | 'HV' | 'NONE';
  bfsVerified: boolean;       // true = safe cells form single connected region
}

// ExplodePattern type (src/core/patterns/PatternTypes.ts):
export interface ExplodePattern {
  cells: CellCoord[];         // gate cells — safe cells are implicit (64 - cells)
  patternId: string;
}

// PatternLibrary.toExplodePattern(record: PatternRecord): ExplodePattern
toExplodePattern(record: PatternRecord): ExplodePattern {
  return { cells: record.cells, patternId: record.patternId };
}
// Note: ExplodePattern intentionally omits tier, category, symmetryAxis, bfsVerified.
// GridSimulation re-validates at runtime (defense-in-depth) via applyPattern().
```

- `cells` in `PatternRecord` are the **gate cells** (cells that will explode), NOT the safe cells.
- `bfsVerified` is set to `true` at pattern authoring time. The CI build test is an additional guard, not the only guard.
- `patternId` naming convention: `T{tier}-{CATEGORY}-{AXIS}-{seq3digit}` e.g. `T1-LINE-H-001`.
- Pattern data is imported at module load time — zero async initialization required.

---

## Out of Scope

*Handled by neighbouring stories — do not implement here:*

- **Story 002**: Pattern selection logic (`selectPattern()`, recency window, deterministic seed)
- **Story 003**: Runtime BFS validation, `PATTERN_REJECTED`, `GRID_STALLED` emission
- **Story 004**: Playtest readability and difficulty gradient

---

## QA Test Cases

- **AC-PL-1 + AC-PL-2**: Build-time data invariants
  - Given: `PATTERNS` array imported from `PatternData.ts`
  - When: unit test iterates all records
  - Then: every record has `bfsVerified === true`; every record has `64 - cells.length >= 8`; test fails fast on first violation with record `patternId` in the error message
  - Edge cases: empty `cells` array (cells.length=0 → N_safe=64 → valid but suspicious); exactly 56 cells (N_safe=8 → MIN_SAFE_CELLS exactly met)

- **AC-PL-3**: MVP count
  - Given: `PATTERNS` array
  - When: filter by tier
  - Then: total = 20; T1 count = 7; T2 count = 8; T3 count = 5
  - Edge cases: off-by-one (21 total or 19 total) → explicit count assertion

- **AC-PL-4**: Category coverage
  - Given: `PATTERNS` array
  - When: group by `(tier, category)` pairs
  - Then: all 15 slots `{tier:1..3} × {LINE,CROSS,DIAGONAL,ISLAND,COMPOSITE}` have count ≥ 1
  - Edge cases: COMPOSITE/Tier 1 (allowed to have exactly 1); ISLAND/Tier 3 (may have 2+ per GDD recommendation)

- **AC-PL-11**: ExplodePattern contract
  - Given: a `PatternRecord` with known `patternId` and `cells`
  - When: `PatternLibrary.toExplodePattern(record)` called
  - Then: result has exactly `{ cells, patternId }` — no `tier`, `category`, `symmetryAxis`, `bfsVerified` fields; all coords in cells satisfy `row ∈ [0,7]` and `col ∈ [0,7]`
  - Edge cases: record with `symmetryAxis: 'NONE'` → field absent from output; record with `bfsVerified: false` (invalid, but confirm it's stripped from output regardless)

---

## Test Evidence

**Story Type**: Logic
**Required evidence**: `tests/unit/patternlibrary/pattern_data_test.ts` — must exist and pass

**Status**: [ ] Not yet created

---

## Dependencies

- Depends on: None (first PatternLibrary story; pattern data is standalone)
- Unlocks: Story 002 (selection logic requires the data schema), Story 003 (validation requires the data + schema)

## Completion Notes
**Completed**: 2026-04-22
**Criteria**: 5/5 통과 (전부 자동 검증)
**Deviations**: ADVISORY — 패턴 수 20개 구현 (TR-002 기준 18개); PatternSymmetry 'HV' vs ADR 'BOTH' 표기 차이
**Test Evidence**: Logic: `tests/unit/patternlibrary/pattern_data_test.ts` — 11 tests passing
**Code Review**: Skipped — Lean mode
