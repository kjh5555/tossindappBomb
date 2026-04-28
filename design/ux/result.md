# UX Specification: Result Overlay (Game Over / Round Clear)

> **Status**: Approved (v1)
> **Author**: 김재현 + agents
> **Last Updated**: 2026-04-27
> **Screen Name**: `ResultOverlay` — overlaid on `HUDScreen` (z:30 modal)
> **Platform Target**: 모바일 (Toss 인토스 webview) — 터치 전용
> **Related GDDs**: `design/gdd/round-manager.md` (GAME_OVER, ROUND_CLEAR contracts)
> **Related ADRs**: ADR-0016 (HUD z-order), ADR-0011 (Round Phase FSM), story-003-session-flow-stub
> **Related UX Specs**: `design/ux/lobby.md` (next), `design/ux/hud.md` (parent), `design/ux/interaction-patterns.md`
> **Accessibility Tier**: Standard (Tier 2)

> **Note**: ResultOverlay은 HUD의 일부지만 독립적인 modal 시각 요소이므로 별도 spec으로 분리. 구현은 `src/presentation/hud/ResultOverlay.ts` (Sprint 5 story-003).

---

## 1. Purpose & Player Need

**플레이어 needs**: 라운드가 끝났을 때 (1) "왜 끝났는지(GAME_OVER vs ROUND_CLEAR)", (2) "내 결과는 어떤지(최종 라운드)", (3) "다시 할 수 있는지(Restart)"를 명확히 인식해야 한다. 패배 시 좌절을 최소화하고, 승리 시 만족감을 차분히 누리며, 어느 쪽이든 즉시 재시작 가능해야 한다.

**Player goal**: 결과를 확인하고 1회 탭으로 재시작한다.

**Game goal**: SessionFlow.state를 RESULT로 표시하고, Restart 시 `sessionFlow.reset()` → MENU 전환을 실행한다.

---

## 2. Player Context on Arrival

| 질문 | 답변 |
|------|------|
| 직전 행동 | (GAME_OVER) 폭발 셀 착지 / 타이머 만료 / 모든 동료 사망. (ROUND_CLEAR) 골 셀 도달 |
| 정서 상태 | (GAME_OVER) 좌절, 약간의 분노 / (ROUND_CLEAR) 안도, 성취감 |
| 인지 부하 | 매우 높음 — 직전까지 그리드 패턴 추적 중 |
| 보유 정보 | 자기 위치, 골 위치, 직전에 본 폭발 패턴 |
| 기대 행동 | (좌절 시) 빠른 재시작 / (성취 시) 다음 라운드 또는 새 게임 |

**감정 디자인 타깃**: art-bible § 3.4의 "사망 시 X 마크 0.6초간 1순위 계층 점령 → 핑크-레드 최대 발광 → 납득 후 소멸" 원칙. **납득의 시간**을 보장 — 즉시 overlay로 가리지 말고 죽음 원인을 짧게 보여준 후 표시.

---

## 3. Navigation Position

```
HUDScreen
  └── ResultOverlay (THIS — modal, z:30, dims grid 80%)
        └── back to LobbyScreen via Restart
```

**Modal**: Modal — 그 아래 HUD 입력 차단 (HUD에서 차단 처리; ResultOverlay는 자체 입력 영역만 활성).

---

## 4. Entry & Exit

**Entry**:
| Trigger | Source | Transition | Data | Notes |
|---------|--------|-----------|------|-------|
| GAME_OVER event | RoundManager (전원 사망 / 타이머 만료 / GRID_STALLED) | Slide-up 250ms ease-out, **300ms 지연** 후 시작 | `{finalRound, rankings, timestamp}` | 300ms 지연으로 "납득의 시간" 확보 |
| ROUND_CLEAR event | RoundManager (생존자 골 도달) | Slide-up 250ms ease-out, **300ms 지연** | `{roundNumber, survivors, timestamp}` | 동일 |

**FIFO 보장**: GAME_OVER + ROUND_CLEAR 동일 flush 발생 시 첫 이벤트 우선 (story-003 AC-OVR-04).

