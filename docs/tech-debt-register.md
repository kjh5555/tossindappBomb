# Technical Debt Register — GRID REAPER

> **Last Updated**: 2026-04-28 (Sprint 4-6 자동화 작업 후 초기 작성)
> **Maintained by**: Story-done close-out, manual additions during code review.
> **Format**: 각 항목은 발견 시점, 영향 범위, 해소 우선순위를 명시. Polish 게이트 / Release 게이트 진입 전 reviewed.

이 문서는 lean review mode + solo development 중 의도적으로 후순위로 미룬 작업, 알려진 제약, 그리고 Sprint 7+ 처리 대상을 한 곳에 모은다. 매 sprint 마무리 시점에 reviewed.

---

## 우선순위 분류

| 등급 | 의미 | 처리 시점 |
|------|------|---------|
| **P0** | Polish 게이트 통과 차단 | Sprint 7 전 처리 |
| **P1** | Release 게이트 통과 차단 | Sprint 7~Release 전 처리 |
| **P2** | Polish/Release에 영향 없으나 미래 성장에 부담 | post-v1 권장 |
| **INFO** | 의도적인 deferral, 현재 결정의 근거 보존 | 문서로 충분, 액션 불필요 |

---

## P0 — Polish Gate 차단

### TD-P0-01: Cocos 통합 wrapper — 코드 작성 완료, Editor binding 남음

**발견 시점**: Sprint 5-6 (의도적 deferral) → Sprint 7 자동화로 wrapper 4개 closing
**영향**: Production 빌드 1단계 진전. 4개 wrapper 코드는 작성됨 + cc-mock 검증 통과 (22 tests). SceneRoot + Cocos Editor scene 생성/binding만 남음.

**완료** (2026-04-28):
- ✅ `src/presentation/cocos/CocosLabel.ts` (IHUDLabel + ILabel 통합)
- ✅ `src/presentation/cocos/CocosButton.ts` (cc.Button.node click 변환)
- ✅ `src/presentation/cocos/CocosOverlayNode.ts` (visible ↔ active)
- ✅ `src/presentation/audio/CocosAudioChannel.ts` (BGM/SFX/UI 채널)
- ✅ `tests/integration/cocos/cocos_wrappers_test.ts` — 22 tests
- ✅ cc-mock 확장 (Label/Button/AudioSource 등)

**잔여**:
- ❌ `src/presentation/cocos/SceneRoot.ts` (cc.Component 데코레이터 + @property binding) — Cocos Editor 환경 필요
- ❌ Cocos Editor scene 생성 (HUDLayer/GridLayer/Overlay 노드 + AudioSource × 3)
- ❌ Editor에서 SceneRoot @property binding (drag-drop)
- ❌ 실제 cc API 동작 검증 (cc.AudioSource.playOneShot 등 — best-guess는 검증됨)

**해소 경로**: Cocos 환경에서 1-2일 작업. README.md에 SceneRoot 코드 예시 있음.

**우선순위**: **P0** (조건부) — wrapper 코드는 done. Editor binding만 남음.

---

### TD-P0-02: 서버 — logic 작성 완료, ws adapter만 남음

**발견 시점**: Sprint 6 (S6-M1~M4) → Sprint 7 자동화로 server logic closing
**영향**: 멀티플레이어 모드 90% closing. Lobby + Auth + SessionManager + MatchmakingServer 모두 작성됨 + 16 tests 통과. ws library binding만 남으면 production 가동 가능.

**완료** (2026-04-28):
- ✅ `src/server/IServerSocket.ts` (ws-agnostic 추상화)
- ✅ `src/server/AuthValidator.ts` (StubAuthValidator — token non-empty check)
- ✅ `src/server/SessionManager.ts` (sessionId 생성 + MATCH_READY 브로드캐스트)
- ✅ `src/server/Lobby.ts` (FIFO 큐, MIN/MAX invariant)
- ✅ `src/server/MatchmakingServer.ts` (전체 orchestration)
- ✅ `tests/integration/server/matchmaking_server_test.ts` — 16 tests

