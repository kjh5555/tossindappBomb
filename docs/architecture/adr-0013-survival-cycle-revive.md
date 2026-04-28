# ADR-0013: Survival Cycle-Revive 규칙 — 스펙테이터 전환 · 응원 rate-limit · 라운드 클리어 부활

## Status
Accepted

## Date
2026-04-22

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | Cocos Creator 3.8.6 (TypeScript) |
| **Domain** | Feature / Scripting |
| **Knowledge Risk** | LOW — 순수 TypeScript 상태 관리 + FrameClock 타임스탬프 비교. 엔진 API 비의존 |
| **References Consulted** | `docs/engine-reference/cocos/VERSION.md` |
| **Post-Cutoff APIs Used** | None |
| **Verification Required** | AC-SUR-01~08 단위/통합 테스트 통과 |

## ADR Dependencies

| Field | Value |
|-------|-------|
| **Depends On** | ADR-0001 (EventBus — PLAYER_KILLED, ALIVE_COUNT_CHANGED, ROUND_CLEAR 이벤트), ADR-0002 (FrameClock — 응원 rate-limit 타임스탬프 비교), ADR-0006 (Gate Period — 응원 rate-limit cooldown = GATE_PERIOD), ADR-0011 (RoundManager FSM — ROUND_ACTIVE에서만 사망 처리, ROUND_CLEAR_DISPLAY에서 부활 마킹) |
| **Enables** | ADR-0016 (HUD — 스펙테이터 어노테이션 표시, 응원 버튼 UI) |
| **Blocks** | RoundManager 스펙테이터 / 부활 구현, fair-feedback 시스템 스펙테이터 입력 처리 |
| **Ordering Note** | ADR-0011 FSM 확정 후 작성. 스펙테이터 상태는 ROUND_ACTIVE 내 sub-state이며 FSM에 추가하지 않음 |

## Context

GRID REAPER의 Pillar 3 "함께 겨루는 생존"은 죽은 플레이어가 관전자로 전환되어 생존자를 응원하는 구조를 요구한다. 라운드 클리어 시 죽은 플레이어 전원이 다음 라운드에 복귀한다. 이 "Cycle-Revive" 메커니즘은 세 규칙으로 구성된다:

1. **RM-3 — 사망 → 스펙테이터**: `PLAYER_KILLED` 수신 즉시 해당 플레이어를 SPECTATOR 상태로 전환
2. **RM-6 — 스펙테이터 응원 + 재진입**: 응원 rate-limit = GATE_PERIOD(2.0s); 라운드 클리어 시 인덱스 0에서 ALIVE로 복귀
3. **EC-RM-7 — 재진입 위치 폴백 없음**: 인덱스 0이 폭발 예정이어도 고정. 이동으로 탈출이 플레이어 책임

**핵심 설계 질문**: 스펙테이터 상태를 RoundManager FSM에 추가할 것인가, 별도 플레이어 상태로 관리할 것인가?

## Decision

**스펙테이터는 RoundManager FSM에 추가하지 않는다. 플레이어별 PlayerStatus enum으로 관리한다.**

RoundManager의 4-state FSM(`IDLE / ROUND_ACTIVE / ROUND_CLEAR_DISPLAY / GAME_OVER`)은 *라운드 단위* 상태를 나타낸다. 스펙테이터는 *플레이어 단위* 상태이다. 두 개념을 같은 FSM에 혼합하면 전환 폭발이 발생한다.

```typescript
// src/features/round/PlayerStatus.ts
export type PlayerStatus = 'ALIVE' | 'SPECTATOR';

export interface PlayerState {
  playerId: PlayerId;
  status: PlayerStatus;
  lastCheerTime: number;   // FrameClock.simulatedTime — 응원 rate-limit 추적
  pathIndex: number;       // 현재 경로 인덱스 (SPECTATOR이면 사망 시점 인덱스 유지)
}
```

