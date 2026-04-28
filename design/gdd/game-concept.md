# Game Concept: GRID REAPER

*Created: 2026-04-20*
*Status: Draft*

---

## Elevator Pitch

> 스타크래프트 폭탄피하기의 본질을 계승한 모바일 아케이드 게임. 그리드 위에 예고되는 폭탄 패턴을 읽고 안전한 칸으로 이동하며 5분 안에 마지막 생존자가 되어라. 토스 앱 내에서 친구들과 바로 플레이 가능.

---

## Core Identity

| Aspect | Detail |
| --- | --- |
| **Genre** | 아케이드 서바이벌 / 멀티플레이어 경쟁 |
| **Platform** | 모바일 (토스 인토스 webview) |
| **Target Audience** | 한국 20-35세 스마트폰 유저, 아케이드/실력 게임 팬 |
| **Player Count** | 싱글플레이 + 멀티플레이어 (2-6인) |
| **Session Length** | 5분 |
| **Monetization** | 미결정 (토스 플랫폼 정책에 따름) |
| **Estimated Scope** | Medium (6-12개월, 솔로) |
| **Comparable Titles** | Muse Dash, Bomberman, Thumper |

---

## Core Fantasy

패턴을 읽는 능력만으로 모든 사람을 이긴다. 폭탄이 터지는 순간 나만 안전한 칸에 서있고, 다른 사람들이 하나씩 죽어나가는 것을 지켜보다 마지막에 혼자 남는다. 운이 아니라 — 내가 더 잘 읽었기 때문에.

---

## Unique Hook

스타크래프트 폭탄피하기처럼, **AND ALSO** 싱글에서 쌓은 패턴 지식이 실시간 멀티플레이 경쟁에서 증명된다. 연습의 결과가 대전에서 보인다.

---

## Player Experience Analysis (MDA Framework)

### Target Aesthetics

| Aesthetic | Priority | How We Deliver It |
| --- | --- | --- |
| **Sensation** | 2 | 폭발 사운드/비주얼 피드백, 모바일 햅틱 |
| **Fantasy** | N/A | — |
| **Narrative** | N/A | — |
| **Challenge** | 1 | 점점 복잡해지는 패턴, 난이도 곡선 |
| **Fellowship** | 2 | 멀티 경쟁, 상대가 반투명으로 보이는 긴장감 |
| **Discovery** | 3 | 새 패턴 타입 학습, "이 패턴이 이거구나" 순간 |
| **Expression** | N/A | — |
| **Submission** | N/A | — |

### Key Dynamics

- 플레이어가 죽으면서 패턴을 외우고 다음 판에 더 멀리 가려 한다
- 멀티에서 상대방 위치를 참고하거나 의식하며 자신만의 안전 칸을 찾는다
- 친구와 "이 패턴 어떻게 피했어?" 대화가 자연스럽게 발생한다

### Core Mechanics

1. **그리드 폭발 시스템** — 셀마다 예고 신호 후 폭발, 플레이어는 안전 칸으로 이동
2. **라운드 에스컬레이션** — 라운드가 오를수록 패턴 수/속도/복잡도 증가
3. **일반 모드 생존 구조** — 6인 시작, 라운드 내 사망자는 스펙테이터로 관전, 라운드 클리어(생존자 Goal Cell 도달) 시 전원 다음 라운드 부활, 전원 사망 시 세션 종료 (Cycle-Revive 모델 — 탈락은 라운드 내 한정, 영구 탈락 없음)
4. **대전 모드** — 2인+ 동시 플레이, 상대가 반투명으로 보임, 최고 라운드 기준 순위 결정
5. **공정 피드백 시스템** — 죽었을 때 즉시 "왜 죽었는지" 시각적으로 표시

---

## Player Motivation Profile

### Primary Psychological Needs

| Need | How This Game Satisfies It | Strength |
| --- | --- | --- |
| **Autonomy** | 매 라운드 어느 칸으로 갈지 선택 | Supporting |
| **Competence** | 죽을 때마다 패턴이 더 잘 읽힘, 실력 성장이 체감됨 | Core |
| **Relatedness** | 멀티에서 타인과 경쟁, "마지막 생존자" 순간의 사회적 증명 | Core |

### Player Type Appeal (Bartle Taxonomy)

- [x] **Achievers** — 더 높은 라운드, 더 낮은 사망 횟수 목표
- [x] **Explorers** — 새 패턴 타입 발견, 메커닉 이해의 즐거움
- [ ] **Socializers** — 부차적 (경쟁 기반이므로)
- [x] **Competitors** — 대전 모드 랭킹, 마지막 생존자 경쟁

### Flow State Design

