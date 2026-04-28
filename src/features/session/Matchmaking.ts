/**
 * Matchmaking.ts
 * Multiplayer session entry point. Connects to the server via WebSocket,
 * sends AUTH using the Toss user token, and on MATCH_READY initialises the
 * SessionFlow + RoundManager with the assigned roster.
 *
 * Implements:
 *   production/epics/matchmaking/story-001-auth.md
 *   production/epics/matchmaking/story-002-match-ready.md
 *   production/epics/matchmaking/story-003-degenerate-disconnect.md
 *
 * Governed by:
 *   ADR-0014 (Matchmaking — single FIFO queue, MIN=2, MAX=6, OQ-5 degenerate match allowed)
 *   ADR-0010 (Server Authority — AUTH/MATCH_READY message format)
 *   ADR-0004 (TossBridge — getUserToken)
 *   ADR-0001 (EventBus — emit MATCHMAKING_READY/FAILED, LOCAL_PLAYER_DISCONNECTED)
 *
 * State machine:
 *   IDLE → CONNECTING → AUTHENTICATING → WAITING → MATCH
 *                                            ↘ FAILED  (any disconnect or invariant violation)
 *   reset() returns to IDLE.
 */

import type { IWebSocketClient } from '../../core/net/IWebSocketClient';
import type { ServerMessages } from '../../core/net/WebSocketProtocol';
import type { ITossBridge } from '../../platform/ITossBridge';
import type { IEventBus } from '../../core/events/IEventBus';
import type { PlayerId } from '../../core/types/Domain';
import type { SessionFlow } from './SessionFlow';

export type MatchmakingState =
  | 'IDLE'
  | 'CONNECTING'
  | 'AUTHENTICATING'
  | 'WAITING'
  | 'MATCH'
  | 'FAILED';

/** Per ADR-0014 — `MIN_MATCH_SIZE` is server-configurable; the client trusts the server but validates the bounds. */
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;

/**
 * Context passed to the RoundManager initialisation callback when MATCH_READY is processed.
 * `totalPlayers` is `playerIds.length` and is fed to RoundManager so PlayerStates is sized correctly.
 */
export interface MatchInitContext {
  totalPlayers: number;
  playerIds: PlayerId[];
  localPlayerId: PlayerId;
  sessionId: string;
  serverTime: number;
}

/**
 * IWebSocketClient with optional onDisconnect — same shape used by WebSocketReconnectManager.
 * The real `WebSocketAdapter` and the `MockWebSocketClient` both expose this.
 */
type DisconnectAwareClient = IWebSocketClient & {
  onDisconnect?(handler: () => void): void;
};

/**
 * Matchmaking subscribes to MATCH_READY and disconnect, drives the WebSocket
 * connect + AUTH flow, and notifies SessionFlow + RoundManager on success.
 *
 * @example
 *   const mm = new Matchmaking(ws, bridge, bus, sessionFlow, ctx => roundManager.init(ctx));
 *   await mm.start('wss://server/grid-reaper');
 *   // ... server emits MATCH_READY ...
 *   // → sessionFlow.startMatch() called, MATCHMAKING_READY emitted, init callback invoked
 */
export class Matchmaking {
  private state: MatchmakingState = 'IDLE';
  private matchInitialized: boolean = false;
  private matchReadyHandler: ((m: ServerMessages['MATCH_READY']) => void) | null = null;
  private disconnectHandler: (() => void) | null = null;

  /**
   * @param ws           - WebSocket client (DI). Optional `onDisconnect` is honoured if present.
   * @param bridge       - Toss bridge for `getUserToken()`. Must have completed `init()` before `start()`.
   * @param bus          - Event bus for MATCHMAKING_READY/FAILED, LOCAL_PLAYER_DISCONNECTED.
   * @param sessionFlow  - Session state machine — `startMatch()` is called on successful MATCH_READY.
   * @param onMatchInit  - Callback invoked with the match context (typically RoundManager init).
   */
  constructor(
    private readonly ws: DisconnectAwareClient,
    private readonly bridge: ITossBridge,
    private readonly bus: IEventBus,
    private readonly sessionFlow: SessionFlow,
    private readonly onMatchInit: (ctx: MatchInitContext) => void,
  ) {
    this.matchReadyHandler = (m) => this.handleMatchReady(m);
    ws.on('MATCH_READY', this.matchReadyHandler);

    if (typeof ws.onDisconnect === 'function') {
      this.disconnectHandler = () => this.handleDisconnect();
      ws.onDisconnect(this.disconnectHandler);
    }
  }

