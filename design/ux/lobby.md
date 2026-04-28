# UX Specification: Lobby (Main Menu)

> **Status**: Approved (v1)
> **Author**: 김재현 + agents
> **Last Updated**: 2026-04-27
> **Screen Name**: `LobbyScreen`
> **Platform Target**: 모바일 (Toss 인토스 webview) — 터치 전용
> **Related GDDs**: `design/gdd/round-manager.md`, `design/gdd/game-concept.md`
> **Related ADRs**: ADR-0016 (HUD Safe Area), ADR-0011 (Round Phase FSM), story-003-session-flow-stub
> **Related UX Specs**: `design/ux/hud.md` (다음 화면), `design/ux/result.md` (재진입 경로), `design/ux/interaction-patterns.md` (공통 패턴)
> **Accessibility Tier**: Standard (Tier 2 per `design/accessibility-requirements.md`)

---

## 1. Purpose & Player Need

**플레이어 needs**: GRID REAPER에 처음 접속한 또는 재시작하는 플레이어가 "이 게임을 어떻게 시작하는지"를 1초 안에 이해하고, 추가 학습 없이 게임을 시작할 수 있어야 한다. 토스 webview 안에서 가벼운 마음으로 들어온 플레이어가 길을 잃지 않도록.

**Player goal**: 한 번의 탭으로 라운드를 시작한다.

**Game goal**: SessionFlow를 MENU → MATCH로 전환하고, RoundManager.startRound(1) 호출 신호를 발행한다.

---

## 2. Player Context on Arrival

| 질문 | 답변 |
|------|------|
| 직전 행동 | 토스 앱에서 GRID REAPER 진입, 또는 Result 화면에서 Restart |
| 정서 상태 | 신규: 호기심 / 재진입: 살짝 긴장 (직전 게임 결과 자존심) |
| 인지 부하 | 낮음 — 토스 앱에서 자유롭게 들어옴 |
| 보유 정보 | 신규: 거의 없음 (게임 이름과 아이콘만). 재진입: 직전 라운드 결과 |
| 기대 행동 | "Start" 버튼 탭 |

**감정 디자인 타깃**: 차분하고 명료. 광고 없는 시안 화면 — "조용한 도전이 기다린다."

---

## 3. Navigation Position

```
[Toss App Entry]
  └── LobbyScreen (THIS)
        └── HUDScreen (in-match)
              └── ResultOverlay (overlaid on HUD when GAME_OVER / ROUND_CLEAR)
                    └── back to LobbyScreen via Restart
```

**Modal behavior**: 비-모달 (전체 화면). SessionFlow.state === 'MENU'일 때만 표시.

**Reachability**:
| Entry | Trigger | Notes |
|-------|---------|-------|
| Toss app initial entry | TossBridge.init() 완료 후 | 1차 진입점 |
| ResultOverlay → Restart | `sessionFlow.reset()` 호출 후 | 재진입 |

---

## 4. Entry & Exit

**Entry**:
| Trigger | Source | Transition | Data | Notes |
|---------|--------|-----------|------|-------|
| 게임 부팅 완료 | App init | Fade in 200ms | none | safeArea 적용 후 |
| Restart 버튼 | ResultOverlay | Cross-fade 200ms | none | SessionFlow MENU |

**Exit**:
| Action | Destination | Transition | Data |
|--------|------------|-----------|------|
| Start 버튼 탭 | HUDScreen | Fade out 200ms | none — 새 라운드는 R=1 |
| 토스 webview 종료 | (process exit) | none | none |

---

## 5. Layout

### 5.1 Wireframe (세로 모드, 화면 360×800dp 기준)

```
┌──────────────────────────────────────┐
│   ░░░░░░░░░░ SAFE AREA TOP ░░░░░░░░░  │  ← 44dp
├──────────────────────────────────────┤
│                                      │
│                                      │
│         G R I D                      │
│                                      │  ← 게임 타이틀 (Hero)
│         R E A P E R                  │
│                                      │
│       ─ ─ ─ ─ ─ ─                    │  ← Grid Slate 구분선
│                                      │
│    "한 번의 탭, 한 번의 결단"             │  ← Tagline (White @60%)
│                                      │
│                                      │
│    ┌────────────────────────┐        │
│    │       S T A R T        │        │  ← PrimaryButton 64dp 높이
│    └────────────────────────┘        │
│                                      │
│           [Settings]                 │  ← SecondaryButton (옵션)
│                                      │
│                                      │
│                                      │
├──────────────────────────────────────┤
│   ░░░░░░░░ SAFE AREA BOTTOM ░░░░░░░  │  ← 34dp (homebar)
└──────────────────────────────────────┘
```

