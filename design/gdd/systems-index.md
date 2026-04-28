# Systems Index: GRID REAPER

> **Status**: Draft
> **Created**: 2026-04-21
> **Last Updated**: 2026-04-21
> **Source Concept**: design/gdd/game-concept.md

---

## Overview

GRID REAPER는 8×8 그리드 위에서 폭탄 패턴을 읽고 안전한 칸으로 이동해 마지막 생존자가 되는 모바일 아케이드 게임이다. 코어 루프는 단순하지만 이를 지탱하는 시스템은 세 축으로 나뉜다: **패턴 읽기 (그리드 폭발 + 플레이어 이동 + 피드백)**, **경쟁 구조 (멀티플레이어 + 라운드 에스컬레이션 + 생존 모드)**, **플랫폼 인프라 (WebSocket + 토스 SDK + 세션 흐름)**. 게임의 4개 필러 — 읽으면 이긴다, 5분의 밀도, 함께 겨루는 생존, 공정한 죽음 — 가 모든 시스템 설계 판단의 기준이 된다. MVP는 싱글플레이 + 일반 모드 멀티플레이어로 코어 루프의 재미를 검증하는 것이 목표이며, 20개 시스템 중 15개가 MVP에 배정된다.

---

## Systems Enumeration

| # | System Name | Category | Priority | Status | Design Doc | Depends On |
|---|-------------|----------|----------|--------|------------|------------|
| 1 | 패턴 라이브러리 | Gameplay | MVP | Draft | `design/gdd/pattern-library.md` | — |
| 2 | 터치 입력 시스템 | Core | MVP | Not Started | — | — |
| 3 | 토스 인토스 SDK 연동 | Core | MVP | Not Started | — | — |
| 4 | WebSocket 네트워킹 시스템 | Core | MVP | Not Started | — | — |
| 5 | 오디오 시스템 | Audio | MVP | Not Started | — | — |
| 6 | 그리드 폭발 시스템 | Gameplay | MVP | Draft | `design/gdd/grid-explosion.md` | 패턴 라이브러리 |
| 7 | 플레이어 이동 시스템 | Gameplay | MVP | Draft | `design/gdd/player-movement.md` | 터치 입력, 그리드 폭발 |
| 8 | 서버 권위 검증 (inferred) | Core | MVP | Not Started | — | WebSocket 네트워킹 |
| 9 | 라운드 매니저 (inferred) | Gameplay | MVP | Draft | `design/gdd/round-manager.md` | 그리드 폭발, 플레이어 이동 |
| 10 | 공정 피드백 시스템 | Gameplay | MVP | Draft | `design/gdd/fair-feedback.md` | 그리드 폭발, 플레이어 이동 |
| 11 | 로비/매치메이킹 시스템 (inferred) | Core | MVP | Not Started | — | WebSocket, 토스 SDK |
| 12 | 라운드 에스컬레이션 시스템 | Gameplay | MVP | Draft | `design/gdd/round-escalation.md` | 라운드 매니저, 패턴 라이브러리 |
| 13 | 일반 모드 생존 구조 | Gameplay | MVP | Not Started | — | 라운드 매니저, WebSocket, 서버 검증 |
| 14 | HUD 시스템 (inferred) | UI | MVP | Not Started | — | 라운드 매니저, 공정 피드백 |
| 15 | 세션 플로우 시스템 (inferred) | Core | MVP | Not Started | — | 로비/매치메이킹, 일반 모드 |
| 16 | 저장/통계 시스템 (inferred) | Persistence | Vertical Slice | Not Started | — | 토스 SDK |
| 17 | 대전 모드 | Gameplay | Alpha | Not Started | — | 일반 모드, WebSocket |
| 18 | Df 난이도 시스템 | Gameplay | Full Vision | Not Started | — | 패턴 라이브러리, 라운드 에스컬레이션 |
| 19 | 랭킹 시스템 | Meta | Full Vision | Not Started | — | 대전 모드, 저장/통계, WebSocket |
| 20 | 스킨/커스터마이징 | Meta | Full Vision | Not Started | — | 저장/통계, 토스 SDK |

---

## Categories

