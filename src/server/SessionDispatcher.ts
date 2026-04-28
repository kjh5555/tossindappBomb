/**
 * SessionDispatcher.ts
 * 세션별 클라이언트 그룹 관리 + 메시지 broadcast.
 *
 * Implements: production/sprints/sprint-7+ (TD-P0-02 확장)
 * Governed by: ADR-0010 (서버 권위) — 라운드 전환 + PLAYER_KILLED broadcast,
 *              ADR-0014 (Matchmaking)
 *
 * 책임:
 *   - sessionId → AuthenticatedClient[] 매핑 보유
 *   - broadcast(sessionId, message) — 세션 내 모든 client에게 송신
 *   - excludeOne(sessionId, clientId, message) — 특정 client 제외 broadcast
 *     (예: MOVE relay 시 발신자 본인은 제외)
 *   - 세션 종료 시 매핑 정리
 *
 * Phase: 게임 진행 중 메시지 broadcast 모델은 ADR-0010의 hybrid 모델을 따름.
 *   - 서버 권위: ROUND_START seed, PLAYER_KILLED 확정, ROUND_CLEAR/GAME_OVER
 *   - 클라이언트 예측: 이동, 폭발 타이밍 (deterministic by seed)
 *   - 본 dispatcher는 broadcast 메커니즘만 제공 — 게임 로직 결정은 별도 모듈 (Sprint 8+)
 */

import type { AuthenticatedClient } from './IServerSocket';
import type { ServerMessage } from './IServerSocket';

export class SessionDispatcher {
  private readonly sessionClients: Map<string, AuthenticatedClient[]> = new Map();

  /**
   * 세션 등록 — Lobby에서 매치 시작 시 호출.
   * 동일 sessionId 재등록 시 기존 매핑 덮어씀 (의도치 않은 중복 방지).
   */
  registerSession(sessionId: string, clients: AuthenticatedClient[]): void {
    this.sessionClients.set(sessionId, [...clients]);
  }

  /** 세션 ID로 클라이언트 목록 조회 (read-only copy). */
  getClients(sessionId: string): AuthenticatedClient[] {
    const list = this.sessionClients.get(sessionId);
    return list ? [...list] : [];
  }

  /**
   * 세션 내 모든 클라이언트에게 메시지 송신.
   * @returns 실제로 송신된 클라이언트 수
   */
  broadcast(sessionId: string, message: ServerMessage): number {
    const clients = this.sessionClients.get(sessionId);
    if (!clients) return 0;
    for (const c of clients) c.socket.send(message);
    return clients.length;
  }

  /**
   * 발신자(excludePlayerId)를 제외하고 broadcast — MOVE relay 등에 사용.
   * @returns 실제로 송신된 클라이언트 수
   */
  broadcastExcept(
    sessionId: string,
    excludePlayerId: string,
    message: ServerMessage,
  ): number {
    const clients = this.sessionClients.get(sessionId);
    if (!clients) return 0;
    let count = 0;
    for (const c of clients) {
      if (c.playerId === excludePlayerId) continue;
      c.socket.send(message);
      count++;
    }
    return count;
  }

  /**
   * 단일 플레이어에게 메시지 송신 (특정 client target).
   * @returns 송신 성공 시 true
   */
  sendToPlayer(sessionId: string, playerId: string, message: ServerMessage): boolean {
    const clients = this.sessionClients.get(sessionId);
    if (!clients) return false;
    const c = clients.find((x) => x.playerId === playerId);
    if (!c) return false;
    c.socket.send(message);
    return true;
  }

  /**
   * 클라이언트가 disconnect 시 세션에서 제거. 모든 세션 검색.
   * @returns 제거된 sessionId 또는 null (어떤 세션에도 없으면)
   */
  removeClient(client: AuthenticatedClient): string | null {
    for (const [sessionId, clients] of this.sessionClients) {
      const i = clients.indexOf(client);
      if (i !== -1) {
        clients.splice(i, 1);
        return sessionId;
      }
    }
    return null;
  }

  /** 세션 종료 — 모든 client 매핑 정리. */
  endSession(sessionId: string): void {
    this.sessionClients.delete(sessionId);
  }

  /** 활성 세션 수 (모니터링용). */
  getActiveSessionCount(): number {
    return this.sessionClients.size;
  }
}
