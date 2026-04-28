import { MockWebSocketClient } from '../../helpers/MockWebSocketClient';
import { IWebSocketClient } from '../../../src/core/net/IWebSocketClient';

describe('WebSocketClient — IWebSocketClient 인터페이스 + MockWebSocketClient (ADR-0010)', () => {
  test('AC-1: IWebSocketClient 인터페이스 형상 검증', () => {
    const mock: IWebSocketClient = new MockWebSocketClient();
    expect(typeof mock.connect).toBe('function');
    expect(typeof mock.disconnect).toBe('function');
    expect(typeof mock.send).toBe('function');
    expect(typeof mock.on).toBe('function');
    expect(typeof mock.off).toBe('function');
    expect(typeof mock.isConnected).toBe('boolean');
  });

  test('AC-2: connect() → isConnected true, disconnect() → isConnected false', async () => {
    const mock = new MockWebSocketClient();
    expect(mock.isConnected).toBe(false);
    await mock.connect('ws://test', 'token');
    expect(mock.isConnected).toBe(true);
    mock.disconnect();
    expect(mock.isConnected).toBe(false);
  });

  test('AC-3: on/simulateMessage → 핸들러 실행', async () => {
    const mock = new MockWebSocketClient();
    await mock.connect('ws://test', 'tok');
    let received: any = null;
    mock.on('PLAYER_KILLED', p => { received = p; });
    mock.simulateMessage('PLAYER_KILLED', { playerIds: ['p1'], cellId: 10, cause: 'EXPLOSION', timestamp: 1.0 });
    expect(received).not.toBeNull();
    expect(received.playerIds[0]).toBe('p1');
    expect(received.cause).toBe('EXPLOSION');
  });

  test('AC-4: off() → 핸들러 미실행', async () => {
    const mock = new MockWebSocketClient();
    await mock.connect('ws://test', 'tok');
    let callCount = 0;
    const handler = () => { callCount++; };
    mock.on('PLAYER_KILLED', handler);
    mock.off('PLAYER_KILLED', handler);
    mock.simulateMessage('PLAYER_KILLED', { playerIds: ['p1'], cellId: 0, cause: 'EXPLOSION', timestamp: 0 });
    expect(callCount).toBe(0);
  });

  test('AC-5: send() → sentMessages 배열에 기록', async () => {
    const mock = new MockWebSocketClient();
    await mock.connect('ws://test', 'tok');
    mock.send({ type: 'MOVE', payload: { direction: 'UP', fromCell: 0, timestamp: 0.5 } });
    expect(mock.sentMessages).toHaveLength(1);
    expect(mock.sentMessages[0].type).toBe('MOVE');
  });

  test('AC-6: 다중 핸들러 등록 — 모두 실행', async () => {
    const mock = new MockWebSocketClient();
    await mock.connect('ws://test', 'tok');
    const calls: number[] = [];
    mock.on('ROUND_START', () => calls.push(1));
    mock.on('ROUND_START', () => calls.push(2));
    mock.simulateMessage('ROUND_START', { roundNumber: 1, seed: 42, playerPositions: {} });
    expect(calls).toEqual([1, 2]);
  });
});
