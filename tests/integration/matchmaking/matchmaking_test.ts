/**
 * Matchmaking integration test — Sprint 6 S6-M2 + S6-M3 + S6-M4
 *
 * Stories:
 *   production/epics/matchmaking/story-001-auth.md (AC-MM-01 to AC-MM-06)
 *   production/epics/matchmaking/story-002-match-ready.md (AC-MR-01 to AC-MR-06)
 *   production/epics/matchmaking/story-003-degenerate-disconnect.md (AC-DM-01 to AC-DM-08)
 *
 * Verifies the full matchmaking flow: connect → AUTH → MATCH_READY → SessionFlow start,
 * plus degenerate match (2-5 players), invariant violations, and lobby/in-game disconnect.
 */

import { EventBus } from '../../../src/core/events/EventBus';
import { MockFrameClock } from '../../helpers/MockFrameClock';
import { MockWebSocketClient } from '../../helpers/MockWebSocketClient';
import { StubTossBridge } from '../../../src/platform/StubTossBridge';
import { SessionFlow } from '../../../src/features/session/SessionFlow';
import {
  Matchmaking,
  MatchInitContext,
} from '../../../src/features/session/Matchmaking';
import type { PlayerId } from '../../../src/core/types/Domain';

interface RecordedInit {
  ctx: MatchInitContext;
}

async function makeEnv(initBridge = true) {
  const bus = new EventBus();
  const clock = new MockFrameClock();
  const ws = new MockWebSocketClient();
  const bridge = new StubTossBridge();
  if (initBridge) await bridge.init();
  const sessionFlow = new SessionFlow(bus);
  const inits: RecordedInit[] = [];
  const onMatchInit = (ctx: MatchInitContext) => inits.push({ ctx });
  const mm = new Matchmaking(ws, bridge, bus, sessionFlow, onMatchInit);
  const flush = () => clock.advanceBy(0, bus);
  return { bus, clock, ws, bridge, sessionFlow, mm, inits, flush };
}

const baseMatchReady = (
  playerIds: PlayerId[] = ['p1', 'p2', 'p3'],
  localPlayerId: PlayerId = 'p1',
) => ({
  sessionId: 'sess-001',
  playerIds,
  localPlayerId,
  serverTime: 1000,
});

// ─────────────────────────────────────────────────────────────────────────────
// AUTH + connect — story-001 (AC-MM-01 ~ AC-MM-06)
// ─────────────────────────────────────────────────────────────────────────────

