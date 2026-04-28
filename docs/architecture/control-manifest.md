# Control Manifest

> **Engine**: Cocos Creator 3.8.6 (TypeScript)
> **Last Updated**: 2026-04-22
> **Manifest Version**: 2026-04-22
> **ADRs Covered**: ADR-0001, ADR-0002, ADR-0003, ADR-0004, ADR-0005, ADR-0006, ADR-0007, ADR-0008, ADR-0009, ADR-0010, ADR-0011, ADR-0012, ADR-0013, ADR-0014, ADR-0015, ADR-0016
> **Status**: Active — regenerate with `/create-control-manifest` when ADRs change

`Manifest Version` is the date this manifest was generated. Story files embed
this date when created. `/story-readiness` compares a story's embedded version
to this field to detect stories written against stale rules. Always matches
`Last Updated` — they are the same date, serving different consumers.

This manifest is a programmer's quick-reference extracted from all Accepted ADRs,
technical preferences, and engine reference docs. For the reasoning behind each
rule, see the referenced ADR.

---

## Foundation Layer Rules

*Applies to: `src/core/events/`, `src/core/time/`, `src/core/input/`, `src/core/net/`, `src/platform/`*

### Required Patterns

- **모든 모듈 간 이벤트는 `IEventBus.emit<K>(key, payload)` 경유** — `GameEvents` 인터페이스로 컴파일 타임 타입 검증 필수 — source: ADR-0001
- **`emit()` 는 큐 추가만 수행** — 핸들러를 즉시 호출하지 않는다. 동일 tick에서 핸들러 실행 금지 — source: ADR-0001
- **`flush()` 는 `FrameClock.tick()` 에서만 호출** — 프레임당 정확히 1회. 다른 호출자 없음 — source: ADR-0001
- **`flush()` 재진입 방지 구현** — `flush()` 실행 중 `emit()` 된 이벤트는 현재 큐 스냅샷 처리 후 다음 프레임 — source: ADR-0001
- **`on()/off()` 는 초기화/소멸 시점에만 호출** — `flush()` 실행 중 구독 변경 금지 — source: ADR-0001
- **모든 게임 로직 시간 참조는 `IFrameClock.now()` 사용** — `simulatedTime` (seconds, float) 반환 — source: ADR-0002
- **`FrameClock.tick(dt)` 는 Cocos `update(dt)` 콜백에서만 호출** — 프레임당 정확히 1회 — source: ADR-0002
- **`tick()` 내 실행 순서 반드시 준수**: `simulatedTime += dt` → 스케줄 만료 체크 → `EventBus.flush()` — source: ADR-0002
- **시간 기반 지연은 `FrameClock.schedule(fn, delay)` 사용** — simulatedTime 기준 상대 딜레이, 결정론적 — source: ADR-0002
- **스케줄 취소는 `FrameClock.cancelSchedule(fn)` 사용** — source: ADR-0002
- **5-tier 단방향 레이어 의존 준수**: Platform → Foundation → Core → Feature → Presentation (위에서 아래 방향만) — source: ADR-0003
- **레이어 간 통신은 `IEventBus` 이벤트 또는 `I*` 인터페이스 메서드 호출만** — 구체 클래스 직접 참조 금지 — source: ADR-0003
- **레이어 경계 예외 1 (허용)**: `RoundEscalation → GridSimulation.setGatePeriod()` — `RoundManager.startRound()` 내부에서만 허용. precondition: `seconds ∈ [GATE_PERIOD_FLOOR, GATE_PERIOD_BASE]` — source: ADR-0003
- **레이어 경계 예외 2 (허용)**: `DeathReplay → GridSimulation.getCellState()` — PLAYER_KILLED 핸들러 내부에서만 허용. read-only. 쓰기 메서드 호출 절대 금지 — source: ADR-0003
- **Platform SDK 접근은 `ITossBridge` DI 경유** — `src/platform/TossBridge.ts` 단일 위치. Foundation/Core/Feature/Presentation은 `ITossBridge` 인터페이스만 의존 — source: ADR-0004
- **`TossBridge.init()` 는 `GameRoot.onLoad()` 최초 실행** — EventBus/FrameClock 초기화보다 먼저 완료 — source: ADR-0004
- **단위 테스트에서 `StubTossBridge` 사용** — `{ top: 44, bottom: 34, left: 0, right: 0 }` stub safe area — source: ADR-0004
- **`TossBridge.init()` 실패 시 ErrorScreen 표시 후 게임 루프 시작 금지** — source: ADR-0004