**Exit**:
| Action | Destination | Transition | Data |
|--------|------------|-----------|------|
| Tap Restart | LobbyScreen | Cross-fade 200ms | none — `sessionFlow.reset()` → MENU |
| (시스템) Toss 백그라운드 전환 | (BGM 일시정지) | none | 화면은 유지 |

---

## 5. Layout

### 5.1 Wireframe (세로 모드, 360×800dp 기준)

```
┌──────────────────────────────────────┐
│   ░░░░░░░ SAFE AREA TOP ░░░░░░░       │
├──────────────────────────────────────┤
│                                      │   ← 게임 그리드 어둡게
│       (HUD + Grid 어두워짐 80%)         │     dim 처리 (Void Black @80%)
│                                      │
│   ╔══════════════════════════════╗   │
│   ║                              ║   │
│   ║         GAME OVER            ║   │   ← Hero Label (White @100%)
│   ║                              ║   │     폰트 36pt+
│   ║                              ║   │
│   ║      Final Round: 7          ║   │   ← Secondary info (White @60%)
│   ║                              ║   │     폰트 16pt
│   ║                              ║   │
│   ║   ┌──────────────────────┐   ║   │
│   ║   │      R E S T A R T   │   ║   │   ← PrimaryButton 64dp 높이
│   ║   └──────────────────────┘   ║   │
│   ║                              ║   │
│   ╚══════════════════════════════╝   │
│                                      │
│       (Grid 계속 어두움 유지)             │
│                                      │
├──────────────────────────────────────┤
│   ░░░░░░ SAFE AREA BOTTOM ░░░░░░     │
└──────────────────────────────────────┘
```

ROUND_CLEAR 변형:
```
   ╔══════════════════════════════╗
   ║       ROUND CLEAR            ║   ← 동일 레이아웃, 메시지만 변경
   ║                              ║
   ║      Cleared Round 3         ║   (선택, Sprint 6에서 추가)
   ║                              ║
   ║   [   N E X T   R O U N D  ] ║   (선택, Sprint 6)
   ║                              ║
   ╚══════════════════════════════╝
```

v1 범위: 메시지 텍스트만 변경 ("Game Over" vs "Round Clear"), Restart 버튼은 동일.

### 5.2 Zone Definitions

| Zone | 설명 | 비율 |
|------|------|------|
| Backdrop Dim | Void Black @80% — 그리드 가림 | 전체 |
| Overlay Card | 메시지 + 버튼 컨테이너 | 화면 중앙 80%×40% |
| Message Label Zone | "Game Over" / "Round Clear" | 카드 상단 50% |
| Detail Info Zone | (선택) 최종 라운드 표시 | 카드 중간 |
| Action Zone | Restart 버튼 | 카드 하단 |

### 5.3 Component Inventory

| Component | Type | Purpose | Reuses? |
|-----------|------|---------|---------|
| BackdropDim | Solid color overlay (Void Black @80%) | 그리드 가림 + 시선 집중 | - |
| OverlayCard | Container (Grid Slate 외곽선) | 메시지+버튼 컨테이너 | ResultOverlay (interaction-patterns § 3.4) |
| MessageLabel | Text (Display 36pt White @100%) | "Game Over" / "Round Clear" | - |
| DetailInfo (선택) | Text (Body 16pt White @60%) | "Final Round: N" | InformationLabel |
| RestartButton | PrimaryButton | Restart 트리거 | PrimaryButton |

---

## 6. States

| State | Trigger | 시각 | 행동 |
|-------|---------|------|------|
| Hidden (initial) | overlay 생성 직후 | node.visible=false | 입력 무시 |
| Showing — Game Over | GAME_OVER event + 300ms delay | "Game Over" + dim + Restart | Restart 활성 |
| Showing — Round Clear | ROUND_CLEAR event + 300ms delay | "Round Clear" + dim + Restart | Restart 활성 |
| Hiding | Restart 탭 후 | fade out 200ms | 입력 무시 (전환 중) |
| Re-armed | Restart 후 sessionFlow MENU | Hidden | 다음 GAME_OVER 대기 |

**FIFO 가드**: 한 사이클에 한 번만 표시. GAME_OVER 후 ROUND_CLEAR 같은 flush 시 두 번째 이벤트 무시.

