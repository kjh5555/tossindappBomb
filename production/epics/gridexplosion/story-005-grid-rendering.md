# Story 005: Grid Cell Visual Rendering

> **Epic**: GridExplosion
> **Status**: Ready
> **Layer**: Core
> **Type**: Visual/Feel
> **Manifest Version**: 2026-04-22

## Context

**GDD**: `design/gdd/grid-explosion.md`
**Requirements**: `TR-gridexplosion-???` *(Visual rendering TRs not yet assigned in tr-registry.yaml — corresponds to GDD AC-13, AC-14, AC-15)*
*(Requirement text lives in `docs/architecture/tr-registry.yaml` — read fresh at review time)*

**ADR Governing Implementation**: No ADR — visual rendering is engine-native (`cc.Graphics` on Cocos Creator 3.8.6)
**ADR Decision Summary**: N/A — cell rendering uses a single `cc.Graphics` component to draw all 64 cells in one draw call. State colors are defined in the art bible. No architectural decision required beyond the single-draw-call constraint (performance budget).

**Engine**: Cocos Creator 3.8.6 (TypeScript) | **Risk**: MEDIUM
**Engine Notes**: `cc.Graphics` draw batching is engine-managed. Single-component approach guarantees 1 draw call only if all cells are drawn within the same `cc.Graphics.clear() + draw sequence`. Verify `UISkew` is NOT used on grid cells (3.8.6 breaking change: UISkew requires component pre-add). `Renderer.setSharedMaterial` with same material requires `forceUpdate: true` in 3.8.6.

**Control Manifest Rules (Core layer)**:
- Required: render loop reads `getCellState(coord)` from `GridSimulation` — no direct state coupling
- Required: 64 cells in single `cc.Graphics` component (≤50 draw call budget — 1 draw call for grid)
- Forbidden: one `cc.Graphics` node per cell — violates draw call budget
- Guardrail: `update(dt)` render pass for 64 cells < 16.6ms

---

## Acceptance Criteria

*From GDD `design/gdd/grid-explosion.md`, scoped to this story:*

- [ ] **AC-13**: Each cell state renders with the correct art bible color:
  - `IDLE` safe cell: `#1A3A5C` (deep blue)
  - `IDLE` gate cell: `#0D3050` (path blue)
  - `EXPLODED` gate cell: flash `#00E5CC` (danger cyan) for 0.1s → dim to `#3A1A1A` (dark ember) for remaining T_EX
  - Colors verified against art bible §4 by art-lead sign-off.
- [ ] **AC-14**: Gate cycle visual rhythm measured at 60fps — `Idle→Exploded` and `Exploded→Idle` transitions occur within ±1 frame (±16.6ms) of the `CELL_STATE_CHANGED` event timestamp.
- [ ] **AC-15**: All 64 cells are rendered via a single `cc.Graphics` component in 1 draw call. Verified via Cocos Creator profiler (draw call counter = 1 for the grid layer).

---

## Implementation Notes

*Derived from engine-native approach and art bible §4:*

```typescript
// GridRenderer component — attached to a single Node with cc.Graphics
// update(dt): clear() once, then draw all 64 cells in sequence
//
// onLoad():
//   this.graphics = this.getComponent(cc.Graphics);
//
// update(dt):
//   this.graphics.clear();
//   for (let row = 0; row < 8; row++) {
//     for (let col = 0; col < 8; col++) {
//       const state = this.gridSim.getCellState({ row, col });
//       const color = this.getColorForState(state, row, col);
//       this.graphics.fillColor = color;
//       this.graphics.rect(col * CELL_SIZE, row * CELL_SIZE, CELL_SIZE, CELL_SIZE);
//       this.graphics.fill();
//     }
//   }
//
// Flash effect (AC-13 cyan flash 0.1s):
//   Maintain a per-cell flashTimer: Map<CellIndex, number>
//   On CELL_STATE_CHANGED to EXPLODED: flashTimer.set(index, 0.1)
//   In update: if flashTimer > 0, use #00E5CC; else use #3A1A1A
//   flashTimer -= dt; clamp to 0

// Cell colors (art bible §4):
const IDLE_SAFE_COLOR  = new cc.Color(0x1A, 0x3A, 0x5C); // #1A3A5C
const IDLE_GATE_COLOR  = new cc.Color(0x0D, 0x30, 0x50); // #0D3050
const FLASH_COLOR      = new cc.Color(0x00, 0xE5, 0xCC); // #00E5CC — 0.1s
const EXPLODED_COLOR   = new cc.Color(0x3A, 0x1A, 0x1A); // #3A1A1A — dim
```

- `GridRenderer` subscribes to `CELL_STATE_CHANGED` on EventBus to trigger flash timer per cell.
- `GridRenderer` does NOT own game state — it reads from `GridSimulation.getCellState()` each frame.
- Single `cc.Graphics` node is the only rendering path — no sprite nodes per cell.
- OQ-5 (open question): `#3A1A1A` vs `#0D3050` contrast in dark environments — flag for art-lead review at AC-13 sign-off.

---

## Out of Scope

*Handled by neighbouring stories — do not implement here:*

- **Story 001**: Cell state machine, `getCellState()` implementation
- **Story 002**: `PLAYER_KILLED` event (death visual feedback belongs to a HUD/feedback story)
- **Story 003**: `applyPattern()` which determines which cells are gate cells
- **HUD Epic** (Presentation layer): Kill feed, player count display, round timer HUD elements

---

## QA Test Cases

*Visual/Feel story — manual verification required. Evidence must be captured before `/story-done`.*

- **AC-13**: State color accuracy
  - Setup: Launch game scene with `GridSimulation` and `GridRenderer` active; inject a pattern with 56 gate cells; advance clock to trigger `Idle→Exploded` on several cells
  - Verify: Take screenshot at 3 moments — (a) all cells Idle, (b) flash frame (≤0.1s after transition), (c) dim state (>0.1s after transition); compare each cell color against art bible §4 hex values using eyedropper
  - Pass condition: Each state color matches hex spec within ±5 RGB units; art-lead sign-off on screenshot set; OQ-5 (dim vs path cell contrast) explicitly assessed and annotated

- **AC-14**: Cycle timing visual accuracy ±1 frame
  - Setup: Screen-record grid at 60fps for 10 full gate cycles; mark frame number of each `CELL_STATE_CHANGED` event from EventBus log; mark frame number of visible color change in recording
  - Verify: For each of 20 transitions (10 cycles × 2 transitions each), compute `|visual_frame − event_frame|`
  - Pass condition: All 20 deltas ≤ 1 frame (≤16.6ms); no transition is visually delayed more than 1 frame from the logical event

- **AC-15**: Single draw call verification
  - Setup: Enable Cocos Creator profiler overlay; launch scene with full 64-cell grid rendering
  - Verify: Profiler draw call counter for the grid layer shows ≤ 1 draw call; confirm by toggling GridRenderer node visible/invisible and observing counter change by exactly 1
  - Pass condition: Draw call delta = 1 when GridRenderer enabled; profiler screenshot captured and attached to evidence doc

---

## Test Evidence

**Story Type**: Visual/Feel
**Required evidence**: `production/qa/evidence/gridexplosion-render-evidence.md` — screenshots (AC-13 color states, AC-14 timing overlay, AC-15 profiler) + art-lead sign-off

**Status**: [ ] Not yet created

---

## Dependencies

- Depends on: Story 001 (state machine + `getCellState()`) must be DONE
- Unlocks: None within this epic — Story 005 is the final GridExplosion story
