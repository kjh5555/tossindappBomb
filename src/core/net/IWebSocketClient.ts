import { ServerMessages, ClientMessage } from './WebSocketProtocol';

export interface IWebSocketClient {
  connect(serverUrl: string, token: string): Promise<void>;
  disconnect(): void;
  send(msg: ClientMessage): void;
  on<K extends keyof ServerMessages>(type: K, handler: (payload: ServerMessages[K]) => void): void;
  off<K extends keyof ServerMessages>(type: K, handler: (payload: ServerMessages[K]) => void): void;
  readonly isConnected: boolean;
}
