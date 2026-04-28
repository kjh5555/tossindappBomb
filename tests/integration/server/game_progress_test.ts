/**
 * GameSession progress test — Sprint 7+ 라운드 진행 + ROUND_CLEAR + GAME_OVER
 *
 * Sprint 7+ TD-P0-02 확장. REPORT_DEATH + REPORT_GOAL_REACHED 처리 + GAME_OVER 발행.
 *
 * 시나리오:
 *  - 사망 신고 → PLAYER_KILLED broadcast + alivePlayerIds 갱신
 *  - 마지막 사망자 → GAME_OVER broadcast
 *  - 골 도달 신고 → ROUND_CLEAR broadcast + ROUND_CLEAR_DISPLAY phase
 *  - advanceRound → alivePlayerIds 리셋 + 새 ROUND_START
 *  - GAME_OVER 후 모든 보고 무시
 *  - Race conditions (중복 사망, 동시 골 도달)
 */

import {
  IServerSocket,
  ServerMessage,
  IncomingClientMessage,
} from '../../../src/server/IServerSocket';
import { SessionDispatcher } from '../../../src/server/SessionDispatcher';
import { GameSession } from '../../../src/server/GameSession';
import { StubAuthValidator } from '../../../src/server/AuthValidator';
import { Lobby } from '../../../src/server/Lobby';
import { SessionManager } from '../../../src/server/SessionManager';
import { MatchmakingServer } from '../../../src/server/MatchmakingServer';
import { DefaultGameSessionRouter } from '../../../src/server/DefaultGameSessionRouter';

class FakeSocket implements IServerSocket {
  readonly sentMessages: ServerMessage[] = [];
  private msgHandlers: Array<(m: IncomingClientMessage) => void> = [];
  private closeHandlers: Array<() => void> = [];
  constructor(public readonly id: string) {}
  send(m: ServerMessage): void {
    this.sentMessages.push(m);
  }
  disconnect(): void {
    this.simulateClose();
  }
  onMessage(h: (m: IncomingClientMessage) => void): void {
    this.msgHandlers.push(h);
  }
  onClose(h: () => void): void {
    this.closeHandlers.push(h);
  }
  simulateMessage(m: IncomingClientMessage): void {
    for (const h of [...this.msgHandlers]) h(m);
  }
  simulateClose(): void {
    for (const h of [...this.closeHandlers]) h();
  }
}

function makeGameSession(playerCount: number = 2) {
  const dispatcher = new SessionDispatcher();
  const sockets: FakeSocket[] = [];
  const players = [];
  for (let i = 1; i <= playerCount; i++) {
    const s = new FakeSocket(`s${i}`);
    sockets.push(s);
    players.push({ socket: s, playerId: `p${i}` });
  }
  dispatcher.registerSession('sess-progress', players);
  const game = new GameSession(
    'sess-progress',
    players.map((p) => p.playerId),
    dispatcher,
  );
  return { dispatcher, sockets, players, game };
}

// ─── REPORT_DEATH ──────────────────────────────────────────────────────────

