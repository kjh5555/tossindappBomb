/**
 * ResultOverlay.ts
 * Presentation-layer overlay shown on GAME_OVER or ROUND_CLEAR. Hosts a Restart
 * button that resets SessionFlow back to MENU.
 *
 * Implements: production/epics/hud/story-003-result-overlay.md
 * Governed by:
 *   ADR-0016 (HUD Safe Area + Audio): HUDLayer z-order = 30 (above grid)
 *   ADR-0011 (Round Phase FSM):       GAME_OVER / ROUND_CLEAR contracts
 *   story-003-session-flow-stub.md:   SessionFlow.reset() API
 *
 * Design:
 *  - Node visibility, label text, and button click are abstracted as small
 *    interfaces (`IOverlayNode`, `ILabel`, `IButton`) so this module is fully
 *    testable without Cocos. The integration script wires real cc.Node /
 *    cc.Label / cc.Button instances at construction time.
 *  - FIFO guard (`alreadyShown`): if both GAME_OVER and ROUND_CLEAR fire in the
 *    same flush, only the first event's message wins. The Restart click resets
 *    this guard so the next round can re-trigger the overlay.
 *  - Subscriptions and the click handler are released by `dispose()`.
 */

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

/**
 * Result overlay — renders end-of-round / end-of-game state and offers a Restart.
 *
 * @example
 *   const overlay = new ResultOverlay(bus, sessionFlow, node, label, button);
 *   // GAME_OVER → overlay.node.visible === true
 *   button.click(); // dev/test fake — real production wires cc.Button
 *   // → sessionFlow back to MENU, overlay hidden
 */
export class ResultOverlay {
  private subscriptions: Array<() => void> = [];
  private readonly clickHandler: () => void;
  private alreadyShown: boolean = false;

  constructor(
    bus: IEventBus,
    private readonly sessionFlow: SessionFlow,
    private readonly node: IOverlayNode,
    private readonly messageLabel: ILabel,
    private readonly restartButton: IButton,
  ) {
    this.node.visible = false;
    this.messageLabel.string = '';

    const onGameOver = (): void => this.show('Game Over');
    const onRoundClear = (): void => this.show('Round Clear');

    bus.on('GAME_OVER', onGameOver);
    bus.on('ROUND_CLEAR', onRoundClear);

    this.clickHandler = (): void => this.handleRestart();
    restartButton.onClick(this.clickHandler);

    this.subscriptions = [
      () => bus.off('GAME_OVER', onGameOver),
      () => bus.off('ROUND_CLEAR', onRoundClear),
      () => restartButton.offClick(this.clickHandler),
    ];
  }

  private show(message: string): void {
    if (this.alreadyShown) return; // FIFO — first event in a cycle wins
    this.alreadyShown = true;
    this.messageLabel.string = message;
    this.node.visible = true;
  }

  private handleRestart(): void {
    this.sessionFlow.reset();
    this.node.visible = false;
    this.messageLabel.string = '';
    this.alreadyShown = false; // allow re-trigger after the next match
  }

  /**
   * Cleanup all event subscriptions and the button click handler.
   * Idempotent — safe to call multiple times.
   */
  dispose(): void {
    for (const off of this.subscriptions) off();
    this.subscriptions = [];
  }
}
