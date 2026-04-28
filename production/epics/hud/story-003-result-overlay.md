# Story 003: Result Overlay (Game Over / Round Clear) + Restart 버튼

> **Epic**: HUD
> **Status**: Complete
> **Layer**: Presentation
> **Type**: Integration
> **Manifest Version**: 2026-04-22

## Context

**GDD**: `design/gdd/round-manager.md` (GAME_OVER / ROUND_CLEAR 이벤트 계약)
**Requirements**: ADR-0011 GAME_OVER 발행 계약, ADR-0011 ROUND_CLEAR 발행 계약, story-003-session-flow-stub.md SessionFlow.reset() API
*(No TR-hud-NNN registry entries yet — track via ADR-0016/ADR-0011 directly)*

**ADR Governing Implementation**: ADR-0016 (HUDLayer z:30) + ADR-0011 (RoundManager FSM 이벤트) + (story-003 SessionFlow stub for reset() pattern)
**ADR Decision Summary**: Result Overlay은 HUDLayer 자식으로 배치 (z:30, 최상위). 초기 visible=false. GAME_OVER → "Game Over" 텍스트 표시 + visible=true. ROUND_CLEAR → "Round Clear" 텍스트 표시 + visible=true. Restart 버튼 클릭 시 SessionFlow.reset() 호출 → state MENU 복귀 → overlay visible=false.

**Engine**: Cocos Creator 3.8.6 (TypeScript) | **Risk**: MEDIUM
**Engine Notes**: `cc.Button` 클릭 핸들러는 Cocos UI 시스템 사용. 단위 테스트는 `IButton` 인터페이스 추상화로 모킹. Restart 버튼 터치 영역은 ≥ 48px (`design/accessibility-requirements.md`). z-order = HUDLayer (z:30) — DeathReplay와 충돌 시 DeathReplay(z:20) 위에 표시.

**Control Manifest Rules (Presentation layer)**:
- Required: 레이어 z-order — HUDLayer(z:30) — source: ADR-0015, ADR-0016
- Required: 이벤트 구독은 `IEventBus.on()` (생성자 1회) — source: ADR-0001
- Required: SessionFlow.reset() 호출만 허용 — `RoundManager.startRound()` 직접 호출 금지 (레이어 경계) — source: ADR-0003
- Forbidden: `setTimeout` 또는 `cc.tween`으로 overlay 자동 숨김 — `FrameClock.schedule` 사용 — source: ADR-0002, ADR-0015
- Forbidden: HUD 자식이 `cc.view.getVisibleSize()` 직접 참조 — source: ADR-0016

---

## Acceptance Criteria

- [ ] **AC-OVR-01**: 초기 상태에서 overlay.visible === false; messageLabel.string === ''.
- [ ] **AC-OVR-02**: `GAME_OVER` 이벤트 수신 + flush → overlay.visible === true; messageLabel.string === 'Game Over'.
- [ ] **AC-OVR-03**: `ROUND_CLEAR` 이벤트 수신 + flush → overlay.visible === true; messageLabel.string === 'Round Clear'.
- [ ] **AC-OVR-04**: GAME_OVER 수신 후 ROUND_CLEAR 수신 (같은 flush) → overlay 1회만 표시; 첫 이벤트의 메시지 우선 (FIFO).
- [ ] **AC-OVR-05**: Restart 버튼 클릭 시 `sessionFlow.reset()` 호출 + overlay.visible === false + messageLabel.string === ''.
- [ ] **AC-OVR-06**: Restart 후 SessionFlow가 MENU 상태이면 overlay 비표시 유지.
- [ ] **AC-OVR-07**: 새 GAME_OVER 수신 → overlay 다시 표시 (재시작 가능).
- [ ] **AC-OVR-08**: dispose() 호출 시 모든 EventBus 구독 + 버튼 핸들러 해제.

---

## Implementation Notes

*Derived from ADR-0016 z-order + ADR-0011 event contract + story-003 SessionFlow.reset() API:*

### File Layout

