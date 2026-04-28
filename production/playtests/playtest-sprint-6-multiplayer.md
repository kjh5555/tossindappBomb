# Playtest: Sprint 6 — Multiplayer Match Flow

> **Status**: Template
> **Sprint**: Sprint 6 (S6-M6)
> **Goal**: 2-3인 매치가 정상 동작하는지 검증 — Matchmaking AUTH → MATCH_READY → 라운드 진행 → 사망/스펙테이터 → GAME_OVER 흐름 일치
> **Protocol source**: `production/sprints/sprint-6.md` § S6-M6
> **선결 조건**:
>   - Sprint 6 Cocos 통합 완료 (TD-P0-01 — Sprint 7 작업 후)
>   - Node.js 서버 동작 (TD-P0-02 — Sprint 7+ 작업 후)
>   - 또는 모의 서버 환경 (`MockWebSocketClient` 기반 시뮬레이션)
>   - 플레이어 2-3명 + 각자 디바이스

---

## Session Metadata

| 항목 | 값 |
|------|-----|
| 세션 일시 | YYYY-MM-DD HH:MM |
| 세션 길이 | __ 분 (최소 1 매치 종료까지) |
| 빌드 버전 | sprint-6 commit `__________` |
| 매치 인원 수 | __ 명 (2~6 허용; 2-3명 권장 for 첫 검증) |
| 환경 | [ ] 로컬 동시 (한 기기 + multiplayer simulation) / [ ] LAN / [ ] 인터넷 / [ ] 모의 서버 (MockWebSocket) |
| 서버 환경 | [ ] Node.js 실서버 / [ ] 모의 서버 / [ ] 로컬 stub |
| 진행자 | __________ |
| 플레이어 1 (host) | __________, 디바이스 __________ |
| 플레이어 2 | __________, 디바이스 __________ |
| 플레이어 3 (선택) | __________, 디바이스 __________ |

---

## Pre-Session Checklist

- [ ] 모든 클라이언트가 동일 빌드 + 동일 server URL 사용
- [ ] 서버가 실행 중이고 WebSocket 연결 수락 (또는 MockWebSocketClient 시뮬레이션 준비)
- [ ] 각 플레이어에게 Toss 토큰 (또는 stub-token) 할당
- [ ] 모든 플레이어가 동시에 Lobby 진입 가능

---

## Pass Criteria

| # | 조건 | PASS / FAIL | 노트 |
|---|------|-------------|------|
| 1 | 모든 플레이어 AUTH 성공 → 큐 진입 | [ ] / [ ] | |
| 2 | MIN_MATCH_SIZE(2) 충족 시 자동 매치 시작 (또는 명시적 trigger) | [ ] / [ ] | |
| 3 | MATCH_READY 페이로드 — 모든 클라이언트가 동일 sessionId + playerIds 수신 | [ ] / [ ] | |
| 4 | 각 클라이언트가 자신의 localPlayerId 정확 식별 | [ ] / [ ] | |
| 5 | RoundManager가 totalPlayers = N으로 초기화 (인원 수 정확) | [ ] / [ ] | |
| 6 | 모든 클라이언트가 동일 라운드 시작 + 동일 패턴 표시 (서버 권위 검증) | [ ] / [ ] | |
| 7 | 한 플레이어 사망 → 다른 플레이어 화면에서 SPECTATOR 처리 표시 | [ ] / [ ] | |
| 8 | 골 셀 도달 → 모든 플레이어 화면에서 ROUND_CLEAR 동시 표시 | [ ] / [ ] | |
| 9 | 전원 사망 → 모든 클라이언트에 GAME_OVER 동시 도달 | [ ] / [ ] | |
| 10 | Disconnect 시나리오 — 한 클라이언트 강제 종료 → LOCAL_PLAYER_DISCONNECTED 또는 ALIVE_COUNT_CHANGED 처리 | [ ] / [ ] | |

**Pass 조건**: 10개 중 8개 이상 PASS.

---

## Match Flow Timeline

| 시간(초) | 이벤트 | 클라이언트 1 | 클라이언트 2 | 클라이언트 3 |
|---------|-------|-----------|-----------|-----------|
| 0 | Lobby 진입 | | | |
| | AUTH 송신 | | | |
| | MATCH_READY 수신 | | | |
| | 라운드 1 시작 | | | |
| | 첫 사망 | | | |
| | 라운드 클리어 | | | |
| | GAME_OVER | | | |

---

## Sync Issues (있다면)

> 클라이언트 간 동기화 어긋남 — 한 클라이언트에서는 X, 다른 클라이언트에서는 Y로 보였을 때.

| 시점 | 클라이언트 1 시각 | 클라이언트 2 시각 | 차이 | 원인 추정 |
|------|---------------|---------------|------|----------|
| | | | | |
| | | | | |

---

## Verbatim Quotes (각 플레이어 ≥ 1)

1. **플레이어 1 (시간 ___초)**: "_______________________"
2. **플레이어 2 (시간 ___초)**: "_______________________"
3. **플레이어 3 (시간 ___초)**: "_______________________"

---

## Spectator Cheer 검증 (선택)

스펙테이터로 전환된 플레이어가 cheer 가능한지:

| 항목 | 결과 |
|------|------|
| 사망한 플레이어 화면에서 spectator UI 표시? | [ ] / [ ] |
| Cheer 입력 → SPECTATOR_CHEER 이벤트 발행? | [ ] / [ ] |
| Rate-limit (`gatePeriod` 2초) 동작? | [ ] / [ ] |
| 다른 플레이어 화면에서 SPECTATOR_CHEERED 시각화? | [ ] / [ ] |

---

## 종합 의견

**서버-클라이언트 동기화**: 어긋남 빈도, 보정 필요?
___________________________________________________________________

**매치 시작 흐름**: 자연스러운가? 대기 시간 인식 가능?
___________________________________________________________________

**Disconnect handling**: 한 명이 끊겨도 게임이 정상 진행?
___________________________________________________________________

**전반 매치 경험**: 솔로 모드 대비 느낌 차이?
___________________________________________________________________

---

## 알려진 한계 (v1)

- ADR-0014 OQ-5: 2-5인 degenerate match는 규칙 변경 없이 진행 — 결과 분포 모니터링 필요
- ADR-0010: 게임 중 disconnect → 재연결 미지원 (해당 플레이어 PLAYER_KILLED 처리)
- 시간 동기화는 `serverTime` 한 번만 수신 — drift 보정 없음 (Sprint 7+)

---

## Verdict

- [ ] **PASS** — 10/10 또는 9/10. 멀티플레이어 정상 동작 확인.
- [ ] **PASS WITH NOTES** — 7-8/10. 핵심 흐름 동작하나 sync issue 있음.
- [ ] **FAIL** — ≤ 6/10. 서버 또는 클라이언트 재검토 필요.

**Sign-off**: __________ (network-programmer + qa-lead)

---

## Action Items

| ID | 발견된 이슈 | 우선순위 | 처리 sprint |
|----|----------|---------|-----------|
| | | | |

---

## 다음 단계

- 결과를 `production/qa/qa-plan-sprint-6-*.md` (생성 시) § Multiplayer 섹션에 반영
- FAIL 항목은 `docs/tech-debt-register.md`에 추가
- Sprint 6 close-out 시 본 문서 검토 → `/team-qa sprint`
