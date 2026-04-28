import { PlayerId } from '../../core/types/Domain';

/**
 * Per-player lifecycle status within a single round.
 *
 * ALIVE     — player is active and can move/interact on the grid.
 * SPECTATOR — player has been killed this round; watches but cannot move.
 *             Eligible to send SPECTATOR_CHEER (rate-limited by gatePeriod).
 *
 * Transitions:
 *   ALIVE → SPECTATOR : PLAYER_KILLED event received (onPlayerKilled)
 *   SPECTATOR → ALIVE : Round clears (markAllAliveForNextRound)
 *
 * GDD Story-002: 플레이어 상태 추적 + 라운드 종료 조건
 */
export type PlayerStatus = 'ALIVE' | 'SPECTATOR';

/**
 * Full state record for a single player tracked by RoundManager.
 *
 * @property playerId       - Unique player identifier (Domain.PlayerId)
 * @property status         - Current lifecycle status for the active round
 * @property lastCheerTime  - simulatedTime of last accepted SPECTATOR_CHEER;
 *                            initialised to -Infinity so the first cheer always passes
 * @property pathIndex      - Path grid index at time of death; reset to 0 on revive.
 *                            EC-RM-7: always reset to index 0, no position fallback.
 */
export interface PlayerState {
  playerId: PlayerId;
  status: PlayerStatus;
  lastCheerTime: number;
  pathIndex: number;
}
