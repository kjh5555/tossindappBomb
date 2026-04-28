# Sprint 2 — 2026-04-23 to 2026-05-06

## Sprint Goal

Core 레이어 3대 시스템(GridExplosion, PatternLibrary, PlayerMovement) 구현 완료 — 게이트 폭발과 플레이어 이동이 로컬에서 결정론적으로 동작하는 Vertical Slice 진입 조건 충족.

## Capacity

| 항목 | 값 |
|------|-----|
| 총 일수 | 10 working days (2026-04-23 ~ 2026-05-06) |
| 버퍼 (20%) | 2 days — 언플랜드 작업 예비 |
| 가용 일수 | **8 days** |
| 개발자 | 1 (solo) |

## Tasks

### Must Have (Critical Path)

| ID | Task | Story File | Est. Days | Dependencies | Acceptance Criteria |
|----|------|------------|-----------|-------------|-------------------|
| S2-M1 | Core 에픽 생성 + 스토리 분해 (`/create-epics layer: core` → `/create-stories` × 3) | — | 0.5 | 16 ADR 완료 ✅ | GridExplosion/PatternLibrary/PlayerMovement EPIC.md + story-*.md 생성 |
| S2-M2 | GridExplosion 코어 구현 — 셀 상태 머신 + 폭발 타이밍 | `production/epics/gridexplosion/story-001-*.md` | 2.5 | S2-M1, ADR-0002/0005/0006 | `nextExplosionTime()` 쿼리 동작; 폭발 패턴 적용 후 셀 IDLE→EX→EXPLODED 전환; 단위 테스트 통과 |
| S2-M3 | PatternLibrary 코어 구현 — JSON 로딩 + Tier 선택 | `production/epics/patternlibrary/story-001-*.md` | 1.5 | S2-M1, ADR-0007 | T1/T2/T3 패턴 로드; DifficultyContext 필터 동작; 중복 패턴 가드 통과; 단위 테스트 통과 |
| S2-M4 | PlayerMovement 코어 구현 — MOVED/ARRIVED 이벤트 분리 + 이동 잠금 | `production/epics/playermovement/story-001-*.md` | 2.0 | S2-M1, ADR-0008/0005 | 터치 입력 → PLAYER_MOVED(t=0) + PLAYER_ARRIVED(t+0.1s); Dead 상태 이동 잠금; 폭발 셀 착지 → PLAYER_KILLED; 단위 테스트 통과 |

**Must Have 소계**: 6.5 days

### Should Have

| ID | Task | Story File | Est. Days | Dependencies | Acceptance Criteria |
|----|------|------------|-----------|-------------|-------------------|
| S2-S1 | RoundEscalation 코어 구현 — GRID_STALLED 체인 + Tier 강등 | `production/epics/roundescalation/story-001-*.md` | 1.5 | S2-M1, S2-M3, ADR-0009/0006 | GRID_STALLED 수신 시 Tier 강등; stalledFallback=true EscalationContext 재발행; max(1, tier-1) 보장; 단위 테스트 통과 |

**Should Have 소계**: 1.5 days

### Nice to Have

| ID | Task | Story File | Est. Days | Dependencies | Acceptance Criteria |
|----|------|------------|-----------|-------------|-------------------|
| S2-N1 | Core 3시스템 통합 테스트 — GridExplosion × PatternLibrary × PlayerMovement | `tests/integration/core/` | 1.0 | S2-M2, S2-M3, S2-M4 | 패턴 로드 → 폭발 적용 → 플레이어 이동 → PLAYER_KILLED 이벤트 흐름 end-to-end 통과 |
| S2-N2 | TouchInput ADR 작성 + 에픽 언블록 | `docs/architecture/adr-XXXX-touch-input.md` | 0.5 | — | `docs/architecture/adr-XXXX-touch-input.md` Accepted; TouchInput EPIC.md 상태 → Ready |

**Nice to Have 소계**: 1.5 days

## Carryover from Previous Sprint

| Task | 사유 | 새 추정 |
|------|------|---------|
| `/create-epics foundation` (Sprint 1 Blocker #3) | Foundation 에픽은 이미 생성됨 — 스킵 가능 | N/A |
| `/sprint-plan Sprint 1` (Sprint 1 Blocker #4) | Sprint 1 플랜 없이 Foundation 구현 완료 — 소급 불필요 | N/A |
| `design/ux/hud.md` HUD vision spec (Sprint 1 Blocker #6) | Presentation layer ADR-0016 완료로 HUD 계약 확정 — 상세 UX spec은 Sprint 3 전 | Sprint 3 |
| `design/ux/accessibility-requirements.md` (Sprint 1 Blocker #7) | Sprint 3 Presentation 구현 전 | Sprint 3 |
| OQ-7 WebSocket 실기기 레이턴시 (Sprint 1 Blocker #8) | Sprint 3 전 필수 — Core 구현과 병행 진행 가능 | Sprint 3 |

## Risks

| ID | 위험 | 확률 | 영향 | 완화 |
|----|------|------|------|------|
| R-01 | GridExplosion BFS 이중 검증(OQ-6) 구현 분리 방식 미결 | MEDIUM | HIGH | 단순 인라인 BFS로 MVP 구현; OQ-6는 별도 리팩토링 스토리로 분리 |
| R-02 | PatternLibrary T3 패턴 5개 실디자인(OQ-3) 미해소 | HIGH | MEDIUM | T3 슬롯 예약 + 더미 패턴으로 시스템 구현; 실제 패턴은 Vertical Slice 단계 |
| R-03 | Cocos `cc.Graphics` + `cc.AudioSource` API 3.8.6 동작 검증 미완 | MEDIUM | MEDIUM | GridExplosion 렌더링 구현 전 엔진 API 스파이크(0.5일) 실행 |
| R-04 | 솔로 개발자 — 8일 가용 일수로 Must Have 6.5일 타이트 | LOW | HIGH | S2-S1(RoundEscalation)을 버퍼로 활용; 지연 시 Sprint 3 이월 |

## Dependencies on External Factors

- **OQ-7 실기기 테스트**: WebSocketClient 통합은 Sprint 3 전 Toss 샌드박스 실기기 접근 필요
- **T3 패턴 디자인(OQ-3)**: 게임 디자이너가 T3 패턴 5개 확정 전까지 PatternLibrary T3 슬롯은 더미

## Definition of Done for Sprint 2

- [ ] S2-M1~M4 모두 완료 (Must Have)
- [ ] 모든 Logic/Integration 스토리에 `tests/unit/` 또는 `tests/integration/` 테스트 파일 존재 및 통과
- [ ] CI (`github/workflows/tests.yml`) green
- [ ] `/story-done` 로 각 스토리 Status: Complete 마킹
- [ ] QA plan 존재 (`production/qa/qa-plan-sprint-2.md`) — Sprint 2 시작 전 `/qa-plan sprint` 실행
- [ ] Smoke check 통과 (`/smoke-check sprint`)
- [ ] QA sign-off: APPROVED or APPROVED WITH CONDITIONS (`/team-qa sprint`)
- [ ] S1/S2 버그 없음
- [ ] `production/sprint-status.yaml` 업데이트

> ⚠️ **No QA Plan**: 현재 `production/qa/qa-plan-sprint-2.md` 없음. 첫 스토리 구현 시작 전 `/qa-plan sprint` 실행 필수. QA 계획 없이 진행 시 Production → Polish 게이트에서 QA sign-off 차단됨.
