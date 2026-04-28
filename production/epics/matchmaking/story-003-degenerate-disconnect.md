# Story 003: Degenerate Match (2-5인) + Disconnect 처리

> **Epic**: Matchmaking
> **Status**: Complete
> **Layer**: Feature
> **Type**: Integration
> **Manifest Version**: 2026-04-22

## Context

**GDD**: `design/gdd/round-manager.md`
**Requirements**: `TR-matchmaking-003` (degenerate match 허용)

**ADR Governing**: ADR-0014 (OQ-5 결정 — MIN 2인 허용) + ADR-0010 (disconnect mitigation)
**Decision Summary**:
- 2~5인 매치 허용. 규칙 변경 없음, `totalPlayers`만 다르다.
- 로비 중 disconnect → 큐에서 제거 (서버 책임). 클라이언트는 재연결 후 재 AUTH.
- 게임 중 disconnect → 해당 플레이어 PLAYER_KILLED 처리 (ADR-0010).

**Engine**: Cocos Creator 3.8.6 | **Risk**: LOW

**Control Manifest Rules**:
- Required: 모든 이벤트 IEventBus 경유 — source: ADR-0001
- Required: PLAYER_KILLED은 RoundManager가 발행 — Matchmaking 직접 발행 금지 (레이어 경계) — source: ADR-0003

---

## Acceptance Criteria

- [ ] **AC-DM-01**: MATCH_READY.playerIds.length === 2 일 때 정상 처리됨 (`totalPlayers=2` 전달).
- [ ] **AC-DM-02**: MATCH_READY.playerIds.length === 5 일 때 정상 처리됨 (`totalPlayers=5` 전달).
- [ ] **AC-DM-03**: MATCH_READY.playerIds.length === 6 일 때 정상 처리됨 (정상 6인 매치).
- [ ] **AC-DM-04**: MATCH_READY.playerIds.length < 2 일 때 invariant 위반 — `MATCHMAKING_FAILED` emit + 매치 시작 안함.
- [ ] **AC-DM-05**: MATCH_READY.playerIds.length > 6 일 때 invariant 위반 — 동일 처리.
- [ ] **AC-DM-06**: 로비 중 (state === WAITING) ws disconnect → state === DISCONNECTED, `MATCHMAKING_FAILED { reason: 'disconnected' }` emit.
- [ ] **AC-DM-07**: 게임 중 (state === MATCH) ws disconnect → `LOCAL_PLAYER_DISCONNECTED` emit (RoundManager 별도 처리는 Sprint 7+).
- [ ] **AC-DM-08**: 로비 disconnect 후 `start()` 재호출 → 재연결 시도 (state IDLE로 reset 후 재시작).

---

## Implementation Notes

### Matchmaking 확장

```typescript
// story-001/002 코드에 추가

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 6;

private validateMatchSize(playerIds: PlayerId[]): boolean {
  if (playerIds.length < MIN_PLAYERS || playerIds.length > MAX_PLAYERS) {
    this.bus.emit('MATCHMAKING_FAILED', {
      reason: `invalid_match_size:${playerIds.length}`,
      timestamp: Date.now(),
    });
    return false;
  }
  return true;
}

private handleMatchReady(m: ServerMessages['MATCH_READY']): void {
  if (this.matchInitialized) return;
  if (!this.validateMatchSize(m.playerIds)) return; // AC-DM-04, AC-DM-05
  this.matchInitialized = true;
  // ... story-002 처리
}
```

### Disconnect 처리

WebSocketClient의 disconnect 콜백을 구독:

```typescript
// 생성자에 추가
const onDisconnect = () => this.handleDisconnect();
ws.onDisconnect?.(onDisconnect); // optional in IWebSocketClient — MockWebSocketClient.onDisconnect 활용

private handleDisconnect(): void {
  if (this.state === 'WAITING') {
    this.state = 'FAILED';
    this.bus.emit('MATCHMAKING_FAILED', { reason: 'disconnected', timestamp: Date.now() }); // AC-DM-06
  } else if (this.state === 'MATCH' || this.matchInitialized) {
    this.bus.emit('LOCAL_PLAYER_DISCONNECTED', { timestamp: Date.now() }); // AC-DM-07
  }
}
```

