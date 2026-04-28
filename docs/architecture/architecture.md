# GRID REAPER — Master Architecture

## Document Status

- **Version**: 1.0 (initial release)
- **Last Updated**: 2026-04-21
- **Engine**: Cocos Creator 3.8.6 (TypeScript)
- **Platform**: Toss 인토스 webview (mobile)
- **GDDs Covered**: game-concept, systems-index, grid-explosion, pattern-library, player-movement, fair-feedback, round-manager, round-escalation
- **ADRs Referenced**: ADR-0001 (EventBus), ADR-0002 (FrameClock), ADR-0003 (Layer Boundaries), ADR-0004 (TossBridge), ADR-0005 (CellCoord), ADR-0006 (Gate Period), ADR-0007 (Pattern Library), ADR-0008 (Player Movement), ADR-0009 (GRID_STALLED), ADR-0010 (Server Authority), ADR-0011 (Round Phase FSM), ADR-0012 (Goal Cell Tie-Break), ADR-0013 (Survival Cycle-Revive), ADR-0014 (Matchmaking), ADR-0015 (DeathReplay Rendering), ADR-0016 (HUD Safe Area + Audio)
- **Technical Director Sign-Off (TD-ARCHITECTURE)**: APPROVED WITH CONDITIONS — 2026-04-21
- **Lead Programmer Feasibility (LP-FEASIBILITY)**: skipped — Lean mode

### Sign-Off Conditions

1. Foundation 4 ADRs(0001–0004) + Core 6 ADRs(0005–0010) 는 **코딩 시작 전 필수 작성**
2. **OQ-1** (WebSocket 서버 구현체 확정) 은 ADR-0010 직전 해소
3. **OQ-2** (MVP SaveStore 필요 여부) 는 ADR-0007 직전 해소
4. `/gate-check pre-production` 통과 전까지 위 3 조건 모두 충족 필요

### TD-ARCHITECTURE Criterion Summary

| 기준 | Verdict |
|------|---------|
| (1) TR baseline 커버 계획 | CONCERNS — Phase 6이 매핑 완료, 실제 ADR 작성 필요 |
| (2) HIGH risk 엔진 도메인 처리 | APPROVE |
| (3) API 경계의 명확성/최소성/구현 가능성 | APPROVE |
| (4) Foundation ADR gap 차단선 | CONCERNS — gate 조건으로 명시됨 |

---

## Engine Knowledge Gap Summary

**Engine**: Cocos Creator 3.8.6 | **LLM Cutoff**: May 2025 | **Overall Risk**: MEDIUM

### HIGH RISK (must verify before use)
- **None** in Cocos engine domain for MVP scope
- **Toss 인토스 webview WebSocket 레이턴시** — 플랫폼 레벨 HIGH risk, 실기기 검증 필수
- **`@apps-in-toss/web-framework` SDK** — 외부 의존, 문서 변경 가능

### MEDIUM RISK
- `Renderer.setSharedMaterial` 재적용 시 `forceUpdate: true` 필수 (3.8.6 breaking)
- `UISkew` 컴포넌트 사용 시 노드에 선등록 필요
- Bloom intensity 파라미터 (디폴트 2.3 → 1.0 재설정)

### LOW RISK
- Scene/Node graph, EventTarget/signals, Schedule/update loop, Touch input, JSON serialization, Graphics 2D

Details: `docs/engine-reference/cocos/VERSION.md`

---

## System Layer Map

```
┌─────────────────────────────────────────────────────────────────┐
│  PRESENTATION  │ HUD · 공정 피드백 오버레이 · 오디오              │
├─────────────────────────────────────────────────────────────────┤
│  FEATURE       │ 라운드 매니저 · 라운드 에스컬레이션 · 일반 모드    │
│                │ 세션 플로우 · 로비/매치메이킹                    │
├─────────────────────────────────────────────────────────────────┤
│  CORE          │ 그리드 폭발 · 플레이어 이동 · 패턴 라이브러리      │
│                │ 서버 권위 검증 · 저장/통계                       │
├─────────────────────────────────────────────────────────────────┤
│  FOUNDATION    │ 이벤트 버스 · 터치 입력 · WebSocket · 프레임 루프  │
├─────────────────────────────────────────────────────────────────┤
│  PLATFORM      │ Cocos Creator 3.8.6 · 토스 인토스 SDK           │
└─────────────────────────────────────────────────────────────────┘
```

### 레이어 구성

