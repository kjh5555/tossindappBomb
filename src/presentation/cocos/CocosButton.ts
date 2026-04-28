/**
 * CocosButton.ts
 * cc.Button 래핑 — onClick/offClick을 cc.Button.node 이벤트로 변환.
 *
 * Implements: production/sprints/sprint-7 (TD-P0-01)
 * Governed by: ADR-0016 (Presentation 레이어), src/presentation/cocos/README.md
 *
 * Real cc.Button은 click 이벤트를 host Node에 발행한다:
 *   button.node.on(Button.EventType.CLICK, handler, target)
 * 이는 IButton 인터페이스의 onClick 단일 메서드와 차이가 있어 wrapper에서 변환.
 *
 * 핸들러 reference equality 보장: offClick(handler)으로 정확히 동일 handler를
 * 등록 해제하기 위해 wrapped function reference를 Map으로 보관 (FrameClock.ts와
 * 동일 패턴 — ADR-0002).
 */

import { Button } from 'cc';
import type { IButton } from '../hud/ResultOverlay';

export class CocosButton implements IButton {
  /** 외부 핸들러 → cc 노드에 등록된 wrapped function 매핑. */
  private readonly handlerMap: Map<() => void, () => void> = new Map();

  constructor(private readonly button: Button) {}

  onClick(handler: () => void): void {
    if (this.handlerMap.has(handler)) return; // 중복 등록 방지
    const wrapped = (): void => handler();
    this.handlerMap.set(handler, wrapped);
    this.button.node.on(Button.EventType.CLICK, wrapped, this);
  }

  offClick(handler: () => void): void {
    const wrapped = this.handlerMap.get(handler);
    if (!wrapped) return;
    this.button.node.off(Button.EventType.CLICK, wrapped, this);
    this.handlerMap.delete(handler);
  }
}
