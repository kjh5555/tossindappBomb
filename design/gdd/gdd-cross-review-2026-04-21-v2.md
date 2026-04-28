# Cross-GDD Review Report (v2 — Re-Review)

**Date**: 2026-04-21
**Mode**: `since-last-review`
**Predecessor**: `gdd-cross-review-2026-04-21.md` (v1, NEEDS REVISION)
**Verdict**: 🟢 **PASS with CONCERNS**

---

## Scope

In-scope GDDs (modified since v1 review):
- `design/gdd/game-concept.md` — B-2 Cycle-Revive 명확화
- `design/gdd/grid-explosion.md` — B-1/B-3/B-5/W-1 반영
- `design/gdd/pattern-library.md` — B-6 Player Fantasy 작성
- `design/gdd/player-movement.md` — PLAYER_ARRIVED 추가, CellCoord 적용
- `design/gdd/fair-feedback.md` — W-5 CellCoord 타입 통일
- `design/gdd/round-manager.md` — B-2/B-3/W-6/W-8 반영
- `design/gdd/round-escalation.md` — 참조 검증 (변경 없음)

Registry baseline: `design/registry/entities.yaml` (CellCoord, ExplodePattern, PLAYER_KILLED, PLAYER_ARRIVED, SAFE_WIN_MIN 등록됨)

---

## Verdict Summary

| 항목 | v1 상태 | v2 재검토 결과 |
|------|---------|---------------|
| **Blockers** | 🔴 6건 | ✅ 6건 모두 해소 |
| **Warnings (해소 대상)** | 🟡 7건 | ✅ W-1/W-2/W-4/W-5/W-6/W-8/W-11 해소 |
| **Warnings (유보)** | — | ⏳ W-3/W-7/W-9/W-10 (비차단, 후속 단계 처리) |
| **Architecture 진입** | 차단 | ✅ 해제 |

---

## Phase 2: Cross-GDD Consistency (재검증)

### 2a: Dependency Bidirectionality

| 계약 | 방향 | 상태 |
|------|------|------|
| `PLAYER_ARRIVED` | player-movement 발행 ↔ round-manager 수신 | ✅ 양측 등록 (player-movement Interactions + Downstream + AC-PM-18b / round-manager Interactions + EC-RM-2 + Dependencies) |
| `PLAYER_KILLED` | grid-explosion 발행 ↔ player-movement/fair-feedback 수신 | ✅ `playerIds[]` 배열 스키마 양측 일치 |
| `setGatePeriod(s)` | round-escalation 호출 ↔ grid-explosion 제공 | ✅ grid-explosion A-8 정의, round-escalation F-RE-1 사용, safe range `[1.4, 2.0]` 명시 |
| `GRID_STALLED` 3자 체인 | pattern-library 발행 → round-escalation 강등 → pattern-library 재시도 → grid-explosion 스킵 | ✅ round-manager EC-RM-5b가 canonical 기술 |
| `nextExplosionTime(cell)` | grid-explosion 제공 ↔ round-manager 소비 | ✅ `CellCoord` 입력 타입 양측 일치 |
| `GOAL_PLACED` | round-manager 발행 → HUD 소비 | ✅ round-manager 발행, HUD 수신자 명시 |

결과: **비대칭 없음.** 모든 단방향 의존성이 양쪽 문서에서 확인됨.

### 2b: Rule Contradictions

| 검사 항목 | 결과 |
|----------|------|
| 생존 모델 (game-concept ↔ round-manager ↔ 나머지) | ✅ Cycle-Revive로 통일 (game-concept L66 / round-manager 명시) |
| Goal Cell 도달 vs 폭발 (round-manager EC-RM-2) | ✅ "arrival→explosion 순서" 한 문장으로 해소 — Goal Cell 한정 |
| Gate 모델 (Cyclic v4) | ✅ Idle↔Exploded 2-state, Warning/Imminent 잔재 제거 (grid-explosion 전문 확인) |
| Tier 강등 (round-escalation EC-RE-2/3 ↔ round-manager EC-RM-5b) | ✅ `max(1, currentTier-1)` 양측 일치 |

결과: **규칙 모순 없음.**

### 2c: Stale References

grep 결과:
- `Cell[]` 잔재: v1 리포트 본문 및 round-manager OQ-RM-2 취소선(resolved 마킹) 외에 **없음**
- `cellIndex` 잔재: 직렬화 용도의 의도적 참조만 존재 (registry에 "serialization only" 명시)
- `Warning`/`Imminent` 잔재: grid-explosion에서 완전 삭제 확인

결과: **stale reference 없음.**

### 2d: Data/Tuning Knob Ownership

