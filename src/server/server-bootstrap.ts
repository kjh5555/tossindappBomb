/**
 * server-bootstrap.ts
 * Production WebSocket server entry point.
 *
 * Implements: production/sprints/sprint-7 (TD-P0-02)
 * Governed by: ADR-0014 (Matchmaking)
 *
 * 사용:
 *   import { startServer } from './server-bootstrap';
 *   const handle = await startServer({ port: 8080, minMatchSize: 2 });
 *   // ... 종료 시:
 *   await handle.close();
 *
 * 환경 변수:
 *   - PORT (기본 8080)
 *   - MIN_MATCH_SIZE (기본 2)
 *
 * 본 entry는 의존성 주입 가능 — startServer({ ... })로 모든 컴포넌트 교체 가능.
 * 통합 테스트가 여기서 mock auth + 별도 SessionManager 주입.
 */

import { WebSocketServer } from 'ws';
import { WsServerSocket } from './WsServerSocket';
import { StubAuthValidator, IAuthValidator } from './AuthValidator';
import { Lobby } from './Lobby';
import { SessionManager } from './SessionManager';
import { MatchmakingServer, GameSessionRouter } from './MatchmakingServer';
import { DefaultGameSessionRouter } from './DefaultGameSessionRouter';

export interface StartServerOptions {
  port?: number;
  minMatchSize?: number;
  authValidator?: IAuthValidator;
  /** 게임 세션 라우터 — 미지정 시 DefaultGameSessionRouter 사용. test에서 주입 가능. */
  gameRouter?: GameSessionRouter;
}

export interface ServerHandle {
  readonly port: number;
  readonly server: MatchmakingServer;
  close: () => Promise<void>;
}

export async function startServer(opts: StartServerOptions = {}): Promise<ServerHandle> {
  const port = opts.port ?? parseInt(process.env.PORT ?? '8080', 10);
  const minMatchSize = opts.minMatchSize ?? parseInt(process.env.MIN_MATCH_SIZE ?? '2', 10);
  const authValidator = opts.authValidator ?? new StubAuthValidator();

  const sessionManager = new SessionManager();
  const lobby = new Lobby(sessionManager, minMatchSize);
  const gameRouter = opts.gameRouter ?? new DefaultGameSessionRouter();
  const matchmaking = new MatchmakingServer(authValidator, lobby, gameRouter);

  const wss = new WebSocketServer({ port });
  wss.on('connection', (ws) => {
    const sock = new WsServerSocket(ws);
    matchmaking.onClientConnected(sock);
  });

  await new Promise<void>((resolve, reject) => {
    wss.once('listening', resolve);
    wss.once('error', reject);
  });

  return {
    port,
    server: matchmaking,
    async close() {
      await new Promise<void>((resolve) => wss.close(() => resolve()));
    },
  };
}

// CLI 실행 시 — `node dist/server/server-bootstrap.js`
if (require.main === module) {
  startServer().then((handle) => {
    // eslint-disable-next-line no-console
    console.log(`[Server] listening on :${handle.port}`);
  }).catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[Server] failed to start:', err);
    process.exit(1);
  });
}