**부활 결정 시점**: `ROUND_CLEAR_DISPLAY` 진입 즉시 (`triggerRoundClear()` 내부에서) 모든 플레이어를 ALIVE로 마킹한다. ROUND_END / ROUND_STARTED 시점이 아님. 이렇게 하면 클리어 화면 표시 1500ms 동안 UI가 부활 예정 상태를 바로 반영할 수 있다.

**재진입 위치**: 항상 `pathIndex = 0`. 예외 없음. EC-RM-7 명시: "폭발 예정이어도 이동으로 탈출 가능하다 — '공정한 죽음' 원칙 유지."

## Consequences

### 긍정적 결과
- **FSM 단순성 유지**: 4-state FSM(ADR-0011)이 확장되지 않는다. 스펙테이터 로직은 PlayerState에 격리.
- **스펙테이터 수 무관한 확장**: PlayerState 배열로 관리하므로 1~6인 모두 동일 코드 경로.
- **부활 타이밍 명확**: `triggerRoundClear()` 한 곳에서 처리 — 분산 없음.

### 부정적 결과
- **pathIndex 추적 책임**: 사망 시 pathIndex를 저장해야 한다. player-movement 시스템이 이를 RoundManager에 제공하는 계약 필요 (PLAYER_ARRIVED 이벤트의 cell로 역계산하거나 별도 전달).
- **EC-RM-5b(솔로) 처리**: `totalPlayers = 1` 시 스펙테이터 응원 UI가 표시되지 않아야 한다 — UI 조건 분기는 Presentation layer 책임(ADR-0016 범위).

## Alternatives Considered

### A. 스펙테이터를 FSM 상태로 추가 (`ROUND_SPECTATING`)

4-state FSM을 5-state로 확장하는 방안.

**기각 이유**: 스펙테이터는 여러 플레이어가 동시에 존재할 수 있는 per-player 상태다. FSM 상태는 라운드 단위 단일 값이다. "두 명이 ROUND_SPECTATING 상태"는 FSM으로 표현 불가능하다.

### B. 부활 마킹을 ROUND_STARTED 직전으로 지연

ROUND_END 수신 시 또는 다음 `startRound()` 호출 직전에 부활 처리.

**기각 이유**: 클리어 화면 표시 1500ms 동안 UI가 스펙테이터를 여전히 죽은 상태로 표시하게 된다. GDD RM-4가 명시한 "앵커 모먼트" — 스펙테이터가 클리어 화면에서 자신의 캐릭터가 살아나는 것을 보는 순간 — 가 사라진다. Pillar 3 핵심 경험 훼손.

### C. 응원 rate-limit을 별도 타이머로 관리

FrameClock.schedule()로 cooldown 타이머를 설정하는 방안.

**기각 이유**: 불필요한 복잡도. `lastCheerTime` 타임스탬프 비교(`simulatedTime - lastCheerTime >= GATE_PERIOD`)가 더 단순하고 결정론적이다(ADR-0002).

## Implementation Guidelines

### PlayerState 관리

```typescript
// src/features/round/RoundManager.ts

private playerStates: Map<PlayerId, PlayerState> = new Map();

// ROUND_ACTIVE: PLAYER_KILLED 수신
onPlayerKilled(event: PlayerKilledEvent): void {
  if (this.phase !== 'ROUND_ACTIVE') return;  // EC-RM-4 (ADR-0011)

  for (const playerId of event.playerIds) {
    const ps = this.playerStates.get(playerId);
    if (!ps || ps.status === 'SPECTATOR') continue;  // 중복 방지

    ps.status = 'SPECTATOR';
    // pathIndex는 사망 시점 그대로 유지
  }

  const aliveCount = this.countAlive();
  this.eventBus.emit('ALIVE_COUNT_CHANGED', { aliveCount });

  if (aliveCount === 0) {
    this.triggerGameOver('all_dead');
  }
}

// ROUND_CLEAR_DISPLAY 진입 시 즉시 부활 마킹
private markAllAliveForNextRound(): void {
  for (const ps of this.playerStates.values()) {
    ps.status = 'ALIVE';
    ps.pathIndex = 0;     // EC-RM-7: 재진입 위치 고정 인덱스 0, 폴백 없음
    ps.lastCheerTime = -Infinity;
  }
}

private countAlive(): number {
  let count = 0;
  for (const ps of this.playerStates.values()) {
    if (ps.status === 'ALIVE') count++;
  }
  return count;
}
```

