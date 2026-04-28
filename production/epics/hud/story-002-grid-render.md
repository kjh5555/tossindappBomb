# Story 002: 그리드 렌더 + Goal Cell 강조

> **Epic**: HUD
> **Status**: Complete
> **Layer**: Presentation
> **Type**: Integration
> **Manifest Version**: 2026-04-22

## Context

**GDD**: `design/gdd/grid-explosion.md` (CELL_STATE_CHANGED 이벤트 계약), `design/gdd/round-manager.md` (GOAL_PLACED 이벤트 계약)
**Requirements**: TR-gridexplosion-008 (CELL_STATE_CHANGED 발행), TR-roundmanager-011 (GOAL_PLACED 발행)
*(Requirement text lives in `docs/architecture/tr-registry.yaml` — read fresh at review time)*

**ADR Governing Implementation**: ADR-0016 (HUD Safe Area + Audio) + ADR-0015 (DeathReplay z-order — GridLayer z:10)
**ADR Decision Summary**: 8×8 그리드는 GridLayer(z:10)에 배치. 64개 cell 노드는 한 번 생성 후 재사용. CELL_STATE_CHANGED 수신 시 해당 cell 노드의 시각만 변경 (스프라이트/색상 토글). GOAL_PLACED 수신 시 골 셀에 하이라이트 노드 추가.

**Engine**: Cocos Creator 3.8.6 (TypeScript) | **Risk**: MEDIUM
**Engine Notes**: `cc.Sprite` + `cc.Color`로 cell 색상 구현. Pre-allocated cell 노드 64개 — 매 프레임 재할당 금지 (zero-alloc 원칙). Renderer.setSharedMaterial 호출 시 3.8.6에서 동일 material 재적용 안됨 → forceUpdate 필요 (현재 스토리는 색상만 변경하므로 영향 없음). Performance budget: 8×8 grid, draw call ≤ 50 (technical-preferences.md). 색상 토글은 `cc.Color` 인스턴스 재사용.

**Control Manifest Rules (Presentation layer)**:
- Required: 레이어 z-order 고정 — GridLayer(z:10) — source: ADR-0015
- Required: HUD 자식 노드는 HUDLayer 또는 GridLayer 로컬 좌표만 사용 — source: ADR-0016
- Required: 이벤트 구독은 `IEventBus.on()` (생성자 1회) — source: ADR-0001
- Required: 절대 픽셀 좌표 하드코딩 금지 — `cellToPixel(cell, gridOrigin, cellSize)` 변환 사용 — source: ADR-0015
- Forbidden: 매 프레임 cell 노드 생성/파괴 — pre-allocated 풀 재사용 — source: engine-code rules
- Forbidden: GridLayer가 GridSimulation 상태 직접 read (구독만 허용) — source: ADR-0015 (FairFeedback 규칙 동일 적용)

---

## Acceptance Criteria

- [ ] **AC-GRID-01**: GridLayer 생성 시 64개 cell 노드가 8×8 격자로 배치됨 (`cellToPixel({row, col}, gridOrigin, cellSize)` 사용).
- [ ] **AC-GRID-02**: 초기 상태에서 모든 cell의 시각 상태 = `'IDLE'` (idleColor 적용).
- [ ] **AC-GRID-03**: `CELL_STATE_CHANGED({cell:{row:3,col:4}, state:'EXPLODED'})` 수신 + flush → cell(3,4)의 색상 = explodedColor.
- [ ] **AC-GRID-04**: `CELL_STATE_CHANGED({cell:{row:3,col:4}, state:'IDLE'})` 수신 + flush → cell(3,4)의 색상 = idleColor.
- [ ] **AC-GRID-05**: `GOAL_PLACED({cell:{row:5,col:5}, timestamp})` 수신 시 cell(5,5)에 highlight 활성화 플래그 true.
- [ ] **AC-GRID-06**: 새 ROUND_STARTED 수신 시 이전 GOAL_PLACED highlight가 해제됨 (이전 골 셀 highlight 플래그 false).
- [ ] **AC-GRID-07**: out-of-range CellCoord (`{row:-1,col:0}`, `{row:8,col:0}`) → 무시, 콘솔 경고만, 크래시 없음.
- [ ] **AC-GRID-08**: dispose() 호출 시 모든 EventBus 구독 해제 (off()).
- [ ] **AC-GRID-09 (성능 — 수동 검증)**: 56개 EXPLODED cell 동시 변경 시 30+ fps 유지 (Toss webview).

---

## Implementation Notes

*Derived from ADR-0016 + ADR-0015 z-order contract:*

### File Layout

