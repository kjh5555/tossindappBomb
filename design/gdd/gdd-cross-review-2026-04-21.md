# Cross-GDD Review Report — GRID REAPER

> **Date**: 2026-04-21
> **Reviewer**: `/review-all-gdds` (Phase 2 consistency + Phase 3 design holism, parallel agents)
> **GDDs Reviewed**: 6
> **Verdict**: 🟡 **IN RESOLUTION** — 6 blockers 모두 해소됨. `/review-all-gdds since-last-review` 통과 후 `/create-architecture` 진입 가능.
> **Resolution Updated**: 2026-04-21 (동일 세션)
> **Scope Signal**: L (large — multi-document edits required)

---

## Scope

| # | GDD | Status at Review |
|---|-----|------------------|
| 1 | `design/gdd/grid-explosion.md` | Draft — Review Pending |
| 2 | `design/gdd/pattern-library.md` | Draft — Review Pending |
| 3 | `design/gdd/player-movement.md` | Draft — Review Pending |
| 4 | `design/gdd/fair-feedback.md` | Draft — Review Pending |
| 5 | `design/gdd/round-manager.md` | Draft — Review Pending |
| 6 | `design/gdd/round-escalation.md` | Draft — Review Pending |

Also read as baseline: `game-concept.md`, `systems-index.md`, `registry/entities.yaml`.

---

## 🔴 Blocking Issues (6)

### B-1. `grid-explosion.md`에 폐기된 Warning/Imminent 상태 잔존
**Type**: Consistency + Design Coherence
**Systems involved**: grid-explosion, pattern-library, fair-feedback, round-escalation

Header는 "Idle ↔ Exploded only (Cyclic v4)"로 선언되어 있으나 본문(AC-*, EC-*, Game Feel, Visual Spec, 튜닝 노브)에 Warning1 / Warning2 / Imminent 참조가 광범위하게 남음. 결과:

- `AC-1` 자동화 테스트가 6-state transition sequence를 검증하도록 기록되어 있어 구현 단계에서 fail.
- `T_warn=1.8s`, `DANGER_ZONE_DURATION=0.5s` 튜닝 노브가 Cyclic v4 모델에서 의미를 잃음.
- Pillar 1 "읽으면 이긴다"의 텔레그래핑이 **gate period 자체**로 대체됐는지, 별도 시각 단서가 남아 있는지가 문서에서 결정되지 않아 pattern-library와 fair-feedback의 읽힘 기반이 흔들림.

**Resolution**: grid-explosion.md 전체 재정돈.
- Warning1 / Warning2 / Imminent 용어 일괄 삭제
- `DANGER_ZONE_DURATION`, `T_warn`, `IMMINENT_DURATION` 튜닝 노브 제거
- AC 블록을 Idle↔Exploded 2-state 시퀀스 기반으로 재작성
- Pillar 1의 "읽힘 단서" 정의를 pattern-library의 시각적 리듬 + gate period에 귀속
- 제거된 상수는 registry에서도 deprecated 처리(또는 영구 삭제 — 어디에도 참조되지 않는 것 확인)

---

### B-2. `game-concept.md` ↔ `round-manager.md` 생존 모델 불일치
**Type**: Consistency (Design Intent)
**Systems involved**: game-concept, round-manager

- `game-concept.md`: "6인 시작 · 라운드마다 탈락 · 전원 부활 · 모두 죽으면 종료"
- `round-manager.md`: ROUND_CLEAR 시 **전원 revive**, 라운드 내 사망자는 spectator로 관전

"라운드마다 탈락"은 영구 탈락을 시사하지만 round-manager는 cycle-revive 모델. 두 해석이 양립 불가.

**Resolution**: 두 선택지 중 하나로 합치되 결정은 사용자.
- **Option A — Cycle-Revive 확정**: game-concept.md를 "라운드마다 탈락 → 다음 라운드에 전원 부활 → 생존자 카운트는 라운드 내 한정"으로 재작성. round-manager.md는 그대로.
- **Option B — Permanent Elimination**: round-manager.md의 ROUND_CLEAR revive 로직 제거. Spectator는 게임 종료까지 유지. game-concept.md의 "모두 죽으면 종료" 조항 그대로 유지.

