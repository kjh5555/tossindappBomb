import { EventBus } from '../../../src/core/events/EventBus';
import { FrameClock } from '../../../src/core/time/FrameClock';
import { MockFrameClock } from '../../helpers/MockFrameClock';

describe('FrameClock ↔ EventBus integration', () => {
  test('tick() triggers flush() exactly once — handler fires once per tick', () => {
    const bus = new EventBus();
    const clock = new FrameClock(bus);
    let callCount = 0;
    bus.on('PLAYER_MOVED', () => { callCount++; });
    bus.emit('PLAYER_MOVED', { playerId: 'p1', from: { row: 0, col: 0 }, to: { row: 0, col: 1 }, timestamp: 0 });

    clock.tick(0.016);
    expect(callCount).toBe(1);

    // second tick with another emit
    bus.emit('PLAYER_MOVED', { playerId: 'p1', from: { row: 0, col: 1 }, to: { row: 0, col: 2 }, timestamp: 0 });
    clock.tick(0.016);
    expect(callCount).toBe(2);
  });

  test('tick() execution order: simulatedTime → schedules → flush', () => {
    const bus = new EventBus();
    const clock = new FrameClock(bus);
    const executionOrder: string[] = [];

    // Schedule a fn that fires at t=0.1
    clock.schedule(() => { executionOrder.push(`sched@${clock.now().toFixed(3)}`); }, 0.1);

    // Emit an event — should fire after schedule in same tick
    bus.on('PLAYER_ARRIVED', () => { executionOrder.push(`event@${clock.now().toFixed(3)}`); });
    bus.emit('PLAYER_ARRIVED', { playerId: 'p1', cell: { row: 0, col: 0 }, timestamp: 0 });

    clock.tick(0.15);

    expect(clock.now()).toBeCloseTo(0.15);
    expect(executionOrder[0]).toMatch(/^sched@/);  // schedule fires before event
    expect(executionOrder[1]).toMatch(/^event@/);  // event fires after schedule
  });

  test('MockFrameClock.advanceBy controls time manually', () => {
    const bus = new EventBus();
    const mock = new MockFrameClock();
    let arrived = false;

    // Schedule at 0.1s
    mock.schedule(() => { arrived = true; }, 0.1);

    mock.advanceBy(0.05, bus); // t=0.05 — should NOT fire
    expect(arrived).toBe(false);
    expect(mock.simulatedTime).toBeCloseTo(0.05);

    mock.advanceBy(0.05, bus); // t=0.10 — should fire (fireAt <= simulatedTime)
    expect(arrived).toBe(true);
    expect(mock.simulatedTime).toBeCloseTo(0.10);
  });

  test('flush() outside FrameClock.tick() is rejected after tick completes', () => {
    const bus = new EventBus();
    const clock = new FrameClock(bus);
    let count = 0;
    bus.on('GAME_OVER', () => { count++; });
    bus.emit('GAME_OVER', { finalRound: 3, rankings: ['p1'], timestamp: 0 });

    // Flush is locked before and after tick()
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    bus.flush(); // locked before tick — ignored
    expect(count).toBe(0);

    clock.tick(0.016); // real tick — fires the event
    expect(count).toBe(1);

    bus.flush(); // locked again after tick — ignored
    expect(count).toBe(1);
    expect(warnSpy).toHaveBeenCalledTimes(2);
    warnSpy.mockRestore();
  });
});
