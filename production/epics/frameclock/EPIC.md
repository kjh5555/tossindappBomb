# Epic: FrameClock

> **Layer**: Foundation
> **GDD**: N/A — ADR-0002 (FrameClock 결정론적 시간 모델) 권위
> **Architecture Module**: `src/core/time/FrameClock.ts`
> **Status**: Complete
> **Stories**: 2개 — 아래 표 참조
> **Manifest Version**: 2026-04-22

## Overview

FrameClock은 GRID REAPER의 시간 인프라다. Cocos Creator의 실제 프레임 dt 대신 `simulatedTime`을 누적하여 결정론적 시뮬레이션을 보장한다. `schedule(fn, delaySecs)`가 simulatedTime 기준으로 동작하므로 테스트에서 MockFrameClock으로 시간을 임의로 진행시킬 수 있다. ADR-0008(PlayerMovement)의 PLAYER_ARRIVED 0.1s 스케줄과 ADR-0006(Gate Period) 타이머가 모두 이 시스템에 의존한다.

## Governing ADRs

| ADR | Decision Summary | Engine Risk |
|-----|-----------------|-------------|
| ADR-0002: FrameClock 결정론적 시간 모델 | simulatedTime 누적 delta. tick(dt)가 EventBus.flush() 호출 주체 | LOW |
| ADR-0008: Player Movement | schedule(arrivedFn, 0.1) — PLAYER_ARRIVED 큐잉에 FrameClock 의존 | LOW |
| ADR-0006: Gate Period | simulatedTime 기준 타이머로 Gate Period 타임아웃 계산 | LOW |

## GDD Requirements

> ⚠️ TR registry 비어 있음 — `/architecture-review` 미실행. TR-ID는 해당 실행 후 등록됩니다.
> 아래 요구사항은 ADR-0002에서 직접 추출.

| # | 요구사항 | ADR Coverage |
|---|---------|--------------|
| 1 | `simulatedTime: number` — 프레임 dt 누적으로 결정론적 시간 유지 | ADR-0002 ✅ |
| 2 | `tick(dt: number)` — simulatedTime 갱신 후 EventBus.flush() 호출 | ADR-0002 ✅ |
| 3 | `schedule(fn: () => void, delaySecs: number): ScheduleHandle` — simulatedTime 기준 지연 실행 | ADR-0002 ✅ |
| 4 | `cancelSchedule(fn)` — 대기 중인 스케줄 취소 (PLAYER_KILLED 시 PLAYER_ARRIVED 취소 용도) | ADR-0002 ✅ |
| 5 | `IFrameClock` 인터페이스 + MockFrameClock — 테스트에서 `tick(0.1)` 으로 시간 진행 제어 | ADR-0002 ✅ |
| 6 | `now(): number` — 현재 simulatedTime 반환 (이벤트 timestamp 용도) | ADR-0002 ✅ |

## Definition of Done

This epic is complete when:
- All stories are implemented, reviewed, and closed via `/story-done`
- `tick(0.05)` 2회 후 schedule(fn, 0.1) 등록 fn 실행 확인 (단위 테스트)
- `cancelSchedule` 후 tick 진행해도 fn 미실행 확인 (단위 테스트)
- MockFrameClock으로 ADR-0008 Validation Criteria 5개 통과
- All Logic stories have passing test files in `tests/unit/time/`

## Stories

| # | Story | Type | Status | ADR |
|---|-------|------|--------|-----|
| 001 | [FrameClock 완성 + 단위 테스트](story-001-frameclock-core.md) | Logic | Ready | ADR-0002 |
| 002 | [MockFrameClock PLAYER_ARRIVED 0.1s 패턴 검증](story-002-player-arrived-pattern.md) | Integration | Ready | ADR-0002, ADR-0008 |

## Next Step

Run `/dev-story production/epics/frameclock/story-001-frameclock-core.md` to begin implementation.
