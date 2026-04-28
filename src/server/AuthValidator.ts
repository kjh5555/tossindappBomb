/**
 * AuthValidator.ts
 * Toss user token 검증 stub.
 *
 * Implements: production/sprints/sprint-7 (TD-P0-02)
 * Governed by: ADR-0014 § Server Lobby + ADR-0004 (TossBridge)
 *
 * MVP/소프트런치: 토큰 검증을 stub으로 구현. 비어있지 않은 토큰을 모두 accept.
 * 실제 production: Toss SDK의 token 검증 API 사용 (Sprint 8+ 작업).
 *
 * 본 클래스는 IServerSocket + token → AuthenticatedClient 변환을 담당.
 * 거부 시 ServerMessages에 정의된 에러 type을 send() 후 disconnect()를 호출하지만,
 * 현재 ServerMessages 스키마에 인증 실패 메시지가 없으므로 단순 close만 처리한다.
 */

import type { IServerSocket, AuthenticatedClient } from './IServerSocket';
import type { ClientMessages } from '../core/net/WebSocketProtocol';
import type { PlayerId } from '../core/types/Domain';

export interface IAuthValidator {
  /**
   * Validate AUTH payload. Returns AuthenticatedClient on success, null on failure.
   * 실패 시 caller는 socket.disconnect() 호출 권장.
   */
  validate(socket: IServerSocket, auth: ClientMessages['AUTH']): AuthenticatedClient | null;
}

/**
 * Stub validator — accepts any non-empty token. Token 자체를 PlayerId로 사용.
 * 실제 production: Toss API에 token POST → user_id 반환 → PlayerId 매핑.
 */
export class StubAuthValidator implements IAuthValidator {
  validate(socket: IServerSocket, auth: ClientMessages['AUTH']): AuthenticatedClient | null {
    if (!auth.token || auth.token.length === 0) return null;

    // PlayerId는 token + socket.id 조합 (test-stable, prod에서는 실 user_id 사용)
    const playerId: PlayerId = `player-${socket.id}-${auth.token.slice(0, 8)}`;
    return { socket, playerId };
  }
}