### Forbidden Approaches

- **Never `cc.EventTarget` 직접 사용** for 모듈 간 이벤트 — 타입 안전성 없음, 레이어 경계 위반 — source: ADR-0001
- **Never 동기 즉시-통지 EventBus** — `emit()` 시 핸들러 즉시 실행 금지. GRID_STALLED 3자 체인에서 스택 오버플로우 유발 — source: ADR-0001
- **Never `flush()` 를 `FrameClock.tick()` 외부에서 호출** — invariant 위반 — source: ADR-0001
- **Never `Date.now()` in 게임 로직** — 비결정론적, 서버-클라이언트 타임스탬프 불일치 — source: ADR-0002
- **Never `performance.now()` in 게임 로직** — 동일 이유 — source: ADR-0002
- **Never `director.getTotalTime()` in 게임 로직** — mock 불가, 단위 테스트 불가 — source: ADR-0002
- **Never `tick()` 를 Cocos `update(dt)` 외부에서 호출** — source: ADR-0002
- **Never 하위 레이어가 상위 레이어 모듈 직접 import** — 역방향 의존 금지 — source: ADR-0003
- **Never 레이어 스킵 직접 참조** (예: Presentation → Core 직접 호출, 예외 2 제외) — source: ADR-0003
- **Never ADR-0003 개정 없이 새 레이어 경계 예외 추가** — source: ADR-0003
- **Never `@apps-in-toss/web-framework` 직접 import** in Foundation/Core/Feature/Presentation 레이어 — source: ADR-0004
- **Never `getSafeArea()` / `getUserToken()` 호출 전 `init()` 완료 확인 없이** — throws if called before init — source: ADR-0004
- **Never `TossBridge.init()` 를 2회 이상 호출** — source: ADR-0004

### Performance Guardrails

- **EventBus flush 오버헤드**: 이벤트 20개/프레임 기준 < 0.2ms — source: ADR-0001
- **FrameClock tick() 오버헤드**: 스케줄 수 ~10/프레임 기준 < 0.1ms — source: ADR-0002
- **TossBridge init() 지연**: SDK 응답 < 500ms 기대 (첫 화면 표시 지연에 직접 영향) — source: ADR-0004

---

## Core Layer Rules

*Applies to: `src/core/grid/`, `src/core/player/`, `src/core/patterns/`, `src/core/persistence/`, `src/core/net/auth/`*

### Required Patterns

