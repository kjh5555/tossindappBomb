/**
 * grid_stalled_chain_test.ts
 * Integration tests for RoundEscalation story-002: GRID_STALLED chain — Tier demotion + stalledFallback
 *
 * ADR-0009 canonical 2-tick chain:
 *   emit(GRID_STALLED) → tick1: flush GS → handler queues ESCALATION_COMPUTED
 *                       → tick2: flush EC → listener fires
 *
 * Coverage:
 *  AC-RE-07: lastTier=3→tier=2, lastTier=2→tier=1 (demotion)
 *  AC-RE-08: lastTier=1→tier=1 (no demotion at floor)
 *  AC-RE-setGatePeriod-forbidden: only ESCALATION_COMPUTED emitted from handler
 *  AC-RE-gatePeriod-unchanged: gatePeriod in stalledFallback context == computeContext value
 *  AC-RE-consecutive-stall: T3→T2→T1 over two stalls
 */

import { describe, test, expect } from '@jest/globals';
import { EventBus } from '../../../src/core/events/EventBus';
import { FrameClock } from '../../../src/core/time/FrameClock';
import { RoundEscalation } from '../../../src/features/round/RoundEscalation';
import type { EscalationContext } from '../../../src/core/types/Domain';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeSuite() {
  const bus   = new EventBus();
  const clock = new FrameClock(bus);
  const escalation = new RoundEscalation(bus, clock);
  return { bus, clock, escalation };
}

/** One tick: unlocks flush, flushes queue, locks flush. */
function tick(clock: FrameClock): void {
  clock.tick(0.016);
}

