# GRID REAPER — Contributor Handoff (2026-04-28 기준)

> **Status**: Sprint 4-6 자동화 작업 완료, Polish 게이트 진입 직전 단계.
> **다음 단계**: Sprint 7에서 Cocos 통합 + playtest 4세션 + 서버 → Polish 게이트 통과.
> **소요 추정**: Sprint 7 1 sprint (8-10일) 내 Polish 게이트 통과 가능.

본 문서는 신규 contributor가 본 프로젝트에 합류 시 **첫 30분에 읽어야 하는 단일 문서**입니다. 모든 컨텍스트가 다른 파일에 분산되어 있지만, 본 문서는 어디로 가야 하는지를 알려줍니다.

---

## 🎮 프로젝트 한 줄 요약

**GRID REAPER** — 토스 인토스 webview 6인 멀티플레이어 그리드 폭발 회피 게임. Cocos Creator 3.8.6 (TypeScript) 기반.

게임 컨셉: 8×8 그리드에서 매 라운드 폭발 패턴이 등장. 플레이어는 Direction8 입력으로 안전 셀 사이를 이동, Goal Cell에 먼저 도달하면 라운드 클리어. 라운드 진행 시 GATE_PERIOD가 짧아져 난이도 상승.

---

## 📊 현재 상태 한눈에

| 항목 | 값 |
|------|-----|
| **Stage** | Production (Polish 게이트 미통과) |
| **Test count** | 455 / 455 통과 (36 suites) |
| **Sprint 4** | ✅ 완료 (RoundManager 구현 + 디자인 아티팩트) |
| **Sprint 5** | 🟡 7/11 자동화 완료 (HUD epic, AudioStub, UX 스펙). 4 항목 humans/device 의존 |
| **Sprint 6** | 🟡 6/9 자동화 완료 (Matchmaking epic, MultichannelAudioOutput, Pause+Settings). 3 항목 humans/device/Cocos 의존 |
| **마지막 게이트 체크** | FAIL (`production/gate-checks/gate-production-to-polish-2026-04-27.md`) — 3/5 blocker 잔존 |
| **자동화 한도** | 도달함. 모든 추가 작업은 외부 자원 의존 |

---

## 🚀 Sprint 7 명확한 작업 순서

### Day 1-3: Cocos 통합 (TD-P0-01)

**참조**: `src/presentation/cocos/README.md` (5 wrapper 코드 + Editor binding 절차)

작성 대상:
1. `src/presentation/cocos/CocosLabel.ts` — `IHUDLabel` 구현 (cc.Label 래핑)
2. `src/presentation/cocos/CocosButton.ts` — `IButton` 구현 (cc.Button 래핑)
3. `src/presentation/cocos/CocosOverlayNode.ts` — `IOverlayNode` 구현 (cc.Node 래핑)
4. `src/presentation/audio/CocosAudioChannel.ts` — `IAudioChannel` 구현 (cc.AudioSource 래핑)
5. `src/presentation/cocos/SceneRoot.ts` — cc.Component composition root

각 wrapper는 1:1 mapping이라 30분 ~ 1시간 작업. 코드 예시는 README에 그대로 있음.

Cocos Editor 작업:
- HUDLayer 노드 + 3 cc.Label
- GridLayer 노드 + 64 cc.Sprite (8×8 grid, `cellToPixel` 적용)
- ResultOverlay + Button
- PauseOverlay + 5 Button
- 3 cc.AudioSource (BGM/SFX/UIFeedback)
- SceneRoot 컴포넌트 부착 + `@property` binding

**검증**: `src/presentation/cocos/README.md` § "통합 후 검증" 9개 항목 PASS

### Day 4-5: Playtest 3세션 (S5-M6) + 패턴 검증 (S5-S2)

**참조**: `production/playtests/playtest-sprint-5-*.md` 템플릿 4개

진행 절차:
1. `playtest-sprint-5-onboarding.md` — 신규 플레이어 1명, 60초 학습
2. `playtest-sprint-5-pattern-readability.md` — 동일 또는 다른 플레이어, 라운드 5+
3. `playtest-sprint-5-difficulty.md` — 베테랑 플레이어, 3+ 런 평균
4. `playtest-sprint-5-patternlibrary.md` — 디자이너 본인, 10+ 라운드

각 템플릿은 빈칸 채우기 형식. 끝나면 즉시 sign-off + verdict 결정.

### Day 6: 서버 + 멀티플레이어 (TD-P0-02)

**참조**: `docs/architecture/adr-0014-matchmaking.md` § Implementation Guidelines

작성 대상:
- `server/package.json` (별도 — `ws`, `@types/ws` 의존성)
- `server/src/Lobby.ts` — 단일 FIFO 큐, MIN_MATCH_SIZE=2 (env), MAX=6
- `server/src/AuthValidator.ts` — Toss 토큰 검증 (소프트런치는 stub 가능)
- `server/src/index.ts` — WebSocket 서버 부팅
- (선택) Jest 통합 테스트 with mock ws

또는 모의 서버: `MockWebSocketClient` 기반 시뮬레이션으로 S6-M6 검증 가능.