**잔여**:
- ❌ `src/server/WsServerSocket.ts` — ws.WebSocket → IServerSocket adapter (약 40 lines)
- ❌ `src/server/server-bootstrap.ts` — `ws.WebSocketServer({ port: 8080 })` 부팅 entry
- ❌ `npm install ws @types/ws` (단일 명령)
- ❌ Production token 검증 (Toss API 연동 — 소프트런치는 stub로 충분)
- ❌ 게임 진행 중 메시지 라우팅 (MOVE 등 — Sprint 8+ — ADR-0010 server authority 검증 포함)

**해소 경로**: Sprint 7에서 ws import + adapter 작성 (1일). Sprint 8에서 게임 메시지 라우팅 (1-2일).

**우선순위**: **P0** for 멀티플레이어 모드. 솔로 fallback 가능하나 ADR-0010 서버 권위 모델 검증 필수.

---

### TD-P0-03: Playtest 0/3 (S5-M6) + 멀티플레이어 playtest 미실행 (S6-M6)

**발견 시점**: Sprint 5 sprint plan
**영향**: Production → Polish 게이트 명시적 차단 항목. 게이트 체크 § Required Artifacts: "At least 3 distinct playtest sessions documented in `production/playtests/`".

**필요 작업**:
- `production/playtests/playtest-sprint-5-onboarding.md` — 신규 플레이어 1세션
- `production/playtests/playtest-sprint-5-pattern-readability.md` — 미드게임 1세션
- `production/playtests/playtest-sprint-5-difficulty.md` — 라운드 5/10/15 1세션
- `production/playtests/playtest-sprint-6-multiplayer.md` — 2-3인 매치 1세션

**해소 경로**: humans 필요. QA plan (`production/qa/qa-plan-sprint-5-2026-04-27.md` § Playtest Requirements)이 protocol 정의됨.

**우선순위**: **P0** — 게이트 명시 차단.

---

## P1 — Release Gate 차단

### TD-P1-01: Localization 미적용

**발견 시점**: 모든 UX 스펙에 "loc string 경유 필수" 명시했으나 실제 구현은 하드코딩 ("Round 7", "PAUSED", "Game Over" 등)
**영향**: Toss webview 한국어 외 시장 출시 시 차단. 현재 영문/한글 혼재.

**필요 작업**:
- i18n 시스템 구축 (`src/core/localization/`)
- 모든 UI 문자열 추출 → `assets/i18n/[locale].json`
- HUDLayer/PauseOverlay/ResultOverlay 등 텍스트 소스를 loc lookup으로 교체

**우선순위**: **P1** — Korean-only soft launch 가능하나 글로벌 배포 시 차단.

---

### TD-P1-02: 실기기 검증 (S5-N1, S6-N2) 미실행

**발견 시점**: Sprint 4부터 carry
**영향**: 다음 검증 미수행:
- AC-HUD-01 (실기기 노치/홈바 침범 없음)
- GAP-05 (TouchInput → PlayerMovement 파이프라인 실기기 latency)
- AC-GRID-09 (56-cell 폭발 시 30+ fps 유지)
- ADR-0016 (cc.Game.EVENT_HIDE webview 발생 여부)

**해소 경로**: Toss SDK 환경 + 실기기 1대 + `ait deploy` 또는 동등 명령.

**우선순위**: **P1** — Release 직전 필수.

---

### TD-P1-03: TR-hud-NNN, TR-audio-NNN 등 TR 등록 미완성

**발견 시점**: HUD epic 작성 시 ADR-0016 직접 참조로 우회
**영향**: Architecture traceability 불완전. `/architecture-review` 재실행 시 gap으로 표시될 수 있음. Stories는 ADR-NNNN-AC-NN 직접 참조 중.

