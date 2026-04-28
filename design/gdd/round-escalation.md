# 라운드 에스컬레이션 (Round Escalation)

> **Status**: Draft — Review Pending
> **Author**: 김재현 + agents
> **Last Updated**: 2026-04-21
> **Implements Pillar**: Pillar 1 — 읽으면 이긴다 / Pillar 2 — 5분의 밀도

## Overview

라운드 에스컬레이션 시스템은 라운드 번호에 따라 패턴 라이브러리의 Tier 선택 범위와 그리드 폭발 파라미터를 조정하는 난이도 곡선 시스템이다. `ROUND_STARTED` 이벤트를 수신할 때마다 현재 라운드에 적합한 Tier 구간을 계산하고 패턴 라이브러리에 Tier 컨텍스트를 전달한다 — 패턴 선택의 구체적 로직은 패턴 라이브러리가 소유하며, 이 시스템은 "어떤 난이도 구간에서 뽑을 것인가"만 결정한다. 이 분리가 존재하는 이유는 단일 책임 원칙이다: 라운드 매니저는 라운드 생명주기를, 패턴 라이브러리는 패턴 데이터를, 이 시스템은 난이도 곡선을 각자 소유한다. 플레이어 관점에서 이 시스템은 "라운드가 오를수록 더 읽기 어려운 패턴, 더 빠른 폭발 사이클"로 체감된다 — 그러나 어떤 라운드에서도 "읽으면 이길 수 있다"는 계약은 유지된다. Pillar 1 "읽으면 이긴다"의 숙련 곡선과 Pillar 2 "5분의 밀도"의 긴장감 상승을 동시에 구현한다.

## Player Fantasy

**수확의 가속**

처음에는 패턴을 *읽고 나서* 움직였다. 라운드 1에서 2로, 2에서 3으로 — 그 사이에 무언가가 달라졌다는 걸 플레이어는 머리가 아닌 손으로 먼저 안다. 경고 깜빡임이 짧아졌다. 안전 칸으로 가는 경로가 한 박자 더 좁아졌다. 이제는 읽으면서 동시에 움직여야 한다.

앵커 모먼트는 그 전환이 일어나는 순간이다. 손이 눈을 따라잡았을 때 — "내가 *이걸* 할 수 있구나." 난이도가 올라간 것이 아니라, **내가 해낼 수 있는 것의 한계가 이동한** 것이다.

이 시스템이 만드는 판타지는 압박이다 — 그러나 처벌로서의 압박이 아니라, 장인이 더 좁은 오차 안에서 작업할 때 느끼는 종류의 것이다. 수확자의 낫이 빨라질수록, 그 아래에서 계속 춤추는 자는 더 깊이 실력을 증명한다. 세션이 끝날 때 살아남든 죽든, 플레이어는 "이 격자는 나를 시험했다"는 것을 안다.

**앵커 모먼트**: 처음으로 Tier 3 패턴이 등장하는 라운드에서, 폭발 경고가 시작되는 순간 발이 먼저 움직이는 것을 자각하는 순간.

## Detailed Design

### Core Rules

**RE-1 — 에스컬레이션 트리거**
`ROUND_STARTED` 이벤트 수신 시 즉시 `EscalationContext`를 계산하고 발행한다. 계산은 동기적으로 완료되어야 한다 — Pattern Library의 패턴 선택이 시작되기 전에 `EscalationContext`가 반드시 사용 가능해야 한다. `ROUND_CLEAR`, `GAME_OVER`는 구독하지 않는다. `roundNumber`가 유일한 입력이다.

---

**RE-2 — Tier 선택 규칙 (가중치 스텝 테이블)**

라운드 번호에 따라 아래 가중치 테이블로 Tier를 확률적으로 선택한다. 라운드 시드(`seed mod 100`)로 결정론적 선택.

| 라운드 구간 | T1 가중치 | T2 가중치 | T3 가중치 |
|------------|----------|----------|----------|
| R1 – R3 | 100 | 0 | 0 |
| R4 – R6 | 70 | 30 | 0 |
| R7 – R10 | 30 | 70 | 0 |
| R11 – R14 | 0 | 60 | 40 |
| R15+ | 0 | 20 | 80 |