| 시스템 | 레이어 | 모듈 경로 | Risk |
|--------|--------|-----------|------|
| 토스 인토스 SDK 연동 | Platform | `src/platform/toss/TossBridge.ts` | MEDIUM |
| 터치 입력 시스템 | Foundation | `src/core/input/TouchInput.ts` | LOW |
| WebSocket 네트워킹 | Foundation | `src/core/net/WebSocketClient.ts` | HIGH (webview) |
| 이벤트 버스 (신규) | Foundation | `src/core/events/EventBus.ts` | LOW |
| 프레임/스케줄 (신규) | Foundation | `src/core/time/FrameClock.ts` | LOW |
| 오디오 시스템 | Presentation | `src/presentation/audio/AudioManager.ts` | LOW |
| 패턴 라이브러리 | Core | `src/core/patterns/PatternLibrary.ts` + `assets/data/patterns/*.json` | LOW |
| 그리드 폭발 시스템 | Core | `src/core/grid/GridSimulation.ts` | MEDIUM (Graphics) |
| 플레이어 이동 시스템 | Core | `src/core/player/PlayerMovement.ts` | MEDIUM (Tween) |
| 서버 권위 검증 | Core | `src/core/net/ServerAuthority.ts` | LOW |
| 저장/통계 시스템 | Core | `src/core/persistence/SaveStore.ts` | LOW |
| 라운드 매니저 | Feature | `src/features/round/RoundManager.ts` | LOW |
| 라운드 에스컬레이션 | Feature | `src/features/round/RoundEscalation.ts` | LOW |
| 공정 피드백 시스템 | Presentation | `src/presentation/feedback/DeathReplay.ts` | LOW |
| 로비/매치메이킹 | Feature | `src/features/lobby/Matchmaking.ts` | LOW |
| 일반 모드 생존 구조 | Feature | `src/features/survival/SurvivalMode.ts` | LOW |
| HUD 시스템 | Presentation | `src/presentation/hud/RoundHUD.ts` | LOW |
| 세션 플로우 시스템 | Feature | `src/features/session/SessionFlow.ts` | LOW |

### 레이어 경계 규칙

1. **Presentation → Feature**: 읽기 전용 구독만 (이벤트 버스 경유). 역방향 호출 금지.
2. **Feature → Core**: 공개 API 호출 가능. Core 내부 상태 직접 조작 금지.
3. **Core → Foundation**: Foundation 서비스 소비 가능. Cocos 엔진 API는 Foundation만 직접 접근.
4. **Foundation → Platform**: Cocos + 토스 SDK 호출의 단일 진입점.
5. **교차 레이어 이벤트**: 이벤트 버스 경유만 허용. 동기 시그널 대신 지연 디스패치.

### 레이어 배치 근거

- **패턴 라이브러리 → Core**: 데이터 + 런타임 선택 로직. systems-index의 Foundation 분류에서 Core Data로 승격.
- **공정 피드백 → Presentation**: "읽기 전용 소비" 제약 + 오버레이 렌더 주 책임.
- **라운드 에스컬레이션 → Feature (Pure Compute)**: 상태 기계 없는 순수 함수, 테스트 용이성을 위해 별도 모듈.
- **이벤트 버스 신규 추가**: 6 GDD 전체에서 이벤트 기반 느슨한 결합을 전제함 — 단일 허브 필요.
- **프레임 클락 신규 추가**: 결정론적 시뮬레이션 요구 (서버 권위). Cocos `director.getScheduler()` 위 추상화.

---

## Module Ownership

### Foundation Layer

| 모듈 | Owns | Exposes | Consumes | Cocos API |
|------|------|---------|----------|-----------|
| **EventBus** | 타입 안전 이벤트 레지스트리, 구독자 리스트, dispatch 큐 | `emit<E>(event)`, `on<E>(handler)`, `off<E>(handler)` | — | `EventTarget` 래핑 (LOW) |
| **FrameClock** | 결정론적 simulatedTime, frame counter | `now()`, `dt()`, `tick()`, `schedule(fn, delay)` | — | `director.getScheduler()` (LOW) |
| **TouchInput** | 터치 이벤트 풀링, safe-area 매핑 | `onTap(pos)`, `onDragEnd(pos)`, screen→world 변환 | EventBus | `Node.on('touch-*')`, `view.getVisibleSize()` (LOW) |
| **WebSocketClient** | 연결 상태, 메시지 큐, reconnect 로직 | `connect()`, `send(msg)`, `on(type, handler)` | EventBus, FrameClock | `WebSocket` 브라우저 표준 (LOW 내부 / HIGH 플랫폼 — webview 레이턴시 실기기 검증 필수) |

### Platform Layer

| 모듈 | Owns | Exposes | Consumes | Cocos API |
|------|------|---------|----------|-----------|
| **TossBridge** | 토스 SDK 초기화, safe-area, 네트워크 상태 | `init()`, `getSafeArea()`, `getUserToken()` | — | `@apps-in-toss/web-framework` ⚠️ MEDIUM (외부 SDK) |

### Core Layer

| 모듈 | Owns | Exposes | Consumes | Cocos API |
|------|------|---------|----------|-----------|
| **PatternLibrary** | `assets/data/patterns/*.json`, `N_recent` 윈도우 상태, `bfsVerified` 플래그 | `selectPattern(ctx, seed): ExplodePattern \| null`, `getPatternById(id)` | — (pure data) | `resources.load()` JSON (LOW) |
| **GridSimulation** | 8×8 셀 상태 배열, 게이트 주기 타이머, 현재 패턴 | `getCellState(c)`, `nextExplosionTime(c)`, `setGatePeriod(s)`, `getGatePeriod()`, `applyPattern(p)` | PatternLibrary, FrameClock, EventBus | `Graphics` ⚠️ MEDIUM — `Renderer.setSharedMaterial` 사용 시 `forceUpdate: true` 필수 |
| **PlayerMovement** | `Map<PlayerId, CellCoord>`, 트윈 상태 | `movePlayer(id, to): Promise<void>`, `getPosition(id)` | TouchInput, GridSimulation, EventBus | `tween()`, `Node.setPosition()` ⚠️ MEDIUM |
| **ServerAuthority** | 서버 스냅샷, 예측 vs 확정 diff | `submitAction(a)`, `onAuthoritativeState(handler)` | WebSocketClient, EventBus | 없음 (pure TS) |
| **SaveStore** (Vertical Slice) | 로컬 캐시, sync 상태 | `get`, `put`, `flush` | TossBridge, WebSocketClient | `sys.localStorage` (LOW) |

