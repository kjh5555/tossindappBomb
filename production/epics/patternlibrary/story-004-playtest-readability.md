# Story 004: Playtest — Pattern Readability + Difficulty Gradient

> **Epic**: PatternLibrary
> **Status**: Ready
> **Layer**: Core
> **Type**: Visual/Feel
> **Manifest Version**: 2026-04-22

## Context

**GDD**: `design/gdd/pattern-library.md`
**Requirements**: `TR-patternlibrary-002` (difficulty tier distribution shapes this criteria)
*(Requirement text lives in `docs/architecture/tr-registry.yaml` — read fresh at review time)*

**ADR Governing Implementation**: ADR-0007: Pattern Library Schema + Loading
**ADR Decision Summary**: Pattern data is authored with `tier: 1|2|3` and `category` to enforce a difficulty gradient. No ADR governs the subjective readability criterion — this is a design judgment verified through playtest.

**Engine**: Cocos Creator 3.8.6 (TypeScript) | **Risk**: LOW
**Engine Notes**: No engine API involved. Readability depends on pattern data content, not code.

**Control Manifest Rules (Core layer)**:
- No automated test required for Visual/Feel stories — manual playtest evidence with sign-off

---

## Acceptance Criteria

*From GDD `design/gdd/pattern-library.md`, scoped to this story:*

- [ ] **AC-PL-12**: "읽으면 이긴다" (Read to win) readability — a first-time player can identify the safe direction within `T_warn=1.8s` of the pattern appearing. Playtest: 5 participants, 4 of 5 pass.
- [ ] **AC-PL-13**: Difficulty gradient felt — Tier 1 → Tier 3 is perceived as progressively harder. Playtest: post-session survey shows ≥4/5 participants rate Tier 3 harder than Tier 1.

---

## Implementation Notes

*No code changes required for this story — the implementation is in PatternData.ts (Story 001).*

Pattern readability depends on:
- Safe cells forming an obvious corridor or region (LINE/CROSS patterns tend to be clearest)
- Pattern density: Tier 1 should have fewer gate cells (~20-30), Tier 3 more (~40-50)
- Symmetry: symmetrical patterns are easier to read quickly

If playtest reveals readability failures:
- Revise affected `PatternData.ts` entries (category, cell layout, or tier assignment)
- Re-run story 001's unit tests after any `PatternData.ts` edit
- No architectural change required — data change only

---

## Out of Scope

*Handled by neighbouring stories — do not implement here:*

- **Story 001**: Authoring pattern data (cells, tier, category assignments)
- **Stories 002/003**: Selection and validation logic
- **GridExplosion Story 005**: Cell rendering (visual presentation of patterns)

---

## QA Test Cases

*Visual/Feel story — playtest sessions required. Evidence must be captured before `/story-done`.*

- **AC-PL-12**: Readability — "읽으면 이긴다"
  - Setup: 5 playtest participants unfamiliar with the game; show each of the 20 patterns one at a time on a real device; measure time from pattern display to participant indicating their safe direction choice
  - Verify: For each pattern, record decision time; note which patterns caused hesitation or wrong choices
  - Pass condition: ≥4/5 participants correctly identify safe direction within 1.8s for every Tier 1 and Tier 2 pattern; Tier 3 patterns may have 3/5 passing (they are intentionally harder)
  - Note: OQ-PL-1 (DifficultyContext tier assignment) must be resolved before this test is meaningful

- **AC-PL-13**: Difficulty gradient
  - Setup: Same 5 participants complete 3 rounds of Tier 1, 3 rounds of Tier 2, 3 rounds of Tier 3 patterns; post-session survey with question "Which tier felt hardest?"
  - Verify: Survey responses and observer notes on hesitation frequency per tier
  - Pass condition: ≥4/5 participants identify Tier 3 as hardest; Tier 2 rated harder than Tier 1 by ≥3/5; no Tier 1 pattern rated as "too hard to read" by >1 participant

---

## Test Evidence

**Story Type**: Visual/Feel
**Required evidence**: `production/qa/evidence/patternlibrary-playtest-evidence.md` — playtest session notes, timing data per pattern, survey results, designer sign-off

**Status**: [ ] Not yet created

---

## Dependencies

- Depends on: Story 003 must be DONE (full pipeline live for realistic playtest conditions); GridExplosion Story 005 must be DONE (rendering must be correct for readable patterns)
- Unlocks: None — this is the final PatternLibrary story