### Day 7: 게이트 통과

```bash
/smoke-check sprint    # 새 코드 + Cocos 통합 후 smoke check
/team-qa sprint        # QA cycle (전체 stories 검토)
/gate-check production # Production → Polish 게이트 시도
```

PASS 시 `production/stage.txt` → "Polish" 작성. 다음 Sprint은 폴리시 작업.

---

## 📚 30분 reading list (순서 중요)

| # | 파일 | 시간 | 무엇을 얻는가 |
|---|------|------|-------------|
| 1 | `production/session-state/active.md` | 5분 | 현재 진행 중인 작업 + 다음 단계 |
| 2 | `docs/tech-debt-register.md` | 8분 | 미해결 항목 + 우선순위 (P0/P1/P2) |
| 3 | `production/sprints/sprint-6.md` | 5분 | Sprint 6 plan + 진행 상태 |
| 4 | `docs/architecture/architecture.md` § 3.4 | 5분 | 정확한 시스템 init order (23 step) |
| 5 | `production/epics/index.md` | 3분 | 모든 에픽 완료/진행 상태 |
| 6 | `src/presentation/cocos/README.md` | 4분 | Sprint 7 Day 1-3 정확한 코드 |

---

## 🏗️ 시스템 아키텍처 한눈에

### 5 레이어 단방향 의존 (ADR-0003)

```
Platform → Foundation → Core → Feature → Presentation
```

### 주요 시스템 (모두 구현 완료)

| 레이어 | 시스템 | 구현 |
|-------|-------|------|
| Platform | TossBridge | StubTossBridge in dev, Cocos Toss SDK in prod |
| Foundation | EventBus, FrameClock, TouchInputAdapter, WebSocketAdapter | ✅ |
| Core | GridSimulation, PatternLibrary, PlayerMovement | ✅ |
| Feature | RoundManager, SessionFlow, Matchmaking, PauseController, SettingsState | ✅ |
| Presentation (logic) | HUDLayer, GridLayer, ResultOverlay, PauseOverlay, AudioStub, MultichannelAudioOutput | ✅ |
| Presentation (Cocos) | CocosLabel, CocosButton, CocosOverlayNode, CocosAudioChannel, SceneRoot | ❌ Sprint 7 |

### 핵심 추상화 (Cocos-agnostic 인터페이스)

| 인터페이스 | 사용처 | Cocos 구현체 (Sprint 7) |
|----------|-------|---------------------|
| `IHUDLabel` / `ILabel` | HUDLayer, ResultOverlay, PauseOverlay | `CocosLabel` |
| `IButton` | ResultOverlay, PauseOverlay | `CocosButton` |
| `IOverlayNode` | ResultOverlay, PauseOverlay | `CocosOverlayNode` |
| `IAudioChannel` | MultichannelAudioOutput | `CocosAudioChannel` |
| `IWebSocketClient` | Matchmaking | `WebSocketAdapter` (already wraps native WS) |
| `ITossBridge` | Foundation/SafeArea | `TossBridge` (real) or `StubTossBridge` (test) |

---

## ✅ 자동화 가능했던 모든 작업 완료 확인

이번 세션에서 다룬 항목 일람 (각 항목은 git history 또는 file 존재로 verify 가능):

### 코드
- [x] `src/features/session/SessionFlow.ts` (Sprint 4)
- [x] `src/features/session/Matchmaking.ts` (Sprint 6)
- [x] `src/features/session/PauseController.ts` (Sprint 6)
- [x] `src/features/session/SettingsState.ts` (Sprint 6)
- [x] `src/features/audio/AudioStub.ts` (Sprint 5)
- [x] `src/presentation/audio/IAudioChannel.ts` (Sprint 6)
- [x] `src/presentation/audio/MultichannelAudioOutput.ts` (Sprint 6)
- [x] `src/presentation/hud/HUDLayer.ts`, `HUDConfig.ts` (Sprint 5)
- [x] `src/presentation/hud/GridLayer.ts`, `cellToPixel.ts` (Sprint 5)
- [x] `src/presentation/hud/ResultOverlay.ts` (Sprint 5)
- [x] `src/presentation/hud/PauseOverlay.ts` (Sprint 6)
- [x] GameEvents 확장 (MATCHMAKING_*, GAME_PAUSED/RESUMED, SETTINGS_*, etc.)

### 테스트 (455개 — 138 신규)
- [x] tests/integration/playermovement/gap_advisory_resolution_test.ts (17)
- [x] tests/integration/session/session_flow_test.ts (14)
- [x] tests/integration/session/pause_settings_test.ts (22)
- [x] tests/integration/hud/round_state_display_test.ts (14)
- [x] tests/integration/hud/grid_render_test.ts (11)
- [x] tests/integration/hud/result_overlay_test.ts (12)
- [x] tests/unit/hud/celltopixel_test.ts (6)
- [x] tests/integration/audio/audio_stub_test.ts (12)
- [x] tests/integration/presentation/multichannel_audio_output_test.ts (12)
- [x] tests/integration/matchmaking/matchmaking_test.ts (18)

