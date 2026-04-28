# ADR-0009: GRID_STALLED 3자 체인 — canonical 흐름 및 재귀 방지

## Status
Accepted

## Date
2026-04-21

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | Cocos Creator 3.8.6 (TypeScript) |
| **Domain** | Core / Scripting |
| **Knowledge Risk** | LOW — EventBus flush 큐 기반 순수 TypeScript 흐름 결정 |
| **References Consulted** | `docs/engine-reference/cocos/VERSION.md` |
| **Post-Cutoff APIs Used** | None |
| **Verification Required** | GRID_STALLED 3자 체인 통합 테스트: 재귀 없이 최대 9프레임 내 종단 확인 |

## ADR Dependencies

| Field | Value |
|-------|-------|
| **Depends On** | ADR-0001 (EventBus flush 큐 — 재귀 방지 구조적 보장), ADR-0006 (Gate Period — setGatePeriod는 체인 중 재호출 불필요), ADR-0007 (PatternLibrary — GRID_STALLED 발행 주체), ADR-0008 (PlayerMovement — 체인 중 플레이어 이동 판정 순서 유지) |
| **Enables** | ADR-0011 (Round Phase 상태 머신 — GRID_STALLED 중 라운드 상태 유지), ADR-0015 (DeathReplay — 체인 중 PLAYER_KILLED 발생 가능) |
| **Blocks** | RoundEscalation GRID_STALLED 핸들러 구현, PatternLibrary 재선택 흐름 구현 |
| **Ordering Note** | ADR-0007(PatternLibrary) + ADR-0006(Gate Period) 확정 후 작성 |

## Context

### Problem Statement

`GRID_STALLED` 이벤트는 3개 시스템이 순서대로 반응해야 하는 멀티-시스템 체인을 형성한다:

```
PatternLibrary → RoundEscalation → PatternLibrary (→ GridSimulation or 재반복)
```

동기 디스패치 모델에서 이 체인은:
1. PatternLibrary.handler → emit(GRID_STALLED) → 즉시 RoundEscalation.handler 실행 →
   emit(ESCALATION_COMPUTED) → 즉시 PatternLibrary.handler 재실행 →
   emit(GRID_STALLED) → ... **스택 오버플로우**
2. 핸들러 실행 순서가 구독 등록 순서에 의존 → **비결정론적**

또한 GRID_STALLED 처리 중:
- `setGatePeriod` 재호출 시 현재 라운드의 게이트 리듬 연속성 깨짐
- 체인이 얼마나 반복될지 미확정 시 무한 루프 위험

### Constraints

- ADR-0001: EventBus flush 큐 — `emit()` 즉시 핸들러 실행 금지, 다음 flush에서 처리
- ADR-0001 Invariant 3: flush() 재진입 금지 — flush 중 emit()된 이벤트는 다음 프레임 처리
- 최대 체인 깊이: Tier 3 → 2 → 1 = 최대 2회 강등 × 3회 재시도 = 최대 6 PatternLibrary 시도
- GRID_STALLED 발생 중에도 플레이어 이동/폭발 판정은 계속됨 (라운드 정지 없음)

### Requirements

- 체인이 동기 재귀 없이 프레임 단위 flush로 처리
- 종단 조건: Tier 1 3회 실패 → grid-explosion 빈 패턴 라운드 스킵
- 체인 진행 중 `setGatePeriod` 재호출 없음 (게이트 리듬 연속성 유지)
- 각 체인 단계가 어느 시스템의 책임인지 canonical 단일 문서로 확정

## Decision

**EventBus flush 큐 패턴(ADR-0001)이 GRID_STALLED 3자 체인의 재귀를 구조적으로 방지**한다.
GDD EC-RM-5b를 canonical 흐름으로 채택하여 각 시스템 책임을 이 ADR로 확정한다.

### Canonical 체인 흐름

