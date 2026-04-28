# UX Specification: HUD (In-Game)

> **Status**: Approved (v1)
> **Author**: 김재현 + agents
> **Last Updated**: 2026-04-27
> **Screen Name**: `HUDScreen` — comprises `HUDLayer` (z:30) + `GridLayer` (z:10)
> **Platform Target**: 모바일 (Toss 인토스 webview) — 터치 전용
> **Related GDDs**: `design/gdd/round-manager.md`, `design/gdd/grid-explosion.md`, `design/gdd/player-movement.md`
> **Related ADRs**: ADR-0016 (HUD Safe Area), ADR-0011 (Round Phase FSM), ADR-0013 (Survival Cycle-Revive), ADR-0006 (Gate Period)
> **Related UX Specs**: `design/ux/lobby.md` (entry), `design/ux/result.md` (exit), `design/ux/interaction-patterns.md`
> **Accessibility Tier**: Standard (Tier 2)

> **Note**: HUD is an in-game overlay, not a discrete screen. Pause/Settings overlays are deferred to Sprint 6. This spec covers persistent in-match UI.

---

## 1. Purpose & Player Need

**플레이어 needs**: 라운드가 진행되는 동안 (1) "지금 몇 라운드인지", (2) "얼마나 시간이 남았는지", (3) "어디로 가야 안전한지(골 셀)", (4) "현재 그리드 상태(폭발 예고)"를 **주변시(peripheral vision)만으로** 인식할 수 있어야 한다 — 핵심 게임플레이는 그리드 자체이므로 HUD는 절대 시야를 점유해서는 안 된다.

**Player goal**: 그리드를 응시하면서 위험과 골 셀을 동시에 추적한다.

**Game goal**: RoundManager 상태와 GridSimulation 셀 상태를 실시간 시각화하되, 인지 부하를 최소화한다.

---

## 2. Player Context on Arrival

| 질문 | 답변 |
|------|------|
| 직전 행동 | Lobby에서 Start 탭 |
| 정서 상태 | 첫 라운드: 호기심 / 라운드 5+: 긴장 |
| 인지 부하 | **매우 높음** — 64셀의 폭발 패턴 + 자기 위치 + 골 위치 동시 추적 |
| 보유 정보 | (신규) 게임 룰 미숙지 / (재진입) 직전 라운드 결과 |
| 기대 행동 | 즉시 그리드 응시 시작, 첫 이동 결정 |

**감정 디자인 타깃**: 차분한 집중. art-bible § 3.4 — UI는 4순위 후퇴 계층, 주변시로만 인식되어야 함. **HUD가 시선을 끌면 실패다.**

---

## 3. Navigation Position

```
LobbyScreen
  └── HUDScreen (THIS — overlaid on persistent game world)
        └── ResultOverlay (modal-like, z:30, dims grid 80%)
              └── back to LobbyScreen via Restart
```

**Modal**: HUD는 비-모달 — 게임이 그 아래에서 계속 진행. ResultOverlay는 HUD 위에 z:30 modal.

---

## 4. Entry & Exit

**Entry**: Lobby Start 탭 → cross-fade 200ms → HUD 표시 + RoundManager.startRound(1)
**Exit**: GAME_OVER 또는 ROUND_CLEAR 이벤트 → ResultOverlay 슬라이드업 → Restart → Lobby

---

## 5. Layout

### 5.1 Wireframe (세로 모드, 360×800dp 기준)

