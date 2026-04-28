import { EventBus } from '../../../src/core/events/EventBus';
import { FrameClock } from '../../../src/core/time/FrameClock';

function makeClock() {
  const bus = new EventBus();
  const clock = new FrameClock(bus);
  return { bus, clock };
}

describe('FrameClock', () => {
  test('AC-1: schedule(fn, 0.1) fires after tick(0.05) x2', () => {
    const { clock } = makeClock();
    let fired = false;
    clock.schedule(() => { fired = true; }, 0.1);

    clock.tick(0.05);
    expect(fired).toBe(false); // 0.05 < 0.1

    clock.tick(0.05);
    expect(fired).toBe(true);  // 0.10 >= 0.1
  });

  test('AC-1 edge: schedule does not fire before fireAt', () => {
    const { clock } = makeClock();
    let count = 0;
    clock.schedule(() => { count++; }, 0.1);
    clock.tick(0.09);
    expect(count).toBe(0);
    clock.tick(0.02); // 0.09 + 0.02 = 0.11 > 0.1 — avoids fp boundary
    expect(count).toBe(1);
  });

  test('AC-2: cancelSchedule prevents fn from firing', () => {
    const { clock } = makeClock();
    let fired = false;
    const fn = () => { fired = true; };
    clock.schedule(fn, 0.1);
    clock.cancelSchedule(fn);
    clock.tick(0.15);
    expect(fired).toBe(false);
  });

  test('AC-3: concurrent schedules fire in FIFO order', () => {
    const { clock } = makeClock();
    const order: string[] = [];
    clock.schedule(() => order.push('A'), 0.1);
    clock.schedule(() => order.push('B'), 0.1);
    clock.tick(0.15);
    expect(order).toEqual(['A', 'B']);
  });

  test('AC-4: dt() returns last tick dt', () => {
    const { clock } = makeClock();
    expect(clock.dt()).toBe(0);
    clock.tick(0.016);
    expect(clock.dt()).toBeCloseTo(0.016);
    clock.tick(0.033);
    expect(clock.dt()).toBeCloseTo(0.033);
  });

  test('AC-5: 18000 tick drift < 5ms', () => {
    const { clock } = makeClock();
    const DT = 1 / 60;
    for (let i = 0; i < 18_000; i++) clock.tick(DT);
    const expected = 18_000 * DT; // ~300s
    expect(Math.abs(clock.simulatedTime - expected)).toBeLessThan(0.005);
  });
});
