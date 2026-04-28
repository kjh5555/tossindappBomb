/**
 * WsServerSocket.ts
 * Production adapter — wraps `ws.WebSocket` with the IServerSocket interface.
 *
 * Implements: production/sprints/sprint-7 (TD-P0-02)
 * Governed by: ADR-0014 (Matchmaking), ADR-0010 (Server Authority)
 *
 * 본 adapter는 ws 라이브러리(`npm install ws`) 의존성을 격리. 서버 logic
 * (Lobby/AuthValidator/SessionManager/MatchmakingServer)은 IServerSocket 인터페이스만
 * 사용하므로 ws 의존성은 본 파일과 server-bootstrap.ts에만 존재.
 *
 * Wire 형식:
 *   - 서버 → 클라이언트: JSON.stringify(ServerMessage)
 *   - 클라이언트 → 서버: JSON.parse → IncomingClientMessage
 *
 * 안전성:
 *   - JSON parse 실패 시 silent ignore (잘못된 포맷의 메시지는 disconnect 사유 X)
 *   - 메시지 type 누락/불일치 시 silent ignore
 */

import type { WebSocket } from 'ws';
import type {
  IServerSocket,
  ServerMessage,
  IncomingClientMessage,
} from './IServerSocket';

let socketCounter = 0;

export class WsServerSocket implements IServerSocket {
  readonly id: string;

  private readonly messageHandlers: Array<(msg: IncomingClientMessage) => void> = [];
  private readonly closeHandlers: Array<() => void> = [];

  constructor(private readonly ws: WebSocket) {
    socketCounter++;
    this.id = `sock-${socketCounter}-${Date.now()}`;

    ws.on('message', (data) => this.handleRawMessage(data));
    ws.on('close', () => this.handleClose());
    ws.on('error', () => this.handleClose());
  }

  send(message: ServerMessage): void {
    if (this.ws.readyState !== this.ws.OPEN) return;
    this.ws.send(JSON.stringify(message));
  }

  disconnect(): void {
    if (this.ws.readyState === this.ws.OPEN || this.ws.readyState === this.ws.CONNECTING) {
      this.ws.close();
    }
  }

  onMessage(handler: (msg: IncomingClientMessage) => void): void {
    this.messageHandlers.push(handler);
  }

  onClose(handler: () => void): void {
    this.closeHandlers.push(handler);
  }

  private handleRawMessage(data: unknown): void {
    let parsed: unknown;
    try {
      const text = typeof data === 'string' ? data : data instanceof Buffer ? data.toString('utf8') : String(data);
      parsed = JSON.parse(text);
    } catch {
      return; // malformed — silent ignore
    }

    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !('type' in parsed) ||
      !('payload' in parsed)
    ) {
      return;
    }

    const msg = parsed as IncomingClientMessage;
    if (msg.type !== 'AUTH' && msg.type !== 'MOVE') return; // unknown type

    for (const h of [...this.messageHandlers]) h(msg);
  }

  private handleClose(): void {
    for (const h of [...this.closeHandlers]) h();
  }
}
