/**
 * gate_period_compute_test.ts
 * Unit tests for RoundEscalation story-001: GATE_PERIOD Formula + EscalationContext
 *
 * Coverage:
 *  AC-RE-01: R1 gatePeriod=2.0, tier=1
 *  AC-RE-02: R13 at GATE_PERIOD_FLOOR (1.4s)
 *  AC-RE-03: R20 still at floor (max clamped)
 *  AC-RE-04: SAFE_WIN(R) = gatePeriod - T_EX >= SAFE_WIN_MIN for all R
 *  AC-RE-05: R1-3 tier always 1 (T1=100%)
 *  AC-RE-06: R15+ tier=3 selected ~80% over 1000 simulations
 *  AC-RE-09: computeContext returns stalledFallback=false (normal round)
 *  AC-RE-10: roundNumber=1 returns gatePeriod=2.0, tier=1 (session reset parity)
 *  AC-RE-11: tierWeights.t1 + t2 + t3 === 100 for all round ranges
 *  AC-RE-12: same seed + same roundNumber → same tier (deterministic)
 */

import { describe, test, expect, beforeEach } from '@jest/globals';
import {
  RoundEscalation,
  GATE_PERIOD_BASE,
  GATE_PERIOD_FLOOR,
  GATE_PERIOD_STEP,
  T_EX,
  SAFE_WIN_MIN,
} from '../../../src/features/round/RoundEscalation';
import type { IFrameClock } from '../../../src/core/time/IFrameClock';
import type { IEventBus } from '../../../src/core/events/IEventBus';
import type { GameEvents } from '../../../src/core/events/GameEvents';

// ─── Mocks ───────────────────────────────────────────────────────────────────

class MockFrameClock implements IFrameClock {
  readonly simulatedTime = 0;
  now(): number { return 0; }
  dt(): number { return 0; }
  tick(_dt: number): void {}
  schedule(_fn: () => void, _delaySecs: number): void {}
  cancelSchedule(_fn: () => void): void {}
}

