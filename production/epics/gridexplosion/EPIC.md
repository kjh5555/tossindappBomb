# Epic: GridExplosion

> **Layer**: Core
> **GDD**: design/gdd/grid-explosion.md
> **Architecture Module**: `src/core/grid/GridSimulation.ts`
> **Status**: Ready
> **Stories**: 5 stories created (2026-04-22)

## Overview

GridSimulation owns the 8×8 cell state machine that drives GRID REAPER's core danger loop. Each cell cycles through Idle → Exploded states on a deterministic gate-period timer sourced from FrameClock.simulatedTime. The module accepts an ExplodePattern from PatternLibrary via `applyPattern()`, validates MIN_SAFE_CELLS=8 and BFS single-region connectivity at runtime, and emits CELL_STATE_CHANGED, CELL_EXPLODED, PLAYER_KILLED, PATTERN_REJECTED, and GRID_STALLED events through EventBus. `setGatePeriod()` is called once per round by RoundEscalation immediately before ROUND_STARTED is emitted. Player death detection compares each player's logical CellCoord (from PLAYER_MOVED, t=0) against the exploding cell set within the same frame.

## Governing ADRs

| ADR | Decision Summary | Engine Risk |
|-----|-----------------|-------------|
| ADR-0002: FrameClock Deterministic Time | `simulatedTime += dt` per tick; `nextExplosionTime` uses `frameClock.now()`, never `Date.now()` | LOW |
| ADR-0005: CellCoord Normalization | `CellCoord = {row:0-7, col:0-7}` canonical; `CellIndex = row*8+col` serialization-only | LOW |
| ADR-0006: Gate Period Tuning | `setGatePeriod(s)` accepts `[1.4, 2.0]` only; out-of-range rejected with warn; atomic apply before ROUND_STARTED | LOW |
| ADR-0009: GRID_STALLED 3-Way Chain | 3 consecutive PATTERN_REJECTED → GRID_STALLED; chain: PatternLibrary → RoundEscalation → PatternLibrary → GridSimulation empty-pattern terminator | LOW |

## GDD Requirements

| TR-ID | Requirement | ADR Coverage |
|-------|-------------|--------------|
| TR-gridexplosion-001 | Cell state machine: Idle → Warn → Danger → Explode → Cooldown → Idle (cyclic) | ADR-0002 ✅ |
| TR-gridexplosion-002 | CELL_STATE_CHANGED event on every state transition (cellId, fromState, toState, timestamp) | ADR-0001 ✅ |
| TR-gridexplosion-003 | Explosion timing accuracy ±16ms against simulatedTime | ADR-0002 ✅ |
| TR-gridexplosion-004 | setGatePeriod(s) accepts [GATE_PERIOD_FLOOR=1.4, GATE_PERIOD_BASE=2.0]; out-of-range rejected | ADR-0006 ✅ |
| TR-gridexplosion-005 | Player movement resolves logical coord before explosion detection within same frame | ADR-0002 ✅ |
| TR-gridexplosion-006 | PLAYER_KILLED emitted with cause='EXPLOSION' or 'DANGER_ZONE'; cellId + playerIds[] + timestamp | ADR-0001 ✅ |
| TR-gridexplosion-007 | Simultaneous death: PLAYER_KILLED { playerIds: PlayerId[] } supports array of victims at the same cell | ADR-0001 ✅ |
| TR-gridexplosion-008 | MIN_SAFE_CELLS = 8 — pattern candidate rejected if 64 - cells.length < 8 | ADR-0009 ✅ |
| TR-gridexplosion-009 | BFS connectivity check: safe cells form a single connected region on 8×8 grid | ADR-0009 ✅ |
| TR-gridexplosion-010 | PATTERN_REJECTED on runtime validation failure; GRID_STALLED after 3 consecutive failures | ADR-0009 ✅ |
| TR-gridexplosion-011 | Empty-pattern round skip: GridSimulation.applyEmptyPattern() when Tier 1 exhausts retries | ADR-0009 ✅ |
| TR-gridexplosion-012 | T_EX = 0.35s fixed explosion duration, independent of GATE_PERIOD | ADR-0002 ✅ |
| TR-gridexplosion-013 | SAFE_WIN(R) = GATE_PERIOD(R) − T_EX ≥ 0.45s invariant for all rounds | ADR-0006 ✅ |

## Definition of Done

This epic is complete when:
- All stories are implemented, reviewed, and closed via `/story-done`
- All acceptance criteria from `design/gdd/grid-explosion.md` are verified
- All Logic and Integration stories have passing test files in `tests/unit/gridexplosion/` or `tests/integration/core/`
- `GridSimulation` passes ±16ms timing accuracy on simulatedTime (TR-gridexplosion-003)
- MIN_SAFE_CELLS and BFS validation fire correctly on applyPattern (TR-gridexplosion-008/009)
- GRID_STALLED chain resolves correctly after 3 consecutive rejections (TR-gridexplosion-010)

## Stories

| # | Story | Type | Status | ADR |
|---|-------|------|--------|-----|
| 001 | Cell State Machine + Gate Period Timing | Logic | Ready | ADR-0002, ADR-0006 |
| 002 | Explosion Death Detection | Logic | Ready | ADR-0002, ADR-0005 |
| 003 | Pattern Validation + GRID_STALLED Chain | Integration | Ready | ADR-0009 |
| 004 | Event Schema + Edge Cases + Performance | Logic | Ready | ADR-0002, ADR-0005, ADR-0006 |
| 005 | Grid Cell Visual Rendering | Visual/Feel | Ready | N/A (engine-native) |

## Next Step

Run `/story-readiness production/epics/gridexplosion/story-001-cell-state-machine.md` to validate before implementation.
