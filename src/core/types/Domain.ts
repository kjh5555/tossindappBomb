export type PlayerId = string;
/** Cyclic v4 model: 2-state only. WARNING/DANGER_ZONE/EXPLODING removed per prototype v4 playtest. */
export type CellState = 'IDLE' | 'EXPLODED';
export interface CellCoord { row: number; col: number; }
/** GDD RE-6 — EscalationContext emitted with ESCALATION_COMPUTED */
export interface EscalationContext {
  roundNumber:     number;
  gatePeriod:      number;
  tier:            1 | 2 | 3;
  tierWeights:     { t1: number; t2: number; t3: number };
  stalledFallback: boolean;
}
