# ADR-0006: Gate Period 튜닝 경로 — F-RE-1 공식 + 동일 프레임 원자 적용

## Status
Accepted

## Date
2026-04-21

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | Cocos Creator 3.8.6 (TypeScript) |
| **Domain** | Core / Scripting |
| **Knowledge Risk** | LOW — 순수 TypeScript 로직. 엔진 API 비의존 |
| **References Consulted** | `docs/engine-reference/cocos/VERSION.md` |
| **Post-Cutoff APIs Used** | None |
| **Verification Required** | AC-RE-01/02/03 단위 테스트 통과. SAFE_WIN ≥ 0.45s 모든 R에서 성립 확인 |

## ADR Dependencies

| Field | Value |
|-------|-------|
| **Depends On** | ADR-0002 (FrameClock — simulatedTime 기준 타이머), ADR-0003 (Exception 1 — RoundEscalation→GridSimulation.setGatePeriod 직접 호출 허용), ADR-0005 (CellCoord — 셀별 타이머 관리) |
| **Enables** | ADR-0009 (GRID_STALLED 흐름 — gatePeriod 재계산 포함), ADR-0011 (Round Phase 상태 머신 — ROUND_STARTED → setGatePeriod 순서) |
| **Blocks** | GridSimulation 구현, RoundEscalation 구현 |
| **Ordering Note** | GridSimulation gate 타이머 구현 전 반드시 확정. ADR-0003 Exception 1 계약을 구체화한다 |

## Context

### Problem Statement

`GATE_PERIOD`(게이트 폭발 주기)가 매 라운드 변경된다. 이 값을 `GridSimulation`에 전달하는 경로가 확정되지 않으면:

1. **경로 분산**: `ESCALATION_COMPUTED` 이벤트 구독으로 `GridSimulation`이 스스로 적용하거나, `RoundEscalation`이 직접 호출하거나 — 두 경로가 혼용되면 타이밍 불일치 발생
2. **1프레임 지연 버그**: `ESCALATION_COMPUTED`를 `flush()` 후 다음 프레임에서 수신하면, `ROUND_STARTED` 발행 시점(동일 프레임)에 이미 폭발 타임스탬프를 계산한 일부 게이트가 이전 `GATE_PERIOD`로 첫 폭발을 예약 → AC-RE-09 위반
3. **범위 위반**: 외부 코드가 `setGatePeriod(0.5)` 같은 잘못된 값을 호출하면 `SAFE_WIN < 0`이 되어 즉시 폭발 가능성 — 플레이어 피드백 불가

### Constraints

- AC-RE-09: "`ROUND_STARTED`와 동일 프레임에 `gatePeriod` 적용" — EventBus flush 이후 적용은 구조적으로 불가
- ADR-0001: EventBus의 `flush()` 재진입 금지 → 이미 flush 중인 이벤트 핸들러에서 `setGatePeriod`를 emit하면 다음 프레임 처리
- ADR-0003 Exception 1: `RoundEscalation → GridSimulation.setGatePeriod(seconds)` 직접 호출은 `RoundManager.startRound()` 내부에서만 허용
- `SAFE_WIN_MIN = 0.45s` 불변: `GATE_PERIOD_FLOOR ≥ 1.2s` 이상이어야 성립 (`1.2 - 0.35 = 0.85 > 0.45` ✓, `1.2 - 0.35 = 0.85s` but min is `FLOOR - T_EX = 1.4 - 0.35 = 1.05s` with default floor)

### Requirements

- `GATE_PERIOD` 계산 공식을 단일 위치에 정의
- `GridSimulation.setGatePeriod()` 호출이 `ROUND_STARTED`와 동일 프레임에 완료
- `setGatePeriod()` 범위 위반 시 명확한 거부 + 경고 로그
- `T_EX = 0.35s`는 `GATE_PERIOD` 변경과 독립적으로 고정

## Decision

**F-RE-1 공식을 `RoundEscalation`이 단독 계산**하고, `RoundManager.startRound()` 호출 체인 내에서 `GridSimulation.setGatePeriod()` 직접 호출로 동일 프레임 원자 적용한다.

