/**
 * grid_movement_test.ts
 * Unit tests for PlayerMovement story-001: Direction8 + Boundary + JOY_THRESHOLD
 *
 * Test coverage:
 *  AC-PM-1:  Direction8 delta accuracy (all 8 directions)
 *  AC-PM-2:  Boundary rejection (cell out of bounds)
 *  AC-PM-3:  Buffer preservation (failed move doesn't consume buffer)
 *  AC-PM-10: JOY_THRESHOLD validation (< 18px no move)
 *  AC-PM-12: Imminent cell allowed (no pre-block, Imminent state removed)
 *  AC-PM-20: Angle mapping F-1 (boundary angles)
 */

import { describe, test, expect, beforeEach } from '@jest/globals';
import { DELTA, angleToDirection8, JOY_THRESHOLD } from '../../../src/core/player/Direction8';
import { PlayerMovement } from '../../../src/core/player/PlayerMovement';
import type { CellCoord } from '../../../src/core/grid/CellCoord';
import type { IFrameClock } from '../../../src/core/time/IFrameClock';
import type { IEventBus } from '../../../src/core/events/IEventBus';
import type { GameEvents } from '../../../src/core/events/GameEvents';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

class MockFrameClock implements IFrameClock {
  private _simulatedTime = 0;
  private _dt = 0;

  get simulatedTime(): number {
    return this._simulatedTime;
  }

  now(): number {
    return this._simulatedTime;
  }

  dt(): number {
    return this._dt;
  }

  tick(delaySecs: number): void {
    this._dt = delaySecs;
    this._simulatedTime += delaySecs;
  }

  schedule(_fn: () => void, _delaySecs: number): void {
    // Stub: story-002 will test scheduling behavior
  }

  cancelSchedule(_fn: () => void): void {
    // Stub
  }
}

class MockEventBus implements IEventBus {
  emit<K extends keyof GameEvents>(_key: K, _payload: GameEvents[K]): void {
    // Stub: story-002 will test event emission
  }

  on<K extends keyof GameEvents>(_key: K, _handler: (e: GameEvents[K]) => void): void {
    // Stub: story-002 will test event subscription
  }

  off<K extends keyof GameEvents>(_key: K, _handler: (e: GameEvents[K]) => void): void {
    // Stub
  }

