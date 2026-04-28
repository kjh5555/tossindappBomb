# Epic: HUD (Heads-Up Display)

> **Layer**: Presentation
> **GDD**: *None — system is inferred per `design/gdd/systems-index.md` row 14. Acceptance criteria are sourced from ADR-0016 (AC-HUD-01 through AC-HUD-05) and round-manager.md event contract.*
> **Architecture Module**: `src/presentation/hud/` (RoundHUD per `docs/architecture/architecture.md`)
> **Status**: Ready
> **Stories**: Not yet created — run `/create-stories hud`

## Overview

HUD is the player-facing visual presentation layer for round state. It subscribes to RoundManager events (ROUND_STARTED, ALIVE_COUNT_CHANGED, ROUND_CLEAR, ROUND_END, GAME_OVER, GOAL_PLACED) and CELL_STATE_CHANGED events from GridSimulation, and renders the corresponding UI elements: round number label, alive count, timer, 8×8 grid cells, goal cell highlight, and result overlay (Game Over / Round Clear).

The HUD operates strictly within the Toss webview safe area as defined by `TossBridge.getSafeArea()` (ADR-0004 / ADR-0016). All HUD child nodes are positioned in HUDLayer-local coordinates — no direct screen coordinate references.

This epic delivers the **playable build** required by the Production → Polish gate. Without HUD, the round logic is invisible to players and the game cannot be playtested.

## Governing ADRs

| ADR | Decision Summary | Engine Risk |
|-----|-----------------|-------------|
| ADR-0016: HUD Safe Area + Audio 채널 분리 | HUDLayer(z:30)에 `applyInsets(safeArea)` 적용. 자식 노드는 HUDLayer 로컬 좌표만 사용. EventBus로 RoundManager 이벤트 구독. | MEDIUM (cc.AudioSource + webview visibility 3.8.6 verification needed) |
| ADR-0004: TossBridge | `bridge.getSafeArea()` 한 번 호출 → HUDLayer ContentSize/anchor 반영 | LOW |
| ADR-0011: Round Phase FSM | HUD가 구독하는 ROUND_STARTED/CLEAR/END/GAME_OVER 이벤트 계약 | LOW |
| ADR-0013: Survival Cycle-Revive | ALIVE_COUNT_CHANGED 이벤트 계약 (생존자 카운트 표시) | LOW |
| ADR-0015: DeathReplay Rendering | z-order 계약 (HUDLayer=30 > FairFeedbackLayer=20 > GridLayer=10) | LOW |

## GDD Requirements

*No dedicated TR-hud-NNN entries exist in `tr-registry.yaml`. Acceptance criteria are sourced directly from ADR-0016 § Validation Criteria and round-manager.md event contracts. A future `/architecture-review` should add TR-hud-001 through TR-hud-005 entries to the registry to formalize traceability.*

| Source | Requirement | ADR Coverage |
|--------|-------------|--------------|
| ADR-0016 AC-HUD-01 | 실기기에서 HUDLayer가 노치/홈바 영역을 침범하지 않음 | ADR-0016 ✅ |
| ADR-0016 AC-HUD-02 | StubTossBridge 인셋 적용 시 노드 position/size 정확 | ADR-0016 ✅ |
| ADR-0016 AC-HUD-03 | ROUND_STARTED 수신 시 라운드 번호 레이블 갱신 | ADR-0016 ✅ |
| (round-manager.md) | ALIVE_COUNT_CHANGED 수신 시 생존자 라벨 갱신 | ADR-0011/0013 ✅ |
| (round-manager.md) | timeRemaining 카운트다운 표시 | ADR-0011 ✅ |
| (grid-explosion.md) | CELL_STATE_CHANGED → 그리드 셀 색상 토글 | ADR-0006 ✅ |
| (round-manager.md) | GOAL_PLACED → 골 셀 시각 강조 | ADR-0011/0012 ✅ |
| (round-manager.md) | GAME_OVER / ROUND_CLEAR → 결과 오버레이 표시 | ADR-0011 ✅ |
| (sessionflow story-003) | Restart 버튼 → SessionFlow.reset() 호출 | (no ADR — stub pattern) |

**Untraced**: TR-hud entries do not yet exist in registry. Story files reference ADR-0016 AC-HUD-NN directly until `/architecture-review` formalizes them.

## Definition of Done

This epic is complete when:
- All stories are implemented, reviewed, and closed via `/story-done`
- All acceptance criteria from ADR-0016 (AC-HUD-01 ~ AC-HUD-05) are verified
- HUD renders the round state, grid, goal cell, and result overlay correctly on Toss webview target spec (≥30 fps)
- All Integration/UI stories have passing test files in `tests/integration/hud/`
- All Visual/Feel stories have evidence docs (screenshots) with sign-off in `production/qa/evidence/`
- Smoke check confirms playable build end-to-end
- `design/ux/hud.md` exists and is referenced by every implementation story (S5-M5 dependency)

## Stories

| # | Story | Type | Status | ADR |
|---|-------|------|--------|-----|
| 001 | [Round state display (round# + alive count + timer)](story-001-round-state-display.md) | Integration | Ready | ADR-0016 |
| 002 | [Grid render + Goal cell highlight](story-002-grid-render.md) | Integration | Ready | ADR-0016 + ADR-0015 |
| 003 | [Result overlay + Restart button](story-003-result-overlay.md) | Integration | Ready | ADR-0016 + ADR-0011 |

## Sprint 5 Story Plan (from `production/sprints/sprint-5.md`)

The following stories are pre-allocated to this epic:

- **story-001** (S5-M2): Round state display — round number, alive count, timer (UI / Integration)
- **story-002** (S5-M3): Grid render + goal cell highlight (UI / Visual-Feel)
- **story-003** (S5-M4): Result overlay (Game Over / Round Clear) + Restart button (UI / Integration)

## Next Step

Run `/create-stories hud` to break this epic into implementable story files at `production/epics/hud/story-001-*.md` through `production/epics/hud/story-003-*.md`.
