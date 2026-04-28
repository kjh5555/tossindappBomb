import { GameEvents } from './GameEvents';
import { IEventBus } from './IEventBus';

export class EventBus implements IEventBus {
  private queue: Array<{ key: keyof GameEvents; payload: GameEvents[keyof GameEvents] }> = [];
  private handlers = new Map<keyof GameEvents, Array<(e: any) => void>>();
  private isFlushing = false;
  private isFlushLocked = true;

  emit<K extends keyof GameEvents>(key: K, payload: GameEvents[K]): void {
    this.queue.push({ key, payload });
  }

  on<K extends keyof GameEvents>(key: K, handler: (e: GameEvents[K]) => void): void {
    if (!this.handlers.has(key)) this.handlers.set(key, []);
    this.handlers.get(key)!.push(handler as (e: any) => void);
  }

  off<K extends keyof GameEvents>(key: K, handler: (e: GameEvents[K]) => void): void {
    const list = this.handlers.get(key);
    if (list) {
      const idx = list.indexOf(handler as (e: any) => void);
      if (idx !== -1) list.splice(idx, 1);
    }
  }

  flush(): void {
    if (this.isFlushLocked) {
      console.warn('[EventBus] flush() called outside FrameClock.tick() — ignored');
      return;
    }
    if (this.isFlushing) return;
    this.isFlushing = true;
    const snapshot = this.queue.splice(0);
    for (const { key, payload } of snapshot) {
      const list = this.handlers.get(key);
      if (list) for (const h of list) h(payload);
    }
    this.isFlushing = false;
  }

  /** Called by FrameClock.tick() before flush — never call directly */
  unlockFlush(): void { this.isFlushLocked = false; }
  /** Called by FrameClock.tick() after flush — never call directly */
  lockFlush(): void { this.isFlushLocked = true; }
}