---

## 7. Interaction Map

### 7.1 Touch Inputs

| 입력 | Context | Action | Visual | Audio |
|------|---------|--------|--------|-------|
| Tap RestartButton | Showing 상태 | `sessionFlow.reset()` → overlay hide → Lobby cross-fade | 버튼 scale 95→100% | `ui_click_primary` (Sprint 6+) |
| Tap BackdropDim | Showing 상태 | no-op (실수 dismiss 방지) | none | none |
| Tap 카드 외부 | Showing 상태 | no-op | none | none |
| Long-press anywhere | always | no-op (interaction-patterns § 1.3 — long-press 미사용) | none | none |

### 7.2 State-Specific

| State | Restriction | 이유 |
|-------|------------|------|
| Hidden | 모든 입력 무시 | overlay 비활성 |
| Hiding | 모든 입력 무시 | 전환 중 race condition 방지 |
| Showing 첫 300ms | Restart 입력 받지 않음 | "납득의 시간" — 우발적 즉시 탭 방지 |

---

## 8. Data Requirements

| Data | Source | Update | Format | Missing |
|------|--------|--------|--------|---------|
| Final round number | GAME_OVER event payload | event 시점 | int (`finalRound`) | 누락 시 "Final Round: ?" 표시 |
| Cleared round number | ROUND_CLEAR event payload | event 시점 | int (`roundNumber`) | 누락 시 표시 안함 |
| (Sprint 6+) Spectator count, Final ranking | event payload | event 시점 | array | v1에서는 표시 안함 |

ResultOverlay는 어떤 system에도 직접 쓰지 않는다. Restart 액션도 `sessionFlow.reset()` 메서드 호출만 — RoundManager / GridSimulation에 직접 의존하지 않음.

---

## 9. Events Fired

| Player Action | Event/Call | Payload | Receiver |
|---------------|-----------|---------|----------|
| Tap Restart | `sessionFlow.reset()` 메서드 호출 | none | SessionFlow |

이후 chain (overlay 자체에서는 발행하지 않음):
- SessionFlow MENU 전환
- Lobby 화면 cross-fade
- (다음 Start 시) RoundManager.startRound(1)

---

## 10. Transitions

| Transition | Direction | Duration | Easing | reduced-motion |
|-----------|----------|---------|--------|---------------|
| GAME_OVER 수신 → 표시 시작 | (지연) | 300ms 지연 후 표시 | - | 즉시 표시 (지연만 유지) |
| Backdrop dim fade-in | opacity 0→80% | 200ms | Linear | 즉시 80% |
| OverlayCard slide-up | translateY +50dp → 0dp | 250ms | Ease out | 즉시 표시 |
| Restart button press | scale 100→95→100% | 60+60ms | Ease out/in | tactile 유지 (필수 피드백) |
| Hiding (Restart 후) | OverlayCard fade-out | 200ms | Linear | 즉시 사라짐 |

**reduced-motion 적용 시 변화** (accessibility-requirements.md § 2 — "ROUND_CLEAR 화면 효과 페이드인 제거"):
- Slide-up 제거 → 즉시 표시
- Backdrop dim 즉시 80% (fade 제거)
- Restart button press tactile은 유지 (필수 피드백)
- 300ms "납득의 시간" 지연은 **유지** (모션이 아닌 timing이므로)

---

## 11. Input Method Checklist

**Touch**:
- [x] RestartButton ≥ 64dp (interaction-patterns § 1.1 — Critical action 권장값)
- [x] RestartButton과 인접 영역 ≥ 8dp 간격
- [x] BackdropDim tap → no-op (실수 dismiss 방지)
- [x] 한 손 portrait 모드에서 도달 가능 (카드 중앙)
- [x] 첫 300ms input ignore — 우발적 즉시 탭 방지

---

## 12. Accessibility (Tier 2)

**텍스트 명암비**:
| Element | Background | Required | Notes |
|---------|------------|---------|-------|
| MessageLabel "GAME OVER" | Void Black @80% backdrop + transparent card | 4.5:1 | White @100% on dim BG ≈ 18:1 — 패스 |
| DetailInfo "Final Round: 7" | 동일 | 4.5:1 | White @60% — **검증 필요** (≈11:1 — 패스 예상) |
| Restart label "RESTART" | Danger Cyan `#00E5CC` | 4.5:1 | Void Black 텍스트 — 패스 |