class MockEventBus implements IEventBus {
  emit<K extends keyof GameEvents>(_key: K, _payload: GameEvents[K]): void {}
  on<K extends keyof GameEvents>(_key: K, _handler: (e: GameEvents[K]) => void): void {}
  off<K extends keyof GameEvents>(_key: K, _handler: (e: GameEvents[K]) => void): void {}
  flush(): void {}
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeEscalation(): RoundEscalation {
  return new RoundEscalation(new MockEventBus(), new MockFrameClock());
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('RoundEscalation — GATE_PERIOD Formula + EscalationContext', () => {

  let escalation: RoundEscalation;

  beforeEach(() => {
    escalation = makeEscalation();
  });

  // =========================================================================
  // AC-RE-01: R1 baseline
  // =========================================================================

  describe('AC-RE-01: R1 baseline', () => {
    test('test_computeGatePeriod_round1_returns_base', () => {
      expect(escalation.computeGatePeriod(1)).toBe(2.0);
    });

    test('test_selectTier_round1_always_tier1_regardless_of_seed', () => {
      for (const seed of [0, 1, 42, 99, 100, 999]) {
        expect(escalation.selectTier(1, seed)).toBe(1);
      }
    });

    test('test_computeContext_round1_seed42_returns_correct_context', () => {
      const ctx = escalation.computeContext(1, 42);
      expect(ctx.roundNumber).toBe(1);
      expect(ctx.gatePeriod).toBe(2.0);
      expect(ctx.tier).toBe(1);
      expect(ctx.stalledFallback).toBe(false);
    });
  });

  // =========================================================================
  // AC-RE-02: R13 hits GATE_PERIOD_FLOOR
  // =========================================================================

  describe('AC-RE-02: R13 at GATE_PERIOD_FLOOR', () => {
    test('test_computeGatePeriod_round13_equals_floor', () => {
      // 2.0 - 12×0.05 = 1.4 = FLOOR
      expect(escalation.computeGatePeriod(13)).toBeCloseTo(1.4, 10);
    });

    test('test_computeGatePeriod_round12_above_floor', () => {
      // 2.0 - 11×0.05 = 1.45 > FLOOR
      expect(escalation.computeGatePeriod(12)).toBeCloseTo(1.45, 10);
    });
  });

  // =========================================================================
  // AC-RE-03: R20 still at floor (clamped)
  // =========================================================================

  describe('AC-RE-03: R20 clamped at floor', () => {
    test('test_computeGatePeriod_round20_clamped_at_floor', () => {
      // max(1.4, 2.0 - 19×0.05) = max(1.4, 1.05) = 1.4
      expect(escalation.computeGatePeriod(20)).toBe(GATE_PERIOD_FLOOR);
    });

    test('test_computeGatePeriod_round50_still_at_floor', () => {
      expect(escalation.computeGatePeriod(50)).toBe(GATE_PERIOD_FLOOR);
    });
  });

  // =========================================================================
  // AC-RE-04: SAFE_WIN >= SAFE_WIN_MIN for all R
  // =========================================================================

  describe('AC-RE-04: SAFE_WIN invariant for all rounds', () => {
    test('test_safewin_invariant_holds_for_rounds_1_to_50', () => {
      for (let r = 1; r <= 50; r++) {
        const gp      = escalation.computeGatePeriod(r);
        const safeWin = gp - T_EX;
        expect(safeWin).toBeGreaterThanOrEqual(SAFE_WIN_MIN);
      }
    });

    test('test_safewin_at_floor_round_equals_105s', () => {
      const gp = escalation.computeGatePeriod(13);
      expect(gp - T_EX).toBeCloseTo(1.05, 5);
    });

    test('test_safewin_at_round1_equals_165s', () => {
      const gp = escalation.computeGatePeriod(1);
      expect(gp - T_EX).toBeCloseTo(1.65, 5);
    });
  });

  // =========================================================================
  // AC-RE-05: R1-3 tier always 1
  // =========================================================================

  describe('AC-RE-05: R1-3 tier always 1 (T1=100%)', () => {
    test('test_selectTier_rounds_1_to_3_always_tier1', () => {
      for (const round of [1, 2, 3]) {
        for (const seed of [0, 49, 99, 100]) {
          expect(escalation.selectTier(round, seed)).toBe(1);
        }
      }
    });
  });

  // =========================================================================
  // AC-RE-06: R15+ tier=3 selected ~80% over 1000 simulations
  // =========================================================================

  describe('AC-RE-06: R15+ tier=3 distribution 75-85%', () => {
    test('test_selectTier_round15_tier3_frequency_in_75_85_percent', () => {
      let tier3Count = 0;
      for (let seed = 0; seed < 1000; seed++) {
        if (escalation.selectTier(15, seed) === 3) tier3Count++;
      }
      const ratio = tier3Count / 1000;
      // Weights: T1=0, T2=20, T3=80 → expect exactly 80% (seeds 20-99 → tier=3)
      expect(ratio).toBeGreaterThanOrEqual(0.75);
      expect(ratio).toBeLessThanOrEqual(0.85);
    });

    test('test_selectTier_round20_tier3_distribution_same_as_r15', () => {
      let tier3Count = 0;
      for (let seed = 0; seed < 1000; seed++) {
        if (escalation.selectTier(20, seed) === 3) tier3Count++;
      }
      const ratio = tier3Count / 1000;
      expect(ratio).toBeGreaterThanOrEqual(0.75);
      expect(ratio).toBeLessThanOrEqual(0.85);
    });
  });

  // =========================================================================
  // AC-RE-09: computeContext returns stalledFallback=false
  // =========================================================================

  describe('AC-RE-09: ESCALATION_COMPUTED flags', () => {
    test('test_computeContext_stalledFallback_false_on_normal_round', () => {
      const ctx = escalation.computeContext(5, 42);
      expect(ctx.stalledFallback).toBe(false);
    });
  });

  // =========================================================================
  // AC-RE-10: roundNumber=1 returns R1 defaults (session reset parity)
  // =========================================================================

  describe('AC-RE-10: Round 1 always returns initial defaults', () => {
    test('test_computeContext_round1_after_higher_rounds', () => {
      // Simulate a session that has progressed
      escalation.computeContext(15, 0);
      escalation.computeContext(20, 0);

      // New session: round 1 should return base values
      const ctx = escalation.computeContext(1, 0);
      expect(ctx.gatePeriod).toBe(GATE_PERIOD_BASE);
      expect(ctx.tier).toBe(1);
    });
  });

  // =========================================================================
  // AC-RE-11: tierWeights sum = 100 for all round ranges
  // =========================================================================

  describe('AC-RE-11: tierWeights.t1+t2+t3 === 100 for all round ranges', () => {
    test('test_tierweights_sum_to_100_for_representative_rounds', () => {
      for (const round of [1, 2, 3, 4, 6, 7, 10, 11, 14, 15, 20, 50]) {
        const w = escalation.getTierWeights(round);
        expect(w.t1 + w.t2 + w.t3).toBe(100);
      }
    });

    test('test_tierweights_boundary_round4_t1_70_t2_30_t3_0', () => {
      const w = escalation.getTierWeights(4);
      expect(w).toEqual({ t1: 70, t2: 30, t3: 0 });
    });

    test('test_tierweights_boundary_round11_t1_0_t2_60_t3_40', () => {
      const w = escalation.getTierWeights(11);
      expect(w).toEqual({ t1: 0, t2: 60, t3: 40 });
    });

    test('test_tierweights_round15plus_t1_0_t2_20_t3_80', () => {
      const w = escalation.getTierWeights(15);
      expect(w).toEqual({ t1: 0, t2: 20, t3: 80 });
    });
  });

  // =========================================================================
  // AC-RE-12: deterministic tier selection
  // =========================================================================

  describe('AC-RE-12: Deterministic tier selection', () => {
    test('test_selectTier_same_seed_same_round_always_same_result', () => {
      const first  = escalation.selectTier(8, 142);
      const second = escalation.selectTier(8, 142);
      expect(first).toBe(second);
    });

    test('test_selectTier_round8_seed142_returns_tier2', () => {
      // R=8 weights: T1=30, T2=70, T3=0
      // roll = 142 % 100 = 42
      // 42 >= 30 → T2 → tier=2
      expect(escalation.selectTier(8, 142)).toBe(2);
    });

    test('test_selectTier_round8_seed0_returns_tier1', () => {
      // roll = 0 % 100 = 0; 0 < 30 → T1 → tier=1
      expect(escalation.selectTier(8, 0)).toBe(1);
    });

    test('test_selectTier_round8_seed30_returns_tier2', () => {
      // roll = 30; 30 >= 30, 30 < 100 → T2 → tier=2
      expect(escalation.selectTier(8, 30)).toBe(2);
    });

    test('test_selectTier_different_seeds_different_rounds_matches_formula', () => {
      // R=15 seed=20: roll=20, weights T1=0 T2=20 T3=80 → 20 >= 0+20 → tier=3
      expect(escalation.selectTier(15, 20)).toBe(3);
      // R=15 seed=19: roll=19, 19 < 0+20 → tier=2
      expect(escalation.selectTier(15, 19)).toBe(2);
    });
  });

  // =========================================================================
  // Formula constants
  // =========================================================================

  describe('Constants sanity', () => {
    test('test_gate_period_floor_minus_tex_exceeds_safe_win_min', () => {
      // GATE_PERIOD_FLOOR - T_EX >= SAFE_WIN_MIN
      expect(GATE_PERIOD_FLOOR - T_EX).toBeGreaterThanOrEqual(SAFE_WIN_MIN);
    });

    test('test_floor_step_base_produce_correct_floor_round', () => {
      // R_floor = floor((BASE - FLOOR) / STEP) + 1 = floor(0.6/0.05) + 1 = 13
      const rFloor = Math.floor((GATE_PERIOD_BASE - GATE_PERIOD_FLOOR) / GATE_PERIOD_STEP) + 1;
      expect(rFloor).toBe(13);
    });
  });
});
