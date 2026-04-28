# Epics Index — GRID REAPER

**Last Updated**: 2026-04-28 (Matchmaking epic + Sprint 6 자동화 작업 완료)
**Engine**: Cocos Creator 3.8.6 (TypeScript)
**Manifest Version**: 2026-04-22

---

## Foundation Layer

| Epic | Layer | Module | Governing ADR(s) | Stories | Status |
|------|-------|--------|-------------------|---------|--------|
| [EventBus](eventbus/EPIC.md) | Foundation | `src/core/events/EventBus.ts` | ADR-0001, ADR-0002, ADR-0003 | 5개 완료 | ✅ Complete |
| [FrameClock](frameclock/EPIC.md) | Foundation | `src/core/time/FrameClock.ts` | ADR-0002, ADR-0008, ADR-0006 | 2개 완료 | ✅ Complete |
| [WebSocketClient](websocketclient/EPIC.md) | Foundation | `src/core/net/WebSocketClient.ts` | ADR-0010, ADR-0001, ADR-0004 | 3개 완료 | ✅ Complete (⚠️ OQ-7) |
| [TouchInput](touchinput/EPIC.md) | Foundation | `src/core/input/TouchInput.ts` | ⚠️ ADR 없음 | 미생성 | 🔴 Blocked |

## Platform Layer

| Epic | Layer | Module | Governing ADR(s) | Stories | Status |
|------|-------|--------|-------------------|---------|--------|
| [TossBridge](tossbridge/EPIC.md) | Platform | `src/platform/toss/TossBridge.ts` | ADR-0004, ADR-0010 | 2개 완료 | ✅ Complete |

## Core Layer

| Epic | Layer | Module | Governing ADR(s) | Stories | Status |
|------|-------|--------|-------------------|---------|--------|
| [GridExplosion](gridexplosion/EPIC.md) | Core | `src/core/grid/GridSimulation.ts` | ADR-0002, ADR-0005, ADR-0006, ADR-0009 | 5개 생성 | 🟡 Ready — `/story-readiness` |
| [PatternLibrary](patternlibrary/EPIC.md) | Core | `src/core/patterns/PatternLibrary.ts` | ADR-0007, ADR-0009 | 4개 생성 | 🟡 Ready — `/story-readiness` |
| [PlayerMovement](playermovement/EPIC.md) | Core | `src/core/player/PlayerMovement.ts` | ADR-0005, ADR-0008, ADR-0010 | 5개 생성 | 🟡 Ready — `/story-readiness` |

## Feature Layer

| Epic | Layer | Module | Governing ADR(s) | Stories | Status |
|------|-------|--------|-------------------|---------|--------|
| [RoundManager](roundmanager/EPIC.md) | Feature | `src/features/round/RoundManager.ts` | ADR-0011, ADR-0012, ADR-0013 | story-001, 002, 003 | ✅ Complete (Sprint 4) |
| RoundEscalation | Feature | `src/features/round/RoundEscalation.ts` | ADR-0006, ADR-0009 | 미생성 | 🟡 Ready |
| FairFeedback | Feature | `src/features/feedback/FairFeedback.ts` | ADR-0015 | 미생성 | 🟡 Ready — ADR-0015 Accepted |
| [Matchmaking](matchmaking/EPIC.md) | Feature | `src/features/session/Matchmaking.ts` | ADR-0014, ADR-0010 | story-001, 002, 003 | ✅ Complete (Sprint 6) |
| SessionFlow / Pause / Settings | Feature | `src/features/session/SessionFlow.ts`, `PauseController.ts`, `SettingsState.ts` | ADR-0001, ADR-0002, ADR-0016 | inline (no separate epic) | ✅ Complete (Sprint 4 + Sprint 6) |

## Presentation Layer

| Epic | Layer | Module | Governing ADR(s) | Stories | Status |
|------|-------|--------|-------------------|---------|--------|
| [HUD](hud/EPIC.md) | Presentation | `src/presentation/hud/HUDLayer.ts`, `GridLayer.ts`, `ResultOverlay.ts`, `PauseOverlay.ts` | ADR-0016, ADR-0011, ADR-0013 | story-001, 002, 003 | ✅ Complete (Sprint 5 + Sprint 6 PauseOverlay) |
| Audio | Presentation | `src/features/audio/AudioStub.ts`, `src/presentation/audio/MultichannelAudioOutput.ts` | ADR-0016 | inline (no separate epic) | ✅ Complete (Sprint 5 stub + Sprint 6 channel routing) |

---

## Summary

| Layer | Total Epics | Complete | Ready | Blocked |
|-------|-------------|----------|-------|---------|
| Foundation | 4 | 4 (TouchInput ADR-0017 + adapter 구현됨) | 0 | 0 |
| Platform | 1 | 1 | 0 | 0 |
| Core | 3 | 3 (Sprint 2 완료) | 0 | 0 | ← 14 stories created 2026-04-22 (GE×5, PL×4, PM×5)
| Feature | 5 | 3 (RoundManager, Matchmaking, SessionFlow/Pause/Settings) | 2 (RoundEscalation, FairFeedback) | 0 |
| Presentation | 2 | 2 (HUD + Audio) | 0 | 0 |

---

## Notes

- **TouchInput Unblocked**: ADR-0017 Accepted, `src/core/input/TouchInputAdapter.ts` 구현됨 (Sprint 2-3 작업). 별도 EPIC.md는 미생성 상태(에픽 doc 정리 필요 시 Sprint 7+).
- **OQ-7**: WebSocketClient Epic에 Toss webview 실기기 레이턴시 측정 스파이크 — 여전히 미해결 (S6-N2 + S5-N1과 함께 device 의존)
- **All 17 ADRs Accepted** — ADR-0001 ~ ADR-0017 (touch-input 포함). Core/Feature/Presentation 에픽 모두 구현 진행/완료
- **Sprint 6 자동화 완료 (2026-04-28)**: Matchmaking 에픽 + Pause/Settings + MultichannelAudioOutput 구현. 455 tests passing.

---

## Next Steps (Polish 게이트 진입을 위한 잔여 작업)

1. **Sprint 5 carryover playtest 실행** — S5-M6 (3 sessions: 신규/패턴/난이도) + S5-S2 (PatternLibrary 가독성). humans 필요.
2. **Sprint 6 carryover playtest 실행** — S6-M6 (멀티플레이어 1세션). humans 필요.
3. **Cocos 통합 wrapper 작성** — `CocosAudioChannel`, `CocosLabel`, `CocosButton`, scene root. Cocos 런타임 필요.
4. **Toss 인토스 실기기 빌드 + 검증** — S5-N1, S6-N2. Toss SDK + 실기기 필요.
5. **서버 구현** (Node.js FIFO Lobby per ADR-0014) — Matchmaking 클라이언트만 구현됨. 서버 필요.
6. **다음 게이트 시도**: 위 1~4 완료 후 `/smoke-check sprint` → `/team-qa sprint` → `/gate-check production`
