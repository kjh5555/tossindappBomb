# Epic: EventBus

> **Layer**: Foundation
> **GDD**: N/A — ADR-0001 (EventBus 아키텍처) 권위
> **Architecture Module**: `src/core/events/EventBus.ts`
> **Status**: Complete
> **Stories**: 5개 — 전체 완료 (2026-04-22)
> **Manifest Version**: 2026-04-22

## Overview

EventBus는 GRID REAPER 전체의 모듈 간 통신 인프라다. 모든 게임 이벤트는 이 버스를 통해서만 흐른다. ADR-0001이 결정한 핵심 계약: `emit()`은 이벤트를 즉시 발행하지 않고 flush 큐에 추가하며, `flush()`는 FrameClock.tick() 내에서만 호출된다. 이 패턴이 결정론적 시뮬레이션(ADR-0002)과 레이어 경계(ADR-0003)의 전제조건이다.

## Governing ADRs

| ADR | Decision Summary | Engine Risk |
|-----|-----------------|-------------|
| ADR-0001: EventBus 아키텍처 | frame-flush 큐 패턴. emit()은 큐에 추가, flush()는 FrameClock.tick()만 호출 | LOW |
| ADR-0002: FrameClock | tick() 내 flush() 호출 순서 — FrameClock이 EventBus flush 주체 | LOW |
| ADR-0003: 레이어 경계 | EventBus가 레이어 간 유일한 통신 수단 | LOW |

## GDD Requirements

> ⚠️ TR registry 비어 있음 — `/architecture-review` 미실행. TR-ID는 해당 실행 후 등록됩니다.
> 아래 요구사항은 ADR-0001에서 직접 추출.

| # | 요구사항 | ADR Coverage |
|---|---------|--------------|
| 1 | `emit(event, payload)` 호출 시 즉시 발행 금지 — flush 큐에 추가 | ADR-0001 ✅ |
| 2 | `flush()` — 큐에 쌓인 이벤트를 순서대로 발행 (FrameClock.tick()만 호출) | ADR-0001 ✅ |
| 3 | 16개 GameEvents 타입 인터페이스 정의 (PLAYER_MOVED, PLAYER_ARRIVED, PLAYER_KILLED, ROUND_STARTED, ROUND_CLEAR, GAME_OVER, GRID_STALLED, PATTERN_REJECTED 등) | ADR-0001 ✅ |
| 4 | `subscribe(event, handler)` / `unsubscribe(event, handler)` API | ADR-0001 ✅ |
| 5 | `IEventBus` 인터페이스 — 테스트 DI 가능 | ADR-0001 ✅ |

## Definition of Done

This epic is complete when:
- All stories are implemented, reviewed, and closed via `/story-done`
- EventBus.emit() 이후 flush() 없이는 핸들러가 호출되지 않음 (단위 테스트)
- FrameClock.tick() 호출 시 flush()가 정확히 1회 실행됨 (단위 테스트)
- 16개 GameEvents 타입 컴파일 에러 없이 정의됨
- IEventBus 인터페이스 기반 MockEventBus 구현 가능
- All Logic stories have passing test files in `tests/unit/events/`

## Stories

| # | Story | Type | Status | ADR |
|---|-------|------|--------|-----|
| 001 | [Test Infrastructure Scaffold](story-001-test-scaffold.md) | Integration | ✅ Complete | ADR-0001 |
| 002 | [GameEvents 타입 정의 + IEventBus 인터페이스](story-002-gameevents-types.md) | Logic | ✅ Complete | ADR-0001 |
| 003 | [EventBus 핵심 구현 (flush-queue 패턴)](story-003-eventbus-core.md) | Logic | ✅ Complete | ADR-0001 |
| 004 | [EventBus ↔ FrameClock 통합](story-004-frameclock-integration.md) | Integration | ✅ Complete | ADR-0001, ADR-0002 |
| 005 | [성능 + GRID_STALLED 스트레스 테스트](story-005-stress-test.md) | Integration | ✅ Complete | ADR-0001, ADR-0009 |

## Next Step

Run `/story-readiness production/epics/eventbus/story-001-test-scaffold.md` then `/dev-story` to begin implementation.
Work through stories in order — each story's `Depends on:` field tells you what must be DONE first.