- 가중치 합계는 항상 100.
- 로비 인원 수(`totalPlayers`)는 Tier 선택에 영향을 주지 않는다.
- 부활 플레이어에 대한 Tier 완화 없음 — 현재 라운드 Tier가 전원에게 동일 적용.

---

**RE-3 — 속도 에스컬레이션 (GATE_PERIOD)**

```
GATE_PERIOD(R) = max(GATE_PERIOD_FLOOR, GATE_PERIOD_BASE - (R - 1) × GATE_PERIOD_STEP)
```

| 변수 | 기본값 | 범위 | 설명 |
|------|--------|------|------|
| `GATE_PERIOD_BASE` | 2.0s | 고정 | 라운드 1 기준 사이클 길이 |
| `GATE_PERIOD_STEP` | 0.05s | 0.03–0.08s | 라운드당 감소량 (튜닝 노브) |
| `GATE_PERIOD_FLOOR` | 1.4s | 1.2–1.6s | 최소 사이클 길이 (튜닝 노브) |

- 기본값(STEP=0.05s)에서 R13에 1.4s 하한 도달 → 이후 속도 고정.
- 하한 근거: `SAFE_WIN = 1.4 - 0.35 = 1.05s` — 최소 필요 여유(0.45s)의 2.3배. "읽으면 이긴다" 계약 유지.

---

**RE-4 — 라운드 타이머 에스컬레이션**

`ROUND_TIME_LIMIT`은 라운드마다 변경하지 않는다 (고정). `ROUND_TIME_LIMIT_STEP = 0` (예약된 튜닝 노브 — 플레이테스트 결과에 따라 활성화 가능, 기본 비활성).

---

**RE-5 — 에스컬레이션 리셋 및 GRID_STALLED 처리**

- **세션 리셋**: Game Over 후 새 세션 시작 시 `roundNumber = 1`로 초기화. 모든 에스컬레이션 파라미터가 라운드 1 기준값으로 복귀.
- **GRID_STALLED 처리**: `GRID_STALLED` 수신 시 Round Escalation이 소유권을 가진다. 현재 라운드에 한해 `tier = max(1, currentTier - 1)`로 강등한 새 `EscalationContext`를 발행 (`stalledFallback: true` 플래그 포함). Pattern Library가 강등된 Tier로 재선택한다. 다음 라운드는 `roundNumber` 기준으로 정상 재계산.

---

**RE-6 — 인터페이스 계약 (EscalationContext)**

```typescript
interface EscalationContext {
  roundNumber:     number;              // 현재 라운드 번호 (1-based)
  gatePeriod:      number;              // 이번 라운드 GATE_PERIOD (초)
  tier:            1 | 2 | 3;           // 선택된 Tier
  tierWeights:     { t1: number; t2: number; t3: number }; // 사용된 가중치 (합=100)
  stalledFallback: boolean;             // GRID_STALLED 강등으로 재발행된 경우 true
}
```

이벤트명: `ESCALATION_COMPUTED`. `ROUND_STARTED` 직후, Pattern Library 선택 이전에 발행.

### States and Transitions

Round Escalation은 상태 기계가 없는 **순수 계산 시스템**이다 — `roundNumber`를 입력받아 `EscalationContext`를 출력하는 함수. 내부 상태는 `lastTier`(GRID_STALLED 강등 감지용)만 보유.

| 내부 변수 | 설명 |
|----------|------|
| `currentRound` | 현재 라운드 번호. `ROUND_STARTED`마다 업데이트. |
| `lastTier` | 직전에 발행한 Tier. GRID_STALLED 강등 계산에 사용. |

**처리 흐름:**
```
ROUND_STARTED 수신
  → currentRound 업데이트
  → GATE_PERIOD(R) 계산
  → Tier 가중치 조회 → seed 기반 tier 선택
  → ESCALATION_COMPUTED 발행
  → (이후) Pattern Library 선택 시작

GRID_STALLED 수신 (ROUND_ACTIVE 중)
  → tier = max(1, lastTier - 1)
  → stalledFallback = true로 ESCALATION_COMPUTED 재발행
  → Pattern Library 재선택
```

