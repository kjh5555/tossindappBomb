# Story 005: Player Visual + Feel (Tween, Death Anim, Boundary Bump)

> **Epic**: PlayerMovement
> **Status**: Ready
> **Layer**: Core
> **Type**: Visual/Feel
> **Manifest Version**: 2026-04-22

## Context

**GDD**: `design/gdd/player-movement.md`
**Requirements**: `TR-playermovement-006` (MOVE_TWEEN_DURATION=0.1s visual)
*(Requirement text lives in `docs/architecture/tr-registry.yaml` — read fresh at review time)*

**ADR Governing Implementation**: ADR-0008: Player Movement Event Split
**ADR Decision Summary**: `MOVE_TWEEN_DURATION=0.1s` linear lerp with no easing. Triangle direction indicator snaps to destination direction at tween start. No motion blur, no overshoot. Death animation (V-5) is 0.6s in 4 phases. Boundary bump (V-6) is 10% offset → 50ms return with no color change.

**Engine**: Cocos Creator 3.8.6 (TypeScript) | **Risk**: MEDIUM
**Engine Notes**: `UISkew` must NOT be used on player nodes (3.8.6 breaking change: requires component pre-add). Player rendered via `cc.Graphics` (1 draw call for outline + direction triangle). Death animation 4-arc split uses `cc.Graphics` draw per frame — no `UISkew`. `Renderer.setSharedMaterial` with same material requires `forceUpdate: true` if reapplying.

**Control Manifest Rules (Presentation layer — visual story)**:
- Required: linear `lerp` (F-4) — no ease/spring/overshoot
- Required: direction triangle snaps at `t=0` of tween, not interpolated
- Required: 1 draw call per player (outline + triangle in same `cc.Graphics`)
- Forbidden: motion blur, trail effects — minimal philosophy

---

## Acceptance Criteria

*From GDD `design/gdd/player-movement.md`, scoped to this story:*

- [ ] **AC-PM-21**: Movement "feels instant" — `MOVE_TWEEN_DURATION=0.1s` linear lerp produces a responsive, no-lag feel on real device. *(Playtest: 5 participants, ≥4/5 perceive no delay)*
- [ ] **AC-PM-22**: Joystick direction recognition feels natural — 8-direction mapping maps correctly to player intention. *(OQ-PM-1 resolved — confirmed natural in prototypes/grid-core v4)*
- [ ] **AC-PM-23**: Buffer 1-slot limit feels right — rapid swipes feel responsive; no "input queue draining" sensation after fast inputs. *(Playtest: ≥4/5 find it responsive)*
- [ ] **AC-PM-24**: Boundary bump feedback is readable — V-6 10%-offset bump communicates "can't go that way" clearly. *(Playtest: ≥4/5 identify bump as movement-blocked feedback)*
- [ ] **V-1 spec**: Local player renders as 60%-cell square, 3px chamfer, `#FFFFFF` 2px outline, `#00E5CC` direction triangle (35% cell size). 1 `cc.Graphics` draw call. Transparent fill ("darkness is safe" visual rule).
- [ ] **V-5 spec**: Death animation 4 phases in 0.6s — (1) 0–0.05s `#FFFFFF` flash at 120% scale; (2) 0.05–0.25s 4-arc radial split, opacity 100%→0%; (3) 0.25–0.50s `#00E5CC` sine ripple (1.5× cell radius) → fade; (4) 0.50–0.60s 20% opacity grey silhouette (spectator state).

---

## Implementation Notes

*V-1 through V-6 specs from GDD Visual/Audio Requirements section:*

