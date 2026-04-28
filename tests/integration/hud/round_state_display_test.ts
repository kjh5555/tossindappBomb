/**
 * HUDLayer round state display — Sprint 5 S5-M2 / Story 001
 *
 * Story: production/epics/hud/story-001-round-state-display.md
 * Tests: AC-HUD-02 through AC-HUD-08
 *
 * Verifies the HUDLayer event-driven label updates and timer countdown
 * without requiring Cocos. Labels are plain `{ string: '' }` stand-ins.
 */

import { EventBus } from '../../../src/core/events/EventBus';
import { MockFrameClock } from '../../helpers/MockFrameClock';
import { HUDLayer, IHUDLabel, HUDLabels } from '../../../src/presentation/hud/HUDLayer';
import { ROUND_TIME_LIMIT } from '../../../src/presentation/hud/HUDConfig';
import type { EscalationContext } from '../../../src/core/types/Domain';

const ESCALATION_CTX: EscalationContext = {
  roundNumber: 1,
  gatePeriod: 2.0,
  tier: 1,
  tierWeights: { t1: 1, t2: 0, t3: 0 },
  stalledFallback: false,
};

function makeEnv() {
  const bus = new EventBus();
  const clock = new MockFrameClock();
  const labels: HUDLabels = {
    round: { string: '' },
    alive: { string: '' },
    time: { string: '' },
  };
  const hud = new HUDLayer(bus, clock, labels);
  const flush = () => clock.advanceBy(0, bus);
  return { bus, clock, hud, labels, flush };
}

