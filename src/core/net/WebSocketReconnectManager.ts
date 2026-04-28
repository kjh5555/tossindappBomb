import { IWebSocketClient } from './IWebSocketClient';
import { IEventBus } from '../events/IEventBus';
import { IFrameClock } from '../time/IFrameClock';

type DisconnectAwareClient = IWebSocketClient & {
  onDisconnect(handler: () => void): void;
};

export class WebSocketReconnectManager {
  constructor(
    private ws: DisconnectAwareClient,
    private bus: IEventBus,
    private clock: IFrameClock,
    private serverUrl: string,
    private token: string,
  ) {}

  mount(): void {
    this.ws.onDisconnect(() => this.handleDisconnect());
  }

  private async handleDisconnect(): Promise<void> {
    try {
      await this.ws.connect(this.serverUrl, this.token);
    } catch {
      this.bus.emit('GAME_OVER', {
        finalRound: -1,
        rankings: [],
        timestamp: this.clock.now(),
      });
    }
  }
}
