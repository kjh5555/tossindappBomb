# UX Specification: Settings

> **Status**: Approved (v1 — Sprint 6)
> **Author**: 김재현 + agents
> **Last Updated**: 2026-04-28
> **Screen Name**: `SettingsScreen` — child of PauseOverlay (Sprint 6) or LobbyScreen (Sprint 7+)
> **Platform Target**: 모바일 (Toss 인토스 webview) — 터치 전용
> **Related ADRs**: ADR-0016 (Audio 채널 볼륨), `design/accessibility-requirements.md` (reduced-motion)
> **Related UX Specs**: `design/ux/pause.md` (parent), `design/ux/interaction-patterns.md`
> **Accessibility Tier**: Standard (Tier 2)

---

## 1. Purpose & Player Need

**플레이어 needs**: 게임 시작 후 사운드가 너무 크거나 작을 때, 또는 시각적 모션이 거슬릴 때 — 설정을 직접 조정해서 자기에게 편한 환경으로 만들 수 있어야 한다.

**Player goal**: 1~2번의 탭으로 음량 조정, reduced-motion 토글.

**Game goal**: SettingsState를 유지하고, 변경 시 즉시 MultichannelAudioOutput 채널 볼륨에 반영, reduced-motion 플래그를 모든 모션 사용 컴포넌트에 전파.

---

## 2. Player Context on Arrival

| 질문 | 답변 |
|------|------|
| 직전 행동 | PauseOverlay에서 Settings 탭 |
| 정서 상태 | 차분 — 설정 검토/조정 중 |
| 인지 부하 | 낮음 — 단순 설정 화면 |
| 보유 정보 | 게임 인터페이스에 익숙 |

---

## 3. Navigation Position

```
HUDScreen (paused)
  └── PauseOverlay
        └── SettingsScreen (THIS — push, modal-like)
              └── back to PauseOverlay via Back/X button
```

---

## 4. Entry & Exit

| Entry | From | Transition |
|-------|------|-----------|
| Tap Settings (PauseOverlay) | PauseOverlay | Slide-from-right 250ms |
| (Sprint 7+) Tap Settings (Lobby) | LobbyScreen | Cross-fade |

| Exit | Action | To |
|------|--------|-----|
| Tap X (top-left) | PauseOverlay (or Lobby) | Slide-to-right |
| Tap outside (BackdropDim) | no-op | - |

---

## 5. Layout

```
┌──────────────────────────────────────┐
│   ░░░░░░ SAFE AREA TOP ░░░░░░░       │
├──────────────────────────────────────┤
│  ┌────────────────────────────┐      │
│  │  [×]    SETTINGS           │      │  ← 헤더
│  ├────────────────────────────┤      │
│  │                            │      │
│  │   Volume                   │      │
│  │   ────────●────────  80%   │      │  ← Slider (BGM)
│  │   BGM                      │      │
│  │                            │      │
│  │   ────────────●────  90%   │      │  ← Slider (SFX)
│  │   SFX                      │      │
│  │                            │      │
│  │   ──────────────●──  95%   │      │  ← Slider (UI Feedback)
│  │   UI Feedback              │      │
│  │                            │      │
│  ├────────────────────────────┤      │
│  │                            │      │
│  │   Reduced Motion           │      │
│  │   [ OFF ●─── ]             │      │  ← Toggle switch
│  │                            │      │
│  └────────────────────────────┘      │
│                                      │
├──────────────────────────────────────┤
│   ░░░░░░ SAFE AREA BOTTOM ░░░░░░     │
└──────────────────────────────────────┘
```

### Component Inventory

| Component | Type | Purpose |
|-----------|------|---------|
| HeaderClose | IconButton (×) | 닫기 |
| HeaderTitle | Text 24pt | "SETTINGS" |
| VolumeSlider × 3 | Slider 0-100% | 채널별 볼륨 (BGM/SFX/UIFeedback) |
| ReducedMotionToggle | Toggle switch | 모션 감소 ON/OFF |
| BackdropDim | Solid (Void Black @50%) | 배경 dim |

**Slider 터치 영역**: 슬라이더 자체는 가는 트랙이지만, **터치 hit-area는 64dp 높이** (실수 방지).

---

## 6. States

| State | Trigger | 시각 |
|-------|---------|------|
| Initial | 진입 시 | 현재 SettingsState 값 반영 |
| Slider Dragging | 슬라이더 터치 + 드래그 | 슬라이더 핸들 강조, 우측에 % 라벨 |
| Toggle Animating | 토글 탭 | 200ms ease-out (또는 reduced-motion 시 즉시) |

---

## 7. Interaction Map (Touch)

| Input | Action | Visual | 응답 |
|-------|--------|--------|------|
| Tap Close (×) | 화면 닫기 → PauseOverlay 복귀 | 슬라이드 우측 200ms | - |
| Drag Slider | 채널 볼륨 조정 (실시간) | 핸들 이동 + % 갱신 | 즉시 setChannelVolume(name, v) 호출 |
| Tap Toggle | reduced-motion ON/OFF | 토글 슬라이드 200ms | 즉시 SettingsState.reducedMotion 갱신 |
| Tap BackdropDim | no-op | none | 의도치 않은 dismiss 방지 |

**즉시 반영**: 모든 변경은 즉시 적용 (Save 버튼 없음). 사용자가 드래그하는 동안 BGM 볼륨이 실시간으로 변하므로 검증이 즉각적이다.

---

## 8. Data Requirements

| Data | Source | Persistence |
|------|--------|------------|
| BGM/SFX/UI 볼륨 | SettingsState | localStorage (Sprint 7+) — v1: in-memory |
| reducedMotion 플래그 | SettingsState | 동일 |

---

## 9. Events / Calls

| Player Action | Call | Receiver |
|---------------|------|----------|
| Slider drag | `audioOutput.setChannelVolume(name, value/100)` | MultichannelAudioOutput |
| Toggle tap | `settings.setReducedMotion(value)` | SettingsState |
| (모든 변경 시) | bus.emit('SETTINGS_CHANGED', { ... }) | listeners (HUD, GridLayer 등 — reduced-motion 적용 시) |

---

## 12. Accessibility

- Sliders: 텍스트 라벨 + 현재 % 값 표시 (시각 단독 정보 금지)
- Toggle: ON/OFF 텍스트 라벨 항상 표시 (색상 단독 금지)
- 명암비 ≥ 4.5:1
- reduced-motion 적용 시 토글 자체의 슬라이드 애니메이션도 제거 (메타: 토글이 reduced-motion 상태를 본인에게도 적용)

---

## 14. Acceptance Criteria

- [ ] 진입 시 현재 SettingsState 값 반영
- [ ] Slider drag → audioOutput.setChannelVolume() 즉시 호출
- [ ] Toggle tap → SettingsState.reducedMotion 즉시 갱신 + SETTINGS_CHANGED emit
- [ ] Close (×) → PauseOverlay 복귀
- [ ] Volume 0~100 사이 클램프 (interaction-patterns volume 표준 따름)

---

## 15. Open Questions

| 질문 | Deadline |
|------|---------|
| Settings persistence — localStorage vs Toss SDK preferences API | Sprint 7 |
| 추가 항목 — 언어 선택, 컬러블라인드 모드, 화면 크기 | post-v1 |
| 토스 시스템 설정과의 동기화 (예: 시스템 사일런트 모드) | Sprint 7+ |
