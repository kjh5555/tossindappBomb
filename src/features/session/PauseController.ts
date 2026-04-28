/**
 * PauseController.ts
 * Pure flag controller — paused boolean + GAME_PAUSED/GAME_RESUMED events.
 * The Cocos integration site checks `isPaused()` before calling FrameClock.tick(dt).
 *
 * Implements: production/sprints/sprint-6.md S6-S1
 * Governed by: ADR-0002 (FrameClock — tick suppression for pause)
 *
 * Design:
 *  - The pause mechanism is "halt the FrameClock" — the cleanest way to freeze
 *    everything (RoundManager timer, GridSimulation gate cycles, PlayerMovement
 *    tween schedules) without each system needing pause-aware code.
 *  - PauseController itself is just a state flag + event emitter; the engine
 *    integration code consults it once per frame.
 *  - Pause is a no-op when SessionFlow is not in MATCH state (prevents pausing
 *    the menu).
 */

import type { IEventBus } from '../../core/events/IEventBus';
import type { SessionFlow } from './SessionFlow';

export class PauseController {
  private paused: boolean = false;

  /**
   * @param bus         - event bus for GAME_PAUSED / GAME_RESUMED notifications
   * @param sessionFlow - to gate pause to MATCH state only
   */
  constructor(
    private readonly bus: IEventBus,
    private readonly sessionFlow: SessionFlow,
  ) {}

  /** Whether the game is currently paused. The Cocos update hook reads this. */
  isPaused(): boolean {
    return this.paused;
  }

  /**
   * Request a pause. No-op if SessionFlow is not in MATCH state, or if already paused.
   * @returns true if the state changed.
   */
  pause(): boolean {
    if (this.paused) return false;
    if (this.sessionFlow.getState() !== 'MATCH') return false;
    this.paused = true;
    this.bus.emit('GAME_PAUSED', { timestamp: Date.now() });
    return true;
  }

  /**
   * Resume the game. No-op if not paused.
   * @returns true if the state changed.
   */
  resume(): boolean {
    if (!this.paused) return false;
    this.paused = false;
    this.bus.emit('GAME_RESUMED', { timestamp: Date.now() });
    return true;
  }
}