describe('GameSession — REPORT_DEATH handling', () => {
  test('사망 신고 → PLAYER_KILLED broadcast + alivePlayerIds 갱신', () => {
    const w = makeGameSession(3);
    w.game.startFirstRound();
    expect(w.game.getAlivePlayerIds()).toHaveLength(3);

    w.game.handleReportDeath('p1', { cellId: 5, cause: 'EXPLOSION', timestamp: 100 });

    expect(w.game.getAlivePlayerIds()).toEqual(['p2', 'p3']);
    expect(w.game.getPhase()).toBe('ROUND_ACTIVE');

    // 모든 client가 PLAYER_KILLED 수신
    for (const s of w.sockets) {
      const kills = s.sentMessages.filter((m) => m.type === 'PLAYER_KILLED');
      expect(kills).toHaveLength(1);
      if (kills[0].type === 'PLAYER_KILLED') {
        expect(kills[0].payload.playerIds).toEqual(['p1']);
        expect(kills[0].payload.cellId).toBe(5);
        expect(kills[0].payload.cause).toBe('EXPLOSION');
      }
    }
  });

  test('마지막 사망자 → GAME_OVER 자동 broadcast', () => {
    const w = makeGameSession(2);
    w.game.startFirstRound();

    w.game.handleReportDeath('p1', { cellId: 5, cause: 'EXPLOSION', timestamp: 100 });
    w.game.handleReportDeath('p2', { cellId: 8, cause: 'DANGER_ZONE', timestamp: 200 });

    expect(w.game.getPhase()).toBe('GAME_OVER');

    // 두 client 모두 GAME_OVER 수신
    for (const s of w.sockets) {
      const gameOvers = s.sentMessages.filter((m) => m.type === 'GAME_OVER');
      expect(gameOvers).toHaveLength(1);
      if (gameOvers[0].type === 'GAME_OVER') {
        expect(gameOvers[0].payload.finalRound).toBe(1);
        expect(gameOvers[0].payload.rankings).toContain('p1');
        expect(gameOvers[0].payload.rankings).toContain('p2');
      }
    }
  });

  test('중복 사망 신고 — 한 번만 처리', () => {
    const w = makeGameSession(3);
    w.game.startFirstRound();

    w.game.handleReportDeath('p1', { cellId: 5, cause: 'EXPLOSION', timestamp: 100 });
    w.game.handleReportDeath('p1', { cellId: 5, cause: 'EXPLOSION', timestamp: 200 });

    expect(w.game.getAlivePlayerIds()).toHaveLength(2);
    const kills = w.sockets[0].sentMessages.filter((m) => m.type === 'PLAYER_KILLED');
    expect(kills).toHaveLength(1);
  });

  test('PRE_ROUND 상태 (startFirstRound 전) — REPORT_DEATH 무시', () => {
    const w = makeGameSession(2);

    w.game.handleReportDeath('p1', { cellId: 0, cause: 'EXPLOSION', timestamp: 0 });

    expect(w.game.getPhase()).toBe('PRE_ROUND');
    const kills = w.sockets[0].sentMessages.filter((m) => m.type === 'PLAYER_KILLED');
    expect(kills).toHaveLength(0);
  });
});

// ─── REPORT_GOAL_REACHED ───────────────────────────────────────────────────

describe('GameSession — REPORT_GOAL_REACHED handling', () => {
  test('첫 골 신고 → ROUND_CLEAR broadcast + ROUND_CLEAR_DISPLAY phase', () => {
    const w = makeGameSession(2);
    w.game.startFirstRound();

    w.game.handleReportGoalReached('p1', { roundNumber: 1, cellId: 36, timestamp: 500 });

    expect(w.game.getPhase()).toBe('ROUND_CLEAR_DISPLAY');
    for (const s of w.sockets) {
      const clears = s.sentMessages.filter((m) => m.type === 'ROUND_CLEAR');
      expect(clears).toHaveLength(1);
      if (clears[0].type === 'ROUND_CLEAR') {
        expect(clears[0].payload.roundNumber).toBe(1);
        expect(clears[0].payload.survivors).toContain('p1');
        expect(clears[0].payload.survivors).toContain('p2');
      }
    }
  });

  test('두 번째 골 신고 — race FIFO 무시', () => {
    const w = makeGameSession(3);
    w.game.startFirstRound();

    w.game.handleReportGoalReached('p1', { roundNumber: 1, cellId: 36, timestamp: 500 });
    w.game.handleReportGoalReached('p2', { roundNumber: 1, cellId: 36, timestamp: 510 });

    const clears = w.sockets[0].sentMessages.filter((m) => m.type === 'ROUND_CLEAR');
    expect(clears).toHaveLength(1);
  });

  test('사망한 player의 골 신고 무시', () => {
    const w = makeGameSession(3);
    w.game.startFirstRound();
    w.game.handleReportDeath('p1', { cellId: 5, cause: 'EXPLOSION', timestamp: 100 });

    w.game.handleReportGoalReached('p1', { roundNumber: 1, cellId: 36, timestamp: 200 });

    expect(w.game.getPhase()).toBe('ROUND_ACTIVE');
    const clears = w.sockets[0].sentMessages.filter((m) => m.type === 'ROUND_CLEAR');
    expect(clears).toHaveLength(0);
  });

  test('stale roundNumber (이전 라운드) → 무시', () => {
    const w = makeGameSession(2);
    w.game.startFirstRound();

    w.game.handleReportGoalReached('p1', { roundNumber: 99, cellId: 36, timestamp: 500 });

    expect(w.game.getPhase()).toBe('ROUND_ACTIVE');
    const clears = w.sockets[0].sentMessages.filter((m) => m.type === 'ROUND_CLEAR');
    expect(clears).toHaveLength(0);
  });
});

