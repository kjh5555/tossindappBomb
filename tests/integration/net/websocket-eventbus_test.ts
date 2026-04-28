import { EventBus } from '../../../src/core/events/EventBus';
import { WebSocketAdapter } from '../../../src/core/net/WebSocketAdapter';
import { MockWebSocketClient } from '../../helpers/MockWebSocketClient';
import { MockFrameClock } from '../../helpers/MockFrameClock';

function makeSetup() {
  const bus = new EventBus();
  const clock = new MockFrameClock();
  const mock = new MockWebSocketClient();
  const adapter = new WebSocketAdapter(mock, bus, clock);
  adapter.mount();
  return { bus, clock, mock };
}

describe('WebSocketAdapter — 서버 메시지 → EventBus 변환 (ADR-0010)', () => {
  test('AC-1: PLAYER_KILLED 서버 메시지 → EventBus emit (CellIndex→CellCoord 변환)', () => {
    const { bus, clock, mock } = makeSetup();
    let received: any = null;
    bus.on('PLAYER_KILLED', e => { received = e; });

    mock.simulateMessage('PLAYER_KILLED', {
      playerIds: ['p1'],
      cellId: 10,  // CellIndex: row=1, col=2
      cause: 'EXPLOSION',
      timestamp: 9999,
    });
    clock.advanceBy(0.1, bus);

    expect(received).not.toBeNull();
    expect(received.playerIds[0]).toBe('p1');
    expect(received.cause).toBe('EXPLOSION');
    // CellIndex 10 → { row: 1, col: 2 }
    expect(received.cellId).toEqual({ row: 1, col: 2 });
  });

  test('AC-2: ROUND_START → ROUND_STARTED 변환 (seed 포함)', () => {
    const { bus, clock, mock } = makeSetup();
    let received: any = null;
    bus.on('ROUND_STARTED', e => { received = e; });

    mock.simulateMessage('ROUND_START', { roundNumber: 2, seed: 77, playerPositions: {} });
    clock.advanceBy(0.1, bus);

    expect(received).not.toBeNull();
    expect(received.roundNumber).toBe(2);
    expect(received.seed).toBe(77);
  });

  test('AC-3: PLAYER_MOVE → PLAYER_MOVED + CellIndex → CellCoord 변환', () => {
    const { bus, clock, mock } = makeSetup();
    let received: any = null;
    bus.on('PLAYER_MOVED', e => { received = e; });

    mock.simulateMessage('PLAYER_MOVE', { playerId: 'p2', from: 0, to: 1, timestamp: 0 });
    clock.advanceBy(0.1, bus);

    expect(received).not.toBeNull();
    expect(received.playerId).toBe('p2');
    // CellIndex 0 → { row: 0, col: 0 }
    expect(received.from).toEqual({ row: 0, col: 0 });
    // CellIndex 1 → { row: 0, col: 1 }
    expect(received.to).toEqual({ row: 0, col: 1 });
  });

  test('AC-4: timestamp는 clock.now() 기준 (서버 wallclock 무시)', () => {
    const { bus, clock, mock } = makeSetup();
    // Advance clock to a known time
    clock.advanceBy(1.5, bus);

    let received: any = null;
    bus.on('PLAYER_KILLED', e => { received = e; });

    mock.simulateMessage('PLAYER_KILLED', {
      playerIds: ['p3'],
      cellId: 0,
      cause: 'DANGER_ZONE',
      timestamp: 99999,  // 서버 wallclock — 무시되어야 함
    });
    clock.advanceBy(0.1, bus);

    expect(received).not.toBeNull();
    // timestamp is captured at simulateMessage time (simulatedTime=1.5), before the extra tick
    expect(received.timestamp).toBeCloseTo(1.5);
    expect(received.timestamp).not.toBe(99999);
  });

  test('AC-5: ROUND_CLEAR, GAME_OVER 변환', () => {
    const { bus, clock, mock } = makeSetup();
    let roundClear: any = null;
    let gameOver: any = null;
    bus.on('ROUND_CLEAR', e => { roundClear = e; });
    bus.on('GAME_OVER', e => { gameOver = e; });

    mock.simulateMessage('ROUND_CLEAR', { roundNumber: 3, survivors: ['p1', 'p2'] });
    mock.simulateMessage('GAME_OVER', { finalRound: 3, rankings: ['p1'] });
    clock.advanceBy(0.1, bus);

    expect(roundClear).not.toBeNull();
    expect(roundClear.roundNumber).toBe(3);
    expect(roundClear.survivors).toEqual(['p1', 'p2']);

    expect(gameOver).not.toBeNull();
    expect(gameOver.finalRound).toBe(3);
    expect(gameOver.rankings).toEqual(['p1']);
  });
});