```
src/presentation/hud/
├── GridLayer.ts         (this story — grid render + cell state sync)
├── GridConfig.ts        (this story — cell size, origin, color palette)
└── cellToPixel.ts       (this story — pure coord transform util)
```

### `GridLayer` 핵심 구조

```typescript
import type { IEventBus } from '../../core/events/IEventBus';
import type { CellCoord, CellState } from '../../core/types/Domain';
import { cellToIndex, isValidCell } from '../../core/grid/CellCoord';

export interface CellVisual {
  state: CellState;            // 'IDLE' | 'EXPLODED'
  highlighted: boolean;        // GOAL_PLACED true
  // Real Cocos integration: cc.Sprite reference, cc.Color
  // Test stand-in: plain object with these flags
}

export class GridLayer {
  private cells: CellVisual[] = new Array(64);  // pre-allocated 8×8
  private subscriptions: Array<() => void> = [];
  private currentGoalIndex: number | null = null;

  constructor(private readonly bus: IEventBus) {
    // Pre-allocate 64 cell visuals — never reallocated
    for (let i = 0; i < 64; i++) {
      this.cells[i] = { state: 'IDLE', highlighted: false };
    }

    const onCellState = (e: { cell: CellCoord; state: CellState }) => {
      if (!isValidCell(e.cell)) {
        console.warn(`[GridLayer] CELL_STATE_CHANGED out-of-range {row:${e.cell.row}, col:${e.cell.col}}`);
        return;
      }
      this.cells[cellToIndex(e.cell)].state = e.state;
    };

    const onGoalPlaced = (e: { cell: CellCoord }) => {
      if (!isValidCell(e.cell)) {
        console.warn(`[GridLayer] GOAL_PLACED out-of-range {row:${e.cell.row}, col:${e.cell.col}}`);
        return;
      }
      // Clear previous goal highlight
      if (this.currentGoalIndex !== null) {
        this.cells[this.currentGoalIndex].highlighted = false;
      }
      const idx = cellToIndex(e.cell);
      this.cells[idx].highlighted = true;
      this.currentGoalIndex = idx;
    };

    const onRoundStarted = () => {
      // Clear goal highlight at round boundary (will be re-set by GOAL_PLACED)
      if (this.currentGoalIndex !== null) {
        this.cells[this.currentGoalIndex].highlighted = false;
        this.currentGoalIndex = null;
      }
    };

    bus.on('CELL_STATE_CHANGED', onCellState);
    bus.on('GOAL_PLACED', onGoalPlaced);
    bus.on('ROUND_STARTED', onRoundStarted);

    this.subscriptions = [
      () => bus.off('CELL_STATE_CHANGED', onCellState),
      () => bus.off('GOAL_PLACED', onGoalPlaced),
      () => bus.off('ROUND_STARTED', onRoundStarted),
    ];
  }

  /** Test/inspection accessor — returns shallow copy of cell at coord. */
  getCellVisual(cell: CellCoord): CellVisual | null {
    if (!isValidCell(cell)) return null;
    return { ...this.cells[cellToIndex(cell)] };
  }

  dispose(): void {
    for (const off of this.subscriptions) off();
    this.subscriptions = [];
  }
}
```

### `cellToPixel` (pure utility)

```typescript
// src/presentation/hud/cellToPixel.ts

export function cellToPixel(
  cell: { row: number; col: number },
  gridOrigin: { x: number; y: number },
  cellSize: number,
): { x: number; y: number } {
  return {
    x: gridOrigin.x + cell.col * cellSize,
    y: gridOrigin.y + cell.row * cellSize,
  };
}
```

### Cocos integration (out of scope for automated test)

The actual `cc.Sprite` color application happens in a thin Cocos wrapper that observes `getCellVisual()` and applies colors. The integration test verifies the `CellVisual` state model is correctly synced — Cocos rendering is verified by the **Manual evidence** in QA Test Cases below.

---

## Out of Scope

