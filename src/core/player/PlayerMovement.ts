/**
 * PlayerMovement.ts
 * Manages logical player positions on the 8×8 grid.
 *
 * Implements: design/gdd/player-movement.md
 * Governed by: docs/architecture/adr-0008-player-movement.md
 *
 * Story-001: tryMove — validates moves, updates logicalCoord (no events).
 * Story-002: executeMove — t=0 logical update, PLAYER_MOVED, PLAYER_ARRIVED
 *            via FrameClock.schedule(0.1s), single-slot input buffer.
 *
 * TouchInput (story-002): onMoveIntent calls executeMove.
 */

import type { IFrameClock } from '../time/IFrameClock';
import type { IEventBus } from '../events/IEventBus';
import { CellCoord, isValidCell } from '../grid/CellCoord';
import type { PlayerId } from '../types/Domain';
import { DELTA, JOY_THRESHOLD, type Direction8 } from './Direction8';
import type { IMovementHandler } from '../input/IMovementHandler';

/**
 * Duration of the visual movement tween in seconds.
 * PLAYER_ARRIVED is scheduled this many seconds after PLAYER_MOVED.
 */
export const MOVE_TWEEN_DURATION = 0.1;

/**
 * Manages logical player positions and movement events on the 8×8 grid.
 *
 * Invariants:
 *  1. logicalCoord only contains players registered via setPosition().
 *  2. executeMove() updates logicalCoord at t=0 before emitting PLAYER_MOVED.
 *  3. inputBuffer holds at most one pending direction per player (single slot).
 *  4. PLAYER_ARRIVED is always emitted MOVE_TWEEN_DURATION seconds after PLAYER_MOVED.
 */
export class PlayerMovement implements IMovementHandler {
  private readonly logicalCoord: Map<PlayerId, CellCoord> = new Map();
  private readonly tweenActive: Map<PlayerId, boolean> = new Map();
  private readonly inputBuffer: Map<PlayerId, Direction8 | null> = new Map();
  private readonly playerState: Map<PlayerId, 'Alive' | 'Dead'> = new Map();

  /**
   * Stores the scheduled PLAYER_ARRIVED callback reference per player.
   * Story-003 uses arrivedHandles to cancel in-flight tweens on PLAYER_KILLED.
   */
  readonly arrivedHandles: Map<PlayerId, (() => void) | null> = new Map();

  /**
   * @param clock    - Frame clock for move scheduling and timestamps.
   * @param eventBus - Event bus for PLAYER_MOVED and PLAYER_ARRIVED.
   */
  constructor(
    private readonly clock: IFrameClock,
    private readonly eventBus: IEventBus,
  ) {}

  // ---------------------------------------------------------------------------
  // Registration
  // ---------------------------------------------------------------------------

  /**
   * Register or reset a player's logical position and tween state.
   * Must be called before any move for a given playerId.
   *
   * @param playerId - Unique player identifier.
   * @param coord    - Starting cell coordinate (must be valid).
   *
   * @example
   *   pm.setPosition('p1', { row: 3, col: 3 });
   */
  setPosition(playerId: PlayerId, coord: CellCoord): void {
    this.logicalCoord.set(playerId, { ...coord });
    this.tweenActive.set(playerId, false);
    this.inputBuffer.set(playerId, null);
    this.arrivedHandles.set(playerId, null);
    this.playerState.set(playerId, 'Alive');
  }

  /**
   * Returns the life state of a player, or undefined if not registered.
   *
   * @param playerId - Unique player identifier.
   */
  getPlayerState(playerId: PlayerId): 'Alive' | 'Dead' | undefined {
    return this.playerState.get(playerId);
  }

  /**
   * Returns the current logical position of a player, or undefined if not registered.
   *
   * @param playerId - Unique player identifier.
   *
   * @example
   *   const pos = pm.getPosition('p1'); // { row: 3, col: 3 }
   */
  getPosition(playerId: PlayerId): CellCoord | undefined {
    const coord = this.logicalCoord.get(playerId);
    return coord ? { ...coord } : undefined;
  }

  // ---------------------------------------------------------------------------
  // Story-001: direct move (no events, used by tests + backward compat)
  // ---------------------------------------------------------------------------

  /**
   * Attempt to move a player one cell in the given direction.
   * Validates direction, magnitude, and boundary. Returns true if applied.
   * Does NOT emit events — use executeMove() for the event-emitting path.
   *
   * @param playerId          - Player to move.
   * @param direction         - Direction8 integer [0, 7].
   * @param joystickMagnitude - Raw joystick displacement in pixels.
   * @returns true if move applied; false if rejected.
   *
   * @example
   *   pm.tryMove('p1', 0, 25); // move right
   */
  tryMove(
    playerId: PlayerId,
    direction: Direction8,
    joystickMagnitude: number,
  ): boolean {
    if (joystickMagnitude < JOY_THRESHOLD) return false;

    const current = this.logicalCoord.get(playerId);
    if (current === undefined) return false;

    const delta = DELTA[direction];
    const target: CellCoord = {
      row: current.row + delta.dRow,
      col: current.col + delta.dCol,
    };

    if (!isValidCell(target)) return false;

    this.logicalCoord.set(playerId, { ...target });
    return true;
  }

