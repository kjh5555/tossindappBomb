# Epic: Matchmaking

> **Layer**: Feature
> **GDD**: `design/gdd/round-manager.md` (MATCH_READY 프로토콜은 ADR-0010/0014에서 추가)
> **Architecture Module**: `src/features/session/Matchmaking.ts` (per `docs/architecture/architecture.md`)
> **Status**: Ready
> **Stories**: story-001, story-002, story-003 (run `/create-stories matchmaking` 또는 본 epic의 sprint-6 분해 참조)

## Overview

Matchmaking은 GRID REAPER의 **세션 초기화 진입점**이다. WebSocketClient 연결 후 `TossBridge.getUserToken()`으로 받은 토큰을 서버에 AUTH 메시지로 전송하고, 서버가 `MATCH_READY`를 발행하면 SessionFlow에 매치 시작을 알리며 RoundManager에 `totalPlayers`(2~6)를 전달한다. 단일 FIFO 큐 구조(ADR-0014) 위에서 운영되며, 6인 미만의 degenerate match도 허용한다.

이 에픽은 **로컬 단독 플레이 → 멀티플레이어**로 전환하는 핵심 다리이며, Sprint 6의 핵심 Must Have이다. 현재 SessionFlow 스텁(story-003)은 `startMatch()`를 직접 호출하지만, 이 epic 완료 후에는 `MATCH_READY` 이벤트가 트리거 한다.

## Governing ADRs

| ADR | Decision Summary | Engine Risk |
|-----|-----------------|-------------|
| ADR-0014: Matchmaking 6인 매치 | 단일 FIFO 큐, MIN_MATCH_SIZE=2 (tunable env), MAX=6, MATCH_READY 페이로드, 로비 disconnect 처리 | LOW |
| ADR-0010: Server Authority | WebSocket 메시지 포맷 (AUTH, MATCH_READY), 클라이언트는 서버 결정에 따름 | LOW |
| ADR-0004: TossBridge | `bridge.getUserToken()`으로 AUTH 토큰 취득 | LOW |
| ADR-0001: EventBus | 매치 상태 변화 이벤트 전파 (MATCH_READY 수신 시 GameEvents에 매핑) | LOW |

## GDD Requirements

| TR-ID | Requirement | ADR Coverage |
|-------|-------------|--------------|
| TR-matchmaking-001 | `MATCH_READY { sessionId, playerIds, localPlayerId, serverTime }` 수신 시 세션 초기화 | ADR-0014 ✅ |
| TR-matchmaking-002 | `AUTH { token, sessionId? }` 송신 — `TossBridge.getUserToken()` 사용 | ADR-0014 + ADR-0004 ✅ |
| TR-matchmaking-003 | Degenerate match (2~5인) 허용 — OQ-5 결정 반영 | ADR-0014 ✅ |

**커버리지**: 3/3 traced ✅. 미해결 요구사항 없음.

## Definition of Done

- 모든 스토리 구현 + `/story-done` 처리
- AUTH 송신 플로우 통합 테스트 통과 (MockWebSocketClient 사용)
- MATCH_READY 수신 → SessionFlow + RoundManager 초기화 통합 테스트 통과
- Degenerate match (2~5인) 통합 테스트 통과
- Disconnect 시나리오 테스트 (로비 / 게임 중 모두)
- Sprint 6 plan의 멀티플레이어 playtest 1세션에서 매치 흐름 검증

## Stories

| # | Story | Type | Status | ADR |
|---|-------|------|--------|-----|
| 001 | [AUTH + WebSocket 연결](story-001-auth.md) | Integration | Ready | ADR-0014 + ADR-0004 |
| 002 | [MATCH_READY 처리 + SessionFlow/RoundManager 초기화](story-002-match-ready.md) | Integration | Ready | ADR-0014 + ADR-0011 |
| 003 | [Degenerate match (2-5인) + Disconnect 처리](story-003-degenerate-disconnect.md) | Integration | Ready | ADR-0014 |

## Sprint Allocation

- **Sprint 6 Must Have**:
  - S6-M1 → 본 EPIC + 스토리 생성
  - S6-M2 → story-001 구현
  - S6-M3 → story-002 구현
  - S6-M4 → story-003 구현
- **Sprint 6 Should Have**: 멀티플레이어 playtest 1세션 (S6-M6)에서 통합 검증

## Next Step

Run `/story-readiness production/epics/matchmaking/story-001-auth.md` to validate readiness, then `/dev-story` to begin implementation.