- **모든 게임 로직 셀 참조는 `CellCoord = { row: number; col: number }` 사용** — `src/core/grid/CellCoord.ts` import — source: ADR-0005
- **직렬화 변환은 반드시 `cellToIndex()` / `indexToCell()` 사용** — 인라인 계산 금지 — source: ADR-0005
- **셀 범위 검증은 `isValidCell(c)` 사용** — row/col 0–7 범위 외 값 guard — source: ADR-0005
- **Gate Period 공식 F-RE-1**: `GATE_PERIOD(R) = max(GATE_PERIOD_FLOOR, GATE_PERIOD_BASE - (R-1) × GATE_PERIOD_STEP)` — `RoundEscalation.computeGatePeriod()` 단독 구현 — source: ADR-0006
- **`GridSimulation.setGatePeriod()` 호출은 `ROUND_STARTED` emit 이전** — `RoundManager.startRound()` 내부 순서: setGatePeriod → emit(ROUND_STARTED) → emit(ESCALATION_COMPUTED) — source: ADR-0006
- **`setGatePeriod()` 범위 검증**: 범위 `[GATE_PERIOD_FLOOR, GATE_PERIOD_BASE]` 위반 시 적용 거부 + `console.warn` — source: ADR-0006
- **Gate Period 상수**: `BASE=2.0s`, `FLOOR=1.4s` (≥1.2s 필수), `STEP=0.05s`, `T_EX=0.35s`, `SAFE_WIN_MIN=0.45s` — source: ADR-0006
- **패턴 데이터는 TypeScript 정적 상수 배열** — `src/core/patterns/PatternData.ts` static import. 비동기 로딩 없음 — source: ADR-0007
- **Tier별 패턴 풀 최소 6개** (`MIN_POOL_PER_TIER = 6`) — source: ADR-0007
- **N_recent 반복 제외**: `N_recent = min(3, floor(pool/2))` — source: ADR-0007
- **패턴 결정론적 선택**: `candidates[seed % candidates.length]` — 동일 seed+tier → 동일 패턴 보장 — source: ADR-0007
- **런타임 패턴 검증**: `64 - cells.length >= 8` AND BFS 단일 연결 구역 — source: ADR-0007
- **3회 연속 검증 실패 시 `GRID_STALLED` emit** — source: ADR-0007
- **빌드 타임 BFS 검증**: `bfsVerified=true` 패턴만 풀에 포함 — source: ADR-0007
- **이동 시 `PLAYER_MOVED` 즉시 emit(t=0)** — 논리 좌표가 `to`로 갱신된 이후 발행 — source: ADR-0008
- **`PLAYER_ARRIVED` 는 `FrameClock.schedule(fn, MOVE_TWEEN_DURATION)` 로 큐잉(t=0.1s)** — `MOVE_TWEEN_DURATION = 0.1` — source: ADR-0008
- **논리 좌표(`logicalPosition`) 갱신은 `PLAYER_MOVED` emit 이전** — 폭발 판정은 논리 좌표 기준 — source: ADR-0008
- **`PLAYER_KILLED` / `ROUND_CLEAR` / `GAME_OVER` 수신 시 `cancelSchedule(pendingArrived)` 즉시 호출** — source: ADR-0008
- **GRID_STALLED 체인은 전부 EventBus flush 큐 경유** — 동기 직접 호출 체인 금지 — source: ADR-0009
- **RoundEscalation GRID_STALLED 핸들러 책임**: `fallbackTier = max(1, lastTier-1)` 계산 후 `ESCALATION_COMPUTED(stalledFallback=true)` emit만 — setGatePeriod 재호출 없음 — source: ADR-0009
- **PatternLibrary: `stalledFallback=true` ESCALATION_COMPUTED 수신 시 강등 tier로 재선택** — source: ADR-0009
- **GridSimulation: Tier 1 3회 실패 후 빈 패턴 적용** — 라운드 스킵 처리 — source: ADR-0009
- **서버(Node.js WebSocket)가 권위를 갖는 상태**: 라운드 seed, PLAYER_KILLED 확정, 라운드 전환(STARTED/CLEAR/OVER) — source: ADR-0010
- **모든 서버 통신은 `IWebSocketClient` 인터페이스 경유** — `src/core/net/WebSocketClient.ts`, Foundation 레이어 — source: ADR-0010
- **WebSocket 메시지 수신 시 `CellIndex → CellCoord` 즉시 변환** (`indexToCell()`) — 게임 로직에 CellIndex 미도달 — source: ADR-0010
- **서버 메시지는 `EventBus.emit()` 으로 변환 후 처리** — WebSocketClient가 직접 게임 상태 변경 금지 — source: ADR-0010
- **단위 테스트에서 `MockWebSocketClient` 사용** — `simulateMessage()` 헬퍼로 서버 메시지 시뮬레이션 — source: ADR-0010
- **WebSocket 인증 토큰은 `TossBridge.getUserToken()` 사용** — source: ADR-0010

### Forbidden Approaches