| 데이터/상수 | 소유자 | 중복 소유 여부 |
|------------|--------|---------------|
| `GATE_PERIOD_BASE/FLOOR/STEP` | grid-explosion | ✅ 단일 소유 |
| `T_EX` | grid-explosion | ✅ 단일 소유 |
| `MIN_SAFE_CELLS` | pattern-library | ✅ 단일 소유 |
| `SAFE_WIN_MIN` | grid-explosion (계약) → round-escalation/pattern-library 소비 | ✅ 단일 소유, registry 등록 |
| `MAX_RETRY_COUNT` | pattern-library | ✅ 단일 소유 |
| 튜닝 놉 `CellCoord/ExplodePattern/PLAYER_*` 타입 정의 | registry (entities.yaml) | ✅ canonical |

결과: **ownership 충돌 없음.**

### 2e: Formula Compatibility

- `nextExplosionTime(cell): number | null` 출력 → round-manager F-RM-1 입력: `GATE_PERIOD`와 동일 단위(초)로 비교, 타입 일치 ✅
- `setGatePeriod(s)` 입력 [1.4, 2.0] → round-escalation F-RE-1 출력 범위 동일 ✅
- `ExplodePattern.cells: CellCoord[]` → grid-explosion 입력 스키마와 일치 ✅

결과: **formula/range 불일치 없음.**

### 2f: Acceptance Criteria Cross-Check

| AC 쌍 | 결과 |
|------|------|
| AC-PM-18b (PLAYER_ARRIVED 발행) vs AC-RM-12 (Goal Cell 도달) | ✅ 같은 이벤트를 기대, 모순 없음 |
| AC-RE-07/08 (Tier 강등) vs round-manager EC-RM-5b | ✅ 같은 로직을 서로 다른 각도에서 검증 |
| AC-12 (GRID_STALLED 타임아웃) vs AC-PL-8 (3회 실패 발행) | ✅ 서로 다른 트리거(타임아웃 vs 재시도 실패), 의도적 이중 가드 |

결과: **AC 모순 없음.**

---

## Phase 3: Game Design Holism (재검증)

### 3a: Progression Loop Competition
해당 없음 — 본 게임은 5분 세션 아케이드 구조로 progression loop 1개(라운드 에스컬레이션)만 존재. ✅

### 3b: Player Attention Budget
v1에서 W-9로 플래그됨 (후반 5 active). **유보됨** — 플레이테스트 전 재평가 필요. v2 재검토에서는 GDD 텍스트만으로 단정 불가, 비차단.

### 3c: Dominant Strategy Detection
W-10 2인 매치 코너 카밍 위험 — **유보됨** (저인원 매치 설계 공백, 플레이테스트 전 처리).

### 3d: Economic Loop Analysis
리소스 경제 없음 (세션 단위 완결형). ✅

### 3e: Difficulty Curve Consistency
- round-escalation Tier 분포 (R1–R3 T1 70% → R15+ T3 80%) ↔ grid-explosion `setGatePeriod` (R1 2.0s → R15+ 1.4s) 동반 하강. 스케일링 방향 일치. ✅
- 주의: T3 패턴 5개 실디자인 부재(W-7) — 후반 난이도 천장 검증은 Vertical Slice에서 수행.

### 3f: Pillar Alignment
재검토 대상 GDD 전원이 최소 1개 이상의 pillar를 명시적으로 참조:

| GDD | 주 pillar |
|-----|----------|
| grid-explosion | 공정한 죽음, 5분의 밀도 |
| pattern-library | 읽으면 이긴다 |
| player-movement | 공정한 죽음 |
| fair-feedback | 공정한 죽음 |
| round-manager | 5분의 밀도 |
| round-escalation | 5분의 밀도, 읽으면 이긴다 |
| game-concept | 4 pillars 전체 |

Anti-pillar 위반 없음. ✅

### 3g: Player Fantasy Coherence
- grid-explosion: "빛은 위험이다" (환경 공포)
- pattern-library: "리듬이 형상으로 드러난다" (독해의 보상) — B-6 해소본
- player-movement: "의도와 실행의 간극" (정확성)
- fair-feedback: "억울하지 않은 패배" (투명성)

네 fantasy가 상호 보강 관계. 식별된 충돌 없음. ✅

---

## Phase 4: Cross-System Scenario Walkthrough

### 시나리오 A — 라운드 마지막 프레임, 생존자 Goal Cell 도달과 폭발이 동시

1. Trigger: `PLAYER_ARRIVED { cell = goalCell }` + `nextExplosionTime(goalCell) = 0` 같은 프레임
2. round-manager: **EC-RM-2** — 도달 우선 처리 → `ROUND_CLEAR` 발행, 해당 폭발 판정 무시
3. grid-explosion: 다음 라운드까지 해당 셀 폭발 suppress 필요? → 라운드 경계에서 gate 상태 리셋되므로 무관
4. 실패 모드 없음. ✅

### 시나리오 B — Tier 1 패턴 전부 실패 (GRID_STALLED 극단 케이스)