```
[PatternLibrary] 3회 연속 검증 실패
    └── EventBus.emit(GRID_STALLED { roundNumber, timestamp })
           ↓ (다음 flush, ADR-0001 재진입 방지)
[RoundEscalation] GRID_STALLED 핸들러
    └── fallbackTier = max(1, lastTier - 1)         ← F-RE-3
    └── EventBus.emit(ESCALATION_COMPUTED {
            ctx: { tier: fallbackTier, stalledFallback: true, gatePeriod, ... }
        })
    └── (setGatePeriod 재호출 없음 — 라운드 게이트 리듬 유지)
           ↓ (다음 flush)
[PatternLibrary] ESCALATION_COMPUTED(stalledFallback=true) 핸들러
    └── 강등 Tier로 selectPattern() 재시도 (최대 3회)
    ├── 성공 → ExplodePattern → GridSimulation (정상 흐름 합류)
    └── 실패 3회 → GRID_STALLED 재발행 → 위 체인 반복
           ↓ (Tier 1에서도 3회 실패)
[GridSimulation] 빈 패턴으로 라운드 스킵
    └── ROUND_CLEAR 정상 흐름 대기 (라운드 자체는 계속)
```

### 체인 최대 깊이 분석

```
시나리오: T3에서 시작, 모든 Tier에서 3회 실패

프레임 1:  PatternLibrary T3 실패 3회 → GRID_STALLED emit
프레임 2:  RoundEscalation: T3→T2 강등 → ESCALATION_COMPUTED(T2, stalledFallback)
프레임 3:  PatternLibrary T2 실패 3회 → GRID_STALLED emit
프레임 4:  RoundEscalation: T2→T1 강등 → ESCALATION_COMPUTED(T1, stalledFallback)
프레임 5:  PatternLibrary T1 실패 3회 → GRID_STALLED emit
프레임 6:  RoundEscalation: T1→T1 (max(1,0)=1, 이미 최소) → ESCALATION_COMPUTED(T1, stalledFallback)
프레임 7:  PatternLibrary T1 실패 3회 → GRID_STALLED emit
프레임 8:  RoundEscalation: 동일 강등 불가 → GridSimulation에 종단 신호
프레임 9:  GridSimulation: 빈 패턴 처리

최악 케이스: 9프레임 = 약 150ms (60fps 기준)
실제 발생 가능성: 매우 낮음 (BFS 검증된 패턴 풀이 충분할 경우 발생 안 함)
```

### Architecture Diagram

```
                    [ADR-0001 flush queue 보장]
                    emit → 큐 추가 → 다음 flush 처리
                    재귀 구조적 불가

PatternLibrary           RoundEscalation         GridSimulation
    │                         │                       │
    │ 3회 실패                │                       │
    ├─emit(GRID_STALLED)──────►│                       │
    │   [큐잉, 즉시 실행 안됨] │                       │
    │                         │ GRID_STALLED 수신      │
    │                         │ fallbackTier 계산     │
    │◄──emit(ESCALATION_COMPUTED, stalledFallback=true)│
    │ [큐잉]                  │                       │
    │ ESCALATION_COMPUTED 수신│                       │
    │ 강등 Tier로 재선택       │                       │
    ├─성공──────────────────────────────────────────►  │
    │             ExplodePattern 전달                  │
    │                                                  │
    └─실패 3회 → GRID_STALLED 재발행 (체인 반복)        │
```

### Key Interfaces

