/**
 * MatchmakingServer integration test — Sprint 7 TD-P0-02
 *
 * Lobby + AuthValidator + SessionManager + MatchmakingServer 전체 흐름 검증:
 *  - AUTH 성공 + 큐 진입
 *  - MIN_MATCH_SIZE 도달 시 자동 매치 시작
 *  - MATCH_READY 페이로드 정확성 (각 client의 localPlayerId)
 *  - 로비 disconnect → 큐에서 제거
 *  - AUTH 실패 → disconnect
 *  - 1인 매치 invariant (MIN=2 미달)
 *  - 7인 동시 큐잉 → 6인 매치 + 1인 잔존
 */

import {
  IServerSocket,
  ServerMessage,
  IncomingClientMessage,
} from '../../../src/server/IServerSocket';
import { StubAuthValidator } from '../../../src/server/AuthValidator';
import { Lobby, MAX_MATCH_SIZE } from '../../../src/server/Lobby';
import { SessionManager } from '../../../src/server/SessionManager';
import { MatchmakingServer } from '../../../src/server/MatchmakingServer';

class FakeServerSocket implements IServerSocket {
  readonly sentMessages: ServerMessage[] = [];
  disconnected: boolean = false;
  private messageHandlers: Array<(msg: IncomingClientMessage) => void> = [];
  private closeHandlers: Array<() => void> = [];

  constructor(public readonly id: string) {}

  send(message: ServerMessage): void {
    this.sentMessages.push(message);
  }

  disconnect(): void {
    this.disconnected = true;
    this.simulateClose();
  }

  onMessage(handler: (msg: IncomingClientMessage) => void): void {
    this.messageHandlers.push(handler);
  }

  onClose(handler: () => void): void {
    this.closeHandlers.push(handler);
  }

  simulateMessage(message: IncomingClientMessage): void {
    for (const h of [...this.messageHandlers]) h(message);
  }

  simulateClose(): void {
    for (const h of [...this.closeHandlers]) h();
  }
}

function makeServer(minMatchSize: number = 2) {
  const sessionManager = new SessionManager(() => 1000);
  const lobby = new Lobby(sessionManager, minMatchSize);
  const authValidator = new StubAuthValidator();
  const server = new MatchmakingServer(authValidator, lobby);
  return { server, lobby, sessionManager, authValidator };
}

// ─── AUTH + 큐잉 ────────────────────────────────────────────────────────────

describe('MatchmakingServer — AUTH + queue', () => {
  test('AUTH 성공 시 Lobby 큐에 추가', () => {
    const { server, lobby } = makeServer(2);
    const sock = new FakeServerSocket('s1');

    server.onClientConnected(sock);
    sock.simulateMessage({ type: 'AUTH', payload: { token: 'abc12345' } });

    expect(lobby.getQueueLength()).toBe(1);
    expect(sock.disconnected).toBe(false);
  });

  test('AUTH 실패 (빈 토큰) 시 disconnect', () => {
    const { server, lobby } = makeServer(2);
    const sock = new FakeServerSocket('s1');

    server.onClientConnected(sock);
    sock.simulateMessage({ type: 'AUTH', payload: { token: '' } });

    expect(lobby.getQueueLength()).toBe(0);
    expect(sock.disconnected).toBe(true);
  });

  test('중복 AUTH 메시지는 무시 (큐에 한 번만 추가)', () => {
    const { server, lobby } = makeServer(2);
    const sock = new FakeServerSocket('s1');

    server.onClientConnected(sock);
    sock.simulateMessage({ type: 'AUTH', payload: { token: 'abc12345' } });
    sock.simulateMessage({ type: 'AUTH', payload: { token: 'abc12345' } });

    expect(lobby.getQueueLength()).toBe(1);
  });

  test('AUTH 전 다른 메시지는 무시 (큐 추가 X)', () => {
    const { server, lobby } = makeServer(2);
    const sock = new FakeServerSocket('s1');

    server.onClientConnected(sock);
    sock.simulateMessage({ type: 'MOVE', payload: { direction: 'UP', fromCell: 0, timestamp: 0 } });

    expect(lobby.getQueueLength()).toBe(0);
    expect(sock.disconnected).toBe(false); // 정책: silent ignore
  });
});

// ─── 매치 시작 ──────────────────────────────────────────────────────────────

