/**
 * SessionFlow integration tests — S4-S2
 *
 * Story: production/epics/roundmanager/story-003-session-flow-stub.md
 * Tests: AC-SF-01 through AC-SF-09
 */

import { EventBus } from '../../../src/core/events/EventBus';
import { MockFrameClock } from '../../helpers/MockFrameClock';
import { SessionFlow } from '../../../src/features/session/SessionFlow';
import type { PlayerId } from '../../../src/core/types/Domain';

function makeEnv() {
  const bus = new EventBus();
  const clock = new MockFrameClock();
  const sf = new SessionFlow(bus);
  const flush = () => clock.advanceBy(0, bus);
  return { bus, clock, sf, flush };
}

// Minimal valid event payloads
const GAME_OVER_PAYLOAD = { finalRound: 1, rankings: [] as PlayerId[], timestamp: 0 };
const ROUND_CLEAR_PAYLOAD = { roundNumber: 1, survivors: [] as PlayerId[], timestamp: 0 };

describe('SessionFlow — state machine (AC-SF-01 to AC-SF-09)', () => {
  test('AC-SF-01: initial state is MENU', () => {
    const { sf } = makeEnv();
    expect(sf.getState()).toBe('MENU');
  });

  test('AC-SF-02: startMatch() transitions MENU → MATCH', () => {
    const { sf } = makeEnv();

    sf.startMatch();

    expect(sf.getState()).toBe('MATCH');
  });

  test('AC-SF-03: startMatch() is a no-op when already in MATCH', () => {
    const { sf } = makeEnv();
    sf.startMatch(); // MENU → MATCH

    sf.startMatch(); // guard — no-op

    expect(sf.getState()).toBe('MATCH');
  });

  test('AC-SF-03b: startMatch() is a no-op when in RESULT', () => {
    const { sf, bus, flush } = makeEnv();
    sf.startMatch();
    bus.emit('GAME_OVER', GAME_OVER_PAYLOAD);
    flush(); // → RESULT

    sf.startMatch(); // guard — no-op

    expect(sf.getState()).toBe('RESULT');
  });

  test('AC-SF-04: GAME_OVER event in MATCH transitions to RESULT', () => {
    const { sf, bus, flush } = makeEnv();
    sf.startMatch();

    bus.emit('GAME_OVER', GAME_OVER_PAYLOAD);
    flush();

    expect(sf.getState()).toBe('RESULT');
  });

  test('AC-SF-05: ROUND_CLEAR event in MATCH transitions to RESULT', () => {
    const { sf, bus, flush } = makeEnv();
    sf.startMatch();

    bus.emit('ROUND_CLEAR', ROUND_CLEAR_PAYLOAD);
    flush();

    expect(sf.getState()).toBe('RESULT');
  });

  test('AC-SF-06: GAME_OVER event in MENU state — no transition', () => {
    const { sf, bus, flush } = makeEnv();
    // state stays MENU

    bus.emit('GAME_OVER', GAME_OVER_PAYLOAD);
    flush();

    expect(sf.getState()).toBe('MENU');
  });

  test('AC-SF-06b: ROUND_CLEAR event in MENU state — no transition', () => {
    const { sf, bus, flush } = makeEnv();

    bus.emit('ROUND_CLEAR', ROUND_CLEAR_PAYLOAD);
    flush();

    expect(sf.getState()).toBe('MENU');
  });

  test('AC-SF-07: GAME_OVER event in RESULT state — no duplicate transition', () => {
    const { sf, bus, flush } = makeEnv();
    sf.startMatch();
    bus.emit('GAME_OVER', GAME_OVER_PAYLOAD);
    flush(); // → RESULT

    bus.emit('GAME_OVER', GAME_OVER_PAYLOAD);
    flush();

    expect(sf.getState()).toBe('RESULT');
  });

  test('AC-SF-08: reset() from RESULT transitions to MENU', () => {
    const { sf, bus, flush } = makeEnv();
    sf.startMatch();
    bus.emit('GAME_OVER', GAME_OVER_PAYLOAD);
    flush();
    expect(sf.getState()).toBe('RESULT');

    sf.reset();

    expect(sf.getState()).toBe('MENU');
  });

  test('AC-SF-08b: reset() from MATCH also returns to MENU (defensive abort)', () => {
    const { sf } = makeEnv();
    sf.startMatch();
    expect(sf.getState()).toBe('MATCH');

    sf.reset();

    expect(sf.getState()).toBe('MENU');
  });

  test('AC-SF-09: full flow — startMatch → GAME_OVER → reset → startMatch again', () => {
    const { sf, bus, flush } = makeEnv();

    // First match
    sf.startMatch();
    expect(sf.getState()).toBe('MATCH');

    bus.emit('GAME_OVER', GAME_OVER_PAYLOAD);
    flush();
    expect(sf.getState()).toBe('RESULT');

    sf.reset();
    expect(sf.getState()).toBe('MENU');

    // Second match — must be startable
    sf.startMatch();
    expect(sf.getState()).toBe('MATCH');
  });

  test('AC-SF-09b: full flow with ROUND_CLEAR instead of GAME_OVER', () => {
    const { sf, bus, flush } = makeEnv();

    sf.startMatch();
    bus.emit('ROUND_CLEAR', ROUND_CLEAR_PAYLOAD);
    flush();
    expect(sf.getState()).toBe('RESULT');

    sf.reset();
    sf.startMatch();
    expect(sf.getState()).toBe('MATCH');
  });

  test('duplicate GAME_OVER + ROUND_CLEAR in same flush — RESULT exactly once', () => {
    const { sf, bus, flush } = makeEnv();
    sf.startMatch();

    // Both events queued before flush
    bus.emit('GAME_OVER', GAME_OVER_PAYLOAD);
    bus.emit('ROUND_CLEAR', ROUND_CLEAR_PAYLOAD);
    flush();

    // Second event is ignored by state guard
    expect(sf.getState()).toBe('RESULT');
  });
});