- **온보딩**: 첫 라운드는 느리고 단순한 패턴 → 자연스럽게 규칙 습득, 튜토리얼 텍스트 최소화
- **난이도 스케일링**: 라운드 단위로 패턴 속도/수 선형 증가, 급격한 스파이크 없음
- **피드백 명확성**: 내가 피한 칸이 터지는 모습이 즉시 보임, 실력 향상이 "더 멀리 간 라운드"로 측정됨
- **실패 회복**: 즉시 재시작 또는 다음 세션, 패널티 없음

---

## Core Loop

### 순간순간 (30초)
폭발 예고 신호 표시 → 안전 칸 판단 (전술적 침착함) → 터치로 이동 → 폭발 확인 → 반복.

### 단기 (5분 세션)
라운드 1부터 시작 → 생존할수록 라운드 상승 → 패턴이 복잡해짐 → 사망 또는 전원 사망으로 게임 종료.

### 세션
5분짜리 매치 하나 = 한 세션. 일반 모드: 6인 경쟁, 각자 최고 라운드 도전. 대전 모드: 실시간으로 상대와 비교하며 진행.

### 장기 진행
패턴 해금/발견, 난이도 등급(Df 시스템) 도전, 대전 모드 랭킹 상승. 메타 진행은 가볍게 유지 (필수 아님).

### Retention Hooks

- **호기심**: "이 패턴은 어떻게 피하지?"
- **숙련**: 지난번에 못 넘긴 라운드를 이번엔 넘기는 경험
- **소셜**: 친구와 점수 비교, "내가 더 멀리 갔어"

---

## Game Pillars

### Pillar 1: 읽으면 이긴다
패턴을 읽는 지식과 판단력이 전부다. 운이 아닌 이해로 생존한다.

*Design test*: 새 기능이 "패턴 읽기를 더 의미있게 만드나?" NO면 제외.

### Pillar 2: 5분의 밀도
세션은 짧지만 꽉 차있다. 메뉴 없이 바로 긴장감 속으로.

*Design test*: 새 UI/시스템이 "5분 세션 흐름을 방해하나?" 방해하면 없애거나 줄인다.

### Pillar 3: 함께 겨루는 생존
혼자 하는 생존이 아니라, 다른 사람과 비교되고 목격되는 생존이 게임의 핵심이다.

*Design test*: 멀티 기능이 "다른 플레이어의 존재를 더 의미있게 만드나?"

### Pillar 4: 공정한 죽음
죽었을 때 내 실수임을 즉시 알 수 있다. 불합리한 죽음은 없다.

*Design test*: 새 패턴/메커닉 — "왜 죽었는지 플레이어가 바로 이해할 수 있나?" NO면 피드백 개선.

### Anti-Pillars (What This Game Is NOT)

- **NOT 스토리/내러티브**: 서사에 시간을 쓰지 않는다. 아케이드 실력 게임.
- **NOT 캐릭터 능력 차이**: 실력이 전부, 캐릭터 선택이 승패를 좌우하지 않는다.
- **NOT 복잡한 빌드 시스템**: 첫 판부터 규칙이 명확하다.

---

## Inspiration and References

| Reference | What We Take From It | What We Do Differently | Why It Matters |
| --- | --- | --- | --- |
| 스타크래프트 폭탄피하기 | 그리드 폭발 패턴, 다인 생존 경쟁 | 현대적 UI/UX, 모바일 터치, 정식 멀티플레이어 | 원작 수요 검증됨 |
| Bomberman | 실시간 멀티, 마지막 생존자 구조 | 조작이 아닌 패턴 읽기 중심 | 멀티 생존 장르 검증 |
| Muse Dash / Thumper | 패턴 읽기와 리듬감, 짧은 세션 | 리듬이 아닌 공간 판단 | 짧은 세션 아케이드 시장 검증 |

**Non-game inspirations**: 스타크래프트 한국 PC방 문화, 토스 앱의 간결한 UX 철학

---

## Target Player Profile

| Attribute | Detail |
| --- | --- |
| **Age range** | 20-35세 |
| **Gaming experience** | 미드코어 (스마트폰 게임 + 가끔 PC) |
| **Time availability** | 이동 중, 5-10분 짬 |
| **Platform preference** | 스마트폰 |
| **Current games they play** | 토스 미니게임, 각종 하이퍼캐주얼, 스타크래프트 유경험자 |
| **What they're looking for** | 짧지만 실력이 느껴지는 경쟁 게임 |
| **What would turn them away** | 긴 튜토리얼, 무거운 로딩, 과금 압박 |

---

## Technical Considerations