**필요 작업**:
- `docs/architecture/tr-registry.yaml`에 TR-hud-001 ~ TR-hud-005 추가 (ADR-0016 AC-HUD-01~05에서 도출)
- TR-audio-001~003 추가 (3채널 라우팅, 볼륨 제어, AUDIO_EVENT 라우팅)
- TR-session-001 (SessionFlow), TR-session-002 (Pause), TR-session-003 (Settings) 추가
- 추가 후 `/architecture-review`로 재검증

**우선순위**: **P1** — 정합성/감사 목적. 코드 동작에는 영향 없음.

---

### TD-P1-04: Code review skipped (Lean mode)

**발견 시점**: 모든 Sprint 5-6 stories의 completion notes에 "Code Review: Skipped — Lean mode" 명시
**영향**: 잠재적인 코드 품질 이슈가 reviewed 되지 않음. 특히 다음 영역에서 검토 필요:
- Matchmaking.ts — disconnect handling 분기 (matchInitialized vs state 검증 순서)
- ResultOverlay/PauseOverlay — alreadyShown / state 가드 일관성
- MultichannelAudioOutput — KEY_CHANNEL_ROUTING 확장 시 type safety

**해소 경로**: Sprint 7에서 `/code-review` (lead-programmer + 적절한 specialist) 1-2일.

**우선순위**: **P1** — 멀티플레이어/실서비스 진입 전.

---

## P2 — 미래 부담

### TD-P2-01: Settings persistence (in-memory만)

**발견 시점**: Sprint 6 S6-S1
**영향**: Settings 변경이 게임 재시작 시 초기화. localStorage 또는 Toss SDK preferences API로 persistence 필요.

**해소 경로**: `src/features/session/SettingsState.ts`에 `ISettingsStorage` 추상화 추가 + `LocalStorageBackend` 구현.

**우선순위**: **P2** — UX 개선 항목. v1 출시 가능.

---

### TD-P2-02: TouchInput epic doc 미생성

**발견 시점**: epics/index.md 점검
**영향**: TouchInput은 ADR-0017 + adapter 구현 모두 완료되었으나 `production/epics/touchinput/EPIC.md`는 작성되지 않음. 다른 모든 핵심 시스템은 EPIC.md 보유.

**해소 경로**: `/create-epics touchinput` 또는 수동 작성. 30분 작업.

**우선순위**: **P2** — bookkeeping. 코드 동작 무관.

---

### TD-P2-03: FairFeedback / DeathReplay 미구현 (ADR-0015)

**발견 시점**: Sprint 6 S6-N1 deferred
**영향**: 사망 시 시각적 피드백 (X 표시 + 발광) 없음. art-bible § 3.4 "사망 시 X 마크 0.6초간 1순위 계층" 미구현. 게임은 동작하지만 사용자 경험 풍성도 감소.

**해소 경로**: Sprint 7+ 별도 epic. ADR-0015 Accepted 상태이며 구현 가이드 존재.

**우선순위**: **P2** — 폴리시 단계 작업.

---

### TD-P2-04: Pause 자동 트리거 (cc.Game.EVENT_HIDE) 미구현

**발견 시점**: design/ux/pause.md § 4 entry table
**영향**: Toss webview가 백그라운드 전환 시 자동 일시정지 없음. 백그라운드에서 BGM은 멈추지만 (ADR-0016) 게임 시뮬레이션은 계속 진행.

**해소 경로**: Cocos 통합 시 (TD-P0-01 작업의 일부). `cc.game.on(cc.Game.EVENT_HIDE, () => pauseController.pause())`.

**우선순위**: **P2** — 사용자 경험 개선.

---

### TD-P2-05: AUDIO_EVENT 페이로드 ADR-0016 § 3 대비 단순화

**발견 시점**: Sprint 5-6
**영향**: 현재 `AUDIO_EVENT: { key: 'EXPLOSION'|'GATE_SAFE'|'ROUND_CLEAR'|'GAME_OVER'; cellId? }` — ADR-0016 § 3 envisions `{ channel, clip, volume? }` 페이로드. 채널이 key에 묶여 있어 새 채널 추가 시 제한.

