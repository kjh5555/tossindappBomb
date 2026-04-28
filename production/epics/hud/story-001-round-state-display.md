# Story 001: 라운드 상태 디스플레이 (round number + alive count + timer)

> **Epic**: HUD
> **Status**: Complete
> **Layer**: Presentation
> **Type**: Integration
> **Manifest Version**: 2026-04-22

## Context

**GDD**: *None — system inferred. Acceptance criteria from ADR-0016.*
**Requirements**: ADR-0016 AC-HUD-02, AC-HUD-03 + round-manager.md event contract (ROUND_STARTED, ALIVE_COUNT_CHANGED, ROUND_END, GAME_OVER, timeRemaining)
*(No TR-hud-NNN registry entries yet — track via ADR-0016 directly until `/architecture-review` formalizes)*

**ADR Governing Implementation**: ADR-0016 (HUD Safe Area + Audio 채널 분리)
**ADR Decision Summary**: HUDLayer는 `applyInsets(safeArea)` 1회 적용. HUD 자식 노드는 HUDLayer 로컬 좌표만 사용. EventBus로 RoundManager 이벤트 구독 — `cc.Label` 컴포넌트로 round/alive/timer 표시. 타이머 카운트다운은 FrameClock.simulatedTime 기준 (ADR-0002).

**Engine**: Cocos Creator 3.8.6 (TypeScript) | **Risk**: MEDIUM
**Engine Notes**: `cc.Label`은 3.8.x 안정 API. `TossBridge.getSafeArea()` 호출은 `init()` 완료 후 1회만. `cc.view.getVisibleSize()` 직접 참조 금지 (HUDLayer 로컬 좌표만 사용). 단위 테스트는 `StubTossBridge({top:44, bottom:34})` 사용.

**Control Manifest Rules (Presentation layer)**:
- Required: HUDLayer는 `applyInsets(safeArea)` 1회 호출 (TossBridge.init() 후) — source: ADR-0016
- Required: HUD 자식 노드 모두 HUDLayer 로컬 좌표 기준 — source: ADR-0016
- Required: 텍스트는 `cc.Label`, 폰트 크기는 `HUDConfig.ts`에서 로드 (하드코딩 금지) — source: ADR-0016
- Required: 이벤트 구독은 `IEventBus.on()` (생성자 1회) — source: ADR-0001
- Required: 타이머는 `FrameClock.simulatedTime` 기준 (`Date.now()` 금지) — source: ADR-0002
- Forbidden: HUD 자식이 `getSafeArea()` 독립 호출 — source: ADR-0016
- Forbidden: `cc.view.getVisibleSize()` 직접 참조 in HUD children — source: ADR-0016

---

## Acceptance Criteria

*From ADR-0016 § Validation Criteria + round-manager.md event contract:*

- [ ] **AC-HUD-02**: `StubTossBridge(top=44, bottom=34, left=0, right=0)`로 HUDLayer 초기화 시 노드 position이 `(0, 34)`, contentSize가 `(screenW, screenH-78)`로 설정됨.
- [ ] **AC-HUD-03**: `ROUND_STARTED` 이벤트 수신 시 `roundLabel.string === "Round " + roundNumber`로 갱신됨.
- [ ] **AC-HUD-04**: `ALIVE_COUNT_CHANGED` 이벤트 수신 시 `aliveLabel.string === aliveCount + " alive"`로 갱신됨.
- [ ] **AC-HUD-05**: 라운드 진행 중 매 프레임 `update(dt)` 호출 시 `remainingTime -= dt`이고, `timeLabel.string`이 `remainingTime.toFixed(1) + "s"` 형식으로 갱신됨.
- [ ] **AC-HUD-06**: `ROUND_END` 또는 `GAME_OVER` 수신 시 카운트다운이 정지(이후 `update()`에서 `remainingTime` 변화 없음).
- [ ] **AC-HUD-07**: 다음 ROUND_STARTED 수신 시 카운트다운이 재시작 (`remainingTime = ROUND_TIME_LIMIT`).
- [ ] **AC-HUD-08**: HUDLayer 인스턴스는 `dispose()` 호출 시 `IEventBus.off()`로 모든 구독을 해제함.

