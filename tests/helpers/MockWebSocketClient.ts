import { IWebSocketClient } from '../../src/core/net/IWebSocketClient';
import { ServerMessages, ClientMessage } from '../../src/core/net/WebSocketProtocol';

export class MockWebSocketClient implements IWebSocketClient {
  private handlers = new Map<string, Array<(p: any) => void>>();
  private disconnectHandlers: Array<() => void> = [];
  private _isConnected = false;
  readonly sentMessages: ClientMessage[] = [];

  async connect(_url: string, _token: string): Promise<void> {
    this._isConnected = true;
  }

  disconnect(): void {
    this._isConnected = false;
  }

  send(msg: ClientMessage): void {
    this.sentMessages.push(msg);
  }

  get isConnected(): boolean {
    return this._isConnected;
  }

  on<K extends keyof ServerMessages>(type: K, handler: (payload: ServerMessages[K]) => void): void {
    if (!this.handlers.has(type as string)) this.handlers.set(type as string, []);
    this.handlers.get(type as string)!.push(handler);
  }

  off<K extends keyof ServerMessages>(type: K, handler: (payload: ServerMessages[K]) => void): void {
    const list = this.handlers.get(type as string);
    if (list) {
      const i = list.indexOf(handler as any);
      if (i !== -1) list.splice(i, 1);
    }
  }

  simulateMessage<K extends keyof ServerMessages>(type: K, payload: ServerMessages[K]): void {
    this.handlers.get(type as string)?.forEach(h => h(payload));
  }

  onDisconnect(handler: () => void): void {
    this.disconnectHandlers.push(handler);
  }

  simulateDisconnect(): void {
    this._isConnected = false;
    this.disconnectHandlers.forEach(h => h());
  }
}
