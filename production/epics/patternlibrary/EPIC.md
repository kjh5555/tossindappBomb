# Epic: PatternLibrary

> **Layer**: Core
> **GDD**: design/gdd/pattern-library.md
> **Architecture Module**: `src/core/patterns/PatternLibrary.ts`
> **Status**: Ready
> **Stories**: 4 stories created (2026-04-22)

## Overview

PatternLibrary is the data supply chain for all grid explosions. It maintains the static pattern catalog (T1/T2/T3 tiers, 6 patterns minimum per tier) loaded at startup via static import, selects a deterministic pattern per `DifficultyContext + seed` (same inputs → same output), enforces the N_recent recency window to prevent back-to-back repeats, and runs secondary runtime validation (MIN_SAFE_CELLS=8 + BFS single-region) before handing off a clean `ExplodePattern` to GridSimulation. On 3 consecutive validation failures it emits GRID_STALLED. It participates in the GRID_STALLED 3-way chain by re-selecting with a demoted tier when called with `stalledFallback=true` in the EscalationContext.

## Governing ADRs

| ADR | Decision Summary | Engine Risk |
|-----|-----------------|-------------|
| ADR-0007: Pattern Library Schema + Loading | Static import (no resources.load()); PatternRecord schema; T1/T2/T3 tier pool; N_recent window; ExplodePattern strip metadata; build-time BFS test | LOW |
| ADR-0009: GRID_STALLED 3-Way Chain | 3 consecutive failures → GRID_STALLED; stalledFallback=true path: demote tier via F-RE-3, retry ×3 before re-emitting GRID_STALLED | LOW |

## GDD Requirements

| TR-ID | Requirement | ADR Coverage |
|-------|-------------|--------------|
| TR-patternlibrary-001 | PatternRecord schema { patternId, cells: CellCoord[], tier: 1\|2\|3, category, symmetryAxis, bfsVerified: boolean } | ADR-0007 ✅ |
| TR-patternlibrary-002 | MIN_POOL_PER_TIER = 6; MVP initial set = T1×6 + T2×6 + T3×6 = 18 patterns | ADR-0007 ✅ |
| TR-patternlibrary-003 | N_recent = min(3, floor(pool/2)) — recently-used patterns excluded from candidate pool | ADR-0007 ✅ |
| TR-patternlibrary-004 | Deterministic pattern selection: candidates[seed % candidates.length] using server-provided seed | ADR-0007 ✅ |
| TR-patternlibrary-005 | Runtime secondary validation: safeCellCount >= 8 AND BFS single-region check before ExplodePattern delivery | ADR-0007 ✅ |
| TR-patternlibrary-006 | 3 consecutive validation failures → emit GRID_STALLED { roundNumber, timestamp } | ADR-0009 ✅ |
| TR-patternlibrary-007 | stalledFallback=true consumer: re-select with demoted tier, retry ×3 before re-emitting GRID_STALLED | ADR-0009 ✅ |
| TR-patternlibrary-008 | Build-time BFS unit test validates bfsVerified=true for every pattern in PatternData.ts | ADR-0007 ✅ |
| TR-patternlibrary-009 | Static import loading (PATTERNS: PatternRecord[]) — no async asset loading; no resources.load() | ADR-0007 ✅ |
| TR-patternlibrary-010 | ExplodePattern { cells: CellCoord[], patternId: string } — strip metadata before handoff to GridSimulation | ADR-0007 ✅ |
| TR-patternlibrary-011 | DifficultyContext { tier: 1\|2\|3, roundNumber: number } input to selectPattern(ctx, seed) | ADR-0007 ✅ |

## Definition of Done

This epic is complete when:
- All stories are implemented, reviewed, and closed via `/story-done`
- All acceptance criteria from `design/gdd/pattern-library.md` are verified
- All Logic stories have passing test files in `tests/unit/patternlibrary/`
- Build-time BFS validation test passes for all patterns in PatternData.ts (TR-patternlibrary-008)
- N_recent recency window correctly excludes recently-used patterns (TR-patternlibrary-003)
- stalledFallback path correctly demotes tier and retries (TR-patternlibrary-007)

## Stories

| # | Story | Type | Status | ADR |
|---|-------|------|--------|-----|
| 001 | Pattern Data Schema + Static Loading | Logic | Ready | ADR-0007 |
| 002 | Deterministic Pattern Selection + Recency Window | Logic | Ready | ADR-0007 |
| 003 | Runtime Validation + GRID_STALLED Chain | Integration | Ready | ADR-0009 |
| 004 | Playtest — Pattern Readability + Difficulty Gradient | Visual/Feel | Ready | ADR-0007 |

## Next Step

Run `/story-readiness production/epics/patternlibrary/story-001-pattern-data-schema.md` to validate before implementation.