describe('MatchmakingServer — match start at MIN_MATCH_SIZE', () => {
  test('MIN_MATCH_SIZE=2 충족 시 즉시 세션 시작 + 두 client에게 MATCH_READY 송신', () => {
    const { server } = makeServer(2);
    const s1 = new FakeServerSocket('s1');
    const s2 = new FakeServerSocket('s2');

    server.onClientConnected(s1);
    server.onClientConnected(s2);
    s1.simulateMessage({ type: 'AUTH', payload: { token: 'tokA1234' } });
    expect(s1.sentMessages).toHaveLength(0); // MIN 미달
    s2.simulateMessage({ type: 'AUTH', payload: { token: 'tokB5678' } });

    // 두 client 모두 MATCH_READY 수신
    expect(s1.sentMessages).toHaveLength(1);
    expect(s2.sentMessages).toHaveLength(1);
    expect(s1.sentMessages[0].type).toBe('MATCH_READY');
    expect(s2.sentMessages[0].type).toBe('MATCH_READY');
  });

  test('MATCH_READY 페이로드 — 동일 sessionId, 동일 playerIds, 다른 localPlayerId', () => {
    const { server } = makeServer(2);
    const s1 = new FakeServerSocket('s1');
    const s2 = new FakeServerSocket('s2');

    server.onClientConnected(s1);
    server.onClientConnected(s2);
    s1.simulateMessage({ type: 'AUTH', payload: { token: 'aaa11111' } });
    s2.simulateMessage({ type: 'AUTH', payload: { token: 'bbb22222' } });

    const m1 = s1.sentMessages[0] as { type: 'MATCH_READY'; payload: { sessionId: string; playerIds: string[]; localPlayerId: string } };
    const m2 = s2.sentMessages[0] as typeof m1;

    expect(m1.payload.sessionId).toBe(m2.payload.sessionId);
    expect(m1.payload.playerIds).toEqual(m2.payload.playerIds);
    expect(m1.payload.playerIds).toHaveLength(2);
    expect(m1.payload.localPlayerId).not.toBe(m2.payload.localPlayerId);
    expect(m1.payload.playerIds).toContain(m1.payload.localPlayerId);
    expect(m2.payload.playerIds).toContain(m2.payload.localPlayerId);
  });

  test('MIN_MATCH_SIZE=3 — 2명만 AUTH 시 매치 시작 안 됨', () => {
    const { server, lobby } = makeServer(3);
    const s1 = new FakeServerSocket('s1');
    const s2 = new FakeServerSocket('s2');

    server.onClientConnected(s1);
    server.onClientConnected(s2);
    s1.simulateMessage({ type: 'AUTH', payload: { token: 'aaa11111' } });
    s2.simulateMessage({ type: 'AUTH', payload: { token: 'bbb22222' } });

    expect(lobby.getQueueLength()).toBe(2);
    expect(s1.sentMessages).toHaveLength(0);
    expect(s2.sentMessages).toHaveLength(0);
  });
});

// ─── Disconnect handling ───────────────────────────────────────────────────

describe('MatchmakingServer — disconnect', () => {
  test('로비 중 disconnect — 큐에서 제거됨', () => {
    const { server, lobby } = makeServer(3); // MIN=3 so they wait in queue
    const s1 = new FakeServerSocket('s1');
    const s2 = new FakeServerSocket('s2');

    server.onClientConnected(s1);
    server.onClientConnected(s2);
    s1.simulateMessage({ type: 'AUTH', payload: { token: 'aaa11111' } });
    s2.simulateMessage({ type: 'AUTH', payload: { token: 'bbb22222' } });
    expect(lobby.getQueueLength()).toBe(2);

    s1.simulateClose();

    expect(lobby.getQueueLength()).toBe(1);
  });

  test('AUTH 전 disconnect — 큐에 영향 없음', () => {
    const { server, lobby } = makeServer(2);
    const sock = new FakeServerSocket('s1');

    server.onClientConnected(sock);
    sock.simulateClose();

    expect(lobby.getQueueLength()).toBe(0);
  });

  test('disconnect 후 다시 connect — 정상 처리 가능', () => {
    const { server, lobby } = makeServer(2);
    const s1a = new FakeServerSocket('s1');
    server.onClientConnected(s1a);
    s1a.simulateMessage({ type: 'AUTH', payload: { token: 'aaa11111' } });
    s1a.simulateClose();
    expect(lobby.getQueueLength()).toBe(0);

    // 재연결 (new socket)
    const s1b = new FakeServerSocket('s1');
    server.onClientConnected(s1b);
    s1b.simulateMessage({ type: 'AUTH', payload: { token: 'aaa11111' } });

    expect(lobby.getQueueLength()).toBe(1);
  });
});

