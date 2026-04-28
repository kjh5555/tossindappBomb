# ADR-0011: Round Phase 상태 머신 — IDLE / ROUND_ACTIVE / ROUND_CLEAR_DISPLAY / GAME_OVER

## Status
Accepted

## Date
2026-04-22

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | Cocos Creator 3.8.6 (TypeScript) |
| **Domain** | Feature / Scripting |
| **Knowledge Risk** | LOW — 순수 TypeScript 상태 머신 + FrameClock.schedule. 엔진 API 비의존 |
| **References Consulted** | `docs/engine-reference/cocos/VERSION.md` |
| **Post-Cutoff APIs Used** | None |
| **Verification Required** | AC-RM-01~15 단위/통합 테스트 통과. ROUND_CLEAR_DISPLAY 타이머 1500ms ±50ms 정확도 확인 |

## ADR Dependencies

| Field | Value |
|-------|-------|
| **Depends On** | ADR-0001 (EventBus — 모든 라운드 이벤트 발행/구독), ADR-0002 (FrameClock — 라운드 타이머 + ROUND_CLEAR_DISPLAY 타이머), ADR-0003 (Feature 레이어 경계), ADR-0005 (CellCoord — Goal Cell 좌표), ADR-0006 (Gate Period — F-RM-1 goalCell 폴백 조건), ADR-0008 (PLAYER_ARRIVED — Goal Cell 도달 판정 트리거) |
| **Enables** | ADR-0012 (Goal Cell Tie-Break), ADR-0013 (Survival Cycle-Revive), ADR-0016 (HUD Safe Area — 라운드 타이머 표시) |
| **Blocks** | RoundManager 구현 전체 |
| **Ordering Note** | ADR-0008 (PLAYER_ARRIVED) + ADR-0006 (setGatePeriod 순서) 확정 후 작성. Feature 레이어 최초 ADR |

## Context

### Problem Statement

라운드 매니저는 여러 시스템이 생성하는 이벤트(플레이어 이동, 폭발, 서버 라운드 신호)를 소비하여 라운드 생명주기 전환을 제어한다. 상태 머신 정의 없이 구현하면:

1. **중복 이벤트 발행**: `ROUND_CLEAR`가 같은 라운드에 2회 발행되거나 `GAME_OVER`가 중복 트리거됨 — EC-RM-6
2. **지연 이벤트 오처리**: `ROUND_CLEAR_DISPLAY` 중 도착한 `PLAYER_KILLED`가 상태를 변경하는 버그 — EC-RM-4
3. **Goal Cell 판정 순서 불명확**: `PLAYER_ARRIVED`와 폭발 판정이 동일 프레임이면 우선순위 미정 — EC-RM-2
4. **타이머 race condition**: ROUND_CLEAR_DISPLAY 타이머와 GAME_OVER 타이머가 동시에 만료되는 경우

명시적 상태 머신(IDLE / ROUND_ACTIVE / ROUND_CLEAR_DISPLAY / GAME_OVER)과 각 상태의 이벤트 수락/거부 규칙이 이 모든 문제를 구조적으로 해결한다.

### Constraints

- `PLAYER_ARRIVED` 처리는 폭발 판정보다 먼저 수행 (GDD EC-RM-2 — Goal Cell 도달 우선)
- `ROUND_CLEAR_DISPLAY` 타이머는 `FrameClock.schedule(fn, ROUND_CLEAR_DISPLAY_DURATION)` 기반 — simulatedTime 결정론적
- `GAME_OVER` 이벤트는 라운드당 단 1회만 발행 — state guard로 중복 방지
- 서버(ADR-0010) 권위 이벤트 `ROUND_START`, `ROUND_CLEAR`, `GAME_OVER`가 도달 시 클라이언트 상태 머신을 동기화

### Requirements

- 4개 상태와 모든 전환 경로를 이 ADR로 canonical 확정
- 각 상태에서 수락/거부하는 이벤트 명시 ("이 상태에서는 이 이벤트를 무시한다")
- Goal Cell 배치 로직(F-RM-1) 및 폴백 조건을 이 ADR로 구현 계약 확정
- 타이머 취소 책임(state 전환 시 반드시 cancelSchedule)을 명시