```
┌──────────────────────────────────────┐
│   ░░░░░░░ SAFE AREA TOP ░░░░░░░       │  ← 44dp
├──────────────────────────────────────┤
│                                      │
│   Round 3            5 alive         │  ← Round# 좌상, Alive count 우상
│                                      │     (HUDLayer, White @100%)
│                          12.4s       │  ← Timer 우상
│                                      │     (White @60%, 작은 폰트)
│                                      │
├─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┤  ← Grid Slate divider
│                                      │
│   ┌───────────────────────────────┐  │
│   │ □ □ □ ▓ □ □ □ □              │  │  ← 8x8 grid (GridLayer)
│   │ □ ▓ □ □ □ □ ▓ □              │  │     □ = IDLE (Void Black)
│   │ □ □ □ □ ◉ □ □ □              │  │     ▓ = EXPLODED (Danger Cyan)
│   │ □ □ □ □ □ □ □ □              │  │     ◉ = Goal Cell (cyan pulsing border)
│   │ ▓ □ □ ★ □ □ □ □              │  │     ★ = Player position
│   │ □ □ □ □ □ □ □ ▓              │  │
│   │ □ □ ▓ □ □ □ □ □              │  │
│   │ □ □ □ □ □ □ □ □              │  │
│   └───────────────────────────────┘  │
│                                      │
│                                      │
│         ┌─────────────────┐          │  ← Joystick zone (PlayerMovement)
│         │       •         │          │     (Drag to move, Direction8)
│         └─────────────────┘          │
│                                      │
├──────────────────────────────────────┤
│   ░░░░░░ SAFE AREA BOTTOM ░░░░░░     │  ← 34dp
└──────────────────────────────────────┘
```

### 5.2 Zone Definitions

| Zone | 설명 | 비율 | 시각 계층 (art-bible § 3.4) |
|------|------|------|---------|
| HUD Top Strip | Round#, Alive Count, Timer | ~10% (40-60dp) | 4순위 후퇴 |
| Grid Zone | 8×8 폭발 셀 + 플레이어 + 골 셀 | ~60% (정사각형) | 1순위 (폭발) + 2순위 (플레이어) + 1순위 (Goal pulse) |
| Joystick Zone | 가상 스틱 입력 영역 | ~20% (하단) | 4순위 후퇴 |
| Margin/Spacing | 여백 + 안전 영역 | ~10% | - |

### 5.3 Component Inventory

| Component | Type | Zone | Purpose |
|-----------|------|------|---------|
| RoundLabel | InformationLabel (White @100%) | Top Strip | "Round N" 표시, ROUND_STARTED 동기화 |
| AliveLabel | InformationLabel (White @100%) | Top Strip | "N alive" 표시, ALIVE_COUNT_CHANGED 동기화 |
| TimeLabel | InformationLabel (White @60%) | Top Strip | "T.Ts" 카운트다운 표시 |
| Divider | Solid line (Grid Slate) | between Top + Grid | 시각 분리 |
| GridCell × 64 | Sprite (Void Black ↔ Danger Cyan) | Grid Zone | CELL_STATE_CHANGED 동기화 |
| GoalCellHighlight | Border + pulsing overlay | Grid Zone | GOAL_PLACED 강조, art-bible § 3.4 1순위 |
| PlayerNode | Sprite (Player White + cyan triangle) | Grid Zone | PLAYER_MOVED/ARRIVED 동기화, art-bible § 3.4 2순위 |
| JoystickArea | Touch input zone (invisible) | Bottom | TouchInput → PlayerMovement |

---

## 6. States

| State | Trigger | 시각 변화 |
|-------|---------|---------|
| Round Active | ROUND_STARTED 직후 ~ ROUND_END/GAME_OVER 직전 | 정상 표시, Timer 카운트다운 |
| Round Clear (1.5s display) | ROUND_CLEAR 이벤트 | Goal cell 강조 유지, Timer 정지, 1.5s 후 다음 라운드 시작 |
| Game Over | GAME_OVER 이벤트 | ResultOverlay overlay (별도 spec: result.md) |
| Spectator (사망 후 대기) | PLAYER_KILLED + 라운드 진행 중 | Player node opacity 40%, Cheer 버튼 활성 (Sprint 6+) |

---

## 7. Interaction Map

### 7.1 Touch Inputs

| 입력 | Context | Action | Visual | Audio |
|------|---------|--------|--------|-------|
| Drag in Joystick Zone | always | TouchInput → PlayerMovement.onMoveIntent(direction) | 가상 스틱 노드 위치 업데이트 | (Sprint 6+) movement_tick |
| Tap (release) Joystick | always | 입력 종료, 다음 셀 도달 시 PLAYER_ARRIVED | 스틱 중앙 복귀 | (movement audio) |
| Tap on Grid (실수로) | always | no-op (Direction8 외에는 무시) | none | none |
| Tap on HUD labels | always | no-op | none | none |