---

## Implementation Notes

*Derived from ADR-0016 Implementation Guidelines + Decision § 1, § 5:*

### File Layout

```
src/presentation/hud/
├── HUDLayer.ts          (this story — main HUD orchestrator)
├── HUDConfig.ts         (this story — font sizes, label positions)
└── IRoundHUD.ts         (this story — interface for testability)
```

### `HUDLayer` 핵심 구조

```typescript
import type { IEventBus } from '../../core/events/IEventBus';
import type { IFrameClock } from '../../core/time/IFrameClock';
import type { ITossBridge } from '../../platform/toss/ITossBridge';

export const ROUND_TIME_LIMIT = 60.0;

export class HUDLayer {
  private roundLabel: { string: string };  // cc.Label.string proxy for testability
  private aliveLabel: { string: string };
  private timeLabel: { string: string };
  private remainingTime: number = ROUND_TIME_LIMIT;
  private countdownActive: boolean = false;
  private subscriptions: Array<() => void> = [];  // for off() cleanup

  constructor(
    private readonly bus: IEventBus,
    private readonly clock: IFrameClock,
    labels: { round: { string: string }; alive: { string: string }; time: { string: string } },
  ) {
    this.roundLabel = labels.round;
    this.aliveLabel = labels.alive;
    this.timeLabel = labels.time;

    const onRoundStarted = (e: { roundNumber: number }) => {
      this.roundLabel.string = `Round ${e.roundNumber}`;
      this.remainingTime = ROUND_TIME_LIMIT;
      this.countdownActive = true;
      this.timeLabel.string = `${this.remainingTime.toFixed(1)}s`;
    };
    const onAliveCount = (e: { aliveCount: number }) => {
      this.aliveLabel.string = `${e.aliveCount} alive`;
    };
    const onRoundEnd = () => { this.countdownActive = false; };
    const onGameOver = () => { this.countdownActive = false; };

    bus.on('ROUND_STARTED', onRoundStarted);
    bus.on('ALIVE_COUNT_CHANGED', onAliveCount);
    bus.on('ROUND_END', onRoundEnd);
    bus.on('GAME_OVER', onGameOver);

    this.subscriptions = [
      () => bus.off('ROUND_STARTED', onRoundStarted),
      () => bus.off('ALIVE_COUNT_CHANGED', onAliveCount),
      () => bus.off('ROUND_END', onRoundEnd),
      () => bus.off('GAME_OVER', onGameOver),
    ];
  }

  /** Per-tick update — decrement countdown when active. */
  update(dt: number): void {
    if (!this.countdownActive) return;
    this.remainingTime = Math.max(0, this.remainingTime - dt);
    this.timeLabel.string = `${this.remainingTime.toFixed(1)}s`;
  }

  /** Apply Toss safe area insets (called once by GameRoot after TossBridge.init()). */
  applyInsets(sa: { top: number; bottom: number; left: number; right: number }, screen: { width: number; height: number }): { position: { x: number; y: number }; contentSize: { width: number; height: number } } {
    const position = { x: sa.left, y: sa.bottom };
    const contentSize = {
      width: screen.width - sa.left - sa.right,
      height: screen.height - sa.top - sa.bottom,
    };
    return { position, contentSize };  // returned for cc.Node setPosition/setContentSize at integration site
  }

  /** Cleanup — unsubscribe all. Called on scene unload. */
  dispose(): void {
    for (const off of this.subscriptions) off();
    this.subscriptions = [];
  }
}
```

### Cocos integration (out of scope for this story's test — see Visual evidence)

The cc.Label / cc.Node integration happens in a thin Cocos wrapper script. The integration test uses plain object stand-ins (`{ string: '' }`) — this satisfies the `cc.Label.string` API surface used by HUDLayer.

---

## Out of Scope

*Handled by neighbouring stories — do not implement here:*

- **story-002**: 8×8 grid render + CELL_STATE_CHANGED handling + GOAL_PLACED highlight
- **story-003**: GAME_OVER / ROUND_CLEAR result overlay + Restart button
- **AC-HUD-01** (실기기 노치 검증): 실기 테스트로 별도 진행 — 이 스토리 자동화 범위 외

