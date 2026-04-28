# Grid Core Prototype

**Questions being tested:**
1. Is T_warn=1.8s (W1=1.0s + W2=0.6s + Im=0.2s) readable? Does "읽으면 이긴다" hold?
2. 8-direction swipe recognition rate ≥85%? (OQ-PM-1)
3. Does MOVE_TWEEN_DURATION=0.1s feel instant? (OQ-PM-3)
4. Is the core loop fun enough to keep playing?

---

## Setup (Cocos Creator 3.8.6)

1. Open or create a new 2D project in Cocos Creator 3.8.6
2. Copy `GridCore.ts` into the project's `assets/` folder
3. Create a new Scene
4. In the Scene, select the **Canvas** node (or create a new empty Node child of Canvas)
5. In the **Inspector**, click **Add Component → Custom Script → GridCore**
6. Make sure the node has **UITransform** (Canvas has it by default)
7. Click **Play** in the editor (or build for mobile browser)

**Mobile testing (recommended for OQ-PM-1 and OQ-PM-3):**
- Build → Web Mobile
- Serve the build folder (`npx serve dist/` or equivalent)
- Open on the target device in the Toss inToss webview or Chrome mobile

---

## Controls

| Action | Input |
|--------|-------|
| Move player | Swipe in any of 8 directions |
| Restart after death | Tap anywhere |

---

## What to observe

### Q1 — T_warn=1.8s readability
- Does the yellow (W1=1.0s) → orange (W2=0.6s) → red (Im=0.2s) progression feel like enough time?
- Can you read the pattern AND move to safety in 1.8s?
- Does it feel like you died because you *didn't read* it, or because there wasn't *enough time*?

Record: "Felt fair / Too fast / Too slow" after 10 deaths.

### Q2 — Swipe recognition (OQ-PM-1)
Perform 20 intentional swipes and count:
- How many went in the intended direction?
- Which directions have the most misrecognitions (diagonal vs. straight)?
- **Pass threshold: ≥85% correct (17/20)**

If fail: try adjusting `MIN_SWIPE` (currently 20px) upward (30–40px).

### Q3 — Tween feel (OQ-PM-3)
- Does 0.1s movement feel instant or sluggish?
- To test faster: change `TWEEN = 0.05`
- To test slower: change `TWEEN = 0.15`

### Q4 — Core loop fun
- Do you want to keep playing after dying?
- Does "one more try" happen naturally?
- Rate: Yes / No / Uncertain

---

## Tuning during test

All tuning constants are at the top of `GridCore.ts`:

| Constant | Current | What to change |
|----------|---------|----------------|
| `T_W1` | 1.0s | Increase if W1 feels too short |
| `T_W2` | 0.6s | Increase if W2→EX transition feels too fast |
| `T_IM` | 0.2s | Last-moment escape window |
| `TWEEN` | 0.1s | Movement animation duration |
| `MIN_SWIPE` | 20px | Increase to reduce micro-swipe false positives |
| `SPAWN_INTERVAL` | 3.0s | Decrease to increase difficulty |

---

## Prototype boundaries

This prototype intentionally omits:
- Audio
- Multiplayer
- Round escalation (all patterns run at same interval)
- Visual polish (death animation, arrival VFX, boundary bump)
- Death counter display (count deaths manually)

These are answered by GDD design, not this prototype. The only questions here are timing, feel, and core fun.
