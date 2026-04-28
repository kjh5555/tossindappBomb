import { EventBus } from '../../../src/core/events/EventBus';

function unlockBus(bus: EventBus) { (bus as any).unlockFlush(); }

describe('EventBus', () => {
  let bus: EventBus;

  beforeEach(() => { bus = new EventBus(); });

  test('emit without flush fires zero handlers', () => {
    let count = 0;
    bus.on('PLAYER_MOVED', () => { count++; });
    bus.emit('PLAYER_MOVED', { playerId: 'p1', from: { row: 0, col: 0 }, to: { row: 0, col: 1 }, timestamp: 0 });
    expect(count).toBe(0);
  });

  test('flush dispatches events in FIFO order', () => {
    const order: string[] = [];
    bus.on('PLAYER_MOVED', () => order.push('A'));
    bus.on('PLAYER_ARRIVED', () => order.push('B'));
    bus.on('ROUND_STARTED', () => order.push('C'));
    bus.emit('PLAYER_MOVED', { playerId: 'p1', from: { row: 0, col: 0 }, to: { row: 0, col: 1 }, timestamp: 0 });
    bus.emit('PLAYER_ARRIVED', { playerId: 'p1', cell: { row: 0, col: 1 }, timestamp: 0 });
    bus.emit('ROUND_STARTED', { roundNumber: 1, ctx: { roundNumber: 1, gatePeriod: 2.0, tier: 1, tierWeights: { t1: 1, t2: 0, t3: 0 }, stalledFallback: false }, timestamp: 0 });
    unlockBus(bus);
    bus.flush();
    expect(order).toEqual(['A', 'B', 'C']);
  });

  test('reentry — emit during flush deferred to next flush', () => {
    let secondFired = false;
    bus.on('PLAYER_MOVED', () => {
      bus.emit('GRID_STALLED', { roundNumber: 1, timestamp: 0 });
    });
    bus.on('GRID_STALLED', () => { secondFired = true; });
    bus.emit('PLAYER_MOVED', { playerId: 'p1', from: { row: 0, col: 0 }, to: { row: 0, col: 1 }, timestamp: 0 });
    unlockBus(bus);
    bus.flush();
    expect(secondFired).toBe(false); // not yet — queued for next frame
    unlockBus(bus);
    bus.flush();
    expect(secondFired).toBe(true);  // fires on second flush
  });

  test('off removes handler — emit+flush produces zero calls', () => {
    let count = 0;
    const handler = () => { count++; };
    bus.on('CELL_EXPLODED', handler);
    bus.off('CELL_EXPLODED', handler);
    bus.emit('CELL_EXPLODED', { cell: { row: 2, col: 3 }, timestamp: 0 });
    unlockBus(bus);
    bus.flush();
    expect(count).toBe(0);
  });

  test('flush when locked logs warn and skips handlers', () => {
    let count = 0;
    bus.on('GAME_OVER', () => { count++; });
    bus.emit('GAME_OVER', { finalRound: 5, rankings: ['p1'], timestamp: 0 });
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    bus.flush(); // locked by default
    expect(warnSpy).toHaveBeenCalledWith('[EventBus] flush() called outside FrameClock.tick() — ignored');
    expect(count).toBe(0);
    warnSpy.mockRestore();
  });
});
