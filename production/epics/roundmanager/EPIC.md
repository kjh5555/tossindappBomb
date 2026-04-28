# Epic: RoundManager

> **Layer**: Feature
> **GDD**: design/gdd/round-manager.md
> **Architecture Module**: `src/features/round/RoundManager.ts`
> **Status**: Ready
> **Stories**: 2 stories created — see table below

## Overview

RoundManager implements the complete lifecycle of a single round: listening for `ROUND_STARTED`, placing the Goal Cell at the correct grid index (N-1 or N-2 depending on explosion timing), tracking each player's alive/spectator state as `PLAYER_KILLED` events arrive, and emitting the terminal events (`ROUND_CLEAR`, `GAME_OVER`, `ROUND_END`) that drive SessionFlow and the Presentation layer. It is a pure TypeScript state machine (4 states: IDLE → ROUND_ACTIVE → ROUND_CLEAR_DISPLAY / GAME_OVER) with no Cocos-specific dependencies, fully testable in Jest without an engine runtime.

## Governing ADRs

| ADR | Decision Summary | Engine Risk |
|-----|-----------------|-------------|
| ADR-0011: Round Phase FSM | 4-state FSM with whitelist-based event acceptance per state; round lifecycle driven entirely by EventBus events | LOW |
| ADR-0012: Goal Cell Tie-Break | Simultaneous Goal Cell arrival resolved by ascending PlayerId lexicographic order; deterministic and server-authoritative | LOW |
| ADR-0013: Survival Cycle-Revive | Players enter SPECTATOR state on death; all survivors are revived to ALIVE on ROUND_CLEAR; dead players remain dead on GAME_OVER | LOW |

## GDD Requirements

| TR-ID | Requirement | ADR Coverage |
|-------|-------------|--------------|
| TR-roundmanager-001 | Goal Cell placed at path index N-1; if N-1 explosion time < GATE_PERIOD, place at N-2 instead | ADR-0011 ✅ |
| TR-roundmanager-002 | Goal Cell triggers ROUND_CLEAR when any alive player arrives at the Goal Cell index | ADR-0011 ✅ |
| TR-roundmanager-003 | RoundManager emits ROUND_STARTED and calls setGatePeriod on the grid at round start | ADR-0011 ✅ |
| TR-roundmanager-004 | ROUND_CLEAR emitted immediately on Goal Cell arrival; ROUND_END emitted 1500ms later | ADR-0011 ✅ |
| TR-roundmanager-005 | GAME_OVER emitted when all tracked players are in SPECTATOR state | ADR-0011 ✅ |
| TR-roundmanager-006 | Round time limit is 60 seconds; GAME_OVER triggered on timer expiry if not already cleared | ADR-0011 ✅ |
| TR-roundmanager-007 | ROUND_CLEAR_DISPLAY_DURATION = 1500ms (from ROUND_CLEAR to ROUND_END) | ADR-0011 ✅ |
| TR-roundmanager-008 | EC-RM-5b: if GRID_STALLED fires during ROUND_ACTIVE, emit GAME_OVER → ROUND_END chain | ADR-0009 ✅ |

## Definition of Done

This epic is complete when:
- All stories are implemented, reviewed, and closed via `/story-done`
- All acceptance criteria from `design/gdd/round-manager.md` (AC-RM-01 through AC-RM-15) are verified
- All Logic and Integration stories have passing test files in `tests/`
- A single player can start a round, reach the Goal Cell, and trigger ROUND_CLEAR → ROUND_END in a Jest test environment
- A single player can die (all players killed) and trigger GAME_OVER → ROUND_END in a Jest test environment
- `production/sprint-status.yaml` stories S4-M2 and S4-M3 are marked `status: done`

## Stories

| # | Story | Type | Status | ADR |
|---|-------|------|--------|-----|
| 001 | [라운드 라이프사이클 + Goal Cell 배치](story-001-round-lifecycle-goal-cell.md) | Logic | Ready | ADR-0011, ADR-0012 |
| 002 | [플레이어 상태 추적 + 라운드 종료 조건](story-002-player-state-round-end.md) | Integration | Ready | ADR-0011, ADR-0013 |

## Next Step

Run `/story-readiness production/epics/roundmanager/story-001-round-lifecycle-goal-cell.md` to validate story-001 before implementation, then `/dev-story` to begin.
