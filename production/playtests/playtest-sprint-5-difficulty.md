# Playtest: Sprint 5 — Difficulty Curve at Rounds 5/10/15

> **Status**: Template
> **Sprint**: Sprint 5 (S5-M6 #3 of 3)
> **Goal**: `design/difficulty-curve.md`의 예측 난이도와 실측 난이도가 일치하는가? 라운드 5/10/15 별 평균 생존 시간 측정
> **Protocol source**: `production/qa/qa-plan-sprint-5-2026-04-27.md` § Playtest 3
> **Cohort**: 동일 플레이어가 3런 이상 진행 — 평균 데이터 추출

---

## Session Metadata

| 항목 | 값 |
|------|-----|
| 세션 일시 | YYYY-MM-DD HH:MM |
| 세션 길이 | __ 분 |
| 런 수 | __ 회 (최소 3회 권장) |
| 빌드 버전 | sprint-5 commit `__________` |
| 환경 | [ ] Cocos preview / [ ] Toss 샌드박스 / [ ] 실기기 |
| 플레이어 | __________ |
| Prior 노출 | [ ] 1-2 라운드만 / [ ] 라운드 5+ / [ ] 베테랑 |

---

## 데이터 수집 (런별)

| 런 # | 도달 라운드 | 라운드 5 도달 시간 | 라운드 10 도달 시간 | 라운드 15 도달 시간 | 사망 라운드 | 사망 원인 |
|------|----------|----------------|------------------|------------------|----------|---------|
| 1 | | | | | | |
| 2 | | | | | | |
| 3 | | | | | | |
| 4 | | | | | | |
| 5 | | | | | | |

**평균 도달 라운드**: ___ / 평균 생존 시간 (초): ___

---

## difficulty-curve.md 예측치 vs 실측치

`design/difficulty-curve.md`의 라운드별 예측 난이도와 비교.

| 라운드 | 예측 난이도 (curve doc) | 실측 결과 | 일치도 |
|-------|----------------------|---------|------|
| 5 | (curve doc § ___ 참조) | 평균 생존 ___초 | [ ] 일치 / [ ] 너무 쉬움 / [ ] 너무 어려움 |
| 10 | (curve doc § ___ 참조) | 평균 생존 ___초 | [ ] 일치 / [ ] 너무 쉬움 / [ ] 너무 어려움 |
| 15 | (curve doc § ___ 참조) | 평균 생존 ___초 | [ ] 일치 / [ ] 너무 쉬움 / [ ] 너무 어려움 |

---

## Subjective Difficulty Rating

각 라운드별 플레이어가 felt 한 난이도 (1=매우 쉬움 ~ 5=매우 어려움):

| 라운드 | Felt Rating (1-5) | 코멘트 |
|-------|-----------------|------|
| 5 | | |
| 10 | | |
| 15 | | |

---

## Pass Criteria

| # | 조건 | PASS / FAIL |
|---|------|-------------|
| 1 | 라운드 5 평균 생존 ≥ 30초 (3+ 런 평균) | [ ] / [ ] |
| 2 | 라운드 10에서 라운드 5 대비 가시적 난이도 증가 (gate period 빠름, 패턴 더 위험) | [ ] / [ ] |
| 3 | 라운드 15는 "challenging but fair" felt rating 3-4 | [ ] / [ ] |
| 4 | 사망 시 "왜 죽었는지" 명확 (대부분의 사망이 unfair 느낌 X) | [ ] / [ ] |
| 5 | difficulty-curve.md 예측치와 실측 평균 차이 ≤ 30% | [ ] / [ ] |

**Pass 조건**: 5개 중 4개 이상 PASS.

---

## Verbatim Quotes (≥ 2 — 라운드별 1개씩 권장)

1. **라운드 5 도달 시**: "_______________________"
2. **라운드 10 도달 시**: "_______________________"
3. **라운드 15 도달 시 (또는 사망 시)**: "_______________________"

---

## 권장 튜닝 (next sprint)

> Sprint 6 또는 Polish stage에서 적용할 difficulty 조정 제안.

| 항목 | 현재 값 | 제안 값 | 근거 |
|------|--------|--------|------|
| GATE_PERIOD_BASE | 2.0s | | |
| GATE_PERIOD_STEP | 0.05s/round | | |
| Tier 2 진입 라운드 | (curve doc 참조) | | |
| Tier 3 진입 라운드 | (curve doc 참조) | | |

---

## Verdict

- [ ] **PASS** — 5/5 또는 4/5 충족, difficulty curve 검증 완료
- [ ] **PASS WITH NOTES** — 3/5 충족, 일부 튜닝 필요
- [ ] **FAIL** — 2/5 이하, difficulty 모델 재설계 필요

**Sign-off**: __________ (systems-designer + designer)

---

## difficulty-curve.md 갱신 trigger

S5-N2 (carryover): 본 데이터를 기반으로 `design/difficulty-curve.md` § 한계 항목 업데이트.
- "Sprint 5 플레이테스트 후 개정 필요" 항목 → 본 결과로 대체
- Round 5/10/15 expected vs actual 표 추가
- Tuning 권장사항 반영

진행 결과: `production/playtests/playtest-sprint-5-difficulty.md` (이 문서) 완성 → S5-N2 시작 가능.
