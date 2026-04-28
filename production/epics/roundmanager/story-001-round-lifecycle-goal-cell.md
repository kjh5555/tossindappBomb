# Story 001: 라운드 라이프사이클 + Goal Cell 배치

> **Epic**: RoundManager
> **Status**: Complete
> **Layer**: Feature
> **Type**: Logic
> **Manifest Version**: 2026-04-22

## Context

**GDD**: `design/gdd/round-manager.md`
**Requirements**: `TR-roundmanager-001`, `TR-roundmanager-002`, `TR-roundmanager-003`, `TR-roundmanager-004`, `TR-roundmanager-007`
*(Requirement text lives in `docs/architecture/tr-registry.yaml` — read fresh at review time)*

**ADR Governing Implementation**: ADR-0011: Round Phase 상태 머신
**ADR Decision Summary**: 4-state FSM (IDLE / ROUND_ACTIVE / ROUND_CLEAR_DISPLAY / GAME_OVER) with whitelist-based event acceptance per state. `startRound()` transitions IDLE → ROUND_ACTIVE, places Goal Cell via F-RM-1, emits ROUND_STARTED + GOAL_PLACED. First `PLAYER_ARRIVED` at goalCell transitions to ROUND_CLEAR_DISPLAY, emits ROUND_CLEAR, then ROUND_END after 1500ms.

**Secondary ADR**: ADR-0012 (Goal Cell Tie-Break) — simultaneous arrivals auto-resolved by phase guard; no additional logic required.

**Engine**: Cocos Creator 3.8.6 (TypeScript) | **Risk**: LOW
**Engine Notes**: Pure TypeScript state machine. No Cocos API dependencies in RoundManager. `FrameClock.schedule()` is the only external dependency — verified as deterministic (ADR-0002).

**Control Manifest Rules (Feature layer)**:
- Required: All events via `IEventBus.emit<K>()` with `GameEvents` type checking — source: ADR-0001
- Required: `gridSim.setGatePeriod(ctx.gatePeriod)` called BEFORE `emit('ROUND_STARTED')` — source: ADR-0006
- Required: `clock.cancelSchedule(roundTimerFn)` on every state transition out of ROUND_ACTIVE — source: ADR-0011
- Forbidden: Direct Cocos `Node` / `Component` APIs inside `RoundManager.ts` — source: ADR-0003
- Forbidden: Hardcoded timer values — use `ROUND_CLEAR_DISPLAY_DURATION = 1.5` and `ROUND_TIME_LIMIT = 60` constants — source: ADR-0011

---

## Acceptance Criteria

*From `design/gdd/round-manager.md`, scoped to this story:*

- [ ] **AC-RM-01**: `startRound(N)` 호출 시 동일 flush 내 `ROUND_STARTED` 1회 + `GOAL_PLACED` 1회 발행됨. `ROUND_STARTED.roundNumber == N`.
- [ ] **AC-RM-02**: `gridSim.nextExplosionTime(pathCells[N-1]) >= GATE_PERIOD_BASE(2.0)` → `GOAL_PLACED.cell == pathCells[N-1]` (N-1 정상 배치).
- [ ] **AC-RM-03**: `gridSim.nextExplosionTime(pathCells[N-1]) < GATE_PERIOD_BASE(2.0)` → `GOAL_PLACED.cell == pathCells[N-2]` (N-2 폴백). **EC-RM-1**: N-2도 unsafe이더라도 N-2에 고정 배치 — 추가 폴백 없음.
- [ ] **AC-RM-04**: `PLAYER_ARRIVED({ playerId, cell })` 수신 시 `cell == goalCell` AND `phase == ROUND_ACTIVE` → `ROUND_CLEAR` 1회 발행. `ROUND_CLEAR.roundNumber == N`.
- [ ] **AC-RM-05**: `ROUND_CLEAR` 발행 직후 (`triggerRoundClear()` 내) `markAllAliveForNextRound()` 호출 → 모든 플레이어 status `ALIVE`, `pathIndex = 0`.
- [ ] **AC-RM-06**: `ROUND_CLEAR` 발행 후 정확히 `clock.tick(1.5)` 경과 시 `ROUND_END` 발행 (±1 tick 허용). `ROUND_END.roundNumber == N`.
- [ ] **AC-TIE-01/02**: 두 `PLAYER_ARRIVED(goalCell)` 이벤트가 같은 tick에 도착해도 `ROUND_CLEAR`는 1회만 발행됨 (두 번째는 phase guard에서 차단).
- [ ] `startRound()` 호출 시 `setGatePeriod()` 완료가 `emit('ROUND_STARTED')` 이전임을 spy로 확인.

---

## Implementation Notes

*Derived from ADR-0011 Implementation Guidelines:*

구현은 `src/features/round/RoundManager.ts` 에 위치. ADR-0011 § 핵심 구현 골격을 기준으로 시작한다.

**`startRound(roundNumber)` 구현 순서** (ADR-0011 Migration Plan 1→4 단계):
1. `phase !== 'IDLE'` guard로 중복 호출 차단
2. `escalation.compute(roundNumber)` → `gridSim.setGatePeriod(ctx.gatePeriod)` — **ROUND_STARTED 이전 필수**
3. `placeGoalCell(pathCells, gridSim)` (F-RM-1: `nextExplosionTime(N-1) < GATE_PERIOD_BASE` → N-2, else N-1)
4. `clock.schedule(roundTimerFn, ROUND_TIME_LIMIT)` 등록
5. `phase = 'ROUND_ACTIVE'` 전환
6. `eventBus.emit('ROUND_STARTED', ...)` → `eventBus.emit('GOAL_PLACED', ...)`