- **AC-GRID-09 자동화**: 56-cell 동시 폭발 fps 측정은 실기기 manual evidence (story doesn't include automated perf benchmark)
- **story-001**: round/alive/timer label rendering
- **story-003**: result overlay
- **Cell 입자 효과 / 폭발 애니메이션**: Sprint 5 범위 외 (FairFeedback story로 분리)

---

## QA Test Cases

*Integration test specs:*

**AC-GRID-01** — 64 cells initialized
- Given: 새 GridLayer 인스턴스
- When: 각 valid CellCoord에 대해 `getCellVisual(c)` 호출
- Then: 64개 모두 non-null; `state === 'IDLE'`, `highlighted === false`

**AC-GRID-03** — CELL_STATE_CHANGED → EXPLODED 반영
- Given: GridLayer 생성, cell(3,4) 초기 IDLE
- When: `bus.emit('CELL_STATE_CHANGED', {cell:{row:3,col:4}, state:'EXPLODED', timestamp:0})`; flush
- Then: `getCellVisual({row:3,col:4}).state === 'EXPLODED'`; 다른 cell은 변화 없음

**AC-GRID-04** — CELL_STATE_CHANGED → IDLE 복귀
- Given: cell(3,4) state=EXPLODED
- When: `bus.emit('CELL_STATE_CHANGED', {cell:{row:3,col:4}, state:'IDLE', ...})`; flush
- Then: `getCellVisual({row:3,col:4}).state === 'IDLE'`

**AC-GRID-05** — GOAL_PLACED → highlight 활성
- Given: GridLayer 생성, currentGoalIndex=null
- When: `bus.emit('GOAL_PLACED', {cell:{row:5,col:5}, timestamp:0})`; flush
- Then: `getCellVisual({row:5,col:5}).highlighted === true`

**AC-GRID-06** — ROUND_STARTED → 이전 goal highlight 해제
- Given: GOAL_PLACED 수신 (cell(5,5) highlighted=true)
- When: `bus.emit('ROUND_STARTED', {roundNumber:2, ctx, timestamp:0})`; flush
- Then: `getCellVisual({row:5,col:5}).highlighted === false`

**AC-GRID-06b** — 새 GOAL_PLACED → 이전 goal 자동 해제
- Given: GOAL_PLACED cell(5,5) → highlighted=true
- When: `bus.emit('GOAL_PLACED', {cell:{row:0,col:0}, timestamp:0})`; flush
- Then: `getCellVisual({row:5,col:5}).highlighted === false`; `getCellVisual({row:0,col:0}).highlighted === true`

**AC-GRID-07** — out-of-range coord 처리
- Given: GridLayer 생성, console.warn spy
- When: `bus.emit('CELL_STATE_CHANGED', {cell:{row:-1,col:0}, state:'EXPLODED', ...})`; flush
- Then: 콘솔 경고 1회 호출; throw 없음; 모든 valid cell 변화 없음

**AC-GRID-08** — dispose() 후 구독 해제
- Given: GridLayer 생성 직후
- When: `grid.dispose()`; `bus.emit('CELL_STATE_CHANGED', {cell:{row:0,col:0}, state:'EXPLODED'})`; flush
- Then: `getCellVisual({row:0,col:0}).state === 'IDLE'` (핸들러 미호출)

**AC-GRID-99** — `cellToPixel` 단위 테스트
- Given: gridOrigin={x:10, y:20}, cellSize=40
- When: `cellToPixel({row:2, col:3}, gridOrigin, 40)`
- Then: `{x: 130, y: 100}`  (10 + 3*40, 20 + 2*40)

**Manual evidence (AC-GRID-09 — Performance)**:
- Setup: Toss 인토스 webview, sprint 5 빌드, 라운드 5+
- Verify: 56개 EXPLODED cell 동시 변경 (대형 패턴) 발생 시 frame time
- Pass: ≥ 30 fps 유지 (33ms 이하 frame time); draw call ≤ 50

---

## Test Evidence

**Story Type**: Integration
**Required evidence**:
- `tests/integration/hud/grid_render_test.ts` — must exist and pass
- `tests/unit/hud/celltopixel_test.ts` — pure utility unit test
- `production/qa/evidence/grid-render-perf.md` — Toss webview screenshot + fps measurement (manual)

**Status**: [x] `tests/integration/hud/grid_render_test.ts` (11 tests) + `tests/unit/hud/celltopixel_test.ts` (6 tests) — 17 tests total, all passing

---

## Completion Notes
**Completed**: 2026-04-27
**Criteria**: 8/8 passing (AC-GRID-01 ~ AC-GRID-08, plus AC-GRID-99 cellToPixel)
**Deviations**: AC-GRID-09 (56-cell perf benchmark on Toss webview) deferred to S5-N2 / future device smoke pass — automated test verifies 56-cell event storm applies correctly but does not measure fps. The `Edge: many CELL_STATE_CHANGED events in same flush` test confirms all 56 cells transition correctly in a single flush.
**Test Evidence**: Integration: tests/integration/hud/grid_render_test.ts — 11 tests; Unit: tests/unit/hud/celltopixel_test.ts — 6 tests. Total 17 new tests, all passing (379 total suite).
**Code Review**: Skipped — Lean mode

---

## Dependencies

- Depends on: story-001 (HUD epic infrastructure — same Cocos scene root)
- Depends on: GridSimulation (CELL_STATE_CHANGED emission) — DONE
- Depends on: RoundManager (GOAL_PLACED emission) — DONE
- Unlocks: story-003 (Result overlay overlays GridLayer at z:30 vs z:10)