### Feature Layer

| 모듈 | Owns | Exposes | Consumes | Cocos API |
|------|------|---------|----------|-----------|
| **RoundManager** | 라운드 번호, aliveCount, phase (PRE_ROUND / ROUND_ACTIVE / CLEAR / GAME_OVER), Goal Cell | `startRound(ctx)`, `getPhase()`, `getAliveCount()`, `getGoalCell()` | GridSimulation, PatternLibrary, EventBus (구독: CELL_EXPLODED, PLAYER_KILLED, PLAYER_ARRIVED; 발행: ROUND_STARTED, ROUND_CLEAR, GAME_OVER, ALIVE_COUNT_CHANGED, GOAL_PLACED; GRID_STALLED 3자 체인 오케스트레이션) | 없음 |
| **RoundEscalation** | 순수 함수, `lastTier` 캐시 | `computeContext(roundNumber, stalled): EscalationContext` | GridSimulation.setGatePeriod (ROUND_STARTED 직후 한정), EventBus | 없음 |
| **Matchmaking** | 로비 상태, 세션 시드 | `requestMatch()`, `cancelMatch()`, `onMatchFound(handler)` | WebSocketClient, TossBridge | 없음 |
| **SurvivalMode** | Cycle-Revive 스펙테이터 목록 | `registerPlayers(ids)`, `isSpectator(id)`, `reviveAll()` | RoundManager (구독: ROUND_CLEAR), EventBus | 없음 |
| **SessionFlow** | 세션 phase (LOBBY / PLAYING / RESULT), 전역 FSM | `start()`, `reset()`, `getSessionPhase()` | Matchmaking, RoundManager, SurvivalMode | `director.loadScene()` (LOW) |

### Presentation Layer

| 모듈 | Owns | Exposes | Consumes | Cocos API |
|------|------|---------|----------|-----------|
| **RoundHUD** | HUD 위젯 참조, 타이머/뱃지 | `attach(canvas)`, `detach()` | EventBus (구독: ROUND_STARTED, ALIVE_COUNT_CHANGED, GOAL_PLACED), RoundEscalation (gatePeriod 표시) | `Label`, `Sprite`, `Widget` (LOW) |
| **DeathReplay** | 오버레이 노드 풀, 리플레이 상태 | `playReplay(event)` | EventBus (구독: PLAYER_KILLED, CELL_STATE_CHANGED), GridSimulation (읽기 전용 좌표 조회) | `Graphics`, `tween()` (LOW) |
| **AudioManager** | 오디오 클립, 볼륨 | `play(key)`, `stop(key)`, `setVolume(v)` | EventBus (구독: AUDIO_EVENT) | `AudioSource` (LOW) |

### 의존성 다이어그램

```
┌──────────────── Presentation ────────────────┐
│ RoundHUD     DeathReplay     AudioManager    │
└────┬──────────────┬─────────────┬────────────┘
     │              │ (read-only) │
     ▼              ▼             ▼
┌──────────────── EventBus ────────────────────┐
└────▲───────▲───────▲───────▲──────▲──────────┘
     │       │       │       │      │
┌────┴───────┴─ Feature ─────┴──────┴──────────┐
│ SessionFlow ─► Matchmaking                   │
│      │                                       │
│      ▼                                       │
│ RoundManager ◄──► RoundEscalation            │
│      │            │ (setGatePeriod)          │
│      ▼            ▼                          │
│                SurvivalMode                  │
└──────┼───────────────────────────────────────┘
       │ (nextExplosionTime, getCellState)
       ▼
┌──────────────── Core ────────────────────────┐
│ GridSimulation ◄── PatternLibrary            │
│       ▲                                      │
│ PlayerMovement    ServerAuthority  SaveStore │
└───────┬──────────────┬───────────────┬──────┘
        │              │               │
┌───────┼──────────────┼── Foundation ─┼──────┐
│  TouchInput   WebSocketClient   FrameClock  │
│       └─────► EventBus ◄────────────┘       │
└─────────────────────┬───────────────────────┘
                      │
┌─────────── Platform ─┴───────────────────────┐
│  TossBridge (Toss SDK) · Cocos Creator 3.8.6 │
└──────────────────────────────────────────────┘
```

### 경계 규칙 (운용상 예외)

- **RoundEscalation → GridSimulation.setGatePeriod 직접 호출**: Feature→Core 허용. 단 `ROUND_STARTED` 이벤트 직후 1회로 제한 (ADR에서 시퀀스 명시 예정).
- **DeathReplay → GridSimulation 좌표 조회**: Presentation→Core 예외. 읽기 전용 `killerGateCells` 프리뷰 한정. EventBus로 대체 불가능한 경우만.
- **SaveStore**: MVP에서는 스켈레톤만. 구현은 Vertical Slice tier.

---

## Data Flow

### 3.1 Frame Update Path (60fps)

