export interface IFrameClock {
  readonly simulatedTime: number;
  tick(dt: number): void;
  now(): number;
  dt(): number;
  schedule(fn: () => void, delaySecs: number): void;
  cancelSchedule(fn: () => void): void;
}
