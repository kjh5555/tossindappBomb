# Story 002: MockFrameClock PLAYER_ARRIVED 0.1s 패턴 검증

> **Epic**: FrameClock
> **Status**: Complete
> **Layer**: Foundation
> **Type**: Integration
> **Manifest Version**: 2026-04-22

## Context

**GDD**: N/A — ADR-0002 + ADR-0008 권위
**Requirement**: TR 미등록 (tr-registry.yaml 비어 있음 — /architecture-review 미실행)
*(ADR-0008 Validation Criteria에서 추출)*

**ADR Governing Implementation**: ADR-0002 (FrameClock), ADR-0008 (Player Movement)
**ADR Decision Summary**: PLAYER_MOVED는 t=0 즉시 발행, PLAYER_ARRIVED는 `FrameClock.schedule(fn, 0.1)` 기반 t=0.1s 후 발행. MockFrameClock.advanceBy()로 시간 진행을 제어하여 정확한 타이밍을 검증한다.

**Engine**: Cocos Creator 3.8.6 | **Risk**: LOW
**Engine Notes**: 순수 TypeScript. MockFrameClock으로 Cocos update 루프 없이 시간 진행 제어 가능.

**Control Manifest Rules (Foundation)**:
- Required: `PLAYER_ARRIVED`는 t=0.1s 트윈 완료 후 발행, round-manager Goal 판정 입력 — source: ADR-0008
- Required: `FrameClock.schedule(fn, 0.1)` 사용 — simulatedTime 기준 상대 딜레이 — source: ADR-0002
- Forbidden: `Date.now()` 또는 `setTimeout` 기반 PLAYER_ARRIVED 지연 — source: ADR-0002

---

## Acceptance Criteria

- [ ] MockFrameClock `advanceBy(0.05)` 2회 → PLAYER_ARRIVED 핸들러 1회 실행
- [ ] `advanceBy(0.05)` 1회 → PLAYER_ARRIVED 미실행 (0.05s < 0.1s)
- [ ] PLAYER_KILLED 발생 시 `cancelSchedule` 로 PLAYER_ARRIVED 취소 → tick 진행 후 미실행
- [ ] PLAYER_ARRIVED 페이로드의 `playerId`, `cell` 이 PLAYER_MOVED 페이로드와 일치

---

## Implementation Notes

*ADR-0008 Decision + ADR-0002 schedule() 기반:*

```typescript
// 시뮬레이션 패턴 (PlayerMovement 구현 예시)
class PlayerMovementSim {
  constructor(private clock: IFrameClock, private bus: IEventBus) {}

  move(playerId: string, from: CellCoord, to: CellCoord): void {
    this.bus.emit('PLAYER_MOVED', { playerId, from, to, timestamp: this.clock.now() });
    const arrivedFn = () => {
      this.bus.emit('PLAYER_ARRIVED', { playerId, cell: to, timestamp: this.clock.now() });
    };
    this.clock.schedule(arrivedFn, 0.1);
    this._arrivedFn = arrivedFn; // 취소 용도로 보관
  }

  cancelArrival(): void {
    if (this._arrivedFn) this.clock.cancelSchedule(this._arrivedFn);
  }

  private _arrivedFn?: () => void;
}
```

---

## Out of Scope

- 실제 PlayerMovement 컴포넌트 구현 (Core 레이어 epic)
- Cocos 트윈 애니메이션 연결 (Presentation 레이어)

---

## QA Test Cases

**AC-1**: advanceBy(0.05) × 2 → PLAYER_ARRIVED 1회 실행
- Given: MockFrameClock + EventBus + PlayerMovementSim. move('p1', {0,0}, {0,1}) 호출.
- When: mockClock.advanceBy(0.05, bus) 2회 호출 (simulatedTime = 0.10)
- Then: PLAYER_ARRIVED 핸들러 1회 호출, playerId='p1', cell={0,1}
- Edge cases: advanceBy(0.10, bus) 1회도 동일 결과

**AC-2**: advanceBy(0.05) 1회만 → PLAYER_ARRIVED 미실행
- Given: 동일 셋업
- When: mockClock.advanceBy(0.05, bus) 1회
- Then: PLAYER_ARRIVED 핸들러 호출 횟수 = 0

**AC-3**: PLAYER_KILLED → cancelSchedule → PLAYER_ARRIVED 미실행
- Given: move('p1') 호출로 스케줄 등록됨
- When: sim.cancelArrival() 호출 후 advanceBy(0.15, bus)
- Then: PLAYER_ARRIVED 핸들러 호출 횟수 = 0

**AC-4**: PLAYER_ARRIVED 페이로드 일치
- Given: move('p2', {3,3}, {3,4}) 호출
- When: advanceBy(0.12, bus)
- Then: PLAYER_ARRIVED.playerId === 'p2', PLAYER_ARRIVED.cell === {row:3,col:4}

---

## Test Evidence

**Story Type**: Integration
**Required evidence**:
- `tests/integration/time/frameclock-player-movement_test.ts` — AC-1 ~ AC-4 통과

**Status**: [ ] Not yet created

---

## Dependencies

- Depends on: Story 001 (FrameClock 완성 + dt() 추가) must be DONE
- Unlocks: FrameClock Epic DoD 충족 → Core Layer Epic 구현 시작 가능
