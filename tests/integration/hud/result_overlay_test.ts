/**
 * ResultOverlay integration test — Sprint 5 S5-M4 / Story 003
 *
 * Story: production/epics/hud/story-003-result-overlay.md
 * Tests: AC-OVR-01 through AC-OVR-08
 */

import { EventBus } from '../../../src/core/events/EventBus';
import { MockFrameClock } from '../../helpers/MockFrameClock';
import { SessionFlow } from '../../../src/features/session/SessionFlow';
import {
  ResultOverlay,
  IButton,
  IOverlayNode,
  ILabel,
} from '../../../src/presentation/hud/ResultOverlay';

class FakeButton implements IButton {
  private handlers: Array<() => void> = [];
  onClick(h: () => void): void {
    this.handlers.push(h);
  }
  offClick(h: () => void): void {
    const i = this.handlers.indexOf(h);
    if (i !== -1) this.handlers.splice(i, 1);
  }
  click(): void {
    for (const h of [...this.handlers]) h();
  }
  handlerCount(): number {
    return this.handlers.length;
  }
}

const GAME_OVER_PAYLOAD = { finalRound: 5, rankings: [] as string[], timestamp: 0 };
const ROUND_CLEAR_PAYLOAD = { roundNumber: 1, survivors: [] as string[], timestamp: 0 };

function makeEnv() {
  const bus = new EventBus();
  const clock = new MockFrameClock();
  const sessionFlow = new SessionFlow(bus);
  const node: IOverlayNode = { visible: true }; // intentionally true; ctor must reset to false
  const label: ILabel = { string: 'placeholder' }; // ctor must reset to ''
  const button = new FakeButton();
  const overlay = new ResultOverlay(bus, sessionFlow, node, label, button);
  const flush = () => clock.advanceBy(0, bus);
  return { bus, sessionFlow, node, label, button, overlay, flush };
}

describe('ResultOverlay — Game Over / Round Clear + Restart (AC-OVR-01 to AC-OVR-08)', () => {
  test('AC-OVR-01: initial state — node hidden and message empty', () => {
    const { node, label } = makeEnv();
    expect(node.visible).toBe(false);
    expect(label.string).toBe('');
  });

  test('AC-OVR-02: GAME_OVER shows overlay with "Game Over"', () => {
    const { bus, node, label, flush } = makeEnv();

    bus.emit('GAME_OVER', GAME_OVER_PAYLOAD);
    flush();

    expect(node.visible).toBe(true);
    expect(label.string).toBe('Game Over');
  });

  test('AC-OVR-03: ROUND_CLEAR shows overlay with "Round Clear"', () => {
    const { bus, node, label, flush } = makeEnv();

    bus.emit('ROUND_CLEAR', ROUND_CLEAR_PAYLOAD);
    flush();

    expect(node.visible).toBe(true);
    expect(label.string).toBe('Round Clear');
  });

  test('AC-OVR-04: simultaneous GAME_OVER + ROUND_CLEAR — first event wins (FIFO)', () => {
    const { bus, node, label, flush } = makeEnv();

    bus.emit('GAME_OVER', GAME_OVER_PAYLOAD);
    bus.emit('ROUND_CLEAR', ROUND_CLEAR_PAYLOAD);
    flush();

    expect(node.visible).toBe(true);
    expect(label.string).toBe('Game Over');
  });

  test('AC-OVR-04b: ROUND_CLEAR before GAME_OVER (same flush) — ROUND_CLEAR wins', () => {
    const { bus, node, label, flush } = makeEnv();

    bus.emit('ROUND_CLEAR', ROUND_CLEAR_PAYLOAD);
    bus.emit('GAME_OVER', GAME_OVER_PAYLOAD);
    flush();

    expect(node.visible).toBe(true);
    expect(label.string).toBe('Round Clear');
  });

  test('AC-OVR-05: Restart click resets SessionFlow + hides overlay + clears message', () => {
    const { bus, sessionFlow, node, label, button, flush } = makeEnv();
    sessionFlow.startMatch();
    bus.emit('GAME_OVER', GAME_OVER_PAYLOAD);
    flush();
    expect(node.visible).toBe(true);

    button.click();

    expect(sessionFlow.getState()).toBe('MENU');
    expect(node.visible).toBe(false);
    expect(label.string).toBe('');
  });

  test('AC-OVR-06: after Restart with no further events — overlay stays hidden', () => {
    const { bus, sessionFlow, node, button, flush } = makeEnv();
    sessionFlow.startMatch();
    bus.emit('GAME_OVER', GAME_OVER_PAYLOAD);
    flush();
    button.click();

    flush();

    expect(node.visible).toBe(false);
    expect(sessionFlow.getState()).toBe('MENU');
  });

  test('AC-OVR-07: Restart → new match → GAME_OVER re-shows overlay', () => {
    const { bus, sessionFlow, node, label, button, flush } = makeEnv();
    sessionFlow.startMatch();
    bus.emit('GAME_OVER', GAME_OVER_PAYLOAD);
    flush();
    button.click();
    expect(node.visible).toBe(false);

    sessionFlow.startMatch();
    bus.emit('GAME_OVER', GAME_OVER_PAYLOAD);
    flush();

    expect(node.visible).toBe(true);
    expect(label.string).toBe('Game Over');
  });

  test('AC-OVR-08: dispose() unsubscribes events and removes button handler', () => {
    const { bus, sessionFlow, node, label, button, overlay, flush } = makeEnv();
    sessionFlow.startMatch();

    overlay.dispose();
    bus.emit('GAME_OVER', GAME_OVER_PAYLOAD);
    flush();
    button.click();

    // Overlay did NOT respond — node stays hidden, label stays empty
    expect(node.visible).toBe(false);
    expect(label.string).toBe('');
    // SessionFlow naturally moved MATCH → RESULT on GAME_OVER (its own subscription),
    // but the button click did NOT trigger overlay.handleRestart() (which would call reset())
    expect(sessionFlow.getState()).toBe('RESULT');
    // Button handler list is empty after dispose
    expect(button.handlerCount()).toBe(0);
  });

  test('AC-OVR-08b: dispose() is idempotent — calling twice does not throw', () => {
    const { overlay } = makeEnv();
    overlay.dispose();
    expect(() => overlay.dispose()).not.toThrow();
  });

  test('Edge: ROUND_CLEAR followed by GAME_OVER (separate flushes, no Restart) — second event ignored', () => {
    const { bus, node, label, flush } = makeEnv();

    bus.emit('ROUND_CLEAR', ROUND_CLEAR_PAYLOAD);
    flush();
    expect(label.string).toBe('Round Clear');

    bus.emit('GAME_OVER', GAME_OVER_PAYLOAD);
    flush();

    // alreadyShown guard prevents the second event from overwriting
    expect(label.string).toBe('Round Clear');
    expect(node.visible).toBe(true);
  });

  test('Edge: full cycle — start → die → restart → start → die → restart (3 cycles)', () => {
    const { bus, sessionFlow, node, button, flush } = makeEnv();

    for (let i = 0; i < 3; i++) {
      sessionFlow.startMatch();
      bus.emit('GAME_OVER', GAME_OVER_PAYLOAD);
      flush();
      expect(node.visible).toBe(true);

      button.click();
      expect(sessionFlow.getState()).toBe('MENU');
      expect(node.visible).toBe(false);
    }
  });
});