```typescript
// GRID_STALLED 체인에서 각 시스템 책임 요약

// [PatternLibrary] — ADR-0007
// 발행 조건: 3회 연속 런타임 검증 실패 (safeCellCount < 8 OR BFS 연결 실패)
eventBus.emit('GRID_STALLED', { roundNumber, timestamp: clock.now() });

// [RoundEscalation] — GRID_STALLED 핸들러
// 수신 즉시 강등 Tier 계산 후 ESCALATION_COMPUTED 재발행
// setGatePeriod 재호출 없음 — 게이트 리듬 연속성 유지
onGridStalled({ roundNumber }: GameEvents['GRID_STALLED']): void {
  const fallbackTier = Math.max(1, this.lastTier - 1) as 1 | 2 | 3;  // F-RE-3
  this.lastTier = fallbackTier;
  const ctx: EscalationContext = {
    roundNumber,
    gatePeriod: this.currentGatePeriod,  // 변경 없음
    tier: fallbackTier,
    tierWeights: TIER_WEIGHTS[fallbackTier],
    stalledFallback: true,
  };
  this.eventBus.emit('ESCALATION_COMPUTED', { ctx, timestamp: this.clock.now() });
  // setGatePeriod 호출 없음 — ADR-0006: setGatePeriod는 RoundManager.startRound() 전용
}

// [GridSimulation] — Tier 1 종단 처리
// PatternLibrary가 Tier 1에서도 선택 불가인 경우 빈 패턴으로 라운드 진행
// round-manager는 다음 ROUND_STARTED 대기 (라운드 스킵 처리)
applyEmptyPattern(): void {
  // 모든 게이트 셀을 Idle 유지 — 이번 라운드 폭발 없음
  // ROUND_CLEAR 흐름은 round-manager가 타임아웃 또는 Goal Cell 도달로 처리
}

// Invariants:
// 1. GRID_STALLED 발행 시 setGatePeriod 재호출 금지 (게이트 리듬 보존).
// 2. RoundEscalation은 GRID_STALLED 핸들러에서 ESCALATION_COMPUTED만 발행.
//    직접 PatternLibrary 호출 금지 (레이어 경계 ADR-0003).
// 3. PatternLibrary는 stalledFallback=true ESCALATION_COMPUTED에서 재선택 시작.
//    재선택 실패 3회 → GRID_STALLED 재발행. 무한루프 방지는 flush 큐가 보장.
```

## Alternatives Considered

### Alternative A: 동기 직접 호출 체인
- **Description**: PatternLibrary가 선택 실패 시 직접 `RoundEscalation.handleStall()` 호출 → 반환값으로 강등 Tier 수신 → 즉시 재선택
- **Pros**: 동일 프레임에서 처리 완료. 체인 프레임 지연 없음.
- **Cons**: **스택 오버플로우 위험** — 재선택 실패 시 핸들러 내 재귀 발생. 레이어 경계 위반(PatternLibrary→RoundEscalation 직접 참조). EventBus 설계 원칙(ADR-0001) 위반.
- **Rejection Reason**: ADR-0001의 핵심 채택 이유 중 하나가 바로 이 3자 체인의 재귀 방지. ADR-0001 Rejection Reason Alternative C 참조.

### Alternative B: RoundEscalation이 폴링으로 PatternLibrary 재시도 관리
- **Description**: RoundEscalation이 while 루프로 PatternLibrary.selectPattern() 반복 호출, 성공 시 GridSimulation에 직접 전달
- **Pros**: 체인 프레임 지연 없음. 단일 시스템이 재시도 로직 소유.
- **Cons**: 레이어 경계 위반(Feature → Core 직접 호출 다수). while 루프가 단일 프레임에서 실행되면 프레임 예산 초과 위험. PatternLibrary/GridSimulation이 RoundEscalation에 강결합.
- **Rejection Reason**: 레이어 경계(ADR-0003) 위반. 프레임 예산 위험.

## Consequences

### Positive
- EventBus flush 큐가 재귀를 구조적으로 방지 — 추가 재진입 guard 불필요
- 각 시스템의 GRID_STALLED 책임이 이 ADR로 canonical 확정 → 구현 시 오해 없음
- setGatePeriod 재호출 없음 → 게이트 리듬이 GRID_STALLED 중에도 유지 → 플레이어 예측 가능성 보존

### Negative
- 체인 처리에 최대 9프레임(~150ms) 소요 — 극단적 케이스에서 체감 지연 가능
- stalledFallback=true 패턴이 ESCALATION_COMPUTED 소비자에게 전파 — 각 소비자가 이 플래그 처리 여부 결정 필요 (HUD 등)

