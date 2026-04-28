import { CellCoord, CellState, PlayerId, EscalationContext } from '../types/Domain';
import type { ExplodePattern } from '../patterns/PatternTypes';

export interface GameEvents {
  CELL_STATE_CHANGED:  { cell: CellCoord; state: CellState; timestamp: number };
  CELL_EXPLODED:       { cell: CellCoord; timestamp: number };
  PLAYER_KILLED:       { playerIds: PlayerId[]; cellId: CellCoord; cause: 'EXPLOSION' | 'DANGER_ZONE'; timestamp: number };
  GRID_STALLED:        { roundNumber: number; timestamp: number };
  PATTERN_REJECTED:    { patternId: string | null; reason: string; timestamp: number };
  PATTERN_READY:       { pattern: ExplodePattern; timestamp: number };
  PLAYER_MOVED:        { playerId: PlayerId; from: CellCoord; to: CellCoord; timestamp: number };
  PLAYER_ARRIVED:      { playerId: PlayerId; cell: CellCoord; timestamp: number };
  ROUND_STARTED:       { roundNumber: number; ctx: EscalationContext; seed?: number; timestamp: number };
  ROUND_CLEAR:         { roundNumber: number; survivors: PlayerId[]; timestamp: number };
  ROUND_END:           { roundNumber: number; timestamp: number };
  GAME_OVER:           { finalRound: number; rankings: PlayerId[]; timestamp: number };
  ALIVE_COUNT_CHANGED: { aliveCount: number; timestamp: number };
  GOAL_PLACED:         { cell: CellCoord; timestamp: number };
  ESCALATION_COMPUTED: { ctx: EscalationContext; timestamp: number };
  AUDIO_EVENT:         { key: 'EXPLOSION' | 'GATE_SAFE' | 'ROUND_CLEAR' | 'GAME_OVER'; cellId?: CellCoord };
  TAP_DETECTED:        { pos: { x: number; y: number }; timestamp: number };
  /** Player requests a spectator cheer while watching as SPECTATOR (Story-002). */
  SPECTATOR_CHEER:     { playerId: PlayerId; timestamp: number };
  /** Cheer accepted and broadcast after rate-limit check passes (Story-002). */
  SPECTATOR_CHEERED:   { playerId: PlayerId; timestamp: number };
  /** Matchmaking succeeded — server assigned localPlayerId and the full session roster. */
  MATCHMAKING_READY:   { sessionId: string; playerIds: PlayerId[]; localPlayerId: PlayerId; serverTime: number; timestamp: number };
  /** Matchmaking failed — connect error, AUTH rejection, invariant violation, or disconnect during lobby. */
  MATCHMAKING_FAILED:  { reason: string; timestamp: number };
  /** Local player's WebSocket connection dropped during an active match (post-MATCH_READY). */
  LOCAL_PLAYER_DISCONNECTED: { timestamp: number };
  /** Player paused the game. Cocos integration suspends FrameClock.tick on this. */
  GAME_PAUSED:         { timestamp: number };
  /** Player resumed the game. Cocos integration restarts FrameClock.tick on this. */
  GAME_RESUMED:        { timestamp: number };
  /**
   * Player changed a settings value. Listeners react to volume changes (already
   * applied imperatively to channels) or reduced-motion flag (UI / VFX systems
   * subscribe to update their motion behaviour).
   */
  SETTINGS_CHANGED:    { reducedMotion: boolean; volumes: { BGM: number; SFX: number; UIFeedback: number }; timestamp: number };
  /** Player tapped Settings from the PauseOverlay — the navigation layer (Sprint 6+) handles routing to SettingsScreen. */
  SETTINGS_REQUESTED:  { timestamp: number };
  /** Player confirmed the Restart-from-Pause action — sessionFlow.reset() has already been called. */
  PAUSE_RESTART_CONFIRMED: { timestamp: number };
}
