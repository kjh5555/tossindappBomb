/**
 * ITranslator.ts
 * Localization 추상화 — 키 기반 텍스트 lookup + variable substitution.
 *
 * Implements: production/sprints/sprint-7+ (TD-P1-01 closing)
 * Governed by: design/ux/ — 모든 UI 라벨은 loc string 경유 (하드코딩 금지)
 *
 * 사용 패턴:
 *   const t = new JsonTranslator({ en: enMap, ko: koMap }, 'en');
 *   t.translate('hud.round', { round: 3 }); // "Round 3"
 *   t.setLocale('ko');
 *   t.translate('hud.round', { round: 3 }); // "라운드 3"
 *
 * Variable substitution: `{name}` 패턴 사용. 누락된 변수는 placeholder 그대로 유지.
 * Missing key: fallback locale 시도 → 그것도 없으면 key 자체를 반환 (debug 도움).
 */

export interface LocaleMap {
  readonly [key: string]: string;
}

export interface ITranslator {
  /**
   * 키를 현재 locale에 맞게 번역. vars로 {name} 형태 placeholder 치환.
   *
   * @example
   *   translate('result.final_round', { round: 5 }) // "Final Round: 5"
   */
  translate(key: string, vars?: Record<string, string | number>): string;

  /** 현재 locale 변경. 미등록 locale은 무시 (false 반환). */
  setLocale(locale: string): boolean;

  /** 현재 locale. */
  getLocale(): string;

  /** 등록된 locale 여부. */
  hasLocale(locale: string): boolean;

  /** 등록된 모든 locale 키. */
  getAvailableLocales(): string[];
}
