# ADR-0010: Server Authority 검증 모델 — Node.js WebSocket + IWebSocketClient

## Status
Accepted

## Date
2026-04-21

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | Cocos Creator 3.8.6 (TypeScript) |
| **Domain** | Core / Networking |
| **Knowledge Risk** | MEDIUM — WebSocket API 자체는 표준이나, Toss webview(OQ-7) 환경에서 ws 레이턴시 미검증 |
| **References Consulted** | `docs/engine-reference/cocos/VERSION.md` (Toss 인토스 Integration Notes) |
| **Post-Cutoff APIs Used** | None — 표준 WebSocket API |
| **Verification Required** | OQ-7: 실기기(토스 앱 샌드박스) WebSocket 레이턴시 측정. RTT < 200ms 목표 |

## ADR Dependencies

| Field | Value |
|-------|-------|
| **Depends On** | ADR-0001 (EventBus — 서버 메시지를 게임 이벤트로 변환), ADR-0002 (simulatedTime — 타임스탬프 기준), ADR-0004 (TossBridge.getUserToken() — 인증), ADR-0005 (CellCoord/CellIndex — 직렬화), ADR-0007 (PatternLibrary — 서버 seed 소비) |
| **Enables** | ADR-0014 (Matchmaking 6인 매치 — 서버 MATCH_READY 메시지) |
| **Blocks** | 멀티플레이어 네트워킹 구현 전체 |
| **Ordering Note** | OQ-1 해소(자체 Node.js 서버 확정) 후 작성. TossBridge(ADR-0004) 확정 후 작성 |

## Context

### Problem Statement

멀티플레이어 6인 실시간 게임에서 다음 상태는 **서버 권위 단일 진실** 원칙이 요구된다:

1. **라운드 시드**: 모든 클라이언트가 동일 패턴을 수신하려면 동일 seed 필요 — 서버가 생성/배포
2. **PLAYER_KILLED 확정**: 클라이언트가 각자 로컬로 판정하면 결과 불일치 위험 — 서버 판정 필요
3. **라운드 전환 타이밍**: ROUND_STARTED / ROUND_CLEAR / GAME_OVER 순서가 모든 클라이언트에서 동일해야 함

서버 없이 클라이언트 P2P 모델은 치트 방지 불가이며, 동시 사망 판정(PLAYER_KILLED playerIds[]) 동기화가 불가능하다.

### Constraints

- OQ-1 해소: 자체 Node.js WebSocket 서버
- OQ-7 미해소: Toss webview 실기기 레이턴시 미검증 → MEDIUM risk
- 클라이언트는 낙관적 로컬 예측(이동 즉시 적용) 필요 — 서버 왕복 대기 없이 즉각 반응
- CellIndex(0–63 정수) 사용 — 직렬화 경계 (ADR-0005)
- IWebSocketClient는 Foundation 레이어 (`src/core/net/`) — TossBridge와 동일 계층
- 인증: TossBridge.getUserToken()으로 취득한 토큰 사용 (ADR-0004)

### Requirements

- **서버 권위 범위**: 라운드 seed, PLAYER_KILLED 확정, 라운드 전환 이벤트
- **클라이언트 자율 범위**: 로컬 이동 예측, 폭발 타이밍(simulatedTime 기반), 패턴 선택(seed 기반)
- **프로토콜**: JSON WebSocket (text frame) — MVP 단순성 우선
- **인터페이스**: IWebSocketClient로 추상화 — 단위 테스트에서 MockWebSocketClient 주입

## Decision

**Node.js WebSocket 서버가 라운드 seed + PLAYER_KILLED + 라운드 전환을 권위적으로 제공**하고, 클라이언트는 낙관적 로컬 예측을 수행한 후 서버 메시지로 보정한다.

서버-클라이언트 통신은 `IWebSocketClient` 인터페이스를 통해서만 — Foundation 레이어에서 EventBus 이벤트로 변환.

