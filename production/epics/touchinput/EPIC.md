# Epic: TouchInput

> **Layer**: Foundation
> **GDD**: N/A — `design/gdd/player-movement.md` 참조
> **Architecture Module**: `src/core/input/TouchInputAdapter.ts`
> **Status**: Ready — ADR-0017 Accepted (2026-04-22)
> **Stories**: 3 stories created (2026-04-22)
> **Manifest Version**: 2026-04-22

## Overview

TouchInput은 Cocos Creator의 터치 이벤트를 게임 도메인 이벤트(TAP_DETECTED)로 변환하는 Foundation 레이어 모듈이다. 터치 좌표 → CellCoord 변환, Direction8 8방향 계산, dead zone 필터링을 담당한다. ADR-0008(Player Movement)의 `onMoveInput()` 트리거 원천이다.

> ✅ **ADR-0017 Accepted** (2026-04-22): `IMovementHandler` 인터페이스 역전으로 Foundation↔Core 레이어 분리. JOY_THRESHOLD=18px, MOVE_REPEAT=0.22s 확정. Epic 언블록됨.

## Governing ADRs

| ADR | Decision Summary | Engine Risk |
|-----|-----------------|-------------|
| ADR-0017: TouchInput 터치 파이프라인 | TouchInputAdapter → IMovementHandler → PlayerMovement.tryMove(). 0-frame 입력 지연, 레이어 분리 | LOW |
| ADR-0008: Player Movement (참조) | PLAYER_MOVED(t=0) 트리거 — TouchInput TAP_DETECTED 소비 | LOW |
| ADR-0005: CellCoord | 터치 좌표 → CellCoord { row, col } 변환 기준 | LOW |

## GDD Requirements

> ⚠️ TR registry 비어 있음 + ADR 미작성. 요구사항은 game-concept.md + player-movement.md에서 추출.

| # | 요구사항 | ADR Coverage |
|---|---------|--------------|
| 1 | 터치 좌표 → 8×8 그리드 CellCoord 변환 | ❌ ADR 없음 |
| 2 | TAP_DETECTED `{ cell: CellCoord, timestamp }` 이벤트 발행 | ❌ ADR 없음 |
| 3 | Direction8 계산: 현재 플레이어 위치 → 터치 위치 → 8방향 중 가장 가까운 방향 | ❌ ADR 없음 |
| 4 | Dead zone: 최소 셀 반경(%) 이하 tap은 무시 | ❌ ADR 없음 |
| 5 | 멀티터치 무시 — 첫 터치만 처리 | ❌ ADR 없음 |

## Definition of Done

This epic is complete when:
- ADR `/architecture-decision touch-input` Accepted 상태로 존재
- All stories are implemented, reviewed, and closed via `/story-done`
- TAP_DETECTED 이벤트가 그리드 범위 내 터치에서만 발행됨 (단위 테스트)
- Dead zone 이하 터치는 이벤트 미발행 (단위 테스트)
- All Logic stories have passing test files in `tests/unit/input/`

## Stories

| # | Story | Type | Status | ADR |
|---|-------|------|--------|-----|
| 001 | IMovementHandler 인터페이스 + TouchInputAdapter 기본 구조 (dead zone + 탭 감지) | Logic | Ready | ADR-0017 |
| 002 | Direction8 각도 매핑 + MOVE_REPEAT 연속 이동 + PlayerMovement.onMoveIntent() | Logic | Ready | ADR-0017 |
| 003 | Cocos 노드 연동 + 실기기 플레이테스트 | Visual/Feel | Ready | ADR-0017 |

## Next Step

Run `/story-readiness production/epics/touchinput/story-001-touch-adapter-interface.md` to validate before implementation.
