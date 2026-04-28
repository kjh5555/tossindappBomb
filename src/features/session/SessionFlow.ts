/**
 * SessionFlow.ts
 * Minimal single-player session state machine.
 *
 * Implements: S4-S2 (production/epics/roundmanager/story-003-session-flow-stub.md)
 * Governed by: ADR-0001 (EventBus), ADR-0003 (Layer Boundaries)
 *
 * States: MENU → MATCH → RESULT → MENU (cycle)
 * MATCH ends on GAME_OVER or ROUND_CLEAR event.
 */

import type { IEventBus } from '../../core/events/IEventBus';

/** Discriminated union of all session states. */
export type SessionState = 'MENU' | 'MATCH' | 'RESULT';

/**
 * Minimal session flow state machine for single-player local play.
 *
 * Transitions:
 *  - MENU → MATCH: `startMatch()`
 *  - MATCH → RESULT: GAME_OVER or ROUND_CLEAR event received
 *  - RESULT → MENU: `reset()`
 *
 * @example
 *   const sf = new SessionFlow(bus);
 *   sf.startMatch();                    // MENU → MATCH
 *   // ... game plays out, GAME_OVER emitted, bus.flush() ...
 *   sf.getState(); // 'RESULT'
 *   sf.reset();    // RESULT → MENU
 */
export class SessionFlow {
  private state: SessionState = 'MENU';

  /**
   * @param bus - Event bus. Subscriptions are registered once at construction (ADR-0001).
   */
  constructor(private readonly bus: IEventBus) {
    bus.on('GAME_OVER', () => this.handleMatchEnded());
    bus.on('ROUND_CLEAR', () => this.handleMatchEnded());
  }

  /** Current session state. */
  getState(): SessionState {
    return this.state;
  }

  /**
   * Transition MENU → MATCH.
   * No-op if not currently in MENU state (AC-SF-03).
   */
  startMatch(): void {
    if (this.state !== 'MENU') return;
    this.state = 'MATCH';
  }

  /**
   * Transition any state → MENU.
   * Used to restart after RESULT (AC-SF-08) or abort a match.
   */
  reset(): void {
    this.state = 'MENU';
  }

  private handleMatchEnded(): void {
    if (this.state !== 'MATCH') return; // AC-SF-06, AC-SF-07
    this.state = 'RESULT';
  }
}