### Interactions with Other Systems

| 시스템 | 방향 | 상호작용 |
|--------|------|---------|
| `round-manager` | 업스트림 | `ROUND_STARTED` 이벤트 + `roundNumber` 수신 |
| `pattern-library` | 다운스트림 | `EscalationContext.tier` + `roundNumber` 전달 → DifficultyContext로 사용 |
| `grid-explosion` | 다운스트림 | `EscalationContext.gatePeriod` 전달 → 이번 라운드 `GATE_PERIOD` 덮어쓰기 |
| `HUD` | 다운스트림 | `roundNumber`, `tier` (디버그 모드), `tierWeights` (디버그 모드) 수신 |

## Formulas

**F-RE-1 — GATE_PERIOD 에스컬레이션**

```
GATE_PERIOD(R) = max(GATE_PERIOD_FLOOR, GATE_PERIOD_BASE - (R - 1) × GATE_PERIOD_STEP)
```

| 변수 | 기호 | 타입 | 범위 | 설명 |
|------|------|------|------|------|
| 라운드 번호 | `R` | int | 1 – 무제한 | 현재 라운드 (1-based) |
| 기준 사이클 길이 | `GATE_PERIOD_BASE` | float | 2.0s (고정) | 라운드 1 GATE_PERIOD |
| 라운드당 감소량 | `GATE_PERIOD_STEP` | float | 0.03–0.08s | 튜닝 노브. 기본 0.05s |
| 최소 사이클 길이 | `GATE_PERIOD_FLOOR` | float | 1.2–1.6s | 튜닝 노브. 기본 1.4s |

**출력 범위**: `[GATE_PERIOD_FLOOR, 2.0]` — 항상 하한 이상, 기준값 이하.

예시 (기본값 기준):

| R | 계산식 | 결과 | SAFE_WIN |
|---|--------|------|---------|
| 1 | max(1.4, 2.0 - 0×0.05) | 2.0s | 1.65s |
| 5 | max(1.4, 2.0 - 4×0.05) | 1.8s | 1.45s |
| 10 | max(1.4, 2.0 - 9×0.05) | 1.55s | 1.2s |
| 13 | max(1.4, 2.0 - 12×0.05) | 1.4s | 1.05s |
| 20 | max(1.4, 2.0 - 19×0.05) = max(1.4, 1.05) | **1.4s** | 1.05s |

하한 도달 라운드: `R_floor = floor((BASE - FLOOR) / STEP) + 1 = floor(0.6/0.05) + 1 = 13`

---

**F-RE-2 — Tier 결정론적 선택**

```
tier_roll = seed mod 100
tier = tier_from_weights(tier_roll, tierWeights(R))
```

| 변수 | 기호 | 타입 | 범위 | 설명 |
|------|------|------|------|------|
| 라운드 시드 | `seed` | int | 0 – MAX_INT | WebSocket 시스템 공급. 라운드마다 고유 |
| Tier 롤 | `tier_roll` | int | 0–99 | seed mod 100 |
| T1 가중치 | `tierWeights.t1` | int | 0–100 | 라운드 구간별 테이블에서 조회 |
| T2 가중치 | `tierWeights.t2` | int | 0–100 | |
| T3 가중치 | `tierWeights.t3` | int | 0–100 | |

**출력**: `1`, `2`, 또는 `3`. `t1+t2+t3 = 100` 불변.

선택 로직: `tier_roll < t1` → Tier 1 / `tier_roll < t1+t2` → Tier 2 / 그 외 → Tier 3.

예시 (R=8, seed=142, tierWeights={t1:30, t2:70, t3:0}):
`tier_roll = 142 mod 100 = 42`. `42 ≥ 30` → Tier 2.

---

**F-RE-3 — GRID_STALLED Tier 강등**

```
fallbackTier = max(1, currentTier - 1)
```

| 변수 | 범위 | 설명 |
|------|------|------|
| `currentTier` | 1–3 | GRID_STALLED 발생 직전 Tier |
| `fallbackTier` | 1–2 | 강등된 Tier (최소 1) |

출력 범위: 1 또는 2. Tier 1에서 GRID_STALLED 발생 시 강등 없음 (이미 최소).

