# Sprint 4 — 2026-05-21 to 2026-06-03

## Sprint Goal

RoundManager 구현 + 최소 SessionFlow → 단일 플레이어가 라운드 시작부터 Game Over / Round Clear까지 로컬에서 플레이 가능한 수직 슬라이스 완성. 게이트 체크 블로커 해소를 위한 디자인 아티팩트(difficulty-curve, accessibility) 병행 작성.

## Capacity

| 항목 | 값 |
|------|-----|
| 총 일수 | 10 working days (2026-05-21 ~ 2026-06-03) |
| 버퍼 (20%) | 2 days — 언플랜드 작업 예비 |
| 가용 일수 | **8 days** |
| 개발자 | 1 (solo) |
| Sprint 3 실제 처리량 | ~8.25 days (M1-M5 + S1-S2 모두 완료) |

---

## Tasks

### Must Have (Critical Path)

| ID | Task | Story File | Est. Days | Dependencies | Acceptance Criteria |
|----|------|------------|-----------|-------------|-------------------|
| S4-M1 | RoundManager EPIC 생성 + 스토리 생성 (`/create-epics roundmanager` → `/create-stories roundmanager`) | `production/epics/roundmanager/EPIC.md` | 0.5 | ADR-0011 Accepted ✅ | EPIC.md + story-001~N 파일 생성됨; ADR-0011(Round Phase FSM) 연결됨; `/story-readiness` PASS |
| S4-M2 | RoundManager story-001: 라운드 라이프사이클 + Goal Cell 배치 | `production/epics/roundmanager/story-001-*.md` | 1.5 | S4-M1 | ROUND_STARTED 수신 → Goal Cell 배치 (RM-1, RM-2); N-1이 첫 GATE_PERIOD 내 폭발 예정 → N-2 배치; GOAL_PLACED 발행; 단위 테스트 통과 |
| S4-M3 | RoundManager story-002: 플레이어 상태 추적 + 라운드 종료 조건 | `production/epics/roundmanager/story-002-*.md` | 1.5 | S4-M2 | PLAYER_KILLED → SPECTATOR 전환; 생존자 Goal Cell 도달 → ROUND_CLEAR → 전원 ALIVE 마킹 → 1500ms 후 ROUND_END (RM-3, RM-4); 전원 사망 → GAME_OVER (RM-5); 통합 테스트 통과 |
| S4-M4 | `design/difficulty-curve.md` 작성 | `design/difficulty-curve.md` | 0.5 | Sprint 3 playtest 데이터 없음 — 설계 기반 초안 작성 | Pillar 2 난이도 곡선 문서 존재; RoundEscalation 공식과 연결됨; 라운드별 기대 난이도 표 포함; QA 검증 기준 포함 |

**Must Have 소계**: 4.0 days

---

### Should Have

| ID | Task | Story File | Est. Days | Dependencies | Acceptance Criteria |
|----|------|------------|-----------|-------------|-------------------|
| S4-S1 | QA Advisory GAP-02 / GAP-03 / GAP-04 해소 | 기존 story 파일들 | 1.0 | S4-M3 | GAP-02: GridExplosion.onRoundEnd → `onPlayerKilled(PlayerId[])` wiring 통합 테스트 신규 작성 + 통과; GAP-03: IFrameClock.cancelSchedule fn-reference 계약 검증 (RoundManager 구현 중 확인); GAP-04: AC-PM-13 (EXPLODED 셀 착지) — GridSimulation 실제 인스턴스 사용 통합 테스트 작성 + 통과 |
| S4-S2 | 최소 SessionFlow 스텁 | `production/epics/` (신규 또는 기존 epic 추가) | 1.0 | S4-M3 | 단일 플레이어: 게임 시작 → 매치(RoundManager 활성) → 결과(ROUND_CLEAR 또는 GAME_OVER) → 재시작 상태 전환; 코드로 실행 가능 (UI 불필요, 로직만); 단위/통합 테스트 통과 |
| S4-S3 | `design/accessibility-requirements.md` 작성 | `design/accessibility-requirements.md` | 0.5 | — | 접근성 티어 선택됨; `prefers-reduced-motion` 정책 모든 펄싱 요소에 적용됨; 터치 타깃 최소 크기 명시됨; 화면 리더 범위 결정됨 (v1 scope in/out 명시) |

**Should Have 소계**: 2.5 days

---

### Nice to Have