### 공식 (F-RE-1)

```
GATE_PERIOD(R) = max(GATE_PERIOD_FLOOR, GATE_PERIOD_BASE - (R - 1) × GATE_PERIOD_STEP)
```

| 상수/변수 | 기본값 | 허용 범위 | 설명 |
|-----------|--------|----------|------|
| `GATE_PERIOD_BASE` | 2.0s | 고정 | 라운드 1 기준 주기 |
| `GATE_PERIOD_STEP` | 0.05s | 0.03–0.08s | 라운드당 감소량 (튜닝 노브) |
| `GATE_PERIOD_FLOOR` | 1.4s | **≥ 1.2s 필수** | 최소 주기. 1.2s 미만 설정 금지 (SAFE_WIN_MIN 위반) |
| `T_EX` | 0.35s | 고정 | 폭발 지속 시간. GATE_PERIOD 변경과 독립 |

**SAFE_WIN(R) = GATE_PERIOD(R) − T_EX ≥ 0.45s** — 모든 R에서 불변 보장.

예시 (기본값):
```
R1:  GATE_PERIOD = max(1.4, 2.0 - 0×0.05) = 2.0s  → SAFE_WIN = 1.65s
R5:  GATE_PERIOD = max(1.4, 2.0 - 4×0.05) = 1.8s  → SAFE_WIN = 1.45s
R13: GATE_PERIOD = max(1.4, 2.0 - 12×0.05) = 1.4s → SAFE_WIN = 1.05s
R20: GATE_PERIOD = max(1.4, 2.0 - 19×0.05) = 1.4s → SAFE_WIN = 1.05s (하한 고정)
```

### 원자 적용 시퀀스

```
RoundManager.startRound(roundNumber)
    │
    ├── 1. EscalationContext 계산 (F-RE-1 포함)
    │       gatePeriod = max(GATE_PERIOD_FLOOR, GATE_PERIOD_BASE - (R-1) × GATE_PERIOD_STEP)
    │
    ├── 2. GridSimulation.setGatePeriod(gatePeriod)   ← ADR-0003 Exception 1
    │       [동일 프레임, flush() 이전, 즉시 적용]
    │       [invariant: gatePeriod ∈ [GATE_PERIOD_FLOOR, GATE_PERIOD_BASE]]
    │
    ├── 3. EventBus.emit(ROUND_STARTED, { roundNumber, ctx })
    ├── 4. EventBus.emit(ESCALATION_COMPUTED, { ctx })
    │
    └── (이후 FrameClock.tick → EventBus.flush() 처리)
```

**핵심**: step 2의 `setGatePeriod()`는 step 3의 `ROUND_STARTED` emit **이전**에 호출된다. 따라서 `ROUND_STARTED` flush 처리 시점에 모든 게이트 셀은 이미 새 주기로 동작한다.

### Architecture Diagram

```
RoundManager.startRound()
    │
    ├─── RoundEscalation.compute(R) → EscalationContext
    │         │
    │         └─── GridSimulation.setGatePeriod(ctx.gatePeriod)
    │                   [ADR-0003 Exception 1 — 직접 호출]
    │                   [범위 검증: gatePeriod ∈ [FLOOR, BASE]]
    │                   [모든 게이트 타이머 주기 즉시 갱신, offset 유지]
    │
    ├─── EventBus.emit(ROUND_STARTED, { roundNumber, ctx })
    └─── EventBus.emit(ESCALATION_COMPUTED, { ctx })

다음 tick → flush() → ROUND_STARTED 핸들러들 처리
  (이미 setGatePeriod 적용 완료 상태)
```

### Key Interfaces

