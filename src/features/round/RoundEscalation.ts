import type { IEventBus } from '../../core/events/IEventBus';
import type { IFrameClock } from '../../core/time/IFrameClock';
import type { EscalationContext } from '../../core/types/Domain';

// ─── Constants (GDD F-RE-1, ADR-0006) ────────────────────────────────────────

/** Round 1 base gate cycle length (seconds). Fixed. */
export const GATE_PERIOD_BASE  = 2.0;

/** Minimum gate cycle length (seconds). Must be >= 1.2 to preserve SAFE_WIN_MIN. */
export const GATE_PERIOD_FLOOR = 1.4;

/** Per-round reduction in gate cycle length (seconds). Tuning knob: 0.03–0.08. */
export const GATE_PERIOD_STEP  = 0.05;

/** Explosion duration (seconds). Independent of GATE_PERIOD. Fixed. */
export const T_EX = 0.35;

/** Minimum safe window = GATE_PERIOD - T_EX. Must always be >= 0.45s. */
export const SAFE_WIN_MIN = 0.45;

// ─── Tier weight table (GDD RE-2) ────────────────────────────────────────────

type TierWeights = { t1: number; t2: number; t3: number };

/** Returns the Tier weight table for the given round. Weights always sum to 100. */
function tierWeightsForRound(roundNumber: number): TierWeights {
  if (roundNumber <= 3)  return { t1: 100, t2: 0,  t3: 0  };
  if (roundNumber <= 6)  return { t1: 70,  t2: 30, t3: 0  };
  if (roundNumber <= 10) return { t1: 30,  t2: 70, t3: 0  };
  if (roundNumber <= 14) return { t1: 0,   t2: 60, t3: 40 };
  return                        { t1: 0,   t2: 20, t3: 80 };
}

// ─── RoundEscalation ─────────────────────────────────────────────────────────

/**
 * Difficulty curve system for round escalation.
 *
 * Computes EscalationContext on demand via computeContext() — called by
 * RoundManager.startRound() before emitting ROUND_STARTED (ADR-0006 step 1–2).
 *
 * Subscribes to GRID_STALLED to emit ESCALATION_COMPUTED(stalledFallback=true)
 * for the 3-party chain (ADR-0009). setGatePeriod is never called from this handler.
 */
export class RoundEscalation {
  /** Last emitted tier — used by GRID_STALLED handler for F-RE-3 demotion. */
  private lastTier: 1 | 2 | 3 = 1;

  /** gatePeriod from the most recent computeContext() call. */
  private currentGatePeriod: number = GATE_PERIOD_BASE;

  constructor(
    private readonly eventBus: IEventBus,
    private readonly clock: IFrameClock,
  ) {
    this.eventBus.on('GRID_STALLED', this.onGridStalled.bind(this));
  }

  // ─── Public API (called by RoundManager.startRound) ────────────────────────

  /**
   * Computes EscalationContext for the given round.
   * Called synchronously before ROUND_STARTED is emitted (ADR-0006 atomic sequence).
   * Stores lastTier and currentGatePeriod for GRID_STALLED fallback use.
   */
  computeContext(roundNumber: number, seed: number): EscalationContext {
    const gatePeriod  = this.computeGatePeriod(roundNumber);
    const tierWeights = this.getTierWeights(roundNumber);
    const tier        = this.selectTier(roundNumber, seed);

    this.lastTier          = tier;
    this.currentGatePeriod = gatePeriod;

    return { roundNumber, gatePeriod, tier, tierWeights, stalledFallback: false };
  }

  /**
   * F-RE-1: GATE_PERIOD(R) = max(FLOOR, BASE − (R−1) × STEP)
   * Output range: [GATE_PERIOD_FLOOR, GATE_PERIOD_BASE].
   */
  computeGatePeriod(roundNumber: number): number {
    return Math.max(
      GATE_PERIOD_FLOOR,
      GATE_PERIOD_BASE - (roundNumber - 1) * GATE_PERIOD_STEP,
    );
  }

  /** Returns the Tier weight table for the given round (GDD RE-2). */
  getTierWeights(roundNumber: number): TierWeights {
    return tierWeightsForRound(roundNumber);
  }

  /**
   * F-RE-2: tier_roll = seed mod 100 → deterministic tier from weight table.
   * Same seed + same roundNumber always returns the same tier.
   */
  selectTier(roundNumber: number, seed: number): 1 | 2 | 3 {
    const w    = tierWeightsForRound(roundNumber);
    const roll = seed % 100;
    if (roll < w.t1)          return 1;
    if (roll < w.t1 + w.t2)   return 2;
    return 3;
  }

  // ─── GRID_STALLED handler (story-002) ──────────────────────────────────────

  private onGridStalled(evt: { roundNumber: number; timestamp: number }): void {
    const { roundNumber } = evt;

    // F-RE-3: fallbackTier = max(1, lastTier − 1). No setGatePeriod call (ADR-0009).
    const fallbackTier = Math.max(1, this.lastTier - 1) as 1 | 2 | 3;
    this.lastTier = fallbackTier;

    const ctx: EscalationContext = {
      roundNumber,
      gatePeriod:      this.currentGatePeriod,
      tier:            fallbackTier,
      tierWeights:     this.getTierWeights(roundNumber),
      stalledFallback: true,
    };

    this.eventBus.emit('ESCALATION_COMPUTED', { ctx, timestamp: this.clock.now() });
  }
}