### 5.2 Zone Definitions

| Zone | 설명 | 비율 |
|------|------|------|
| Title Zone | "GRID REAPER" 로고 텍스트 | 화면 상단 35% |
| Tagline Zone | 게임 한 줄 설명 | 5% |
| Action Zone | Start + Settings 버튼 | 25% |
| Footer Zone | 빈 영역 (잠재적 버전 표시) | 5% |

### 5.3 Component Inventory

| Component | Type | Purpose | Reuses? |
|-----------|------|---------|---------|
| Title Label | Text (Display) | "GRID REAPER" 표시 | - |
| Tagline Label | Text (Body) | 한 줄 설명 | InformationLabel (interaction-patterns § 3.3) |
| Start Button | PrimaryButton | 라운드 시작 트리거 | PrimaryButton (interaction-patterns § 3.1) |
| Settings Button | SecondaryButton | (Sprint 6+) 설정 화면 진입 | SecondaryButton (interaction-patterns § 3.2) |
| Background | Solid color | Void Black 배경 | - |

**Primary focus on open**: Start 버튼 (모바일 webview에는 시각적 focus ring은 없으나 시각 무게는 Start에 집중).

---

## 6. States

| State | Trigger | 시각 변화 | 행동 변화 |
|-------|---------|---------|---------|
| Initial | 게임 부팅 직후 | Title fade-in 400ms, Start 버튼 200ms 지연 후 | Start 버튼 활성 |
| Returning | Restart 후 진입 | 즉시 표시 (전환은 ResultOverlay에서 처리) | 동일 |
| Disabled (Loading) | TossBridge.init() 미완료 | Start 버튼 회색 + 스피너 | 입력 무시 |
| Audio Muted (선택) | Settings에서 음소거 | Mute 아이콘 표시 | 차후 Sprint |

---

## 7. Interaction Map

### 7.1 Touch Inputs

| 입력 | Context | Action | Visual | Audio | Notes |
|------|---------|--------|--------|-------|-------|
| Tap Start | Initial / Returning | `sessionFlow.startMatch()` 호출 → Lobby 페이드아웃 → HUD 진입 | 버튼 scale 95→100% | `ui_click_primary` | 입력 무시 시간: 페이드아웃 동안 |
| Tap Settings (v1: 비활성) | always | no-op | 회색 처리 유지 | none | Sprint 6에서 활성화 |
| Tap 빈 영역 | always | no-op | none | none | 우발적 탭 무시 |

### 7.2 State-Specific

| State | Restriction | 이유 |
|-------|-----------|------|
| Disabled | Start 비활성 | TossBridge.init() 대기 |

---

## 8. Data Requirements

| Data | Source | Update | Format | Missing 처리 |
|------|--------|--------|--------|------------|
| 게임 버전 | (build constant) | 빌드 시점 | string | 누락 시 미표시 |
| 마지막 최고 라운드 | (Sprint 6+) localStorage | 게임 종료 시 | int | 누락 시 미표시 |

화면은 어떤 system에도 직접 쓰지 않는다. 모든 상태 변경은 § 9의 이벤트 발행만으로 일어난다.

---

## 9. Events Fired

| Player Action | Event | Payload | Receiver |
|---------------|-------|---------|----------|
| Tap Start | `sessionFlow.startMatch()` 메서드 호출 | none | SessionFlow |
| Tap Start (이후) | (HUD 측에서) RoundManager.startRound(1) | EscalationContext R=1 | RoundManager |

---

## 10. Transitions

| Transition | Direction | Duration | Easing | reduced-motion |
|-----------|----------|---------|--------|---------------|
| Lobby enter | Fade in | 200ms | Linear | 즉시 표시 |
| Title fade-in | Opacity 0→100% | 400ms | Ease out | 즉시 표시 |
| Start fade-in | Opacity 0→100%, 200ms 지연 | 200ms | Ease out | 즉시 표시 |
| Lobby exit (Start) | Fade out | 200ms | Linear | 즉시 사라짐 |