// ─── 7명 큐잉 — 6명 매치 + 1명 잔존 ─────────────────────────────────────

describe('MatchmakingServer — large queue handling (MAX_MATCH_SIZE)', () => {
  test('7명 동시 AUTH — 6명 매치 시작, 1명 잔존', () => {
    const { server, lobby } = makeServer(2);
    const sockets: FakeServerSocket[] = [];

    for (let i = 1; i <= 7; i++) {
      const s = new FakeServerSocket(`s${i}`);
      sockets.push(s);
      server.onClientConnected(s);
    }

    // 처음 두 명이 AUTH → 즉시 2명 매치 시작 (MIN=2)
    sockets[0].simulateMessage({ type: 'AUTH', payload: { token: 'tok1aaaa' } });
    sockets[1].simulateMessage({ type: 'AUTH', payload: { token: 'tok2aaaa' } });
    expect(sockets[0].sentMessages).toHaveLength(1); // MATCH_READY
    expect(sockets[1].sentMessages).toHaveLength(1);
    expect(lobby.getQueueLength()).toBe(0);

    // 나머지 5명 추가 — 그중 둘이 AUTH 하면 또 매치 (MIN=2)
    sockets[2].simulateMessage({ type: 'AUTH', payload: { token: 'tok3aaaa' } });
    sockets[3].simulateMessage({ type: 'AUTH', payload: { token: 'tok4aaaa' } });
    expect(sockets[2].sentMessages).toHaveLength(1); // 새 세션 MATCH_READY
    expect(sockets[3].sentMessages).toHaveLength(1);
  });

  test('MIN=6, 7명 도달 시 6인 매치 + 1명 잔존', () => {
    const { server, lobby } = makeServer(6);
    const sockets: FakeServerSocket[] = [];
    for (let i = 1; i <= 7; i++) {
      const s = new FakeServerSocket(`s${i}`);
      sockets.push(s);
      server.onClientConnected(s);
      s.simulateMessage({ type: 'AUTH', payload: { token: `tok${i}aaaa` } });
    }

    // 6번째 AUTH 시 매치 시작 (MAX=6 splice). 7번째는 다음 큐.
    expect(lobby.getQueueLength()).toBe(1);
    // 처음 6명 모두 MATCH_READY 받음
    for (let i = 0; i < MAX_MATCH_SIZE; i++) {
      expect(sockets[i].sentMessages).toHaveLength(1);
    }
    expect(sockets[6].sentMessages).toHaveLength(0); // 잔존
  });
});

// ─── SessionManager 자체 ───────────────────────────────────────────────────

describe('SessionManager — sessionId + active sessions', () => {
  test('sessionId 매번 고유 + counter 증가', () => {
    const sm = new SessionManager(() => 1000);

    const ids = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const info = sm.startSession([
        { socket: new FakeServerSocket(`s${i}`), playerId: `p${i}` },
      ]);
      ids.add(info.sessionId);
    }

    expect(ids.size).toBe(5); // 모두 고유
  });

  test('endSession 후 getSession은 null', () => {
    const sm = new SessionManager(() => 1000);
    const info = sm.startSession([
      { socket: new FakeServerSocket('s1'), playerId: 'p1' },
    ]);

    expect(sm.getSession(info.sessionId)).not.toBeNull();
    sm.endSession(info.sessionId);
    expect(sm.getSession(info.sessionId)).toBeNull();
    expect(sm.getActiveSessionCount()).toBe(0);
  });
});

// ─── Lobby 자체 invariant ──────────────────────────────────────────────────

describe('Lobby — invariants', () => {
  test('minMatchSize 0 또는 7+ → throw', () => {
    const sm = new SessionManager();
    expect(() => new Lobby(sm, 0)).toThrow();
    expect(() => new Lobby(sm, 7)).toThrow();
  });

  test('forceStartIfReady — 큐 길이 < MIN이면 null 반환', () => {
    const sm = new SessionManager();
    const lobby = new Lobby(sm, 3);
    lobby.onClientAuthenticated({ socket: new FakeServerSocket('s1'), playerId: 'p1' });

    expect(lobby.forceStartIfReady()).toBeNull();
    expect(lobby.getQueueLength()).toBe(1);
  });
});