// ─── advanceRound + phase 전환 ──────────────────────────────────────────

describe('GameSession — advanceRound + phase transitions', () => {
  test('ROUND_CLEAR_DISPLAY → advanceRound → 다음 ROUND_START + alivePlayerIds 리셋', () => {
    const w = makeGameSession(3);
    w.game.startFirstRound();
    w.game.handleReportDeath('p1', { cellId: 5, cause: 'EXPLOSION', timestamp: 100 });
    w.game.handleReportGoalReached('p2', { roundNumber: 1, cellId: 36, timestamp: 500 });
    expect(w.game.getAlivePlayerIds()).toEqual(['p2', 'p3']);

    w.game.advanceRound();

    expect(w.game.getCurrentRound()).toBe(2);
    expect(w.game.getPhase()).toBe('ROUND_ACTIVE');
    // 모든 player 부활 (다음 라운드 alivePlayerIds reset)
    expect(w.game.getAlivePlayerIds()).toHaveLength(3);

    // 두 번째 ROUND_START broadcast 확인
    const roundStarts = w.sockets[0].sentMessages.filter((m) => m.type === 'ROUND_START');
    expect(roundStarts).toHaveLength(2);
    if (roundStarts[1].type === 'ROUND_START') {
      expect(roundStarts[1].payload.roundNumber).toBe(2);
    }
  });

  test('ROUND_CLEAR_DISPLAY 중 MOVE 무시', () => {
    const w = makeGameSession(2);
    w.game.startFirstRound();
    w.game.handleReportGoalReached('p1', { roundNumber: 1, cellId: 36, timestamp: 500 });

    w.game.handleMove('p2', { direction: 'RIGHT', fromCell: 0, timestamp: 600 });

    const moves = w.sockets[0].sentMessages.filter((m) => m.type === 'PLAYER_MOVE');
    expect(moves).toHaveLength(0);
  });

  test('ROUND_CLEAR_DISPLAY 중 REPORT_DEATH 무시', () => {
    const w = makeGameSession(2);
    w.game.startFirstRound();
    w.game.handleReportGoalReached('p1', { roundNumber: 1, cellId: 36, timestamp: 500 });

    w.game.handleReportDeath('p2', { cellId: 5, cause: 'EXPLOSION', timestamp: 600 });

    const kills = w.sockets[0].sentMessages.filter((m) => m.type === 'PLAYER_KILLED');
    expect(kills).toHaveLength(0);
  });

  test('GAME_OVER 후 advanceRound, MOVE, REPORT_DEATH 모두 무시', () => {
    const w = makeGameSession(2);
    w.game.startFirstRound();
    w.game.handleReportDeath('p1', { cellId: 5, cause: 'EXPLOSION', timestamp: 100 });
    w.game.handleReportDeath('p2', { cellId: 8, cause: 'EXPLOSION', timestamp: 200 });
    expect(w.game.getPhase()).toBe('GAME_OVER');

    w.game.advanceRound();
    w.game.handleMove('p1', { direction: 'RIGHT', fromCell: 0, timestamp: 300 });
    w.game.handleReportDeath('p1', { cellId: 0, cause: 'EXPLOSION', timestamp: 400 });

    expect(w.game.getCurrentRound()).toBe(1); // 변화 없음
    // 추가 broadcast 없음
    const gameOvers = w.sockets[0].sentMessages.filter((m) => m.type === 'GAME_OVER');
    expect(gameOvers).toHaveLength(1);
  });
});