GRID REAPER에는 인-게임 일시정지가 없다 (v1). 시스템 백그라운드 전환(`cc.Game.EVENT_HIDE`)은 BGM 일시정지만 처리한다 (ADR-0016).

### 7.2 State-Specific

| State | Restriction |
|-------|------------|
| Round Clear (1.5s) | Joystick 입력 무시 — RoundManager가 phase guard |
| Game Over | ResultOverlay 표시, 그 아래 HUD 입력 차단 |

---

## 8. Data Requirements

| Data | Source | Update | Format | Missing |
|------|--------|--------|--------|---------|
| Round number | RoundManager (ROUND_STARTED) | round 시작 시 | int ≥ 1 | 게임 시작 전 표시 안함 |
| Alive count | RoundManager (ALIVE_COUNT_CHANGED) | PLAYER_KILLED 시 | int ≥ 0 | "0 alive" 가능 |
| Remaining time | HUDLayer 자체 (FrameClock dt) | 매 프레임 | float seconds | ROUND_END 시 정지 |
| Cell state × 64 | GridSimulation (CELL_STATE_CHANGED) | 매 게이트 사이클 | 'IDLE' or 'EXPLODED' | 초기 'IDLE' |
| Goal cell coord | RoundManager (GOAL_PLACED) | 라운드 시작 시 | CellCoord | 라운드 시작 전 표시 안함 |
| Player position | PlayerMovement (PLAYER_MOVED/ARRIVED) | 이동 시 | CellCoord | 항상 valid |

HUD은 어떤 system 상태에도 직접 쓰지 않는다. 모든 상호작용은 IEventBus 이벤트 또는 PlayerMovement.onMoveIntent() 호출.

---

## 9. Events Fired

| Player Action | Event | Payload | Receiver |
|---------------|-------|---------|----------|
| Drag joystick → 임계값 초과 | `PlayerMovement.onMoveIntent(direction, magnitude)` | Direction8 + magnitude px | PlayerMovement |
| (HUD 자체로는 game-state-changing 이벤트 없음) | - | - | - |

HUD은 상태를 **읽기**만 한다. 게임 상태 변경은 PlayerMovement (입력 → MOVE) 와 RoundManager (시간/도달 → 이벤트)에서만 발생.

---

## 10. Transitions

| Transition | Direction | Duration | Easing | reduced-motion |
|-----------|----------|---------|--------|---------------|
| HUD enter (Lobby → HUD) | Cross-fade | 200ms | Linear | 즉시 |
| Goal cell pulse | scale 100% ↔ 110% loop | 1.0s loop | Sin curve | 정적 윤곽선만 (펄스 제거) |
| Cell IDLE → EXPLODED | 색상 전환 | 100ms | Linear | 즉시 색상 변경 |
| Cell EXPLODED → IDLE | 색상 전환 | 100ms | Linear | 즉시 |
| Player tween (PLAYER_MOVED → PLAYER_ARRIVED) | 위치 보간 | 100ms (MOVE_TWEEN_DURATION, ADR-0008) | Ease out | 즉시 도달 |
| Tier escalation 펄스 (라운드 5/10) | 격자 전체 깜빡 | 200ms | Linear | 제거 (즉시 색상 변경) |

---

## 11. Input Method Checklist

**Touch**:
- [x] Joystick zone ≥ 100×100dp (충분히 넓은 thumb-zone)
- [x] HUD labels는 비-인터랙티브 (touch 충돌 없음)
- [x] Grid 셀 자체에 touch 핸들러 없음 (Direction8 입력만)
- [x] 한 손 portrait 모드에서 모든 액션 도달 가능
- [x] System swipe 충돌 없음 — Joystick은 화면 하단 thumb-zone 안

---

## 12. Accessibility (Tier 2)

**텍스트 명암비**:
| Element | Background | Required | Notes |
|---------|------------|---------|-------|
| RoundLabel "Round N" | Void Black `#1A1A2E` | 4.5:1 | White @100% — 패스 |
| AliveLabel "N alive" | Void Black | 4.5:1 | White @100% — 패스 |
| TimeLabel "T.Ts" | Void Black | 4.5:1 | White @60% — **검증 필요** (≈4.0 — 수정 가능: 70%로 조정 또는 폰트 크게) |

