# ADR-0014: Matchmaking 6인 매치 조건 — 서버 로비 큐 · 최소 인원 · 연결 끊김 처리

## Status
Accepted

## Date
2026-04-22

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | Cocos Creator 3.8.6 (TypeScript) — 클라이언트 측 |
| **Domain** | Feature / Networking (서버: Node.js, 클라이언트: TypeScript) |
| **Knowledge Risk** | LOW — Node.js FIFO 큐 + WebSocket 프로토콜. ADR-0010 확정 API 사용 |
| **References Consulted** | `docs/engine-reference/cocos/VERSION.md`, `ADR-0010` |
| **Post-Cutoff APIs Used** | None |
| **Verification Required** | AC-MM-01~06 통합 테스트 통과 (MockWebSocketClient 활용) |

## ADR Dependencies

| Field | Value |
|-------|-------|
| **Depends On** | ADR-0004 (TossBridge — getUserToken()으로 AUTH 토큰 취득), ADR-0010 (Server Authority — MATCH_READY / AUTH 메시지 포맷, IWebSocketClient 인터페이스) |
| **Enables** | RoundManager 초기화 (`totalPlayers` 전달), 세션 시작 흐름 |
| **Blocks** | 멀티플레이어 세션 시작 구현 전체 |
| **Ordering Note** | ADR-0010 (서버 권위 모델 + 메시지 포맷) 확정 후 작성. OQ-5 (degenerate match) 해소 ADR |

## Context

GRID REAPER는 6인 멀티플레이어 게임이다. 서버가 6명을 모아 세션을 시작하고 `MATCH_READY`를 브로드캐스트한다(ADR-0010). 그러나 두 가지 미결 문제가 있었다:

1. **서버 로비 조립 로직**: 6명을 어떻게 모으는가? 큐가 여러 개인가?
2. **OQ-5 — Degenerate match**: 6명 미만(2~5명)으로 매치가 시작될 수 있는가? 전략 균형이 붕괴되는가?

**GDD 출처**: `design/gdd/round-manager.md` (MATCH_READY 프로토콜), TR-matchmaking-001/002/003

## Decision

### 1. 서버 로비: 단일 FIFO 큐 (Flat Queue)

서버는 단일 글로벌 대기열을 유지한다. WebSocket 연결 + AUTH 검증 성공 순서대로 큐에 추가한다. 큐 길이가 `MIN_MATCH_SIZE` 이상이 되는 순간 세션을 개시한다.

```
클라이언트 연결 → AUTH { token, sessionId? } 전송
서버 검증 → 큐에 추가
큐 길이 >= MIN_MATCH_SIZE → 세션 생성 → MATCH_READY 브로드캐스트
```

**이 ADR이 정하는 `MIN_MATCH_SIZE` = 2** (하단 OQ-5 결정 참조)

**`MAX_MATCH_SIZE` = 6**: 큐에 6명이 채워지면 즉시 세션 시작. 6명 초과는 다음 큐로.

### 2. OQ-5 해소 — Degenerate Match 허용 (MIN 2인)

**결정**: 2~5인 매치를 허용한다. 규칙 변경 없음. `totalPlayers`만 달라진다.

**근거**:
- 사망 → 스펙테이터 → 부활 구조는 인원 수에 무관하게 동작한다(ADR-0013)
- 6인 큐가 채워지기 어려운 소프트런치 초기, 2인 매치로도 코어 루프 검증 가능
- OQ-5가 우려하는 "2인 degenerate 전략"은 플레이테스트로만 검증 가능 — 설계 단계에서 사전 차단보다 관측 후 튜닝이 적합
- `MIN_MATCH_SIZE`는 Tuning Knob으로 서버 환경변수에서 읽는다 — 필요 시 4 또는 6으로 올릴 수 있다

### 3. MATCH_READY 페이로드 (ADR-0010 재확인)

```typescript
// ADR-0010에서 정의 — 이 ADR이 context를 추가
MATCH_READY: {
  sessionId: string;         // 세션 식별자 (재연결용 — MVP에서는 사용 안 함)
  playerIds: PlayerId[];     // 세션 참가자 전원 (길이 = MIN_MATCH_SIZE ~ MAX_MATCH_SIZE)
  localPlayerId: PlayerId;   // 이 클라이언트의 PlayerId
  serverTime: number;        // 서버 simulatedTime 기준점 (ADR-0002 동기화용)
}
```

`playerIds.length`가 `totalPlayers`가 된다. RoundManager 초기화 시 이 값을 전달한다.

### 4. 로비 중 연결 끊김

세션 시작 전(로비 대기 중) WebSocket 연결이 끊긴 클라이언트는 큐에서 제거된다. `MATCH_READY` 발행 전이므로 세션에 영향 없음. 클라이언트는 재연결 후 다시 AUTH를 전송하여 큐에 재진입한다.

세션 시작 후(게임 중) 연결 끊김은 ADR-0010 "연결 끊김 Mitigation" 적용: MVP에서 재연결 불가 시 해당 플레이어를 `PLAYER_KILLED`로 처리하고 세션 계속 진행.

## Consequences

