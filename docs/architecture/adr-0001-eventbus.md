# ADR-0001: EventBus 아키텍처 — 타입-세이프 프레임-flush 큐

## Status
Accepted

## Date
2026-04-21

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | Cocos Creator 3.8.6 (TypeScript) |
| **Domain** | Core / Scripting |
| **Knowledge Risk** | LOW — EventTarget은 LLM 훈련 범위 내, 3.8.6 breaking changes 무관 |
| **References Consulted** | `docs/engine-reference/cocos/VERSION.md` |
| **Post-Cutoff APIs Used** | None — `cc.EventTarget` 기반 래핑, patch-level 변경 없음 |
| **Verification Required** | flush() 연속 호출 시 이벤트 중복 발행 여부 단위 테스트로 검증 |

## ADR Dependencies

| Field | Value |
|-------|-------|
| **Depends On** | None — Foundation 최상위 결정 |
| **Enables** | ADR-0002 (FrameClock이 flush 유일 호출자 — EventBus 먼저 확정), ADR-0003 ~ ADR-0010 (이벤트 기반 통신 전체) |
| **Blocks** | EventBus를 소비하는 모든 Core / Feature / Presentation 모듈 구현 |
| **Ordering Note** | Init order step 3 — TossBridge(step 2) 직후, 나머지 모든 시스템 이전 |

## Context

### Problem Statement

GRID REAPER는 6개 레이어 18개 모듈이 동일 게임 이벤트(폭발, 이동, 라운드 전환 등)를 공유한다.
모듈 간 직접 참조는 레이어 경계 위반과 테스트 불가능한 강결합을 낳는다.
중재 없는 동기 이벤트는 핸들러 내부에서 추가 이벤트를 emit하는 재귀 폭발을 유발할 수 있다.
특히 GRID_STALLED 3자 체인(pattern-library → escalation → pattern-library → grid-explosion)은
동기 디스패치 모델에서 스택 오버플로우 위험이 있다.

### Constraints

- Cocos Creator 3.8.6 TypeScript 환경
- 단일 스레드 JS — 락/뮤텍스 불필요, 대신 재진입 방지 설계 필요
- 모바일 webview 60fps — flush() 오버헤드가 16.6ms 프레임 예산 내 수렴
- 아키텍처 원칙 5 "Event Bus as Single Comms" — 모듈 간 직접 참조 금지

### Requirements

- 모든 GameEvents에 컴파일 타임 타입 체크 제공
- emit() 호출 시 해당 프레임 내 즉시 핸들러 실행 금지 (재귀 방지)
- flush()는 FrameClock.tick()에서만 호출 — 단일 진입점 보장
- on/off로 핸들러 등록/해제 가능
- 초기화 비용 최소 — 씬 로드 첫 프레임에 ready

## Decision

**TypeScript 타입-세이프 프레임-flush EventBus** 패턴을 채택한다.

- `emit<K>(key, payload)` 는 이벤트를 내부 큐에 추가만 함. 핸들러를 즉시 호출하지 않음.
- `flush()` 는 큐를 드레인하여 각 이벤트의 등록된 핸들러를 FIFO 순서로 동기 호출함.
- `flush()`의 유일한 호출자는 `FrameClock.tick(dt)` — 프레임당 정확히 1회.
- `GameEvents` 인터페이스로 모든 이벤트 키와 페이로드를 컴파일 타임에 강제.
- 내부 구현은 순수 TypeScript `Map<keyof GameEvents, handler[]>` + 큐 배열 — cc.EventTarget 래핑 선택적.

### Architecture Diagram

```
[모든 시스템]                        [Foundation]
   emit(key, payload)  ──────►  EventBus.queue.push({ key, payload })
                                          │
                                    FrameClock.tick(dt)
                                          │
                                   EventBus.flush()
                                          │
                           큐 드레인: 각 이벤트 FIFO 처리
                                          │
                           핸들러 맵: key → handler[] 순서 호출

재진입 규칙:
  flush() 실행 중 emit() 된 이벤트 → 현재 큐 처리 후 다음 프레임 flush 대상
  (flush 시작 시 큐 스냅샷 복사 후 처리 → 처리 중 추가된 항목은 다음 프레임)
```

