# ADR-0008: Player Movement 이벤트 분리 — PLAYER_MOVED(t=0) vs PLAYER_ARRIVED(t=0.1s)

## Status
Accepted

## Date
2026-04-21

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | Cocos Creator 3.8.6 (TypeScript) |
| **Domain** | Core / Scripting |
| **Knowledge Risk** | LOW — FrameClock.schedule() 기반 순수 TypeScript 로직. 엔진 API 비의존 |
| **References Consulted** | `docs/engine-reference/cocos/VERSION.md` |
| **Post-Cutoff APIs Used** | None |
| **Verification Required** | PLAYER_ARRIVED가 PLAYER_MOVED 이후 정확히 0.1s(±1ms)에 발행되는지 단위 테스트 확인 |

## ADR Dependencies

| Field | Value |
|-------|-------|
| **Depends On** | ADR-0001 (GameEvents — PLAYER_MOVED, PLAYER_ARRIVED 이벤트 정의), ADR-0002 (FrameClock.schedule — t=0.1s 큐잉), ADR-0005 (CellCoord 타입) |
| **Enables** | ADR-0009 (GRID_STALLED 흐름 — 이동/폭발 판정 순서 의존), ADR-0011 (Round Phase 상태 머신 — PLAYER_ARRIVED → Goal Cell 판정) |
| **Blocks** | PlayerMovement 구현, GridSimulation 폭발 판정 순서 구현 |
| **Ordering Note** | GridSimulation(ADR-0006)과 함께 Core 레이어 구현 전 확정 필요 |

## Context

### Problem Statement

플레이어 이동에는 두 개의 의미 있는 시점이 존재한다:

1. **t=0 (논리 좌표 확정)**: 입력 수신 즉시 플레이어의 논리 위치(CellCoord)가 새 셀로 변경됨. 폭발 판정은 이 시점 기준.
2. **t=0.1s (트윈 완료)**: 비주얼 이동 애니메이션이 끝나는 시점. Goal Cell 도달 판정, 다음 입력 활성화는 이 시점 기준.

단일 이벤트로 두 시점을 표현하면:
- 소비자가 "언제 판정해야 하는가"를 알 수 없어 **타이밍 버그** 발생
- 일부 소비자(DeathReplay)는 t=0 데이터, 다른 소비자(RoundManager)는 t=0.1s 데이터가 필요한데 하나의 이벤트로는 불가능
- EC-1(트윈 중 폭발 판정): t=0에서 논리 좌표가 이미 목적지로 이동했으므로 출발 셀 폭발은 플레이어에게 영향 없음 — 이 규칙을 이벤트 구조로 명확화 필요

### Constraints

- 처리 순서는 `이동 처리 → 폭발 판정` (GDD PM-2 Rule 3 / grid-explosion A-4)
- PLAYER_ARRIVED는 FrameClock.schedule(fn, 0.1) 기반 — ADR-0002 simulatedTime 기준
- 동시 멀티플레이어 환경에서 모든 클라이언트가 동일 `from → to` 좌표를 수신해야 함

### Requirements

- t=0에서 논리 좌표 변경 + PLAYER_MOVED 발행
- t=0.1s에서 PLAYER_ARRIVED 발행 (FrameClock.schedule 이용)
- 폭발 판정은 PLAYER_MOVED 시점 기준 (논리 좌표 기준)
- Goal Cell 도달 판정은 PLAYER_ARRIVED 시점에만 수행

## Decision

**PLAYER_MOVED(t=0)** 와 **PLAYER_ARRIVED(t=0.1s)** 를 분리된 두 이벤트로 설계한다.

- `PLAYER_MOVED`: 입력 처리 → 논리 좌표 갱신 → 즉시 emit. 폭발 판정 트리거.
- `PLAYER_ARRIVED`: FrameClock.schedule(fn, 0.1) → 0.1s 후 emit. Goal Cell 판정 트리거.

### 이벤트 흐름 시퀀스

```
t=0   입력 수신 (TAP_DETECTED or Direction8)
      │
      ├── PlayerMovement: 논리 좌표 업데이트 (from → to)
      ├── EventBus.emit(PLAYER_MOVED, { playerId, from, to, timestamp })
      ├── FrameClock.schedule(() => emitArrived(), 0.1)
      │
      └── GridSimulation: 폭발 판정
              (이미 논리 좌표 = to 기준 — EC-1 준수)
              PLAYER_KILLED 발행 가능성

t=0.1s  FrameClock.schedule 만료
         │
         └── EventBus.emit(PLAYER_ARRIVED, { playerId, cell: to, timestamp })
                │
                └── RoundManager: Goal Cell 판정 수행
```

