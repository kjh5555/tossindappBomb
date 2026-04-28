# UX Specification: Pause Overlay

> **Status**: Approved (v1 — Sprint 6)
> **Author**: 김재현 + agents
> **Last Updated**: 2026-04-28
> **Screen Name**: `PauseOverlay` — overlaid on `HUDScreen` (z:30 modal, parallel to ResultOverlay)
> **Platform Target**: 모바일 (Toss 인토스 webview) — 터치 전용
> **Related GDDs**: `design/gdd/round-manager.md` (라운드는 진행 중에만 일시정지 가능)
> **Related ADRs**: ADR-0016 (HUD z-order), ADR-0011 (Round Phase FSM), ADR-0002 (FrameClock — tick 호출 차단으로 일시정지)
> **Related UX Specs**: `design/ux/hud.md` (parent), `design/ux/result.md` (sibling), `design/ux/settings.md` (child), `design/ux/interaction-patterns.md`
> **Accessibility Tier**: Standard (Tier 2)

---

## 1. Purpose & Player Need

**플레이어 needs**: 모바일 webview에서 게임 도중 토스 알림이 와도, 가족이 부르더라도, 또는 화면이 너무 긴장돼서 잠시 쉬고 싶을 때 — 게임을 일시정지하고 싶다. 정지 중에는 라운드 타이머도 멈추고, 폭발 패턴도 멈춘 상태에서 안전하게 휴식할 수 있어야 한다.

**Player goal**: 1탭으로 일시정지하고, 1탭으로 재개한다.

**Game goal**: PauseController.pause() 호출 시 FrameClock.tick() 호출이 중단되고, GridSimulation/RoundManager/PlayerMovement의 모든 시간 기반 진행이 멈춘다.

---

## 2. Player Context on Arrival

| 질문 | 답변 |
|------|------|
| 직전 행동 | 인-게임 진행 중 Pause 버튼 탭 |
| 정서 상태 | 인터럽션 — 외부 요인(알림, 호출 등)으로 잠시 멈춰야 함 |
| 인지 부하 | 중간 — 직전까지 폭발 패턴 추적 중 |
| 보유 정보 | 자기 위치, 골 위치, 직전 패턴 |
| 기대 행동 | Resume 탭 → 즉시 게임 재개. 또는 Settings 진입. 또는 Restart. |

**감정 디자인 타깃**: 차분한 일시정지. **폭발 위험이 멈췄다는 시각적 안도감**을 제공해야 한다 — 정지 중인데 셀이 계속 깜빡이면 일시정지 신뢰가 깨진다.

---

## 3. Navigation Position

```
HUDScreen (in-match, MATCH state)
  └── PauseOverlay (THIS — modal, z:30, dims grid 60% — less than ResultOverlay's 80%)
        ├── Resume → back to HUDScreen
        ├── Settings → SettingsScreen (child, see settings.md)
        └── Restart → confirm dialog → SessionFlow.reset() → LobbyScreen
```

**Modal**: Modal — HUD 입력 차단. ResultOverlay와 다른 점: ResultOverlay는 라운드 종료 후 표시, PauseOverlay는 라운드 진행 중 사용자 의지로 표시.

---

## 4. Entry & Exit

**Entry**:
| Trigger | Source | Transition | Notes |
|---------|--------|-----------|-------|
| Tap Pause button (HUD) | HUDScreen | Slide-down 200ms ease-out | PauseController.pause() 호출 → FrameClock.tick 차단 |
| Toss webview background → foreground 전환 (선택) | cc.Game.EVENT_HIDE | 즉시 표시 | ADR-0016 § 4 — auto-pause 정책 (v1: optional) |

**Exit**:
| Action | Destination | Transition | Notes |
|--------|------------|-----------|-------|
| Tap Resume | HUDScreen | Slide-up 200ms | PauseController.resume() → tick 재개 |
| Tap Settings | SettingsScreen | Push (slide-from-right 250ms) | Pause 상태 유지 |
| Tap Restart → Confirm | LobbyScreen | Cross-fade 200ms | sessionFlow.reset() + pauseController.resume() |
| Tap Restart → Cancel | (return to PauseOverlay) | Confirm dialog 사라짐 | 변화 없음 |

---

## 5. Layout

```
┌──────────────────────────────────────┐
│   ░░░░░░ SAFE AREA TOP ░░░░░░░       │
├──────────────────────────────────────┤
│                                      │
│       (HUD + Grid 어두워짐 60%)         │
│                                      │
│   ╔══════════════════════════════╗   │
│   ║                              ║   │
│   ║         P A U S E D          ║   │   ← Hero Label 36pt
│   ║                              ║   │
│   ║   ┌──────────────────────┐   ║   │
│   ║   │      R E S U M E     │   ║   │   ← PrimaryButton
│   ║   └──────────────────────┘   ║   │
│   ║                              ║   │
│   ║         [Settings]           ║   │   ← SecondaryButton
│   ║                              ║   │
│   ║         [Restart]            ║   │   ← SecondaryButton (red tint)
│   ║                              ║   │
│   ╚══════════════════════════════╝   │
│                                      │
├──────────────────────────────────────┤
│   ░░░░░░ SAFE AREA BOTTOM ░░░░░░     │
└──────────────────────────────────────┘
```

