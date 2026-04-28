/**
 * IServerSocket.ts
 * Server-side per-client connection abstraction.
 *
 * Implements: production/sprints/sprint-7 (TD-P0-02 — Node.js Lobby)
 * Governed by: ADR-0014 (Matchmaking), ADR-0010 (Server Authority)
 *
 * 본 인터페이스는 ws 라이브러리의 WebSocket 클래스를 그대로 노출하지 않고,
 * 서버 logic이 의존하는 최소 surface만 제공한다. 이로써:
 *   - Lobby + Auth + SessionManager logic을 ws 의존 없이 테스트 가능
 *   - 실제 ws WebSocket 인스턴스를 wrapping하는 production adapter는
 *     `WsServerSocket` (Sprint 7+ 별도 작성, npm install ws 필요)
 */

import type { ServerMessages, ClientMessages } from '../core/net/WebSocketProtocol';
import type { PlayerId } from '../core/types/Domain';

/**
 * Server → client message envelope. ServerMessages는 server가 client에게 보내는
 * 메시지 (MATCH_READY, ROUND_START 등). 이름 컨벤션은 WebSocketProtocol.ts를 따름.
 */
export type ServerMessage = {
  [K in keyof ServerMessages]: { type: K; payload: ServerMessages[K] };
}[keyof ServerMessages];

/**
 * Client → server message envelope (AUTH, MOVE 등).
 */
export type IncomingClientMessage = {
  [K in keyof ClientMessages]: { type: K; payload: ClientMessages[K] };
}[keyof ClientMessages];

export type SocketEventHandler<T> = (payload: T) => void;

export interface IServerSocket {
  /** Unique identifier for this connection. AUTH 성공 후 PlayerId가 됨. */
  readonly id: string;

  /** Send a server-typed message to the client. Production: ws.send(JSON.stringify(...)). */
  send(message: ServerMessage): void;

  /** Force-close this connection (kick / cleanup). */
  disconnect(): void;

  /** Subscribe to incoming client messages. */
  onMessage(handler: SocketEventHandler<IncomingClientMessage>): void;

  /** Subscribe to disconnect (client closed or network drop). */
  onClose(handler: () => void): void;
}

/**
 * Authenticated client = IServerSocket + verified PlayerId.
 * Created by AuthValidator after AUTH validation passes.
 */
export interface AuthenticatedClient {
  readonly socket: IServerSocket;
  readonly playerId: PlayerId;
}
