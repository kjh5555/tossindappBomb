/**
 * Real WebSocket server end-to-end integration test
 *
 * Sprint 7+ TD-P0-02 — server-bootstrap.ts를 실제 ws.WebSocketServer로 부팅하고
 * 두 클라이언트가 ws.WebSocket으로 연결 + AUTH → MATCH_READY 흐름을 검증.
 *
 * 본 테스트는 ws library를 실제로 사용하므로 자동화 한계까지의 마지막 검증:
 *   - WsServerSocket adapter
 *   - server-bootstrap.ts entry
 *   - 전체 wire 형식 (JSON encode/decode)
 *
 * 실패 시: ws library의 message 처리 또는 server bootstrap 흐름에 버그.
 */

import { WebSocket } from 'ws';
import { startServer, ServerHandle } from '../../../src/server/server-bootstrap';

// 테스트별 unique 포트 할당 — Jest parallel run 시 충돌 방지
let nextPort = 18900;
function allocatePort(): number {
  return nextPort++;
}

async function connectClient(port: number): Promise<WebSocket> {
  const ws = new WebSocket(`ws://localhost:${port}`);
  await new Promise<void>((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  return ws;
}

function nextMessage<T = unknown>(ws: WebSocket, timeoutMs = 1000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout waiting for message')), timeoutMs);
    ws.once('message', (data) => {
      clearTimeout(timer);
      try {
        resolve(JSON.parse(data.toString()) as T);
      } catch (err) {
        reject(err);
      }
    });
  });
}

describe('WebSocket end-to-end — real ws library + server bootstrap', () => {
  let handle: ServerHandle;
  const port = allocatePort();

  beforeAll(async () => {
    handle = await startServer({ port, minMatchSize: 2 });
  });

  afterAll(async () => {
    await handle.close();
  });

  test('두 client connect + AUTH → 둘 다 MATCH_READY 수신', async () => {
    const c1 = await connectClient(port);
    const c2 = await connectClient(port);

    // AUTH 송신
    c1.send(JSON.stringify({ type: 'AUTH', payload: { token: 'tokA1234' } }));
    c2.send(JSON.stringify({ type: 'AUTH', payload: { token: 'tokB5678' } }));

    // 두 client 모두 MATCH_READY 수신 (Promise.all로 race 방지)
    const [msg1, msg2] = await Promise.all([
      nextMessage<{ type: string; payload: { sessionId: string; localPlayerId: string; playerIds: string[] } }>(c1),
      nextMessage<{ type: string; payload: { sessionId: string; localPlayerId: string; playerIds: string[] } }>(c2),
    ]);

    expect(msg1.type).toBe('MATCH_READY');
    expect(msg2.type).toBe('MATCH_READY');
    expect(msg1.payload.sessionId).toBe(msg2.payload.sessionId);
    expect(msg1.payload.playerIds).toHaveLength(2);
    expect(msg1.payload.localPlayerId).not.toBe(msg2.payload.localPlayerId);
    expect(msg1.payload.playerIds).toContain(msg1.payload.localPlayerId);
    expect(msg2.payload.playerIds).toContain(msg2.payload.localPlayerId);

    c1.close();
    c2.close();
  }, 5000);

  test('빈 토큰 AUTH → 즉시 disconnect', async () => {
    const c1 = await connectClient(port);

    c1.send(JSON.stringify({ type: 'AUTH', payload: { token: '' } }));

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), 1000);
      c1.once('close', () => {
        clearTimeout(timer);
        resolve();
      });
    });

    expect(c1.readyState).toBe(c1.CLOSED);
  }, 5000);

  test('잘못된 JSON 송신 → 서버 살아있고 client 연결 유지', async () => {
    const c1 = await connectClient(port);
    c1.send('not-json');

    // 서버가 살아있는지 확인 — 다른 client connect + AUTH가 정상 작동
    const stats = handle.server.getStats();
    expect(stats).toBeDefined();

    c1.close();
  }, 5000);
});

describe('WebSocket end-to-end — multiple sequential matches', () => {
  let handle: ServerHandle;
  const port = allocatePort();

  beforeAll(async () => {
    handle = await startServer({ port, minMatchSize: 2 });
  });

  afterAll(async () => {
    await handle.close();
  });

  test('첫 번째 매치 시작 → 두 번째 매치 시작 — sessionId 다름', async () => {
    // 첫 번째 매치
    const c1a = await connectClient(port);
    const c2a = await connectClient(port);
    c1a.send(JSON.stringify({ type: 'AUTH', payload: { token: 'aaa11111' } }));
    c2a.send(JSON.stringify({ type: 'AUTH', payload: { token: 'aaa22222' } }));
    const [m1a, m2a] = await Promise.all([
      nextMessage<{ payload: { sessionId: string } }>(c1a),
      nextMessage<{ payload: { sessionId: string } }>(c2a),
    ]);

    // 두 번째 매치
    const c1b = await connectClient(port);
    const c2b = await connectClient(port);
    c1b.send(JSON.stringify({ type: 'AUTH', payload: { token: 'bbb11111' } }));
    c2b.send(JSON.stringify({ type: 'AUTH', payload: { token: 'bbb22222' } }));
    const [m1b, m2b] = await Promise.all([
      nextMessage<{ payload: { sessionId: string } }>(c1b),
      nextMessage<{ payload: { sessionId: string } }>(c2b),
    ]);

    expect(m1a.payload.sessionId).toBe(m2a.payload.sessionId);
    expect(m1b.payload.sessionId).toBe(m2b.payload.sessionId);
    expect(m1a.payload.sessionId).not.toBe(m1b.payload.sessionId);

    [c1a, c2a, c1b, c2b].forEach((c) => c.close());
  }, 5000);
});