## Decision

**4상태 유한 상태 머신(FSM)** 을 TypeScript 열거형과 guard 조건으로 구현한다.
각 상태는 "허용 이벤트 화이트리스트" 방식으로 동작한다 — 나열되지 않은 이벤트는 해당 상태에서 무시.

### 상태 정의

| 상태 | 설명 |
|------|------|
| `IDLE` | 활성 라운드 없음 (첫 라운드 전, 또는 GAME_OVER 후 리셋) |
| `ROUND_ACTIVE` | 라운드 진행 중 — 플레이어 이동, 폭발, 사망 처리 모두 활성 |
| `ROUND_CLEAR_DISPLAY` | 생존자가 Goal Cell 도달 — 1500ms 클리어 화면 표시 중 |
| `GAME_OVER` | 세션 종료 — 더 이상 라운드 이벤트 없음 |

### 전환 테이블

| 전환 | 트리거 | 발행 이벤트 | 취소할 타이머 |
|------|--------|------------|------------|
| `IDLE → ROUND_ACTIVE` | `startRound(roundNumber)` 호출 | `ROUND_STARTED`, `GOAL_PLACED` | — |
| `ROUND_ACTIVE → ROUND_CLEAR_DISPLAY` | `PLAYER_ARRIVED` 수신 + playerId의 cell == goalCell | `ROUND_CLEAR` | roundTimer |
| `ROUND_ACTIVE → GAME_OVER` | `ALIVE_COUNT = 0` 또는 roundTimer 만료 | `GAME_OVER` | roundTimer |
| `ROUND_CLEAR_DISPLAY → ROUND_ACTIVE` | clearDisplayTimer 만료 (1500ms) | `ROUND_END`, `ROUND_STARTED`, `GOAL_PLACED` | — |
| `GAME_OVER → IDLE` | 새 세션 시작 (외부 호출) | — | — |

### 각 상태의 이벤트 처리 규칙

```
IDLE:
  - startRound() 호출 허용 → ROUND_ACTIVE 전환
  - PLAYER_KILLED / PLAYER_ARRIVED / ROUND_CLEAR → 무시

ROUND_ACTIVE:
  - PLAYER_ARRIVED { playerId, cell } → Goal Cell 판정 수행
      → cell == goalCell → ROUND_CLEAR 발행, ROUND_CLEAR_DISPLAY 전환
      → cell != goalCell → 무시
  - PLAYER_KILLED → spectator 전환, ALIVE_COUNT 갱신, ALIVE_COUNT_CHANGED 발행
      → ALIVE_COUNT == 0 → GAME_OVER 발행
  - roundTimer 만료 → GAME_OVER 발행
  - 중복 GAME_OVER guard: state가 ROUND_ACTIVE인 경우에만 발행 (EC-RM-6)

ROUND_CLEAR_DISPLAY:
  - clearDisplayTimer 만료 → 모든 플레이어 ALIVE 마킹 후 ROUND_ACTIVE 전환
  - PLAYER_KILLED → 무시 (EC-RM-4: 이미 클리어된 라운드의 지연 사망 판정)
  - PLAYER_ARRIVED → 무시 (Goal Cell 이미 클리어됨)

GAME_OVER:
  - 모든 이벤트 무시 (세션 리셋 호출 전까지)
```

### Goal Cell 배치 로직 (F-RM-1)

```typescript
// src/features/round/RoundManager.ts

function placeGoalCell(pathCells: CellCoord[], gridSim: IGridSimulation): CellCoord {
  const lastCell = pathCells[pathCells.length - 1];           // N-1
  const fallbackCell = pathCells[pathCells.length - 2];       // N-2

  // F-RM-1: N-1이 첫 GATE_PERIOD(2.0s) 내 폭발 예정이면 N-2에 배치
  if (gridSim.nextExplosionTime(lastCell) < GATE_PERIOD_BASE) {
    return fallbackCell;   // N-2 배치 (추가 폴백 없음 — EC-RM-1)
  }
  return lastCell;         // N-1 배치 (정상)
}
```

**EC-RM-1 처리**: N-2도 첫 사이클 내 폭발 예정이더라도 N-2에 배치한다. 폴백은 1단계만. "공정한 죽음" 원칙 유지.