```
t=0 frame start
     │
     ▼
[director.tick()]
     │
     ▼
[FrameClock.tick()] ─── simulatedTime += dt
     │
     ▼
[EventBus.flush()] ─── 이전 프레임 큐잉 이벤트 dispatch
     │
     ▼
[TouchInput.update()]
     │   emit TAP_DETECTED(pos)
     │       │
     │       ▼
     │   [PlayerMovement.onTap] screen → CellCoord
     │       │ getCellState(cell) 동기 조회
     │       │ if valid → tween 시작
     │       │ emit PLAYER_MOVED(t=0)
     │       │ schedule(0.1s) → emit PLAYER_ARRIVED
     │
     ▼
[GridSimulation.update(dt)]
     │   elapsed += dt
     │   if (elapsed >= GATE_PERIOD) → Idle → Exploded
     │   emit CELL_STATE_CHANGED, PLAYER_KILLED(ids), CELL_EXPLODED
     │
     ▼
[RoundManager.update()] ─── 이벤트 구독 처리
     │   CELL_EXPLODED / PLAYER_KILLED → aliveCount 갱신 → ALIVE_COUNT_CHANGED
     │   PLAYER_ARRIVED with cell==goalCell → ROUND_CLEAR (EC-RM-2 도달 우선)
     │
     ▼
[Presentation render pass]
     │   RoundHUD, DeathReplay, AudioManager 구독 반응
     │   GridSimulation Graphics 드로우
     │
     ▼
t=16.6ms frame end
```

**불변:**
- 모든 로직은 이벤트 flush → 업데이트 → 렌더 순서로 동일 프레임 내 완결
- `FrameClock.simulatedTime`을 `Date.now()` 대신 사용 (결정론)
- `getCellState`는 동기 호출 (update 후 안정 상태)

### 3.2 Event/Signal Path

**동기 호출** (같은 프레임 결과 필요):
- `GridSimulation.getCellState(c)` — PlayerMovement 이동 가능성 판정
- `GridSimulation.nextExplosionTime(c)` — RoundManager Goal Cell 결정 (F-RM-1)
- `PatternLibrary.selectPattern(ctx, seed)` — RoundManager 라운드 시작 시 동기 선택
- `RoundEscalation.computeContext(n, stalled)` — 순수 함수

**이벤트 버스 (비동기 큐, 다음 프레임 dispatch)**:
- `CELL_STATE_CHANGED`, `CELL_EXPLODED`, `PLAYER_KILLED` (GridSimulation)
- `PLAYER_MOVED`, `PLAYER_ARRIVED` (PlayerMovement)
- `ROUND_STARTED`, `ROUND_CLEAR`, `GAME_OVER`, `ALIVE_COUNT_CHANGED`, `GOAL_PLACED` (RoundManager)
- `ESCALATION_COMPUTED` (RoundEscalation)
- `PATTERN_REJECTED`, `GRID_STALLED` (PatternLibrary 또는 GridSimulation)
- `AUDIO_EVENT`

**동일 프레임 강제 (락스텝):**
- `ROUND_STARTED` + `ESCALATION_COMPUTED` — AC-RE-09. RoundManager.startRound 내부에서 `RoundEscalation.computeContext` → `setGatePeriod` 동기 → 두 이벤트 동일 프레임 큐잉.

### 3.3 Save/Load Path

**MVP 범위**: 모든 상태가 **서버 권위**. 클라이언트 로컬 저장 없음. SaveStore 구현은 Vertical Slice로 이연. 단, 스켈레톤 인터페이스는 Core 레이어에 배치.

**Vertical Slice+** 기준:

```
세션 시작:
  TossBridge.getUserToken() → WebSocketClient.connect(authMsg)
  서버가 프로필 전송 → SaveStore.put('profile', ...)

라운드 종료:
  RoundManager.GAME_OVER → SessionFlow
  WebSocketClient.send(SESSION_RESULT)
  서버 ACK + 갱신 통계 → SaveStore.put('stats', ...)

오프라인/재연결:
  WebSocketClient.reconnect() 실패 → 플러시 지연 → 다음 세션에 pending flush
```

### 3.4 Initialisation Order

> **Updated 2026-04-28**: Sprint 5-6 자동화 작업으로 SessionFlow + PauseController + SettingsState + 모든 Presentation 클래스가 추가됨. SessionFlow는 Matchmaking 이전에 인스턴스 생성 (Matchmaking이 SessionFlow에 의존).

```
1.  Cocos director ready
2.  TossBridge.init()                                    [Platform]
3.  EventBus / FrameClock                                 [Foundation]
4.  TouchInputAdapter (deps: EventBus, canvas)
5.  WebSocketAdapter (deps: EventBus, FrameClock) + WebSocketReconnectManager
6.  PatternLibrary.load() — async I/O                     [Core]
7.  GridSimulation (deps: PatternLibrary, FrameClock, EventBus)
8.  PlayerMovement (deps: TouchInputAdapter, GridSimulation, EventBus, FrameClock)
9.  ServerAuthority (deps: WebSocketAdapter, EventBus)
10. RoundEscalation                                      [Feature]
11. RoundManager (deps: GridSimulation, PatternLibrary, RoundEscalation, EventBus, FrameClock)
12. SurvivalMode (deps: RoundManager, EventBus) — Sprint 7+
13. SettingsState (deps: EventBus)                       [Feature — Sprint 6]
14. SessionFlow (deps: EventBus)                         [Feature — Sprint 4]
15. PauseController (deps: EventBus, SessionFlow)        [Feature — Sprint 6]
16. Matchmaking (deps: WebSocketAdapter, TossBridge, EventBus, SessionFlow, onMatchInit-callback) [Feature — Sprint 6]
17. MultichannelAudioOutput (deps: 3× CocosAudioChannel) [Presentation — Sprint 6]
18. AudioStub (deps: EventBus, MultichannelAudioOutput)  [Presentation — Sprint 5/6]
19. HUDLayer / GridLayer (deps: EventBus, FrameClock)    [Presentation — Sprint 5]
20. ResultOverlay (deps: EventBus, SessionFlow, IButton, ILabel, IOverlayNode) [Presentation — Sprint 5]
21. PauseOverlay (deps: EventBus, SessionFlow, PauseController, 5× IButton, ILabel, IOverlayNode) [Presentation — Sprint 6]
22. SceneRoot.applyInsets(TossBridge.getSafeArea()) — HUDLayer 위치 적용 (1회)
23. 모드 분기 — SessionFlow.startMatch() (솔로) 또는 Matchmaking.start(serverUrl) (멀티)
```