---

**F-RE-4 — 안전 창 유효성 검증**

```
SAFE_WIN(R) = GATE_PERIOD(R) - T_EX
```

| 변수 | 값 | 설명 |
|------|-----|------|
| `T_EX` | 0.35s | 폭발 지속 시간 (grid-explosion 정의) |
| `SAFE_WIN_MIN` | 0.45s | 최소 필요 안전 창 (이동 + 입력 지연 합계) |

**불변 조건**: `SAFE_WIN(R) ≥ SAFE_WIN_MIN` 모든 R에서 성립해야 한다.
검증: `SAFE_WIN(R_floor) = 1.4 - 0.35 = 1.05s ≥ 0.45s` ✅

## Edge Cases

**EC-RE-1 — GATE_PERIOD_STEP이 크게 조정되어 하한이 조기 도달**

상황: `GATE_PERIOD_STEP = 0.08s`로 설정 시 `R_floor = 8`. R8부터 속도 고정, 이후 Tier만 에스컬레이션.
처리: 정상 동작. `max()` 클램프가 하한을 보장한다. `GATE_PERIOD_FLOOR ≥ 1.2s`인 한 `SAFE_WIN ≥ 0.45s` 불변 조건 성립. `GATE_PERIOD_FLOOR < 1.2s` 설정은 금지.

---

**EC-RE-2 — GRID_STALLED 발생 시 currentTier = 1**

상황: Tier 1 패턴이 모두 `N_recent` 배제 윈도우에 걸려 3회 연속 거부됨.
처리: `fallbackTier = max(1, 1-1) = 1`. 강등 없음. `stalledFallback: true`로 동일 Tier 1 컨텍스트 재발행. Pattern Library가 `N_recent`를 무시하고 강제 선택하는 것은 Pattern Library의 EC 책임. Round Escalation은 추가 강등을 시도하지 않는다.

---

**EC-RE-3 — 같은 라운드에서 GRID_STALLED가 2회 연속 발생**

상황: Tier 강등 후 재선택에서도 패턴 검증 실패 → GRID_STALLED 재발행.
처리: 두 번째 `GRID_STALLED`에도 동일하게 `fallbackTier = max(1, fallbackTier - 1)` 적용. 최대 강등 횟수는 `currentTier - 1`회 (Tier 1 하한). Tier 1에서도 연속 실패 시 Round Escalation은 더 이상 개입하지 않으며, 이후 처리는 grid-explosion EC-6 책임.

---

**EC-RE-4 — 새 세션 시작 시 roundNumber 리셋 보장**

상황: Game Over 후 새 세션의 첫 `ROUND_STARTED`에서 `roundNumber`가 올바르게 1로 리셋되지 않을 경우.
처리: Round Manager가 `roundNumber` 리셋 책임을 소유한다 (RM-7). Round Escalation은 수신된 `roundNumber` 값을 신뢰하며 자체 리셋 추적을 하지 않는다. `roundNumber = 1` 수신 시 자동으로 Tier `{t1:100}`, `GATE_PERIOD = 2.0s` 반환.

---

**EC-RE-5 — seed = 0 또는 동일 seed 반복 공급**

상황: WebSocket 시스템이 동일 seed를 반복 공급 → `tier_roll` 매 라운드 동일 → 같은 Tier만 반복 선택.
처리: Round Escalation은 seed 유일성을 보장하지 않는다 — WebSocket 네트워킹 시스템의 책임. Tier 반복 발생 시 Pattern Library의 `N_recent` 반복 방지 로직이 패턴 반복을 완화한다. seed 유일성 요건은 OQ에 기록.

---

**EC-RE-6 — ESCALATION_COMPUTED가 Pattern Library 선택 이후 도착 (이벤트 순서 위반)**

상황: 이벤트 버스 딜레이로 `ROUND_STARTED` → Pattern Library 선택 → `ESCALATION_COMPUTED` 순서로 처리.
처리: 허용하지 않는다. `ROUND_STARTED` 핸들러 내에서 Round Escalation 계산이 동기적으로 완료되고 `EscalationContext`가 즉시 사용 가능해야 한다 (RE-1). Pattern Library는 `EscalationContext` 수신을 선행 조건으로 확인 후 선택 시작.