권장: **Option A** — MVP의 Pillar 2 "5분의 밀도" 와 Pillar 3 "함께 겨루는 생존"을 모두 충족하기 쉬움. 사망 후 대기시간이 짧아야 session 밀도 유지 가능.

---

### B-3. round-manager가 미정의 upstream API를 기존 계약처럼 참조
**Type**: Consistency (Interface Contract)
**Systems involved**: round-manager, player-movement, grid-explosion

round-manager.md가 다음 심볼을 이미 존재하는 것처럼 사용:

| 심볼 | 참조 위치 | 실제 정의 |
|------|----------|----------|
| `onCellArrived(playerId, cell)` | round-manager EC-RM-2, AC-RM-8 | ❌ player-movement는 `PLAYER_MOVED`만 emit |
| `nextExplosionTime(cell)` | round-manager Game Feel (Goal Cell preview) | ❌ grid-explosion은 Cyclic gate period 외 per-cell 예측 API 없음 |
| `GOAL_PLACED` | round-manager emit | ❌ consumer(HUD? fair-feedback?) 미지정, referenced_by 없음 |

**Resolution**:
1. `player-movement.md`에 `onCellArrived` 이벤트 또는 `PLAYER_ARRIVED(playerId, cell)` 추가 (이미 MOVE_TWEEN 0.1s 종료 시점이므로 구현 비용 낮음).
2. `grid-explosion.md`에 `nextExplosionTime(cell): seconds` public API 또는 `CELL_WILL_EXPLODE(cell, eta)` 시그널 정의.
3. `GOAL_PLACED` consumer를 HUD로 지정하고 양쪽 Dependencies 섹션에 양방향 반영.
4. round-manager Dependencies 섹션을 실제 API만 참조하도록 정리.

---

### B-4. 좌표 체계 혼재 — `{row, col}` ↔ `cellIndex`
**Type**: Consistency (Type Contract)
**Systems involved**: all six GDDs

- player-movement.md, grid-explosion.md: `{row: 0-7, col: 0-7}`
- fair-feedback.md `killerGateCells[]`: cellIndex로 읽힘 (스키마 불명확)
- pattern-library.md `cells: number[]`: cellIndex (0..63) 형태

직렬화·네트워크·시각화 전반에서 변환 함수가 없고, 어느 쪽이 canonical인지 미지정.

**Resolution**: `CellCoord = {row: 0-7, col: 0-7}`를 canonical로 확정.
- 모든 GDD의 cells 필드를 `CellCoord[]`로 통일
- `cellIndex`가 필요한 곳(네트워크 직렬화 등)에는 `cellIndex = row * 8 + col` 변환 공식 명시
- registry/entities.yaml에 CellCoord 타입 등록
- fair-feedback의 `PLAYER_KILLED.killerGateCells`를 `CellCoord[]`로 정정

---

### B-5. round-escalation의 GATE_PERIOD override를 grid-explosion이 수용하지 않음
**Type**: Consistency (Contract Mismatch)
**Systems involved**: round-escalation, grid-explosion

- escalation: `GATE_PERIOD(R) = max(1.4, 2.0 - (R-1) * 0.05)` — 라운드마다 주입
- grid-explosion 튜닝 노브: `GATE_PERIOD_BASE = 2.0s` 고정, safe range `[1.5, 4.0]`

문제:
1. R13+에서 주입값이 1.4–1.49 → safe range 밖
2. setter/override API가 grid-explosion 공개 계약에 없음

**Resolution**:
- `grid-explosion.md`에 `setGatePeriod(seconds: number)` public API 추가
- safe range를 `[GATE_PERIOD_FLOOR, GATE_PERIOD_BASE]` = `[1.4, 2.0]`로 갱신 (registry 상수 참조)
- round-escalation.md의 Dependencies에 grid-explosion과의 양방향 계약 명시

---

### B-6. `pattern-library.md` Player Fantasy 섹션 공란
**Type**: Design Coherence
**Systems involved**: pattern-library, grid-explosion

Player Fantasy 섹션이 `[To be designed]` 상태. 결과:
- Pillar 1 "읽으면 이긴다"의 **미적 토대**가 부재
- T3 patterns 5개의 방향성(카오스? 대칭 파괴? 리듬의 가속?) 기준 없음
- pattern-library가 단순 랜덤 풀 vs. "읽히도록 설계된 적대적 리듬"인지 불분명

