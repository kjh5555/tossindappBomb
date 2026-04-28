import { CellCoord, PlayerId, EscalationContext } from '../../core/types/Domain';
import { cellEquals } from '../../core/grid/CellCoord';
import { IEventBus } from '../../core/events/IEventBus';
import { GameEvents } from '../../core/events/GameEvents';
import { IFrameClock } from '../../core/time/IFrameClock';
import { IGridSimulation } from '../../core/grid/IGridSimulation';
import { PlayerState } from './PlayerStatus';

/**
 * Round escalation context provider.
 * Computes difficulty parameters for a given round.
 */
export interface IRoundEscalation {
  computeContext(roundNumber: number, seed: number): EscalationContext;
}

// ════════════════════════════════════════════════════════════════════════════
// Constants (ADR-0011)
// ════════════════════════════════════════════════════════════════════════════

/** Display duration after a round clears, before next round starts (seconds). */
export const ROUND_CLEAR_DISPLAY_DURATION = 1.5;

/** Maximum time for a single round before automatic timeout/GAME_OVER (seconds). */
export const ROUND_TIME_LIMIT = 60;

/**
 * Baseline gate period for Goal Cell safety determination (F-RM-1).
 * If nextExplosionTime(N-1) < this threshold, fall back to N-2.
 */
export const GATE_PERIOD_BASE = 2.0;

// ════════════════════════════════════════════════════════════════════════════
// Types & Interfaces
// ════════════════════════════════════════════════════════════════════════════

/** 4-state finite state machine for round lifecycle. */
export type RoundPhase = 'IDLE' | 'ROUND_ACTIVE' | 'ROUND_CLEAR_DISPLAY' | 'GAME_OVER';

// ════════════════════════════════════════════════════════════════════════════
// Helper Functions
// ════════════════════════════════════════════════════════════════════════════

/**
 * Determine Goal Cell placement using F-RM-1 logic.
 *
 * Rule: If the last cell on the path (N-1) is unsafe (explodes within GATE_PERIOD_BASE),
 * place Goal Cell at N-2 (one cell back). No further fallback — if N-2 is also unsafe,
 * still place at N-2 (EC-RM-1: "공정한 죽음" principle: player must navigate to safety).
 *
 * @param pathCells Array of cell coordinates along the path (in order)
 * @param gridSim Grid simulation instance to query explosion times
 * @returns The cell coordinate for Goal Cell placement
 */
function placeGoalCell(pathCells: CellCoord[], gridSim: IGridSimulation): CellCoord {
  const lastCell = pathCells[pathCells.length - 1];     // N-1 (normal placement)
  const fallbackCell = pathCells[pathCells.length - 2]; // N-2 (safety fallback)

  const explosionTime = gridSim.nextExplosionTime(lastCell);

  // If N-1 explodes within GATE_PERIOD_BASE, fall back to N-2 (EC-RM-1)
  if (explosionTime !== null && explosionTime < GATE_PERIOD_BASE) {
    return fallbackCell;
  }

  return lastCell;
}

// ════════════════════════════════════════════════════════════════════════════
// RoundManager Class
// ════════════════════════════════════════════════════════════════════════════

/**
 * Manages round lifecycle and state transitions via a 4-state FSM.
 *
 * Responsibilities:
 * - IDLE → ROUND_ACTIVE transition (startRound)
 * - ROUND_ACTIVE state: handle PLAYER_ARRIVED, PLAYER_KILLED, GRID_STALLED,
 *   SPECTATOR_CHEER events
 * - ROUND_CLEAR_DISPLAY state: wait for clear animation, auto-advance to next round
 * - GAME_OVER state: terminal state until reset
 *
 * Architecture:
 * - Pure TypeScript; no Cocos Creator API dependencies (except IFrameClock, IEventBus)
 * - All state transitions guarded by phase checks to prevent invalid events
 * - Timer management via FrameClock.schedule/cancelSchedule (deterministic)
 * - EventBus for inter-system communication
 * - Player status tracked via Map<PlayerId, PlayerState> (Story-002)
 *
 * ADR-0011: Round Phase 상태 머신
 * GDD Story-002: 플레이어 상태 추적 + 라운드 종료 조건
 */
export class RoundManager {
  private phase: RoundPhase = 'IDLE';
  private roundNumber = 0;
  private goalCell: CellCoord | null = null;
  private aliveCount = 0;
  private roundTimerFn: (() => void) | null = null;
  private clearDisplayTimerFn: (() => void) | null = null;

  /** Per-player state map. Empty when no playerIds were provided (legacy/test mode). */
  private playerStates: Map<PlayerId, PlayerState> = new Map();

