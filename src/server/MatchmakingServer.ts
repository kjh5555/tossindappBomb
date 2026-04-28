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
import type { PlayerId } from '../core/types/Domain';
import type { IAuthValidator } from './AuthValidator';
import type { Lobby } from './Lobby';
import type { SessionInfo } from './SessionManager';

/**
 * Optional game session router — 매치 시작 후의 라운드/이동 메시지 처리 책임을
 * 이 인터페이스에 위임. 없으면 MatchmakingServer는 매치 시작까지만 처리하고
 * 이후 게임 메시지 (MOVE 등)는 무시한다.
 *
 * 기본 구현: SessionDispatcher + GameSession (별도 파일).
 */
export interface GameSessionRouter {
  /** 새 세션 시작 — players의 socket을 dispatcher에 등록하고 ROUND_START broadcast. */
  startSession(sessionId: string, players: AuthenticatedClient[]): void;
  /** MOVE 메시지 처리 — 같은 세션의 다른 client에게 broadcast. */
  handleMove(sessionId: string, playerId: PlayerId, move: ClientMessages['MOVE']): void;
  /**
   * 클라이언트 disconnect 알림 — dispatcher 정리 + 잠재적 PLAYER_KILLED broadcast
   * (ADR-0010 mitigation: 게임 중 disconnect → 해당 player 사망 처리).
   */
  onClientDisconnected(sessionId: string, playerId: PlayerId): void;
  /** 세션 종료 + dispatcher 정리. */
  endSession(sessionId: string): void;
}

interface PendingClient {
  socket: IServerSocket;
  /** Authenticated 후에는 lobby에 들어간 client reference. AUTH 전이면 null. */
  authenticated: AuthenticatedClient | null;
  /** 매치 시작 후 sessionId — 매치 후 발생하는 MOVE 등 메시지 라우팅. */
  sessionId: string | null;
}

export class MatchmakingServer {
  private readonly pending: Map<string, PendingClient> = new Map();

  constructor(
    private readonly authValidator: IAuthValidator,
    private readonly lobby: Lobby,
    private readonly gameRouter?: GameSessionRouter,
  ) {}

  /**
   * WS 서버가 새 connection 수락 시 호출. AUTH 메시지를 기다린다.
   */
  onClientConnected(socket: IServerSocket): void {
    if (this.pending.has(socket.id)) {
      // 동일 id 재진입 — 기존 연결 정리
      this.cleanupSocket(socket.id);
    }
    const pending: PendingClient = { socket, authenticated: null, sessionId: null };
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

    // MOVE 메시지 — 매치 진행 중인 경우 GameSessionRouter로 라우팅
    if (msg.type === 'MOVE' && pending.sessionId && this.gameRouter) {
      this.gameRouter.handleMove(
        pending.sessionId,
        pending.authenticated.playerId,
        msg.payload as ClientMessages['MOVE'],
      );
    }
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
    if (sessionInfo) {
      // 매치 시작됐으니 모든 참가 player의 pending에 sessionId 기록
      // (해당 session 내 client만 추적하도록)
      const matchedClients: AuthenticatedClient[] = [];
      for (const p of this.pending.values()) {
        if (p.authenticated && sessionInfo.playerIds.includes(p.authenticated.playerId)) {
          p.sessionId = sessionInfo.sessionId;
          matchedClients.push(p.authenticated);
        }
      }
      // 게임 라우터에 세션 시작 알림 — ROUND_START broadcast 포함
      if (this.gameRouter) {
        this.gameRouter.startSession(sessionInfo.sessionId, matchedClients);
      }
      if (this.onSessionStarted) {
        this.onSessionStarted(sessionInfo);
      }
    }
  }

  private cleanupSocket(socketId: string): void {
    const pending = this.pending.get(socketId);
    if (!pending) return;
    if (pending.authenticated) {
      // 매치 진행 중인지 vs 로비 대기 중인지에 따라 라우팅
      if (pending.sessionId && this.gameRouter) {
        this.gameRouter.onClientDisconnected(pending.sessionId, pending.authenticated.playerId);
      } else {
        this.lobby.onClientDisconnected(pending.authenticated);
      }
    }
    this.pending.delete(socketId);
  }
}
