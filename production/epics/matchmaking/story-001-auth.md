# Story 001: AUTH + WebSocket 연결

> **Epic**: Matchmaking
> **Status**: Complete
> **Layer**: Feature
> **Type**: Integration
> **Manifest Version**: 2026-04-22

## Context

**GDD**: `design/gdd/round-manager.md` (multiplayer 흐름)
**Requirements**: `TR-matchmaking-002` (AUTH 송신), `TR-foundation-004` (TossBridge.getUserToken)

**ADR Governing**: ADR-0014 (Matchmaking) + ADR-0004 (TossBridge) + ADR-0010 (Server Authority)
**Decision Summary**: WebSocketClient.connect() 성공 후 즉시 `TossBridge.getUserToken()` 호출 → AUTH 메시지 전송. 서버가 검증 후 큐에 추가. 클라이언트는 다음 단계로 MATCH_READY를 기다린다.

**Engine**: Cocos Creator 3.8.6 (TypeScript) | **Risk**: LOW
**Engine Notes**: 순수 TypeScript. WebSocketClient/TossBridge는 이미 구현됨. MockWebSocketClient + StubTossBridge로 테스트.

**Control Manifest Rules (Feature layer)**:
- Required: 모든 외부 의존은 인터페이스(IWebSocketClient, ITossBridge)로 — source: ADR-0003
- Required: Platform SDK는 ITossBridge 경유만 — source: ADR-0004
- Forbidden: WebSocketClient 직접 인스턴스화 — DI로 주입 받음 — source: ADR-0010

---

## Acceptance Criteria

- [ ] **AC-MM-01**: `Matchmaking.start(serverUrl)` 호출 시 IWebSocketClient.connect(url, token)이 정확히 1회 호출됨. token은 `bridge.getUserToken()` 반환값.
- [ ] **AC-MM-02**: WebSocket 연결 성공 후 AUTH 메시지가 정확히 1회 송신됨 (`{ type: 'AUTH', payload: { token } }`).
- [ ] **AC-MM-03**: `bridge.init()` 미완료 상태에서 `start()` 호출 시 throw 또는 reject (TossBridge invariant 보호).
- [ ] **AC-MM-04**: connect() reject 시 `MATCHMAKING_FAILED` 이벤트 emit + AUTH 송신 안함.
- [ ] **AC-MM-05**: 동일 인스턴스에서 `start()` 중복 호출 시 첫 호출만 처리, 두 번째 이후는 no-op (이미 connecting/connected).
- [ ] **AC-MM-06**: `dispose()` 호출 시 IWebSocketClient.disconnect() 호출 + 모든 핸들러 해제.

---

## Implementation Notes

### File Layout

```
src/features/session/
├── Matchmaking.ts        (this story — 본 클래스)
└── IMatchmaking.ts        (선택 — testability)
```

### `Matchmaking` 핵심 구조

```typescript
import type { IWebSocketClient } from '../../core/net/IWebSocketClient';
import type { ITossBridge } from '../../platform/toss/ITossBridge';
import type { IEventBus } from '../../core/events/IEventBus';

export type MatchmakingState = 'IDLE' | 'CONNECTING' | 'AUTHENTICATING' | 'WAITING' | 'FAILED';

export class Matchmaking {
  private state: MatchmakingState = 'IDLE';

  constructor(
    private readonly ws: IWebSocketClient,
    private readonly bridge: ITossBridge,
    private readonly bus: IEventBus,
  ) {}

  async start(serverUrl: string): Promise<void> {
    if (this.state !== 'IDLE') return; // AC-MM-05
    const token = this.bridge.getUserToken(); // throws if !bridge.isReady (AC-MM-03)
    this.state = 'CONNECTING';
    try {
      await this.ws.connect(serverUrl, token);
    } catch (err) {
      this.state = 'FAILED';
      this.bus.emit('MATCHMAKING_FAILED', { reason: 'connect_failed', timestamp: Date.now() });
      return; // AC-MM-04
    }
    this.state = 'AUTHENTICATING';
    this.ws.send({ type: 'AUTH', payload: { token } }); // AC-MM-02
    this.state = 'WAITING';
  }

  getState(): MatchmakingState { return this.state; }

  dispose(): void {
    if (this.ws.isConnected) this.ws.disconnect(); // AC-MM-06
  }
}
```

`MATCHMAKING_FAILED`는 GameEvents에 추가 필요 (`{ reason: string; timestamp: number }`).

---

## Out of Scope

- story-002: MATCH_READY 처리, SessionFlow + RoundManager 초기화
- story-003: degenerate match handling, in-game disconnect
- 재연결 로직 — WebSocketReconnectManager 활용 (Sprint 7+)

---

## QA Test Cases

**AC-MM-01** — connect with token
- Given: bridge.init() 완료, ws=MockWebSocketClient
- When: `mm.start('ws://test')`
- Then: `ws.connect`이 1회 호출, args[1] === bridge.getUserToken() 반환값

**AC-MM-02** — AUTH 송신
- Given: connect 성공
- When: start() promise resolve
- Then: `ws.sentMessages[0]` === `{ type: 'AUTH', payload: { token } }`

**AC-MM-03** — uninitialized bridge
- Given: bridge.init() 미호출
- When: `mm.start(...)`
- Then: throws or rejects

**AC-MM-04** — connect failure
- Given: ws.connect 시 reject (`new Error('network')`)
- When: `mm.start()`
- Then: state === 'FAILED', AUTH 미송신, MATCHMAKING_FAILED emit 1회

**AC-MM-05** — duplicate start
- Given: 첫 start() 진행 중 또는 완료
- When: 두 번째 start()
- Then: ws.connect 호출 횟수 변화 없음

**AC-MM-06** — dispose
- Given: state === 'WAITING'
- When: `mm.dispose()`
- Then: ws.disconnect() 호출됨

---

## Test Evidence

**Story Type**: Integration
**Required**: `tests/integration/matchmaking/matchmaking_auth_test.ts` — must pass

**Status**: [x] `tests/integration/matchmaking/matchmaking_test.ts` — story-001 covered by 5 tests (AC-MM-01 through AC-MM-06)

---

## Completion Notes
**Completed**: 2026-04-27
**Criteria**: 6/6 passing (AC-MM-01 ~ AC-MM-06)
**Deviations**: Implementation consolidated into a single `Matchmaking.ts` covering stories 001/002/003. Test file `tests/integration/matchmaking/matchmaking_test.ts` is shared across all three stories with describe blocks per story.
**Test Evidence**: Integration: 18 tests total in matchmaking_test.ts (5 for story-001, 4 for story-002, 9 for story-003). All passing (421 total suite).
**Code Review**: Skipped — Lean mode

---

## Dependencies

- Depends on: WebSocketClient ✅ (Foundation done), TossBridge ✅ (Platform done), MockWebSocketClient ✅
- Unlocks: story-002 (MATCH_READY 처리)