  /** Cached gatePeriod from escalation context; used for spectator cheer rate-limiting. */
  private gatePeriod = GATE_PERIOD_BASE;

  /**
   * @param clock         Frame clock for scheduling and time queries
   * @param eventBus      Event bus for emitting and subscribing to game events
   * @param escalation    Escalation context provider (difficulty curve)
   * @param gridSim       Grid simulation for goal cell placement queries
   * @param pathCells     Ordered path cell array; goal cell chosen from N-1 / N-2
   * @param totalPlayers  Total number of players in the session
   * @param seed          Random seed passed to escalation context computation
   * @param playerIds     Optional player ID list for per-player state tracking (Story-002).
   *                      Omit (or pass []) to use legacy alive-count-only mode (Story-001 compat).
   */
  constructor(
    private clock: IFrameClock,
    private eventBus: IEventBus,
    private escalation: IRoundEscalation,
    private gridSim: IGridSimulation,
    private pathCells: CellCoord[],
    private totalPlayers: number,
    private seed: number,
    private playerIds: PlayerId[] = [],
  ) {
    this.eventBus.on('PLAYER_ARRIVED', (evt) => this.onPlayerArrived(evt));
    this.eventBus.on('PLAYER_KILLED', (evt) => this.onPlayerKilled(evt));
    this.eventBus.on('GRID_STALLED', (evt) => this.onGridStalled(evt));
    this.eventBus.on('SPECTATOR_CHEER', (evt) => this.onSpectatorCheer(evt));
  }

  /**
   * Start a new round.
   *
   * Valid from IDLE (first round) or ROUND_CLEAR_DISPLAY (next round after clear).
   * All other phases are a no-op guard.
   *
   * Sequence (CRITICAL ORDER per ADR-0006):
   * 1. Compute escalation context
   * 2. Set gate period in grid simulation (BEFORE ROUND_STARTED emit)
   * 3. Determine Goal Cell placement (F-RM-1)
   * 4. Schedule round timeout timer
   * 5. Transition to ROUND_ACTIVE
   * 6. Emit ROUND_STARTED + GOAL_PLACED (same EventBus flush)
   *
   * Player states are initialised on the very first call (IDLE phase only) when
   * playerIds were provided. Subsequent round starts rely on markAllAliveForNextRound()
   * having already reset them during the ROUND_CLEAR_DISPLAY → startRound(N+1) flow.
   *
   * AC-RM-01, AC-RM-02, AC-RM-03
   * ADR-0006 Exception 1: setGatePeriod must precede ROUND_STARTED emit
   *
   * @param roundNumber The round number to start (1-indexed)
   */
  startRound(roundNumber: number): void {
    // Guard: only start from IDLE (first round) or ROUND_CLEAR_DISPLAY (next round)
    if (this.phase !== 'IDLE' && this.phase !== 'ROUND_CLEAR_DISPLAY') return;

    // Initialise player states on first call only (IDLE → ROUND_ACTIVE)
    if (this.phase === 'IDLE' && this.playerIds.length > 0) {
      this.playerStates.clear();
      for (const id of this.playerIds) {
        this.playerStates.set(id, {
          playerId: id,
          status: 'ALIVE',
          lastCheerTime: -Infinity,
          pathIndex: 0,
        });
      }
    }

    this.roundNumber = roundNumber;
    this.aliveCount = this.totalPlayers;

    // 1. Compute escalation context (difficulty parameters)
    const ctx = this.escalation.computeContext(roundNumber, this.seed);

    // 2. Store gate period for spectator cheer rate-limiting
    this.gatePeriod = ctx.gatePeriod;

    // 3. Set gate period in grid (ADR-0006 Exception 1: BEFORE emit)
    this.gridSim.setGatePeriod(ctx.gatePeriod);

    // 4. Determine Goal Cell placement (F-RM-1)
    this.goalCell = placeGoalCell(this.pathCells, this.gridSim);

    // 5. Schedule round timeout timer
    this.roundTimerFn = () => this.onRoundTimerExpired();
    this.clock.schedule(this.roundTimerFn, ROUND_TIME_LIMIT);

    // 6. Transition to ROUND_ACTIVE
    this.phase = 'ROUND_ACTIVE';

    // 7. Emit events (same flush — EventBus queues and flushes once per tick)
    this.eventBus.emit('ROUND_STARTED', {
      roundNumber,
      ctx,
      timestamp: this.clock.now(),
    });

    this.eventBus.emit('GOAL_PLACED', {
      cell: this.goalCell,
      timestamp: this.clock.now(),
    });
  }