### Component Inventory

| Component | Type | Purpose |
|-----------|------|---------|
| BackdropDim | Solid (Void Black @60%) | Grid 부분 가림 — ResultOverlay(80%)보다 약함, "복귀 가능" 시그널 |
| OverlayCard | Container | Pause 메뉴 컨테이너 |
| PausedLabel | Text 36pt White @100% | "PAUSED" 표시 |
| ResumeButton | PrimaryButton | 게임 재개 |
| SettingsButton | SecondaryButton | Settings 화면 진입 |
| RestartButton | SecondaryButton (red tint) | 게임 종료 → Lobby |
| ConfirmDialog (sub-overlay) | Modal | "Restart?" 확인 |

---

## 6. States

| State | Trigger | 시각 |
|-------|---------|------|
| Hidden | overlay 생성 직후 또는 Resume 후 | visible=false |
| Showing | Pause 탭 | dim 60%, slide-down |
| Confirming Restart | Restart 탭 | sub-overlay confirm dialog |
| Re-armed | Resume 후 | 다음 Pause 탭 대기 |

---

## 7. Interaction Map

| Input | Context | Action | Visual | Notes |
|-------|---------|--------|--------|-------|
| Tap Resume | Showing | pauseController.resume() → overlay hide | 슬라이드업 200ms | FrameClock tick 재개 |
| Tap Settings | Showing | SettingsScreen push | slide-from-right 250ms | Pause 상태 유지 |
| Tap Restart | Showing | Confirm dialog 표시 | dialog scale-in | 우발적 dismiss 방지 |
| Tap Confirm | Confirming Restart | sessionFlow.reset() + resume + Lobby 이동 | cross-fade 200ms | - |
| Tap Cancel | Confirming Restart | Confirm dialog 닫기 | dialog fade-out | Pause 유지 |
| Tap BackdropDim | Showing | no-op | none | 우발적 dismiss 방지 |

---

## 8. Data Requirements

| Data | Source | Notes |
|------|--------|-------|
| 일시정지 상태 | PauseController (자체) | boolean |
| 게임 진행 상태 | SessionFlow | MATCH 상태에서만 Pause 가능 |

---

## 9. Events Fired

| Player Action | Call/Event | Receiver |
|---------------|-----------|----------|
| Tap Pause (HUD) | `pauseController.pause()` | PauseController + bus emits `GAME_PAUSED` |
| Tap Resume | `pauseController.resume()` | bus emits `GAME_RESUMED` |
| Tap Restart → Confirm | `sessionFlow.reset()` | SessionFlow → MENU |
| Tap Settings | `(navigation event — Sprint 6+ UI router)` | - |

---

## 10. Transitions

| Transition | Direction | Duration | reduced-motion |
|-----------|----------|---------|---------------|
| Pause enter | Slide-down 50dp | 200ms ease-out | 즉시 표시 |
| Pause exit (Resume) | Slide-up 50dp | 200ms ease-in | 즉시 사라짐 |
| Backdrop dim | Opacity 0 → 60% | 200ms | 즉시 60% |
| Restart confirm dialog | Scale 95→100% | 150ms | 즉시 표시 |

---

## 11. Input Method Checklist (Touch only)

- [x] Resume button ≥ 64dp (interaction-patterns Critical button)
- [x] Settings/Restart buttons ≥ 48dp
- [x] BackdropDim tap → no-op (실수 dismiss 방지)
- [x] Restart 탭 → confirm dialog (1탭으로 게임 종료 방지)
- [x] 한 손 portrait 모드에서 모든 버튼 도달 가능

---

## 12. Accessibility

| Element | Background | Required | Notes |
|---------|------------|---------|-------|
| "PAUSED" | Void Black @60% backdrop | 4.5:1 | White @100% — 패스 |
| ResumeButton | Danger Cyan | 4.5:1 | Void Black 텍스트 — 패스 |
| Settings/Restart | transparent + outlined | 4.5:1 | White @60% on dim BG — 검증 |

**reduced-motion**:
- Slide-down/up 제거 → 즉시 표시
- Backdrop fade 제거 → 즉시 60%

**우발적 트리거 방지**: Restart 탭 → confirm dialog. BackdropDim tap → no-op.

---

## 14. Acceptance Criteria

- [ ] Pause 탭 → PauseController.paused = true; overlay visible
- [ ] FrameClock.tick() 호출 차단됨 (외부 통합 — Cocos cc.Component.update에서 paused 체크)
- [ ] Resume 탭 → paused = false; overlay hidden
- [ ] Restart 탭 → confirm dialog 표시; Confirm 시 sessionFlow.reset()
- [ ] BackdropDim 탭 → no-op
- [ ] Settings 진입 시 Pause 상태 유지
- [ ] reduced-motion 시 즉시 표시
- [ ] dispose() 시 모든 구독 해제

---

## 15. Open Questions

| 질문 | Owner | Deadline |
|------|-------|---------|
| 자동 일시정지 (cc.Game.EVENT_HIDE) v1에 포함? | systems-designer | Sprint 6 device test |
| Pause 중 BGM 페이드 처리 | audio-director | Sprint 6 |
| Pause 후 Resume 시 카운트다운 보정 (서버 동기화) | network-programmer | Sprint 7 (멀티플레이어 동기화 일관성) |