**Resolution**: creative-director 세션으로 Player Fantasy 작성.
후보 방향: *"You're learning a hostile rhythm. Each pattern is a shape that wants to kill you — and once you see its shape, you can walk through it. Mastery is seeing the shape before the first blast."*

---

## ⚠️ Warnings (11)

| # | 이슈 | 영향 | 권장 조치 |
|---|------|------|----------|
| W-1 | `PLAYER_KILLED` 스키마 불일치 — grid-explosion은 `cellId` 단수, fair-feedback은 `killerGateCells[]` 배열 | 동시 폭발 다중 셀 사망 시 death overlay 미대응 | fair-feedback 스키마를 canonical로, grid-explosion emit 쪽을 배열로 통일 |
| W-2 | `DANGER_ZONE_DURATION=0.5s` 튜닝 노브가 Cyclic v4에서 고아화 | stale spec, 구현자 혼란 | B-1 해결 과정에서 제거 |
| W-3 | ExplodePattern BFS 이중 검증 — pattern-library 빌드타임 + grid-explosion 런타임 | 비용 중복, source-of-truth 미지정 | `bfsVerified: true` 인 패턴은 런타임 검증 생략, edge case만 검증 |
| W-4 | `MIN_SAFE_CELLS=8` 중복 소유 문서화 | 문서 혼선 | registry로 이관 완료됨 ✓ — 두 GDD에서 "see registry" 로 갱신 |
| W-5 | `entities.yaml`에 `CellCoord`, `ExplodePattern`, `PLAYER_KILLED` 스키마 미등록 | 향후 /consistency-check 효과 저하 | B-4 해결 시 함께 등록 |
| W-6 | EC-RM-2: 마지막 생존자 Goal Cell 도착 프레임에 폭발 발생 시 승리 vs 사망 우선순위 모호 | Pillar 4 "공정한 죽음" 위협 | round-manager에 "arrival 처리 → 폭발 판정" 순서 명시 (player-movement와 동일 규칙) |
| W-7 | T3 patterns (5개) 실제 디자인 부재 | R15+ 에스컬레이션 난이도 천장 검증 불가 | `/design-system pattern-library retrofit` 으로 T3 섹션 보강 |
| W-8 | GRID_STALLED 책임 순서 모호 (pattern-library 재시도 → grid-explosion 후처리 → round-escalation fallback) | edge case 미커버 | 3자 간 처리 순서를 한 GDD(권장: round-manager)에 명시 |
| W-9 | 후반 라운드 동시 활성 시스템 5개 (grid + pattern read + 이동 + spectator-cheer + round timer) | Pillar 2 "5분의 밀도" 상한 위협 | spectator-cheer를 passive로 downgrade하거나 후반 제거 |
| W-10 | Pillar 3 "함께 겨루는 생존" 2인 매치에서 degenerate ("last two camp corners") 가능 | 저인원 매치 설계 공백 | 2인 매치 시 grid 크기 축소 또는 Goal Cell 거리 증가 |
| W-11 | `SAFE_WIN_MIN` 값이 round-manager와 round-escalation에서 다르게 인용 | 승리 판정 불일치 | 단일 값을 registry에 등록, 두 GDD가 참조 |

---

## ℹ️ Info (9)

- **I-1**: ROUND_CLEAR 시 "kamikaze-then-revive" 지배 전략 가능성 — 자살 대기 후 부활 → MVP 플레이테스트 검증 필수
- **I-2**: Spectator tap-to-cheer가 생존자에게 정보 비대칭 제공 가능 (응원 위치 = 폭발 예고) — 추후 검토
- **I-3**: 8방향 조이스틱 vs 4방향 패턴 리더빌리티 — OQ-PM-1에서 검증 예정 ✓
- **I-4**: fair-feedback 700ms overlay + tap-to-skip → Pillar 2 density 리듬 OK
- **I-5**: Goal Cell fallback (N-1 → N-2) 선택 규칙 명확 ✓
- **I-6**: Tier weight stepped table R1-15 구간 별 잘 정의됨 ✓
- **I-7**: N_recent = min(3, floor(pool/2)) 동적 윈도우 — pool=5,8,7에 대해 모두 3 ✓
- **I-8**: registry에 5개 상수 등록 완료 ✓
- **I-9**: BFS connectivity + MIN_SAFE_CELLS=8 이중 조건으로 연결성 보장 충분