| Category | Description | 해당 시스템 |
|----------|-------------|------------|
| **Core** | 모든 시스템이 의존하는 인프라 | 터치 입력, 토스 SDK, WebSocket, 서버 검증, 로비, 세션 플로우 |
| **Gameplay** | 게임을 재미있게 만드는 메커닉 | 그리드 폭발, 플레이어 이동, 패턴 라이브러리, 라운드 매니저, 공정 피드백, 라운드 에스컬레이션, 일반 모드, 대전 모드, Df 시스템 |
| **UI** | 플레이어 정보 표시 | HUD |
| **Audio** | 사운드 및 음악 | 오디오 시스템 |
| **Persistence** | 저장 및 통계 | 저장/통계 시스템 |
| **Meta** | 코어 루프 외부 시스템 | 랭킹, 스킨/커스터마이징 |

---

## Priority Tiers

| Tier | 정의 | 목표 마일스톤 |
|------|------|--------------|
| **MVP** | 코어 루프 재미 검증에 필요한 모든 시스템 | 3–4개월. 패턴 20개, 일반 모드 멀티, 토스 webview 배포 |
| **Vertical Slice** | 완성된 경험 1회분 (피드백 폴리시 포함) | 5–6개월 |
| **Alpha** | 대전 모드 + 기본 랭킹 포함 전체 기능 | 8–10개월 |
| **Full Vision** | Df 시스템, 시즌 랭킹, 스킨 완성 | 12개월+ |

---

## Dependency Map

### Foundation Layer (의존 없음)

1. **패턴 라이브러리** — 그리드 폭발 시스템의 데이터 원천. 코드가 아닌 데이터 설계.
2. **터치 입력 시스템** — 플랫폼 하드웨어 위의 최하위 레이어.
3. **토스 인토스 SDK 연동** — 플랫폼 배포 채널. 게임 로직과 무관한 인프라.
4. **WebSocket 네트워킹 시스템** — 멀티플레이어 전체 인프라. 네트워킹 스택 기반.
5. **오디오 시스템** — 독립 서브시스템. 다른 게임 시스템에 의존하지 않음.

### Core Layer (Foundation에 의존)

6. **그리드 폭발 시스템** — depends on: 패턴 라이브러리
7. **플레이어 이동 시스템** — depends on: 터치 입력, 그리드 폭발 (셀 안전/위험 상태 조회)
8. **서버 권위 검증** — depends on: WebSocket 네트워킹 (이동·사망 판정 서버사이드)
9. **저장/통계 시스템** — depends on: 토스 SDK (유저 식별자)

### Feature Layer (Core에 의존)

10. **라운드 매니저** — depends on: 그리드 폭발, 플레이어 이동
11. **공정 피드백 시스템** — depends on: 그리드 폭발, 플레이어 이동
12. **로비/매치메이킹** — depends on: WebSocket, 토스 SDK

### Feature+ Layer (Feature에 의존)

13. **라운드 에스컬레이션** — depends on: 라운드 매니저, 패턴 라이브러리
14. **일반 모드 생존 구조** — depends on: 라운드 매니저, WebSocket, 서버 검증
15. **HUD 시스템** — depends on: 라운드 매니저, 공정 피드백
16. **세션 플로우 시스템** — depends on: 로비/매치메이킹, 일반 모드

### Full Vision Layer

17. **대전 모드** — depends on: 일반 모드, WebSocket
18. **Df 난이도 시스템** — depends on: 패턴 라이브러리, 라운드 에스컬레이션
19. **랭킹 시스템** — depends on: 대전 모드, 저장/통계, WebSocket
20. **스킨/커스터마이징** — depends on: 저장/통계, 토스 SDK

---

## Recommended Design Order