**색상 단독 정보 금지**:
- GAME_OVER vs ROUND_CLEAR 구분 — 색상이 아닌 **텍스트만으로** 식별 ("Game Over" vs "Round Clear"). 색상 차이 없음 (둘 다 White @100%).
- (Sprint 6+) ROUND_CLEAR 시 Last Survivor Gold 색상 추가 시 — 텍스트 + 아이콘 함께 사용 필수.

**reduced-motion**:
- Slide-up 제거
- Backdrop fade 제거 (즉시 80%)
- 300ms 지연 유지 (납득의 시간)

**우발적 dismiss 방지**:
- BackdropDim 탭 → no-op (실수 → 게임 재시작 방지)
- Restart는 명시적 버튼 탭만
- 첫 300ms 동안 Restart 비활성 (의도하지 않은 즉시 탭 방지)

---

## 13. Localization

| Element | EN | KO | Max | Overflow |
|---------|-----|-----|-----|---------|
| "GAME OVER" | 9 chars | "게임 오버" 4 chars | 16 | shrink to 90% font |
| "ROUND CLEAR" | 11 chars | "라운드 클리어" 7 chars | 18 | shrink to 90% |
| "Final Round: %d" | "Final Round: 99" 15 | "최종 라운드: 99" 9 | 25 | wrap 2 lines |
| "RESTART" | 7 chars | "재시작" 3 chars | 14 | shrink to 90% |

---

## 14. Acceptance Criteria

**Performance**
- [ ] GAME_OVER 수신 → 화면 표시까지 ≤ 350ms (300ms 지연 + 50ms 애니메이션 시작)
- [ ] Restart 탭 → SessionFlow.MENU 전환까지 ≤ 250ms
- [ ] OverlayCard 표시 중 backdrop이 게임 그리드를 80% 가리는지 확인

**Layout**
- [ ] 320dp 폭에서 OverlayCard 잘림 없음 (카드 폭 ≤ 화면 폭 - 32dp)
- [ ] safeArea 침범 없음
- [ ] MessageLabel 36pt+에서 "GAME OVER" / "ROUND CLEAR" 잘림 없음 (EN/KO)

**Input**
- [ ] 첫 300ms 동안 Restart 입력 무시
- [ ] BackdropDim tap → no-op
- [ ] Restart 탭 정확히 1회 → sessionFlow.reset() 1회 호출
- [ ] Restart 후 즉시 재탭 → no-op (overlay 이미 hidden)

**Events**
- [ ] FIFO 가드 — GAME_OVER + ROUND_CLEAR 동일 flush 시 첫 이벤트만 표시
- [ ] dispose() 후 이벤트 수신 → no-op (overlay 비활성)

**Accessibility**
- [ ] 모든 텍스트 ≥ 4.5:1 명암비
- [ ] reduced-motion 시 즉시 표시 (slide-up 제거)
- [ ] 색상 단독 정보 없음 (텍스트로 GAME_OVER vs ROUND_CLEAR 구분)
- [ ] 300ms 납득 시간 유지

**Localization**
- [ ] EN/KO에서 모든 라벨 잘림 없음
- [ ] 모든 텍스트 loc string 경유

---

## 15. Open Questions

| 질문 | Owner | Deadline |
|------|-------|---------|
| ROUND_CLEAR 시 추가 정보 (스코어, 다음 라운드 미리보기) | systems-designer | Sprint 6 |
| 통계 화면으로 직접 진입하는 보조 버튼 (예: "Stats") | ux-designer | post-v1 |
| 멀티플레이어 시 최종 순위 표시 방식 | art-director | Sprint 6 (Matchmaking 구현 후) |
| Final Round 표시는 항상 보일지, 신기록 시만 강조할지 | systems-designer | Sprint 6 |
| BGM 페이드아웃 처리 (현재는 cc.Game.EVENT_HIDE만) | audio-director | Sprint 6 |