describe('Matchmaking — AUTH + connect (story-001)', () => {
  test('AC-MM-01/AC-MM-02: start() connects with token then sends AUTH', async () => {
    const { mm, ws, bridge } = await makeEnv();
    const connectSpy = jest.spyOn(ws, 'connect');

    await mm.start('ws://test');

    expect(connectSpy).toHaveBeenCalledTimes(1);
    expect(connectSpy).toHaveBeenCalledWith('ws://test', bridge.getUserToken());
    expect(ws.sentMessages).toHaveLength(1);
    expect(ws.sentMessages[0]).toEqual({
      type: 'AUTH',
      payload: { token: 'stub-token' },
    });
    expect(mm.getState()).toBe('WAITING');
  });

  test('AC-MM-03: start() throws if TossBridge.init() not completed', async () => {
    const { mm } = await makeEnv(/* initBridge */ false);

    await expect(mm.start('ws://test')).rejects.toThrow();
  });

  test('AC-MM-04: connect failure → MATCHMAKING_FAILED + no AUTH sent', async () => {
    const { mm, ws, bus, flush } = await makeEnv();
    jest.spyOn(ws, 'connect').mockRejectedValueOnce(new Error('network error'));
    const failures: Array<{ reason: string }> = [];
    bus.on('MATCHMAKING_FAILED', (e) => failures.push({ reason: e.reason }));

    await mm.start('ws://test');
    flush();

    expect(mm.getState()).toBe('FAILED');
    expect(ws.sentMessages).toHaveLength(0);
    expect(failures).toHaveLength(1);
    expect(failures[0].reason).toBe('connect_failed');
  });

  test('AC-MM-05: duplicate start() ignored', async () => {
    const { mm, ws } = await makeEnv();
    const connectSpy = jest.spyOn(ws, 'connect');

    await mm.start('ws://test');
    await mm.start('ws://test'); // second call

    expect(connectSpy).toHaveBeenCalledTimes(1);
  });

  test('AC-MM-06: dispose() disconnects and unsubscribes', async () => {
    const { mm, ws } = await makeEnv();
    const disconnectSpy = jest.spyOn(ws, 'disconnect');
    await mm.start('ws://test');

    mm.dispose();

    expect(disconnectSpy).toHaveBeenCalledTimes(1);
    expect(ws.isConnected).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// MATCH_READY processing — story-002 (AC-MR-01 ~ AC-MR-06)
// ─────────────────────────────────────────────────────────────────────────────

describe('Matchmaking — MATCH_READY processing (story-002)', () => {
  test('AC-MR-01/AC-MR-02/AC-MR-03: MATCH_READY → sessionFlow.startMatch + onMatchInit with totalPlayers', async () => {
    const { mm, ws, sessionFlow, inits, flush } = await makeEnv();
    await mm.start('ws://test');

    ws.simulateMessage('MATCH_READY', baseMatchReady(['p1', 'p2', 'p3'], 'p2'));
    flush();

    expect(sessionFlow.getState()).toBe('MATCH'); // AC-MR-01
    expect(inits).toHaveLength(1);
    expect(inits[0].ctx.totalPlayers).toBe(3); // AC-MR-02
    expect(inits[0].ctx.playerIds).toEqual(['p1', 'p2', 'p3']);
    expect(inits[0].ctx.localPlayerId).toBe('p2'); // AC-MR-03
    expect(inits[0].ctx.sessionId).toBe('sess-001');
    expect(inits[0].ctx.serverTime).toBe(1000);
    expect(mm.getState()).toBe('MATCH');
  });

  test('AC-MR-04: duplicate MATCH_READY ignored — onMatchInit only once', async () => {
    const { mm, ws, inits, flush } = await makeEnv();
    await mm.start('ws://test');

    ws.simulateMessage('MATCH_READY', baseMatchReady());
    ws.simulateMessage('MATCH_READY', baseMatchReady());
    flush();

    expect(inits).toHaveLength(1);
  });

  test('AC-MR-05: MATCHMAKING_READY emitted with full payload', async () => {
    const { mm, ws, bus, flush } = await makeEnv();
    const events: Array<{ sessionId: string; localPlayerId: string }> = [];
    bus.on('MATCHMAKING_READY', (e) =>
      events.push({ sessionId: e.sessionId, localPlayerId: e.localPlayerId }),
    );
    await mm.start('ws://test');

    ws.simulateMessage('MATCH_READY', baseMatchReady(['p1', 'p2'], 'p1'));
    flush();

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ sessionId: 'sess-001', localPlayerId: 'p1' });
  });

  test('AC-MR-06: dispose() unsubscribes — subsequent MATCH_READY ignored', async () => {
    const { mm, ws, inits, flush } = await makeEnv();
    await mm.start('ws://test');

    mm.dispose();
    ws.simulateMessage('MATCH_READY', baseMatchReady());
    flush();

    expect(inits).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Degenerate match + disconnect — story-003 (AC-DM-01 ~ AC-DM-08)
// ─────────────────────────────────────────────────────────────────────────────

describe('Matchmaking — degenerate match + disconnect (story-003)', () => {
  test('AC-DM-01: 2-player match accepted', async () => {
    const { mm, ws, inits, flush } = await makeEnv();
    await mm.start('ws://test');

    ws.simulateMessage('MATCH_READY', baseMatchReady(['p1', 'p2'], 'p1'));
    flush();

    expect(inits).toHaveLength(1);
    expect(inits[0].ctx.totalPlayers).toBe(2);
  });

  test('AC-DM-02: 5-player match accepted', async () => {
    const { mm, ws, inits, flush } = await makeEnv();
    await mm.start('ws://test');

    ws.simulateMessage(
      'MATCH_READY',
      baseMatchReady(['p1', 'p2', 'p3', 'p4', 'p5'], 'p1'),
    );
    flush();

    expect(inits[0].ctx.totalPlayers).toBe(5);
  });

  test('AC-DM-03: 6-player match accepted (max)', async () => {
    const { mm, ws, inits, flush } = await makeEnv();
    await mm.start('ws://test');

    ws.simulateMessage(
      'MATCH_READY',
      baseMatchReady(['p1', 'p2', 'p3', 'p4', 'p5', 'p6'], 'p1'),
    );
    flush();

    expect(inits[0].ctx.totalPlayers).toBe(6);
  });

  test('AC-DM-04: 1-player match invariant violation → MATCHMAKING_FAILED', async () => {
    const { mm, ws, bus, sessionFlow, inits, flush } = await makeEnv();
    const failures: Array<{ reason: string }> = [];
    bus.on('MATCHMAKING_FAILED', (e) => failures.push({ reason: e.reason }));
    await mm.start('ws://test');

    ws.simulateMessage('MATCH_READY', baseMatchReady(['p1'], 'p1'));
    flush();

    expect(inits).toHaveLength(0);
    expect(sessionFlow.getState()).toBe('MENU');
    expect(failures).toHaveLength(1);
    expect(failures[0].reason).toBe('invalid_match_size:1');
    expect(mm.getState()).toBe('FAILED');
  });

  test('AC-DM-05: 7-player match invariant violation → MATCHMAKING_FAILED', async () => {
    const { mm, ws, bus, inits, flush } = await makeEnv();
    const failures: Array<{ reason: string }> = [];
    bus.on('MATCHMAKING_FAILED', (e) => failures.push({ reason: e.reason }));
    await mm.start('ws://test');

    ws.simulateMessage(
      'MATCH_READY',
      baseMatchReady(['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'], 'p1'),
    );
    flush();

    expect(inits).toHaveLength(0);
    expect(failures[0].reason).toBe('invalid_match_size:7');
  });

  test('AC-DM-06: lobby disconnect (state=WAITING) → MATCHMAKING_FAILED reason="disconnected"', async () => {
    const { mm, ws, bus, flush } = await makeEnv();
    const failures: Array<{ reason: string }> = [];
    bus.on('MATCHMAKING_FAILED', (e) => failures.push({ reason: e.reason }));
    await mm.start('ws://test');
    expect(mm.getState()).toBe('WAITING');

    ws.simulateDisconnect();
    flush();

    expect(mm.getState()).toBe('FAILED');
    expect(failures).toHaveLength(1);
    expect(failures[0].reason).toBe('disconnected');
  });

  test('AC-DM-07: in-game disconnect (after MATCH_READY) → LOCAL_PLAYER_DISCONNECTED, not MATCHMAKING_FAILED', async () => {
    const { mm, ws, bus, flush } = await makeEnv();
    const localDisconnects: number[] = [];
    const failures: string[] = [];
    bus.on('LOCAL_PLAYER_DISCONNECTED', (e) => localDisconnects.push(e.timestamp));
    bus.on('MATCHMAKING_FAILED', (e) => failures.push(e.reason));
    await mm.start('ws://test');
    ws.simulateMessage('MATCH_READY', baseMatchReady());
    flush();
    expect(mm.getState()).toBe('MATCH');

    ws.simulateDisconnect();
    flush();

    expect(localDisconnects).toHaveLength(1);
    expect(failures).toHaveLength(0);
  });

  test('AC-DM-08: reset() after FAILED + start() retries connect + AUTH', async () => {
    const { mm, ws, sessionFlow } = await makeEnv();
    const connectSpy = jest.spyOn(ws, 'connect');

    // First attempt fails
    connectSpy.mockRejectedValueOnce(new Error('network'));
    await mm.start('ws://test');
    expect(mm.getState()).toBe('FAILED');

    // Reset + retry succeeds
    mm.reset();
    await mm.start('ws://test');

    expect(connectSpy).toHaveBeenCalledTimes(2);
    expect(ws.sentMessages.filter((m) => m.type === 'AUTH')).toHaveLength(1);
    expect(mm.getState()).toBe('WAITING');
    expect(sessionFlow.getState()).toBe('MENU'); // not yet started
  });

  test('AC-DM-08b: reset() then MATCH_READY succeeds normally', async () => {
    const { mm, ws, inits, flush } = await makeEnv();
    const connectSpy = jest.spyOn(ws, 'connect');
    connectSpy.mockRejectedValueOnce(new Error('network'));
    await mm.start('ws://test');
    mm.reset();
    await mm.start('ws://test');

    ws.simulateMessage('MATCH_READY', baseMatchReady(['p1', 'p2'], 'p1'));
    flush();

    expect(inits).toHaveLength(1);
    expect(inits[0].ctx.totalPlayers).toBe(2);
  });
});