- **Never `CellIndex` (number) in 게임 로직** (GridSimulation, PlayerMovement, PatternLibrary 등) — row/col 의미 손실, swap 버그 방지 불가 — source: ADR-0005
- **Never `{x, y}` 좌표계 사용** for 그리드 셀 — GDD는 row/col 전제 작성, x/y 매핑 시 혼란 — source: ADR-0005
- **Never 인라인 `row * 8 + col` 계산** — `cellToIndex()` 사용 필수 — source: ADR-0005
- **Never `setGatePeriod()` 호출 during GRID_STALLED 체인** — 진행 중인 게이트 리듬 깨짐 — source: ADR-0006
- **Never `GATE_PERIOD_FLOOR` 를 1.2s 미만으로 설정** — SAFE_WIN_MIN(0.45s) 위반 — source: ADR-0006
- **Never 범위 위반 `setGatePeriod()` 값 적용 없이 통과** — 반드시 거부 + 경고 로그 — source: ADR-0006
- **Never `bfsVerified=false` 패턴을 선택 풀에 포함** — source: ADR-0007
- **Never `cc.resources.load()` 비동기 로딩으로 패턴 데이터 취득 (MVP)** — source: ADR-0007
- **Never Goal Cell 도달 판정을 `PLAYER_MOVED` 시점에 수행** — `PLAYER_ARRIVED` 시점에만 — source: ADR-0008
- **Never 폭발 판정을 `PLAYER_ARRIVED` 시점에 수행** — `PLAYER_MOVED` 시점(논리 좌표 기준)에만 — source: ADR-0008
- **Never Dead 상태 플레이어가 `PLAYER_ARRIVED` emit** — `cancelSchedule` 없이 사망 처리 금지 — source: ADR-0008
- **Never GRID_STALLED 체인을 동기 직접 호출로 구현** (PatternLibrary→RoundEscalation 직접 호출) — 스택 오버플로우, 레이어 경계 위반 — source: ADR-0009
- **Never `setGatePeriod()` during GRID_STALLED 핸들러** — source: ADR-0009
- **Never native `WebSocket` API 직접 사용** (IWebSocketClient 우회) — 단위 테스트 불가 — source: ADR-0010
- **Never `IWebSocketClient` 를 Feature/Presentation 레이어에서 직접 사용** — Foundation(`src/core/net/`) 전용 — source: ADR-0010
- **Never WebSocket 메시지 핸들러에서 직접 게임 상태 변경** — EventBus 경유 필수 — source: ADR-0010

### Performance Guardrails

- **패턴 선택 (`selectPattern`)**: 라운드당 1회, < 1ms — source: ADR-0007
- **GRID_STALLED 체인 최대 깊이**: 9프레임 (~150ms at 60fps) — source: ADR-0009
- **WebSocket JSON parse/stringify**: 메시지 ~5–10/라운드 기준 < 0.1ms — source: ADR-0010
- **`setGatePeriod()` 갱신**: 게이트 셀 수 (최대 64) × offset 재계산 < 0.1ms — source: ADR-0006
- **WebSocket 네트워크 트래픽**: 최대 ~200 bytes/msg × 6인 × 10msg/s = ~12KB/s — source: ADR-0010

---

## Feature Layer Rules

*Applies to: `src/features/` — `src/features/round/`, `src/features/session/`, `src/features/lobby/`*

### Required Patterns

- **RoundManager FSM 상태는 `RoundPhase` 타입 4개 중 하나** — `'IDLE' | 'ROUND_ACTIVE' | 'ROUND_CLEAR_DISPLAY' | 'GAME_OVER'`. FSM 외부에서 직접 phase 변경 금지 — source: ADR-0011
- **모든 RoundManager 이벤트 핸들러는 phase guard 진입** — `if (this.phase !== 'ROUND_ACTIVE') return;` 패턴 필수 (EC-RM-4, EC-RM-6) — source: ADR-0011
- **Goal Cell 배치는 F-RM-1 공식 적용** — `goalCellIndex = nextExplosionTime(pathCells[N-1]) < GATE_PERIOD ? N-2 : N-1`. 1단계 폴백만, 체인 폴백 없음 — source: ADR-0011
- **ROUND_CLEAR_DISPLAY 타이머는 `FrameClock.schedule(ROUND_CLEAR_DISPLAY_DURATION, callback)`** — `cc.tween`, `setTimeout` 사용 금지 — source: ADR-0011, ADR-0002
- **`ROUND_CLEAR` 이벤트 발행 전 `setGatePeriod()` 완료 보장** — ADR-0006 순서 계약 유지 — source: ADR-0011
- **스펙테이터 상태는 `PlayerStatus` enum으로 관리** — `'ALIVE' | 'SPECTATOR'`. RoundManager FSM에 스펙테이터 state 추가 금지 — source: ADR-0013
- **부활 마킹(`markAllAliveForNextRound`)은 `triggerRoundClear()` 내부에서 즉시 실행** — ROUND_END/ROUND_STARTED 지연 금지 — source: ADR-0013
- **재진입 위치는 항상 `pathIndex = 0`** — EC-RM-7: 폴백 코드 추가 금지 — source: ADR-0013
- **응원 rate-limit은 `lastCheerTime` 타임스탬프 비교** — `(simulatedTime - lastCheerTime) >= GATE_PERIOD`. `FrameClock.schedule` cooldown 타이머 금지 — source: ADR-0013
- **`MIN_MATCH_SIZE`는 `process.env.MIN_MATCH_SIZE`에서 읽기** — 하드코딩 금지 — source: ADR-0014
- **`totalPlayers`는 `MATCH_READY.playerIds.length`에서 파생** — 별도 전달 경로 금지 — source: ADR-0014