1. pattern-library: 3회 연속 `PATTERN_REJECTED` → `GRID_STALLED` 발행
2. round-escalation: `max(1, 1-1) = 1` 강등 불가 → stalledFallback으로 동일 Tier 재발행 (AC-RE-08)
3. pattern-library: 동일 Tier 재시도 실패
4. grid-explosion: 라운드 스킵, 빈 패턴 처리 (round-manager는 다음 ROUND_STARTED 대기)

결과: Undefined behavior 없음. round-manager EC-RM-5b가 6단계 전체 명시. ✅

### 시나리오 C — 전원 사망 동시 발생 (game-concept Cycle-Revive)

1. grid-explosion: `PLAYER_KILLED { playerIds: [allAliveIds] }` 발행
2. round-manager: aliveCount = 0 감지 → `GAME_OVER` 발행
3. fair-feedback: 모든 죽음에 대한 리플레이 overlay 소비

결과: Cycle-Revive 모델 (라운드 내 탈락 한정) 유지, 세션 종료로 귀결. ✅

### 시나리오 D — PLAYER_ARRIVED 타이밍 (t=0 vs t=0.1s)

1. player-movement: t=0 `PLAYER_MOVED` 발행 (논리 좌표 변경, grid-explosion 조회용)
2. t=0.1s 트윈 완료: `PLAYER_ARRIVED` 발행 (round-manager Goal Cell 판정용)
3. 그 사이 폭발이 일어나면? → `getCellState` 동기 조회는 t=0 기준이므로 이동 중 사망 판정 가능 (grid-explosion EC-2 이동-우선 순서)

경계: `PLAYER_ARRIVED`가 Goal Cell에 떨어지기 직전에 해당 셀이 폭발하는 케이스 → EC-RM-2는 "도달 시점"을 기준으로 판정하므로, `PLAYER_ARRIVED` 발행 시점에 `getCellState(goalCell) === Exploded`이면 ROUND_CLEAR가 아님. 본 규칙은 round-manager가 명시.

결과: 모호성 없음. ✅

---

## Cross-System Scenario Issues

없음.

---

## Consistency Issues

### Blocking
없음.

### Warnings (유보 — 비차단)

| ID | 이슈 | 처리 시점 |
|----|------|----------|
| W-3 | BFS 이중 검증 구현 분리 (빌드타임/런타임) | 구현 단계 (Architecture + 코드화) |
| W-7 | T3 패턴 5개 실디자인 부재 | Vertical Slice 단계 |
| W-9 | 후반 동시 활성 시스템 5개 (spectator-cheer 포함) | 플레이테스트 전 |
| W-10 | 2인 매치 degenerate 전략 (코너 카밍) | 플레이테스트 전 |

모두 GDD 작성만으로는 최종 해소 불가한 항목. Architecture 진입은 차단하지 않음.

### Info
- Registry `SAFE_WIN_MIN` 등록은 이번 세션에서 추가됨. 다른 GDD에서 해당 상수 참조 시 registry를 단일 기준으로 사용할 것.

---

## Design Theory Issues

### Blocking
없음.

### Warnings
W-9 (Attention Budget), W-10 (Dominant Strategy) — 위 Consistency Warnings와 중복. 플레이테스트 데이터 없이는 해소 판단 불가.

---

## Resolution Confirmation (v1 대비)

| # | 블로커 | 근거 파일 / 위치 |
|---|--------|-----------------|
| B-1 | grid-explosion Warning/Imminent 잔재 | grid-explosion 전문 grep: 잔재 없음. A-8 `setGatePeriod` 추가됨. |
| B-2 | 생존 모델 불일치 | game-concept.md:66 Cycle-Revive 명시 |
| B-3 | round-manager 미정의 API | round-manager `PLAYER_ARRIVED`/`nextExplosionTime` 정의, `GOAL_PLACED` → HUD |
| B-4 | 좌표 체계 혼재 | `CellCoord` 전 GDD 통일, registry `types:` 섹션 등록 |
| B-5 | `GATE_PERIOD` override 미수용 | grid-explosion A-8 safe range [1.4, 2.0] 명시 |
| B-6 | pattern-library Player Fantasy 공란 | pattern-library.md "리듬이 형상으로 드러난다" 작성됨 (creative-director authored) |

---

## Recommendation

**Architecture 진입 허가 (`/create-architecture`).**

유보된 W-3/W-7/W-9/W-10은 Architecture 이후 단계(구현, Vertical Slice, 플레이테스트)에서 정상 처리되는 성격의 항목이다. 현 시점에서 GDD 레이어의 consistency와 holism은 모두 확보되었다.

다음 단계에서 생성될 ADR은 본 리포트의 "양방향 계약" 섹션을 실제 인터페이스로 구체화해야 한다 (`PLAYER_ARRIVED`, `setGatePeriod`, `nextExplosionTime`, `GRID_STALLED` 3자 체인, `CellCoord` 스키마).