### 디자인 + UX
- [x] design/ux/lobby.md, hud.md, result.md, pause.md, settings.md, interaction-patterns.md
- [x] design/difficulty-curve.md (Sprint 4)
- [x] design/accessibility-requirements.md (Sprint 4)

### 인프라 + 메타
- [x] docs/tech-debt-register.md (Sprint 7 진입 시 1순위 참조)
- [x] docs/architecture/architecture.md § 3.4 갱신 (23-step init order)
- [x] docs/architecture/tr-registry.yaml (+11 entries: TR-hud-*, TR-audio-*, TR-session-*)
- [x] production/epics/index.md 갱신
- [x] production/sprint-status.yaml (Sprint 6 view + Sprint 5 carryover)
- [x] production/sprints/sprint-5.md, sprint-6.md
- [x] production/qa/qa-plan-sprint-5-2026-04-27.md
- [x] production/qa/smoke-2026-04-27.md (PASS)
- [x] production/qa/qa-signoff-sprint-4-2026-04-27.md (APPROVED)
- [x] production/gate-checks/gate-production-to-polish-2026-04-27.md (FAIL — 예상)
- [x] src/presentation/cocos/README.md (Sprint 7 Day 1-3 정확한 가이드)
- [x] production/playtests/playtest-sprint-5-*.md ×4, playtest-sprint-6-multiplayer.md

### 에픽 + 스토리
- [x] production/epics/hud/EPIC.md + story-001/002/003 (Sprint 5)
- [x] production/epics/matchmaking/EPIC.md + story-001/002/003 (Sprint 6)
- [x] production/epics/roundmanager/story-003-session-flow-stub.md (Sprint 4)

---

## 🚧 Sprint 7+ 작업 후보 (Polish gate 통과 후)

| 항목 | 출처 | 추정 |
|------|------|------|
| FairFeedback (Death Replay) — ADR-0015 | TD-P2-03 | 1 sprint |
| 실기기 검증 (S5-N1, S6-N2, AC-HUD-01) | TD-P1-02 | 1-2일 |
| Localization (i18n) | TD-P1-01 | 1 sprint |
| Settings persistence (localStorage) | TD-P2-01 | 0.5 sprint |
| Pause 자동 트리거 (cc.Game.EVENT_HIDE) | TD-P2-04 | 0.5 sprint |
| Multiplayer sync drift 보정 | (post-S6-M6 결과 후) | 1 sprint |
| Lean-mode skip 코드 리뷰 | TD-P1-04 | 1-2일 |

상세는 `docs/tech-debt-register.md` 참조.

---

## 🎯 Polish 게이트 5 blockers — 진행 상황

원본 `production/gate-checks/gate-production-to-polish-2026-04-23.md` 기준:

| # | Blocker | Sprint 4 | Sprint 5 | Sprint 6 | Sprint 7 (예정) |
|---|---------|---------|---------|---------|-------------|
| 1 | Core loop unplayable | ⚠️ partial (RoundManager) | ⚠️ partial (HUD logic) | ⚠️ partial (PauseOverlay) | ✅ Cocos 통합으로 closing |
| 2 | Playtest 0/3 | ❌ | ❌ | ❌ | ✅ Day 4-5에 closing |
| 3 | MVP systems incomplete | ❌ | ⚠️ partial (HUD, Audio stub) | ⚠️ partial (Matchmaking, real Audio) | ✅ Day 6에 closing (서버) |
| 4 | Fun hypothesis unvalidated | ❌ | ❌ | ❌ | ✅ Day 4-5에 closing (playtest 결과) |
| 5 | Design artifacts missing | ⚠️ partial (difficulty-curve, accessibility) | ✅ (UX 4 specs + interaction-patterns) | ✅ (Pause/Settings UX) | ✅ |

**Sprint 7 끝나면 5/5 모두 closing 가능 → Polish 게이트 PASS 예상.**

---

## 🛑 자동화 한도

본 세션 이후 인간 또는 외부 자원 없이는 진행 불가능한 항목:

| 작업 | 필요 자원 |
|------|---------|
| Cocos preview/build 검증 | Cocos Creator Editor 3.8.6 |
| 4 playtest sessions (Sprint 5/6) | Humans (1-3명) |
| Toss 인토스 실기기 검증 | Toss SDK + 실기기 1대 |
| 멀티플레이어 end-to-end | 서버 + 클라이언트 2-3대 |
| 비주얼 fidelity 검증 | art-director 수동 검토 |

---

## 📞 막막할 때

1. **무엇부터 시작?** → `src/presentation/cocos/README.md` § 작성해야 할 5개 wrapper
2. **테스트가 깨지면?** → 본 세션은 455/455 통과 상태로 끝남. 새 변경 분리해서 bisect.
3. **시스템 wiring 헷갈림?** → `docs/architecture/architecture.md` § 3.4 (23-step)
4. **알려진 한계 확인?** → `docs/tech-debt-register.md` (P0/P1/P2 분류)
5. **이벤트 흐름 헷갈림?** → `src/core/events/GameEvents.ts` (모든 이벤트 타입 정의)

행운을 빕니다 🎮

— Sprint 4-6 자동화 작업 (2026-04-23 ~ 2026-04-28)