### 핵심 구현 골격

```typescript
// src/features/round/RoundManager.ts

export const ROUND_CLEAR_DISPLAY_DURATION = 1.5;  // seconds (1500ms)
export const ROUND_TIME_LIMIT = 60;               // seconds (Tuning Knob)

export type RoundPhase = 'IDLE' | 'ROUND_ACTIVE' | 'ROUND_CLEAR_DISPLAY' | 'GAME_OVER';

export class RoundManager {
  private phase: RoundPhase = 'IDLE';
  private roundNumber = 0;
  private goalCell: CellCoord | null = null;
  private aliveCount = 0;
  private roundTimerFn: (() => void) | null = null;
  private clearDisplayTimerFn: (() => void) | null = null;

  constructor(
    private clock: IFrameClock,
    private eventBus: IEventBus,
    private escalation: IRoundEscalation,
    private gridSim: IGridSimulation,
    private pathCells: CellCoord[],
    private totalPlayers: number,
  ) {}

  // ADR-0006: setGatePeriod BEFORE emit(ROUND_STARTED)
  startRound(roundNumber: number): void {
    if (this.phase !== 'IDLE' && this.phase !== 'ROUND_CLEAR_DISPLAY') return;

    this.roundNumber = roundNumber;
    this.aliveCount = this.totalPlayers;

    // 1. EscalationContext 계산 + setGatePeriod (ADR-0006 Exception 1)
    const ctx = this.escalation.compute(roundNumber);
    this.gridSim.setGatePeriod(ctx.gatePeriod);

    // 2. Goal Cell 배치 (F-RM-1)
    this.goalCell = placeGoalCell(this.pathCells, this.gridSim);

    // 3. 라운드 타이머 등록
    this.roundTimerFn = () => this.onRoundTimerExpired();
    this.clock.schedule(this.roundTimerFn, ROUND_TIME_LIMIT);

    // 4. 상태 전환
    this.phase = 'ROUND_ACTIVE';

    // 5. 이벤트 발행 (ADR-0001 flush 큐)
    this.eventBus.emit('ROUND_STARTED', { roundNumber, ctx, timestamp: this.clock.now() });
    this.eventBus.emit('GOAL_PLACED', { cell: this.goalCell, timestamp: this.clock.now() });
  }

  onPlayerArrived({ playerId, cell }: GameEvents['PLAYER_ARRIVED']): void {
    if (this.phase !== 'ROUND_ACTIVE') return;  // EC-RM-4: ROUND_CLEAR_DISPLAY 무시
    if (!this.goalCell || !cellEquals(cell, this.goalCell)) return;

    // Goal Cell 도달 → ROUND_CLEAR (EC-RM-2: 폭발 판정보다 우선)
    this.clock.cancelSchedule(this.roundTimerFn!);
    this.roundTimerFn = null;

    this.phase = 'ROUND_CLEAR_DISPLAY';
    this.eventBus.emit('ROUND_CLEAR', {
      roundNumber: this.roundNumber,
      survivors: this.getAlivePlayerIds(),
      timestamp: this.clock.now(),
    });

    // 1500ms 후 다음 라운드
    this.clearDisplayTimerFn = () => this.onClearDisplayExpired();
    this.clock.schedule(this.clearDisplayTimerFn, ROUND_CLEAR_DISPLAY_DURATION);
  }

  onPlayerKilled({ playerIds }: GameEvents['PLAYER_KILLED']): void {
    if (this.phase !== 'ROUND_ACTIVE') return;  // EC-RM-4: ROUND_CLEAR_DISPLAY 무시

    this.aliveCount = Math.max(0, this.aliveCount - playerIds.length);
    this.eventBus.emit('ALIVE_COUNT_CHANGED', {
      aliveCount: this.aliveCount,
      timestamp: this.clock.now(),
    });

    if (this.aliveCount === 0) {
      this.triggerGameOver();
    }
  }

  private onRoundTimerExpired(): void {
    if (this.phase !== 'ROUND_ACTIVE') return;  // EC-RM-6: 중복 GAME_OVER 방지
    this.triggerGameOver();
  }

  private triggerGameOver(): void {
    if (this.phase !== 'ROUND_ACTIVE') return;  // guard: state 전환 중 재진입 방지
    if (this.roundTimerFn) {
      this.clock.cancelSchedule(this.roundTimerFn);
      this.roundTimerFn = null;
    }
    this.phase = 'GAME_OVER';
    this.eventBus.emit('GAME_OVER', {
      finalRound: this.roundNumber,
      rankings: [],  // ADR-0012 Tie-Break에서 결정
      timestamp: this.clock.now(),
    });
  }

  private onClearDisplayExpired(): void {
    // 모든 플레이어 ALIVE 마킹 후 다음 라운드
    this.clearDisplayTimerFn = null;
    this.eventBus.emit('ROUND_END', { roundNumber: this.roundNumber, timestamp: this.clock.now() });
    this.startRound(this.roundNumber + 1);
  }
}

// Invariants:
// 1. ROUND_ACTIVE에서만 PLAYER_KILLED / PLAYER_ARRIVED 처리. 다른 상태에서는 무시.
// 2. GAME_OVER 이벤트는 state guard로 단 1회만 발행 (EC-RM-6).
// 3. startRound() 호출 시 setGatePeriod()가 ROUND_STARTED emit 이전에 완료 (ADR-0006).
// 4. roundTimer는 상태 전환 시 반드시 cancelSchedule (ROUND_CLEAR 또는 GAME_OVER).
// 5. clearDisplayTimer는 ROUND_CLEAR_DISPLAY → ROUND_ACTIVE 전환 시 자동 만료.
```

