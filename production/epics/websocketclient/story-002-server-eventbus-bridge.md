# Story 002: 서버 메시지 → EventBus 변환 어댑터

> **Epic**: WebSocketClient
> **Status**: Complete
> **Layer**: Foundation
> **Type**: Integration
> **Manifest Version**: 2026-04-22

## Context

**GDD**: N/A — ADR-0010 권위
**Requirement**: TR 미등록 (tr-registry.yaml 비어 있음 — /architecture-review 미실행)
*(ADR-0010 Architecture Diagram에서 추출)*

**ADR Governing Implementation**: ADR-0010 (Server Authority 검증 모델), ADR-0001 (EventBus)
**ADR Decision Summary**: IWebSocketClient가 서버 메시지를 수신하면 즉시 `EventBus.emit()`으로 변환. CellIndex → CellCoord 변환은 수신 즉시 수행. WebSocketClient는 직접 게임 상태를 변경하지 않는다.

**Engine**: Cocos Creator 3.8.6 | **Risk**: MEDIUM
**Engine Notes**: 순수 TypeScript. MockWebSocketClient + MockFrameClock으로 엔진 없이 통합 테스트 가능.

**Control Manifest Rules (Foundation)**:
- Required: 서버 메시지는 `EventBus.emit()`으로 변환 후 처리 — source: ADR-0010
- Required: WebSocket 메시지 수신 시 `CellIndex → CellCoord` 즉시 변환 (`indexToCell()`) — source: ADR-0010
- Forbidden: WebSocket 메시지 핸들러에서 직접 게임 상태 변경 — source: ADR-0010
- Forbidden: 게임 로직에 `CellIndex` 미도달 — source: ADR-0005

---

## Acceptance Criteria

- [ ] `MockWebSocketClient.simulateMessage('PLAYER_KILLED', payload)` → `EventBus`에 `PLAYER_KILLED` 이벤트 emit됨
- [ ] `ROUND_START` 서버 메시지 → `ROUND_STARTED` EventBus 이벤트로 변환 (필드 매핑 확인)
- [ ] `PLAYER_MOVE` 서버 메시지 → `PLAYER_MOVED` EventBus 이벤트로 변환
- [ ] `ROUND_CLEAR` → `ROUND_CLEAR`, `GAME_OVER` → `GAME_OVER` 각각 변환
- [ ] `CellIndex` 필드(`cellId`, `from`, `to`)는 수신 즉시 `CellCoord`로 변환됨 (EventBus payload에 CellIndex 없음)
- [ ] 모든 변환 이벤트의 `timestamp`는 `IFrameClock.now()` 기준 (서버 wallclock 사용 금지)

---

## Implementation Notes

*ADR-0010 Architecture Diagram + ADR-0001 EventBus 기반:*

```typescript
// src/core/net/WebSocketAdapter.ts
// IWebSocketClient 수신 → IEventBus.emit() 변환 어댑터

export class WebSocketAdapter {
  constructor(
    private ws: IWebSocketClient,
    private bus: IEventBus,
    private clock: IFrameClock
  ) {}

  mount(): void {
    this.ws.on('PLAYER_KILLED', (payload) => {
      // CellIndex → CellCoord 변환
      const cell = indexToCell(payload.cellId);
      this.bus.emit('PLAYER_KILLED', {
        playerIds: payload.playerIds,
        cell,
        cause: payload.cause,
        timestamp: this.clock.now(),
      });
    });

    this.ws.on('ROUND_START', (payload) => {
      this.bus.emit('ROUND_STARTED', {
        roundNumber: payload.roundNumber,
        seed: payload.seed,
        timestamp: this.clock.now(),
      });
    });

    this.ws.on('PLAYER_MOVE', (payload) => {
      this.bus.emit('PLAYER_MOVED', {
        playerId: payload.playerId,
        from: indexToCell(payload.from),
        to: indexToCell(payload.to),
        timestamp: this.clock.now(),
      });
    });

    this.ws.on('ROUND_CLEAR', (payload) => {
      this.bus.emit('ROUND_CLEAR', {
        roundNumber: payload.roundNumber,
        survivors: payload.survivors,
        timestamp: this.clock.now(),
      });
    });

    this.ws.on('GAME_OVER', (payload) => {
      this.bus.emit('GAME_OVER', {
        finalRound: payload.finalRound,
        rankings: payload.rankings,
        timestamp: this.clock.now(),
      });
    });
  }
}
```

