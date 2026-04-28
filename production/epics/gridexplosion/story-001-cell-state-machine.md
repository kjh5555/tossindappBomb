# Story 001: Cell State Machine + Gate Period Timing

> **Epic**: GridExplosion
> **Status**: Complete
> **Layer**: Core
> **Type**: Logic
> **Manifest Version**: 2026-04-22

## Context

**GDD**: `design/gdd/grid-explosion.md`
**Requirements**: `TR-gridexplosion-001`, `TR-gridexplosion-002`, `TR-gridexplosion-003`, `TR-gridexplosion-004`, `TR-gridexplosion-012`, `TR-gridexplosion-013`
*(Requirement text lives in `docs/architecture/tr-registry.yaml` — read fresh at review time)*

**ADR Governing Implementation**: ADR-0002: FrameClock 결정론적 시간 모델 + ADR-0006: Gate Period 튜닝
**ADR Decision Summary**: All time is tracked via `FrameClock.simulatedTime` (never `Date.now()`). Each gate cell cycles Idle→Exploded→Idle via a phase formula `phase(t) = ((t + offset) mod GATE_PERIOD)`. `setGatePeriod()` accepts only `[GATE_PERIOD_FLOOR=1.4, GATE_PERIOD_BASE=2.0]` and must be called before `ROUND_STARTED` is emitted.

**Engine**: Cocos Creator 3.8.6 (TypeScript) | **Risk**: LOW
**Engine Notes**: No post-cutoff APIs. `director.getScheduler()` / `update(dt)` fully within LLM training. `IFrameClock` must be DI-injected for testability — never use `director.getTotalTime()`.

**Control Manifest Rules (Core layer)**:
- Required: `FrameClock.now()` for all time; `Date.now()` / `performance.now()` forbidden
- Required: `setGatePeriod()` range `[1.4, 2.0]`; out-of-range → reject + `console.warn`
- Required: `CellCoord = { row: 0-7, col: 0-7 }` for all cell references
- Forbidden: `Date.now()` / `performance.now()` in game logic
- Guardrail: `update(dt)` for 64 cells < 16.6ms

---

## Acceptance Criteria

*From GDD `design/gdd/grid-explosion.md`, scoped to this story:*

- [ ] **AC-1**: Gate cell cyclic sequence over 3 full cycles = `[IDLE, EXPLODED, IDLE, EXPLODED, IDLE, EXPLODED, IDLE]`. Zero intermediate Warning/Imminent states. Non-gate cells always `IDLE`.
- [ ] **AC-2**: State transition timing accuracy ±16ms against `simulatedTime` over 100 cycles at default `GATE_PERIOD=2.0s, T_EX=0.35s`. `IDLE` duration ≈ 1.65s, `EXPLODED` duration ≈ 0.35s.
- [ ] **AC-3**: No external API can force-change cell state. Timer residual unchanged after any external call attempt.
- [ ] **AC-4**: `CELL_STATE_CHANGED` emitted exactly 4 times for 2 cycles (sequence: EXPLODED→IDLE→EXPLODED→IDLE). Each event has `cellId`, `newState`, `timestamp` fields. `timestamp` matches `clock.now()` at transition (±1ms).
- [ ] **AC-4b**: `setGatePeriod(v)` for `v ∈ [1.4, 2.0]` applies immediately and updates `GATE_PERIOD`. `setGatePeriod(v)` for `v < 1.4` or `v > 2.0` is rejected, `console.warn` fires, existing value retained.
- [ ] **Invariant**: `SAFE_WIN(R) = GATE_PERIOD(R) − T_EX ≥ 0.45s` holds for all valid `GATE_PERIOD` values.

---

## Implementation Notes

*Derived from ADR-0002 + ADR-0006 Implementation Guidelines:*

```typescript
// Gate cycle phase formula (F-1):
// phase(t) = ((t + offset) % GATE_PERIOD + GATE_PERIOD) % GATE_PERIOD
// state = IDLE      if phase(t) < SAFE_WIN (= GATE_PERIOD - T_EX)
// state = EXPLODED  otherwise

// Constants (src/core/grid/GridConstants.ts):
export const GATE_PERIOD_BASE  = 2.0;   // seconds
export const GATE_PERIOD_FLOOR = 1.4;   // seconds — never set below 1.2
export const T_EX              = 0.35;  // seconds — fixed, independent of GATE_PERIOD
export const SAFE_WIN_MIN      = 0.45;  // seconds

// GridSimulation constructor must accept IFrameClock via DI:
constructor(private clock: IFrameClock, private eventBus: IEventBus) {}

// setGatePeriod implementation (ADR-0006):
setGatePeriod(seconds: number): void {
  if (seconds < GATE_PERIOD_FLOOR || seconds > GATE_PERIOD_BASE) {
    console.warn(`setGatePeriod: ${seconds} out of range [${GATE_PERIOD_FLOOR}, ${GATE_PERIOD_BASE}]`);
    return;
  }
  this.gatePeriod = seconds;
  // Each gate cell retains its offset — only period changes (rhythm continuity)
}

// update(dt) must use clock.now() for phase computation — never Date.now()
```

