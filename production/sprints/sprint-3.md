# Sprint 3 — 2026-05-07 to 2026-05-20

## Sprint Goal

TouchInput 파이프라인 구현 + PatternLibrary/PlayerMovement 핵심 스토리 완료 — 터치 → 방향 계산 → 플레이어 이동 → 폭발 감지 전체 로컬 파이프라인 Vertical Slice 진입 조건 달성.

## Capacity

| 항목 | 값 |
|------|-----|
| 총 일수 | 10 working days (2026-05-07 ~ 2026-05-20) |
| 버퍼 (20%) | 2 days — 언플랜드 작업 예비 |
| 가용 일수 | **8 days** |
| 개발자 | 1 (solo) |
| Sprint 2 실제 처리량 | ~9.5 days (오버델리버리 기록) |

## Tasks

### Must Have (Critical Path)

| ID | Task | Story File | Est. Days | Dependencies | Acceptance Criteria |
|----|------|------------|-----------|-------------|-------------------|
| S3-M1 | TouchInput 스토리 생성 (`/create-stories touchinput`) | `production/epics/touchinput/` | 0.25 | ADR-0017 Accepted ✅ | story-001~003 파일 생성됨; EPIC.md Stories 테이블 업데이트 |
| S3-M2 | TouchInput story-001: IMovementHandler 인터페이스 + TouchInputAdapter 기본 구조 + 탭 감지 | `production/epics/touchinput/story-001-*.md` | 1.5 | S3-M1 | `src/core/input/IMovementHandler.ts` 존재; `TouchInputAdapter.attachToNode()` 이벤트 등록; JOY_THRESHOLD(18px) dead zone 단위 테스트 통과; TAP_DETECTED 발행 단위 테스트 통과 |
| S3-M3 | TouchInput story-002: PlayerMovement.onMoveIntent + MOVE_REPEAT 연속 이동 | `production/epics/touchinput/story-002-*.md` | 1.5 | S3-M2 | `PlayerMovement.onMoveIntent()` 구현; MOVE_REPEAT 0.22s 타이밍 테스트 통과; IMovementHandler 인터페이스 구현 검증 |
| S3-M4 | PatternLibrary story-002: 결정론적 패턴 선택 + N_recent 윈도우 | `production/epics/patternlibrary/story-002-pattern-selection.md` | 1.5 | S2-M3 ✅ | 동일 seed+pool → 동일 결과; Math.random() 없음; N_recent 윈도우 중복 방지; 단위 테스트 통과 |
| S3-M5 | PlayerMovement story-002: 입력 버퍼링 + 논리 좌표 + PLAYER_MOVED/ARRIVED 이벤트 분리 | `production/epics/playermovement/story-002-input-buffer-event-split.md` | 1.5 | S2-M4 ✅ | PLAYER_MOVED t=0 / PLAYER_ARRIVED t=0.1s 분리 검증; 트윈 중 입력 버퍼 단일 큐잉; PLAYER_KILLED → 버퍼 클리어; 단위 테스트 통과 |

**Must Have 소계**: 6.25 days

### Should Have

| ID | Task | Story File | Est. Days | Dependencies | Acceptance Criteria |
|----|------|------------|-----------|-------------|-------------------|
| S3-S1 | PatternLibrary story-003: 런타임 검증 + GRID_STALLED 체인 | `production/epics/patternlibrary/story-003-runtime-validation-stalled.md` | 1.0 | S3-M4 | 3연속 검증 실패 → GRID_STALLED 발행; stalledFallback=true → tier 강등 재선택 ×3; 통합 테스트 통과 |
| S3-S2 | PlayerMovement story-003: 사망 처리 + 엣지 케이스 | `production/epics/playermovement/story-003-death-edge-cases.md` | 1.0 | S3-M5 | PLAYER_KILLED → 대기 중 PLAYER_ARRIVED 취소; EC-1(트윈 중 출발 셀 폭발 → 생존) 단위 테스트 통과; ROUND_CLEAR/GAME_OVER 스냅 처리 |