**치명적 순서 제약:**
- PatternLibrary는 GridSimulation보다 반드시 먼저 (async load 대기)
- TouchInputAdapter는 PlayerMovement보다 먼저 (구독 관계)
- EventBus는 모든 이벤트 생산자/소비자보다 먼저
- TossBridge는 WebSocketAdapter보다 먼저 (safe-area + userToken)
- **SessionFlow는 PauseController, Matchmaking, ResultOverlay, PauseOverlay보다 먼저** (모두 SessionFlow 직접 의존)
- **MultichannelAudioOutput은 AudioStub보다 먼저** (AudioStub 생성자에 IAudioOutput 주입)
- **TossBridge.getSafeArea()는 init() 완료 후 정확히 1회 — HUDLayer.applyInsets()에서만 호출** (ADR-0016)
- Matchmaking 인스턴스 생성 후 `.start(serverUrl)`은 모드 분기 시점에 호출 (자동 호출 금지)
- Presentation 레이어는 Feature/Core 준비 완료 후 (구독 누락 방지)

**Cocos 통합 의존성** (TD-P0-01 — Sprint 7 작업):
- `CocosAudioChannel implements IAudioChannel` — cc.AudioSource 래핑 (3개 인스턴스: BGM/SFX/UIFeedback)
- `CocosLabel implements IHUDLabel` — cc.Label 래핑
- `CocosButton implements IButton` — cc.Button 래핑 (Restart/Resume/Settings 등 8+ 버튼)
- `CocosOverlayNode implements IOverlayNode` — cc.Node visibility 래핑
- `SceneRoot extends cc.Component` — 위 모든 wrapper를 wire하는 composition root + cc.Component.update에서 `if (!pauseController.isPaused()) frameClock.tick(dt);`

**병렬 가능:**
- PatternLibrary.load() ‖ WebSocketClient.connect() — 둘 다 I/O 대기
- Presentation 3 모듈은 상호 독립, 병렬 생성 가능

---

## API Boundaries

### 4.1 공통 도메인 타입 (`src/core/types/Domain.ts`)

```typescript
export type CellCoord = { row: number; col: number };  // row: 0-7, col: 0-7 (canonical)
export type CellIndex = number;                         // row*8 + col, serialization only
export type PlayerId = string;
export type CellState = 'Idle' | 'Exploded';

export interface ExplodePattern {
  cells: CellCoord[];
  patternId: string;
}

export interface DifficultyContext {
  tier: 1 | 2 | 3;
  gatePeriod: number;
  roundNumber: number;
}

export interface EscalationContext extends DifficultyContext {
  tierWeights: { t1: number; t2: number; t3: number };
  stalledFallback: boolean;
}
```

### 4.2 이벤트 버스 (Foundation)

```typescript
export interface GameEvents {
  // Grid
  CELL_STATE_CHANGED: { cell: CellCoord; state: CellState; timestamp: number };
  CELL_EXPLODED:      { cell: CellCoord; timestamp: number };
  PLAYER_KILLED:      { playerIds: PlayerId[]; cellId: CellCoord; cause: 'EXPLOSION' | 'DANGER_ZONE'; timestamp: number };
  GRID_STALLED:       { roundNumber: number; timestamp: number };
  PATTERN_REJECTED:   { patternId: string; reason: string; timestamp: number };

  // Movement
  PLAYER_MOVED:       { playerId: PlayerId; from: CellCoord; to: CellCoord; timestamp: number };
  PLAYER_ARRIVED:     { playerId: PlayerId; cell: CellCoord; timestamp: number };

  // Round
  ROUND_STARTED:         { roundNumber: number; ctx: EscalationContext; timestamp: number };
  ROUND_CLEAR:           { roundNumber: number; survivors: PlayerId[]; timestamp: number };
  GAME_OVER:             { finalRound: number; rankings: PlayerId[]; timestamp: number };
  ALIVE_COUNT_CHANGED:   { aliveCount: number; timestamp: number };
  GOAL_PLACED:           { cell: CellCoord; timestamp: number };
  ESCALATION_COMPUTED:   { ctx: EscalationContext; timestamp: number };

  // Audio / Input
  AUDIO_EVENT:  { key: 'EXPLOSION' | 'GATE_SAFE' | 'ROUND_CLEAR' | 'GAME_OVER'; cellId?: CellCoord };
  TAP_DETECTED: { pos: { x: number; y: number }; timestamp: number };
}

export interface IEventBus {
  emit<K extends keyof GameEvents>(key: K, payload: GameEvents[K]): void;
  on<K extends keyof GameEvents>(key: K, handler: (e: GameEvents[K]) => void): void;
  off<K extends keyof GameEvents>(key: K, handler: (e: GameEvents[K]) => void): void;
  flush(): void;
}
```

