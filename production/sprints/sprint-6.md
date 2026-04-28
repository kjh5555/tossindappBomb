# Sprint 6 — 2026-06-18 to 2026-07-01

## Sprint Goal

멀티플레이어 매치메이킹 + 실제 오디오 시스템 → Production → Polish 게이트의 마지막 블로커(MVP systems incomplete: Matchmaking, real Audio) 해소. Sprint 7에서 게이트 재시도 가능 상태 도달.

## Capacity

| 항목 | 값 |
|------|-----|
| 총 일수 | 10 working days (2026-06-18 ~ 2026-07-01) |
| 버퍼 (20%) | 2 days |
| 가용 일수 | **8 days** |
| 개발자 | 1 (solo) |
| Sprint 5 처리량 | ~7 days (S5-M1~M5 + S5-S1 + S5-S3 = 7 stories, 55 new tests) |

---

## Tasks

### Must Have (Critical Path — Multiplayer + Audio)

| ID | Task | Story File | Est. Days | Dependencies | Acceptance Criteria |
|----|------|-----------|-----------|-------------|-------------------|
| S6-M1 | Matchmaking EPIC + 스토리 생성 (`/create-epics matchmaking` → `/create-stories matchmaking`) | `production/epics/matchmaking/EPIC.md` | 0.5 | ADR-0014 Accepted ✅ | EPIC.md + story-001~N 파일 생성; `/story-readiness` PASS |
| S6-M2 | Matchmaking story-001: AUTH + connect | `production/epics/matchmaking/story-001-auth.md` | 1.0 | S6-M1, WebSocketClient ✅, TossBridge ✅ | TR-matchmaking-002 (AUTH 메시지 발행); WebSocket 연결 후 `bridge.getUserToken()` → AUTH 전송; 통합 테스트 통과 (MockWebSocketClient 사용) |
| S6-M3 | Matchmaking story-002: MATCH_READY 처리 | `production/epics/matchmaking/story-002-match-ready.md` | 1.0 | S6-M2 | TR-matchmaking-001 (MATCH_READY 수신 → SessionFlow.startMatch + RoundManager init); `totalPlayers` 정확히 전달; 통합 테스트 |
| S6-M4 | Matchmaking story-003: degenerate match (2-5인) + 연결 끊김 | `production/epics/matchmaking/story-003-degenerate-disconnect.md` | 1.0 | S6-M3 | TR-matchmaking-003 (2-5인 매치 허용, ADR-0014 OQ-5 결정 반영); 매치 중 disconnect → 스펙테이터 처리 |
| S6-M5 | CocosAudioOutput — AudioStub 교체 | `src/presentation/audio/CocosAudioOutput.ts` | 1.0 | S5-S1 ✅ (AudioStub) | ADR-0016 § 2: BGM/SFX/UIFeedback 3채널 cc.AudioSource; 채널별 볼륨 독립 제어; AUDIO_EVENT 라우팅; 단위 테스트 통과 |
| S6-M6 | 멀티플레이어 playtest 1 세션 | `production/playtests/playtest-sprint-6-multiplayer.md` | 0.5 | S6-M3 + S6-M5 | 2-3인 매치로 1세션 진행; 동기화 정확성, 매치 시작 흐름, 사망/부활 검증 |

**Must Have 소계**: 5.0 days

---

### Should Have

| ID | Task | Story File | Est. Days | Dependencies | Acceptance Criteria |
|----|------|-----------|-----------|-------------|-------------------|
| S6-S1 | Pause menu + Settings 화면 (UX 스펙 + 구현) | `design/ux/pause.md`, `design/ux/settings.md`, `src/presentation/hud/PauseOverlay.ts` | 1.5 | S5-M5 (UX 패턴) ✅ | UX 스펙 작성; 일시정지 → 게임 일시정지 → 재개 또는 종료; Settings에서 볼륨 + reduced-motion 토글 |
| S6-S2 | TouchInput EPIC ADR 작성 + 스토리 생성 | `docs/architecture/adr-0017-touch-input.md` (이미 존재? 검증 필요), `production/epics/touchinput/EPIC.md` | 1.0 | None | ADR 검증/작성; TouchInput Foundation epic 생성 (현재 epics index "Blocked"); 스토리 분해 |
| S6-S3 | Sprint 5 carryover playtest 분석 + difficulty-curve.md 개정 | `design/difficulty-curve.md` 업데이트 | 0.5 | Sprint 5 S5-M6 데이터 필요 | 라운드 5/10/15 실측 데이터 반영; § 한계 항목 업데이트; 다음 sprint tuning 결정 근거 |

**Should Have 소계**: 3.0 days

---

### Nice to Have

| ID | Task | Story File | Est. Days | Dependencies | Acceptance Criteria |
|----|------|-----------|-----------|-------------|-------------------|
| S6-N1 | Death Replay 시스템 (FairFeedback) — ADR-0015 구현 시작 | `production/epics/fairfeedback/EPIC.md` + story-001 | 1.0 | ADR-0015 Accepted ✅ | FairFeedback epic 생성; 사망 셀 강조 펄스 + tap-to-skip; 통합 테스트 1건 |
| S6-N2 | Toss 인토스 실기기 빌드 + 배포 검증 | `production/qa/evidence/toss-deploy-2026-XX.md` | 0.5 | Toss 인토스 SDK 환경 | `ait deploy` 또는 동등 명령으로 빌드 → 토스 샌드박스 앱 검증 |

