# Story 002: 플레이어 상태 추적 + 라운드 종료 조건

> **Epic**: RoundManager
> **Status**: Complete
> **Layer**: Feature
> **Type**: Integration
> **Manifest Version**: 2026-04-22

## Context

**GDD**: `design/gdd/round-manager.md`
**Requirements**: `TR-roundmanager-003`, `TR-roundmanager-005`, `TR-roundmanager-006`, `TR-roundmanager-008`
*(Requirement text lives in `docs/architecture/tr-registry.yaml` — read fresh at review time)*

**ADR Governing Implementation**: ADR-0011: Round Phase 상태 머신 + ADR-0013: Survival Cycle-Revive
**ADR Decision Summary**: `PLAYER_KILLED` 이벤트 수신 시 해당 플레이어를 SPECTATOR로 전환하고 ALIVE_COUNT 갱신. ALIVE_COUNT == 0 또는 60s 타이머 만료 시 GAME_OVER 발행. ROUND_CLEAR_DISPLAY 상태에서는 PLAYER_KILLED 무시 (EC-RM-4). GAME_OVER는 phase guard로 중복 방지 (EC-RM-6). 스펙테이터 상태는 `PlayerStatus` enum으로 관리 — FSM에 추가하지 않음 (ADR-0013).

**Engine**: Cocos Creator 3.8.6 (TypeScript) | **Risk**: LOW
**Engine Notes**: 순수 TypeScript. `FrameClock.simulatedTime` 타임스탬프 비교로 rate-limit — 엔진 API 비의존 (ADR-0002).

**Control Manifest Rules (Feature layer)**:
- Required: All events via `IEventBus.emit<K>()` — source: ADR-0001
- Required: `phase !== 'ROUND_ACTIVE'` guard in EVERY event handler — source: ADR-0011
- Required: `triggerGameOver()` 내부 state guard 필수 (`if (phase !== 'ROUND_ACTIVE') return`) — source: ADR-0011 EC-RM-6
- Required: `markAllAliveForNextRound()` — `ROUND_CLEAR` 발행 직후 호출 (triggerRoundClear 내부) — source: ADR-0013
- Required: `reentry pathIndex = 0` 고정 — 폴백 분기 추가 금지 (EC-RM-7) — source: ADR-0013
- Forbidden: 스펙테이터를 RoundManager FSM 상태로 추가 — `PlayerStatus` enum으로 관리 — source: ADR-0013
- Forbidden: `PLAYER_ARRIVED.timestamp` 비교 로직 — source: ADR-0012

---

## Acceptance Criteria

*From `design/gdd/round-manager.md` + ADR-0013 Validation Criteria, scoped to this story:*

- [ ] **AC-SUR-01 / AC-RM-07**: `PLAYER_KILLED({ playerIds: ['p1'] })` 수신 시 해당 플레이어 `status = 'SPECTATOR'`. `ALIVE_COUNT_CHANGED` 이벤트 동일 flush 내 발행.
- [ ] **AC-SUR-02**: SPECTATOR 플레이어는 `aliveCount` 카운트에 포함되지 않음.
- [ ] **AC-RM-08 / AC-SUR-08**: `aliveCount == 0` (전원 SPECTATOR) → `GAME_OVER` 발행. `totalPlayers = 1` 솔로 플레이어 사망 시 포함.
- [ ] **AC-RM-09**: `clock.tick(60)` 경과 (라운드 타이머 만료) → `phase == ROUND_ACTIVE`이면 `GAME_OVER` 발행.
- [ ] **AC-RM-10 (EC-RM-6)**: 전원 사망 + 타이머 만료 동시 발생 → `GAME_OVER` 정확히 1회만 발행.
- [ ] **AC-RM-14**: `phase == ROUND_CLEAR_DISPLAY` 상태에서 `PLAYER_KILLED` 수신 → `aliveCount` 변경 없음, `ALIVE_COUNT_CHANGED` 미발행.
- [ ] **AC-SUR-03**: 스펙테이터 응원 요청이 `GATE_PERIOD`(2.0s) 이내 연속 도착 → 두 번째부터 `SPECTATOR_CHEERED` 미발행.
- [ ] **AC-SUR-04**: 응원 요청이 `GATE_PERIOD` 경과 후 도착 → `SPECTATOR_CHEERED` 발행.
- [ ] **AC-SUR-05**: `triggerRoundClear()` 호출 시 모든 플레이어 `status = 'ALIVE'` 즉시 마킹 (ROUND_CLEAR 발행 직후).
- [ ] **AC-SUR-06**: 부활 후 모든 플레이어 `pathIndex = 0` 설정.
- [ ] **AC-SUR-07**: `phase == ROUND_CLEAR_DISPLAY` 상태에서 응원 요청 → `SPECTATOR_CHEERED` 미발행.
- [ ] **TR-roundmanager-008 (EC-RM-5b)**: `GRID_STALLED` 이벤트가 `ROUND_ACTIVE` 중 수신 → `GAME_OVER` 발행 → `ROUND_END` 발행.