**Invariant**: `emit`은 큐에 넣기만 함. 동일 프레임 구독자 즉시 통지 금지 (재귀 방지). `flush`는 FrameClock.tick이 유일한 호출자.

### 4.3 Core APIs

```typescript
export interface IGridSimulation {
  getCellState(c: CellCoord): CellState;
  getGatePeriod(): number;
  nextExplosionTime(c: CellCoord): number | null;
  setGatePeriod(seconds: number): void;        // invariant: seconds ∈ [1.4, 2.0]
  applyPattern(p: ExplodePattern): void;
  reset(): void;
  update(dt: number): void;
}

export interface IPatternLibrary {
  load(): Promise<void>;
  selectPattern(ctx: DifficultyContext, seed: number): ExplodePattern | null;
  getPatternById(id: string): ExplodePattern | null;
}

export interface IPlayerMovement {
  registerPlayer(id: PlayerId, start: CellCoord): void;
  movePlayer(id: PlayerId, to: CellCoord): Promise<void>;  // 0.1s tween
  getPosition(id: PlayerId): CellCoord | null;
}
```

**Invariants:**
- `getCellState`는 GridSimulation.update 완료 후 안정
- `setGatePeriod`는 ROUND_STARTED 직후 1회만 호출 (Feature→Core 경계 예외)
- `MIN_SAFE_CELLS=8` 유지: applyPattern 계약 위반 시 PATTERN_REJECTED 발행
- PatternLibrary: 3회 연속 실패 후 null 반환 → 호출자가 GRID_STALLED 발행
- 모든 반환 패턴은 `bfsVerified === true`
- PlayerMovement: PLAYER_MOVED(t=0) 직후 schedule(0.1s) → PLAYER_ARRIVED, 경계 외 move는 무시

### 4.4 Feature APIs

```typescript
export type RoundPhase = 'PRE_ROUND' | 'ROUND_ACTIVE' | 'CLEAR' | 'GAME_OVER';

export interface IRoundManager {
  startSession(playerIds: PlayerId[], seed: number): void;
  startRound(): void;
  getPhase(): RoundPhase;
  getCurrentRound(): number;
  getAliveCount(): number;
  getGoalCell(): CellCoord | null;
}

export interface IRoundEscalation {
  computeContext(roundNumber: number, stalled: boolean): EscalationContext;
}

export interface ISurvivalMode {
  registerPlayers(ids: PlayerId[]): void;
  isSpectator(id: PlayerId): boolean;
  reviveAll(): void;
}
```

**Invariants:**
- ROUND_STARTED + ESCALATION_COMPUTED 동일 프레임 발행 (AC-RE-09)
- PLAYER_ARRIVED(cell==goalCell) + CELL_EXPLODED(goalCell) 동일 프레임 → ROUND_CLEAR 우선 (EC-RM-2)
- GRID_STALLED 수신 → RoundManager가 EC-RM-5b 체인 오케스트레이션
- RoundEscalation: pure (lastTier 내부 캐시 제외), gatePeriod ∈ [1.4, 2.0]
- SurvivalMode: PLAYER_KILLED → spectator set, ROUND_CLEAR → reviveAll

### 4.5 Presentation APIs

```typescript
export interface IRoundHUD {
  attach(canvas: cc.Node): void;
  detach(): void;
}
// Subscribes: ROUND_STARTED, ALIVE_COUNT_CHANGED, GOAL_PLACED, ESCALATION_COMPUTED

export interface IDeathReplay {
  attach(canvas: cc.Node): void;
  detach(): void;
}
// Subscribes: PLAYER_KILLED, CELL_STATE_CHANGED (read-only)
// May call GridSimulation.getCellState for killerGateCells preview

export interface IAudioManager {
  play(key: GameEvents['AUDIO_EVENT']['key']): void;
  setVolume(channel: 'sfx' | 'bgm', v: number): void;
}
// Subscribes: AUDIO_EVENT
```

### 4.6 Foundation/Platform APIs

```typescript
export interface IWebSocketClient {
  connect(authToken: string): Promise<void>;
  send(msg: ServerMsg): void;
  on(type: string, handler: (m: ServerMsg) => void): void;
  isConnected(): boolean;
}

export interface ITossBridge {
  init(): Promise<void>;
  getSafeArea(): { top: number; bottom: number; left: number; right: number };
  getUserToken(): string;
}

export interface IFrameClock {
  now(): number;
  dt(): number;
  tick(dt: number): void;
  schedule(fn: () => void, delaySeconds: number): void;
}
```

### 4.7 엔진 API 사용 주의

| Cocos API | Risk | 규칙 |
|-----------|------|------|
| `Graphics.fill()`, `Graphics.stroke()` | LOW | GridSimulation/DeathReplay 드로우 |
| `Renderer.setSharedMaterial(mat, true)` | MEDIUM | **3.8.6 breaking** — 같은 material 재적용 시 `forceUpdate: true` 필수 |
| `tween(node).to(0.1, {...})` | MEDIUM | PlayerMovement 0.1s 트윈. Cocos 3.8 tween chain 검증 필요 |
| `EventTarget` | LOW | EventBus 래핑 기반 |
| `director.getScheduler()` | LOW | FrameClock tick 호출 기반 |
| `WebSocket` | LOW 내부 / HIGH webview | 재연결 전략이 webview 레이턴시 고려 필요 (실기기 검증) |