  /**
   * Handle PLAYER_ARRIVED event.
   *
   * If the player reaches the Goal Cell while the round is active, transition to
   * ROUND_CLEAR_DISPLAY and schedule the clear animation timer.
   *
   * Guard: Only process in ROUND_ACTIVE state.
   * - In ROUND_CLEAR_DISPLAY: ignore (EC-RM-4 — already cleared)
   * - In other states: ignore (IDLE, GAME_OVER)
   *
   * AC-RM-04, AC-TIE-01/02
   *
   * @param evt PLAYER_ARRIVED event
   */
  onPlayerArrived(evt: GameEvents['PLAYER_ARRIVED']): void {
    // EC-RM-4: Ignore if not in ROUND_ACTIVE
    if (this.phase !== 'ROUND_ACTIVE') return;

    // Ignore if player didn't reach Goal Cell
    if (!this.goalCell || !cellEquals(evt.cell, this.goalCell)) return;

    // Cancel round timer (no longer needed)
    if (this.roundTimerFn) {
      this.clock.cancelSchedule(this.roundTimerFn);
      this.roundTimerFn = null;
    }

    // Transition to ROUND_CLEAR_DISPLAY
    this.phase = 'ROUND_CLEAR_DISPLAY';

    // Emit ROUND_CLEAR event
    this.eventBus.emit('ROUND_CLEAR', {
      roundNumber: this.roundNumber,
      survivors: this.getAlivePlayerIds(),
      timestamp: this.clock.now(),
    });

    // Reset all players to ALIVE for next round (AC-RM-05 / AC-SUR-05/06)
    this.markAllAliveForNextRound();

    // Schedule clear animation display timer
    this.clearDisplayTimerFn = () => this.onClearDisplayExpired();
    this.clock.schedule(this.clearDisplayTimerFn, ROUND_CLEAR_DISPLAY_DURATION);
  }

  /**
   * Handle PLAYER_KILLED event.
   *
   * Transitions killed players to SPECTATOR status and decrements alive count.
   * Triggers GAME_OVER if no players remain alive.
   *
   * Guard: Only process in ROUND_ACTIVE state.
   * - In ROUND_CLEAR_DISPLAY: ignore (EC-RM-4 — round already cleared)
   *
   * AC-SUR-01, AC-SUR-02, AC-RM-07, AC-RM-08
   *
   * @param evt PLAYER_KILLED event
   */
  onPlayerKilled(evt: GameEvents['PLAYER_KILLED']): void {
    // EC-RM-4: Ignore if not in ROUND_ACTIVE
    if (this.phase !== 'ROUND_ACTIVE') return;

    if (this.playerStates.size > 0) {
      // Full per-player tracking (Story-002)
      for (const playerId of evt.playerIds) {
        const ps = this.playerStates.get(playerId);
        if (ps && ps.status !== 'SPECTATOR') {
          ps.status = 'SPECTATOR';
        }
      }
      this.aliveCount = this.countAlive();
    } else {
      // Legacy alive-count-only mode (Story-001 compat — no playerIds provided)
      this.aliveCount = Math.max(0, this.aliveCount - evt.playerIds.length);
    }

    this.eventBus.emit('ALIVE_COUNT_CHANGED', {
      aliveCount: this.aliveCount,
      timestamp: this.clock.now(),
    });

    if (this.aliveCount === 0) {
      this.triggerGameOver();
    }
  }

  /**
   * Handle SPECTATOR_CHEER event.
   *
   * Accepts a cheer from a SPECTATOR player if the gate period cooldown has elapsed.
   * Emits SPECTATOR_CHEERED on acceptance; silently ignores otherwise.
   *
   * Guards:
   * - Only process in ROUND_ACTIVE state (AC-SUR-07)
   * - Player must be known and in SPECTATOR status
   * - Time since lastCheerTime must be >= gatePeriod (AC-SUR-03/04)
   *
   * @param evt SPECTATOR_CHEER event
   */
  onSpectatorCheer(evt: GameEvents['SPECTATOR_CHEER']): void {
    if (this.phase !== 'ROUND_ACTIVE') return;

    const ps = this.playerStates.get(evt.playerId);
    if (!ps || ps.status !== 'SPECTATOR') return;

    const now = this.clock.simulatedTime;
    if (now - ps.lastCheerTime < this.gatePeriod) return;

    ps.lastCheerTime = now;
    this.eventBus.emit('SPECTATOR_CHEERED', {
      playerId: evt.playerId,
      timestamp: this.clock.now(),
    });
  }

