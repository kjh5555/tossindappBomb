/**
 * HUDLayer.ts
 * Presentation-layer HUD orchestrator. Renders round number, alive count, and timer
 * by subscribing to RoundManager events and updating cc.Label-shaped targets.
 *
 * Implements: production/epics/hud/story-001-round-state-display.md
 * Governed by:
 *   ADR-0016 (HUD Safe Area + Audio): HUDLayer.applyInsets, EventBus subscriptions
 *   ADR-0011 (RoundManager FSM):       ROUND_STARTED / ROUND_END / GAME_OVER contracts
 *   ADR-0013 (Survival Cycle-Revive):  ALIVE_COUNT_CHANGED contract
 *
 * Design:
 *  - Labels are abstracted as `{ string: string }` so this module is fully testable
 *    without Cocos. The Cocos integration script wires real cc.Label instances at
 *    construction time.
 *  - Subscriptions are registered once at construction; dispose() unsubscribes all.
 *  - Timer is driven by external update(dt) call (the Cocos cc.Component.update hook),
 *    using the supplied delta time. FrameClock is referenced for type/contract only —
 *    the time source on every tick is the dt argument (frame-rate independent).
 */

import type { IEventBus } from '../../core/events/IEventBus';
import type { IFrameClock } from '../../core/time/IFrameClock';
import { ROUND_TIME_LIMIT, formatTime } from './HUDConfig';

/**
 * Minimal label surface — matches the public API of cc.Label that HUDLayer touches.
 * Allows plain objects in tests (`{ string: '' }`) and real cc.Label in production.
 */
export interface IHUDLabel {
  string: string;
}

export interface HUDLabels {
  round: IHUDLabel;
  alive: IHUDLabel;
  time: IHUDLabel;
}

export interface SafeAreaInsets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface ScreenSize {
  width: number;
  height: number;
}

export interface AppliedLayout {
  position: { x: number; y: number };
  contentSize: { width: number; height: number };
}

/**
 * HUDLayer subscribes to round events and reflects state on three labels.
 *
 * @example
 *   const labels = { round: roundLabel, alive: aliveLabel, time: timeLabel };
 *   const hud = new HUDLayer(eventBus, frameClock, labels);
 *   // each frame:
 *   hud.update(dt);
 *   // on scene unload:
 *   hud.dispose();
 */
export class HUDLayer {
  private remainingTime: number = ROUND_TIME_LIMIT;
  private countdownActive: boolean = false;
  private subscriptions: Array<() => void> = [];

  constructor(
    bus: IEventBus,
    _clock: IFrameClock,
    private readonly labels: HUDLabels,
  ) {
    const onRoundStarted = (e: { roundNumber: number }): void => {
      this.labels.round.string = `Round ${e.roundNumber}`;
      this.remainingTime = ROUND_TIME_LIMIT;
      this.countdownActive = true;
      this.labels.time.string = formatTime(this.remainingTime);
    };
    const onAliveCountChanged = (e: { aliveCount: number }): void => {
      this.labels.alive.string = `${e.aliveCount} alive`;
    };
    const onRoundEnd = (): void => {
      this.countdownActive = false;
    };
    const onGameOver = (): void => {
      this.countdownActive = false;
    };

    bus.on('ROUND_STARTED', onRoundStarted);
    bus.on('ALIVE_COUNT_CHANGED', onAliveCountChanged);
    bus.on('ROUND_END', onRoundEnd);
    bus.on('GAME_OVER', onGameOver);

    this.subscriptions = [
      () => bus.off('ROUND_STARTED', onRoundStarted),
      () => bus.off('ALIVE_COUNT_CHANGED', onAliveCountChanged),
      () => bus.off('ROUND_END', onRoundEnd),
      () => bus.off('GAME_OVER', onGameOver),
    ];
  }

  /**
   * Per-frame timer update. Called by the Cocos cc.Component.update hook.
   * No-op when the round is not active (between ROUND_END and the next ROUND_STARTED).
   *
   * @param dt - delta time in seconds.
   */
  update(dt: number): void {
    if (!this.countdownActive) return;
    this.remainingTime = Math.max(0, this.remainingTime - dt);
    this.labels.time.string = formatTime(this.remainingTime);
  }

  /**
   * Compute HUDLayer node position and contentSize from Toss safe area insets.
   * Called once after `TossBridge.init()` — never re-applied at runtime (ADR-0016).
   *
   * @param sa     - safe area insets from `TossBridge.getSafeArea()`
   * @param screen - current screen visible size (`cc.view.getVisibleSize()` at integration site)
   * @returns the layout to apply to the HUDLayer cc.Node
   *
   * @example
   *   const layout = hud.applyInsets(safeArea, { width: 360, height: 800 });
   *   hudNode.setPosition(layout.position.x, layout.position.y);
   *   hudNode.setContentSize(layout.contentSize.width, layout.contentSize.height);
   */
  applyInsets(sa: SafeAreaInsets, screen: ScreenSize): AppliedLayout {
    return {
      position: { x: sa.left, y: sa.bottom },
      contentSize: {
        width: screen.width - sa.left - sa.right,
        height: screen.height - sa.top - sa.bottom,
      },
    };
  }

  /**
   * Test/inspection accessor. Returns whether the countdown is currently ticking.
   */
  isCountdownActive(): boolean {
    return this.countdownActive;
  }

  /**
   * Test/inspection accessor. Returns the current remaining time in seconds.
   */
  getRemainingTime(): number {
    return this.remainingTime;
  }

  /**
   * Cleanup all event subscriptions. Idempotent — safe to call multiple times.
   * Called on scene unload or HUDLayer destruction.
   */
  dispose(): void {
    for (const off of this.subscriptions) off();
    this.subscriptions = [];
  }
}