**메시지 매핑 테이블**:
| 서버 메시지 | EventBus 이벤트 | CellIndex 변환 |
|-----------|--------------|--------------|
| `ROUND_START` | `ROUND_STARTED` | playerPositions 값들 → CellCoord |
| `PLAYER_MOVE` | `PLAYER_MOVED` | from/to → CellCoord |
| `PLAYER_KILLED` | `PLAYER_KILLED` | cellId → cell: CellCoord |
| `ROUND_CLEAR` | `ROUND_CLEAR` | 없음 |
| `GAME_OVER` | `GAME_OVER` | 없음 |

---

## Out of Scope

- Story 001: IWebSocketClient 인터페이스 + MockWebSocketClient 정의
- Story 003: 연결 끊김 재연결 로직
- 실제 Node.js 서버 구현

---

## QA Test Cases

**AC-1**: PLAYER_KILLED 서버 메시지 → EventBus emit
- Given: MockWebSocketClient + EventBus + MockFrameClock + WebSocketAdapter.mount()
  `let received: any = null; bus.on('PLAYER_KILLED', e => { received = e; })`
- When: `mock.simulateMessage('PLAYER_KILLED', { playerIds: ['p1'], cellId: 10, cause: 'EXPLOSION', timestamp: 999 })`
  + `clock.tick(0.1, bus)` (flush)
- Then: `received.playerIds[0] === 'p1'`, `received.cell` is `CellCoord` (not number), `received.cause === 'EXPLOSION'`

**AC-2**: ROUND_START → ROUND_STARTED 변환
- Given: 동일 셋업
- When: `mock.simulateMessage('ROUND_START', { roundNumber: 2, seed: 77, playerPositions: {} })`
  + `clock.tick(0.1, bus)`
- Then: ROUND_STARTED 이벤트 수신, `roundNumber === 2`, `seed === 77`

**AC-3**: PLAYER_MOVE → PLAYER_MOVED + CellIndex → CellCoord 변환
- Given: 동일 셋업
- When: `mock.simulateMessage('PLAYER_MOVE', { playerId: 'p2', from: 0, to: 1, timestamp: 0 })`
  + `clock.tick(0.1, bus)`
- Then: PLAYER_MOVED 이벤트 수신, `from` is `CellCoord { row: 0, col: 0 }`, `to` is `CellCoord { row: 0, col: 1 }`

**AC-4**: timestamp는 clock.now() 기준 (서버 wallclock 아님)
- Given: MockFrameClock (simulatedTime = 1.5)
- When: PLAYER_KILLED 메시지 수신 (payload.timestamp = 9999)
- Then: EventBus PLAYER_KILLED.timestamp === 1.5 (서버 값 9999 아님)

**AC-5**: ROUND_CLEAR, GAME_OVER 변환
- Given: 동일 셋업
- When: `mock.simulateMessage('ROUND_CLEAR', { roundNumber: 3, survivors: ['p1', 'p2'] })` + tick
- Then: ROUND_CLEAR emit, survivors 배열 보존
- When: `mock.simulateMessage('GAME_OVER', { finalRound: 3, rankings: ['p1'] })` + tick
- Then: GAME_OVER emit, rankings 배열 보존

---

## Test Evidence

**Story Type**: Integration
**Required evidence**:
- `tests/integration/net/websocket-eventbus_test.ts` — AC-1 ~ AC-5 통과

**Status**: [ ] Not yet created

---

## Dependencies

- Depends on: Story 001 (IWebSocketClient + MockWebSocketClient) must be DONE
- Unlocks: Story 003 (연결 끊김 재연결 로직), WebSocketClient Epic DoD 달성
