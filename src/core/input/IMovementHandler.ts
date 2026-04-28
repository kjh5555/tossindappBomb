import type { PlayerId } from '../types/Domain';
import type { Direction8 } from '../player/Direction8';

/**
 * IMovementHandler.ts
 * Interface for receiving movement intent from input sources.
 *
 * Implements: design/gdd/touch-input.md § AC-TI-1
 * Story: TouchInput story-001
 *
 * Consumers (e.g. PlayerMovement) implement this interface so that
 * TouchInputAdapter can forward directional input without depending on
 * any concrete movement system.
 *
 * @example
 *   class MyHandler implements IMovementHandler {
 *     onMoveIntent(playerId: PlayerId, direction: Direction8, magnitude: number): void {
 *       // process movement
 *     }
 *   }
 */
export interface IMovementHandler {
  /**
   * Called when a directional input gesture exceeds the dead-zone threshold.
   *
   * @param playerId  - The player whose input produced this intent.
   * @param direction - Direction8 integer [0–7] (clockwise from East).
   * @param magnitude - Displacement magnitude in pixels (≥ JOY_THRESHOLD).
   */
  onMoveIntent(playerId: PlayerId, direction: Direction8, magnitude: number): void;
}