### 긍정적 결과
- **단순한 서버 로비**: 단일 FIFO 큐, 복잡한 skill-based matchmaking 없음. MVP 적합.
- **소프트런치 대응**: MIN 2인으로 초기 사용자가 적어도 테스트 및 스트리밍 가능.
- **tunable**: `MIN_MATCH_SIZE`를 환경변수화하여 운영 중 조정 가능.

### 부정적 결과
- **OQ-5 전략 불균형**: 2인 매치의 degenerate 전략 위험은 잔존. 플레이테스트 이후 MIN을 올리는 것으로 완화.
- **단일 큐 공정성**: 대기 시간 편차 가능. 다중 큐(지역별 등) 없음 — MVP 이후 확장 여지.

## Alternatives Considered

### A. MIN_MATCH_SIZE = 6 고정

정확히 6명이 모여야 시작. OQ-5 전략 우려 원천 차단.

**기각 이유**: 소프트런치 초기 DAU가 낮으면 대기 시간이 무한정 늘어난다. 코어 루프 검증이 불가능해지고, 팀 내 통합 테스트도 어렵다. "규칙 변경 없이 인원만 다르다"는 특성상 MIN을 낮게 유지하는 비용이 낮다.

### B. 시간 기반 자동 시작 (타임아웃 후 2인 이상이면 강제 시작)

`LOBBY_WAIT_TIMEOUT`(예: 30s) 후 인원 수와 무관하게 시작하는 방안.

**기각 이유**: `MIN_MATCH_SIZE` 환경변수로 동일 효과를 달성할 수 있다. 별도 타임아웃 로직은 복잡도만 늘린다. MVP 범위 외.

### C. 지역별 / ELO 기반 매치메이킹

**기각 이유**: Toss 인토스 webview 초기 배포 단계에서 플레이어 풀이 작다. ELO 시스템 없음. MVP 이후 과제.

## Implementation Guidelines

### 서버 로비 (Node.js — ADR-0010 서버)

```typescript
// server/src/Lobby.ts

const MIN_MATCH_SIZE = parseInt(process.env.MIN_MATCH_SIZE ?? '2', 10);
const MAX_MATCH_SIZE = 6;

class Lobby {
  private queue: AuthenticatedClient[] = [];

  onClientAuthenticated(client: AuthenticatedClient): void {
    this.queue.push(client);
    if (this.queue.length >= MIN_MATCH_SIZE) {
      this.tryStartSession();
    }
  }

  private tryStartSession(): void {
    const players = this.queue.splice(0, MAX_MATCH_SIZE);
    const sessionId = generateSessionId();
    const payload: MatchReadyPayload = {
      sessionId,
      playerIds: players.map(p => p.playerId),
      serverTime: Date.now(),
    };
    players.forEach(p => {
      p.send({ type: 'MATCH_READY', ...payload, localPlayerId: p.playerId });
    });
  }
}
```

### 클라이언트 초기화 (RoundManager에 totalPlayers 전달)

```typescript
// src/features/round/RoundManager.ts

onMatchReady(event: MatchReadyEvent): void {
  this.totalPlayers = event.playerIds.length;  // 2~6
  this.initPlayerStates(event.playerIds);
  // startRound()는 서버의 ROUND_STARTED 수신 후 호출 (ADR-0010 서버 권위)
}
```

**규칙**:
- `MIN_MATCH_SIZE`는 서버 환경변수(`MIN_MATCH_SIZE`)에서 읽는다 — 하드코딩 금지
- `totalPlayers`는 `MATCH_READY.playerIds.length`에서 파생 — 별도 전달 금지
- 클라이언트는 로비 큐 크기를 알 수 없다 — 서버가 `MATCH_READY`를 보낼 때까지 대기

## GDD Requirements Addressed

| TR-ID | GDD | 요구사항 | 처리 방식 |
|-------|-----|---------|---------|
| TR-matchmaking-001 | round-manager.md | MATCH_READY 수신 시 세션 시작 | FIFO 큐 MIN 도달 시 브로드캐스트 |
| TR-matchmaking-002 | round-manager.md | AUTH { token } 전송 | ADR-0010 + ADR-0004 재확인 |
| TR-matchmaking-003 | round-manager.md | Degenerate 2-5인 매치 허용 | MIN_MATCH_SIZE=2, tunable |

## Validation Criteria

- **AC-MM-01**: `MIN_MATCH_SIZE`명이 AUTH를 완료하면 `MATCH_READY`가 브로드캐스트된다
- **AC-MM-02**: `MATCH_READY.playerIds.length`가 2~6 범위 내에 있다
- **AC-MM-03**: `MATCH_READY` 수신 후 `RoundManager.totalPlayers`가 `playerIds.length`와 일치한다
- **AC-MM-04**: 로비 대기 중 연결 끊김 클라이언트가 큐에서 제거된다
- **AC-MM-05**: 큐에 `MAX_MATCH_SIZE`(6)명 이상 있을 때 6명만 세션에 포함되고 나머지는 다음 큐에 잔류한다
- **AC-MM-06**: `MIN_MATCH_SIZE` 환경변수를 4로 변경 시 4명 미만으로는 세션이 시작되지 않는다