---

## Implementation Notes

*Derived from ADR-0011 + ADR-0013 Implementation Guidelines:*

### PlayerState 구조체 (`src/features/round/PlayerStatus.ts`)

```typescript
export type PlayerStatus = 'ALIVE' | 'SPECTATOR';

export interface PlayerState {
  playerId: PlayerId;
  status: PlayerStatus;
  lastCheerTime: number;   // frameClock.simulatedTime — 응원 rate-limit
  pathIndex: number;       // 사망 시점 경로 인덱스 유지
}
```

`RoundManager` 내 `private playerStates: Map<PlayerId, PlayerState>` — `startRound()` 최초 호출 시 초기화.

### `onPlayerKilled(event)` 구현

```typescript
onPlayerKilled(event: PlayerKilledEvent): void {
  if (this.phase !== 'ROUND_ACTIVE') return;  // EC-RM-4
  for (const playerId of event.playerIds) {
    const ps = this.playerStates.get(playerId);
    if (!ps || ps.status === 'SPECTATOR') continue;  // 중복 방지
    ps.status = 'SPECTATOR';
  }
  const aliveCount = this.countAlive();
  this.eventBus.emit('ALIVE_COUNT_CHANGED', { aliveCount, timestamp: this.clock.now() });
  if (aliveCount === 0) this.triggerGameOver();
}
```

### `triggerGameOver()` — EC-RM-6 guard

```typescript
private triggerGameOver(): void {
  if (this.phase !== 'ROUND_ACTIVE') return;  // 중복 GAME_OVER 방지
  if (this.roundTimerFn) {
    this.clock.cancelSchedule(this.roundTimerFn);
    this.roundTimerFn = null;
  }
  this.phase = 'GAME_OVER';
  this.eventBus.emit('GAME_OVER', { finalRound: this.roundNumber, timestamp: this.clock.now() });
}
```

### `markAllAliveForNextRound()` — ADR-0013

```typescript
private markAllAliveForNextRound(): void {
  for (const ps of this.playerStates.values()) {
    ps.status = 'ALIVE';
    ps.pathIndex = 0;          // EC-RM-7: 고정 0, 폴백 없음
    ps.lastCheerTime = -Infinity;
  }
}
```

`triggerRoundClear()` 내부에서 `ROUND_CLEAR` emit **직후** 호출.

### 응원 rate-limit — F-RM-3

```typescript
onSpectatorCheer(event: SpectatorCheerEvent): void {
  if (this.phase !== 'ROUND_ACTIVE') return;  // AC-SUR-07
  const ps = this.playerStates.get(event.playerId);
  if (!ps || ps.status !== 'SPECTATOR') return;
  const now = this.clock.simulatedTime;
  if (now - ps.lastCheerTime < this.gatePeriod) return;  // rate-limit
  ps.lastCheerTime = now;
  this.eventBus.emit('SPECTATOR_CHEERED', { playerId: event.playerId });
}
```

### GRID_STALLED 처리 (EC-RM-5b, TR-roundmanager-008)

```typescript
onGridStalled(): void {
  if (this.phase !== 'ROUND_ACTIVE') return;
  this.triggerGameOver();
  // GAME_OVER 직후 ROUND_END 발행
  this.eventBus.emit('ROUND_END', { roundNumber: this.roundNumber, timestamp: this.clock.now() });
}
```

---

## Out of Scope

*Handled by separate stories — do not implement here:*

- **Story 001**: `startRound()`, Goal Cell 배치 (F-RM-1), `ROUND_CLEAR` 발행, `onClearDisplayExpired()`
- **S4-S2 (SessionFlow stub)**: `GAME_OVER` 수신 후 `menu → match → result` 상태 전환 — 별도 epic

---

## QA Test Cases

*Test specs derived from ADR-0011 + ADR-0013 Validation Criteria.*