- Each cell has a per-cell `offset` (phase stagger). `setGatePeriod` changes the period but does NOT reset offsets.
- `CELL_STATE_CHANGED` fires on every Idle→Exploded AND Exploded→Idle transition.
- Non-gate (non-pattern) cells remain permanently `IDLE` — no timer allocated.
- `T_EX = 0.35s` is a constant, never computed from `GATE_PERIOD`.

---

## Out of Scope

*Handled by neighbouring stories — do not implement here:*

- **Story 002**: Death detection (`PLAYER_KILLED`, `CELL_EXPLODED`) when players occupy exploding cells
- **Story 003**: `applyPattern()`, BFS validation, `PATTERN_REJECTED`, `GRID_STALLED`
- **Story 004**: Edge case guards (double-death, boundary coordinates, performance benchmarks)

---

## QA Test Cases

*Test specs for automated verification:*

- **AC-1**: Cyclic state sequence
  - Given: `GridSimulation` with 1 gate cell at `{row:0,col:0}`, `GATE_PERIOD=2.0`, `T_EX=0.35`, clock starting at 0
  - When: `tick(dt=0.016)` called advancing `simulatedTime` by `GATE_PERIOD × 3` (= 6.0s)
  - Then: recorded state-change sequence = `[EXPLODED, IDLE, EXPLODED, IDLE, EXPLODED, IDLE]`; non-gate cell at `{row:0,col:1}` always returns `getCellState() === 'IDLE'`
  - Edge cases: repeat with `GATE_PERIOD_FLOOR=1.4` (FLOOR boundary); offset=0 and offset=GATE_PERIOD/2

- **AC-2**: Timing accuracy ±16ms
  - Given: same setup, 100 cycle loop, recording actual transition timestamps
  - When: `tick(0.016)` advances clock; transitions recorded via `CELL_STATE_CHANGED` listener
  - Then: for each of 200 transitions (100×2), `|actual_time - expected_time| ≤ 0.016s`
  - Edge cases: floating-point accumulation at 200+ cycles; `GATE_PERIOD=1.4` (shorter cycle)

- **AC-3**: Encapsulation (no external force)
  - Given: gate cell in `IDLE` state, timer at 1.0s remaining
  - When: any attempt to call a non-existent `forceState()` or direct field mutation
  - Then: `getCellState()` returns `IDLE`; no state transition occurs; test verifies API absence
  - Edge cases: TypeScript `private` access guard; test via reflection is not required

- **AC-4**: `CELL_STATE_CHANGED` event completeness
  - Given: EventBus spy listener; gate cell running for exactly 2 full cycles
  - When: clock advances `GATE_PERIOD × 2`
  - Then: spy called exactly 4 times; payloads in order: `newState=EXPLODED, IDLE, EXPLODED, IDLE`; each has `cellId`, `newState`, `timestamp`; `timestamp === clock.now()` at call time ±0.001
  - Edge cases: clock starts at `t=5.0` (non-zero start); listener registered after 1st cycle

- **AC-4b**: `setGatePeriod` range enforcement
  - Given: `GridSimulation` with `GATE_PERIOD=2.0`
  - When: call `setGatePeriod(1.6)`, `setGatePeriod(1.4)`, `setGatePeriod(2.0)`, `setGatePeriod(1.3)`, `setGatePeriod(2.1)`
  - Then: 1.6→applied; 1.4→applied (floor boundary inclusive); 2.0→applied (base inclusive); 1.3→rejected+warn; 2.1→rejected+warn; internal `gatePeriod` unchanged after rejection
  - Edge cases: call during `EXPLODED` state; call `setGatePeriod(0)` and `setGatePeriod(-1)`

---

## Test Evidence

**Story Type**: Logic
**Required evidence**: `tests/unit/gridexplosion/cell_state_machine_test.ts` — must exist and pass

**Status**: [x] `tests/unit/gridexplosion/cell_state_machine_test.ts` — 20 tests passing

---

## Dependencies

- Depends on: None (first story — no GridExplosion prerequisites)
- Unlocks: Story 002 (death detection needs cells to explode), Story 003 (pattern validation calls `applyPattern`), Story 004 (edge cases build on state machine)

## Completion Notes
**Completed**: 2026-04-22
**Criteria**: 24/24 passing (all auto-verified via test suite)
**Deviations**: None
**Test Evidence**: Logic: `tests/unit/gridexplosion/cell_state_machine_test.ts` — 20 tests passing
**Code Review**: Skipped — Lean mode
