# Story 002: MATCH_READY 처리 + SessionFlow/RoundManager 초기화

> **Epic**: Matchmaking
> **Status**: Complete
> **Layer**: Feature
> **Type**: Integration
> **Manifest Version**: 2026-04-22

## Context

**GDD**: `design/gdd/round-manager.md`
**Requirements**: `TR-matchmaking-001`

**ADR Governing**: ADR-0014 + ADR-0011 (Round Phase FSM)
**Decision Summary**: WebSocket으로 MATCH_READY 수신 → `playerIds.length`를 `totalPlayers`로 RoundManager에 전달 + SessionFlow.startMatch() 호출. 서버 권위(ADR-0010)이므로 `startRound()`는 서버의 ROUND_START 메시지 수신 시 별도 트리거.

**Engine**: Cocos Creator 3.8.6 | **Risk**: LOW

**Control Manifest Rules (Feature layer)**:
- Required: 모든 이벤트 `IEventBus.emit<K>()` — source: ADR-0001
- Required: WebSocketClient 핸들러 1회 등록 (생성자), dispose 시 해제 — source: ADR-0010
- Forbidden: SessionFlow / RoundManager 직접 인스턴스화 — DI로 주입 — source: ADR-0003

---

## Acceptance Criteria

- [ ] **AC-MR-01**: `MATCH_READY` 메시지 수신 시 `sessionFlow.startMatch()`가 정확히 1회 호출됨.
- [ ] **AC-MR-02**: MATCH_READY.playerIds.length === 3 일 때 RoundManager 초기화 콜백에 `totalPlayers=3`, `playerIds=['p1','p2','p3']` 전달.
- [ ] **AC-MR-03**: MATCH_READY.localPlayerId가 RoundManager 초기화 콜백에 전달 (자신 식별 용도).
- [ ] **AC-MR-04**: 동일 세션에 두 번째 MATCH_READY 수신 시 무시 (이미 MATCH 상태 — guard).
- [ ] **AC-MR-05**: `MATCHMAKING_READY` GameEvents 이벤트 emit (HUD/audio 시스템 구독 가능).
- [ ] **AC-MR-06**: dispose() 호출 시 WebSocketClient.off('MATCH_READY', ...) 호출됨.

---

## Implementation Notes

### Matchmaking 확장

story-001의 Matchmaking 클래스에 다음을 추가:

```typescript
export interface MatchInitContext {
  totalPlayers: number;
  playerIds: PlayerId[];
  localPlayerId: PlayerId;
  sessionId: string;
  serverTime: number;
}

export class Matchmaking {
  // ... story-001 fields

  constructor(
    private readonly ws: IWebSocketClient,
    private readonly bridge: ITossBridge,
    private readonly bus: IEventBus,
    private readonly sessionFlow: SessionFlow,
    private readonly onMatchInit: (ctx: MatchInitContext) => void, // RoundManager init callback
  ) {
    const onMatchReady = (m: ServerMessages['MATCH_READY']) => this.handleMatchReady(m);
    ws.on('MATCH_READY', onMatchReady);
    this.matchReadyHandler = onMatchReady;
  }

  private matchReadyHandler: ((m: ServerMessages['MATCH_READY']) => void) | null = null;
  private matchInitialized = false;

  private handleMatchReady(m: ServerMessages['MATCH_READY']): void {
    if (this.matchInitialized) return; // AC-MR-04
    this.matchInitialized = true;

    this.onMatchInit({
      totalPlayers: m.playerIds.length,
      playerIds: m.playerIds,
      localPlayerId: m.localPlayerId,
      sessionId: m.sessionId,
      serverTime: m.serverTime,
    }); // AC-MR-02, AC-MR-03

    this.sessionFlow.startMatch(); // AC-MR-01
    this.bus.emit('MATCHMAKING_READY', { ...m, timestamp: Date.now() }); // AC-MR-05
  }

  dispose(): void {
    if (this.matchReadyHandler) this.ws.off('MATCH_READY', this.matchReadyHandler); // AC-MR-06
    // ... story-001 dispose
  }
}
```

`MATCHMAKING_READY`는 GameEvents에 추가:
```typescript
MATCHMAKING_READY: { sessionId: string; playerIds: PlayerId[]; localPlayerId: PlayerId; serverTime: number; timestamp: number };
```

---

## Out of Scope

- story-001: AUTH + connect (이미 완료)
- story-003: degenerate match (2-5인) + disconnect 처리
- ROUND_START 수신 후 RoundManager.startRound() 호출 — 별도 (Foundation 레이어 통합 또는 RoundManager 자체 구독)

---

## QA Test Cases

**AC-MR-01** — startMatch 호출
- Given: Matchmaking AUTH 후 WAITING 상태, sessionFlow=실 SessionFlow (MENU)
- When: `ws.simulateMessage('MATCH_READY', {...})`
- Then: `sessionFlow.getState() === 'MATCH'`

**AC-MR-02** — totalPlayers 전달
- Given: onMatchInit spy
- When: simulateMessage with `playerIds:['p1','p2','p3']`
- Then: spy called with `{totalPlayers:3, playerIds:[...], ...}`

**AC-MR-03** — localPlayerId 전달
- Given: 동일
- When: simulateMessage with `localPlayerId:'p2'`
- Then: spy.calls[0].args[0].localPlayerId === 'p2'

**AC-MR-04** — 두 번째 MATCH_READY 무시
- Given: 첫 MATCH_READY 처리 완료
- When: 두 번째 simulateMessage
- Then: onMatchInit spy 호출 횟수 1 (변화 없음)

**AC-MR-05** — MATCHMAKING_READY emit
- Given: bus.on('MATCHMAKING_READY', spy)
- When: simulateMessage
- Then: flush 후 spy 1회 호출

**AC-MR-06** — dispose
- Given: 정상 동작 중
- When: `mm.dispose()`
- Then: ws.off('MATCH_READY', ...) 호출, 이후 simulateMessage 무시

---

## Test Evidence

**Story Type**: Integration
**Required**: `tests/integration/matchmaking/matchmaking_match_ready_test.ts`

**Status**: [x] Covered by `tests/integration/matchmaking/matchmaking_test.ts` (4 tests: AC-MR-01 through AC-MR-06)

---

## Completion Notes
**Completed**: 2026-04-27
**Criteria**: 6/6 passing (AC-MR-01 ~ AC-MR-06)
**Deviations**: None — implementation matches story spec. Combined with stories 001/003 in single Matchmaking.ts.
**Test Evidence**: 4 tests in matchmaking_test.ts § "MATCH_READY processing"
**Code Review**: Skipped — Lean mode

---

## Dependencies

- Depends on: story-001 (Matchmaking 기본 구조)
- Depends on: SessionFlow ✅, RoundManager ✅
- Unlocks: story-003 (degenerate match handling)