---

## 11. Input Method Checklist

**Touch (only target platform)**:
- [x] 모든 터치 타깃 ≥ 48dp (Start 버튼 64dp)
- [x] Start와 Settings 사이 ≥ 8dp 간격
- [x] 시스템 swipe 제스처와 충돌 없음 (단순 tap만 사용)
- [x] 한 손 portrait 모드에서 모든 액션 도달 가능 (Start은 화면 중하단 thumb-zone)
- [x] Long-press 미사용

**Keyboard / Gamepad / Mouse**: N/A — 모바일 webview 전용.

---

## 12. Accessibility (Tier 2)

**텍스트 명암비**:
| Element | Background | Required | Notes |
|---------|------------|---------|-------|
| Title "GRID REAPER" | Void Black `#1A1A2E` | 4.5:1 | Player White `#FFFFFF` @100% — 패스 |
| Tagline | Void Black | 4.5:1 | Player White @60% (`#999999` 효과) — 검증 필요 in 구현 |
| Start label "START" | Danger Cyan `#00E5CC` | 4.5:1 | Void Black 텍스트 — 패스 (cyan 충분히 밝음) |

**색상 단독 정보 금지**: Start 버튼은 색상 + 큰 텍스트 라벨로 식별 가능 (색맹 시 텍스트 readable).

**reduced-motion**:
- Title fade-in 제거 → 즉시 표시
- Start fade-in 제거 → 즉시 표시
- Lobby fade-in/out 제거 → 즉시 cross-cut

**스크린 리더**: v1 범위 외 (Tier 3에서 추가).

---

## 13. Localization

세로 모드 모바일에서 텍스트 expansion이 가장 위험한 영역.

| Element | EN baseline | Max chars | RTL | Overflow |
|---------|-------------|-----------|-----|---------|
| Title "GRID REAPER" | 11 | 14 | mirror — 단, 대칭 텍스트 디자인 권장 | shrink to 90% font |
| Tagline | ~20 chars | 30 | right-align | wrap to 2 lines max |
| Start label "START" | 5 | 14 | mirror | shrink font 90% min |
| Settings label | 8 | 14 | mirror | shrink font 90% min |

---

## 14. Acceptance Criteria

**Performance**
- [ ] Lobby 첫 프레임 표시 ≤ 200ms (Toss webview cold start 제외)
- [ ] Start 탭 응답 ≤ 100ms (HUD 페이드 시작까지)
- [ ] Lobby 화면 유지 시 60fps 유지 (정적 화면이므로 자명)

**Layout**
- [ ] 320dp 폭 (iPhone SE)에서 정상 표시 — Start 버튼 잘림 없음
- [ ] 430dp 폭 (iPhone Pro Max)에서 정상 표시 — Title 중앙 정렬 유지
- [ ] safeArea top/bottom 인셋 적용됨 (노치/홈바 침범 없음)

**Input**
- [ ] Tap Start → SessionFlow.state === 'MATCH'
- [ ] Tap Start 후 Lobby 비활성화 (재 탭 무시)
- [ ] Tap 빈 영역 → no-op (회의적 cooldown 제스처 등 미발동)

**Events**
- [ ] Start 시 sessionFlow.startMatch() 정확히 1회 호출
- [ ] 직접 RoundManager 호출 없음 (Lobby은 RoundManager에 의존하지 않음)

**Accessibility**
- [ ] 모든 텍스트 명암비 ≥ 4.5:1 (구현에서 verify)
- [ ] reduced-motion에서 즉시 표시
- [ ] 모든 버튼 ≥ 48dp

**Localization**
- [ ] EN/KO/JA에서 Title 잘림 없음
- [ ] 모든 텍스트 localization key 사용 (하드코딩 금지)

---

## 15. Open Questions

| 질문 | Owner | Deadline |
|------|-------|---------|
| Tagline 최종 카피 | 김재현 | Sprint 6 |
| Settings 버튼 v1에서 노출할지 (비활성화로 유지 vs. 숨김) | 김재현 | Sprint 6 |
| 마지막 최고 라운드 표시 (재진입 시) | systems-designer | Sprint 6 |
| 광고/sponsorship 슬롯 | (legal/biz) | post-v1 |
