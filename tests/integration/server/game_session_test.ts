/**
 * Game session routing integration test
 *
 * Sprint 7+ TD-P0-02 확장 — SessionDispatcher + GameSession + DefaultGameSessionRouter +
 * MatchmakingServer 통합 흐름 검증.
 *
 * 시나리오:
 *  - 매치 시작 시 ROUND_START broadcast (모든 client에게 동일 seed + 초기 위치)
 *  - 한 client의 MOVE → 다른 client에게 PLAYER_MOVE broadcast (발신자 제외)
 *  - 게임 중 disconnect → PLAYER_KILLED broadcast (다른 player에게 알림)
 *  - 동일 sessionId + 라운드 → deterministic seed
 */

import {
  IServerSocket,
  ServerMessage,
  IncomingClientMessage,
} from '../../../src/server/IServerSocket';
import { StubAuthValidator } from '../../../src/server/AuthValidator';
import { Lobby } from '../../../src/server/Lobby';
import { SessionManager } from '../../../src/server/SessionManager';
import { MatchmakingServer } from '../../../src/server/MatchmakingServer';
import { DefaultGameSessionRouter } from '../../../src/server/DefaultGameSessionRouter';
import { SessionDispatcher } from '../../../src/server/SessionDispatcher';
import { GameSession, generateRoundSeed } from '../../../src/server/GameSession';

class FakeSocket implements IServerSocket {
  readonly sentMessages: ServerMessage[] = [];
  disconnected = false;
  private msgHandlers: Array<(msg: IncomingClientMessage) => void> = [];
  private closeHandlers: Array<() => void> = [];