---

## QA Test Cases

*Integration test specs derived from ADR-0016 Validation Criteria.*

**AC-HUD-02** — Safe area 인셋 적용
- Given: `screen={width: 360, height: 800}`, `safeArea={top:44, bottom:34, left:0, right:0}`
- When: `hud.applyInsets(safeArea, screen)`
- Then: 반환값 `{position:{x:0,y:34}, contentSize:{width:360, height:722}}`

**AC-HUD-03** — ROUND_STARTED → roundLabel 갱신
- Given: hud 생성, roundLabel.string === '' (초기값)
- When: `bus.emit('ROUND_STARTED', {roundNumber: 3, ctx, timestamp:0})`; flush
- Then: `roundLabel.string === 'Round 3'`

**AC-HUD-04** — ALIVE_COUNT_CHANGED → aliveLabel 갱신
- Given: ROUND_STARTED 수신 후 상태
- When: `bus.emit('ALIVE_COUNT_CHANGED', {aliveCount: 4, timestamp: 0})`; flush
- Then: `aliveLabel.string === '4 alive'`

**AC-HUD-05** — update(dt) → remainingTime 감소 + timeLabel 갱신
- Given: ROUND_STARTED 수신 (countdownActive=true, remainingTime=60.0)
- When: `hud.update(0.1)`
- Then: `timeLabel.string === '59.9s'`; `remainingTime === 59.9`

**AC-HUD-06** — ROUND_END / GAME_OVER → 카운트다운 정지
- Given: ROUND_STARTED 수신, `update(0.1)` 1회 (timeLabel='59.9s')
- When: `bus.emit('ROUND_END', {roundNumber:1, timestamp:0})`; flush; `hud.update(0.1)`
- Then: `timeLabel.string === '59.9s'` (변화 없음); `remainingTime === 59.9`

**AC-HUD-07** — 다음 ROUND_STARTED → 카운트다운 재시작
- Given: ROUND_END 수신 후 (countdownActive=false)
- When: `bus.emit('ROUND_STARTED', {roundNumber:2, ctx, timestamp:0})`; flush; `hud.update(0.1)`
- Then: `timeLabel.string === '59.9s'`; `remainingTime === 59.9`; `roundLabel.string === 'Round 2'`

**AC-HUD-08** — dispose() → 구독 해제
- Given: hud 생성 직후
- When: `hud.dispose()`; `bus.emit('ROUND_STARTED', {roundNumber:5, ...})`; flush
- Then: `roundLabel.string === ''` (초기값 그대로 — 핸들러 미호출)

**Edge cases**:
- `update(0.1)` called before any ROUND_STARTED → countdownActive=false → no-op
- `update(100)` (큰 dt) → `remainingTime = max(0, 60 - 100) = 0` → `timeLabel.string === '0.0s'`
- 동일 flush 내 ROUND_STARTED + ALIVE_COUNT_CHANGED → 두 라벨 모두 갱신

---

## Test Evidence

**Story Type**: Integration
**Required evidence**: `tests/integration/hud/round_state_display_test.ts` — must exist and pass

**Status**: [x] `tests/integration/hud/round_state_display_test.ts` — 14 tests, all passing

---

## Completion Notes
**Completed**: 2026-04-27
**Criteria**: 8/8 passing (AC-HUD-02 ~ AC-HUD-08, plus edge cases)
**Deviations**: None — implementation matches ADR-0016 § 1 (applyInsets) and § 5 (event subscription) exactly. Labels are dependency-injected `IHUDLabel` interface to enable Cocos-free testing; production wires real `cc.Label` instances at the integration site.
**Test Evidence**: Integration: tests/integration/hud/round_state_display_test.ts — 14 tests, all passing (362 total suite)
**Code Review**: Skipped — Lean mode

---

## Dependencies

- Depends on: S5-M1 (HUD EPIC + 스토리 생성) — DONE
- Depends on: RoundManager (S4-M2/M3) — emits ROUND_STARTED/ALIVE_COUNT_CHANGED/ROUND_END/GAME_OVER — DONE
- Unlocks: story-002 (Grid render — same HUDLayer Cocos node parent), story-003 (Result overlay — same z:30 layer)