| ID | Task | Story File | Est. Days | Dependencies | Acceptance Criteria |
|----|------|------------|-----------|-------------|-------------------|
| S4-N1 | `design/ux/` 스크린 스펙 작성 — Lobby + Result (`/ux-design lobby`, `/ux-design result`) | `design/ux/lobby.md`, `design/ux/result.md` | 1.0 | S4-M3 | 각 스크린 UX 스펙 존재; art-bible Section 7 + 3.4 시각 계층 규칙과 일치; 터치 영역 명시됨 |
| S4-N2 | GAP-05: TouchInput → PlayerMovement 파이프라인 실기기 수동 스모크 테스트 | `production/qa/evidence/gap-05-device-smoke.md` | 0.25 | Toss 인토스 기기 필요 | 실기기에서 touch → PLAYER_MOVED 파이프라인 수동 확인; 결과 `production/qa/evidence/` 에 기록 |
| S4-N3 | PatternLibrary story-004: 플레이테스트 — 패턴 가독성 + 난이도 그래디언트 (S3-N1 이월) | `production/epics/patternlibrary/story-004-playtest.md` | 0.5 | S4-M2 이상 완료 후 플레이 가능 상태 | 패턴 가독성 주관적 플레이테스트 1세션 실시; 결과 `production/playtests/` 기록 |

**Nice to Have 소계**: 1.75 days

---

**총계: 8.25 days** — Sprint 3 실제 처리량 기준 달성 가능 (8일 가용 + 2일 버퍼)

---

## Carryover from Sprint 3

| Task | 사유 | 처리 |
|------|------|------|
| S3-N1: PatternLibrary story-004 playtest | 플레이 가능 상태 미완성 | S4-N3으로 이월 |
| S3-N2: RoundManager EPIC 생성 | ADR 검토 필요 → ADR-0011 확인됨 | S4-M1로 격상 |
| `design/ux/`, `design/accessibility-requirements.md` | Sprint 3 Presentation layer 진입 전 불필요 판단 | S4-N1, S4-S3으로 처리 |
| GAP-02, GAP-03, GAP-04 (QA advisory) | QA sign-off 이후 해소 권장 | S4-S1으로 처리 |

---

## Risks

| ID | 위험 | 확률 | 영향 | 완화 |
|----|------|------|------|------|
| R-01 | RoundManager story-001~002가 예상보다 복잡 (Goal Cell 타이밍 + 다중 플레이어 상태 동시 추적) | MEDIUM | MEDIUM | story-001에서 단일 플레이어 단순화 구현 먼저 → story-002에서 멀티 상태 추가 |
| R-02 | SessionFlow 스텁이 실제 UI 없이 테스트 가능한 수준으로 scope 정의 어려움 | MEDIUM | LOW | "코드로 실행 가능한 상태 기계"로 scope 고정 — Cocos 씬 전환 없음, 순수 TypeScript |
| R-03 | GAP-05 실기기 테스트 의존성 (기기 없으면 불가) | HIGH | LOW | S4-N2 Nice to Have로 분류됨 — 블로커 아님 |
| R-04 | `design/difficulty-curve.md` 플레이테스트 데이터 없이 설계만으로 작성 | LOW | MEDIUM | "초안" 명시, Sprint 5 플레이테스트 이후 개정 예정으로 표기 |
| R-05 | ADR-0011 (Round Phase FSM) 스토리 생성 시 PROPOSED 상태일 경우 S4-M1 차단 | LOW | HIGH | `/story-readiness` 실행 전 ADR-0011 상태 확인 필수 |

---

## Dependencies on External Factors

- **Toss 인토스 기기**: GAP-05(S4-N2) 실기기 스모크 테스트에 필요. Nice to Have이므로 Sprint 4 블로커 아님
- **ADR-0011 상태 확인**: RoundManager 스토리 생성 전 ADR-0011(Round Phase FSM)이 Accepted인지 확인 필요

---

## Definition of Done for Sprint 4

- [ ] S4-M1~M4 모두 완료 (Must Have)
- [ ] RoundManager story-001~002 테스트 파일 존재 및 통과
- [ ] 단일 플레이어가 코드 수준에서 라운드 시작 → 클리어/게임오버 전체 흐름 실행 가능
- [ ] `design/difficulty-curve.md` 존재 및 RoundEscalation 공식 연결됨
- [ ] `/story-done`으로 각 스토리 Status: Complete 마킹
- [ ] `production/sprint-status.yaml` 업데이트
- [ ] Smoke check 통과 (`/smoke-check sprint`)
- [ ] QA sign-off (`/team-qa sprint`)
- [ ] S1/S2 버그 없음

> **Sprint 4 완료 = "Make it playable"**: 이 sprint 이후 최소한 하나의 플레이어가 터미널/테스트 환경에서 전체 단일 플레이어 루프를 실행 가능해야 한다.
>
> **Sprint 5 목표**: 해당 루프로 3회 플레이테스트 세션 실시 → fun hypothesis 검증 → Production → Polish gate 재실행.
