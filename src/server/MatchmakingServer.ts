/**
 * MatchmakingServer.ts
 * 서버 측 matchmaking 오케스트레이션 — 새 socket 연결 → AUTH 대기 → Lobby 추가.
 *
 * Implements: production/sprints/sprint-7 (TD-P0-02)
 * Governed by: ADR-0014 (전체) + ADR-0010 (서버 권위)
 *
 * 흐름:
 *   1. WS 서버가 새 socket을 onClientConnected()로 전달
 *   2. AUTH 메시지 수신 대기
 *   3. AUTH 검증 성공 → Lobby에 추가
 *   4. AUTH 검증 실패 또는 timeout → disconnect
 *   5. 로비 중 disconnect → Lobby에서 제거
 *
 * 본 클래스는 ws/WebSocket 라이브러리에 의존하지 않는다 (IServerSocket 인터페이스만 사용).
 * 실제 WebSocket 서버 부팅은 별도 entry point (Sprint 7+ 작성: server-bootstrap.ts):
 *
 *   import { WebSocketServer } from 'ws';
 *   const wss = new WebSocketServer({ port: 8080 });
 *   wss.on('connection', (ws) => server.onClientConnected(new WsServerSocket(ws)));
 */

import type { IServerSocket, AuthenticatedClient } from './IServerSocket';
import type { ClientMessages } from '../core/net/WebSocketProtocol';
import type { IAuthValidator } from './AuthValidator';
import type { Lobby } from './Lobby';
import type { SessionInfo } from './SessionManager';

interface PendingClient {
  socket: IServerSocket;
  /** Authenticated 후에는 lobby에 들어간 client reference. AUTH 전이면 null. */
  authenticated: AuthenticatedClient | null;
}

export class MatchmakingServer {
  private readonly pending: Map<string, PendingClient> = new Map();

  constructor(
    private readonly authValidator: IAuthValidator,
    private readonly lobby: Lobby,
  ) {}

  /**
   * WS 서버가 새 connection 수락 시 호출. AUTH 메시지를 기다린다.
   */
  onClientConnected(socket: IServerSocket): void {
    if (this.pending.has(socket.id)) {
      // 동일 id 재진입 — 기존 연결 정리
      this.cleanupSocket(socket.id);
    }
    const pending: PendingClient = { socket, authenticated: null };
    this.pending.set(socket.id, pending);

    socket.onMessage((msg) => this.handleMessage(socket.id, msg));
    socket.onClose(() => this.cleanupSocket(socket.id));
  }

  /** 로비 + 활성 세션 통계 (모니터링/로깅용). */
  getStats(): { pendingCount: number; queueLength: number } {
    return {
      pendingCount: this.pending.size,
      queueLength: this.lobby.getQueueLength(),
    };
  }

  /** Test inspection — 세션 시작 결과를 받기 위한 콜백. */
  onSessionStarted?: (info: SessionInfo) => void;

  private handleMessage(
    socketId: string,
    msg: { type: string; payload: unknown },
  ): void {
    const pending = this.pending.get(socketId);
    if (!pending) return;

    if (msg.type === 'AUTH') {
      this.handleAuth(pending, msg.payload as ClientMessages['AUTH']);
      return;
    }

    // 인증 전 다른 메시지는 무시 (또는 disconnect — 정책에 따라)
    if (!pending.authenticated) return;

    // MOVE 등 인증 후 메시지는 게임 세션 핸들러로 라우팅 (Sprint 7+ 통합)
    // MVP: no-op
  }

  private handleAuth(pending: PendingClient, auth: ClientMessages['AUTH']): void {
    if (pending.authenticated) {
      // 중복 AUTH 무시
      return;
    }
    const authClient = this.authValidator.validate(pending.socket, auth);
    if (!authClient) {
      pending.socket.disconnect();
      this.cleanupSocket(pending.socket.id);
      return;
    }
    pending.authenticated = authClient;
    const sessionInfo = this.lobby.onClientAuthenticated(authClient);
    if (sessionInfo && this.onSessionStarted) {
      this.onSessionStarted(sessionInfo);
    }
  }

  private cleanupSocket(socketId: string): void {
    const pending = this.pending.get(socketId);
    if (!pending) return;
    if (pending.authenticated) {
      this.lobby.onClientDisconnected(pending.authenticated);
    }
    this.pending.delete(socketId);
  }
}