### 스펙테이터 응원 rate-limit

```typescript
// src/features/round/RoundManager.ts

onSpectatorCheer(event: SpectatorCheerEvent): void {
  if (this.phase !== 'ROUND_ACTIVE') return;

  const ps = this.playerStates.get(event.playerId);
  if (!ps || ps.status !== 'SPECTATOR') return;

  const now = this.frameClock.simulatedTime;
  // F-RM-3: canCheer = (currentTime - lastCheerTime) >= cheerCooldown
  if (now - ps.lastCheerTime < this.gatePeriod) return;  // rate-limit (ADR-0006)

  ps.lastCheerTime = now;
  this.eventBus.emit('SPECTATOR_CHEERED', {
    playerId: event.playerId,
    cellCoord: ps.lastCellCoord,   // 사망 시점 셀 좌표
  });
}
```

**규칙**:
- `markAllAliveForNextRound()`는 `triggerRoundClear()` 내부, `ROUND_CLEAR` 이벤트 발행 직후 호출
- 재진입 위치는 항상 `pathIndex = 0` — EC-RM-7, 폴백 코드 추가 금지
- `totalPlayers = 1` (솔로) 시 응원 rate-limit 로직은 동일하게 유지 — UI 억제는 Presentation layer
- `ROUND_CLEAR_DISPLAY` 상태에서 `onSpectatorCheer()` phase guard로 자동 차단

## GDD Requirements Addressed

| TR-ID | GDD | 요구사항 | 처리 방식 |
|-------|-----|---------|---------|
| TR-roundmanager-004 | round-manager.md | RM-3: 사망 → 스펙테이터 전환 | PlayerStatus SPECTATOR 마킹 |
| TR-roundmanager-005 | round-manager.md | RM-6: 스펙테이터 응원 rate-limit | lastCheerTime 타임스탬프 비교 |
| TR-roundmanager-006 | round-manager.md | RM-6: 라운드 클리어 후 재진입 | markAllAliveForNextRound, pathIndex=0 |
| TR-roundmanager-007 | round-manager.md | EC-RM-7: 재진입 위치 폴백 없음 | pathIndex 고정 0, 분기 없음 |

## Validation Criteria

- **AC-SUR-01**: `PLAYER_KILLED` 수신 시 해당 플레이어 status가 `SPECTATOR`로 변경된다
- **AC-SUR-02**: SPECTATOR 플레이어는 `ALIVE_COUNT` 카운트에 포함되지 않는다
- **AC-SUR-03**: 응원 요청이 `GATE_PERIOD`(2.0s) 이내 연속 도착 시 두 번째부터 무시된다
- **AC-SUR-04**: 응원 요청이 `GATE_PERIOD` 경과 후 도착 시 `SPECTATOR_CHEERED`가 발행된다
- **AC-SUR-05**: `ROUND_CLEAR` 발행 직후 모든 플레이어 status가 `ALIVE`로 변경된다
- **AC-SUR-06**: 부활 후 모든 플레이어 pathIndex가 0으로 설정된다
- **AC-SUR-07**: `ROUND_CLEAR_DISPLAY` 상태에서 응원 요청이 도착해도 `SPECTATOR_CHEERED`가 발행되지 않는다
- **AC-SUR-08**: `totalPlayers = 1` 시 사망 즉시 `ALIVE_COUNT = 0` → `GAME_OVER` 트리거된다