  constructor(public readonly id: string) {}
  send(m: ServerMessage): void {
    this.sentMessages.push(m);
  }
  disconnect(): void {
    this.disconnected = true;
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

function makeWorld(minMatchSize = 2) {
  const sessionManager = new SessionManager(() => 1000);
  const lobby = new Lobby(sessionManager, minMatchSize);
  const router = new DefaultGameSessionRouter();
  const server = new MatchmakingServer(new StubAuthValidator(), lobby, router);
  return { sessionManager, lobby, router, server };
}

function authClient(server: MatchmakingServer, id: string, token: string): FakeSocket {
  const sock = new FakeSocket(id);
  server.onClientConnected(sock);
  sock.simulateMessage({ type: 'AUTH', payload: { token } });
  return sock;
}

// ─── ROUND_START broadcast ─────────────────────────────────────────────────

describe('GameSession integration — ROUND_START broadcast', () => {
  test('매치 시작 시 두 client 모두 ROUND_START 수신 (동일 seed)', () => {
    const { server } = makeWorld(2);
    const s1 = authClient(server, 's1', 'tokA1234');
    const s2 = authClient(server, 's2', 'tokB5678');

    // 마지막 두 메시지가 ROUND_START여야 함 (MATCH_READY 직후)
    const r1 = s1.sentMessages.find((m) => m.type === 'ROUND_START');
    const r2 = s2.sentMessages.find((m) => m.type === 'ROUND_START');

    expect(r1).toBeDefined();
    expect(r2).toBeDefined();
    if (r1?.type === 'ROUND_START' && r2?.type === 'ROUND_START') {
      expect(r1.payload.roundNumber).toBe(1);
      expect(r2.payload.roundNumber).toBe(1);
      expect(r1.payload.seed).toBe(r2.payload.seed); // 동일 seed
      expect(Object.keys(r1.payload.playerPositions)).toHaveLength(2);
    }
  });

  test('각 client는 MATCH_READY 후 ROUND_START — 정확히 두 메시지', () => {
    const { server } = makeWorld(2);
    const s1 = authClient(server, 's1', 'tokA1234');
    const s2 = authClient(server, 's2', 'tokB5678');

    // 첫 번째 메시지 = MATCH_READY, 두 번째 = ROUND_START
    expect(s1.sentMessages).toHaveLength(2);
    expect(s2.sentMessages).toHaveLength(2);
    expect(s1.sentMessages[0].type).toBe('MATCH_READY');
    expect(s1.sentMessages[1].type).toBe('ROUND_START');
  });
});

// ─── MOVE relay ─────────────────────────────────────────────────────────────

describe('GameSession integration — MOVE relay', () => {
  test('한 client MOVE → 다른 client에게 PLAYER_MOVE broadcast (발신자 제외)', () => {
    const { server } = makeWorld(2);
    const s1 = authClient(server, 's1', 'tokA1234');
    const s2 = authClient(server, 's2', 'tokB5678');

    // s1이 MOVE 송신
    s1.simulateMessage({
      type: 'MOVE',
      payload: { direction: 'RIGHT', fromCell: 0, timestamp: 100 },
    });

    // s2는 PLAYER_MOVE 수신, s1은 수신 안 함
    const s2PlayerMoves = s2.sentMessages.filter((m) => m.type === 'PLAYER_MOVE');
    const s1PlayerMoves = s1.sentMessages.filter((m) => m.type === 'PLAYER_MOVE');

    expect(s2PlayerMoves).toHaveLength(1);
    expect(s1PlayerMoves).toHaveLength(0);

    if (s2PlayerMoves[0].type === 'PLAYER_MOVE') {
      expect(s2PlayerMoves[0].payload.from).toBe(0);
      expect(s2PlayerMoves[0].payload.to).toBe(1); // (0,0) RIGHT → (0,1)
      expect(s2PlayerMoves[0].payload.timestamp).toBe(100);
    }
  });

  test('boundary violation MOVE → from === to (제자리)', () => {
    const { server } = makeWorld(2);
    const s1 = authClient(server, 's1', 'tokA1234');
    const s2 = authClient(server, 's2', 'tokB5678');

    // s1 starts at cell 0 = (0,0). UP 시도는 boundary violation
    s1.simulateMessage({
      type: 'MOVE',
      payload: { direction: 'UP', fromCell: 0, timestamp: 200 },
    });

    const moves = s2.sentMessages.filter((m) => m.type === 'PLAYER_MOVE');
    if (moves[0]?.type === 'PLAYER_MOVE') {
      expect(moves[0].payload.from).toBe(0);
      expect(moves[0].payload.to).toBe(0); // 무이동
    }
  });

  test('인증 전 MOVE 송신 — 무시', () => {
    const { server } = makeWorld(2);
    const s1 = new FakeSocket('s1');
    server.onClientConnected(s1);

    // AUTH 없이 MOVE
    s1.simulateMessage({
      type: 'MOVE',
      payload: { direction: 'RIGHT', fromCell: 0, timestamp: 0 },
    });

    expect(s1.sentMessages).toHaveLength(0);
  });

  test('매치 시작 전 MOVE 송신 — 무시 (sessionId 미설정)', () => {
    const { server } = makeWorld(3); // MIN=3 — 두 명만 인증해도 매치 안 시작
    const s1 = authClient(server, 's1', 'tokA1234');
    authClient(server, 's2', 'tokB5678');

    s1.simulateMessage({
      type: 'MOVE',
      payload: { direction: 'RIGHT', fromCell: 0, timestamp: 0 },
    });

    // 매치 시작 안 됐으니 ROUND_START도 없고 PLAYER_MOVE relay도 없음
    expect(s1.sentMessages.filter((m) => m.type === 'PLAYER_MOVE')).toHaveLength(0);
    expect(s1.sentMessages.filter((m) => m.type === 'ROUND_START')).toHaveLength(0);
  });
});

// ─── Disconnect → PLAYER_KILLED broadcast ────────────────────────────────

describe('GameSession integration — disconnect handling', () => {
  test('게임 중 disconnect → 다른 client에게 PLAYER_KILLED broadcast', () => {
    const { server } = makeWorld(2);
    const s1 = authClient(server, 's1', 'tokA1234');
    const s2 = authClient(server, 's2', 'tokB5678');

    // s1 disconnect
    s1.simulateClose();

    // s2가 PLAYER_KILLED 수신
    const kills = s2.sentMessages.filter((m) => m.type === 'PLAYER_KILLED');
    expect(kills).toHaveLength(1);
    if (kills[0]?.type === 'PLAYER_KILLED') {
      expect(kills[0].payload.playerIds).toHaveLength(1);
    }
  });

  test('두 명 모두 disconnect — 첫 disconnect는 broadcast, 두 번째는 빈 broadcast', () => {
    const { server } = makeWorld(2);
    const s1 = authClient(server, 's1', 'tokA1234');
    const s2 = authClient(server, 's2', 'tokB5678');

    s1.simulateClose();
    const s2KillsBefore = s2.sentMessages.filter((m) => m.type === 'PLAYER_KILLED').length;
    s2.simulateClose();

    // s1는 이미 끊겼고 s2도 끊겼으니 추가 KILL 메시지는 의미 없음 — broadcast 자체는 0 client에게 도달
    // s2에 더 이상 메시지 도착 안 함
    expect(s2.sentMessages.filter((m) => m.type === 'PLAYER_KILLED').length).toBe(s2KillsBefore);
  });
});

// ─── Determinism ──────────────────────────────────────────────────────────

describe('GameSession seed determinism', () => {
  test('generateRoundSeed — 동일 sessionId + roundNumber → 동일 seed', () => {
    expect(generateRoundSeed('sess-001', 1)).toBe(generateRoundSeed('sess-001', 1));
    expect(generateRoundSeed('sess-001', 2)).toBe(generateRoundSeed('sess-001', 2));
  });

  test('generateRoundSeed — 다른 sessionId 또는 roundNumber → 다른 seed', () => {
    expect(generateRoundSeed('sess-001', 1)).not.toBe(generateRoundSeed('sess-001', 2));
    expect(generateRoundSeed('sess-001', 1)).not.toBe(generateRoundSeed('sess-002', 1));
  });

  test('GameSession.advanceRound — 라운드 번호 증가 + 새 seed broadcast', () => {
    const dispatcher = new SessionDispatcher();
    const players = [
      { socket: new FakeSocket('s1'), playerId: 'p1' },
      { socket: new FakeSocket('s2'), playerId: 'p2' },
    ];
    dispatcher.registerSession('sess-x', players);

    const game = new GameSession('sess-x', ['p1', 'p2'], dispatcher);
    game.startFirstRound();
    const seed1 = game.getCurrentSeed();
    expect(game.getCurrentRound()).toBe(1);

    game.advanceRound();
    const seed2 = game.getCurrentSeed();
    expect(game.getCurrentRound()).toBe(2);
    expect(seed1).not.toBe(seed2);

    // 두 player 각각 ROUND_START 두 번 받음
    const s1Sock = players[0].socket as FakeSocket;
    const roundStarts = s1Sock.sentMessages.filter((m) => m.type === 'ROUND_START');
    expect(roundStarts).toHaveLength(2);
  });

  test('GameSession invariant — playerIds 0명 또는 7명 이상 → throw', () => {
    const dispatcher = new SessionDispatcher();
    expect(() => new GameSession('s', [], dispatcher)).toThrow();
    expect(
      () =>
        new GameSession(
          's',
          ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'],
          dispatcher,
        ),
    ).toThrow();
  });
});

// ─── SessionDispatcher 자체 ──────────────────────────────────────────────

describe('SessionDispatcher — broadcast variants', () => {
  function makeDispatcherWith(playerIds: string[]) {
    const dispatcher = new SessionDispatcher();
    const sockets = playerIds.map((p) => new FakeSocket(p));
    const clients = playerIds.map((p, i) => ({
      socket: sockets[i],
      playerId: p,
    }));
    dispatcher.registerSession('sess', clients);
    return { dispatcher, sockets, clients };
  }

  test('broadcast — 모든 client에게 송신', () => {
    const { dispatcher, sockets } = makeDispatcherWith(['p1', 'p2', 'p3']);
    const sent = dispatcher.broadcast('sess', {
      type: 'ROUND_CLEAR',
      payload: { roundNumber: 1, survivors: [] },
    });

    expect(sent).toBe(3);
    for (const s of sockets) {
      expect(s.sentMessages).toHaveLength(1);
    }
  });

  test('broadcastExcept — 발신자 제외', () => {
    const { dispatcher, sockets } = makeDispatcherWith(['p1', 'p2', 'p3']);
    dispatcher.broadcastExcept('sess', 'p2', {
      type: 'ROUND_CLEAR',
      payload: { roundNumber: 1, survivors: [] },
    });

    expect(sockets[0].sentMessages).toHaveLength(1);
    expect(sockets[1].sentMessages).toHaveLength(0);
    expect(sockets[2].sentMessages).toHaveLength(1);
  });

  test('sendToPlayer — 단일 target', () => {
    const { dispatcher, sockets } = makeDispatcherWith(['p1', 'p2']);
    const ok = dispatcher.sendToPlayer('sess', 'p2', {
      type: 'GAME_OVER',
      payload: { finalRound: 1, rankings: [] },
    });

    expect(ok).toBe(true);
    expect(sockets[0].sentMessages).toHaveLength(0);
    expect(sockets[1].sentMessages).toHaveLength(1);
  });

  test('sendToPlayer — 미존재 player → false', () => {
    const { dispatcher } = makeDispatcherWith(['p1']);
    const ok = dispatcher.sendToPlayer('sess', 'p99', {
      type: 'GAME_OVER',
      payload: { finalRound: 1, rankings: [] },
    });
    expect(ok).toBe(false);
  });

  test('endSession — 이후 broadcast 0 client', () => {
    const { dispatcher } = makeDispatcherWith(['p1', 'p2']);
    dispatcher.endSession('sess');

    const sent = dispatcher.broadcast('sess', {
      type: 'GAME_OVER',
      payload: { finalRound: 1, rankings: [] },
    });
    expect(sent).toBe(0);
  });
});