### Risks
- **무한 Tier 1 루프**: Tier 1 패턴이 모두 런타임 검증에 실패하면 프레임마다 GRID_STALLED 발행. **Mitigation**: GridSimulation이 Tier 1 종단 조건(동일 라운드 × 동일 Tier × 2회 이상 GRID_STALLED) 감지 시 빈 패턴 적용. BFS 사전 검증으로 실제 발생 거의 불가.
- **플레이어 사망과 체인 겹침**: GRID_STALLED 처리 중 플레이어 폭발 판정 발생 → PLAYER_KILLED 이벤트가 큐에 쌓임. **Mitigation**: EventBus FIFO 순서 보장 — GRID_STALLED 체인 이벤트와 PLAYER_KILLED가 큐에서 순서대로 처리됨.

## GDD Requirements Addressed

| GDD System | Requirement | How This ADR Addresses It |
|------------|-------------|--------------------------|
| round-manager.md | EC-RM-5b: GRID_STALLED 3자 처리 순서 canonical | 이 ADR이 EC-RM-5b의 canonical 아키텍처 구현체 |
| round-escalation.md | RE-5: GRID_STALLED 수신 시 Tier 강등 + ESCALATION_COMPUTED 재발행 | RoundEscalation 핸들러 책임 확정. setGatePeriod 미호출 명시 |
| round-escalation.md | F-RE-3: fallbackTier = max(1, currentTier-1) | RoundEscalation 핸들러 공식 |
| grid-explosion.md | Tier 1 전부 실패 시 빈 패턴 라운드 스킵 | GridSimulation 종단 처리 책임 |

## Performance Implications
- **CPU**: 최악 케이스 9프레임 × PatternLibrary 선택(3회 재시도) = 최대 27회 BFS. 각 BFS <0.5ms → 총 <13.5ms. 매우 희귀한 케이스.
- **Memory**: GRID_STALLED, ESCALATION_COMPUTED 이벤트 객체 큐 추가 — 무시 가능
- **Load Time**: 없음
- **Network**: 없음 (클라이언트 로컬 처리)

## Migration Plan
신규 시스템 — 기존 코드 없음. 구현 순서:
1. PatternLibrary: GRID_STALLED 발행 조건 구현 (3회 연속 실패, ADR-0007)
2. RoundEscalation: GRID_STALLED 핸들러 → F-RE-3 강등 → ESCALATION_COMPUTED(stalledFallback=true) 재발행
3. PatternLibrary: stalledFallback=true ESCALATION_COMPUTED 수신 시 재선택 흐름
4. GridSimulation: 종단 빈 패턴 처리
5. 통합 테스트: Tier 3 → 2 → 1 → 스킵 전체 체인

## Validation Criteria
- [ ] GRID_STALLED 발행 시 동일 프레임에서 핸들러가 실행되지 않음 (다음 flush 처리 확인)
- [ ] T3 → T2 강등: ESCALATION_COMPUTED(tier=2, stalledFallback=true) 발행 확인
- [ ] T1 3회 실패 후 빈 패턴 처리로 종단 (무한 루프 없음)
- [ ] GRID_STALLED 체인 중 setGatePeriod 재호출 없음 확인
- [ ] GRID_STALLED 체인 중 PLAYER_KILLED 발생 시 EventBus FIFO 순서 처리 확인

## Related Decisions
- ADR-0001: EventBus — flush 큐 패턴이 이 체인의 재귀를 구조적으로 방지 (Alternative C 기각 이유)
- ADR-0006: Gate Period — GRID_STALLED 중 setGatePeriod 재호출 금지
- ADR-0007: PatternLibrary — GRID_STALLED 발행 주체 및 재선택 로직
- `docs/architecture/architecture.md` § Core Layer, § Data Flow (EventBus)
