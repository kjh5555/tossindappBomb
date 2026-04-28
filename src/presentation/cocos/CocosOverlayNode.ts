/**
 * CocosOverlayNode.ts
 * cc.Node 래핑 — IOverlayNode.visible을 cc.Node.active에 매핑.
 *
 * Implements: production/sprints/sprint-7 (TD-P0-01)
 * Governed by: ADR-0016 (Presentation 레이어), src/presentation/cocos/README.md
 *
 * cc.Node.active는 두 가지 효과:
 *   1. 노드 + 자식 렌더링 ON/OFF
 *   2. cc.Component.update() 호출 ON/OFF
 *
 * GRID REAPER overlay (ResultOverlay, PauseOverlay)는 visible=false일 때
 * 둘 다 멈춰야 하므로 active 플래그 1:1 매핑이 정확.
 */

import { Node } from 'cc';
import type { IOverlayNode } from '../hud/ResultOverlay';

export class CocosOverlayNode implements IOverlayNode {
  constructor(private readonly node: Node) {}

  get visible(): boolean {
    return this.node.active;
  }

  set visible(value: boolean) {
    this.node.active = value;
  }
}