| 순서 | 시스템 | 우선순위 | 레이어 | 담당 에이전트 | 예상 노력 |
|------|--------|----------|--------|--------------|----------|
| 1 | 그리드 폭발 시스템 | MVP | Core | game-designer + gameplay-programmer | L |
| 2 | 패턴 라이브러리 | MVP | Foundation | game-designer | M |
| 3 | 플레이어 이동 시스템 | MVP | Core | game-designer + gameplay-programmer | S |
| 4 | 공정 피드백 시스템 | MVP | Feature | game-designer | S |
| 5 | 라운드 매니저 | MVP | Feature | game-designer | S |
| 6 | 라운드 에스컬레이션 시스템 | MVP | Feature+ | game-designer | M |
| 7 | WebSocket 네트워킹 시스템 | MVP | Foundation | network-programmer | L |
| 8 | 서버 권위 검증 | MVP | Core | network-programmer | M |
| 9 | 로비/매치메이킹 시스템 | MVP | Feature | network-programmer + game-designer | M |
| 10 | 일반 모드 생존 구조 | MVP | Feature+ | game-designer | M |
| 11 | 터치 입력 시스템 | MVP | Foundation | gameplay-programmer | S |
| 12 | HUD 시스템 | MVP | Feature+ | ui-programmer | S |
| 13 | 세션 플로우 시스템 | MVP | Feature+ | game-designer | S |
| 14 | 토스 인토스 SDK 연동 | MVP | Foundation | gameplay-programmer | M |
| 15 | 오디오 시스템 | MVP | Foundation | sound-designer | S |
| 16 | 저장/통계 시스템 | Vertical Slice | Core | gameplay-programmer | S |
| 17 | 대전 모드 | Alpha | Full Vision | game-designer | M |
| 18 | Df 난이도 시스템 | Full Vision | Full Vision | game-designer | L |
| 19 | 랭킹 시스템 | Full Vision | Full Vision | game-designer | M |
| 20 | 스킨/커스터마이징 | Full Vision | Full Vision | game-designer | M |

> **노력 기준:** S = 1세션, M = 2–3세션, L = 4+세션. "세션" = 하나의 완성된 GDD를 생산하는 집중 설계 대화.
>
> **설계 순서 우선:** 그리드 폭발 시스템(#1)을 가장 먼저 설계한다. 코어 루프의 심장이며 가장 많은 시스템이 의존하고 가장 불확실성이 높다.

---

## Circular Dependencies

- **없음** — 의존성 그래프에 순환 없음.

---

## High-Risk Systems

| 시스템 | 리스크 유형 | 리스크 설명 | 완화 방법 |
|--------|-----------|------------|----------|
| **WebSocket 네트워킹 시스템** | Technical | 모바일 webview 내 실시간 WebSocket 레이턴시가 수용 가능한지 미검증. 토스 인토스 SDK의 webview 환경이 WebSocket 연결을 제한할 수 있음 | MVP 전 싱글플레이 프로토타입으로 코어 루프 검증. 네트워킹은 두 번째 단계로 격리. Railway + WebSocket ping 실기기 테스트 조기 시행 |
| **그리드 폭발 시스템** | Design | "읽으면 이긴다" 필러가 실제로 작동하는지 — 패턴 예고 타이밍이 너무 짧거나 길면 전략적 재미가 사라짐 | 가장 먼저 프로토타입. 예고 시간(Warning→Explode 인터벌) 튜닝 노브를 GDD에 명시하고 조기 플레이테스트 |
| **서버 권위 검증** | Technical | 첫 게임으로 서버사이드 판정 구현은 복잡도가 높음. 클라이언트-서버 상태 불일치 시 "공정한 죽음" 필러 위반 | WebSocket 네트워킹 GDD에서 메시지 스키마 선정의, 간단한 ping-기반 검증부터 시작 |
| **토스 인토스 SDK 연동** | Technical + Scope | SDK 문서/제약이 개발 중 변경될 수 있음. 심사 기준 미확인 | 최대한 일찍 SDK 샌드박스 환경에서 빌드 테스트. webview 빌드 파이프라인 조기 확립 |
| **패턴 라이브러리** | Design | MVP 패턴 20개가 충분한 다양성을 제공하는지 미검증. 패턴 단순화와 복잡도 곡선의 균형 | GDD에서 패턴 템플릿/카테고리 정의 후 최소 5개 패턴 프로토타입으로 다양성 검증 |

---

## Progress Tracker

| 지표 | 수치 |
|------|------|
| 총 시스템 수 | 20 |
| GDD 시작됨 | 6 |
| GDD 검토 완료 | 0 |
| GDD 승인됨 | 0 |
| MVP 시스템 설계됨 | 6 / 15 |
| Vertical Slice 시스템 설계됨 | 0 / 1 |

---

## Next Steps

- [ ] `/design-system grid-explosion` — 그리드 폭발 시스템 GDD 작성 (설계 순서 #1)
- [ ] `/prototype grid-core` — 코어 루프 프로토타입으로 그리드 폭발 + 이동 가설 검증
- [ ] `/design-system pattern-library` — 패턴 라이브러리 GDD 작성 (설계 순서 #2)
- [ ] `/gate-check pre-production` — MVP GDD 전체 완성 후 실행
