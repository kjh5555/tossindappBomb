import { StubTossBridge } from '../../../src/platform/StubTossBridge';
import { ITossBridge, SafeArea } from '../../../src/platform/ITossBridge';

describe('TossBridge — ITossBridge 인터페이스 + StubTossBridge (ADR-0004)', () => {
  test('AC-1: init() 전 getSafeArea() → throw', () => {
    const stub = new StubTossBridge();
    expect(() => stub.getSafeArea()).toThrow(/init/i);
  });

  test('AC-2: init() 전 getUserToken() → throw', () => {
    const stub = new StubTossBridge();
    expect(() => stub.getUserToken()).toThrow(/init/i);
  });

  test('AC-3: init() 완료 후 getSafeArea() 정상 반환', async () => {
    const stub = new StubTossBridge();
    await stub.init();
    const area: SafeArea = stub.getSafeArea();
    expect(area).toEqual({ top: 44, bottom: 34, left: 0, right: 0 });
  });

  test('AC-4: init() 완료 후 getUserToken() 정상 반환', async () => {
    const stub = new StubTossBridge();
    await stub.init();
    expect(stub.getUserToken()).toBe('stub-token');
  });

  test('AC-5: StubTossBridge가 ITossBridge 인터페이스 충족 (타입 할당)', async () => {
    // TypeScript 컴파일 타임 검증 — 런타임에서 DI 패턴 확인
    const bridge: ITossBridge = new StubTossBridge();
    await bridge.init();
    expect(bridge.getUserToken()).toBe('stub-token');
    expect(bridge.getSafeArea().top).toBe(44);
  });
});