| Consideration | Assessment |
| --- | --- |
| **Recommended Engine** | 미결정 — `/setup-engine` 실행 권장. 토스가 Unity·Cocos 공식 지원, 순수 Web (Phaser.js)도 유효 |
| **Key Technical Challenges** | 실시간 멀티플레이어 WebSocket 동기화, 모바일 webview 성능 최적화, 토스 SDK 연동 |
| **Art Style** | 2D 미니멀/기하학적 — TBD (`/art-bible` 권장) |
| **Art Pipeline Complexity** | 낮음 (그리드 기반, 벡터/스프라이트 중심) |
| **Audio Needs** | 보통 (폭발 SFX, 긴장감 BGM, 생존 시 효과음) |
| **Networking** | Client-Server WebSocket (Railway 호스팅) |
| **Content Volume** | 패턴 50+개, Df0.1~Df5.0 난이도 범위, 예상 플레이타임 무제한 (반복 플레이) |
| **Procedural Systems** | 없음 (핸드크래프티드 패턴 라이브러리) |

---

## Risks and Open Questions

### Design Risks
- 메타 진행 없이 장기 리텐션 유지 가능한가
- 패턴 수가 부족하면 "외웠다 → 지루함" 사이클이 빠르게 올 수 있음

### Technical Risks
- 모바일 webview 내 실시간 WebSocket 레이턴시 허용 범위 미검증
- 토스 인토스 SDK 제약 및 심사 기준 미확인

### Market Risks
- 토스 앱 내 게임 사용자 전환율 미검증
- 경쟁 게임 대비 차별화 포인트가 원작 팬에게만 명확할 수 있음

### Scope Risks
- 첫 게임으로 멀티플레이어 서버 구축은 난이도 높음
- 토스 SDK 연동 + 게임 개발 동시 진행 시 병목 가능

### Open Questions
- 토스 인토스 실시간 멀티플레이어 기술 제약 확인 필요 (프로토타입으로 검증)
- WebSocket 서버 없이 싱글플레이 MVP 먼저 출시하는 전략이 유효한가

---

## MVP Definition

**Core hypothesis**: 모바일 webview에서 그리드 기반 폭탄 피하기 코어 루프가 5분 세션으로 반복 플레이할 만큼 재미있는가

**Required for MVP**:
1. 그리드 폭발 패턴 시스템 (예고 → 폭발 → 이동)
2. 라운드 에스컬레이션 (패턴 복잡도 상승)
3. 일반 모드 멀티플레이 (6인, 전원 부활 구조)
4. 모바일 터치 조작
5. 토스 인토스 SDK 연동 및 webview 배포

**Explicitly NOT in MVP**:
- 대전 모드 (랭킹 시스템)
- Df 난이도 시스템
- 메타 진행 / 해금 요소
- 스킨/커스터마이징

### Scope Tiers

| Tier | Content | Features | Timeline |
| --- | --- | --- | --- |
| **MVP** | 패턴 20개, 싱글+일반 멀티 | 코어 루프 + 토스 배포 | 3-4개월 |
| **Vertical Slice** | 패턴 35개 | + 난이도 곡선 완성, 피드백 폴리시 | 5-6개월 |
| **Alpha** | 패턴 50개 | + 대전 모드, 기본 랭킹 | 8-10개월 |
| **Full Vision** | 패턴 100+개 | + Df 시스템, 시즌 랭킹, 스킨 | 12개월+ |

---

## Visual Identity Anchor

*Art direction TBD — run `/art-bible` to establish visual identity before asset production.*

방향 후보 (아트 디렉터 세션에서 결정):
- **그리드 퓨처리즘** — 다크 배경, 네온 그리드 라인, 폭발 시 강렬한 컬러 플래시
- **클린 미니멀** — 흰 배경, 기하학적 도형, 폭발은 색상 변화로만 표현
- **레트로 픽셀** — 원작 스타크래프트 감성 오마주, 픽셀아트 그리드

---

## Next Steps

- [ ] `/setup-engine` — 엔진 결정 및 버전 참조 문서 구성
- [ ] `/art-bible` — 비주얼 아이덴티티 확립 (GDD 작성 전 완료 권장)
- [ ] `/design-review design/gdd/game-concept.md` — 컨셉 완성도 검증
- [ ] `/map-systems` — 시스템 분해 및 의존성 맵핑
- [ ] `/design-system grid-explosion` — 핵심 메커닉 GDD 작성
- [ ] `/create-architecture` — 기술 아키텍처 블루프린트
- [ ] `/prototype grid-core` — 코어 루프 프로토타입으로 가설 검증
- [ ] `/playtest-report` — 프로토타입 검증 후 플레이테스트
- [ ] `/sprint-plan new` — 첫 스프린트 계획