### Forbidden Approaches

- **Never** RoundManager FSM에 5번째 state 추가 — 스펙테이터는 per-player 상태 — source: ADR-0013
- **Never** 두 번째 `PLAYER_ARRIVED` (동시 Goal Cell 도착)에 별도 tie-break 분기 추가 — phase guard가 유일한 enforcement — source: ADR-0012
- **Never** `PLAYER_ARRIVED.timestamp`를 클리어 결정에 사용 — 클라이언트 클록 불신뢰 (ADR-0010) — source: ADR-0012
- **Never** Goal Cell 폴백을 2단계 이상 체인 — EC-RM-1: 1단계 폴백만 — source: ADR-0011
- **Never** `ROUND_CLEAR_DISPLAY` 상태에서 생사 상태 변경 처리 — EC-RM-4 — source: ADR-0011
- **Never** `GAME_OVER` 이벤트 중복 발행 — `state === 'ROUND_ACTIVE'` 가드 필수 (EC-RM-6) — source: ADR-0011

### Performance Guardrails

- **RoundManager tick 처리**: 프레임당 O(players) — 최대 6인, 상수 시간 상당 — source: ADR-0013

---

## Presentation Layer Rules

*Applies to: `src/presentation/` — `src/presentation/hud/`, `src/presentation/feedback/`, `src/presentation/audio/`*

### Required Patterns

- **레이어 z-order 고정**: BackgroundLayer(z:0) → GridLayer(z:10) → FairFeedbackLayer(z:20) → HUDLayer(z:30) — source: ADR-0015, ADR-0016
- **FairFeedbackLayer는 단일 `cc.Graphics` 컴포넌트만 사용** — 복수 Graphics 또는 스프라이트 노드 금지 — source: ADR-0015
- **`redrawOverlay()`는 항상 `g.clear()` 후 재그림** — 잔상 방지 — source: ADR-0015
- **700ms 타이머는 `FrameClock.schedule(FEEDBACK_DURATION, callback)`** — `cc.tween`, `setTimeout` 금지 — source: ADR-0015, ADR-0002
- **tap-to-skip 핸들러는 touch 캡처 페이즈 등록** — `node.on('touchstart', handler, this, true)` — source: ADR-0015
- **HUD Safe Area는 `HUDLayer.applyInsets(safeArea)`에서 단일 적용** — 각 HUD 자식이 `getSafeArea()` 직접 호출 금지 — source: ADR-0016
- **`applyInsets()`는 `TossBridge.init()` 완료 후 정확히 1회 호출** — 런타임 재호출 금지 — source: ADR-0016
- **HUD 자식 노드는 HUDLayer 로컬 좌표 기준 배치** — `cc.view.getVisibleSize()` 직접 참조 금지 — source: ADR-0016
- **AudioManager 3채널 구조 유지**: BGM(`loop:true`) / SFX(`playOneShot`) / UIFeedback(`playOneShot`) — source: ADR-0016
- **오디오 이벤트는 `AUDIO_EVENT` EventBus 경유** — FairFeedback/RoundManager가 `cc.AudioSource`를 직접 접근 금지 — source: ADR-0016
- **BGM 교체 순서**: `stopBGM()` → `playBGM(newClip)` — `.clip` 직접 할당 후 `play()` 금지 — source: ADR-0016
- **로컬 플레이어 필터**: `PLAYER_KILLED.playerIds.includes(localPlayerId)` 확인 후 오버레이 트리거 — source: ADR-0015

### Forbidden Approaches

- **Never** 절대 픽셀 좌표 하드코딩 — `cellToPixel(cell, gridOrigin, cellSize)` 변환 사용 — source: ADR-0015
- **Never** FairFeedback에서 GridLayer 상태 직접 읽기 (읽기 전용 EventBus 구독만 허용) — source: ADR-0015
- **Never** `killerGateCells`가 빈 배열일 때 오버레이 트리거 — `FEEDBACK_MISSING_CAUSE` 발행으로 대체 — source: ADR-0015
- **Never** cc.tween으로 FairFeedback 펄스/타이머 구현 — FrameClock 결정론 위반 — source: ADR-0015
- **Never** 원격 플레이어 `PLAYER_KILLED` 이벤트로 로컬 오버레이 트리거 — source: ADR-0015
- **Never** HUD 자식 컴포넌트가 `getSafeArea()` 독립 호출 — source: ADR-0016