**색상 단독 정보 금지**:
- Cell IDLE vs EXPLODED 구분 — 색상 차이 + **밝기/발광 차이** (Danger Cyan은 발광 강조)
- Goal cell 강조 — 색상 + **윤곽선 두께 + 펄스 모션** (펄스 없어도 윤곽선만으로 식별 가능 — reduced-motion 시)
- Player vs Opponent — 색상 + **2px 외곽선 두께 차이** (art-bible § 3.4)

**reduced-motion** (accessibility-requirements.md § 2):
| 요소 | 일반 | reduced-motion |
|------|------|---------------|
| 셀 폭발 경고 깜빡임 | 정상 | 강도 30% 감소 (게임 메커니즘이라 제거 불가) |
| GATE_PERIOD 속도 변화 | easing curve | linear (즉발 변화) |
| Tier escalation 펄스 | 그리드 전체 0.2s 깜빡 | 즉시 색상 변경 |
| Goal cell 펄스 | scale 110% loop | 정적 윤곽선만 + 50% 진폭 감소 |
| Player 이동 트위닝 | 100ms ease-out | 즉시 이동 |

---

## 13. Localization

HUD은 텍스트가 매우 짧아 expansion 위험이 낮다. 그러나 모든 텍스트는 loc string 경유 필수.

| Element | EN | Max | Notes |
|---------|-----|-----|-------|
| "Round %d" | "Round 99" 8 chars | 14 | KR: "라운드 99" 6 chars OK |
| "%d alive" | "9 alive" 7 chars | 14 | KR: "%d 생존" 4 chars OK |
| "%.1fs" | "59.9s" 5 chars | 7 | locale-specific 소수점 (.→,) |

---

## 14. Acceptance Criteria

**Performance** (technical-preferences.md targets)
- [ ] 60fps 유지 (16.6ms frame budget) on 평균 디바이스
- [ ] 30fps 마지노선 on 저사양 webview (예: iPhone X)
- [ ] Draw call ≤ 50 (8×8 grid + HUD top + joystick = ~70 노드, batching 필요)
- [ ] 56 cell EXPLODED 동시 변화 시 frame drop 없음

**Layout**
- [ ] 320dp 폭에서 grid 잘림 없음 (그리드 = min(width-32, height×0.6))
- [ ] safeArea 노치/홈바 침범 없음
- [ ] HUD top strip이 grid 침범 없음
- [ ] Joystick zone이 다른 인터랙티브 요소와 겹치지 않음

**Input**
- [ ] Joystick drag → PlayerMovement.onMoveIntent 정확히 1회 호출
- [ ] Joystick magnitude < JOY_THRESHOLD → no-op (false positive 방지)
- [ ] Round Clear / Game Over 중 Joystick 입력 무시

**Events**
- [ ] CELL_STATE_CHANGED 64셀 동시 → 모두 반영 (race condition 없음)
- [ ] GOAL_PLACED 수신 → 단 하나의 cell만 highlighted
- [ ] ROUND_STARTED → 이전 goal highlight 자동 해제

**Accessibility**
- [ ] 모든 텍스트 ≥ 4.5:1 명암비
- [ ] reduced-motion 시 Goal pulse 정적 표시 (윤곽선만)
- [ ] reduced-motion 시 player 이동 트위닝 제거

**Localization**
- [ ] EN/KO에서 모든 라벨 잘림 없음
- [ ] 소수점 표기 locale-aware

---

## 15. Open Questions

| 질문 | Owner | Deadline |
|------|-------|---------|
| Cheer 버튼 위치 (스펙테이터 모드) | systems-designer | Sprint 6 |
| 멀티플레이어 시 다른 플레이어 위치 표시 방식 | art-director | Sprint 6 |
| Tier escalation 시각 신호 (text vs color) | art-director | Sprint 5 N2 playtest 후 |
| Joystick zone 크기 (현재 화면 하단 25%) — 작은 디바이스 적응 | ux-designer | S5-M6 playtest |
