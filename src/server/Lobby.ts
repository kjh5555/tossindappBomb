/**
 * Lobby.ts
 * 단일 FIFO 매칭 큐 — 인증된 클라이언트가 도착하는 순서대로 모인 후 세션 시작.
 *
 * Implements: production/sprints/sprint-7 (TD-P0-02)
 * Governed by: ADR-0014 § 1 (단일 FIFO 큐, MIN=2, MAX=6)
 *
 * 동작:
 *   1. AuthenticatedClient가 onClientAuthenticated()로 도착
 *   2. 큐에 push
 *   3. 큐 길이 ≥ MIN_MATCH_SIZE 시 tryStartSession() 호출
 *   4. 큐 앞에서 MAX_MATCH_SIZE 만큼 splice → SessionManager.startSession() 호출
 *
 * Edge cases:
 *   - 로비 중 disconnect: onClientDisconnected()로 큐에서 제거
 *   - 큐 비어있을 때 disconnect: no-op
 *   - 매치 시작 직전 disconnect: race condition 방지 위해 splice 후 disconnect 확인
 *     (현재 MVP에서는 race를 무시 — 실 환경에서 발생 빈도 낮음)
 */

import type { AuthenticatedClient } from './IServerSocket';
import type { SessionManager, SessionInfo } from './SessionManager';

/** ADR-0014 default — env로 1부터 6까지 조정 가능. MVP test에서는 2 사용. */
export const DEFAULT_MIN_MATCH_SIZE = 2;
export const MAX_MATCH_SIZE = 6;

export class Lobby {
  private readonly queue: AuthenticatedClient[] = [];

  constructor(
    private readonly sessionManager: SessionManager,
    private readonly minMatchSize: number = DEFAULT_MIN_MATCH_SIZE,
  ) {
    if (minMatchSize < 1 || minMatchSize > MAX_MATCH_SIZE) {
      throw new Error(
        `Lobby: invalid minMatchSize ${minMatchSize}; must be in [1, ${MAX_MATCH_SIZE}]`,
      );
    }
  }

  /**
   * 인증된 클라이언트 입장. 큐 길이가 MIN 도달 시 즉시 세션 시작.
   * @returns 세션 시작 시 SessionInfo, 아니면 null
   */
  onClientAuthenticated(client: AuthenticatedClient): SessionInfo | null {
    this.queue.push(client);
    return this.tryStartSession();
  }

  /**
   * 로비 중 disconnect — 큐에서 제거. 매치 시작 후에는 효과 없음 (이미 splice됨).
   * @returns 큐에서 제거됐으면 true.
   */
  onClientDisconnected(client: AuthenticatedClient): boolean {
    const i = this.queue.indexOf(client);
    if (i === -1) return false;
    this.queue.splice(i, 1);
    return true;
  }

  /** 현재 큐 길이 (모니터링용). */
  getQueueLength(): number {
    return this.queue.length;
  }

  /** 강제로 매치 시작 시도 (env 변경 시 사용 — MVP는 미사용). */
  forceStartIfReady(): SessionInfo | null {
    return this.tryStartSession();
  }

  private tryStartSession(): SessionInfo | null {
    if (this.queue.length < this.minMatchSize) return null;
    const players = this.queue.splice(0, MAX_MATCH_SIZE);
    return this.sessionManager.startSession(players);
  }
}