**동일 프레임 내 원자적 순서 보장 예시:**

RoundManager.startRound() 내부:
```
emit(ROUND_STARTED, { roundNumber, ctx })   // 큐[0]
emit(ESCALATION_COMPUTED, { ctx })           // 큐[1]
```
→ 동일 flush에서 큐[0] → 큐[1] 순서 처리 보장.

### Key Interfaces

```typescript
// src/core/events/EventBus.ts

import { CellCoord, CellState, PlayerId, EscalationContext } from '../types/Domain';

export interface GameEvents {
  // Grid
  CELL_STATE_CHANGED:  { cell: CellCoord; state: CellState; timestamp: number };
  CELL_EXPLODED:       { cell: CellCoord; timestamp: number };
  PLAYER_KILLED:       { playerIds: PlayerId[]; cellId: CellCoord; cause: 'EXPLOSION' | 'DANGER_ZONE'; timestamp: number };
  GRID_STALLED:        { roundNumber: number; timestamp: number };
  PATTERN_REJECTED:    { patternId: string; reason: string; timestamp: number };

  // Movement
  PLAYER_MOVED:        { playerId: PlayerId; from: CellCoord; to: CellCoord; timestamp: number };
  PLAYER_ARRIVED:      { playerId: PlayerId; cell: CellCoord; timestamp: number };

  // Round
  ROUND_STARTED:       { roundNumber: number; ctx: EscalationContext; timestamp: number };
  ROUND_CLEAR:         { roundNumber: number; survivors: PlayerId[]; timestamp: number };
  GAME_OVER:           { finalRound: number; rankings: PlayerId[]; timestamp: number };
  ALIVE_COUNT_CHANGED: { aliveCount: number; timestamp: number };
  GOAL_PLACED:         { cell: CellCoord; timestamp: number };
  ESCALATION_COMPUTED: { ctx: EscalationContext; timestamp: number };

  // Audio / Input
  AUDIO_EVENT:         { key: 'EXPLOSION' | 'GATE_SAFE' | 'ROUND_CLEAR' | 'GAME_OVER'; cellId?: CellCoord };
  TAP_DETECTED:        { pos: { x: number; y: number }; timestamp: number };
}

export interface IEventBus {
  emit<K extends keyof GameEvents>(key: K, payload: GameEvents[K]): void;
  on<K extends keyof GameEvents>(key: K, handler: (e: GameEvents[K]) => void): void;
  off<K extends keyof GameEvents>(key: K, handler: (e: GameEvents[K]) => void): void;
  flush(): void;  // FrameClock.tick 전용 — 다른 호출자 금지
}

// Invariants:
// 1. emit() 은 큐 추가만. 동일 tick 내 즉시 핸들러 호출 금지.
// 2. flush() 는 FrameClock.tick 외 호출 금지.
// 3. flush() 재진입 금지 — flush 중 emit() 된 이벤트는 다음 프레임 처리.
// 4. on/off 는 flush 외부(초기화/소멸 시점)에서만 호출 권장.
```

## Alternatives Considered

### Alternative B: Cocos EventTarget 직접 사용 (모듈별 개별 EventTarget)
- **Description**: 각 모듈이 자체 `cc.EventTarget`을 가지고, 소비자가 모듈을 직접 참조하여 구독
- **Pros**: Cocos 내장, 추가 코드 없음
- **Cons**: 타입 안전성 없음(string 키 + any payload), 모듈 간 직접 참조로 레이어 경계 위반, 재귀 방지 불가
- **Rejection Reason**: 아키텍처 원칙 5(단방향 통신) 위반, GameEvents 컴파일 타임 검증 불가

### Alternative C: 동기 즉시-통지 EventBus
- **Description**: emit() 호출 즉시 모든 핸들러 실행
- **Pros**: 단순, 구현 코드 최소
- **Cons**: 핸들러 내부 emit() → 재귀 폭발 위험. GRID_STALLED 3자 체인에서 스택 오버플로우 가능
- **Rejection Reason**: GDD EC-RM-5b (GRID_STALLED canonical 흐름)가 동기 모델에서 재귀 유발 확인

