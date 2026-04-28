# Story 001: GATE_PERIOD 공식 + EscalationContext 계산

> **Epic**: Round Escalation
> **Status**: Complete
> **Layer**: Feature
> **Type**: Logic
> **Manifest Version**: 2026-04-22

## Context

**GDD**: `design/gdd/round-escalation.md`
**Requirements**: `TR-roundescalation-001`, `TR-roundescalation-002`, `TR-roundescalation-004`, `TR-roundescalation-005`, `TR-roundescalation-009`, `TR-roundescalation-010`
*(Requirement text lives in `docs/architecture/tr-registry.yaml` — read fresh at review time)*

**ADR Governing Implementation**: ADR-0006: Gate Period 튜닝 경로 — F-RE-1 공식 + 동일 프레임 원자 적용
**ADR Decision Summary**: `computeGatePeriod(R)` 를 `RoundEscalation` 단독 구현. `RoundManager.startRound()` 내부에서 `GridSimulation.setGatePeriod()` 를 `ROUND_STARTED` emit **이전**에 호출해 동일 프레임 원자 적용 보장. `setGatePeriod()` 는 범위 `[GATE_PERIOD_FLOOR, GATE_PERIOD_BASE]` 위반 시 거부 + 경고.

**Engine**: Cocos Creator 3.8.6 (TypeScript) | **Risk**: LOW
**Engine Notes**: 순수 TypeScript 로직. 엔진 API 비의존 — 단위 테스트 직접 실행 가능.

**Control Manifest Rules (Feature layer)**:
- Required: `Gate Period 공식 F-RE-1: GATE_PERIOD(R) = max(GATE_PERIOD_FLOOR, GATE_PERIOD_BASE - (R-1) × GATE_PERIOD_STEP)` — `RoundEscalation.computeGatePeriod()` 단독 구현 — source: ADR-0006
- Required: `GridSimulation.setGatePeriod()` 호출은 `ROUND_STARTED` emit 이전 — source: ADR-0006
- Required: `setGatePeriod()` 범위 검증: `[GATE_PERIOD_FLOOR, GATE_PERIOD_BASE]` 위반 시 적용 거부 + `console.warn` — source: ADR-0006
- Forbidden: `setGatePeriod()` during GRID_STALLED 체인 — source: ADR-0006
- Forbidden: `GATE_PERIOD_FLOOR` 를 1.2s 미만으로 설정 — source: ADR-0006
- Guardrail: `setGatePeriod()` 갱신 < 0.1ms — source: ADR-0006

---

## Acceptance Criteria

*From GDD `design/gdd/round-escalation.md`, scoped to this story:*

- [ ] **AC-RE-01**: R1에서 `computeGatePeriod(1) === 2.0`, `selectTier(1, seed) === 1` (T1=100%)
- [ ] **AC-RE-02**: R13에서 `computeGatePeriod(13) === 1.4` (GATE_PERIOD_FLOOR 도달)
- [ ] **AC-RE-03**: R20에서 `computeGatePeriod(20) === 1.4` (하한 고정 확인)
- [ ] **AC-RE-04**: `computeGatePeriod(R) - T_EX >= SAFE_WIN_MIN(0.45s)` — R=1~50 모든 값에서 성립
- [ ] **AC-RE-05**: R1–3에서 `selectTier(R, seed) === 1` 항상 (T1 가중치 100%)
- [ ] **AC-RE-06**: R15+에서 `selectTier(15, seed)` 1000회 시뮬레이션 기준 tier=3 선택 비율 75–85% 범위
- [ ] **AC-RE-09**: `onRoundStarted` 핸들러 내에서 `ESCALATION_COMPUTED` emit이 동기적으로 완료됨 (flush 이전)
- [ ] **AC-RE-10**: `roundNumber=1` 첫 수신 시 `gatePeriod=2.0`, `tier=1` 반환 (세션 리셋 동작과 일치)
- [ ] **AC-RE-11**: `getTierWeights(R).t1 + t2 + t3 === 100` — 모든 라운드 구간에서 성립
- [ ] **AC-RE-12**: 동일 `roundNumber` + 동일 `seed` → 항상 동일한 `tier` 반환 (결정론적)