describe('HUDLayer — Round state display (AC-HUD-02 to AC-HUD-08)', () => {
  test('AC-HUD-02: applyInsets returns position and contentSize derived from safe area', () => {
    const { hud } = makeEnv();

    const layout = hud.applyInsets(
      { top: 44, bottom: 34, left: 0, right: 0 },
      { width: 360, height: 800 },
    );

    expect(layout.position).toEqual({ x: 0, y: 34 });
    expect(layout.contentSize).toEqual({ width: 360, height: 722 });
  });

  test('AC-HUD-02b: non-zero left/right insets reduce content width and shift x', () => {
    const { hud } = makeEnv();

    const layout = hud.applyInsets(
      { top: 50, bottom: 30, left: 10, right: 5 },
      { width: 400, height: 900 },
    );

    expect(layout.position).toEqual({ x: 10, y: 30 });
    expect(layout.contentSize).toEqual({ width: 385, height: 820 });
  });

  test('AC-HUD-03: ROUND_STARTED updates roundLabel to "Round N"', () => {
    const { bus, labels, flush } = makeEnv();

    bus.emit('ROUND_STARTED', { roundNumber: 3, ctx: ESCALATION_CTX, timestamp: 0 });
    flush();

    expect(labels.round.string).toBe('Round 3');
  });

  test('AC-HUD-04: ALIVE_COUNT_CHANGED updates aliveLabel to "N alive"', () => {
    const { bus, labels, flush } = makeEnv();
    bus.emit('ROUND_STARTED', { roundNumber: 1, ctx: ESCALATION_CTX, timestamp: 0 });
    flush();

    bus.emit('ALIVE_COUNT_CHANGED', { aliveCount: 4, timestamp: 0 });
    flush();

    expect(labels.alive.string).toBe('4 alive');
  });

  test('AC-HUD-04b: aliveCount=0 displays "0 alive" without crashing', () => {
    const { bus, labels, flush } = makeEnv();

    bus.emit('ALIVE_COUNT_CHANGED', { aliveCount: 0, timestamp: 0 });
    flush();

    expect(labels.alive.string).toBe('0 alive');
  });

  test('AC-HUD-05: update(dt) decrements remainingTime and updates timeLabel', () => {
    const { bus, hud, labels, flush } = makeEnv();
    bus.emit('ROUND_STARTED', { roundNumber: 1, ctx: ESCALATION_CTX, timestamp: 0 });
    flush();
    expect(labels.time.string).toBe('60.0s');
    expect(hud.getRemainingTime()).toBe(ROUND_TIME_LIMIT);

    hud.update(0.1);

    expect(hud.getRemainingTime()).toBeCloseTo(59.9, 5);
    expect(labels.time.string).toBe('59.9s');
  });

  test('AC-HUD-05b: update(dt) is a no-op before any ROUND_STARTED', () => {
    const { hud, labels } = makeEnv();

    hud.update(0.1);

    expect(labels.time.string).toBe(''); // initial value preserved
    expect(hud.isCountdownActive()).toBe(false);
  });

  test('AC-HUD-06: ROUND_END stops the countdown — subsequent update() does not change time', () => {
    const { bus, hud, labels, flush } = makeEnv();
    bus.emit('ROUND_STARTED', { roundNumber: 1, ctx: ESCALATION_CTX, timestamp: 0 });
    flush();
    hud.update(0.1);
    expect(labels.time.string).toBe('59.9s');

    bus.emit('ROUND_END', { roundNumber: 1, timestamp: 0 });
    flush();
    hud.update(0.1);

    expect(labels.time.string).toBe('59.9s'); // frozen at ROUND_END moment
    expect(hud.isCountdownActive()).toBe(false);
  });

  test('AC-HUD-06b: GAME_OVER also stops the countdown', () => {
    const { bus, hud, labels, flush } = makeEnv();
    bus.emit('ROUND_STARTED', { roundNumber: 1, ctx: ESCALATION_CTX, timestamp: 0 });
    flush();
    hud.update(0.1);

    bus.emit('GAME_OVER', { finalRound: 1, rankings: [], timestamp: 0 });
    flush();
    hud.update(0.5);

    expect(labels.time.string).toBe('59.9s');
    expect(hud.isCountdownActive()).toBe(false);
  });

  test('AC-HUD-07: a new ROUND_STARTED restarts the countdown from ROUND_TIME_LIMIT', () => {
    const { bus, hud, labels, flush } = makeEnv();
    bus.emit('ROUND_STARTED', { roundNumber: 1, ctx: ESCALATION_CTX, timestamp: 0 });
    flush();
    hud.update(5);
    bus.emit('ROUND_END', { roundNumber: 1, timestamp: 0 });
    flush();

    bus.emit('ROUND_STARTED', { roundNumber: 2, ctx: ESCALATION_CTX, timestamp: 0 });
    flush();
    hud.update(0.1);

    expect(labels.round.string).toBe('Round 2');
    expect(hud.getRemainingTime()).toBeCloseTo(59.9, 5);
    expect(labels.time.string).toBe('59.9s');
  });

  test('AC-HUD-08: dispose() unsubscribes — subsequent events are ignored', () => {
    const { bus, hud, labels, flush } = makeEnv();

    hud.dispose();
    bus.emit('ROUND_STARTED', { roundNumber: 5, ctx: ESCALATION_CTX, timestamp: 0 });
    bus.emit('ALIVE_COUNT_CHANGED', { aliveCount: 6, timestamp: 0 });
    flush();

    expect(labels.round.string).toBe('');
    expect(labels.alive.string).toBe('');
  });

  test('AC-HUD-08b: dispose() is idempotent — calling twice does not throw', () => {
    const { hud } = makeEnv();

    hud.dispose();
    expect(() => hud.dispose()).not.toThrow();
  });

  test('Edge: large dt clamps remainingTime to 0', () => {
    const { bus, hud, labels, flush } = makeEnv();
    bus.emit('ROUND_STARTED', { roundNumber: 1, ctx: ESCALATION_CTX, timestamp: 0 });
    flush();

    hud.update(100); // exceeds ROUND_TIME_LIMIT

    expect(hud.getRemainingTime()).toBe(0);
    expect(labels.time.string).toBe('0.0s');
  });

  test('Edge: ROUND_STARTED + ALIVE_COUNT_CHANGED in same flush both update', () => {
    const { bus, labels, flush } = makeEnv();

    bus.emit('ROUND_STARTED', { roundNumber: 7, ctx: ESCALATION_CTX, timestamp: 0 });
    bus.emit('ALIVE_COUNT_CHANGED', { aliveCount: 5, timestamp: 0 });
    flush();

    expect(labels.round.string).toBe('Round 7');
    expect(labels.alive.string).toBe('5 alive');
  });
});