### Architecture Diagram

```
startRound(R)
    │
    ├── escalation.compute(R)
    ├── gridSim.setGatePeriod(ctx.gatePeriod)    ← ADR-0006 Exception 1
    ├── goalCell = placeGoalCell(pathCells)       ← F-RM-1
    ├── schedule(roundTimer, 60s)
    ├── phase = ROUND_ACTIVE
    ├── emit(ROUND_STARTED)
    └── emit(GOAL_PLACED)

         [ROUND_ACTIVE]
              │
    ┌─────────┼──────────────────────────┐
    │         │                          │
    ▼         ▼                          ▼
PLAYER_ARRIVED    PLAYER_KILLED     roundTimer 만료
cell==goalCell    aliveCount 갱신        │
    │               │                   │
    │           aliveCount==0            │
    │               │                   │
    ▼               ▼                   ▼
cancelSchedule  triggerGameOver()  triggerGameOver()
emit ROUND_CLEAR    │                   │
phase=ROUND_CLEAR_DISPLAY emit GAME_OVER│
schedule(1500ms)    phase=GAME_OVER ────┘
    │
    ▼
[ROUND_CLEAR_DISPLAY]
1500ms 만료
    │
    ├── emit ROUND_END
    └── startRound(R+1) → [ROUND_ACTIVE]
```

## Alternatives Considered

### Alternative A: 이벤트 핸들러에 직접 guard 조건만 (상태 머신 없음)
- **Description**: 각 핸들러 내부에서 `isRoundActive`, `isGameOver` 불리언 플래그로 guard
- **Pros**: 구현 단순
- **Cons**: 플래그 조합이 늘어날수록 비결정론적 케이스 발생. EC-RM-4(지연 PLAYER_KILLED)와 EC-RM-6(중복 GAME_OVER) 처리가 각 핸들러에 분산 → 누락 위험. 상태 문서화 불가.
- **Rejection Reason**: 상태 머신이 명시적 "이 상태에서 이 이벤트는 무시" 계약을 제공함. 불리언 플래그로는 복합 상태(ROUND_CLEAR_DISPLAY)를 표현 불가.

### Alternative B: 서버 상태 머신 권위 (클라이언트 미러만)
- **Description**: 서버(ADR-0010 Node.js)가 상태 머신을 소유하고 클라이언트는 서버 메시지를 미러링
- **Pros**: 서버 권위 원칙과 일치. 클라이언트 상태 분기 없음.
- **Cons**: WebSocket 레이턴시(OQ-7)로 인해 클라이언트 응답성 저하. PLAYER_ARRIVED Goal Cell 판정을 서버에서 하려면 매 이동마다 서버 왕복 필요 → 60fps 입력 불가. 로컬 시뮬레이션(결정론, ADR-0002) 원칙 위반.
- **Rejection Reason**: ADR-0010 서버 권위 범위 = seed + PLAYER_KILLED + 라운드 전환. Goal Cell 판정과 상태 관리는 클라이언트 결정론 범위. 서버는 ROUND_CLEAR를 확정/브로드캐스트하는 역할만.

