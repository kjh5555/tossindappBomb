import { GameEvents } from './GameEvents';

export interface IEventBus {
  emit<K extends keyof GameEvents>(key: K, payload: GameEvents[K]): void;
  on<K extends keyof GameEvents>(key: K, handler: (e: GameEvents[K]) => void): void;
  off<K extends keyof GameEvents>(key: K, handler: (e: GameEvents[K]) => void): void;
  flush(): void;
}