---

## ✓ Clean Checks

- 순환 의존성 없음 (systems-index.md 확인)
- Anti-pillar 위반 없음 (카지노 메커닉, P2W, 토큰 FOMO 등 부재)
- `T_EX=0.35s`, `GATE_PERIOD_BASE=2.0s`, `MIN_SAFE_CELLS=8` 값은 모든 참조 GDD에서 일치
- Tier 분배 (T1=7, T2=8, T3=5 = 20) 전 GDD 일관
- Acceptance Criteria 블로킹/어드바이저리 분리 일관 ✓

---

## Resolution Status (2026-04-21)

| # | 블로커 | 상태 | 해소 내용 |
|---|--------|------|----------|
| B-1 | grid-explosion Warning/Imminent 잔재 | ✅ 해소 | Cyclic v4 2-state 정리, setGatePeriod API 추가 |
| B-2 | 생존 모델 불일치 | ✅ 해소 | game-concept.md Cycle-Revive 모델로 명확화 (Option A) |
| B-3 | round-manager 미정의 API | ✅ 해소 | PLAYER_ARRIVED 이벤트 추가, nextExplosionTime 확정, GOAL_PLACED→HUD 명시 |
| B-4 | 좌표 체계 혼재 | ✅ 해소 | CellCoord canonical 확정, 전 GDD 통일, 레지스트리 등록 |
| B-5 | GATE_PERIOD override 미수용 | ✅ 해소 | B-1 과정에서 setGatePeriod(seconds) A-8 추가 |
| B-6 | pattern-library Player Fantasy 공란 | ✅ 해소 | creative-director — "리듬이 형상으로 드러난다" 작성 |

| # | 경고 | 상태 |
|---|------|------|
| W-1 | PLAYER_KILLED 스키마 불일치 | ✅ 해소 (playerIds[] 배열 통일) |
| W-2 | DANGER_ZONE_DURATION 고아화 | ✅ 해소 (B-1 과정에서 제거) |
| W-3 | BFS 이중 검증 중복 비용 | ⏳ 미해소 (구현 단계에서 처리) |
| W-4 | MIN_SAFE_CELLS 중복 소유 | ✅ 해소 (레지스트리 등록, 양 GDD 참조) |
| W-5 | 레지스트리 타입 미등록 | ✅ 해소 (CellCoord, ExplodePattern, PLAYER_KILLED, PLAYER_ARRIVED 등록) |
| W-6 | Goal Cell 도달 vs 폭발 우선순위 | ✅ 해소 (EC-RM-2: arrival → explosion 순서 명시) |
| W-7 | T3 패턴 5개 디자인 미완 | ⏳ 미해소 (Vertical Slice 단계 예정) |
| W-8 | GRID_STALLED 처리 순서 모호 | ✅ 해소 (EC-RM-5b: 3자 체인 round-manager에 canonical 기술) |
| W-9 | 동시 활성 시스템 5개 과부하 | ⏳ 미해소 (플레이테스트 전 권장) |
| W-10 | 2인 매치 degenerate 전략 | ⏳ 미해소 (플레이테스트 전 권장) |
| W-11 | SAFE_WIN_MIN 값 불일치 | ✅ 해소 (레지스트리 단일 등록) |

## Recommended Resolution Order (완료)

```
B-1 ✅ → B-4 ✅ → B-3 ✅ → B-5 ✅ → B-2 ✅ → B-6 ✅
W-1 ✅ W-2 ✅ W-4 ✅ W-5 ✅ W-6 ✅ W-8 ✅ W-11 ✅
미해소: W-3 (구현 단계), W-7 (Vertical Slice), W-9/W-10 (플레이테스트)
```

---

## Next Steps

1. **이번 세션**: B-1 즉시 수정 (grid-explosion.md Warning/Imminent 제거)
2. **다음 세션**: B-4 → B-3 → B-5 → B-2 순차 수정
3. **별도 세션**: B-6 (`/design-system pattern-library retrofit`)
4. **모든 블로커 해결 후**: `/review-all-gdds since-last-review` 재실행
5. **재리뷰 통과 시**: `/create-architecture` 진입

---

*Generated by `/review-all-gdds` with parallel Phase 2 (consistency) + Phase 3 (design holism) agents.*