**Nice to Have 소계**: 1.5 days

---

**총계: 9.5 days** — Sprint 5 처리량 기준 달성 가능 (8일 가용 + 2일 버퍼)

---

## Carryover from Sprint 5

| Task | 사유 | 처리 |
|------|------|------|
| S5-M6: 3 internal playtest sessions | 인원 의존 | **Sprint 6 시작 전 실행** — Sprint 6 work는 playable build 검증 후 시작 |
| S5-S2: PatternLibrary playtest | 인원 의존 | 동일 — Sprint 6 시작 전 |
| S5-N1: GAP-05 device smoke | 기기 의존 | S6-N2와 통합 |
| S5-N2: difficulty-curve revision | S5-M6 데이터 의존 | **S6-S3로 carryover** |

> ⚠️ **선결 조건**: Sprint 5 carryover playtest (S5-M6, S5-S2)이 Sprint 6 Day 1 전에 실행되어야 함. 미실행 시 S6-S3 carryover도 차단되고, Sprint 7 게이트 통과 자체가 불가능.

---

## Risks

| ID | 위험 | 확률 | 영향 | 완화 |
|----|------|------|------|------|
| R-01 | 서버 구현 부재 — Matchmaking 클라이언트만 구현해서는 통합 테스트가 MockWebSocketClient 한정 | HIGH | HIGH | Sprint 6 범위에서 서버 구현 OR 모의 서버 (간단한 Node.js FIFO 서버)도 포함 검토. 미구현 시 Sprint 7로 분리 |
| R-02 | Cocos AudioSource 3.8.6 webview 호환성 | MEDIUM | MEDIUM | ADR-0016 Verification Required 항목 — 실기기 검증 우선; 실패 시 silent fallback 유지 |
| R-03 | TouchInput ADR 부재 | MEDIUM | LOW | S6-S2에서 ADR 작성. 구현은 Sprint 7로 미룸 가능 |
| R-04 | playtest 인원 미확보 시 Sprint 6 closer 불가 | MEDIUM | HIGH | 가족/지인 1인 + 본인 self-test 2회로 대체. 외부 인원 미확보 시 솔로 평가로 진행 |
| R-05 | `cc.Game.EVENT_HIDE` webview 미발생 시 BGM 백그라운드 재생 | LOW | LOW | ADR-0016 알려진 한계. MVP 허용. Sprint 7+ 폴리시 |

---

## Dependencies on External Factors

- **Sprint 5 carryover playtest 실행** — S5-M6, S5-S2 (Sprint 6 시작 전 필수)
- 멀티플레이어 서버 구현 또는 모의 서버 (R-01)
- Toss 인토스 실기기 (S6-N2, S5-N1 carryover)
- 외부 playtest 인원 1명+ (S6-M6)

---

## Definition of Done for Sprint 6

- [ ] All Must Have tasks completed (S6-M1 ~ S6-M6)
- [ ] Matchmaking integration tests 통과 (MockWebSocketClient 기반)
- [ ] CocosAudioOutput로 AudioStub 교체됨 — 모든 AUDIO_EVENT가 실제 오디오 채널로 라우팅
- [ ] 멀티플레이어 playtest 1세션 documented (production/playtests/)
- [ ] QA plan exists (`production/qa/qa-plan-sprint-6.md`)
- [ ] Smoke check passed
- [ ] QA sign-off APPROVED or APPROVED WITH CONDITIONS
- [ ] No S1/S2 bugs
- [ ] **After Sprint 6**: 모든 5개 prior gate blockers 해소 → Sprint 7에서 `/gate-check production` 재실행 가능

---

## Sprint 7 Pre-View (Polish gate retry)

Sprint 7 진입 시 예상 작업:
- `/smoke-check sprint` (Sprint 6 close-out)
- `/team-qa sprint`
- `/gate-check production` — Production → Polish 전환 시도
- 통과 시 stage.txt → "Polish"; 실패 시 잔여 블로커 해소 후 재시도

Sprint 7 자체 작업은 게이트 통과 후 결정. 후보:
- FairFeedback (Death Replay) 본격 구현
- Difficulty curve playtest 데이터 기반 tuning
- 모바일 webview 성능 최적화 (draw call, 메모리)
- Onboarding tutorial (신규 플레이어 학습 지원)

---

## QA Plan

> ⚠️ **Sprint 6 시작 전 준비물**:
> 1. Sprint 5 carryover playtest 데이터 수집 완료 (S5-M6, S5-S2)
> 2. `/qa-plan sprint` 실행 — Sprint 6 stories 기반 test case 생성
> 3. (선택) 멀티플레이어 서버 구현 결정 — 클라이언트 단독 vs. 풀스택 vs. 모의 서버

QA plan은 Sprint 6 Day 1 시작 전 필수.