## Consequences

### Positive
- EC-RM-2, EC-RM-4, EC-RM-6 모두 상태 머신의 phase guard로 구조적 처리 — 별도 방어 코드 불필요
- 단위 테스트에서 `clock.tick()` + `eventBus.flush()` 조합으로 전체 상태 머신 결정론적 검증 가능
- ADR-0006 `setGatePeriod` 순서 규칙이 `startRound()` 내 단일 경로에서 항상 보장

### Negative
- `ROUND_CLEAR` / `GAME_OVER` 발행 후 동일 라운드의 이벤트가 EventBus 큐에 남아있을 수 있음 — phase guard로 처리되지만 큐에 누적 (무해)
- ADR-0012 (Tie-Break) 전까지 `GAME_OVER.rankings` 배열이 빈 상태

### Risks
- **clearDisplayTimer 누락**: ROUND_CLEAR_DISPLAY 진입 후 cancelSchedule 없이 다른 경로로 이탈할 경우 잔여 타이머가 이후 라운드에서 만료. **Mitigation**: 모든 상태 전환 시 `clearDisplayTimerFn != null` 체크 후 cancelSchedule.
- **서버 ROUND_CLEAR와 클라이언트 판정 불일치**: 클라이언트가 먼저 ROUND_CLEAR 판정 후 서버 확정 메시지 도달. **Mitigation**: 서버 ROUND_CLEAR 수신 시 이미 ROUND_CLEAR_DISPLAY 상태이면 무시 (phase guard 자동 처리).

## GDD Requirements Addressed

| GDD System | Requirement | TR-ID | How This ADR Addresses It |
|------------|-------------|-------|--------------------------|
| round-manager.md | RM-1 라운드 라이프사이클 (3가지 종료 조건) | TR-roundmanager-001 | 4상태 FSM + ROUND_ACTIVE 이벤트 처리 규칙 |
| round-manager.md | RM-2 Goal Cell 배치 (F-RM-1 폴백) | TR-roundmanager-002 | placeGoalCell() + GOAL_PLACED emit |
| round-manager.md | RM-3 PLAYER_KILLED → SPECTATOR 전환 | TR-roundmanager-003 | onPlayerKilled() ALIVE_COUNT 갱신 |
| round-manager.md | RM-4 ROUND_CLEAR 조건 + ALIVE 복귀 | TR-roundmanager-004 | onPlayerArrived() + onClearDisplayExpired() |
| round-manager.md | RM-5 라운드 타이머 + GAME_OVER(timeout) | TR-roundmanager-005 | FrameClock.schedule(60s) + onRoundTimerExpired() |
| round-manager.md | RM-7 GAME_OVER 트리거 조건 2가지 | TR-roundmanager-006 | triggerGameOver() + state guard |
| round-manager.md | EC-RM-2 Goal Cell 도달 → 폭발 우선 | TR-roundmanager-009 | PLAYER_ARRIVED 핸들러가 폭발 판정보다 먼저 처리 |
| round-manager.md | EC-RM-4 ROUND_CLEAR_DISPLAY 중 PLAYER_KILLED 무시 | TR-roundmanager-010 | phase guard `if (phase !== 'ROUND_ACTIVE') return` |
| round-manager.md | EC-RM-6 GAME_OVER 중복 방지 | TR-roundmanager-011 | triggerGameOver() state guard |
| round-manager.md | AC-RM-06 ROUND_END 1500ms ±50ms | TR-roundmanager-007 | FrameClock.schedule(ROUND_CLEAR_DISPLAY_DURATION) |
| round-manager.md | AC-RM-09 GAME_OVER 단 1회 발행 | TR-roundmanager-012 | state guard `if (phase !== 'ROUND_ACTIVE') return` |

## Performance Implications