```typescript
// src/core/grid/GridSimulation.ts (일부)

// ADR-0003 Exception 1 — RoundManager.startRound() 내부에서만 호출
// Precondition: seconds ∈ [GATE_PERIOD_FLOOR, GATE_PERIOD_BASE]
// Effect: 모든 게이트 셀의 주기 즉시 갱신. 각 셀의 cyclic offset 유지 (리듬 연속성).
// T_EX는 변경되지 않는다.
setGatePeriod(seconds: number): void {
  if (seconds < GATE_PERIOD_FLOOR || seconds > GATE_PERIOD_BASE) {
    console.warn(`setGatePeriod: ${seconds} 범위 위반 [${GATE_PERIOD_FLOOR}, ${GATE_PERIOD_BASE}]. 적용 거부.`);
    return;
  }
  this.gatePeriod = seconds;
  // 각 게이트 셀 타이머는 offset을 유지한 채 새 주기로 재계산
}

// 상수 (src/core/grid/CellCoord.ts 또는 별도 Constants.ts)
export const GATE_PERIOD_BASE  = 2.0;   // seconds
export const GATE_PERIOD_FLOOR = 1.4;   // seconds — GATE_PERIOD_FLOOR >= 1.2 필수
export const GATE_PERIOD_STEP  = 0.05;  // seconds/round (튜닝 노브)
export const T_EX              = 0.35;  // seconds — 고정
export const SAFE_WIN_MIN      = 0.45;  // seconds — GATE_PERIOD_FLOOR - T_EX >= SAFE_WIN_MIN

// src/features/round/RoundEscalation.ts (일부)
// gatePeriod 계산 (F-RE-1)
computeGatePeriod(roundNumber: number): number {
  return Math.max(
    GATE_PERIOD_FLOOR,
    GATE_PERIOD_BASE - (roundNumber - 1) * GATE_PERIOD_STEP
  );
}
```

## Alternatives Considered

### Alternative A: GridSimulation이 ESCALATION_COMPUTED 구독하여 자체 적용
- **Description**: `RoundEscalation`이 `ESCALATION_COMPUTED` emit → 다음 flush에서 `GridSimulation` 핸들러가 `gatePeriod` 수신 후 `setGatePeriod()` 적용
- **Pros**: 완전한 단방향 EventBus 패턴. 예외 없음.
- **Cons**: **1프레임 지연 버그**: `ROUND_STARTED` flush 시점에 이미 일부 게이트가 이전 주기로 첫 폭발 타임스탬프 계산 → AC-RE-09 위반. `ESCALATION_COMPUTED` → 다음 flush → `GridSimulation` 적용까지 최소 1프레임(16.6ms) 지연.
- **Rejection Reason**: AC-RE-09 "ROUND_STARTED와 동일 프레임 gatePeriod 적용" 위반. ADR-0003에서 이미 이 이유로 Alternative A를 기각하고 Exception 1을 채택함.

### Alternative B: ROUND_STARTED 핸들러 내에서 즉시 setGatePeriod 호출
- **Description**: `ROUND_STARTED` 핸들러(flush 중)에서 `GridSimulation.setGatePeriod()` 호출
- **Pros**: 구현 단순. ROUND_STARTED와 같은 프레임 처리.
- **Cons**: flush() 실행 중 `GridSimulation` 상태 변경 → flush 순서에 따라 다른 핸들러가 이전/이후 값을 혼재해서 볼 수 있음. 멱등성 보장 어려움.
- **Rejection Reason**: flush() 내부 상태 변경은 처리 순서에 따른 비결정론적 결과 위험. RoundManager.startRound() 내 emit 이전 호출 방식이 더 명확한 원자성 보장.

## Consequences

### Positive
- AC-RE-09 기계적으로 보장 — `setGatePeriod()`가 `ROUND_STARTED` emit 이전에 완료됨
- 공식 단일 위치(RoundEscalation.computeGatePeriod) → 범위 검증 포함
- `GATE_PERIOD_FLOOR ≥ 1.2s` 불변으로 `SAFE_WIN_MIN = 0.45s` 항상 성립

### Negative
- ADR-0003 Exception 1 직접 호출 경로 — 개발자가 이 규칙을 인지 필요
- `setGatePeriod()` 호출 위치가 `RoundManager.startRound()` 내부로 제한 → 다른 컨텍스트에서 게이트 주기 변경 불가 (GRID_STALLED 대응 시 동일 경로 사용 필요 — ADR-0009 참조)