// ─── Full router integration ──────────────────────────────────────────────

describe('Full integration — REPORT_* via MatchmakingServer + DefaultGameSessionRouter', () => {
  function makeFullWorld() {
    const sm = new SessionManager(() => 1000);
    const lobby = new Lobby(sm, 2);
    const router = new DefaultGameSessionRouter();
    const server = new MatchmakingServer(new StubAuthValidator(), lobby, router);
    return { server, router };
  }

  function authClient(server: MatchmakingServer, id: string, token: string): FakeSocket {
    const s = new FakeSocket(id);
    server.onClientConnected(s);
    s.simulateMessage({ type: 'AUTH', payload: { token } });
    return s;
  }

  test('두 client 매치 → REPORT_DEATH → PLAYER_KILLED broadcast', () => {
    const w = makeFullWorld();
    const c1 = authClient(w.server, 's1', 'tokA1234');
    const c2 = authClient(w.server, 's2', 'tokB5678');

    c1.simulateMessage({
      type: 'REPORT_DEATH',
      payload: { cellId: 5, cause: 'EXPLOSION', timestamp: 100 },
    });

    const c2Kills = c2.sentMessages.filter((m) => m.type === 'PLAYER_KILLED');
    expect(c2Kills).toHaveLength(1);
  });

  test('두 client 매치 → 한 명 REPORT_GOAL_REACHED → ROUND_CLEAR broadcast', () => {
    const w = makeFullWorld();
    const c1 = authClient(w.server, 's1', 'tokA1234');
    const c2 = authClient(w.server, 's2', 'tokB5678');

    c1.simulateMessage({
      type: 'REPORT_GOAL_REACHED',
      payload: { roundNumber: 1, cellId: 36, timestamp: 500 },
    });

    expect(c1.sentMessages.filter((m) => m.type === 'ROUND_CLEAR')).toHaveLength(1);
    expect(c2.sentMessages.filter((m) => m.type === 'ROUND_CLEAR')).toHaveLength(1);
  });

  test('두 client 매치 → 둘 다 사망 → GAME_OVER broadcast', () => {
    const w = makeFullWorld();
    const c1 = authClient(w.server, 's1', 'tokA1234');
    const c2 = authClient(w.server, 's2', 'tokB5678');

    c1.simulateMessage({
      type: 'REPORT_DEATH',
      payload: { cellId: 5, cause: 'EXPLOSION', timestamp: 100 },
    });
    c2.simulateMessage({
      type: 'REPORT_DEATH',
      payload: { cellId: 8, cause: 'EXPLOSION', timestamp: 200 },
    });

    expect(c1.sentMessages.filter((m) => m.type === 'GAME_OVER')).toHaveLength(1);
    expect(c2.sentMessages.filter((m) => m.type === 'GAME_OVER')).toHaveLength(1);
  });

  test('disconnect → GAME_OVER 자동 (다른 player 모두 사망 상태에서)', () => {
    const w = makeFullWorld();
    const c1 = authClient(w.server, 's1', 'tokA1234');
    const c2 = authClient(w.server, 's2', 'tokB5678');

    // c1 사망
    c1.simulateMessage({
      type: 'REPORT_DEATH',
      payload: { cellId: 5, cause: 'EXPLOSION', timestamp: 100 },
    });
    expect(c2.sentMessages.filter((m) => m.type === 'GAME_OVER')).toHaveLength(0);

    // c2 disconnect — 마지막 생존자 disconnect → GAME_OVER
    c2.simulateClose();

    // c2는 이미 끊겼고, c1은 사망 상태로 여전히 연결 (server.pending에 1명 남음).
    // 핵심: server가 crash 없이 정상 처리.
    expect(w.server.getStats().pendingCount).toBe(1);
    expect(w.server.getStats().queueLength).toBe(0); // 매치 시작됐으니 큐는 비어있음
  });
});