**해소 경로**: AudioStub의 KEY_CHANNEL_ROUTING 매핑을 외부 config로 분리, 이벤트 페이로드 확장.

**우선순위**: **P2** — 현재 4개 키 + SFX 단일 채널 운영에는 충분.

---

### TD-P2-06: ResultOverlay FIFO 가드의 단일 사이클 한계

**발견 시점**: Sprint 5 story-003 구현
**영향**: `alreadyShown` 플래그가 한 사이클 내에서 GAME_OVER + ROUND_CLEAR 중복 표시를 방지하지만, RoundManager 측의 "GAME_OVER 정확히 1회" 보장(EC-RM-6)이 무너지면 overlay도 영향받음. 현재 RoundManager 보장이 정상이라 문제없으나 architectural 의존.

**우선순위**: **INFO** → 모니터링 대상. 수정 불필요.

---

## INFO — 의도적 결정 보존

### TD-INFO-01: Lean mode 채택 사유

Solo development + 명확한 ADR + 자동화 테스트로 인해 직무 전문가 리뷰(LP-CODE-REVIEW, QL-TEST-COVERAGE)를 매 스토리마다 spawn하는 비용이 효익을 초과. Lean mode 유지.

전제: 모든 Sprint 5-6 stories는 ADR 직접 참조 + 자동화 테스트 80%+ coverage. Multiplayer/실서비스 진입 시점에 retroactive review 1회 권장.

---

### TD-INFO-02: Cocos 추상화 결정

Sprint 5-6 모든 Presentation 클래스는 `IHUDLabel`, `IButton`, `IOverlayNode`, `IAudioChannel` 등 Cocos-agnostic 인터페이스에만 의존. 이는 다음 이점:
- Jest 테스트가 Cocos 런타임 없이 가능 (455 tests 전부 환경 독립)
- Cocos 버전 업그레이드 영향 격리
- 단위/통합 테스트와 실제 wiring의 분리

비용:
- thin Cocos wrapper 클래스 추가 (TD-P0-01)
- 일부 cc.AudioSource 등 specific API 검증이 통합 시점으로 미뤄짐

결정 근거: 테스트 자동화 100% > Cocos 직접 의존성. Sprint 7 통합 작업이 명확하고 짧다.

---

### TD-INFO-03: Stub 식 SessionFlow

`src/features/session/SessionFlow.ts`는 의도적으로 minimal stub. ROUND_CLEAR + GAME_OVER 두 가지 이벤트 모두 RESULT 상태로 transition (story-003 spec). 실제 product에서는 ROUND_CLEAR가 다음 라운드로 자동 진행되어야 하지만, MVP에서는 sprint plan AC ("ROUND_CLEAR 또는 GAME_OVER → 결과")를 따름.

향후 (Sprint 7+) ROUND_CLEAR → 다음 라운드 자동 진행으로 분리 시점에 RoundManager의 onClearDisplayExpired() 흐름과 통합.

---

## 처리 일정

| Sprint | 처리 대상 | 추정 |
|--------|---------|------|
| Sprint 7 | TD-P0-01 (Cocos wrapper), TD-P0-03 (playtest), TD-P1-04 (code review) | 8-10 days |
| Sprint 8 | TD-P0-02 (서버 구현), TD-P1-02 (실기기 검증) | 8-10 days |
| Polish | TD-P1-01 (localization), TD-P1-03 (TR registry), TD-P2-04 (Pause auto-trigger) | 5-6 days |
| Release prep | 위 잔여 + TD-P2-01 (Settings persistence), TD-P2-03 (FairFeedback) | 5-6 days |

---

## Maintenance

이 문서는 **/story-done 종료 시점에 업데이트** 권장. 새 deviation 발견 시 Phase 7 § Tech Debt 섹션에 자동 추가하는 hook을 향후 도입 검토.

수동 추가 시 형식: `TD-[P0/P1/P2/INFO]-NN: [제목]` + 발견 시점 + 영향 + 해소 경로 + 우선순위.