### Risks
- **GATE_PERIOD_FLOOR 튜닝 실수**: `1.2s` 미만으로 설정 시 `SAFE_WIN < 0.45s` 위반. **Mitigation**: `setGatePeriod()` 내 런타임 검증으로 거부. `GATE_PERIOD_FLOOR < 1.2s` 를 forbidden_pattern 후보로 등록.
- **GRID_STALLED 시 setGatePeriod 재호출**: 3자 체인에서 패턴 변경 후 새 gatePeriod가 필요할 수 있음. **Mitigation**: ADR-0009에서 GRID_STALLED 흐름 내 setGatePeriod 재호출 허용 여부 결정.

## GDD Requirements Addressed

| GDD System | Requirement | How This ADR Addresses It |
|------------|-------------|--------------------------|
| round-escalation.md | AC-RE-09: ROUND_STARTED와 동일 프레임 gatePeriod 적용 | setGatePeriod()를 ROUND_STARTED emit 이전에 호출하는 순서 확정 |
| round-escalation.md | F-RE-1: GATE_PERIOD(R) = max(FLOOR, BASE - (R-1)×STEP) | 공식을 RoundEscalation.computeGatePeriod()에 단독 구현 |
| round-escalation.md | AC-RE-01/02/03: R1=2.0s, R13=1.4s, R20=1.4s | 공식 + 범위 검증으로 보장 |
| grid-explosion.md | A-8: setGatePeriod() 유효 범위 [FLOOR, BASE] 검증 후 적용 | GridSimulation.setGatePeriod() 내 범위 검증 + 거부 로직 |
| grid-explosion.md | SAFE_WIN = GATE_PERIOD - T_EX ≥ 0.45s 불변 | GATE_PERIOD_FLOOR ≥ 1.2s 강제로 보장 |

## Performance Implications
- **CPU**: `computeGatePeriod()` — 1회 사칙연산 <0.001ms. `setGatePeriod()` — 게이트 셀 수(최대 64) × offset 재계산 <0.1ms
- **Memory**: 없음
- **Load Time**: 없음
- **Network**: 없음

## Migration Plan
신규 시스템 — 기존 코드 없음. `GridSimulation` 구현 시 `setGatePeriod()` 먼저 작성 후 단위 테스트 통과 확인. `RoundEscalation.computeGatePeriod()` 구현 시 AC-RE-01/02/03 테스트 케이스로 검증.

## Validation Criteria
- [ ] AC-RE-01: `computeGatePeriod(1) === 2.0`
- [ ] AC-RE-02: `computeGatePeriod(13) === 1.4`
- [ ] AC-RE-03: `computeGatePeriod(20) === 1.4`
- [ ] AC-RE-04: `computeGatePeriod(R) - T_EX >= SAFE_WIN_MIN` 모든 R ∈ [1, 50]에서 성립
- [ ] `setGatePeriod(1.3)` → 적용 거부 + 경고 로그 (GATE_PERIOD_FLOOR = 1.4 기준)
- [ ] `setGatePeriod(2.1)` → 적용 거부 + 경고 로그 (GATE_PERIOD_BASE = 2.0 기준)
- [ ] `RoundManager.startRound()` 테스트: setGatePeriod 호출이 ROUND_STARTED emit 이전에 완료됨을 spy로 확인
- [ ] `setGatePeriod()` 호출 후 각 게이트 셀의 cyclic offset이 변경되지 않음 (리듬 연속성)

## Related Decisions
- ADR-0002: FrameClock — simulatedTime 기준 gate 타이머 만료 계산
- ADR-0003: Layer Boundaries — Exception 1 (RoundEscalation→setGatePeriod 직접 호출)
- ADR-0005: CellCoord — 셀별 타이머 관리에 CellCoord 사용
- ADR-0009: GRID_STALLED 3자 체인 — GRID_STALLED 시 setGatePeriod 재호출 여부
- `docs/architecture/architecture.md` § Core Layer, § Key Contracts