---

## ADR Audit

### 5.1 기존 ADR 감사

| ADR | Engine Compat | Version | GDD Linkage | Conflicts | Valid |
|-----|---------------|---------|-------------|-----------|-------|
| *(none)* | — | — | — | — | — |

**결과**: `docs/architecture/` 하위 ADR 파일 0건. `tr-registry.yaml`은 스켈레톤(`requirements: []`)만 존재. 감사 대상 결정 없음 → Phase 1–4 결정 전체가 **"pending ADR capture"** 상태로 분류됨.

### 5.2 Traceability Coverage Check

GDD 7개(grid-explosion / pattern-library / player-movement / fair-feedback / round-manager / round-escalation / game-concept)에서 추출한 Technical Requirements Baseline 약 40건이 **0/40 커버** 상태. 모든 TR이 gap이며 Phase 6의 Required New ADR로 승격된다.

> **Note**: TR 개별 ID는 Phase 6 ADR 작성 시 `tr-registry.yaml`에 일괄 등재한다. 본 문서에서는 ADR별 커버 TR **클러스터**만 나열한다(Phase 6 참고).

---

## Required ADRs

레이어 우선순위 순서. **Foundation → Core → Feature → Presentation.** 총 **16개**.

### Foundation Layer (코딩 시작 전 필수 — 4개)

| # | 제목 | 커버 TR 클러스터 | 근거 |
|---|------|------------------|------|
| **ADR-0001** | EventBus 아키텍처: 동기 호출 vs 프레임-flush 큐 분리 | TR-arch-EVB-* | Phase 3.2. `emit`은 큐잉, `flush`는 FrameClock.tick 단일 호출 — 동기 재귀 방지 |
| **ADR-0002** | FrameClock 결정론적 시간 모델 (`simulatedTime`, tick pattern) | TR-arch-CLK-*, TR-grid-explosion-003 | `nextExplosionTime` 서버 정합성. 런타임 `Date.now()` 사용 금지 |
| **ADR-0003** | 모듈 레이어 경계 및 의존 방향 강제 | (architecture-wide) | Phase 1 boundary rules 5항. Presentation→Feature 쓰기 금지 등 |
| **ADR-0004** | Toss SDK 초기화 순서 및 Safe Area 전파 | TR-ui-TSS-*, TR-platform-001 | Phase 3.4 init step 1–3. Toss 미연결 시 graceful degradation 경로 |

### Core Layer (시스템 구현 전 필수 — 6개)

| # | 제목 | 커버 TR 클러스터 | 근거 |
|---|------|------------------|------|
| **ADR-0005** | Cell 좌표 정규화: `CellCoord` canonical, `CellIndex` serialization-only | TR-grid-explosion-001, TR-player-movement-001, TR-pattern-library-002 | `entities.yaml` 락. 직렬화/런타임 경계 명확화 |
| **ADR-0006** | Gate Period 튜닝 경로 및 atomic 적용 | TR-grid-explosion-005, TR-round-escalation-003 | `setGatePeriod` invariant [1.4, 2.0], ROUND_STARTED 동일 프레임 적용 |
| **ADR-0007** | Pattern Library 데이터 스키마 + 로딩/선택 전략 | TR-pattern-library-001..004, TR-round-escalation-001 | JSON 스키마, DifficultyContext 필터, T1/T2/T3 분포, 중복 패턴 가드 |
| **ADR-0008** | Player Movement 이벤트 분리: `PLAYER_MOVED`(t=0 논리) vs `PLAYER_ARRIVED`(t=0.1s 트윈 완료) | TR-player-movement-002..004, TR-round-manager-004 | Goal Cell 판정은 ARRIVED 기반. 서버/UI 동기화 단일 소스 |
| **ADR-0009** | `GRID_STALLED` 3자 체인 canonical 흐름 | TR-round-manager-005, TR-round-escalation-005, TR-pattern-library-005 | pattern-library → escalation → pattern-library → grid-explosion. 무한 loop guard, fallback 패턴 |
| **ADR-0010** | Server Authority 검증 모델 (spoof guard, reconciliation) | TR-server-001..003 | MVP 최소 범위. 이동/폭발 타임스탬프 검증, 클라 낙관적 업데이트 반영 전략 |

### Feature Layer ✅ 완료 (2026-04-22)

| # | 제목 | 핵심 결정 | 커버 TR |
|---|------|----------|---------|
| **ADR-0011** | Round Phase 상태 머신 | 4-state FSM: IDLE/ROUND_ACTIVE/ROUND_CLEAR_DISPLAY/GAME_OVER. Goal Cell F-RM-1 폴백. 1500ms clear display 타이머. | TR-roundmanager-001..012 |
| **ADR-0012** | Goal Cell 동시 도착 Tie-Break | 서버 수신 순서 FIFO. 두 번째 PLAYER_ARRIVED는 phase guard 자동 차단. 비기 없음. | TR-roundmanager-003 |
| **ADR-0013** | Survival Cycle-Revive 규칙 | PlayerStatus ALIVE/SPECTATOR per-player. 부활 = ROUND_CLEAR 즉시. pathIndex=0 고정 폴백 없음. 응원 rate-limit = GATE_PERIOD. | TR-roundmanager-004..007 |
| **ADR-0014** | Matchmaking 6인 매치 조건 | 단일 FIFO 큐. MIN_MATCH_SIZE=2 (env var, tunable). MAX=6. OQ-5 해소: degenerate match 허용. | TR-matchmaking-001..003 |

