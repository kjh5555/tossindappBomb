# Story 001: IWebSocketClient 인터페이스 + MockWebSocketClient

> **Epic**: WebSocketClient
> **Status**: Complete
> **Layer**: Foundation
> **Type**: Logic
> **Manifest Version**: 2026-04-22

## Context

**GDD**: N/A — ADR-0010 권위
**Requirement**: TR 미등록 (tr-registry.yaml 비어 있음 — /architecture-review 미실행)
*(ADR-0010 Key Interfaces에서 추출)*

**ADR Governing Implementation**: ADR-0010 (Server Authority 검증 모델)
**ADR Decision Summary**: 모든 서버 통신은 `IWebSocketClient` 인터페이스 경유. 단위 테스트에서는 `MockWebSocketClient`를 DI로 주입하여 서버 없이 메시지 흐름 검증.

**Engine**: Cocos Creator 3.8.6 | **Risk**: MEDIUM (webview WebSocket 미검증)
**Engine Notes**: 순수 TypeScript — WebSocket API 자체는 표준이나 Toss webview 실기기 레이턴시 미검증(OQ-7). 인터페이스/Mock 구현은 엔진 의존 없음.

**Control Manifest Rules (Foundation)**:
- Required: 모든 서버 통신은 `IWebSocketClient` 인터페이스 경유 — source: ADR-0010
- Required: 단위 테스트에서 `MockWebSocketClient` 사용 — source: ADR-0010
- Forbidden: native `WebSocket` API 직접 사용 (IWebSocketClient 우회) — source: ADR-0010
- Forbidden: `IWebSocketClient`를 Feature/Presentation 레이어에서 직접 사용 — source: ADR-0010

---

## Acceptance Criteria

- [ ] `IWebSocketClient` 인터페이스 정의: `connect(url, token)`, `disconnect()`, `send(msg)`, `on(type, handler)`, `off(type, handler)`, `readonly isConnected: boolean`
- [ ] `MockWebSocketClient` 구현: `simulateMessage<K>(type, payload)` 헬퍼로 서버 메시지 주입 가능
- [ ] `MockWebSocketClient.connect()` 호출 후 `isConnected === true`
- [ ] `MockWebSocketClient.disconnect()` 호출 후 `isConnected === false`
- [ ] `on(type, handler)` 등록 후 `simulateMessage(type, payload)` 호출 시 핸들러 1회 실행
- [ ] `off(type, handler)` 후 `simulateMessage` 호출 시 핸들러 미실행
- [ ] `send(msg)` 호출 내역이 `MockWebSocketClient.sentMessages` 배열에 기록됨 (테스트 검증용)

---

## Implementation Notes

*ADR-0010 Key Interfaces 기반:*

```typescript
// src/core/net/IWebSocketClient.ts
import { ServerMessages, ClientMessage } from './WebSocketProtocol';

export interface IWebSocketClient {
  connect(serverUrl: string, token: string): Promise<void>;
  disconnect(): void;
  send(msg: ClientMessage): void;
  on<K extends keyof ServerMessages>(type: K, handler: (payload: ServerMessages[K]) => void): void;
  off<K extends keyof ServerMessages>(type: K, handler: (payload: ServerMessages[K]) => void): void;
  readonly isConnected: boolean;
}
```

```typescript
// src/core/net/WebSocketProtocol.ts
// ServerMessages, ClientMessages 타입 정의 (ADR-0010 메시지 프로토콜 섹션 그대로)
// ServerMessages: MATCH_READY, ROUND_START, PLAYER_MOVE, PLAYER_KILLED, ROUND_CLEAR, GAME_OVER
// ClientMessages: AUTH, MOVE
```

```typescript
// tests/helpers/MockWebSocketClient.ts
export class MockWebSocketClient implements IWebSocketClient {
  private handlers = new Map<string, Array<(p: any) => void>>();
  private _isConnected = false;
  readonly sentMessages: ClientMessage[] = [];

  async connect(_url: string, _token: string): Promise<void> { this._isConnected = true; }
  disconnect(): void { this._isConnected = false; }
  send(msg: ClientMessage): void { this.sentMessages.push(msg); }
  get isConnected(): boolean { return this._isConnected; }

  on<K extends keyof ServerMessages>(type: K, handler: (p: ServerMessages[K]) => void): void {
    if (!this.handlers.has(type)) this.handlers.set(type, []);
    this.handlers.get(type)!.push(handler);
  }
  off<K extends keyof ServerMessages>(type: K, handler: (p: ServerMessages[K]) => void): void {
    const list = this.handlers.get(type);
    if (list) { const i = list.indexOf(handler as any); if (i !== -1) list.splice(i, 1); }
  }
  simulateMessage<K extends keyof ServerMessages>(type: K, payload: ServerMessages[K]): void {
    this.handlers.get(type as string)?.forEach(h => h(payload));
  }
}
```

---

## Out of Scope

- Story 002: 서버 메시지 → EventBus 변환 어댑터 구현
- Story 003: 연결 끊김 재연결 로직
- 실제 WebSocket 연결 구현 (Node.js 서버 프로토타입은 별도)

---

## QA Test Cases

**AC-1**: IWebSocketClient 인터페이스 형상 검증
- Given: MockWebSocketClient 인스턴스
- When: 인스턴스 생성
- Then: `connect`, `disconnect`, `send`, `on`, `off`, `isConnected` 모두 접근 가능

**AC-2**: connect/disconnect → isConnected 상태 전환
- Given: `const mock = new MockWebSocketClient()`
- When: `await mock.connect('ws://test', 'token')` 호출
- Then: `mock.isConnected === true`
- When: `mock.disconnect()` 호출
- Then: `mock.isConnected === false`

**AC-3**: on/simulateMessage → 핸들러 실행
- Given: mock + `let received: any = null; mock.on('PLAYER_KILLED', p => { received = p; })`
- When: `mock.simulateMessage('PLAYER_KILLED', { playerIds: ['p1'], cellId: 0, cause: 'EXPLOSION', timestamp: 1.0 })`
- Then: `received.playerIds[0] === 'p1'`

**AC-4**: off → 핸들러 미실행
- Given: mock + handler 등록 후 `mock.off('PLAYER_KILLED', handler)`
- When: `mock.simulateMessage('PLAYER_KILLED', payload)`
- Then: handler 호출 횟수 = 0

**AC-5**: send → sentMessages 기록
- Given: `await mock.connect('ws://test', 'tok')`
- When: `mock.send({ type: 'MOVE', payload: { direction: 'UP', fromCell: 0, timestamp: 0 } })`
- Then: `mock.sentMessages.length === 1`, `mock.sentMessages[0].type === 'MOVE'`

**AC-6**: 다중 핸들러 등록 — 모두 실행
- Given: `mock.on('ROUND_START', h1); mock.on('ROUND_START', h2)`
- When: `mock.simulateMessage('ROUND_START', { roundNumber: 1, seed: 42, playerPositions: {} })`
- Then: h1, h2 각각 1회 실행

---

## Test Evidence

**Story Type**: Logic
**Required evidence**:
- `tests/unit/net/websocketclient-interface_test.ts` — AC-1 ~ AC-6 통과

**Status**: [ ] Not yet created

---

## Dependencies

- Depends on: Story 001 (FrameClock) DONE ✅, Story 003 (EventBus) DONE ✅
- Unlocks: Story 002 (서버 메시지 → EventBus 변환)
