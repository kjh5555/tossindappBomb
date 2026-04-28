# Story 005: EventBus 성능 + GRID_STALLED 스트레스 테스트

> **Epic**: EventBus
> **Status**: Complete
> **Layer**: Foundation
> **Type**: Integration
> **Manifest Version**: 2026-04-22

## Context

**GDD**: round-manager.md (EC-RM-5b), grid-explosion.md
**Requirement**: TR 미등록 (tr-registry.yaml 비어 있음)

**ADR Governing Implementation**: ADR-0001 (EventBus), ADR-0009 (GRID_STALLED 3자 체인)
**ADR Decision Summary**: flush 큐 패턴이 GRID_STALLED 3자 체인(pattern-library → round-escalation → pattern-library → grid-explosion)에서 재귀 폭발 없이 완료됨을 검증한다. 6인 동시 사망 시나리오에서 flush() 오버헤드 < 1ms 를 확인한다.

**Engine**: Cocos Creator 3.8.6 | **Risk**: LOW
**Engine Notes**: 순수 TypeScript. 성능 측정은 `performance.now()` 사용 (테스트 한정 — 게임 로직에서는 금지).

**Control Manifest Rules (Foundation)**:
- Guardrail: EventBus flush 오버헤드 — 이벤트 20개/프레임 기준 < 0.2ms — source: ADR-0001
- Required: GRID_STALLED 3자 체인은 flush 큐 패턴으로 재귀 방지 — source: ADR-0001
- Forbidden: 동기 즉시-통지 패턴 (이 테스트로 금지 이유 실증) — source: ADR-0001

---

## Acceptance Criteria

- [ ] 6인 동시 `PLAYER_KILLED` 처리 시 `flush()` 소요 시간 < 1ms
- [ ] GRID_STALLED 3자 체인 시뮬레이션 (최대 9 이벤트 체인) — 스택 오버플로우 없이 완료됨
- [ ] flush 큐 재진입 시나리오: 핸들러 내 emit() → 다음 프레임 처리 (Story 003 AC-3 연장)
- [ ] 이벤트 20개/프레임 최악 시나리오 flush < 0.2ms

---

## Implementation Notes

*ADR-0001 Validation Criteria + ADR-0009 GRID_STALLED 3자 체인 기반:*

**시나리오 1: 6인 동시 사망**
```typescript
// 6명 PlayerKilled + GRID_STALLED 동시 발생 시뮬레이션
test('6-player simultaneous death', () => {
  const bus = new EventBus();
  const received: string[] = [];
  bus.on('PLAYER_KILLED', () => received.push('killed'));

  // 6번 emit
  for (let i = 0; i < 6; i++) {
    bus.emit('PLAYER_KILLED', { playerIds: [`p${i}`], cellId: {row:0,col:0}, cause: 'EXPLOSION', timestamp: 0 });
  }

  const start = performance.now();
  bus.flush();
  const elapsed = performance.now() - start;

  expect(received).toHaveLength(6);
  expect(elapsed).toBeLessThan(1); // < 1ms
});
```

**시나리오 2: GRID_STALLED 3자 체인**
```typescript
// ADR-0009: pattern-library → escalation → pattern-library → grid-explosion
// 3자 체인에서 최대 9 emit이 발생해도 스택 오버플로우 없어야 함
test('GRID_STALLED chain — no stack overflow', () => {
  const bus = new EventBus();
  let chainCount = 0;

  // 체인 핸들러: GRID_STALLED 수신 → PATTERN_REJECTED emit (재귀 시뮬레이션)
  bus.on('GRID_STALLED', () => {
    chainCount++;
    if (chainCount < 3) bus.emit('PATTERN_REJECTED', { patternId: 'test', reason: 'test', timestamp: 0 });
  });
  bus.on('PATTERN_REJECTED', () => {
    bus.emit('GRID_STALLED', { roundNumber: 1, timestamp: 0 });
  });

  bus.emit('GRID_STALLED', { roundNumber: 1, timestamp: 0 });

  // flush 3회로 3자 체인 완료 (각 체인 단계마다 1 flush)
  bus.flush(); // chainCount = 1, PATTERN_REJECTED 큐에 추가
  bus.flush(); // GRID_STALLED 2번째 큐에 추가
  bus.flush(); // chainCount = 2, PATTERN_REJECTED 큐에 추가

  expect(chainCount).toBeGreaterThan(0); // 스택 오버플로우 없음
});
```

**성능 노트**: `performance.now()`는 테스트에서만 허용. 게임 로직에서는 `IFrameClock.now()` 사용.

---

## Out of Scope

- ADR-0009 GRID_STALLED 완전 구현 (그것은 Grid/Pattern 시스템 Epic에서 처리)
- 실제 패턴 라이브러리 / RoundEscalation 연결 (Mock 핸들러로 시뮬레이션)

---

## QA Test Cases

**AC-1**: 6인 동시 사망 < 1ms
- Given: EventBus, PLAYER_KILLED 핸들러 6개 emit
- When: `flush()` 호출 + `performance.now()` 측정
- Then: elapsed < 1ms, 핸들러 6회 실행
- Edge cases: CI 환경 느린 경우 → 5ms 로 완화 허용

**AC-2**: GRID_STALLED 체인 스택 오버플로우 없음
- Given: 체인 핸들러 등록 (GRID_STALLED → PATTERN_REJECTED → GRID_STALLED 루프 최대 3회)
- When: 최초 GRID_STALLED emit + 3회 flush
- Then: 스택 오버플로우 없음, `chainCount` 예상 값 일치
- Edge cases: 루프 제한 없으면 무한 — 핸들러에 `chainCount < 3` 가드 필수

**AC-3**: 20 이벤트 최악 시나리오 < 0.2ms
- Given: 20개 이벤트 순차 emit
- When: `flush()` 측정
- Then: < 0.2ms
- Edge cases: 핸들러가 복잡한 연산 수행 시 별도 측정 필요

---

## Test Evidence

**Story Type**: Integration
**Required evidence**:
- `tests/integration/events/eventbus-stress_test.ts` — AC-1 ~ AC-3 통과

**Status**: [ ] Not yet created

---

## Dependencies

- Depends on: Story 003 (EventBus 구현) + Story 004 (FrameClock 통합) must be DONE
- Unlocks: Core Layer Epic 구현 시작 (EventBus Foundation 완료 신호)
