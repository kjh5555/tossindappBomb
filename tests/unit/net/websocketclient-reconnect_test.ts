import { EventBus } from '../../../src/core/events/EventBus';
import { WebSocketReconnectManager } from '../../../src/core/net/WebSocketReconnectManager';
import { MockWebSocketClient } from '../../helpers/MockWebSocketClient';
import { MockFrameClock } from '../../helpers/MockFrameClock';

describe('WebSocketReconnectManager — 연결 끊김 재연결 로직 (ADR-0010)', () => {
  test('AC-1: simulateDisconnect → isConnected false', async () => {
    const mock = new MockWebSocketClient();
    await mock.connect('ws://test', 'tok');
    expect(mock.isConnected).toBe(true);
    mock.simulateDisconnect();
    expect(mock.isConnected).toBe(false);
  });

  test('AC-2: 재연결 성공 → GAME_OVER 미발행', async () => {
    const bus = new EventBus();
    const clock = new MockFrameClock();
    const mock = new MockWebSocketClient();
    await mock.connect('ws://test', 'tok');

    const manager = new WebSocketReconnectManager(mock, bus, clock, 'ws://test', 'tok');
    manager.mount();

    let gameOverFired = false;
    bus.on('GAME_OVER', () => { gameOverFired = true; });

    mock.simulateDisconnect();
    // connect() succeeds by default in MockWebSocketClient
    await Promise.resolve(); // flush microtasks

    clock.advanceBy(0.1, bus);
    expect(gameOverFired).toBe(false);
    expect(mock.isConnected).toBe(true);
  });

  test('AC-3: 재연결 실패 → GAME_OVER 발행', async () => {
    const bus = new EventBus();
    const clock = new MockFrameClock();
    const mock = new MockWebSocketClient();

    // Override before initial connect so count tracks all calls
    let connectCallCount = 0;
    (mock as any).connect = async () => {
      connectCallCount++;
      if (connectCallCount > 1) throw new Error('connection refused');
      (mock as any)._isConnected = true;
    };

    await mock.connect('ws://test', 'tok'); // count=1, succeeds

    const manager = new WebSocketReconnectManager(mock, bus, clock, 'ws://test', 'tok');
    manager.mount();

    let gameOverFired = false;
    bus.on('GAME_OVER', () => { gameOverFired = true; });

    mock.simulateDisconnect();
    await Promise.resolve(); // microtask: connect rejects, catch emits GAME_OVER

    clock.advanceBy(0.1, bus);
    expect(gameOverFired).toBe(true);
  });

  test('AC-4: 재시도 1회 초과 없음', async () => {
    const bus = new EventBus();
    const clock = new MockFrameClock();
    const mock = new MockWebSocketClient();

    let connectCallCount = 0;
    (mock as any).connect = async () => {
      connectCallCount++;
      if (connectCallCount > 1) throw new Error('refused');
    };

    await (mock as any).connect(); // initial connect (count=1)

    const manager = new WebSocketReconnectManager(mock, bus, clock, 'ws://test', 'tok');
    manager.mount();

    mock.simulateDisconnect();
    await Promise.resolve();

    // Initial connect (1) + 1 reconnect attempt = 2 total
    expect(connectCallCount).toBe(2);
  });
});
