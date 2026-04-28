/**
 * JsonTranslator.ts
 * In-memory JSON-style locale map 기반 ITranslator 구현.
 *
 * Implements: production/sprints/sprint-7+ (TD-P1-01)
 * Governed by: ITranslator interface
 *
 * Lookup 순서:
 *   1. current locale의 key
 *   2. fallback locale의 key (default 'en')
 *   3. key 자체 (디버그 도움 — 누락 키 발견 가능)
 *
 * Variable substitution:
 *   - `{name}` 패턴
 *   - 매칭 변수 없으면 placeholder 그대로 유지 (조용히 실패하지 않음)
 */

import type { ITranslator, LocaleMap } from './ITranslator';

/** `{var}` 패턴 — 영숫자 + underscore 변수명. */
const VAR_PATTERN = /\{(\w+)\}/g;

export class JsonTranslator implements ITranslator {
  private currentLocale: string;

  /**
   * @param localeMaps      - { 'en': enMap, 'ko': koMap, ... }
   * @param initialLocale   - 시작 locale (반드시 localeMaps에 존재)
   * @param fallbackLocale  - 키 누락 시 fallback (default 'en')
   */
  constructor(
    private readonly localeMaps: Record<string, LocaleMap>,
    initialLocale: string,
    private readonly fallbackLocale: string = 'en',
  ) {
    if (!localeMaps[initialLocale]) {
      throw new Error(
        `JsonTranslator: initialLocale '${initialLocale}' not loaded. ` +
          `Available: ${Object.keys(localeMaps).join(', ')}`,
      );
    }
    this.currentLocale = initialLocale;
  }

  translate(key: string, vars?: Record<string, string | number>): string {
    const fromCurrent = this.localeMaps[this.currentLocale]?.[key];
    const fromFallback = this.localeMaps[this.fallbackLocale]?.[key];
    const template = fromCurrent ?? fromFallback ?? key;

    if (!vars) return template;

    return template.replace(VAR_PATTERN, (match: string, name: string) => {
      if (Object.prototype.hasOwnProperty.call(vars, name)) {
        return String(vars[name]);
      }
      return match; // placeholder 보존 — 디버그 가시성
    });
  }

  setLocale(locale: string): boolean {
    if (!this.localeMaps[locale]) return false;
    this.currentLocale = locale;
    return true;
  }

  getLocale(): string {
    return this.currentLocale;
  }

  hasLocale(locale: string): boolean {
    return Boolean(this.localeMaps[locale]);
  }

  getAvailableLocales(): string[] {
    return Object.keys(this.localeMaps);
  }
}