**AC-SUR-01 / AC-RM-07** — PLAYER_KILLED → SPECTATOR + ALIVE_COUNT_CHANGED
- Given: rm ROUND_ACTIVE, `playerStates` has `p1` (ALIVE), `p2` (ALIVE); totalPlayers = 2
- When: `rm.onPlayerKilled({ playerIds: ['p1'] })`; flush
- Then: `playerStates.get('p1').status == 'SPECTATOR'`; ALIVE_COUNT_CHANGED.aliveCount == 1
- Edge cases: `p1` already SPECTATOR → no duplicate decrement; multiple IDs in one event → all marked SPECTATOR

**AC-RM-08 + AC-SUR-08** — 전원 사망 → GAME_OVER (솔로 포함)
- Given: totalPlayers = 1, phase ROUND_ACTIVE, `p1` ALIVE
- When: `rm.onPlayerKilled({ playerIds: ['p1'] })`; flush
- Then: GAME_OVER emitted; phase == 'GAME_OVER'

**AC-RM-09** — 60s 타이머 만료 → GAME_OVER
- Given: rm ROUND_ACTIVE (no deaths, no clear)
- When: `mockClock.tick(60)`; flush
- Then: GAME_OVER emitted; phase == 'GAME_OVER'

**AC-RM-10 (EC-RM-6)** — 동시 GAME_OVER 트리거 → 1회만
- Given: rm ROUND_ACTIVE, 1 player alive, round timer at t=59.9s
- When: `mockClock.tick(0.1)` (타이머 만료) AND `onPlayerKilled` in same flush
- Then: GAME_OVER emitted exactly once (count == 1)

**AC-RM-14** — ROUND_CLEAR_DISPLAY 중 PLAYER_KILLED 무시
- Given: phase == 'ROUND_CLEAR_DISPLAY', `p2` ALIVE
- When: `rm.onPlayerKilled({ playerIds: ['p2'] })`; flush
- Then: `playerStates.get('p2').status == 'ALIVE'`; ALIVE_COUNT_CHANGED not emitted

**AC-SUR-05/06** — ROUND_CLEAR → 전원 ALIVE + pathIndex=0
- Given: 2 players, `p1` ALIVE (pathIndex=5), `p2` SPECTATOR (pathIndex=2)
- When: `rm.onPlayerArrived({ playerId: 'p1', cell: goalCell })`; flush (triggers ROUND_CLEAR)
- Then: `playerStates.get('p2').status == 'ALIVE'`; `playerStates.get('p2').pathIndex == 0`; `playerStates.get('p1').pathIndex == 0`

**AC-SUR-03/04** — 응원 rate-limit
- Given: `p2` SPECTATOR, `lastCheerTime = 0`, `gatePeriod = 2.0`, `simulatedTime = 1.5`
- When: `rm.onSpectatorCheer({ playerId: 'p2' })` (within cooldown)
- Then: SPECTATOR_CHEERED not emitted
- Given: `simulatedTime = 2.5` (cooldown elapsed)
- When: `rm.onSpectatorCheer({ playerId: 'p2' })`
- Then: SPECTATOR_CHEERED emitted; `lastCheerTime` updated to 2.5

**TR-roundmanager-008 (EC-RM-5b)** — GRID_STALLED → GAME_OVER → ROUND_END
- Given: rm ROUND_ACTIVE
- When: `rm.onGridStalled()`; flush
- Then: GAME_OVER emitted, then ROUND_END emitted; phase == 'GAME_OVER'

---

## Test Evidence

**Story Type**: Integration
**Required evidence**: `tests/integration/roundmanager/player_state_round_end_test.ts` — must exist and pass

**Status**: [ ] Not yet created

---

## Dependencies

- Depends on: Story 001 must be DONE (`startRound()`, Goal Cell placement, and `ROUND_CLEAR` flow must exist before player state integration tests can run end-to-end)
- Unlocks: S4-S1 (GAP-02/03/04 resolution), S4-S2 (SessionFlow stub)

## Completion Notes
**Completed**: 2026-04-23
**Criteria**: 12/12 passing
**Deviations**: SPECTATOR_CHEERED emitted without cellCoord (ADR-0013 references lastCellCoord; pathIndex preserved — presentation layer derives cell from pathCells[pathIndex] when needed)
**Test Evidence**: Integration: tests/integration/roundmanager/player_state_round_end_test.ts — 21 tests, all passing (317 total suite)
**Code Review**: Skipped — Lean mode