## Consequences

### Positive
- 모든 이벤트 페이로드가 컴파일 타임 검증 — 런타임 string 오타 불가
- flush 큐 패턴이 GRID_STALLED 3자 체인의 재귀 폭발 구조적 방지
- 동일 프레임 내 emit 순서 = flush 처리 순서 (FIFO 예측 가능)
- 단위 테스트에서 flush() 수동 호출로 이벤트 흐름 정밀 제어

### Negative
- 이벤트 지연: emit 프레임 후 다음 flush까지 최대 1 프레임(16.6ms) 지연
- FrameClock(ADR-0002)과 구현 시 동기화 필요
- 모듈 격리 테스트 시 mock IEventBus 주입 필요

### Risks
- **flush 중 대용량 큐**: 6명 동시 사망 + GRID_STALLED 동시 발생 시 큐 급증 → 프레임 예산 초과 가능성. **Mitigation**: 최악 시나리오 단위 테스트; 실제 이벤트 수 bounded (~20/frame)
- **flush() 외부 호출 실수**: 개발자가 flush()를 임의 호출하면 invariant 위반. **Mitigation**: flush()에 런타임 guard(isFlushLocked 플래그) 추가 검토

## GDD Requirements Addressed

| GDD System | Requirement | How This ADR Addresses It |
|------------|-------------|--------------------------|
| grid-explosion.md | PLAYER_KILLED 동시 사망을 배열로 발행 | `GameEvents.PLAYER_KILLED.playerIds: PlayerId[]` 타입 확정 |
| player-movement.md | PLAYER_ARRIVED t=0.1s 트윈 완료 후 발행 | `GameEvents.PLAYER_ARRIVED` 정의, Round Manager 구독 경로 확정 |
| round-manager.md | EC-RM-5b GRID_STALLED 3자 체인 무한루프 방지 | flush 큐 패턴으로 동기 재귀 구조적 차단 |
| round-escalation.md | ESCALATION_COMPUTED → HUD/RoundManager 소비 | `GameEvents.ESCALATION_COMPUTED` 발행 경로 확정 |
| fair-feedback.md | PLAYER_KILLED → DeathReplay 트리거 | 타입-세이프 이벤트로 DeathReplay 구독 경로 확정 |

## Performance Implications
- **CPU**: flush() 1회 ≈ 큐 드레인 + 핸들러 호출. 이벤트 20개/프레임 가정 <0.2ms
- **Memory**: 이벤트 큐 배열 — 프레임당 최대 ~20 객체, GC 압력 미미
- **Load Time**: EventBus 초기화 = Map 생성 + 배열 할당 <0.1ms
- **Network**: 해당 없음

## Migration Plan
신규 시스템 — 기존 코드 없음. 모든 모듈은 생성자 DI(의존성 주입)로 `IEventBus` 수신. 씬 루트 또는 Game 컴포넌트에서 단일 EventBus 인스턴스 생성 후 주입.

## Validation Criteria
- [ ] flush() 실행 중 emit() 된 이벤트가 현재 flush에 포함되지 않고 다음 프레임으로 지연됨을 단위 테스트 확인
- [ ] GRID_STALLED 3자 체인 시나리오에서 스택 오버플로우 없이 완료됨을 통합 테스트 확인
- [ ] 6명 동시 PLAYER_KILLED 처리 시 flush() 소요 <1ms 프로파일링 확인
- [ ] 미등록 이벤트 키로 emit() 시 TypeScript 컴파일 에러 발생 확인
- [ ] FrameClock 외 flush() 호출 시 런타임 경고 또는 에러 발생 확인

## Related Decisions
- ADR-0002: FrameClock — flush() 유일 호출자 구현
- ADR-0003: 레이어 경계 강제 — EventBus가 단방향 통신 채널임을 규칙화
- `docs/architecture/architecture.md` § 4.2 이벤트 버스 (IEventBus 인터페이스 원본)