```
src/presentation/hud/
├── ResultOverlay.ts     (this story — main overlay logic)
└── IButton.ts           (this story — abstraction for testability)
```

### `ResultOverlay` 핵심 구조

```typescript
import type { IEventBus } from '../../core/events/IEventBus';
import type { SessionFlow } from '../../features/session/SessionFlow';

export interface IButton {
  onClick(handler: () => void): void;
  offClick(handler: () => void): void;
}

export interface IOverlayNode {
  visible: boolean;
}

export interface ILabel {
  string: string;
}

export class ResultOverlay {
  private subscriptions: Array<() => void> = [];
  private clickHandler: () => void;
  private alreadyShown: boolean = false;  // FIFO guard for AC-OVR-04

  constructor(
    private readonly bus: IEventBus,
    private readonly sessionFlow: SessionFlow,
    private readonly node: IOverlayNode,
    private readonly messageLabel: ILabel,
    private readonly restartButton: IButton,
  ) {
    this.node.visible = false;
    this.messageLabel.string = '';

    const onGameOver = () => this.show('Game Over');
    const onRoundClear = () => this.show('Round Clear');

    bus.on('GAME_OVER', onGameOver);
    bus.on('ROUND_CLEAR', onRoundClear);

    this.clickHandler = () => this.handleRestart();
    restartButton.onClick(this.clickHandler);

    this.subscriptions = [
      () => bus.off('GAME_OVER', onGameOver),
      () => bus.off('ROUND_CLEAR', onRoundClear),
      () => restartButton.offClick(this.clickHandler),
    ];
  }

  private show(message: string): void {
    if (this.alreadyShown) return;  // AC-OVR-04: FIFO — first event wins per cycle
    this.alreadyShown = true;
    this.messageLabel.string = message;
    this.node.visible = true;
  }

  private handleRestart(): void {
    this.sessionFlow.reset();
    this.node.visible = false;
    this.messageLabel.string = '';
    this.alreadyShown = false;  // AC-OVR-07: allow re-trigger after restart
  }

  dispose(): void {
    for (const off of this.subscriptions) off();
    this.subscriptions = [];
  }
}
```

### Test fakes

```typescript
class FakeButton implements IButton {
  private handlers: Array<() => void> = [];
  onClick(h: () => void): void { this.handlers.push(h); }
  offClick(h: () => void): void {
    const i = this.handlers.indexOf(h);
    if (i !== -1) this.handlers.splice(i, 1);
  }
  click(): void { for (const h of this.handlers) h(); }  // simulate click
}
```

### Cocos integration (out of scope for automated test)

The actual `cc.Button` and `cc.Label` and `cc.Node` (visibility) are wired by a thin Cocos wrapper script that conforms to `IButton` / `ILabel` / `IOverlayNode`. The test uses fakes.

---

## Out of Scope

- Animated transitions (overlay fade-in/out) — Sprint 6 polish
- Difficulty/round summary stats on the overlay — Sprint 5 N2 difficulty data
- "Next Round" vs "Game Over" branching UI — current scope is single message + restart
- Full-screen modal background dim — visual polish, defer

---

## QA Test Cases

**AC-OVR-01** — 초기 상태
- Given: 새 ResultOverlay 인스턴스
- When: (생성자 완료 직후)
- Then: `node.visible === false`; `messageLabel.string === ''`

**AC-OVR-02** — GAME_OVER → Game Over 표시
- Given: 초기 상태
- When: `bus.emit('GAME_OVER', {finalRound:5, rankings:['p1'], timestamp:0})`; flush
- Then: `node.visible === true`; `messageLabel.string === 'Game Over'`

**AC-OVR-03** — ROUND_CLEAR → Round Clear 표시
- Given: 초기 상태
- When: `bus.emit('ROUND_CLEAR', {roundNumber:1, survivors:['p1'], timestamp:0})`; flush
- Then: `node.visible === true`; `messageLabel.string === 'Round Clear'`