  // ---------------------------------------------------------------------------
  // Story-002: IMovementHandler — called by TouchInputAdapter
  // ---------------------------------------------------------------------------

  /**
   * AC-TI-13: Called by TouchInputAdapter when a gesture exceeds JOY_THRESHOLD.
   * Delegates to executeMove() — magnitude is guaranteed ≥ JOY_THRESHOLD upstream.
   *
   * @param playerId  - Player to move.
   * @param direction - Direction8 resolved by TouchInputAdapter.
   * @param _magnitude - Raw displacement (validated upstream; not re-checked here).
   *
   * @example
   *   pm.onMoveIntent('p1', 0, 25);
   */
  onMoveIntent(playerId: PlayerId, direction: Direction8, _magnitude: number): void {
    this.executeMove(playerId, direction);
  }

  // ---------------------------------------------------------------------------
  // Story-002: event-emitting move with input buffering
  // ---------------------------------------------------------------------------

  /**
   * Execute a directional move with full event emission and input buffering.
   *
   * Sequence:
   *  - If tween active → buffer direction (overwrites previous buffer). AC-PM-5/6.
   *  - Else → update logicalCoord at t=0, emit PLAYER_MOVED. AC-PM-4/18.
   *  - Schedule PLAYER_ARRIVED at t+MOVE_TWEEN_DURATION. AC-PM-18b.
   *  - On tween completion → flush buffer via onTweenComplete(). AC-PM-7.
   *
   * @param playerId  - Player to move.
   * @param direction - Direction8 to move in.
   *
   * @example
   *   pm.executeMove('p1', 0); // move right, emitting PLAYER_MOVED + scheduling PLAYER_ARRIVED
   */
  executeMove(playerId: PlayerId, direction: Direction8): void {
    if (this.playerState.get(playerId) === 'Dead') return;

    // AC-PM-5/6: input during active tween → buffer (single slot, overwrite)
    if (this.tweenActive.get(playerId)) {
      this.inputBuffer.set(playerId, direction);
      return;
    }

    const from = this.logicalCoord.get(playerId);
    if (from === undefined) return;

    // Boundary check
    const delta = DELTA[direction];
    const target: CellCoord = {
      row: from.row + delta.dRow,
      col: from.col + delta.dCol,
    };
    if (!isValidCell(target)) return;

    // AC-PM-4: logical coord update at t=0
    this.logicalCoord.set(playerId, { ...target });

    // AC-PM-18: PLAYER_MOVED emitted at t=0
    this.eventBus.emit('PLAYER_MOVED', {
      playerId,
      from: { ...from },
      to: { ...target },
      timestamp: this.clock.now(),
    });

    // Start tween
    this.tweenActive.set(playerId, true);

    // AC-PM-18b: PLAYER_ARRIVED via FrameClock.schedule — NOT synchronous
    const arrivedFn = () => {
      this.eventBus.emit('PLAYER_ARRIVED', {
        playerId,
        cell: { ...target },
        timestamp: this.clock.now(),
      });
      this.onTweenComplete(playerId);
    };
    this.arrivedHandles.set(playerId, arrivedFn);
    this.clock.schedule(arrivedFn, MOVE_TWEEN_DURATION);
  }

  /**
   * Called when a player's tween completes (from the PLAYER_ARRIVED callback).
   * Flushes the input buffer if non-empty. AC-PM-7 / AC-PM-14.
   *
   * @param playerId - Player whose tween finished.
   */
  onTweenComplete(playerId: PlayerId): void {
    this.tweenActive.set(playerId, false);
    this.arrivedHandles.set(playerId, null);

    const buffered = this.inputBuffer.get(playerId) ?? null;
    this.inputBuffer.set(playerId, null);

    if (buffered !== null) {
      // AC-PM-14: revalidates direction against new position — out-of-bounds drops silently
      this.executeMove(playerId, buffered);
    }
  }

  // ---------------------------------------------------------------------------
  // Story-003: death handling and round-end snap
  // ---------------------------------------------------------------------------

  /**
   * Handle PLAYER_KILLED: mark player Dead, clear buffer, cancel pending PLAYER_ARRIVED.
   * AC-PM-8: subsequent moves ignored. AC-PM-9: buffer cleared.
   *
   * @param playerIds - Array of player IDs to kill.
   */
  onPlayerKilled(playerIds: PlayerId[]): void {
    for (const id of playerIds) {
      this.playerState.set(id, 'Dead');
      this.inputBuffer.set(id, null);
      const handle = this.arrivedHandles.get(id);
      if (handle) {
        this.clock.cancelSchedule(handle);
        this.arrivedHandles.set(id, null);
      }
      this.tweenActive.set(id, false);
    }
  }

  /**
   * Handle ROUND_CLEAR / GAME_OVER: cancel all pending PLAYER_ARRIVED schedules.
   * AC-PM-17: visual tween should snap to logical coord; no spurious Goal Cell detection post-round.
   * Note: visual snap is the render layer's responsibility — this cancels the schedule only.
   */
  onRoundEnd(): void {
    for (const [id, active] of this.tweenActive) {
      if (active) {
        const handle = this.arrivedHandles.get(id);
        if (handle) {
          this.clock.cancelSchedule(handle);
          this.arrivedHandles.set(id, null);
        }
        this.tweenActive.set(id, false);
      }
    }
  }
}