### 서버 권위 범위 분리

| 상태 | 권위자 | 근거 |
|------|--------|------|
| 라운드 seed | **서버** | 동일 seed → 동일 패턴 보장 (ADR-0007 CR-6) |
| PLAYER_KILLED | **서버** | 동시 사망 중재, 치트 방지 |
| 라운드 전환 (STARTED/CLEAR/OVER) | **서버** | 전체 세션 동기화 |
| 플레이어 이동 | **클라이언트 예측** | 즉각 반응 필요. 서버가 타 플레이어 이동 브로드캐스트 |
| 폭발 타이밍 | **클라이언트** | simulatedTime 결정론적. 동일 seed + gatePeriod → 동일 타이밍 |
| 패턴 선택 | **클라이언트** | 서버 seed 기반 결정론적 (ADR-0007 selectPattern) |

### 메시지 프로토콜 (JSON WebSocket)

```typescript
// src/core/net/WebSocketProtocol.ts

import { CellIndex } from '../grid/CellCoord';

// ─── 서버 → 클라이언트 ──────────────────────────────────────────────
export interface ServerMessages {
  // 매치 준비 완료 (6인 집결)
  MATCH_READY: {
    sessionId: string;
    playerIds: PlayerId[];
    localPlayerId: PlayerId;
    serverTime: number;       // 서버 wallclock (참고용, simulatedTime과 무관)
  };

  // 라운드 시작 (seed + roundNumber)
  ROUND_START: {
    roundNumber: number;
    seed: number;              // 결정론적 패턴 선택 기준 (ADR-0007)
    playerPositions: Record<PlayerId, CellIndex>;  // 초기 위치
  };

  // 타 플레이어 이동 브로드캐스트
  PLAYER_MOVE: {
    playerId: PlayerId;
    from: CellIndex;
    to: CellIndex;
    timestamp: number;         // 서버 수신 시각 (참고용)
  };

  // 플레이어 사망 확정 (서버 권위)
  PLAYER_KILLED: {
    playerIds: PlayerId[];
    cellId: CellIndex;
    cause: 'EXPLOSION' | 'DANGER_ZONE';
    timestamp: number;
  };

  // 라운드 종료
  ROUND_CLEAR: {
    roundNumber: number;
    survivors: PlayerId[];
  };

  // 게임 종료
  GAME_OVER: {
    finalRound: number;
    rankings: PlayerId[];
  };
}

// ─── 클라이언트 → 서버 ──────────────────────────────────────────────
export interface ClientMessages {
  // 연결 인증
  AUTH: {
    token: string;              // TossBridge.getUserToken() (ADR-0004)
    sessionId?: string;         // 재연결 시
  };

  // 이동 입력
  MOVE: {
    direction: Direction8;
    fromCell: CellIndex;        // 서버 측 검증용
    timestamp: number;          // simulatedTime (ADR-0002)
  };
}

// 와이어 포맷: { type: string; payload: ... }
export type ServerMessage = {
  [K in keyof ServerMessages]: { type: K; payload: ServerMessages[K] }
}[keyof ServerMessages];

export type ClientMessage = {
  [K in keyof ClientMessages]: { type: K; payload: ClientMessages[K] }
}[keyof ClientMessages];
```

### Key Interfaces