**Should Have 소계**: 2.0 days

**총계: 8.25 days** — Sprint 2 실제 처리량(9.5일) 대비 여유 있음

### Nice to Have

| ID | Task | Story File | Est. Days | Dependencies | Acceptance Criteria |
|----|------|------------|-----------|-------------|-------------------|
| S3-N1 | PlayerMovement story-004: 서버 권위 MOVE 메시지 + 원격 좌표 업데이트 | `production/epics/playermovement/story-004-server-authority.md` | 1.0 | S3-S2, WebSocketClient 에픽 | MOVE 메시지 서버 전송; PLAYER_MOVE 브로드캐스트 수신 후 원격 좌표 업데이트; 통합 테스트 통과 |
| S3-N2 | RoundManager 에픽 + 스토리 생성 (`/create-epics roundmanager`) | `production/epics/roundmanager/` | 0.5 | ADR 검토 필요 | EPIC.md + story-*.md 파일 생성됨 — Sprint 4 구현 준비 |

**Nice to Have 소계**: 1.5 days

---

## Carryover from Sprint 2

| Task | 사유 | 처리 |
|------|------|------|
| `design/ux/hud.md` HUD vision spec | Presentation layer 진입 전 불필요 | Sprint 4+ |
| `design/ux/accessibility-requirements.md` | Presentation layer 진입 전 불필요 | Sprint 4+ |
| OQ-7 WebSocket 실기기 레이턴시 | S3-N1 PlayerMovement 서버 권위 구현 시 병행 가능 | S3-N1 scope |

---

## Risks

| ID | 위험 | 확률 | 영향 | 완화 |
|----|------|------|------|------|
| R-01 | TouchInput 스토리 없음 — M1 생성 메타 작업 먼저 실행 필요 | LOW | LOW | M1을 스프린트 첫 작업으로 즉시 실행 (0.25일 소요) |
| R-02 | Cocos Creator `node.on(TOUCH_START/MOVE/END)` 3.8.6 실기기 미검증 | MEDIUM | MEDIUM | ADR-0017 Verification Required: 첫 구현 직후 실기기 검증; 헤드리스 단위 테스트로 로직 커버 |
| R-03 | PlayerMovement story-002 FrameClock.schedule() 타이밍 테스트 복잡도 | LOW | MEDIUM | Sprint 2에서 FrameClock simulatedTime 패턴 검증됨 — 동일 패턴 재사용 |
| R-04 | 8.25일 > 8일 가용 일수 — 타이트 | LOW | MEDIUM | Sprint 2 실제 처리량 9.5일 — 오버델리버리 기록. S3-S2를 필요 시 Sprint 4 이월 |

---

## Dependencies on External Factors

- **Cocos Creator 실기기 검증**: TouchInput ADR-0017이 요구하는 `node.on(TOUCH_*)` 동작 검증은 실기기 또는 시뮬레이터 필요
- **WebSocketClient 에픽 미생성**: S3-N1(서버 권위)은 WebSocketClient 에픽과 관련 ADR이 존재해야 통합 테스트 가능

---

## Definition of Done for Sprint 3

- [ ] S3-M1~M5 모두 완료 (Must Have)
- [ ] 모든 Logic/Integration 스토리에 `tests/unit/` 또는 `tests/integration/` 테스트 파일 존재 및 통과
- [ ] `src/core/input/IMovementHandler.ts` + `src/core/input/TouchInputAdapter.ts` 생성 및 단위 테스트 통과
- [ ] `/story-done`으로 각 스토리 Status: Complete 마킹
- [ ] `production/sprint-status.yaml` 업데이트
- [ ] Smoke check 통과 (`/smoke-check sprint`)
- [ ] QA sign-off (`/team-qa sprint`)
- [ ] S1/S2 버그 없음

> ⚠️ **No QA Plan**: `production/qa/qa-plan-sprint-3.md` 없음. S3-M2 구현 시작 전 `/qa-plan sprint` 실행 필수. QA 계획 없이 진행 시 Production → Polish 게이트에서 QA sign-off 차단됨.
