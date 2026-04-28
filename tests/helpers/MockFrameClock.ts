import { IFrameClock } from '../../src/core/time/IFrameClock';
import { IEventBus } from '../../src/core/events/IEventBus';

export class MockFrameClock implements IFrameClock {
  simulatedTime = 0;
  private schedules: Array<{ fn: () => void; fireAt: number }> = [];

  private lastDt = 0;
  tick(dt: number): void { this.lastDt = dt; this.simulatedTime += dt; }
  now(): number { return this.simulatedTime; }
  dt(): number { return this.lastDt; }

  schedule(fn: () => void, delaySecs: number): void {
    this.schedules.push({ fn, fireAt: this.simulatedTime + delaySecs });
  }

  cancelSchedule(fn: () => void): void {
    const idx = this.schedules.findIndex(s => s.fn === fn);
    if (idx !== -1) this.schedules.splice(idx, 1);
  }

  /** Advance time and flush the given bus — simulates FrameClock.tick() in tests */
  advanceBy(dt: number, bus: IEventBus): void {
    this.simulatedTime += dt;
    this.drainSchedules();
    (bus as any).unlockFlush?.();
    bus.flush();
    (bus as any).lockFlush?.();
  }

  private drainSchedules(): void {
    const due = this.schedules.filter(s => s.fireAt <= this.simulatedTime);
    this.schedules = this.schedules.filter(s => s.fireAt > this.simulatedTime);
    for (const { fn } of due) fn();
  }
}
