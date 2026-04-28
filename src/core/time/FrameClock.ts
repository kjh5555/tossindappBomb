import { IEventBus } from '../events/IEventBus';
import { IFrameClock } from './IFrameClock';

export class FrameClock implements IFrameClock {
  public simulatedTime = 0;
  private lastDt = 0;
  private schedules: Array<{ fn: () => void; fireAt: number }> = [];

  constructor(private eventBus: IEventBus) {}

  tick(dt: number): void {
    this.lastDt = dt;
    this.simulatedTime += dt;           // 1. time advance
    this.drainSchedules();              // 2. fire due schedules
    (this.eventBus as any).unlockFlush?.();
    this.eventBus.flush();             // 3. flush event queue
    (this.eventBus as any).lockFlush?.();
  }

  now(): number { return this.simulatedTime; }
  dt(): number { return this.lastDt; }

  schedule(fn: () => void, delaySecs: number): void {
    this.schedules.push({ fn, fireAt: this.simulatedTime + delaySecs });
  }

  cancelSchedule(fn: () => void): void {
    const idx = this.schedules.findIndex(s => s.fn === fn);
    if (idx !== -1) this.schedules.splice(idx, 1);
  }

  private drainSchedules(): void {
    const due = this.schedules.filter(s => s.fireAt <= this.simulatedTime);
    this.schedules = this.schedules.filter(s => s.fireAt > this.simulatedTime);
    for (const { fn } of due) fn();
  }
}
