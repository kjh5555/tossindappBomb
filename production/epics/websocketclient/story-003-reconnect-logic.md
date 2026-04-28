# Story 003: 연결 끊김 재연결 로직

> **Epic**: WebSocketClient
> **Status**: Complete
> **Layer**: Foundation
> **Type**: Logic
> **Manifest Version**: 2026-04-22

## Context

**GDD**: N/A — ADR-0010 권위
**Requirement**: TR 미등록 (tr-registry.yaml 비어 있음 — /architecture-review 미실행)
*(ADR-0010 Risks 섹션에서 추출)*

**ADR Governing Implementation**: ADR-0010 (Server Authority 검증 모델)
**ADR Decision Summary**: MVP에서 재연결 불가 시 GAME_OVER 처리. AUTH 메시지에 sessionId 필드로 향후 재연결 확장 여지 보존. 연결 끊김은 IWebSocketClient 레이어에서 감지하고 EventBus로 전파.

**Engine**: Cocos Creator 3.8.6 | **Risk**: MEDIUM (OQ-7 webview 레이턴시 미검증)
**Engine Notes**: 순수 TypeScript. MockWebSocketClient로 연결 끊김/재연결 시나리오 시뮬레이션 가능.

**Control Manifest Rules (Foundation)**:
- Required: 서버 메시지는 `EventBus.emit()`으로 변환 후 처리 — source: ADR-0010
- Required: 모든 서버 통신은 `IWebSocketClient` 인터페이스 경유 — source: ADR-0010
- Forbidden: native `WebSocket` API 직접 사용 — source: ADR-0010

---

## Acceptance Criteria

- [ ] `MockWebSocketClient.simulateDisconnect()` 호출 시 `isConnected === false`로 전환
- [ ] 연결 끊김 감지 시 재연결 1회 시도 (connect() 재호출)
- [ ] 재연결 성공 시 `isConnected === true` 복귀, GAME_OVER 이벤트 미발행
- [ ] 재연결 실패(reject) 시 `GAME_OVER` EventBus 이벤트 발행
- [ ] 재연결 시도 횟수는 최대 1회 (MVP) — 무한 루프 없음

---

## Implementation Notes

*ADR-0010 Risks 섹션 기반:*

```typescript
// WebSocketAdapter에 disconnect 감지 추가 (or WebSocketClient 구현체)

// MockWebSocketClient 확장 — 테스트 헬퍼
simulateDisconnect(): void {
  this._isConnected = false;
  this.disconnectHandlers.forEach(h => h());
}
onDisconnect(handler: () => void): void {
  this.disconnectHandlers.push(handler);
}

// WebSocketReconnectManager — MVP 재연결 정책
export class WebSocketReconnectManager {
  constructor(
    private ws: IWebSocketClient,
    private bus: IEventBus,
    private clock: IFrameClock,
    private serverUrl: string,
    private token: string,
  ) {}

  mount(): void {
    (this.ws as any).onDisconnect?.(() => this.handleDisconnect());
  }

  private async handleDisconnect(): Promise<void> {
    try {
      await this.ws.connect(this.serverUrl, this.token);
      // 재연결 성공 — 계속 진행
    } catch {
      // 재연결 실패 → GAME_OVER
      this.bus.emit('GAME_OVER', {
        finalRound: -1,
        rankings: [],
        timestamp: this.clock.now(),
      });
    }
  }
}
```

**MVP 재연결 정책**: 1회 시도. 실패 시 GAME_OVER. sessionId 필드는 AUTH 메시지에 포함 유지 (향후 재연결 확장 여지).

---

## Out of Scope

- 다중 재연결 재시도 (exponential backoff) — 향후 스토리
- 재연결 성공 후 게임 상태 재동기화 — Core 레이어 epic
- OQ-7 실기기 레이턴시 측정 — 별도 스파이크 태스크

---

## QA Test Cases

**AC-1**: simulateDisconnect → isConnected false
- Given: `mock = new MockWebSocketClient()`, `await mock.connect('ws://test', 'tok')`
- When: `mock.simulateDisconnect()`
- Then: `mock.isConnected === false`

**AC-2**: 재연결 성공 → GAME_OVER 미발행
- Given: ReconnectManager(mock, bus, clock, url, token) + `mount()`
  connect()가 성공 resolve하도록 설정
- When: `mock.simulateDisconnect()`
- Then: GAME_OVER 이벤트 발행 횟수 = 0, `mock.isConnected === true`

**AC-3**: 재연결 실패 → GAME_OVER 발행
- Given: connect()가 reject하도록 Mock 설정
- When: `mock.simulateDisconnect()` + 비동기 완료 대기
- Then: GAME_OVER EventBus 이벤트 1회 발행 (tick flush 후 확인)

**AC-4**: 재시도 1회 초과 없음
- Given: connect()가 항상 reject
- When: `simulateDisconnect()` 1회
- Then: connect() 호출 횟수 = 2 (최초 connect + 재시도 1회)

---

## Test Evidence

**Story Type**: Logic
**Required evidence**:
- `tests/unit/net/websocketclient-reconnect_test.ts` — AC-1 ~ AC-4 통과

**Status**: [ ] Not yet created

---

## Dependencies

- Depends on: Story 001 (IWebSocketClient + MockWebSocketClient) must be DONE
- Unlocks: WebSocketClient Epic DoD 충족 (연결 끊김 처리 포함)