**AC-OVR-04** — 동시 이벤트 → FIFO (첫 이벤트 표시)
- Given: 초기 상태
- When: `bus.emit('GAME_OVER', ...)`; `bus.emit('ROUND_CLEAR', ...)`; flush
- Then: `node.visible === true`; `messageLabel.string === 'Game Over'` (첫 이벤트 우선)

**AC-OVR-05** — Restart 버튼 클릭 → reset + overlay 숨김
- Given: GAME_OVER 표시 후
- When: `fakeButton.click()`
- Then: `sessionFlow.getState() === 'MENU'`; `node.visible === false`; `messageLabel.string === ''`

**AC-OVR-06** — Restart 후 추가 이벤트 없이 → 비표시 유지
- Given: Restart 직후 (SessionFlow.MENU)
- When: (no new event); flush
- Then: `node.visible === false`

**AC-OVR-07** — Restart 후 새 GAME_OVER → 재표시
- Given: Restart 후 비표시 → SessionFlow.startMatch() → MATCH 상태
- When: `bus.emit('GAME_OVER', ...)`; flush
- Then: `node.visible === true`; `messageLabel.string === 'Game Over'`

**AC-OVR-08** — dispose() → 구독 해제
- Given: 정상 동작 중
- When: `overlay.dispose()`; `bus.emit('GAME_OVER', ...)`; flush; `fakeButton.click()`
- Then: `node.visible === false` (이벤트 핸들러 미호출); `sessionFlow.getState()` 변화 없음 (버튼 핸들러 미호출)

**Edge cases**:
- ROUND_CLEAR 후 GAME_OVER (동일 cycle) → 두 번째 이벤트 무시 (alreadyShown guard)
- Restart → 다음 GAME_OVER → Restart → 다음 GAME_OVER (3회 cycle) → 매번 재표시 정상 동작
- dispose() 중복 호출 → throw 없음 (subscriptions 빈 배열 후 재호출 안전)

**Manual evidence (UI walkthrough)**:
- Setup: Sprint 5 빌드, 단일 플레이어 라운드 진행 → 사망 또는 골 도달
- Verify: Overlay 1프레임 내 표시; Restart 버튼 ≥ 48px 터치 영역; 클릭 시 메뉴로 복귀
- Pass: 클릭 후 다음 라운드 진입 가능 (SessionFlow MENU → MATCH 사이클)

---

## Test Evidence

**Story Type**: Integration
**Required evidence**:
- `tests/integration/hud/result_overlay_test.ts` — must exist and pass
- `production/qa/evidence/result-overlay-walkthrough.md` — manual click-through with Toss webview screenshot

**Status**: [x] `tests/integration/hud/result_overlay_test.ts` — 12 tests, all passing

---

## Completion Notes
**Completed**: 2026-04-27
**Criteria**: 8/8 passing (AC-OVR-01 ~ AC-OVR-08, plus 4 edge cases)
**Deviations**: AC-OVR-08 test assertion adjusted during implementation: SessionFlow naturally transitions MATCH→RESULT on GAME_OVER (its own subscription, not via overlay), so post-dispose state is RESULT not MATCH. The dispose contract was correctly verified by checking that the button click did NOT trigger reset() (state stays at RESULT, not MENU). FIFO guard for AC-OVR-04 confirmed via 2 tests (GAME_OVER first vs. ROUND_CLEAR first).
**Test Evidence**: Integration: tests/integration/hud/result_overlay_test.ts — 12 tests, all passing (391 total suite).
**Code Review**: Skipped — Lean mode

---

## Dependencies

- Depends on: story-001 (HUDLayer 무존재 — overlay은 HUDLayer 자식)
- Depends on: story-002 (Grid render — overlay이 가리는 대상 visible)
- Depends on: SessionFlow stub (S4-S2) — `sessionFlow.reset()` API — DONE
- Depends on: RoundManager (GAME_OVER, ROUND_CLEAR 발행) — DONE
- Unlocks: S5-M6 (3 playtest sessions — overlay 없이는 라운드 종료 후 다음 라운드로 진입 불가)