  /** Current Matchmaking state. */
  getState(): MatchmakingState {
    return this.state;
  }

  /**
   * Begin connect + AUTH flow. No-op if already past IDLE (use `reset()` to retry).
   * `bridge.getUserToken()` must succeed (i.e. TossBridge.init() completed).
   */
  async start(serverUrl: string): Promise<void> {
    if (this.state !== 'IDLE') return; // AC-MM-05

    const token = this.bridge.getUserToken(); // throws if !bridge.isReady — AC-MM-03
    this.state = 'CONNECTING';

    try {
      await this.ws.connect(serverUrl, token);
    } catch (err) {
      this.state = 'FAILED';
      this.bus.emit('MATCHMAKING_FAILED', {
        reason: 'connect_failed',
        timestamp: Date.now(),
      });
      return; // AC-MM-04
    }

    this.state = 'AUTHENTICATING';
    this.ws.send({ type: 'AUTH', payload: { token } }); // AC-MM-02
    this.state = 'WAITING';
  }

  /**
   * Reset to IDLE — used after a FAILED state to allow a retry via `start()`.
   * Does not disconnect the WebSocket; caller may choose to disconnect first.
   */
  reset(): void {
    this.state = 'IDLE';
    this.matchInitialized = false;
  }

  /**
   * Cleanup all subscriptions and disconnect the WebSocket. Idempotent.
   */
  dispose(): void {
    if (this.matchReadyHandler) {
      this.ws.off('MATCH_READY', this.matchReadyHandler);
      this.matchReadyHandler = null;
    }
    // Note: there is no `offDisconnect` in the IWebSocketClient interface.
    // Test fakes (MockWebSocketClient) leak the disconnect handler but do not call it after dispose
    // because the AppDispose contract is "no further events after dispose". This is acceptable
    // because the WebSocket is also disconnected here — the handler will not be invoked.
    this.disconnectHandler = null;

    if (this.ws.isConnected) this.ws.disconnect(); // AC-MM-06
  }

  private handleMatchReady(m: ServerMessages['MATCH_READY']): void {
    if (this.matchInitialized) return; // AC-MR-04 — duplicate MATCH_READY ignored

    if (!this.validateMatchSize(m.playerIds)) {
      // AC-DM-04, AC-DM-05 — emitted by validateMatchSize; do not initialise
      return;
    }

    this.matchInitialized = true;
    this.state = 'MATCH';

    this.onMatchInit({
      totalPlayers: m.playerIds.length,
      playerIds: m.playerIds,
      localPlayerId: m.localPlayerId,
      sessionId: m.sessionId,
      serverTime: m.serverTime,
    }); // AC-MR-02, AC-MR-03

    this.sessionFlow.startMatch(); // AC-MR-01

    this.bus.emit('MATCHMAKING_READY', {
      sessionId: m.sessionId,
      playerIds: m.playerIds,
      localPlayerId: m.localPlayerId,
      serverTime: m.serverTime,
      timestamp: Date.now(),
    }); // AC-MR-05
  }

  private validateMatchSize(playerIds: PlayerId[]): boolean {
    const n = playerIds.length;
    if (n < MIN_PLAYERS || n > MAX_PLAYERS) {
      this.bus.emit('MATCHMAKING_FAILED', {
        reason: `invalid_match_size:${n}`,
        timestamp: Date.now(),
      });
      this.state = 'FAILED';
      return false;
    }
    return true;
  }

  private handleDisconnect(): void {
    if (this.matchInitialized || this.state === 'MATCH') {
      // AC-DM-07 — game-active disconnect; RoundManager handles this separately in Sprint 7+
      this.bus.emit('LOCAL_PLAYER_DISCONNECTED', { timestamp: Date.now() });
      return;
    }
    if (this.state === 'WAITING' || this.state === 'AUTHENTICATING' || this.state === 'CONNECTING') {
      // AC-DM-06 — lobby disconnect
      this.state = 'FAILED';
      this.bus.emit('MATCHMAKING_FAILED', {
        reason: 'disconnected',
        timestamp: Date.now(),
      });
    }
  }
}