### Architecture Diagram

```
PlayerMovement
    │  t=0
    ├── emit(PLAYER_MOVED { playerId, from, to, timestamp })
    │        │
    │        ├── GridSimulation: 폭발 판정 (다음 flush)
    │        └── DeathReplay: 이동 경로 기록 (다음 flush)
    │
    └── schedule(emitArrived, 0.1s)   ← ADR-0002 FrameClock
             │  t=0.1s
             └── emit(PLAYER_ARRIVED { playerId, cell, timestamp })
                      │
                      └── RoundManager: Goal Cell 판정

사망 처리:
    PLAYER_KILLED 수신 → PlayerMovement Dead 상태 전환
    → 진행 중인 schedule(emitArrived) 취소 (FrameClock.cancelSchedule)
    → 버퍼 파기
```

### Key Interfaces

```typescript
// GameEvents (ADR-0001에서 확정)
// PLAYER_MOVED: 논리 좌표 변경 즉시 (t=0)
// PLAYER_ARRIVED: 트윈 완료 시 (t=0.1s, FrameClock.schedule 기준)

// src/core/player/PlayerMovement.ts (일부)

export const MOVE_TWEEN_DURATION = 0.1; // seconds (Tuning Knob)

class PlayerMovement {
  constructor(
    private clock: IFrameClock,
    private eventBus: IEventBus,
  ) {}

  onMoveInput(playerId: PlayerId, from: CellCoord, to: CellCoord): void {
    // 1. 논리 좌표 즉시 갱신
    this.logicalPosition = to;

    // 2. PLAYER_MOVED 즉시 발행 (t=0)
    this.eventBus.emit('PLAYER_MOVED', {
      playerId, from, to,
      timestamp: this.clock.now()
    });

    // 3. PLAYER_ARRIVED 0.1s 후 큐잉 (ADR-0002 schedule)
    const arrivedFn = () => {
      this.eventBus.emit('PLAYER_ARRIVED', {
        playerId,
        cell: to,
        timestamp: this.clock.now()
      });
    };
    this.pendingArrived = arrivedFn;
    this.clock.schedule(arrivedFn, MOVE_TWEEN_DURATION);
  }

  onPlayerKilled(): void {
    // 사망 시 진행 중인 arrived 스케줄 취소
    if (this.pendingArrived) {
      this.clock.cancelSchedule(this.pendingArrived);
      this.pendingArrived = null;
    }
  }
}

// Invariants:
// 1. PLAYER_MOVED emit 이전에 논리 좌표가 to로 갱신됨.
//    폭발 판정 시스템은 PLAYER_MOVED flush 시 논리 좌표 기준으로 판정.
// 2. PLAYER_ARRIVED는 MOVE_TWEEN_DURATION(0.1s) 후 FrameClock.schedule로 큐잉.
//    simulatedTime 기준이므로 결정론적.
// 3. PLAYER_KILLED 수신 시 pendingArrived 즉시 cancelSchedule.
```

## Alternatives Considered

### Alternative A: 단일 PLAYER_MOVED 이벤트 (arrived 포함 필드)
- **Description**: `PLAYER_MOVED { playerId, from, to, arrivedAt: number }` — arrived 예정 시각을 페이로드에 포함
- **Pros**: 이벤트 수 감소
- **Cons**: 소비자가 `arrivedAt`을 보고 직접 타이밍 계산 — 각 소비자가 자체 스케줄 등록 → 분산된 타이밍 로직. FrameClock mock 없이는 테스트 불가.
- **Rejection Reason**: 타이밍 로직 분산 + 소비자 구현 복잡도 증가. GDD PM-2 이동/폭발 순서 명시가 이벤트 구조에서 불명확해짐.

### Alternative B: PLAYER_ARRIVED 없이 RoundManager가 PLAYER_MOVED 구독 후 schedule
- **Description**: RoundManager가 PLAYER_MOVED 수신 → 자체적으로 `schedule(goalCheck, 0.1)` 등록
- **Pros**: PlayerMovement가 RoundManager를 몰라도 됨 (현재도 마찬가지)
- **Cons**: 타이밍 로직이 RoundManager에 중복 — PlayerMovement가 "트윈 완료" 타이밍의 권위자임에도 이 정보를 이벤트로 노출하지 않음. DeathReplay 같은 다른 소비자도 각자 0.1s schedule 등록 → 중복.
- **Rejection Reason**: 타이밍 권위를 PlayerMovement에서 분산. PLAYER_ARRIVED가 명확한 의미 단위이며 GDD에서 명시된 계약.