```typescript
// Player render (V-1) — called each frame in update:
drawPlayer(ctx: cc.Graphics, coord: CellCoord, visualPos: Vec2, lastDir: Direction8): void {
  ctx.clear();
  const size = CELL_SIZE * 0.6;
  // Outline (2px white)
  ctx.strokeColor = new cc.Color(255, 255, 255);
  ctx.lineWidth = 2;
  ctx.roundRect(visualPos.x - size/2, visualPos.y - size/2, size, size, 3);
  ctx.stroke();
  // Direction triangle (cyan, 35% cell size)
  const tri = buildDirectionTriangle(visualPos, lastDir, CELL_SIZE * 0.35);
  ctx.fillColor = new cc.Color(0x00, 0xE5, 0xCC);
  ctx.moveTo(tri[0].x, tri[0].y);
  ctx.lineTo(tri[1].x, tri[1].y);
  ctx.lineTo(tri[2].x, tri[2].y);
  ctx.close();
  ctx.fill();
}

// V-2: triangle direction snaps at t=0 of tween (set lastDir before lerp starts)
// V-3: remote player at 60% opacity, no triangle, #606060 color
// V-4: arrival VFX — #FFFFFF circle expand, opacity 30%→0%, 0.08s
// V-5: death animation phases — implement as state machine with elapsed timer
// V-6: boundary bump — visualOffset += direction * CELL_SIZE * 0.1; lerp back in 50ms

// Death animation state (V-5):
type DeathPhase = 'FLASH' | 'SPLIT' | 'RIPPLE' | 'SPECTATOR' | 'NONE';
```

- Direction triangle does NOT interpolate between directions — snaps at `t=0` of each move.
- Death animation persists through round end (spectator grey silhouette remains for the rest of the round).
- Boundary bump is purely visual — `logicalCoord` never changes during the bump animation.
- Remote player overlap (2+ on same cell): 4px render offset per player (render-layer responsibility).

---

## Out of Scope

*Handled by neighbouring stories — do not implement here:*

- **Stories 001–004**: All logic, buffering, death events, server messages
- **HUD Epic**: Kill feed, spectator camera, round timer
- **AudioManager Epic**: Movement click sound (A-1), death sound (A-2), boundary sound (A-3)

---

## QA Test Cases

*Visual/Feel story — manual verification + real-device playtest required.*

- **AC-PM-21**: Movement feel (real device)
  - Setup: 5 playtest participants on target device (Toss 인토스 webview); each plays 10 rounds of movement-only test scene
  - Verify: Participants asked "Does movement feel instant or delayed?" after session
  - Pass condition: ≥4/5 report "feels instant" or "no noticeable delay"; screen-record at 60fps to verify visual snap within 1 frame of input

- **AC-PM-22**: Direction recognition (real device)
  - Setup: Same 5 participants; shown directional prompts; must move in indicated direction; record accuracy
  - Verify: Error rate per direction, especially diagonal (NE, SE, SW, NW)
  - Pass condition: ≥4/5 achieve >90% directional accuracy; no single direction causes >2 consistent errors

- **AC-PM-23**: Buffer 1-slot feel
  - Setup: Participants perform rapid 3-swipe sequences; observe whether "old" inputs visibly drain
  - Verify: After 3 quick swipes, only 1 additional buffered move executes (not 2)
  - Pass condition: ≥4/5 report no "input lag queue" sensation; developer confirms via EventBus log that max 1 buffered move follows each tween

- **AC-PM-24**: Boundary bump readability
  - Setup: Player at grid edge; attempt out-of-bounds swipes; observe bump VFX
  - Verify: Participants asked "What did the animation communicate?" — correct answer: movement blocked
  - Pass condition: ≥4/5 identify bump as "can't go there" signal without being told

- **V-1 spec**: Draw call count
  - Setup: Enable Cocos profiler; launch scene with 6 local players rendering
  - Verify: Player layer draw call delta = 1 per player (6 players = 6 additional draw calls vs. 0 players)
  - Pass condition: Each player = 1 draw call; screenshot captured for evidence

- **V-5 spec**: Death animation phases
  - Setup: Record player death at 60fps; mark frame boundaries for each phase
  - Verify: Phase 1 (0–0.05s): white flash visible, scale > 100%; Phase 2 (0.05–0.25s): 4 radial fragments visible, opacity declining; Phase 3 (0.25–0.50s): cyan ripple expands and fades; Phase 4 (0.50–0.60s): grey silhouette at ~20% opacity
  - Pass condition: All 4 phases complete within 0.6s ±1 frame; art-lead sign-off on video frame capture

---

## Test Evidence

**Story Type**: Visual/Feel
**Required evidence**: `production/qa/evidence/playermovement-visual-evidence.md` — real device recordings, playtest session notes (5 participants), draw call profiler screenshots, V-5 death animation frame analysis, designer + art-lead sign-off

**Status**: [ ] Not yet created

---

## Dependencies

- Depends on: Story 003 must be DONE (death events required for V-5 animation); Story 004 must be DONE (remote player rendering requires remote coord updates)
- Unlocks: None — this is the final PlayerMovement story