function captureEscalations(bus: EventBus): EscalationContext[] {
  const results: EscalationContext[] = [];
  bus.on('ESCALATION_COMPUTED', (e) => results.push(e.ctx));
  return results;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('RoundEscalation — GRID_STALLED Chain Integration', () => {

  // =========================================================================
  // AC-RE-07: Tier demotion
  // =========================================================================

  describe('AC-RE-07: GRID_STALLED demotes tier by 1', () => {
    test('test_grid_stalled_lastTier3_emits_tier2_stalledFallback_true', () => {
      const { bus, clock, escalation } = makeSuite();
      // R=15, seed=99: roll=99, T1=0 T2=20 → 99>=20 → tier=3
      escalation.computeContext(15, 99);

      const captured = captureEscalations(bus);
      bus.emit('GRID_STALLED', { roundNumber: 15, timestamp: 0 });
      tick(clock);   // flush GRID_STALLED → handler queues ESCALATION_COMPUTED
      tick(clock);   // flush ESCALATION_COMPUTED → listener fires

      expect(captured).toHaveLength(1);
      expect(captured[0].tier).toBe(2);
      expect(captured[0].stalledFallback).toBe(true);
      expect(captured[0].roundNumber).toBe(15);
    });

    test('test_grid_stalled_lastTier2_emits_tier1_stalledFallback_true', () => {
      const { bus, clock, escalation } = makeSuite();
      // R=8, seed=30: roll=30, T1=30 T2=70 → 30>=30 → tier=2
      escalation.computeContext(8, 30);

      const captured = captureEscalations(bus);
      bus.emit('GRID_STALLED', { roundNumber: 8, timestamp: 0 });
      tick(clock);
      tick(clock);

      expect(captured[0].tier).toBe(1);
      expect(captured[0].stalledFallback).toBe(true);
    });
  });

  // =========================================================================
  // AC-RE-08: Tier 1 floor — no demotion
  // =========================================================================

  describe('AC-RE-08: Tier 1 + GRID_STALLED — no demotion', () => {
    test('test_grid_stalled_lastTier1_emits_tier1_stalledFallback_true', () => {
      const { bus, clock, escalation } = makeSuite();
      // R=1, seed=0 → tier=1 (T1=100%)
      escalation.computeContext(1, 0);

      const captured = captureEscalations(bus);
      bus.emit('GRID_STALLED', { roundNumber: 1, timestamp: 0 });
      tick(clock);
      tick(clock);

      expect(captured[0].tier).toBe(1);
      expect(captured[0].stalledFallback).toBe(true);
    });

    test('test_grid_stalled_max1_0_equals_1_edge_case', () => {
      const { bus, clock, escalation } = makeSuite();
      escalation.computeContext(3, 0);  // tier=1 (R<=3, T1=100%)

      const captured = captureEscalations(bus);
      bus.emit('GRID_STALLED', { roundNumber: 3, timestamp: 0 });
      tick(clock);
      tick(clock);

      // max(1, 1-1) = max(1, 0) = 1
      expect(captured[0].tier).toBe(1);
    });
  });

  // =========================================================================
  // AC-RE-setGatePeriod-forbidden: only ESCALATION_COMPUTED emitted
  // =========================================================================

  describe('AC-RE-setGatePeriod-forbidden: handler emits only ESCALATION_COMPUTED', () => {
    test('test_grid_stalled_handler_emits_only_escalation_computed', () => {
      const { bus, clock, escalation } = makeSuite();
      escalation.computeContext(5, 0);

      const emittedKeys: string[] = [];
      const originalEmit = bus.emit.bind(bus);
      let tracking = false;
      (bus as any).emit = <K extends keyof import('../../../src/core/events/GameEvents').GameEvents>(
        key: K, payload: import('../../../src/core/events/GameEvents').GameEvents[K]
      ) => {
        if (tracking) emittedKeys.push(key as string);
        return originalEmit(key, payload);
      };

      tracking = true;
      bus.emit('GRID_STALLED', { roundNumber: 5, timestamp: 0 });
      tick(clock);
      tick(clock);
      tracking = false;

      // Only GRID_STALLED (trigger) and ESCALATION_COMPUTED (response)
      expect(emittedKeys).toContain('ESCALATION_COMPUTED');
      expect(emittedKeys.filter(k => k !== 'GRID_STALLED' && k !== 'ESCALATION_COMPUTED')).toHaveLength(0);
    });
  });

  // =========================================================================
  // AC-RE-gatePeriod-unchanged: gatePeriod preserved from computeContext
  // =========================================================================

  describe('AC-RE-gatePeriod-unchanged: stalledFallback ctx preserves gatePeriod', () => {
    test('test_grid_stalled_gatePeriod_equals_round_start_value_r5', () => {
      const { bus, clock, escalation } = makeSuite();
      // R=5: 2.0 - 4*0.05 = 1.8
      escalation.computeContext(5, 0);

      const captured = captureEscalations(bus);
      bus.emit('GRID_STALLED', { roundNumber: 5, timestamp: 0 });
      tick(clock);
      tick(clock);

      expect(captured[0].gatePeriod).toBeCloseTo(1.8, 10);
    });

    test('test_grid_stalled_gatePeriod_equals_floor_at_r15', () => {
      const { bus, clock, escalation } = makeSuite();
      // R=15: max(1.4, 2.0-14*0.05) = 1.4
      escalation.computeContext(15, 0);

      const captured = captureEscalations(bus);
      bus.emit('GRID_STALLED', { roundNumber: 15, timestamp: 0 });
      tick(clock);
      tick(clock);

      expect(captured[0].gatePeriod).toBe(1.4);
    });
  });

  // =========================================================================
  // AC-RE-consecutive-stall: T3→T2→T1 over two stalls
  // Both GRID_STALLED events emitted before first tick so they are processed
  // in the same flush, each updating lastTier sequentially.
  // =========================================================================

  describe('AC-RE-consecutive-stall: consecutive GRID_STALLED demotes cumulatively', () => {
    test('test_grid_stalled_twice_demotes_t3_to_t2_then_t1', () => {
      const { bus, clock, escalation } = makeSuite();
      // R=15, seed=99 → tier=3
      escalation.computeContext(15, 99);

      const captured = captureEscalations(bus);

      // Emit both before any tick — both processed in tick1's flush
      bus.emit('GRID_STALLED', { roundNumber: 15, timestamp: 0 });
      bus.emit('GRID_STALLED', { roundNumber: 15, timestamp: 16 });
      tick(clock);   // flush: GS1 (lastTier 3→2, queues EC2) + GS2 (lastTier 2→1, queues EC1)
      tick(clock);   // flush: EC(tier=2) + EC(tier=1) → both listeners fire

      expect(captured).toHaveLength(2);
      expect(captured[0].tier).toBe(2);
      expect(captured[0].stalledFallback).toBe(true);
      expect(captured[1].tier).toBe(1);
      expect(captured[1].stalledFallback).toBe(true);
    });

    test('test_grid_stalled_three_times_stays_at_tier1_after_floor', () => {
      const { bus, clock, escalation } = makeSuite();
      escalation.computeContext(15, 99);  // tier=3

      const captured = captureEscalations(bus);

      bus.emit('GRID_STALLED', { roundNumber: 15, timestamp: 0 });
      bus.emit('GRID_STALLED', { roundNumber: 15, timestamp: 16 });
      bus.emit('GRID_STALLED', { roundNumber: 15, timestamp: 32 });
      tick(clock);   // flush 3 GS events: lastTier 3→2→1→1, queues EC(2)+EC(1)+EC(1)
      tick(clock);   // flush 3 ECs

      expect(captured).toHaveLength(3);
      expect(captured[0].tier).toBe(2);
      expect(captured[1].tier).toBe(1);
      expect(captured[2].tier).toBe(1);  // floor — no further demotion
      expect(captured[2].stalledFallback).toBe(true);
    });

    test('test_grid_stalled_does_not_fire_escalation_before_two_ticks', () => {
      const { bus, clock, escalation } = makeSuite();
      escalation.computeContext(10, 0);

      const captured = captureEscalations(bus);

      bus.emit('GRID_STALLED', { roundNumber: 10, timestamp: 0 });

      // Before any tick — nothing in captured
      expect(captured).toHaveLength(0);

      tick(clock);   // flush GRID_STALLED — handler queues ESCALATION_COMPUTED
      expect(captured).toHaveLength(0);   // EC still in queue

      tick(clock);   // flush ESCALATION_COMPUTED
      expect(captured).toHaveLength(1);
    });
  });
});