```typescript
// src/core/net/WebSocketClient.ts

export interface IWebSocketClient {
  connect(serverUrl: string, token: string): Promise<void>;
  disconnect(): void;
  send(msg: ClientMessage): void;
  on<K extends keyof ServerMessages>(
    type: K,
    handler: (payload: ServerMessages[K]) => void
  ): void;
  off<K extends keyof ServerMessages>(
    type: K,
    handler: (payload: ServerMessages[K]) => void
  ): void;
  readonly isConnected: boolean;
}

// 단위 테스트용 스텁
export class MockWebSocketClient implements IWebSocketClient {
  private handlers: Map<string, Function[]> = new Map();
  async connect(): Promise<void> {}
  disconnect(): void {}
  send(msg: ClientMessage): void {}
  on<K extends keyof ServerMessages>(type: K, handler: Function): void {
    if (!this.handlers.has(type)) this.handlers.set(type, []);
    this.handlers.get(type)!.push(handler);
  }
  off<K extends keyof ServerMessages>(type: K, handler: Function): void { /* ... */ }
  get isConnected(): boolean { return true; }

  // 테스트 헬퍼: 서버 메시지 시뮬레이션
  simulateMessage<K extends keyof ServerMessages>(type: K, payload: ServerMessages[K]): void {
    this.handlers.get(type)?.forEach(h => h(payload));
  }
}

// Invariants:
// 1. IWebSocketClient는 Foundation 레이어에 위치. Feature/Presentation에서 직접 WebSocket 사용 금지.
// 2. 서버 메시지 수신 시 EventBus로 변환 — WebSocketClient가 직접 게임 상태 변경 금지.
// 3. CellIndex를 wire format으로 사용. 수신 즉시 indexToCell()로 CellCoord 변환 (ADR-0005).
// 4. PLAYER_KILLED 서버 메시지가 클라이언트 로컬 판정보다 늦게 도달해도 서버 판정 우선.
```

### Architecture Diagram

```
[Node.js WebSocket 서버]
    │ JSON 메시지 (ROUND_START, PLAYER_KILLED, ...)
    ▼
[IWebSocketClient] (src/core/net/)     ← Foundation 레이어
    │ ServerMessage 수신
    │ CellIndex → CellCoord 변환 (ADR-0005)
    │ EventBus.emit(GAME_EVENT) 변환
    ▼
[EventBus] (Foundation)
    │ flush → 각 시스템 핸들러
    ├── GridSimulation: PLAYER_KILLED 처리
    ├── RoundManager: ROUND_START / ROUND_CLEAR
    └── PatternLibrary: ROUND_START.seed 소비

[클라이언트 낙관 예측]
    │ MOVE 입력 → 즉시 PLAYER_MOVED emit (로컬)
    │ 서버가 타 플레이어 PLAYER_MOVE 브로드캐스트 → 수신 후 적용
    └── PLAYER_KILLED 서버 확정 시 로컬 상태 보정
```

## Alternatives Considered

### Alternative A: 클라이언트 P2P (서버 없음)
- **Description**: 호스트 클라이언트가 seed를 생성하고 P2P 브로드캐스트
- **Pros**: 서버 인프라 불필요
- **Cons**: 치트 방지 불가. 호스트 사망 시 P2P 네트워크 붕괴. 동시 사망 중재 불가.
- **Rejection Reason**: 아키텍처 원칙 1 "Server-Authoritative Truth" 위반

### Alternative B: Colyseus 프레임워크
- **Description**: Colyseus 룸 상태 동기화 사용
- **Pros**: 매치메이킹, 상태 동기화 내장. 서버 코드 감소.
- **Cons**: Cocos Creator 3.8.6 지원 미검증. 프레임워크 학습 곡선. IWebSocketClient 추상화와 충돌 가능.
- **Rejection Reason**: OQ-1에서 자체 Node.js로 결정. 프레임워크 종속 최소화.

## Consequences

### Positive
- PLAYER_KILLED 서버 권위 → 모든 클라이언트 동일 판정 보장
- seed 서버 배포 → 결정론적 패턴 선택 동기화 (ADR-0007)
- IWebSocketClient 추상화 → MockWebSocketClient로 단위 테스트에서 서버 없이 네트워킹 검증

### Negative
- PLAYER_KILLED 서버 확정까지 레이턴시 → 클라이언트에서 먼저 사망 판정 후 서버 확인 과정 필요
- Node.js 서버 구현 및 운영 비용

