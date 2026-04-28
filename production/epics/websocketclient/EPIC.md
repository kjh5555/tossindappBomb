# Epic: WebSocketClient

> **Layer**: Foundation
> **GDD**: N/A — ADR-0010 (Server Authority 검증 모델) 권위
> **Architecture Module**: `src/core/net/WebSocketClient.ts`
> **Status**: Complete (⚠️ OQ-7 — Toss webview WebSocket 레이턴시 미검증, 실기기 스파이크 필요)
> **Stories**: 3개 — 아래 표 참조
> **Manifest Version**: 2026-04-22

## Overview

WebSocketClient는 게임 서버(자체 Node.js WebSocket 서버)와의 실시간 통신 인프라다. ADR-0010이 정의한 `IWebSocketClient` 인터페이스를 구현하며, 모든 게임 로직은 이 인터페이스를 통해서만 서버와 통신한다. 테스트를 위한 MockWebSocketClient와 Toss 인토스 webview 실기기 검증이 이 Epic의 핵심 산출물이다.

> ⚠️ **OQ-7 미해소**: Toss 인토스 webview 내 WebSocket 실기기 레이턴시가 미검증 상태입니다.
> 이 Epic의 WebSocket 구현 스토리와 병행하여 Toss 샌드박스 환경에서 p50/p95/p99 레이턴시
> 측정 스파이크를 Sprint 1 내에 수행해야 합니다.

## Governing ADRs

| ADR | Decision Summary | Engine Risk |
|-----|-----------------|-------------|
| ADR-0010: Server Authority 검증 모델 | IWebSocketClient DI 패턴, MockWebSocketClient, 자체 Node.js 서버 | MEDIUM (webview) |
| ADR-0001: EventBus | 서버 메시지 → EventBus 이벤트 변환 경로 | LOW |
| ADR-0002: FrameClock | simulatedTime 기준 timestamp | LOW |
| ADR-0004: TossBridge | getUserToken() — 서버 인증 토큰 출처 | MEDIUM |
| ADR-0005: CellCoord/CellIndex | 직렬화 기준: CellIndex(정수) ↔ CellCoord({ row, col }) 변환 | LOW |

## GDD Requirements

> ⚠️ TR registry 비어 있음. 요구사항은 ADR-0010 Key Interfaces에서 직접 추출.

| # | 요구사항 | ADR Coverage |
|---|---------|--------------|
| 1 | `IWebSocketClient`: `connect(url)`, `disconnect()`, `send(msg)`, `on(type, handler)`, `off(type, handler)`, `isConnected` | ADR-0010 ✅ |
| 2 | `MockWebSocketClient` 구현 — 단위 테스트 DI용. 메시지 주입/캡처 가능 | ADR-0010 ✅ |
| 3 | 서버 메시지 → `EventBus.emit()` 변환: PLAYER_MOVED, PLAYER_KILLED, ROUND_STARTED 등 | ADR-0010 ✅ |
| 4 | `PLAYER_KILLED { playerIds: PlayerId[] }` — 동시 사망 배열 지원 | ADR-0010 ✅ |
| 5 | 연결 끊김(disconnect / 타임아웃) → 재연결 시도 + 실패 시 GAME_OVER 이벤트 | ADR-0010 ✅ |
| 6 | Toss sandbox 실기기 WebSocket p50/p95/p99 레이턴시 측정 (OQ-7 클로저) | ADR-0010 ⚠️ 미검증 |

## Definition of Done

This epic is complete when:
- All stories are implemented, reviewed, and closed via `/story-done`
- MockWebSocketClient DI로 서버 메시지 주입 → EventBus emit 확인 (단위 테스트)
- 연결 끊김 시 재연결 시도 동작 확인 (단위 테스트)
- OQ-7: Toss 샌드박스 실기기에서 p95 레이턴시 측정값 기록
- All Logic stories have passing test files in `tests/unit/net/`
- Integration test: MockWebSocketClient ↔ EventBus 메시지 라운드트립

## Stories

| # | Story | Type | Status | ADR |
|---|-------|------|--------|-----|
| 001 | [IWebSocketClient 인터페이스 + MockWebSocketClient](story-001-interface-mock.md) | Logic | Complete | ADR-0010 |
| 002 | [서버 메시지 → EventBus 변환 어댑터](story-002-server-eventbus-bridge.md) | Integration | Complete | ADR-0010, ADR-0001 |
| 003 | [연결 끊김 재연결 로직](story-003-reconnect-logic.md) | Logic | Complete | ADR-0010 |

## Next Step

Run `/dev-story production/epics/websocketclient/story-001-interface-mock.md` to begin implementation.