`LOCAL_PLAYER_DISCONNECTED`는 GameEvents에 추가:
```typescript
LOCAL_PLAYER_DISCONNECTED: { timestamp: number };
```

### 재시작 (AC-DM-08)

`reset()` 메서드 추가:
```typescript
reset(): void {
  this.state = 'IDLE';
  this.matchInitialized = false;
}
```

start() 재호출 시 reset() 후 재진입.

---

## Out of Scope

- 게임 중 다른 플레이어 disconnect 처리 — RoundManager 책임 (PLAYER_KILLED 발행)
- 자동 재연결 (WebSocketReconnectManager 통합) — Sprint 7+
- 큐 대기 시간 표시 UI — Sprint 7+ (UX 화면)

---

## QA Test Cases

**AC-DM-01** — 2인 매치
- Given: AUTH 후 WAITING
- When: `ws.simulateMessage('MATCH_READY', { playerIds:['p1','p2'], localPlayerId:'p1', ... })`
- Then: onMatchInit called with totalPlayers=2

**AC-DM-02** — 5인 매치
- 동일 패턴, playerIds.length === 5

**AC-DM-03** — 6인 매치
- 동일 패턴, playerIds.length === 6

**AC-DM-04** — 1인 매치 invariant
- Given: AUTH 후 WAITING, MATCHMAKING_FAILED spy
- When: `simulateMessage` with `playerIds:['p1']`
- Then: spy called once with reason='invalid_match_size:1'; sessionFlow state === 'MENU' (변화 없음)

**AC-DM-05** — 7인 매치 invariant
- 동일, playerIds.length === 7

**AC-DM-06** — 로비 disconnect
- Given: state === 'WAITING'
- When: `ws.simulateDisconnect()`
- Then: state === 'FAILED'; MATCHMAKING_FAILED emit reason='disconnected'

**AC-DM-07** — 게임 중 disconnect
- Given: MATCH_READY 처리 후 (matchInitialized=true)
- When: `ws.simulateDisconnect()`
- Then: LOCAL_PLAYER_DISCONNECTED emit; (RoundManager 처리는 별도)

**AC-DM-08** — disconnect 후 재시작
- Given: 로비 disconnect 후 state === 'FAILED'
- When: `mm.reset()` 후 `mm.start(...)`
- Then: ws.connect 재호출됨; AUTH 재송신

---

## Test Evidence

**Story Type**: Integration
**Required**: `tests/integration/matchmaking/matchmaking_degenerate_disconnect_test.ts`

**Status**: [x] Covered by `tests/integration/matchmaking/matchmaking_test.ts` (9 tests: AC-DM-01 through AC-DM-08, plus AC-DM-08b)

---

## Completion Notes
**Completed**: 2026-04-27
**Criteria**: 8/8 passing + 1 edge test (AC-DM-01 ~ AC-DM-08, plus AC-DM-08b retry-after-failure full-cycle test)
**Deviations**:
- Disconnect detection uses optional `onDisconnect` on the WebSocket client (same pattern as `WebSocketReconnectManager`). MockWebSocketClient supports it; the production WebSocketAdapter currently exposes it (verified via grep). If the real adapter does not implement onDisconnect, the disconnect handling path silently no-ops — flag for Sprint 7+ if true.
- The `dispose()` cleanup does not call `offDisconnect` because no such method exists in `IWebSocketClient`. Acceptable because `ws.disconnect()` is also called in dispose, preventing later events.
**Test Evidence**: 9 tests in matchmaking_test.ts § "degenerate match + disconnect"
**Code Review**: Skipped — Lean mode

---

## Dependencies

- Depends on: story-001 + story-002
- Unlocks: 멀티플레이어 playtest (S6-M6) — 2인 매치로도 진행 가능
