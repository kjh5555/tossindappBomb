# Epic: TossBridge

> **Layer**: Platform
> **GDD**: N/A — ADR-0004 (TossBridge Platform 래퍼) 권위
> **Architecture Module**: `src/platform/toss/TossBridge.ts`
> **Status**: Complete
> **Stories**: 2개 — 아래 표 참조
> **Manifest Version**: 2026-04-22

## Overview

TossBridge는 Toss 인토스 SDK(`@apps-in-toss/web-framework`)를 GRID REAPER 게임 코드로부터 격리하는 Platform 레이어 래퍼다. ADR-0004가 확립한 핵심 계약: 게임 로직은 `ITossBridge` 인터페이스만 알며, SDK 초기화 순서(EventBus 등록 이전)와 Safe Area 전파 책임을 TossBridge가 전담한다. 테스트 환경에서는 `StubTossBridge`로 교체한다.

## Governing ADRs

| ADR | Decision Summary | Engine Risk |
|-----|-----------------|-------------|
| ADR-0004: TossBridge Platform 래퍼 | SDK DI 패턴. 초기화는 EventBus 등록 이전. StubTossBridge 테스트 대체 | MEDIUM |
| ADR-0010: Server Authority | TossBridge.getUserToken() → WebSocket 서버 인증에 사용 | MEDIUM |

## GDD Requirements

> ⚠️ TR registry 비어 있음. 요구사항은 ADR-0004에서 직접 추출.

| # | 요구사항 | ADR Coverage |
|---|---------|--------------|
| 1 | `TossBridge.init()` — EventBus 등록 이전에 SDK 초기화 완료 (초기화 순서 보장) | ADR-0004 ✅ |
| 2 | `getUserToken(): Promise<string>` — Toss 인증 토큰 반환 | ADR-0004 ✅ |
| 3 | Safe Area 값(`top/bottom/left/right`) → HUD 레이아웃 시스템에 전파 | ADR-0004 ✅ |
| 4 | `ITossBridge` 인터페이스 정의 — DI 가능 | ADR-0004 ✅ |
| 5 | `StubTossBridge` 구현 — 로컬 개발 / 단위 테스트용 (토큰 고정값 반환, Safe Area 기본값) | ADR-0004 ✅ |
| 6 | `granite.config.ts` 설정 (`appName`, `displayName`, `icon`, `color`) | ADR-0004 ✅ |

## Definition of Done

This epic is complete when:
- All stories are implemented, reviewed, and closed via `/story-done`
- `StubTossBridge.getUserToken()` 가 테스트에서 고정 토큰 반환 (단위 테스트)
- `TossBridge.init()` 이 EventBus.subscribe() 이전에 완료됨 (통합 테스트 시나리오)
- Toss 샌드박스 환경에서 `ait` CLI로 빌드 + webview 실행 확인
- All Logic stories have passing test files in `tests/unit/platform/`

## Stories

| # | Story | Type | Status | ADR |
|---|-------|------|--------|-----|
| 001 | [ITossBridge 인터페이스 + StubTossBridge](story-001-interface-stub.md) | Logic | Complete | ADR-0004 |
| 002 | [granite.config.ts 설정](story-002-granite-config.md) | Config/Data | Complete | ADR-0004 |

## Next Step

Run `/dev-story production/epics/tossbridge/story-001-interface-stub.md` to begin implementation.
