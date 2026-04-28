/**
 * CocosLabel.ts
 * cc.Label 래핑 — IHUDLabel/ILabel 인터페이스로 노출.
 *
 * Implements: production/sprints/sprint-7 (TD-P0-01 — Cocos 통합)
 * Governed by: ADR-0016 (Presentation 레이어), src/presentation/cocos/README.md
 *
 * Real cc.Label은 string 외에도 fontSize, color, lineHeight 등을 노출하지만
 * GRID REAPER의 모든 HUD 라벨은 string property만 동적으로 변경한다 (font/color는
 * Cocos Editor에서 정적 설정). 따라서 wrapper는 string만 노출한다.
 *
 * Verification: Sprint 7 통합 시 Cocos Editor에서 cc.Label 노드 부착 후
 * `new CocosLabel(label.getComponent(Label))` 형태로 사용. 본 wrapper의 string
 * setter가 cc.Label의 setter와 동일하게 동작하는지는 cc-mock으로 검증됨.
 */

import { Label } from 'cc';
import type { IHUDLabel } from '../hud/HUDLayer';
import type { ILabel } from '../hud/ResultOverlay';

export class CocosLabel implements IHUDLabel, ILabel {
  constructor(private readonly label: Label) {}

  get string(): string {
    return this.label.string;
  }

  set string(value: string) {
    this.label.string = value;
  }
}