### Performance Guardrails

- **FairFeedback `update()`**: `killerCells` 배열 순회 — 최대 N셀(그리드 64셀 이하). 단일 Graphics 컴포넌트 배치 처리로 draw call 1회 유지 — source: ADR-0015
- **HUD `update()`**: 타이머 카운트다운 1개 float 연산 + 레이블 업데이트. ≤0.1ms/frame — source: ADR-0016

---

## Global Rules (All Layers)

### Naming Conventions

| Element | Convention | Example |
|---------|-----------|---------|
| Classes | PascalCase | `GridManager`, `PlayerNode` |
| Variables | camelCase | `moveSpeed`, `currentRound` |
| Methods | camelCase | `onCellExplode()`, `startRound()` |
| Events/Signals | on + PascalCase | `onGameOver`, `onRoundStart` |
| Files | PascalCase matching class | `GridManager.ts`, `PlayerNode.ts` |
| Scenes/Prefabs | PascalCase | `GameScene.scene`, `CellPrefab.prefab` |
| Constants | UPPER_SNAKE_CASE | `MAX_ROUND`, `GRID_SIZE`, `EXPLOSION_DELAY` |

### Performance Budgets

| Target | Value | Notes |
|--------|-------|-------|
| Framerate | 60fps | — |
| Frame budget | 16.6ms | 모바일 webview 기준 |
| Draw calls | ≤50 | 모바일 webview 기준 |
| Memory ceiling | ≤150MB | 모바일 webview 기준 |

### Testing Requirements

| Requirement | Detail |
|-------------|--------|
| Framework | Jest (TypeScript unit tests) 또는 Cocos Creator 내장 테스트 |
| Min coverage | 핵심 게임 로직 70% (그리드 폭발, 라운드 매니저, 멀티플레이어 동기화) |
| Required test suites | 그리드 폭발 패턴 유효성 / 라운드 에스컬레이션 로직 / WebSocket 메시지 처리 |
| Determinism | 모든 테스트는 동일 결과 재현. 랜덤 시드 사용 금지. 시간 의존 로직은 `IFrameClock` mock 사용 |

### Approved Libraries / Addons

- `@apps-in-toss/web-framework` — 토스 인토스 SDK (필수). **단, `ITossBridge` 경유로만 접근** — source: ADR-0004

### Platform Constraints

- **Input**: Touch 전용. hover 인터랙션 사용 금지
- **Safe Area**: 모든 UI 레이아웃은 `ITossBridge.getSafeArea()` 기준 여백 적용 필수
- **Target**: 토스 인토스 webview (모바일)

### Cross-Cutting Invariants

모든 레이어에서 항상 성립해야 하는 불변 조건:

1. **서버 권위 단일 진실**: 라운드 seed, PLAYER_KILLED, 라운드 전환은 서버 값 우선 — source: ADR-0010
2. **결정론적 시뮬레이션**: 동일 seed + simulatedTime → 동일 결과 — source: ADR-0002, ADR-0007
3. **공정한 가시성**: 모든 플레이어에게 동일 정보 동일 타이밍 — source: ADR-0010
4. **단방향 레이어 의존**: Platform → Foundation → Core → Feature → Presentation 방향만 — source: ADR-0003
5. **이벤트 버스 단일 통신**: 모듈 간 직접 참조 금지, `IEventBus` 경유 — source: ADR-0001

---

## Engine-Specific Notes (Cocos Creator 3.8.6)

- **Bloom intensity**: `setSharedMaterial()` 재적용 시 `forceUpdate: true` 파라미터 필수 — source: VERSION.md breaking changes
- **UISkew**: `setSkew()` 호출 전 `UISkew` 컴포넌트 노드에 추가 필수 — source: VERSION.md breaking changes
- **Renderer.setSharedMaterial**: 동일 material 객체 재사용 시 `forceUpdate` 없으면 미적용 — source: VERSION.md breaking changes
- **`@apps-in-toss/web-framework` API**: LLM 훈련 범위 외 — 실기기 샌드박스 검증 필수 — source: ADR-0004

---

*이 manifest는 10개 Accepted ADR에서 자동 추출되었습니다. ADR 변경 시 `/create-control-manifest` 재실행 필수.*