  /**
   * Handle GRID_STALLED event.
   *
   * A stalled grid means no progress is possible — force GAME_OVER immediately.
   * Emits GAME_OVER (via triggerGameOver) then ROUND_END.
   *
   * Guard: Only process in ROUND_ACTIVE state.
   *
   * TR-roundmanager-008 (EC-RM-5b)
   *
   * @param evt GRID_STALLED event
   */
  onGridStalled(evt: GameEvents['GRID_STALLED']): void {
    if (this.phase !== 'ROUND_ACTIVE') return;
    this.triggerGameOver();
    this.eventBus.emit('ROUND_END', {
      roundNumber: this.roundNumber,
      timestamp: this.clock.now(),
    });
  }

  /**
   * Called when round timer (ROUND_TIME_LIMIT) expires.
   * Transitions to GAME_OVER if still in ROUND_ACTIVE.
   *
   * Guard: Only trigger if in ROUND_ACTIVE (EC-RM-6 prevention).
   */
  private onRoundTimerExpired(): void {
    if (this.phase !== 'ROUND_ACTIVE') return;
    this.triggerGameOver();
  }

  /**
   * Trigger game over state.
   * Emits GAME_OVER and transitions to GAME_OVER state.
   *
   * Guard: Only transition if in ROUND_ACTIVE.
   * - Prevents duplicate GAME_OVER emissions (EC-RM-6)
   */
  private triggerGameOver(): void {
    if (this.phase !== 'ROUND_ACTIVE') return;

    // Cancel any pending round timer
    if (this.roundTimerFn) {
      this.clock.cancelSchedule(this.roundTimerFn);
      this.roundTimerFn = null;
    }

    // Transition to GAME_OVER
    this.phase = 'GAME_OVER';

    this.eventBus.emit('GAME_OVER', {
      finalRound: this.roundNumber,
      rankings: [],
      timestamp: this.clock.now(),
    });
  }

  /**
   * Called when clear display timer expires (ROUND_CLEAR_DISPLAY_DURATION).
   * Emits ROUND_END then immediately starts next round.
   *
   * AC-RM-06, Multi-round flow
   */
  private onClearDisplayExpired(): void {
    this.clearDisplayTimerFn = null;

    this.eventBus.emit('ROUND_END', {
      roundNumber: this.roundNumber,
      timestamp: this.clock.now(),
    });

    // Auto-advance to next round (Story-002)
    this.startRound(this.roundNumber + 1);
  }

  /**
   * Mark all players as ALIVE for the next round.
   *
   * Resets status, pathIndex, and lastCheerTime for every tracked player.
   * Also resets aliveCount to totalPlayers when player state map is in use.
   *
   * EC-RM-7: pathIndex always reset to 0, no position fallback.
   * AC-RM-05, AC-SUR-05/06
   */
  markAllAliveForNextRound(): void {
    for (const ps of this.playerStates.values()) {
      ps.status = 'ALIVE';
      ps.pathIndex = 0;         // EC-RM-7: fixed index 0, no fallback
      ps.lastCheerTime = -Infinity;
    }
    if (this.playerStates.size > 0) {
      this.aliveCount = this.totalPlayers;
    }
  }

  /**
   * Get array of currently ALIVE player IDs.
   * Returns empty array when no playerIds were provided (legacy mode).
   */
  private getAlivePlayerIds(): PlayerId[] {
    const result: PlayerId[] = [];
    for (const ps of this.playerStates.values()) {
      if (ps.status === 'ALIVE') result.push(ps.playerId);
    }
    return result;
  }

  /**
   * Count players with ALIVE status.
   * Used internally to recompute aliveCount after kills.
   */
  private countAlive(): number {
    let count = 0;
    for (const ps of this.playerStates.values()) {
      if (ps.status === 'ALIVE') count++;
    }
    return count;
  }

  // ════════════════════════════════════════════════════════════════════════
  // Test Helpers (package-visible)
  // ════════════════════════════════════════════════════════════════════════

  /** Get current phase (for unit tests). */
  getPhase(): RoundPhase {
    return this.phase;
  }

  /** Get current Goal Cell (for unit tests). */
  getGoalCell(): CellCoord | null {
    return this.goalCell;
  }

  /** Get current round number (for unit tests). */
  getRoundNumber(): number {
    return this.roundNumber;
  }

  /** Get current alive count (for unit tests). */
  getAliveCount(): number {
    return this.aliveCount;
  }

  /** Get player status map (for integration tests). */
  getPlayerStates(): Map<PlayerId, PlayerState> {
    return this.playerStates;
  }
}

// Export helper for test mocking
export { placeGoalCell };
