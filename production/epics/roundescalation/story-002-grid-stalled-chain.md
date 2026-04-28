# Story 002: GRID_STALLED 체인 — Tier 강등 + stalledFallback

> **Epic**: Round Escalation
> **Status**: Complete
> **Layer**: Feature
> **Type**: Integration
> **Manifest Version**: 2026-04-22

## Context

**GDD**: `design/gdd/round-escalation.md`
**Requirements**: `TR-roundescalation-003`, `TR-roundescalation-006`, `TR-roundescalation-007`, `TR-roundescalation-008`
*(Requirement text lives in `docs/architecture/tr-registry.yaml` — read fresh at review time)*

**ADR Governing Implementation**: ADR-0009: GRID_STALLED 3자 체인 — canonical 흐름 및 재귀 방지
**ADR Decision Summary**: EventBus flush 큐(ADR-0001)가 GRID_STALLED 3자 체인의 재귀를 구조적으로 방지. `RoundEscalation` GRID_STALLED 핸들러의 역할: `fallbackTier = max(1, lastTier-1)` 계산 → `ESCALATION_COMPUTED(stalledFallback=true)` emit. `setGatePeriod` 재호출 없음 — 게이트 리듬 연속성 유지.

**Engine**: Cocos Creator 3.8.6 (TypeScript) | **Risk**: LOW
**Engine Notes**: 순수 TypeScript EventBus 큐 패턴. 엔진 API 비의존 — MockEventBus로 완전 테스트 가능.

**Control Manifest Rules (Feature layer)**:
- Required: `GRID_STALLED 체인은 전부 EventBus flush 큐 경유` — 동기 직접 호출 체인 금지 — source: ADR-0009
- Required: `RoundEscalation GRID_STALLED 핸들러: fallbackTier = max(1, lastTier-1) → ESCALATION_COMPUTED(stalledFallback=true) emit만` — setGatePeriod 재호출 없음 — source: ADR-0009
- Required: `PatternLibrary: stalledFallback=true ESCALATION_COMPUTED 수신 시 강등 tier로 재선택` — source: ADR-0009
- Forbidden: `Never setGatePeriod() during GRID_STALLED 핸들러` — 게이트 리듬 파괴 — source: ADR-0009
- Forbidden: `Never GRID_STALLED 체인을 동기 직접 호출로 구현` — 스택 오버플로우 위험 — source: ADR-0009
- Guardrail: GRID_STALLED 체인 최대 깊이 9프레임 (~150ms at 60fps) — source: ADR-0009

---

## Acceptance Criteria

*From GDD `design/gdd/round-escalation.md`, scoped to this story:*

- [ ] **AC-RE-07**: `GRID_STALLED` 수신 시 `ESCALATION_COMPUTED(tier=max(1, lastTier-1), stalledFallback=true)` 발행 확인 — lastTier=3 → tier=2, lastTier=2 → tier=1
- [ ] **AC-RE-08**: Tier 1 상태에서 `GRID_STALLED` 수신 시 `ESCALATION_COMPUTED(tier=1, stalledFallback=true)` — 강등 없음 (`max(1, 0)=1`)
- [ ] **AC-RE-setGatePeriod-forbidden**: `GRID_STALLED` 핸들러 내에서 `setGatePeriod()` 호출 없음 확인 (spy 검증)
- [ ] **AC-RE-gatePeriod-unchanged**: `stalledFallback=true` ESCALATION_COMPUTED 의 `gatePeriod`는 해당 라운드 `ROUND_STARTED` 시점 값과 동일 (변경 없음)
- [ ] **AC-RE-consecutive-stall**: 동일 라운드 2회 연속 GRID_STALLED 시 두 번째 강등도 올바르게 적용 (T3→T2→T1)

---

## Implementation Notes

*Derived from ADR-0009 Implementation Guidelines:*

```typescript
// src/features/round/RoundEscalation.ts — onGridStalled 구현 (story-001 스텁 교체)

private onGridStalled(evt: GameEvents['GRID_STALLED']): void {
  const { roundNumber } = evt;

  // F-RE-3: fallbackTier = max(1, lastTier - 1)
  const fallbackTier = Math.max(1, this.lastTier - 1) as 1 | 2 | 3;
  this.lastTier = fallbackTier;  // 다음 GRID_STALLED 를 위해 갱신

  const ctx: EscalationContext = {
    roundNumber,
    gatePeriod:      this.currentGatePeriod,  // 변경 없음 — ADR-0009 명시
    tier:            fallbackTier,
    tierWeights:     this.getTierWeights(roundNumber),
    stalledFallback: true,
  };

  this.eventBus.emit('ESCALATION_COMPUTED', { ctx });
  // setGatePeriod 호출 없음 — ADR-0009 + ADR-0006 계약
  // 직접 PatternLibrary 호출 없음 — EventBus flush 큐가 체인 처리
}
```

