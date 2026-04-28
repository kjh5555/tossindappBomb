# Sprint 5 — 2026-06-04 to 2026-06-17

## Sprint Goal

HUD 구현 + UX 스펙 + 3회 플레이테스트 → Production → Polish 게이트 블로커 3개 중 2개(playable build, playtest 0/3) 해소. Sprint 7 게이트 재시도 준비 단계.

## Capacity

| 항목 | 값 |
|------|-----|
| 총 일수 | 10 working days (2026-06-04 ~ 2026-06-17) |
| 버퍼 (20%) | 2 days — 언플랜드 작업 예비 |
| 가용 일수 | **8 days** |
| 개발자 | 1 (solo) |
| Sprint 4 실제 처리량 | ~9 days (M1-M4 + S1-S3 모두 done, ~10일 워크로드) |

---

## Tasks

### Must Have (Critical Path — Playtest enabler chain)

| ID | Task | Story File | Est. Days | Dependencies | Acceptance Criteria |
|----|------|-----------|-----------|-------------|-------------------|
| S5-M1 | HUD EPIC + 스토리 생성 (`/create-epics hud` → `/create-stories hud`) | `production/epics/hud/EPIC.md` | 0.5 | RoundManager done ✅ | EPIC.md + story-001~N 파일 생성; ADR 연결됨; `/story-readiness` PASS |
| S5-M2 | HUD story-001: Round state display (round#, alive count, timer) | `production/epics/hud/story-001-*.md` | 1.5 | S5-M1 | Cocos UI Label로 ROUND_STARTED, ALIVE_COUNT_CHANGED, ROUND_END 이벤트 시각 반영; 통합 테스트 또는 수동 evidence |
| S5-M3 | HUD story-002: Grid render + Goal cell highlight | `production/epics/hud/story-002-*.md` | 1.5 | S5-M2 | 8×8 grid 시각 렌더링; CELL_STATE_CHANGED → IDLE/EXPLODED 색상 토글; GOAL_PLACED → 골 셀 강조; 30+ FPS 유지 |
| S5-M4 | HUD story-003: Game Over / Round Clear overlay + Restart | `production/epics/hud/story-003-*.md` | 1.0 | S5-M3 | GAME_OVER/ROUND_CLEAR 수신 시 오버레이 노출; Restart 버튼 → SessionFlow.reset() 호출 |
| S5-M5 | `design/ux/lobby.md`, `design/ux/hud.md`, `design/ux/result.md` 작성 | 3 ux specs | 1.5 | S4-N1 carryover | 각 화면 터치 영역, 접근성 티어 적용, art-bible 시각 계층 일치; `/ux-review` PASS |
| S5-M6 | 3 internal playtest sessions documented | `production/playtests/playtest-*.md` | 1.0 | S5-M4 | 3 세션: (1) 신규 플레이어 온보딩, (2) 미드게임 패턴 가독성, (3) 라운드 5/10/15 난이도 곡선; 각 세션 30분+ |

**Must Have 소계**: 7.0 days

---

### Should Have

| ID | Task | Story File | Est. Days | Dependencies | Acceptance Criteria |
|----|------|-----------|-----------|-------------|-------------------|
| S5-S1 | Audio stub — 기본 SFX 훅 (EXPLOSION, GAME_OVER, ROUND_CLEAR) | `src/features/audio/AudioStub.ts` | 0.5 | None | AUDIO_EVENT 수신 시 콘솔 로그 또는 Cocos AudioEngine 호출; 누락된 sfx 파일은 silent fallback |
| S5-S2 | PatternLibrary story-004 playtest (S4-N3 carryover) | `production/epics/patternlibrary/story-004-playtest.md` | 0.5 | S5-M3 | 패턴 가독성 주관적 플레이테스트 1세션; `production/playtests/` 기록 |
| S5-S3 | `design/ux/interaction-patterns.md` — 패턴 라이브러리 초기화 | `design/ux/interaction-patterns.md` | 0.5 | S5-M5 | 터치 영역 최소 크기, 피드백 표준, 모달 패턴 명시 |

**Should Have 소계**: 1.5 days

---

### Nice to Have

| ID | Task | Story File | Est. Days | Dependencies | Acceptance Criteria |
|----|------|-----------|-----------|-------------|-------------------|
| S5-N1 | GAP-05 기기 스모크 (S4-N2 carryover) | `production/qa/evidence/gap-05-device-smoke.md` | 0.25 | Toss 인토스 기기 필요 | 실기기에서 touch → PLAYER_MOVED 파이프라인 수동 확인 |
| S5-N2 | difficulty-curve.md 플레이테스트 검증 + 개정 | `design/difficulty-curve.md` | 0.5 | S5-M6 | 라운드 5/10/15 실측 데이터 수집; 문서 § 한계 항목 업데이트 |

**Nice to Have 소계**: 0.75 days

---

**총계: 9.25 days** — Sprint 4 처리량(8.25+) 기준 달성 가능 (8일 가용 + 2일 버퍼)

---

## Carryover from Sprint 4

| Task | 사유 | 처리 |
|------|------|------|
| S4-N1: design/ux/ 스크린 스펙 (Lobby + Result) | Nice-to-Have, Sprint 4 미진행 | **S5-M5로 격상** (HUD 추가 포함) |
| S4-N2: GAP-05 기기 스모크 | 기기 의존 | S5-N1로 carryover |
| S4-N3: PatternLibrary story-004 playtest | 플레이 가능 빌드 의존 | S5-S2로 carryover (HUD 후 가능) |

---

## Risks

| ID | 위험 | 확률 | 영향 | 완화 |
|----|------|------|------|------|
| R-01 | HUD 첫 구현 — Cocos 씬 셋업 학습 곡선 | HIGH | MEDIUM | story-001을 단순 Label부터 시작 → 점진적 그리드 추가 |
| R-02 | 플레이테스트 인원 확보 (solo dev) | MEDIUM | HIGH | 가족/지인 1인 + 본인 self-test 2회로 대체 가능. 실패 시 S5-M6 → Sprint 6 carryover |
| R-03 | UX 스펙 3개 1.5일 (촉박) | MEDIUM | LOW | hud.md 우선, lobby/result 단순화 가능 |
| R-04 | Cocos 렌더링 성능 모바일 webview | MEDIUM | MEDIUM | 30fps 마지노선 합의 (60fps 목표 유지). 8×8 grid은 draw call ≤50 budget 내 |

---

## Dependencies on External Factors

- 플레이테스트 인원 1명 이상 확보 (S5-M6)
- Toss 인토스 기기 (S5-N1, optional)

---

## Definition of Done for this Sprint

- [ ] All Must Have tasks completed (S5-M1 ~ S5-M6)
- [ ] HUD epic stories 모두 Logic/Integration test 통과
- [ ] 3 playtest sessions documented in `production/playtests/`
- [ ] `design/ux/` 3 specs 존재 + `/ux-review` APPROVED
- [ ] QA plan exists (`production/qa/qa-plan-sprint-5.md`)
- [ ] Smoke check passed (`/smoke-check sprint`)
- [ ] QA sign-off APPROVED or APPROVED WITH CONDITIONS
- [ ] No S1/S2 bugs
- [ ] After Sprint 5: 3 of 5 prior gate blockers resolved → Sprint 6 (Multiplayer: WebSocket + Matchmaking) → Sprint 7 (Polish gate retry)

---

## QA Plan

> ⚠️ **No QA Plan Yet**: Run `/qa-plan sprint` before starting S5-M1 implementation. The Production → Polish gate requires a QA sign-off report, which requires a QA plan with test case requirements per story.
