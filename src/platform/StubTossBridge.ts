import { ITossBridge, SafeArea } from './ITossBridge';

export class StubTossBridge implements ITossBridge {
  private initialized = false;

  async init(): Promise<void> {
    this.initialized = true;
  }

  getSafeArea(): SafeArea {
    if (!this.initialized) throw new Error('TossBridge.init() must be called before getSafeArea()');
    return { top: 44, bottom: 34, left: 0, right: 0 };
  }

  getUserToken(): string {
    if (!this.initialized) throw new Error('TossBridge.init() must be called before getUserToken()');
    return 'stub-token';
  }
}