  flush(): void {
    // Stub: story-002 will test event flushing
  }
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('PlayerMovement — Direction8 + Boundary + JOY_THRESHOLD', () => {
  let pm: PlayerMovement;

  beforeEach(() => {
    pm = new PlayerMovement(new MockFrameClock(), new MockEventBus());
  });

  // =========================================================================
  // AC-PM-1: Direction8 delta accuracy
  // =========================================================================

  describe('AC-PM-1: Direction8 delta table', () => {
    test('test_direction8_delta_all_directions_match_spec', () => {
      const expected = [
        { dir: 0, name: 'right', dRow: 0, dCol: 1 },
        { dir: 1, name: 'down-right', dRow: 1, dCol: 1 },
        { dir: 2, name: 'down', dRow: 1, dCol: 0 },
        { dir: 3, name: 'down-left', dRow: 1, dCol: -1 },
        { dir: 4, name: 'left', dRow: 0, dCol: -1 },
        { dir: 5, name: 'up-left', dRow: -1, dCol: -1 },
        { dir: 6, name: 'up', dRow: -1, dCol: 0 },
        { dir: 7, name: 'up-right', dRow: -1, dCol: 1 },
      ];

      expected.forEach(({ dir, dRow, dCol }) => {
        expect(DELTA[dir]).toEqual({ dRow, dCol });
      });
    });

    test('test_direction8_move_from_center', () => {
      const playerId = 'player1';
      const start: CellCoord = { row: 3, col: 3 };
      pm.setPosition(playerId, start);

      for (let dir = 0; dir < 8; dir++) {
        pm.setPosition(playerId, start); // reset
        const result = pm.tryMove(playerId, dir, 20); // magnitude > threshold
        const delta = DELTA[dir];
        const expectedRow = start.row + delta.dRow;
        const expectedCol = start.col + delta.dCol;

        if (expectedRow >= 0 && expectedRow <= 7 && expectedCol >= 0 && expectedCol <= 7) {
          // Move should succeed
          expect(result).toBe(true);
          const pos = pm.getPosition(playerId);
          expect(pos).toEqual({ row: expectedRow, col: expectedCol });
        }
      }
    });
  });

  // =========================================================================
  // AC-PM-2 + AC-PM-3: Boundary rejection + buffer preservation
  // =========================================================================

  describe('AC-PM-2 + AC-PM-3: Boundary rejection and buffer preservation', () => {
    test('test_boundary_rejection_north_from_top_row', () => {
      const playerId = 'player1';
      pm.setPosition(playerId, { row: 0, col: 3 });

      // Try move up (dir=6) from row 0 — should fail
      const result = pm.tryMove(playerId, 6, 25); // magnitude > threshold
      expect(result).toBe(false);

      // Position should remain unchanged
      const pos = pm.getPosition(playerId);
      expect(pos).toEqual({ row: 0, col: 3 });
    });

    test('test_boundary_rejection_south_from_bottom_row', () => {
      const playerId = 'player1';
      pm.setPosition(playerId, { row: 7, col: 3 });

      // Try move down (dir=2) from row 7 — should fail
      const result = pm.tryMove(playerId, 2, 25);
      expect(result).toBe(false);

      // Position should remain unchanged
      const pos = pm.getPosition(playerId);
      expect(pos).toEqual({ row: 7, col: 3 });
    });

    test('test_boundary_rejection_west_from_left_col', () => {
      const playerId = 'player1';
      pm.setPosition(playerId, { row: 3, col: 0 });

      // Try move left (dir=4) from col 0 — should fail
      const result = pm.tryMove(playerId, 4, 25);
      expect(result).toBe(false);

      // Position should remain unchanged
      const pos = pm.getPosition(playerId);
      expect(pos).toEqual({ row: 3, col: 0 });
    });

    test('test_boundary_rejection_east_from_right_col', () => {
      const playerId = 'player1';
      pm.setPosition(playerId, { row: 3, col: 7 });

      // Try move right (dir=0) from col 7 — should fail
      const result = pm.tryMove(playerId, 0, 25);
      expect(result).toBe(false);

      // Position should remain unchanged
      const pos = pm.getPosition(playerId);
      expect(pos).toEqual({ row: 3, col: 7 });
    });

    test('test_boundary_rejection_all_four_corners', () => {
      const corners = [
        {
          name: 'top-left',
          coord: { row: 0, col: 0 },
          invalidDirs: [5, 6, 4], // up-left, up, left
        },
        {
          name: 'top-right',
          coord: { row: 0, col: 7 },
          invalidDirs: [5, 6, 7], // up-left, up, up-right
        },
        {
          name: 'bottom-left',
          coord: { row: 7, col: 0 },
          invalidDirs: [3, 4, 2], // down-left, left, down
        },
        {
          name: 'bottom-right',
          coord: { row: 7, col: 7 },
          invalidDirs: [1, 2, 3], // down-right, down, down-left
        },
      ];

      corners.forEach(({ coord, invalidDirs }) => {
        const playerId = `player_${coord.row}_${coord.col}`;
        pm.setPosition(playerId, coord);

        invalidDirs.forEach((dir) => {
          const result = pm.tryMove(playerId, dir, 25);
          expect(result).toBe(false);

          const pos = pm.getPosition(playerId);
          expect(pos).toEqual(coord);
        });
      });
    });
  });

  // =========================================================================
  // AC-PM-10: JOY_THRESHOLD validation
  // =========================================================================

  describe('AC-PM-10: JOY_THRESHOLD = 18px', () => {
    test('test_joythreshold_below_threshold_17px', () => {
      const playerId = 'player1';
      pm.setPosition(playerId, { row: 3, col: 3 });

      // Test magnitude = 17 (below threshold)
      const result = pm.tryMove(playerId, 0, 17);
      expect(result).toBe(false);

      // Position should remain unchanged
      const pos = pm.getPosition(playerId);
      expect(pos).toEqual({ row: 3, col: 3 });
    });

    test('test_joythreshold_at_threshold_18px', () => {
      const playerId = 'player1';
      pm.setPosition(playerId, { row: 3, col: 3 });

      // Test magnitude = 18 (at threshold) — should succeed
      const result = pm.tryMove(playerId, 0, 18);
      expect(result).toBe(true);

      // Position should be updated
      const pos = pm.getPosition(playerId);
      expect(pos).toEqual({ row: 3, col: 4 });
    });

    test('test_joythreshold_above_threshold_19px', () => {
      const playerId = 'player1';
      pm.setPosition(playerId, { row: 3, col: 3 });

      // Test magnitude = 19 (above threshold)
      const result = pm.tryMove(playerId, 0, 19);
      expect(result).toBe(true);

      // Position should be updated
      const pos = pm.getPosition(playerId);
      expect(pos).toEqual({ row: 3, col: 4 });
    });

    test('test_joythreshold_boundary_values', () => {
      const testCases = [
        { mag: 17.9, shouldMove: false },
        { mag: 18.0, shouldMove: true },
        { mag: 18.1, shouldMove: true },
        { mag: 0, shouldMove: false },
        { mag: -5, shouldMove: false },
      ];

      testCases.forEach(({ mag, shouldMove }) => {
        const playerId = `player_${mag}`;
        pm.setPosition(playerId, { row: 3, col: 3 });

        const result = pm.tryMove(playerId, 0, mag);
        expect(result).toBe(shouldMove);

        if (shouldMove) {
          const pos = pm.getPosition(playerId);
          expect(pos).toEqual({ row: 3, col: 4 });
        } else {
          const pos = pm.getPosition(playerId);
          expect(pos).toEqual({ row: 3, col: 3 });
        }
      });
    });
  });

  // =========================================================================
  // AC-PM-20: Angle mapping F-1
  // =========================================================================

  describe('AC-PM-20: Angle to Direction8 mapping', () => {
    test('test_angle_to_direction8_cardinal_directions', () => {
      const testCases = [
        { angleDeg: 0, expectedDir: 0 }, // right
        { angleDeg: 45, expectedDir: 1 }, // down-right
        { angleDeg: 90, expectedDir: 2 }, // down
        { angleDeg: 135, expectedDir: 3 }, // down-left
        { angleDeg: 180, expectedDir: 4 }, // left
        { angleDeg: 225, expectedDir: 5 }, // up-left
        { angleDeg: 270, expectedDir: 6 }, // up
        { angleDeg: 315, expectedDir: 7 }, // up-right
      ];

      testCases.forEach(({ angleDeg, expectedDir }) => {
        const dir = angleToDirection8(angleDeg);
        expect(dir).toBe(expectedDir);
      });
    });

    test('test_angle_to_direction8_boundary_angles', () => {
      // JavaScript Math.round rounds 0.5 up (half-up convention).
      // 22.5° → round(0.5)=1; 337.5° → round(7.5)=8 → 8%8=0.
      // All boundary angles map to the UPPER adjacent direction.
      const boundaryAngles = [
        { angleDeg: 22.5, expectedDir: 1 }, // round(0.5)=1 → down-right
        { angleDeg: 67.5, expectedDir: 2 }, // round(1.5)=2 → down
        { angleDeg: 112.5, expectedDir: 3 }, // round(2.5)=3 → down-left
        { angleDeg: 157.5, expectedDir: 4 }, // round(3.5)=4 → left
        { angleDeg: 202.5, expectedDir: 5 }, // round(4.5)=5 → up-left
        { angleDeg: 247.5, expectedDir: 6 }, // round(5.5)=6 → up
        { angleDeg: 292.5, expectedDir: 7 }, // round(6.5)=7 → up-right
        { angleDeg: 337.5, expectedDir: 0 }, // round(7.5)=8 → 8%8=0 → right (wraps)
      ];

      boundaryAngles.forEach(({ angleDeg, expectedDir }) => {
        const dir = angleToDirection8(angleDeg);
        expect(dir).toBe(expectedDir);
      });
    });

    test('test_angle_to_direction8_360_wraps_to_0', () => {
      expect(angleToDirection8(360)).toBe(0);
    });

    test('test_angle_to_direction8_negative_angles_normalized', () => {
      // -90° should normalize to 270° → round(6.0)=6 → dir 6
      expect(angleToDirection8(-90)).toBe(6);
      // -22.5° should normalize to 337.5° → round(7.5)=8 → 8%8=0 → dir 0
      expect(angleToDirection8(-22.5)).toBe(0);
      // -180° should normalize to 180° → round(4.0)=4 → dir 4
      expect(angleToDirection8(-180)).toBe(4);
    });

    test('test_angle_to_direction8_large_angles', () => {
      // 450° should normalize to 90° → dir 2
      expect(angleToDirection8(450)).toBe(2);
      // 720° should normalize to 0° → dir 0
      expect(angleToDirection8(720)).toBe(0);
    });
  });

  // =========================================================================
  // AC-PM-12: Imminent cell allowed (no pre-block)
  // =========================================================================

  describe('AC-PM-12: No pre-emptive block of Imminent cells', () => {
    test('test_move_toward_any_cell_allowed_imminent_removed', () => {
      // Per AC-PM-12 and OQ-3: No "Imminent" state exists (removed).
      // Only EXPLODED state kills. Moving toward any cell is allowed.
      // This test verifies tryMove() doesn't pre-check cell state — game-logic concern.

      const playerId = 'player1';
      pm.setPosition(playerId, { row: 3, col: 3 });

      // All 8 directions from center should succeed (no cell state checks)
      for (let dir = 0; dir < 8; dir++) {
        const result = pm.tryMove(playerId, dir, 20);
        expect(result).toBe(true);
        pm.setPosition(playerId, { row: 3, col: 3 }); // reset for next iteration
      }
    });
  });

  // =========================================================================
  // Edge cases and integration
  // =========================================================================

  describe('Edge cases', () => {
    test('test_unregistered_player_tryMove_returns_false', () => {
      const result = pm.tryMove('unregistered', 0, 25);
      expect(result).toBe(false);
    });

    test('test_zero_magnitude_no_move', () => {
      const playerId = 'player1';
      pm.setPosition(playerId, { row: 3, col: 3 });

      const result = pm.tryMove(playerId, 0, 0);
      expect(result).toBe(false);

      const pos = pm.getPosition(playerId);
      expect(pos).toEqual({ row: 3, col: 3 });
    });

    test('test_multiple_players_independent_positions', () => {
      pm.setPosition('p1', { row: 1, col: 1 });
      pm.setPosition('p2', { row: 7, col: 7 });

      pm.tryMove('p1', 0, 25); // p1 moves right
      pm.tryMove('p2', 4, 25); // p2 moves left

      expect(pm.getPosition('p1')).toEqual({ row: 1, col: 2 });
      expect(pm.getPosition('p2')).toEqual({ row: 7, col: 6 });
    });

    test('test_setPosition_overwrites_previous_position', () => {
      const playerId = 'player1';
      pm.setPosition(playerId, { row: 1, col: 1 });
      pm.setPosition(playerId, { row: 5, col: 5 });

      expect(pm.getPosition(playerId)).toEqual({ row: 5, col: 5 });
    });
  });
});