## Dependencies

### 업스트림 의존

| 시스템 | 의존 내용 | 상태 |
|--------|----------|------|
| `round-manager` | `ROUND_STARTED` 이벤트, `roundNumber` | ✅ Draft |
| `pattern-library` | Tier 1/2/3 정의, `N_recent` 공식, `GRID_STALLED` 이벤트 | ✅ Draft |
| `grid-explosion` | `GATE_PERIOD_BASE = 2.0s`, `T_EX = 0.35s`, `SAFE_WIN_MIN` 계약 | ✅ Draft |
| WebSocket 네트워킹 | 라운드 시드 공급 (`seed`) | ⚠️ 미작성 |

### 다운스트림 의존

| 시스템 | 소비 내용 | 상태 |
|--------|----------|------|
| `pattern-library` | `EscalationContext.tier`, `roundNumber` | ✅ Draft |
| `grid-explosion` | `EscalationContext.gatePeriod` | ✅ Draft |
| `HUD` | `roundNumber`, `tier` (디버그) | ⚠️ 미작성 |

### 양방향 계약 요약

- `round-manager` → round-escalation: `roundNumber`를 `ROUND_STARTED` 페이로드에 포함해야 함.
- round-escalation → `pattern-library`: `ESCALATION_COMPUTED`가 `ROUND_STARTED` 직후, 패턴 선택 전에 발행되어야 함 (순서 계약).
- round-escalation → `grid-explosion`: `gatePeriod` 값이 `GATE_PERIOD_FLOOR` 이상임을 보장. grid-explosion은 이 값을 이번 라운드 `GATE_PERIOD`로 덮어씀.

## Tuning Knobs

| 변수 | 기본값 | 안전 범위 | 영향 게임플레이 |
|------|--------|----------|----------------|
| `GATE_PERIOD_STEP` | 0.05s | 0.03–0.08s | 속도 상승 속도. 높을수록 조기에 최고속 도달. 0.08s 이상 시 R8에서 속도 고정 — 세션 후반 속도 에스컬레이션 없음. |
| `GATE_PERIOD_FLOOR` | 1.4s | 1.2–1.6s | 최고 난이도 속도. **1.2s 미만 설정 금지** (`SAFE_WIN_MIN` 위반). 1.6s 이상 시 최고 속도 너무 느려 긴장감 소실. |
| `ROUND_TIME_LIMIT_STEP` | 0 (비활성) | 0–3s/라운드 | 라운드당 타이머 감소. 기본 비활성. 플레이테스트에서 고라운드 클리어가 너무 쉽다면 활성화. |
| Tier 가중치 테이블 | (RE-2 참조) | — | 난이도 체감 곡선. R4–6 구간 T2 가중치 조정으로 "입문→중급 전환" 체감 조절. |

## Visual/Audio Requirements

### Visual

- **라운드 번호 표시**: 매 `ROUND_STARTED` 시 HUD에 현재 라운드 번호 업데이트.
- **Tier 전환 신호**: Tier가 처음 상승하는 라운드 진입 시 격자 전체 순간 펄스 — 0.2s. Tier 1→2: Danger Cyan `#00E5CC`. Tier 2→3: Toss Coral `#FF6B35`.
- **GATE_PERIOD 시각화**: 경고 깜빡임 지속 시간이 `gatePeriod`에 비례해 점진적으로 짧아진다 — 플레이어가 수치가 아닌 시각으로 속도 상승을 체감.

### Audio

| 이벤트 | 사운드 | 최대 길이 |
|--------|--------|---------|
| 첫 Tier 2 라운드 진입 | 긴장감 상승 스팅 | ≤0.5s |
| 첫 Tier 3 라운드 진입 | 강한 경고 스팅 | ≤0.5s |
| GATE_PERIOD 하한 도달 | 저음 드론 루프 시작 | 라운드 내내 |

## UI Requirements