### Presentation Layer ✅ 완료 (2026-04-22)

| # | 제목 | 핵심 결정 | 커버 TR |
|---|------|----------|---------|
| **ADR-0015** | FairFeedback DeathReplay 렌더링 | FairFeedbackLayer(z:20) + cc.Graphics 오버레이. FrameClock.schedule 700ms 타이머. touch 캡처 페이즈 tap-to-skip. localPlayerId 필터. | TR-fairfeedback-001..006 |
| **ADR-0016** | HUD Safe Area + Audio 채널 분리 | HUDLayer(z:30) applyInsets(safeArea). 3채널 AudioManager: BGM/SFX/UIFeedback. AUDIO_EVENT EventBus 라우팅. cc.Game.EVENT_HIDE BGM 일시정지. | TR-foundation-004, TR-hud, TR-audio |

### All ADRs Accepted ✅ (ADR-0001 ~ ADR-0016, 2026-04-22)

**Foundation 4개 + Core 6개 + Feature 4개 + Presentation 2개 = 16개** 전체 Accepted.
모든 Feature/Presentation 스토리 생성 차단 해소. `/sprint-plan` 진행 가능.

### 상위 3 생성 우선순위

1. `/architecture-decision ADR-0001 EventBus 아키텍처`
2. `/architecture-decision ADR-0002 FrameClock 결정론적 시간 모델`
3. `/architecture-decision ADR-0005 CellCoord 좌표 정규화`

---

## Architecture Principles

본 프로젝트의 모든 기술 결정을 지배하는 5대 원칙. ADR/스토리 작성 시 이 원칙과 충돌하면 ADR 쪽이 재검토 대상이 된다.

1. **서버 권위 단일 진실 (Server-Authoritative Truth)**
   클라이언트는 낙관적 렌더까지만 담당. 폭발·사망·Goal 판정은 서버 검증 결과만 확정. 로컬 시뮬레이션은 서버 메시지로 재조정된다. 로컬 낙관적 표시와 서버 결과가 어긋날 경우 서버가 절대 우선.

2. **결정론적 시뮬레이션 (Deterministic Simulation)**
   모든 시간/폭발 스케줄은 `FrameClock.simulatedTime` 기반. 런타임 `Date.now()` 금지. `nextExplosionTime`, 패턴 선택, 틱 처리는 동일 입력·동일 시드에서 동일 출력이어야 한다(리플레이 가능성).

3. **공정한 가시성 (Fair Visibility)**
   Pillar "읽으면 이긴다"의 기술 전제. 모든 위험은 최소 `T_EX = 0.35s` 전부터 시각화. DeathReplay가 killer 셀을 정확히 재현할 수 있도록 이벤트 및 셀 상태 스냅샷을 보존한다. 숨겨진 위험은 설계 버그로 간주한다.

4. **단방향 레이어 의존 (Unidirectional Layer Dependency)**
   Presentation → Feature → Core → Foundation → Platform. 역방향 호출 금지. 예외는 Phase 2에 명시된 **2건만** 허용:
   - RoundEscalation → `GridSimulation.setGatePeriod` (ROUND_STARTED 직전 atomic 호출)
   - DeathReplay → `GridSimulation.getCellState` (read-only, killerGateCells 프리뷰용)

5. **이벤트 버스 단일 통신 (Event Bus as Single Comms)**
   모듈 간 직접 참조는 owner 공개 API(`I*` 인터페이스)를 통해서만. 그 외 통신은 모두 `EventBus` 타입-세이프 이벤트로. `emit`은 큐잉, `flush`는 `FrameClock.tick`에서 단일 호출하여 동기 재귀를 제거한다.

---

## Open Questions

다음 단계(ADR·구현·플레이테스트)에서 해소해야 할 미결 항목.

| ID | 질문 | 해소 시점 | 관련 |
|----|------|-----------|------|
| **OQ-1** | WebSocket 서버 구현체(자체 Node/Bun vs 매니지드) 확정 | Foundation ADR 이전 | ADR-0010 전제 |
| **OQ-2** | MVP에서 `SaveStore`가 필요한가 (서버 통계로 충분한가) | Core ADR 전 | ADR-0007/0010 범위 결정 |
| **OQ-3** | T3 패턴 5개 실디자인 (GDD W-7 유보) | Vertical Slice 단계 | ADR-0007 |
| **OQ-4** | 후반 동시 활성 시스템 5개 인지 부하 (W-9) | 플레이테스트 전 | 변경 시 ADR-0011 재검토 |
| **OQ-5** | 2인 매치 degenerate 전략 (W-10) | 플레이테스트 전 | ADR-0014 |
| **OQ-6** | BFS 이중 검증의 구현 분리 방식 (W-3) | Core 구현 단계 | ADR-0007/0009 |
| **OQ-7** | Toss 인토스 webview WebSocket 실기기 레이턴시 측정 | `/setup-engine refresh` 이후 실기기 테스트 | ADR-0010 튜닝 |
