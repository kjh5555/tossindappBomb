/**
 * PauseOverlay.ts
 * Presentation-layer pause menu — shown when the player triggers a pause.
 * Wraps PauseController + button bindings (Resume / Restart) into a HUD overlay.
 *
 * Implements: production/epics/hud (Sprint 6 S6-S1)
 * Governed by: ADR-0016 (HUDLayer z:30), design/ux/pause.md
 *
 * Design:
 *  - Sibling to ResultOverlay — both occupy z:30 but only one is visible at a time
 *    (ResultOverlay is reachable only via GAME_OVER/ROUND_CLEAR which forces a state
 *    transition, so concurrent display is impossible by construction).
 *  - Three buttons: Resume (PrimaryButton), Settings (Sprint 6+ navigation TODO),
 *    Restart (SecondaryButton + confirm dialog).
 *  - Restart confirm dialog is implemented as an internal state flag — no separate
 *    overlay class needed for v1.
 *  - Settings button click fires `SETTINGS_REQUESTED` event for the navigation
 *    layer (Sprint 6+) to handle. PauseOverlay does not own the settings screen.
 */

import type { IEventBus } from '../../core/events/IEventBus';
import type { SessionFlow } from '../../features/session/SessionFlow';
import type { PauseController } from '../../features/session/PauseController';
import type { IButton, IOverlayNode, ILabel } from './ResultOverlay';

/** True when the Restart confirm dialog is showing (sub-state of "Showing"). */
export type PauseOverlayState = 'HIDDEN' | 'SHOWING' | 'CONFIRMING_RESTART';

/**
 * @example
 *   const overlay = new PauseOverlay(
 *     bus, sessionFlow, pauseController,
 *     overlayNode, labels, { resume: btn1, settings: btn2, restart: btn3, confirm: btn4, cancel: btn5 },
 *   );
 *   pauseController.pause(); // → overlay shows automatically (subscribes to GAME_PAUSED)
 *   resumeButton.click();    // → resume + overlay hides
 */
export class PauseOverlay {
  private state: PauseOverlayState = 'HIDDEN';
  private subscriptions: Array<() => void> = [];
  private buttonHandlers: Array<{ button: IButton; handler: () => void }> = [];

  constructor(
    bus: IEventBus,
    private readonly sessionFlow: SessionFlow,
    private readonly pauseController: PauseController,
    private readonly node: IOverlayNode,
    private readonly messageLabel: ILabel,
    private readonly buttons: {
      resume: IButton;
      settings: IButton;
      restart: IButton;
      confirmRestart: IButton;
      cancelRestart: IButton;
    },
  ) {
    this.node.visible = false;
    this.messageLabel.string = '';

    const onPaused = (): void => this.show();
    const onResumed = (): void => this.hide();

    bus.on('GAME_PAUSED', onPaused);
    bus.on('GAME_RESUMED', onResumed);
    this.subscriptions.push(
      () => bus.off('GAME_PAUSED', onPaused),
      () => bus.off('GAME_RESUMED', onResumed),
    );

    this.bindButton(buttons.resume, () => this.handleResume());
    this.bindButton(buttons.settings, () => this.handleSettings(bus));
    this.bindButton(buttons.restart, () => this.handleRestartTap());
    this.bindButton(buttons.confirmRestart, () => this.handleConfirmRestart(bus));
    this.bindButton(buttons.cancelRestart, () => this.handleCancelRestart());
  }

  getState(): PauseOverlayState {
    return this.state;
  }

  dispose(): void {
    for (const off of this.subscriptions) off();
    this.subscriptions = [];
    for (const { button, handler } of this.buttonHandlers) button.offClick(handler);
    this.buttonHandlers = [];
  }

  private bindButton(button: IButton, handler: () => void): void {
    button.onClick(handler);
    this.buttonHandlers.push({ button, handler });
  }

  private show(): void {
    if (this.state !== 'HIDDEN') return;
    this.state = 'SHOWING';
    this.node.visible = true;
    this.messageLabel.string = 'PAUSED';
  }

  private hide(): void {
    if (this.state === 'HIDDEN') return;
    this.state = 'HIDDEN';
    this.node.visible = false;
    this.messageLabel.string = '';
  }

  private handleResume(): void {
    if (this.state !== 'SHOWING') return; // restart confirm has its own buttons
    this.pauseController.resume(); // → emits GAME_RESUMED → onResumed → hide
  }

  private handleSettings(bus: IEventBus): void {
    if (this.state !== 'SHOWING') return;
    bus.emit('SETTINGS_REQUESTED', { timestamp: Date.now() });
  }

  private handleRestartTap(): void {
    if (this.state !== 'SHOWING') return;
    this.state = 'CONFIRMING_RESTART';
    this.messageLabel.string = 'Restart match?';
  }

  private handleConfirmRestart(bus: IEventBus): void {
    if (this.state !== 'CONFIRMING_RESTART') return;
    // Resume the game first (so the FrameClock isn't stuck paused),
    // then reset the session flow.
    this.pauseController.resume();
    this.sessionFlow.reset();
    // Hide imperatively in case the GAME_RESUMED handler raced — idempotent.
    this.state = 'HIDDEN';
    this.node.visible = false;
    this.messageLabel.string = '';
    bus.emit('PAUSE_RESTART_CONFIRMED', { timestamp: Date.now() });
  }

  private handleCancelRestart(): void {
    if (this.state !== 'CONFIRMING_RESTART') return;
    this.state = 'SHOWING';
    this.messageLabel.string = 'PAUSED';
  }
}