**체인 흐름 (ADR-0009 Canonical)**:
```
[PatternLibrary] 3회 실패 → emit(GRID_STALLED)
  ↓ 다음 flush
[RoundEscalation] onGridStalled → fallbackTier → emit(ESCALATION_COMPUTED, stalledFallback=true)
  ↓ 다음 flush
[PatternLibrary] stalledFallback=true 수신 → 강등 Tier로 재선택 (이 스토리 범위 외)
```

- `currentGatePeriod`는 `onRoundStarted` 에서 갱신된 값. `onGridStalled`는 이 값을 읽기만 한다.
- `lastTier` 갱신은 `onGridStalled` 내에서 즉시. 연속 GRID_STALLED 시 누적 강등 가능.
- `getTierWeights(roundNumber)` 를 강등 후 Tier 기준으로 재조회 — 패턴 라이브러리가 올바른 pool에서 선택하도록.

---

## Out of Scope

*Handled by neighbouring stories — do not implement here:*

- **Story 001**: `onRoundStarted` 핸들러, `computeGatePeriod`, `selectTier`, `getTierWeights`
- **PatternLibrary Story 003**: `stalledFallback=true` ESCALATION_COMPUTED 수신 → 강등 Tier 재선택 흐름
- **GridSimulation**: Tier 1 종단 빈 패턴 처리 (`applyEmptyPattern`)

---

## QA Test Cases

*Written at story creation. 개발자는 이 케이스를 구현 타겟으로 사용.*

- **AC-RE-07a**: lastTier=3 → tier=2 강등
  - Given: RoundEscalation 초기화 후 ROUND_STARTED(R=15, seed=99) 수신 → lastTier=3 설정
  - When: GRID_STALLED({roundNumber:15}) 이벤트 emit → flush
  - Then: ESCALATION_COMPUTED 수신됨, `ctx.tier===2`, `ctx.stalledFallback===true`
  - Edge cases: 강등 후 `lastTier` 내부 상태도 2로 갱신되었는지 확인

- **AC-RE-07b**: lastTier=2 → tier=1 강등
  - Given: lastTier=2 상태 (직전 GRID_STALLED로 2로 감소된 상태 또는 ROUND_STARTED R=7 seed=0 → tier=1 ... 아니면 수동으로 설정)
  - When: GRID_STALLED 수신
  - Then: ESCALATION_COMPUTED `ctx.tier===1`, `ctx.stalledFallback===true`

- **AC-RE-08**: Tier 1 + GRID_STALLED — 강등 없음
  - Given: lastTier=1 (R1-3 또는 이전 강등으로 최소값)
  - When: GRID_STALLED 수신
  - Then: ESCALATION_COMPUTED `ctx.tier===1`, `ctx.stalledFallback===true`
  - Edge cases: max(1, 1-1) = max(1,0) = 1 확인

- **AC-RE-setGatePeriod-forbidden**: setGatePeriod 미호출 검증
  - Given: MockGridSimulation with `setGatePeriod` spy
  - When: GRID_STALLED 핸들러 실행
  - Then: `setGatePeriod` spy 호출 횟수 === 0

- **AC-RE-gatePeriod-unchanged**: gatePeriod 불변 검증
  - Given: ROUND_STARTED(R=5, seed=0) 수신 → currentGatePeriod=1.8
  - When: GRID_STALLED 수신
  - Then: ESCALATION_COMPUTED `ctx.gatePeriod === 1.8`

- **AC-RE-consecutive-stall**: 연속 2회 GRID_STALLED
  - Given: ROUND_STARTED(R=15, seed=99) → lastTier=3
  - When: GRID_STALLED 1회 → flush → GRID_STALLED 2회 → flush
  - Then: 1차 ESCALATION_COMPUTED `tier=2` / 2차 ESCALATION_COMPUTED `tier=1` (각각 stalledFallback=true)

---

## Test Evidence

**Story Type**: Integration
**Required evidence**: `tests/integration/roundescalation/grid_stalled_chain_test.ts` — must exist and pass

**Status**: [x] Created and passing — 10/10 tests

---

## Dependencies

- Depends on: Story 001 must be DONE (onRoundStarted, lastTier/currentGatePeriod 상태 기반)
- Unlocks: PatternLibrary Story 003 (stalledFallback=true ESCALATION_COMPUTED 소비 흐름)

## Completion Notes
**Completed**: 2026-04-22
**Criteria**: 5/5 passing
**Deviations**: ADVISORY — Integration test uses 2-tick pattern per ADR-0009 flush queue design. WebSocketAdapter.ts stub EscalationContext updated to GDD RE-6 shape (collateral fix). 
**Test Evidence**: Integration: `tests/integration/roundescalation/grid_stalled_chain_test.ts` — 10/10 tests pass
**Code Review**: Skipped — Lean mode