## Consequences

### Positive
- 폭발 판정(t=0)과 Goal Cell 판정(t=0.1s) 책임이 이벤트 구조로 명확히 분리
- FrameClock.schedule mock으로 단위 테스트에서 시간 진행 제어 가능
- EC-1(트윈 중 폭발 판정 무효) 규칙이 이벤트 설계 자체에서 보장됨

### Negative
- PlayerMovement가 사망 시 `cancelSchedule` 책임 — 누락 시 Dead 상태에서 PLAYER_ARRIVED 발행되는 버그 가능
- MOVE_TWEEN_DURATION 튜닝 시 PlayerMovement와 시각 트윈 코드 두 곳 동기화 필요

### Risks
- **cancelSchedule 누락**: PLAYER_KILLED 핸들러에서 cancelSchedule 미호출 → Dead 플레이어 PLAYER_ARRIVED 발행 → RoundManager Goal Cell 오판정. **Mitigation**: PlayerMovement 단위 테스트에서 PLAYER_KILLED → PLAYER_ARRIVED 미발행 케이스 필수 검증.
- **라운드 종료 중 트윈 진행**: EC-7 — 라운드 종료 시 트윈 즉시 스냅. schedule도 동시에 cancelSchedule 필요. **Mitigation**: ROUND_CLEAR / GAME_OVER 수신 시에도 cancelSchedule 호출.

## GDD Requirements Addressed

| GDD System | Requirement | How This ADR Addresses It |
|------------|-------------|--------------------------|
| player-movement.md | PM-2: 논리 좌표 즉시 변경 → 비주얼 트윈 0.1s | PLAYER_MOVED(t=0) 논리 확정, PLAYER_ARRIVED(t=0.1s) 트윈 완료 분리 |
| player-movement.md | PM-2 Rule 3: 처리 순서 이동 → 폭발 판정 | PLAYER_MOVED flush 시점에 논리 좌표 갱신 완료 → GridSimulation 판정 |
| player-movement.md | EC-1: 트윈 중 출발 셀 폭발 → 영향 없음 | t=0에서 논리 좌표 = to → 출발 셀 폭발 판정 대상 아님 |
| player-movement.md | EC-6: PLAYER_KILLED + 버퍼 충돌 | cancelSchedule로 pendingArrived 취소 |
| round-manager.md | PLAYER_ARRIVED → Goal Cell 감지 | PLAYER_ARRIVED t=0.1s 보장으로 RoundManager 판정 타이밍 확정 |

## Performance Implications
- **CPU**: 이동마다 schedule() 1회 + emit() 2회 — <0.01ms
- **Memory**: pendingArrived 함수 참조 1개 — 무시 가능
- **Load Time**: 없음
- **Network**: 없음

## Migration Plan
신규 시스템 — 기존 코드 없음. PlayerMovement 구현 시 PLAYER_MOVED emit 이후 즉시 FrameClock.schedule 등록. PLAYER_KILLED 핸들러에 cancelSchedule 반드시 포함.

## Validation Criteria
- [ ] PLAYER_MOVED emit 후 `tick(0.1)` 1회 시 PLAYER_ARRIVED 발행 확인 (단위 테스트)
- [ ] PLAYER_MOVED emit 후 `tick(0.05)` 중 PLAYER_KILLED 수신 시 PLAYER_ARRIVED 미발행 확인
- [ ] EC-7: ROUND_CLEAR 수신 시 진행 중인 arrived 스케줄 취소 확인
- [ ] PLAYER_ARRIVED.cell === PLAYER_MOVED.to (좌표 일치)
- [ ] 동일 playerId에 연속 2회 이동 시 두 PLAYER_ARRIVED 모두 독립적으로 발행

## Related Decisions
- ADR-0001: GameEvents — PLAYER_MOVED, PLAYER_ARRIVED 페이로드 타입 확정
- ADR-0002: FrameClock — schedule(fn, 0.1) 기반 simulatedTime 큐잉
- ADR-0005: CellCoord — from, to, cell 타입
- ADR-0009: GRID_STALLED — 이동/폭발 판정 순서가 3자 체인에서 유지됨을 확인
- `docs/architecture/architecture.md` § Core Layer, § Data Flow