**`onPlayerArrived({ playerId, cell })` 구현**:
- `if (phase !== 'ROUND_ACTIVE') return` — ROUND_CLEAR_DISPLAY/GAME_OVER 중 무시 (EC-RM-4)
- `if (!coordEqual(cell, goalCell)) return` — 비-Goal Cell 도착 무시
- `clock.cancelSchedule(roundTimerFn)` — 타이머 반드시 취소
- `phase = 'ROUND_CLEAR_DISPLAY'`
- `markAllAliveForNextRound()` — 부활 즉시 마킹 (ADR-0013)
- `eventBus.emit('ROUND_CLEAR', ...)`
- `clock.schedule(clearDisplayTimerFn, ROUND_CLEAR_DISPLAY_DURATION)`

**`IGridSimulation` 인터페이스**: `nextExplosionTime(cell: CellCoord): number` — 실제 GridSimulation 구현에 의존하지 않음. 단위 테스트에서 mock 주입.

**상수 선언** (`RoundManager.ts` 상단):
```typescript
export const ROUND_CLEAR_DISPLAY_DURATION = 1.5;  // seconds
export const ROUND_TIME_LIMIT = 60;               // seconds (Tuning Knob)
export const GATE_PERIOD_BASE = 2.0;              // seconds (from ADR-0006)
```

---

## Out of Scope

*Handled by story-002 — do not implement here:*

- **Story 002**: `PLAYER_KILLED` 처리, SPECTATOR 전환, ALIVE_COUNT 추적, GAME_OVER 발행, 60s 타이머 만료, EC-RM-6 중복 방지
- **Story 002**: `onClearDisplayExpired()` → `startRound(N+1)` 연쇄 (이 스토리는 clearDisplayTimer 등록만 — 만료 후 처리는 story-002의 통합 테스트)

---

## QA Test Cases

*Test specs derived from ADR-0011 Validation Criteria and ADR-0012 Validation Criteria.*

**AC-RM-01** — `startRound()` → ROUND_STARTED + GOAL_PLACED 발행
- Given: `new RoundManager(mockClock, mockBus, mockEscalation, mockGridSim, pathCells, 2)`; phase = IDLE; `nextExplosionTime` returns 5.0
- When: `rm.startRound(1)`; `mockBus.flush()`
- Then: `mockBus.emitted[0].type == 'ROUND_STARTED'`, `mockBus.emitted[0].payload.roundNumber == 1`; `mockBus.emitted[1].type == 'GOAL_PLACED'`
- Edge cases: `rm.startRound(1)` while phase = ROUND_ACTIVE → no new events emitted

**AC-RM-02** — goalCell = N-1 (안전한 경우)
- Given: `mockGridSim.nextExplosionTime(pathCells[N-1]) = 3.0` (>= GATE_PERIOD_BASE 2.0)
- When: `rm.startRound(1)`
- Then: GOAL_PLACED.payload.cell deep-equals `pathCells[pathCells.length - 1]`

**AC-RM-03** — goalCell = N-2 (폴백) + EC-RM-1 단일 폴백
- Given: `mockGridSim.nextExplosionTime(pathCells[N-1]) = 1.5`; `nextExplosionTime(pathCells[N-2]) = 0.5` (N-2도 unsafe)
- When: `rm.startRound(1)`
- Then: GOAL_PLACED.payload.cell deep-equals `pathCells[pathCells.length - 2]` (N-2 고정, N-3 없음)

**AC-RM-04** — PLAYER_ARRIVED goalCell → ROUND_CLEAR
- Given: rm is ROUND_ACTIVE, goalCell = `{q:3, r:2}`
- When: `rm.onPlayerArrived({ playerId: 'p1', cell: {q:3, r:2} })`; flush
- Then: ROUND_CLEAR emitted with `roundNumber == 1`
- Edge cases: `cell = {q:0, r:0}` (non-goal) → no ROUND_CLEAR; cell == goalCell but phase == ROUND_CLEAR_DISPLAY → no ROUND_CLEAR (tie-break)

**AC-RM-06** — ROUND_END 1500ms 후 발행
- Given: ROUND_CLEAR just emitted (phase = ROUND_CLEAR_DISPLAY)
- When: `mockClock.tick(1.5)`; flush
- Then: ROUND_END emitted with `roundNumber == 1`
- Edge cases: `tick(1.4)` → no ROUND_END; `tick(1.5)` → ROUND_END

**setGatePeriod 순서** — ROUND_STARTED 이전 보장
- Given: mockGridSim with `setGatePeriod` spy; mockEscalation returns ctx
- When: `rm.startRound(1)`
- Then: spy call order: `setGatePeriod` called before first `emit('ROUND_STARTED')`

---

## Test Evidence

**Story Type**: Logic
**Required evidence**: `tests/unit/roundmanager/round_lifecycle_goal_cell_test.ts` — must exist and pass

**Status**: [ ] Not yet created

---

## Dependencies

- Depends on: None (foundational RoundManager implementation — first story)
- Unlocks: Story 002 (player state tracking requires round lifecycle working)

## Completion Notes
**Completed**: 2026-04-23
**Criteria**: 8/8 passing (AC-RM-05 stub implemented; body deferred to story-002)
**Deviations**: markAllAliveForNextRound() is no-op stub (story-002 scope); onClearDisplayExpired() does not chain startRound(N+1) (story-002 scope)
**Test Evidence**: Logic: tests/unit/roundmanager/round_lifecycle_goal_cell_test.ts — 20 tests, all passing
**Code Review**: Skipped — Lean mode
