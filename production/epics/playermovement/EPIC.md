# Epic: PlayerMovement

> **Layer**: Core
> **GDD**: design/gdd/player-movement.md
> **Architecture Module**: `src/core/player/PlayerMovement.ts`
> **Status**: Ready
> **Stories**: 5 stories created (2026-04-22)

## Overview

PlayerMovement translates floating joystick touch input into deterministic grid moves. It owns the logical CellCoord map for all players, the PLAYER_MOVED (t=0, logical coord update) / PLAYER_ARRIVED (t=0.1s, tween complete) event split, input buffering during tweens (single queued direction), grid boundary and occupied-cell rejection, and the server message pipeline (MOVE sent to server; remote PLAYER_MOVE broadcast applied locally). On PLAYER_KILLED it cancels pending PLAYER_ARRIVED schedules and clears the input buffer. On ROUND_CLEAR / GAME_OVER it snaps active tweens and cancels arrivals. The 8-way Direction8 floating joystick uses JOY_THRESHOLD=18px deadzone and MOVE_REPEAT=0.22s hold-to-repeat cadence.

## Governing ADRs

| ADR | Decision Summary | Engine Risk |
|-----|-----------------|-------------|
| ADR-0005: CellCoord Normalization | `CellCoord = {row:0-7, col:0-7}` canonical; boundary rejection drops move silently; cellEquals/isValidCell helpers | LOW |
| ADR-0008: Player Movement Event Split | PLAYER_MOVED at t=0 (logical, explosion detection uses this); PLAYER_ARRIVED via FrameClock.schedule(0.1s) (Goal Cell detection uses this); PLAYER_KILLED cancels pending arrived | MEDIUM (tween) |
| ADR-0010: Server Authority | Client sends MOVE { direction, fromCell: CellIndex, timestamp: simulatedTime }; server PLAYER_MOVE broadcast triggers remote coord update; optimistic local apply | LOW |

## GDD Requirements

| TR-ID | Requirement | ADR Coverage |
|-------|-------------|--------------|
| TR-playermovement-001 | Direction8 8-way movement (N, NE, E, SE, S, SW, W, NW) | ADR-0005 ✅ |
| TR-playermovement-002 | Floating joystick input with JOY_THRESHOLD = 18px deadzone | ADR-0008 ✅ |
| TR-playermovement-003 | MOVE_REPEAT = 0.22s hold-to-repeat cadence | ADR-0008 ✅ |
| TR-playermovement-004 | Logical coord (CellCoord) updates immediately at t=0 on valid input (before visual tween) | ADR-0008 ✅ |
| TR-playermovement-005 | PLAYER_MOVED { playerId, from, to, timestamp } emitted at t=0; explosion detection uses this logical coord | ADR-0008 ✅ |
| TR-playermovement-006 | MOVE_TWEEN_DURATION = 0.1s visual tween from source cell to target cell | ADR-0008 ✅ |
| TR-playermovement-007 | PLAYER_ARRIVED { playerId, cell, timestamp } emitted at t=0.1s via FrameClock.schedule; triggers Goal Cell detection | ADR-0008 ✅ |
| TR-playermovement-008 | PLAYER_KILLED handler cancels pending PLAYER_ARRIVED schedule to prevent post-death Goal hit | ADR-0008 ✅ |
| TR-playermovement-009 | ROUND_CLEAR / GAME_OVER handler snaps active tween and cancels pending arrived schedule | ADR-0008 ✅ |
| TR-playermovement-010 | Grid boundary rejection: out-of-range CellCoord is dropped, no PLAYER_MOVED emitted | ADR-0005 ✅ |
| TR-playermovement-011 | Occupied-cell collision: input toward a cell occupied by another live player is rejected | ADR-0008 ✅ |
| TR-playermovement-012 | Client sends MOVE { direction, fromCell: CellIndex, timestamp: simulatedTime } to server | ADR-0010 ✅ |
| TR-playermovement-013 | Remote PLAYER_MOVE broadcast triggers local-side logical coord update for remote player | ADR-0010 ✅ |
| TR-playermovement-014 | Input buffering during tween (single queued direction); buffer cleared on PLAYER_KILLED | ADR-0008 ✅ |
| TR-playermovement-015 | EC-1: explosion on source cell during tween does not kill player (logical coord already moved) | ADR-0008 ✅ |

## Definition of Done

This epic is complete when:
- All stories are implemented, reviewed, and closed via `/story-done`
- All acceptance criteria from `design/gdd/player-movement.md` are verified
- All Logic and Integration stories have passing test files in `tests/unit/playermovement/` or `tests/integration/core/`
- PLAYER_MOVED (t=0) / PLAYER_ARRIVED (t=0.1s) split verified: Goal Cell detection only fires on ARRIVED (TR-playermovement-007)
- EC-1 (source cell explosion during tween does not kill) verified via unit test (TR-playermovement-015)
- Tween-cancel on PLAYER_KILLED verified via unit test (TR-playermovement-008)

## Stories

| # | Story | Type | Status | ADR |
|---|-------|------|--------|-----|
| 001 | Direction8 Movement + Boundary + JOY_THRESHOLD | Logic | Ready | ADR-0005 |
| 002 | Input Buffering + Logical Coord + Event Split | Logic | Ready | ADR-0008 |
| 003 | Death Handling + Edge Cases | Logic | Ready | ADR-0008, ADR-0005 |
| 004 | Server Authority — MOVE Message + Remote Coord Update | Integration | Ready | ADR-0010 |
| 005 | Player Visual + Feel | Visual/Feel | Ready | ADR-0008 |

## Next Step

Run `/story-readiness production/epics/playermovement/story-001-direction-boundary.md` to validate before implementation.
