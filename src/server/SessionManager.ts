/**
 * SessionManager.ts
 * 세션 식별자 생성 + MATCH_READY 브로드캐스트.
 *
 * Implements: production/sprints/sprint-7 (TD-P0-02)
 * Governed by: ADR-0014 § 3 (MATCH_READY payload), ADR-0010 (서버 권위)
 *
 * 세션이 시작되면 SessionManager가:
 *   1. 고유 sessionId 생성
 *   2. 각 플레이어 socket에 MATCH_READY 페이로드 송신 (localPlayerId는 plyaer별 다름)
 *   3. 활성 세션 목록 유지 (재연결/disconnect 처리에 활용 — Sprint 7+)
 *
 * sessionId 생성 전략:
 *   - MVP: 단조 증가 카운터 + 타임스탬프 (test-deterministic)
 *   - Production: UUID v4 (Sprint 7+ 필요 시)
 */

import type { AuthenticatedClient } from './IServerSocket';
import type { PlayerId } from '../core/types/Domain';

export interface SessionInfo {
  sessionId: string;
  playerIds: PlayerId[];
  startedAt: number;
}

/**
 * 시간 기반 + 카운터 기반 sessionId 생성. test에서는 외부에서 nowFn 주입으로
 * deterministic 동작 가능.
 */
export class SessionManager {
  private counter: number = 0;
  private readonly active: Map<string, SessionInfo> = new Map();

  constructor(private readonly nowFn: () => number = () => Date.now()) {}

  /**
   * 인증된 플레이어 목록으로 세션 시작 — sessionId 생성 + MATCH_READY 브로드캐스트.
   * @returns 생성된 SessionInfo
   */
  startSession(players: AuthenticatedClient[]): SessionInfo {
    const sessionId = this.nextSessionId();
    const startedAt = this.nowFn();
    const playerIds = players.map((p) => p.playerId);

    // 각 player에게 자신의 localPlayerId가 포함된 MATCH_READY 송신
    for (const p of players) {
      p.socket.send({
        type: 'MATCH_READY',
        payload: {
          sessionId,
          playerIds,
          localPlayerId: p.playerId,
          serverTime: startedAt,
        },
      });
    }

    const info: SessionInfo = { sessionId, playerIds, startedAt };
    this.active.set(sessionId, info);
    return info;
  }

  /** 활성 세션 조회 (재연결 처리 시 활용). */
  getSession(sessionId: string): SessionInfo | null {
    return this.active.get(sessionId) ?? null;
  }

  /** 세션 종료 (게임 종료 시 호출 — Sprint 7+ 통합 시점). */
  endSession(sessionId: string): boolean {
    return this.active.delete(sessionId);
  }

  /** 활성 세션 수 (모니터링용). */
  getActiveSessionCount(): number {
    return this.active.size;
  }

  private nextSessionId(): string {
    this.counter++;
    return `sess-${this.nowFn()}-${this.counter}`;
  }
}