---

## Implementation Notes

*Derived from ADR-0006 Implementation Guidelines:*

```typescript
// src/features/round/RoundEscalation.ts

import type { IEventBus } from '../../core/events/IEventBus';
import type { IFrameClock } from '../../core/time/IFrameClock';
import type { GameEvents } from '../../core/events/GameEvents';

// 상수 — src/core/grid/Constants.ts 또는 RoundEscalation.ts 상단 export
export const GATE_PERIOD_BASE  = 2.0;   // seconds
export const GATE_PERIOD_FLOOR = 1.4;   // seconds (>= 1.2 필수)
export const GATE_PERIOD_STEP  = 0.05;  // seconds/round (튜닝 노브)
export const T_EX              = 0.35;  // seconds (고정)
export const SAFE_WIN_MIN      = 0.45;  // seconds

export interface EscalationContext {
  roundNumber:     number;
  gatePeriod:      number;
  tier:            1 | 2 | 3;
  tierWeights:     { t1: number; t2: number; t3: number };
  stalledFallback: boolean;
}

export class RoundEscalation {
  private lastTier: 1 | 2 | 3 = 1;
  private currentGatePeriod: number = GATE_PERIOD_BASE;

  constructor(
    private readonly eventBus: IEventBus,
    private readonly clock: IFrameClock,
  ) {
    this.eventBus.on('ROUND_STARTED', this.onRoundStarted.bind(this));
    this.eventBus.on('GRID_STALLED',  this.onGridStalled.bind(this));
  }

  // F-RE-1: GATE_PERIOD(R) = max(FLOOR, BASE - (R-1) × STEP)
  computeGatePeriod(roundNumber: number): number {
    return Math.max(
      GATE_PERIOD_FLOOR,
      GATE_PERIOD_BASE - (roundNumber - 1) * GATE_PERIOD_STEP,
    );
  }

  // RE-2: Tier 가중치 테이블 조회
  getTierWeights(roundNumber: number): { t1: number; t2: number; t3: number } {
    if (roundNumber <= 3)  return { t1: 100, t2: 0,  t3: 0  };
    if (roundNumber <= 6)  return { t1: 70,  t2: 30, t3: 0  };
    if (roundNumber <= 10) return { t1: 30,  t2: 70, t3: 0  };
    if (roundNumber <= 14) return { t1: 0,   t2: 60, t3: 40 };
    return                        { t1: 0,   t2: 20, t3: 80 };
  }

  // F-RE-2: tier_roll = seed mod 100 → tier_from_weights
  selectTier(roundNumber: number, seed: number): 1 | 2 | 3 {
    const w = this.getTierWeights(roundNumber);
    const roll = seed % 100;
    if (roll < w.t1)          return 1;
    if (roll < w.t1 + w.t2)   return 2;
    return 3;
  }

  private onRoundStarted(evt: GameEvents['ROUND_STARTED']): void {
    const { roundNumber, seed } = evt;
    const gatePeriod  = this.computeGatePeriod(roundNumber);
    const tierWeights = this.getTierWeights(roundNumber);
    const tier        = this.selectTier(roundNumber, seed);
    this.lastTier          = tier;
    this.currentGatePeriod = gatePeriod;

    const ctx: EscalationContext = { roundNumber, gatePeriod, tier, tierWeights, stalledFallback: false };
    this.eventBus.emit('ESCALATION_COMPUTED', { ctx });
    // Note: setGatePeriod() 는 RoundManager.startRound() 레벨에서 ROUND_STARTED emit 이전 호출
    // 이 핸들러 내부에서 setGatePeriod 재호출 금지 (ADR-0006)
  }

  private onGridStalled(evt: GameEvents['GRID_STALLED']): void {
    // Story 002 에서 구현 — 이 스토리 범위 외
  }
}
```

