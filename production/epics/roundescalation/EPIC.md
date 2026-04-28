# Epic: Round Escalation

> **Layer**: Feature
> **GDD**: design/gdd/round-escalation.md
> **Architecture Module**: RoundEscalation (`src/features/round/RoundEscalation.ts`)
> **Status**: Complete
> **Stories**: 2 stories — both complete

## Stories

| # | Story | Type | Status | ADR |
|---|-------|------|--------|-----|
| 001 | GATE_PERIOD 공식 + EscalationContext 계산 | Logic | Complete | ADR-0006 |
| 002 | GRID_STALLED 체인 — Tier 강등 + stalledFallback | Integration | Complete | ADR-0009 |

## Overview

라운드 에스컬레이션 시스템은 라운드 번호에 따라 패턴 라이브러리의 Tier 선택 구간과 그리드 폭발 파라미터(GATE_PERIOD)를 조정하는 난이도 곡선 시스템이다. `ROUND_STARTED` 이벤트를 수신할 때마다 `EscalationContext`를 계산하여 `ESCALATION_COMPUTED` 이벤트로 발행한다. `GRID_STALLED` 수신 시 현재 라운드에 한해 Tier를 한 단계 강등(`fallbackTier = max(1, lastTier - 1)`)하여 재발행한다. 이 시스템은 상태 기계가 없는 순수 계산 시스템 — `roundNumber`(+ 서버 seed)를 입력받아 `EscalationContext`를 출력하는 함수. 내부 상태는 `lastTier`(GRID_STALLED 강등 감지용)만 보유한다.

## Governing ADRs

| ADR | Decision Summary | Engine Risk |
|-----|-----------------|-------------|
| ADR-0006: Gate Period 튜닝 | GATE_PERIOD(R) = max(1.4, 2.0 − (R−1) × 0.05). setGatePeriod() 범위 [1.4, 2.0] 적용. ROUND_STARTED emit 이전 호출 | LOW |
| ADR-0009: GRID_STALLED 3자 체인 | GRID_STALLED → RoundEscalation → fallbackTier = max(1, lastTier-1) → ESCALATION_COMPUTED(stalledFallback=true). setGatePeriod 재호출 금지 | LOW |

## GDD Requirements

| TR-ID | Requirement | ADR Coverage |
|-------|-------------|--------------|
| TR-roundescalation-001 | GATE_PERIOD(R) = max(1.4, 2.0 − (R−1) × 0.05) | ADR-0006 ✅ |
| TR-roundescalation-002 | Tier weight table: R1-3(100/0/0), R4-6(70/30/0), R7-10(30/70/0), R11-14(0/60/40), R15+(0/20/80) | ⚠️ Partial (GDD RE-2, no dedicated ADR) |
| TR-roundescalation-003 | Deterministic tier selection using server seed | ⚠️ Partial (GDD RE-2 implicit, no dedicated ADR) |
| TR-roundescalation-004 | ESCALATION_COMPUTED { ctx: EscalationContext } emitted immediately after ROUND_STARTED | ADR-0009 ✅ |
| TR-roundescalation-005 | EscalationContext { roundNumber, gatePeriod, tier, tierWeights, stalledFallback } | ADR-0009 ✅ |
| TR-roundescalation-006 | stalledFallback=true on ESCALATION_COMPUTED from GRID_STALLED handler | ADR-0009 ✅ |
| TR-roundescalation-007 | fallbackTier = max(1, lastTier − 1) on GRID_STALLED | ADR-0009 ✅ |
| TR-roundescalation-008 | GRID_STALLED handler MUST NOT call setGatePeriod | ADR-0009 ✅ |
| TR-roundescalation-009 | gatePeriod applied same-frame as ROUND_STARTED (setGatePeriod called before emit) | ADR-0006 ✅ |
| TR-roundescalation-010 | GATE_PERIOD_FLOOR >= 1.2s — enforces SAFE_WIN_MIN = 0.45s | ADR-0006 ✅ |

**Coverage**: 8/10 full ADR coverage, 2/10 partial (GDD spec only — TR-002, TR-003)

## Definition of Done

This epic is complete when:
- All stories are implemented, reviewed, and closed via `/story-done`
- All acceptance criteria from `design/gdd/round-escalation.md` are verified
- All Logic and Integration stories have passing test files in `tests/`
- GATE_PERIOD formula produces correct values for R1–R15+ per F-RE-1
- GRID_STALLED chain resolves within 9 frames per ADR-0009 guardrail

## Next Step

Run `/create-stories roundescalation` to break this epic into implementable stories.