- **CPU**: 상태 전환 오버헤드 없음 (문자열 비교 × N). `placeGoalCell()` = `nextExplosionTime()` 1회 호출 + CellCoord 비교 — <0.01ms
- **Memory**: 타이머 함수 참조 2개 (`roundTimerFn`, `clearDisplayTimerFn`) — 무시 가능
- **Load Time**: 없음
- **Network**: `ROUND_CLEAR`, `GAME_OVER` → 서버 브로드캐스트 (ADR-0010). 메시지 수 최소

## Migration Plan

신규 시스템 — 기존 코드 없음. 구현 순서:
1. `src/features/round/RoundManager.ts` — FSM 골격 + 상태 상수
2. `ROUND_ACTIVE` 이벤트 핸들러 구현 (onPlayerArrived, onPlayerKilled)
3. 타이머 등록/취소 (startRound, triggerGameOver, onClearDisplayExpired)
4. `placeGoalCell()` 구현 (F-RM-1 — gridSim.nextExplosionTime() API 의존)
5. 단위 테스트: AC-RM-01~15 전체 케이스 + EC-RM-2/4/6 시나리오

## Validation Criteria

- [ ] AC-RM-01: `startRound()` 호출 시 `ROUND_STARTED` 1회, `GOAL_PLACED` 동일 프레임 발행
- [ ] AC-RM-02: `nextExplosionTime(N-1) >= GATE_PERIOD_BASE` → goalCell = pathCells[N-1]
- [ ] AC-RM-03: `nextExplosionTime(N-1) < GATE_PERIOD_BASE` → goalCell = pathCells[N-2]
- [ ] AC-RM-04: `PLAYER_ARRIVED(goalCell)` 수신 시 `ROUND_CLEAR` 1회 발행
- [ ] AC-RM-05: `ROUND_CLEAR` 후 `onClearDisplayExpired()` 호출 시 전체 플레이어 ALIVE 상태
- [ ] AC-RM-06: `ROUND_CLEAR` 발행 후 정확히 `tick(1.5)` 시 `ROUND_END` 발행 (±1 tick 허용)
- [ ] AC-RM-07: `aliveCount = 0` 시 `GAME_OVER` 발행
- [ ] AC-RM-08: `tick(60)` 경과 시 `GAME_OVER` 발행
- [ ] AC-RM-09: 전원 사망 + 타이머 만료 동시 → `GAME_OVER` 1회만 발행
- [ ] AC-RM-10: `PLAYER_KILLED` 수신 후 1 flush 내 `ALIVE_COUNT_CHANGED` 발행
- [ ] AC-RM-14: `ROUND_CLEAR_DISPLAY` 상태에서 `PLAYER_KILLED` 수신 → `ALIVE_COUNT` 변경 없음
- [ ] EC-RM-2 검증: 동일 프레임에서 `PLAYER_ARRIVED(goalCell)` flush 이후 폭발 판정 → `ROUND_CLEAR` 발행 후 해당 플레이어 `PLAYER_KILLED` 미발행
- [ ] EC-RM-6 검증: `triggerGameOver()` 2회 연속 호출 시 `GAME_OVER` 이벤트 1회만 발행
- [ ] `startRound()` 내 `setGatePeriod()` 호출이 `emit(ROUND_STARTED)` 이전임을 spy로 확인

## Related Decisions

- ADR-0001: EventBus — 모든 라운드 이벤트 발행/구독 경로
- ADR-0002: FrameClock — 라운드 타이머 + clearDisplay 타이머 (simulatedTime 기준)
- ADR-0003: Layer Boundaries — RoundManager는 Feature 레이어 (`src/features/round/`)
- ADR-0006: Gate Period — setGatePeriod() 순서 규칙 (startRound 내 ROUND_STARTED 이전)
- ADR-0008: Player Movement — PLAYER_ARRIVED(t=0.1s)가 Goal Cell 판정 트리거
- ADR-0009: GRID_STALLED — 라운드 매니저는 GRID_STALLED 체인을 시작(ROUND_STARTED)하고 결과를 대기
- ADR-0012: Goal Cell Tie-Break — EC-RM-3 동시 도달 처리 (후속 ADR)
- `docs/architecture/architecture.md` § Feature Layer, § Module Ownership