- `RoundManager.startRound()` 에서 `escalation.computeGatePeriod(R)` 계산 후 → `gridSim.setGatePeriod(gp)` → `eventBus.emit('ROUND_STARTED', ...)` 순서 반드시 유지 (ADR-0006 원자 시퀀스 step 2→3).
- `ROUND_STARTED` 페이로드에 `seed: number` 필드가 포함되어야 함 — 서버 WebSocket에서 공급. 이 스토리에서는 `seed`가 `GameEvents['ROUND_STARTED']` 타입에 있다고 가정하고 구현.
- `T_EX`, `SAFE_WIN_MIN` 은 상수 선언만. 계산 검증은 단위 테스트에서.

---

## Out of Scope

*Handled by neighbouring stories — do not implement here:*

- **Story 002**: `onGridStalled` 핸들러 구현 — GRID_STALLED 수신 → fallbackTier 계산 → `ESCALATION_COMPUTED(stalledFallback=true)` 재발행

---

## QA Test Cases

*Written at story creation. 개발자는 이 케이스를 구현 타겟으로 사용.*

- **AC-RE-01**: R1 기준값
  - Given: `roundNumber=1`, `seed=42`
  - When: `escalation.computeGatePeriod(1)` + `escalation.selectTier(1, 42)`
  - Then: `computeGatePeriod === 2.0`, `selectTier === 1`
  - Edge cases: seed=0, seed=99, seed=100 모두 R1-3에서 tier=1 반환

- **AC-RE-02**: R13 하한 도달
  - Given: `roundNumber=13`
  - When: `escalation.computeGatePeriod(13)`
  - Then: `=== 1.4` (2.0 - 12×0.05 = 1.4 = FLOOR)
  - Edge cases: R=12 → 1.45, R=14 → 1.4 (이미 하한)

- **AC-RE-03**: R20 하한 고정
  - Given: `roundNumber=20`
  - When: `escalation.computeGatePeriod(20)`
  - Then: `=== 1.4` (max(1.4, 1.05) = 1.4)

- **AC-RE-04**: SAFE_WIN 불변 조건
  - Given: R ∈ [1, 50]
  - When: `computeGatePeriod(R) - T_EX` 계산
  - Then: 모든 R에서 `>= SAFE_WIN_MIN (0.45)`
  - Edge cases: R=13 → 1.05 ✅; R=100 → 1.05 ✅

- **AC-RE-05**: R1-3 항상 Tier 1
  - Given: R ∈ {1, 2, 3}, seeds ∈ {0, 50, 99}
  - When: `escalation.selectTier(R, seed)`
  - Then: 항상 `1` (T1=100%)

- **AC-RE-06**: R15+ 분포 검증
  - Given: `roundNumber=15`, seeds 0–999 (1000회)
  - When: `escalation.selectTier(15, seed)` for each seed
  - Then: `tier===3` 비율 ∈ [0.75, 0.85] (기대값 0.80)

- **AC-RE-11**: tierWeights 합 = 100
  - Given: R ∈ {1, 4, 7, 11, 15, 20}
  - When: `escalation.getTierWeights(R)`
  - Then: `t1 + t2 + t3 === 100` 각 R에서

- **AC-RE-12**: 결정론적 tier 선택
  - Given: `roundNumber=8`, `seed=142`
  - When: `escalation.selectTier(8, 142)` 2회 호출
  - Then: 동일 결과. (`roll=42, T1=30 → 42>=30 → T2 → tier=2`)

---

## Test Evidence

**Story Type**: Logic
**Required evidence**: `tests/unit/roundescalation/gate_period_compute_test.ts` — must exist and pass

**Status**: [x] Created and passing — 26/26 tests

---

## Dependencies

- Depends on: None (계산 로직은 독립적 — EventBus/FrameClock DI만 필요)
- Unlocks: Story 002 (GRID_STALLED 핸들러는 `lastTier`, `currentGatePeriod` 상태 사용)

## Completion Notes
**Completed**: 2026-04-22
**Criteria**: 10/10 passing
**Deviations**: ADVISORY — `computeContext()` is public method called directly by RoundManager (not via ROUND_STARTED subscription) to satisfy AC-RE-09 same-frame atomic emit requirement. `onGridStalled` stub in place for story-002.
**Test Evidence**: Logic: `tests/unit/roundescalation/gate_period_compute_test.ts` — 26/26 tests pass
**Code Review**: Skipped — Lean mode
