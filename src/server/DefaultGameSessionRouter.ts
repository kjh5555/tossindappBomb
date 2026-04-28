/**
 * DefaultGameSessionRouter.ts
 * 기본 GameSessionRouter 구현 — SessionDispatcher + GameSession 사용.
 *
 * Implements: production/sprints/sprint-7+ (TD-P0-02 확장)
 * Governed by: ADR-0010 (서버 권위 모델)
 *
 * 책임:
 *   - 매치 시작 시 SessionDispatcher.registerSession + GameSession.startFirstRound
 *   - MOVE 메시지 → GameSession.handleMove → PLAYER_MOVE broadcast
 *   - Disconnect 시 dispatcher에서 client 제거
 *
 * 향후 (Sprint 8+):
 *   - PLAYER_KILLED 권위적 broadcast
 *   - ROUND_CLEAR 판정 + 자동 advanceRound()
 *   - GAME_OVER 발행 (전원 사망 또는 max round)
 */

import type { AuthenticatedClient } from './IServerSocket';
import type { ClientMessages } from '../core/net/WebSocketProtocol';
import type { PlayerId } from '../core/types/Domain';
import type { GameSessionRouter } from './MatchmakingServer';
import { SessionDispatcher } from './SessionDispatcher';
import { GameSession } from './GameSession';

export class DefaultGameSessionRouter implements GameSessionRouter {
  private readonly sessions: Map<string, GameSession> = new Map();
  private readonly clientByPlayerId: Map<PlayerId, AuthenticatedClient> = new Map();

  constructor(private readonly dispatcher: SessionDispatcher = new SessionDispatcher()) {}

  startSession(sessionId: string, players: AuthenticatedClient[]): void {
    this.dispatcher.registerSession(sessionId, players);
    for (const p of players) this.clientByPlayerId.set(p.playerId, p);

    const game = new GameSession(
      sessionId,
      players.map((p) => p.playerId),
      this.dispatcher,
    );
    this.sessions.set(sessionId, game);
    game.startFirstRound();
  }

  handleMove(sessionId: string, playerId: PlayerId, move: ClientMessages['MOVE']): void {
    const game = this.sessions.get(sessionId);
    if (!game) return; // 세션 미등록 — 무시
    game.handleMove(playerId, move);
  }

  onClientDisconnected(sessionId: string, playerId: PlayerId): void {
    const client = this.clientByPlayerId.get(playerId);
    if (client) {
      this.dispatcher.removeClient(client);
      this.clientByPlayerId.delete(playerId);
    }

    // ADR-0010 mitigation — 게임 중 disconnect → PLAYER_KILLED broadcast
    // 다른 player에게 알림. 발신자 본인은 이미 끊겼으므로 broadcast로 충분.
    this.dispatcher.broadcast(sessionId, {
      type: 'PLAYER_KILLED',
      payload: {
        playerIds: [playerId],
        cellId: 0, // 알 수 없음 — 클라이언트가 disconnect 사유로 인지
        cause: 'EXPLOSION',
        timestamp: Date.now(),
      },
    });
  }

  endSession(sessionId: string): void {
    this.dispatcher.endSession(sessionId);
    this.sessions.delete(sessionId);
  }

  /** Test inspection — 현재 활성 GameSession 조회. */
  getSession(sessionId: string): GameSession | undefined {
    return this.sessions.get(sessionId);
  }

  /** Test inspection — 활성 세션 수. */
  getActiveSessionCount(): number {
    return this.sessions.size;
  }
}