- **라운드 카운터**: HUD 상단. `ROUND_STARTED` 시 즉시 갱신.
- **속도 시각 피드백**: 경고 셀 깜빡임 속도가 `gatePeriod` 값에 연동 — 별도 UI 없이 그리드 자체가 속도 표시.
- **디버그 오버레이** (개발 빌드 전용): 현재 `tier`, `gatePeriod`, `tierWeights` 수치 표시.
- **Tier 전환 알림**: 별도 팝업 없음. 격자 펄스만 사용 — "5분의 밀도" 원칙상 UI 인터럽트 금지.

## Acceptance Criteria

### BLOCKING (자동화 필수)

| ID | 조건 |
|----|------|
| AC-RE-01 | R1에서 `ESCALATION_COMPUTED.gatePeriod = 2.0s`, `tier = 1`. |
| AC-RE-02 | R13에서 `ESCALATION_COMPUTED.gatePeriod = 1.4s` (GATE_PERIOD_FLOOR). |
| AC-RE-03 | R20에서 `ESCALATION_COMPUTED.gatePeriod = 1.4s` (하한 고정 확인). |
| AC-RE-04 | `SAFE_WIN(R) = gatePeriod - 0.35 ≥ 0.45s` 모든 R에서 성립. |
| AC-RE-05 | R1–3에서 `tier = 1` 항상 (T1 가중치 100%). |
| AC-RE-06 | R15+에서 `tier = 3`이 1000회 시뮬레이션 기준 75–85% 범위로 선택됨. |
| AC-RE-07 | `GRID_STALLED` 수신 시 `fallbackTier = max(1, currentTier - 1)` 발행 확인. |
| AC-RE-08 | Tier 1에서 `GRID_STALLED` 수신 시 `tier = 1` 재발행 (강등 없음). |
| AC-RE-09 | `ESCALATION_COMPUTED`는 `ROUND_STARTED`와 동일 프레임 내 발행된다. |
| AC-RE-10 | 새 세션 첫 `ROUND_STARTED (roundNumber=1)` 시 `gatePeriod = 2.0s`, `tier = 1`. |
| AC-RE-11 | `tierWeights.t1 + tierWeights.t2 + tierWeights.t3 = 100` 모든 라운드에서 성립. |
| AC-RE-12 | 동일 seed + 동일 roundNumber → 항상 동일한 `tier` 반환 (결정론적). |

### ADVISORY (수동 검증)

| ID | 조건 |
|----|------|
| AC-RE-13 | Tier 상승 라운드에서 격자 펄스 시각 효과가 명확히 인지된다. |
| AC-RE-14 | R10에서 체감 속도가 R1 대비 빠르게 느껴진다 (플레이테스트). |
| AC-RE-15 | GATE_PERIOD 하한 도달 후에도 Tier 상승으로 체감 난이도가 계속 증가한다 (플레이테스트). |

## Open Questions

**OQ-RE-1** — Tier 가중치 테이블 기준점 실기기 검증
R4–6 구간의 T2 30% 가중치가 "서서히 어려워지는 느낌"을 주는지, R6→R7 전환(T2 30%→70%)이 체감 난이도 절벽을 만드는지 첫 플레이테스트 시 즉시 검증.
**우선순위: 높음**

**OQ-RE-2** — seed 유일성 보장 계약
WebSocket 네트워킹 시스템이 라운드마다 고유 seed를 공급한다는 공식 계약 문서화 필요. WebSocket GDD 작성 시 이 요건 포함.
**우선순위: 높음** — 멀티플레이어 구현 전 확정.

**OQ-RE-3** — GATE_PERIOD_STEP 기본값 검증
0.05s/라운드가 5분 세션에서 체감되는지 검증. 세션 내 최고 라운드 중앙값이 R5–7이라면 속도 에스컬레이션 대부분이 체감되지 않을 수 있음.
**우선순위: 중간** — 플레이테스트 후 조정.

**OQ-RE-4** — 고라운드 (R20+) 패턴 다양성 소진
Tier 3 패턴 5개, `N_recent = 2`로 R20+에서 3개씩 순환. MVP 패턴 수(20개)로 고라운드 반복성이 허용 가능한지, Tier 3 패턴 추가가 필요한지 Vertical Slice 단계에서 결정.
**우선순위: 낮음**