### Risks
- **OQ-7 Toss webview WebSocket 레이턴시**: webview 환경에서 ws 연결 가용성 및 RTT 미검증. **Mitigation**: 실기기 샌드박스 테스트 최우선. RTT > 300ms 시 UX 영향 평가 후 메시지 압축(msgpack) 전환 검토.
- **서버 PLAYER_KILLED와 클라이언트 예측 불일치**: 클라이언트가 이미 이동 후 서버가 이전 위치 기준 PLAYER_KILLED 전송. **Mitigation**: 서버 판정 우선. 클라이언트는 PLAYER_KILLED 수신 시 사망 처리 — 이미 이동했더라도. DeathReplay는 서버 PLAYER_KILLED 시점 스냅샷 기준.
- **연결 끊김**: 세션 중 WebSocket 연결 중단. **Mitigation**: MVP에서 재연결 불가 시 GAME_OVER 처리. AUTH 메시지에 sessionId 필드로 향후 재연결 확장 여지 보존.

## GDD Requirements Addressed

| GDD System | Requirement | How This ADR Addresses It |
|------------|-------------|--------------------------|
| game-concept.md | Server-Authoritative Truth (아키텍처 원칙 1) | 서버가 seed/PLAYER_KILLED/라운드 전환 권위 보유 |
| round-escalation.md | CR-6: 서버 seed 기반 결정론적 패턴 선택 | ROUND_START.seed → PatternLibrary.selectPattern(ctx, seed) |
| grid-explosion.md | PLAYER_KILLED { playerIds[], cellId, cause } | 서버 확정 메시지가 동일 페이로드로 EventBus 변환 |

## Performance Implications
- **CPU**: JSON parse/stringify per message. 메시지 수 ~5–10/라운드 → <0.1ms
- **Memory**: WebSocket 버퍼 + 핸들러 Map — 무시 가능
- **Load Time**: connect() async → TossBridge.init() 이후 병렬 실행 가능
- **Network**: JSON text frame. 최대 메시지 ~200 bytes/msg. 6인 × 10msg/s = ~12KB/s — webview 허용 범위

## Migration Plan
신규 시스템 — 기존 코드 없음. 구현 순서:
1. `src/core/net/WebSocketProtocol.ts` — ServerMessages, ClientMessages 타입 정의
2. `src/core/net/WebSocketClient.ts` — IWebSocketClient + MockWebSocketClient
3. Node.js 서버 프로토타입 — ROUND_START(seed 생성), PLAYER_MOVE 브로드캐스트, PLAYER_KILLED 확정
4. OQ-7: 실기기 샌드박스에서 RTT 측정
5. 6인 매치 로비 → ADR-0014

## Validation Criteria
- [ ] MockWebSocketClient로 ROUND_START(seed) 수신 시 PatternLibrary.selectPattern() 트리거 확인
- [ ] 서버 PLAYER_KILLED 수신 시 로컬 이동 예측과 무관하게 사망 처리 적용
- [ ] CellIndex → CellCoord 변환이 수신 즉시 수행됨 (게임 로직에 CellIndex 미도달)
- [ ] MockWebSocketClient.simulateMessage() 단위 테스트에서 전체 라운드 흐름 시뮬레이션 가능
- [ ] OQ-7: 실기기 ws RTT < 200ms 확인 (실기기 테스트)

## Related Decisions
- ADR-0001: EventBus — 서버 메시지를 게임 이벤트로 변환하는 단일 경로
- ADR-0002: FrameClock — MOVE 메시지에 simulatedTime 타임스탬프 포함
- ADR-0004: TossBridge — getUserToken()으로 AUTH 토큰 취득
- ADR-0005: CellCoord/CellIndex — 직렬화 경계에서 CellIndex 사용
- ADR-0007: PatternLibrary — ROUND_START.seed 소비
- `docs/architecture/architecture.md` § Foundation Layer, § Data Flow (Network)
