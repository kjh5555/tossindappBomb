/**
 * JsonTranslator unit test — Sprint 7+ TD-P1-01
 *
 * 검증:
 *  - 키 lookup (current locale)
 *  - Fallback locale (current에 없으면 fallback 시도)
 *  - Missing key — key 자체 반환
 *  - Variable substitution ({name} 패턴)
 *  - Locale 전환
 *  - 게임 starter strings (en + ko) — 키 일관성
 */

import { JsonTranslator } from '../../../src/core/localization/JsonTranslator';
import { en } from '../../../src/core/localization/locales/en';
import { ko } from '../../../src/core/localization/locales/ko';

describe('JsonTranslator — basic lookup', () => {
  test('current locale의 key 반환', () => {
    const t = new JsonTranslator({ en, ko }, 'en');
    expect(t.translate('lobby.start')).toBe('START');
  });

  test('locale 전환 후 다른 값 반환', () => {
    const t = new JsonTranslator({ en, ko }, 'en');
    t.setLocale('ko');
    expect(t.translate('lobby.start')).toBe('시작');
  });

  test('미등록 locale로 setLocale → false 반환 + 변경 없음', () => {
    const t = new JsonTranslator({ en, ko }, 'en');
    const ok = t.setLocale('ja');
    expect(ok).toBe(false);
    expect(t.getLocale()).toBe('en');
  });

  test('hasLocale + getAvailableLocales', () => {
    const t = new JsonTranslator({ en, ko }, 'en');
    expect(t.hasLocale('en')).toBe(true);
    expect(t.hasLocale('ko')).toBe(true);
    expect(t.hasLocale('ja')).toBe(false);
    expect(t.getAvailableLocales().sort()).toEqual(['en', 'ko']);
  });
});

describe('JsonTranslator — fallback', () => {
  test('current에 없는 key → fallback locale 시도', () => {
    const partialKo = { 'lobby.start': '시작' }; // 다른 키 없음
    const t = new JsonTranslator({ en, ko: partialKo }, 'ko', 'en');
    // 'common.loading'은 partialKo에 없으나 en에 있음
    expect(t.translate('common.loading')).toBe('Loading...');
  });

  test('current + fallback 모두 없는 key → key 자체 반환', () => {
    const partialEn = { 'a': 'A' };
    const t = new JsonTranslator({ en: partialEn }, 'en');
    expect(t.translate('missing.key')).toBe('missing.key');
  });

  test('default fallback은 en — current가 ko이면 en 시도', () => {
    const partialKo = { 'lobby.start': '시작' };
    const t = new JsonTranslator({ en, ko: partialKo }, 'ko');
    // hud.round는 partialKo에 없으나 en에 있음
    expect(t.translate('hud.round', { round: 1 })).toBe('Round 1');
  });
});

describe('JsonTranslator — variable substitution', () => {
  test('{name} 치환', () => {
    const t = new JsonTranslator({ en, ko }, 'en');
    expect(t.translate('hud.round', { round: 5 })).toBe('Round 5');
  });

  test('여러 변수 치환', () => {
    const t = new JsonTranslator({ en: { 'pair': '{a} and {b}' } }, 'en');
    expect(t.translate('pair', { a: 'foo', b: 42 })).toBe('foo and 42');
  });

  test('vars 누락 시 placeholder 보존', () => {
    const t = new JsonTranslator({ en: { 'msg': 'Hello {name}' } }, 'en');
    expect(t.translate('msg')).toBe('Hello {name}');
    expect(t.translate('msg', {})).toBe('Hello {name}');
    expect(t.translate('msg', { other: 'x' })).toBe('Hello {name}');
  });

  test('숫자 변수 → 문자열 변환', () => {
    const t = new JsonTranslator({ en: { 'count': 'Count: {n}' } }, 'en');
    expect(t.translate('count', { n: 0 })).toBe('Count: 0');
    expect(t.translate('count', { n: -3.14 })).toBe('Count: -3.14');
  });

  test('동일 변수 여러 번 등장 — 모두 치환', () => {
    const t = new JsonTranslator(
      { en: { 'echo': '{x} {x} {x}' } },
      'en',
    );
    expect(t.translate('echo', { x: 'go' })).toBe('go go go');
  });
});

describe('JsonTranslator — invariants', () => {
  test('생성자에서 미등록 initialLocale → throw', () => {
    expect(() => new JsonTranslator({ en }, 'ja')).toThrow();
  });

  test('빈 localeMaps + 미등록 initialLocale → throw', () => {
    expect(() => new JsonTranslator({}, 'en')).toThrow();
  });
});

describe('Game starter locales — en + ko 일관성', () => {
  test('두 locale에 동일한 키 set', () => {
    const enKeys = Object.keys(en).sort();
    const koKeys = Object.keys(ko).sort();
    expect(koKeys).toEqual(enKeys);
  });

  test('실제 게임 string 출력 검증 (en)', () => {
    const t = new JsonTranslator({ en, ko }, 'en');
    expect(t.translate('lobby.title')).toBe('GRID REAPER');
    expect(t.translate('result.game_over')).toBe('Game Over');
    expect(t.translate('pause.title')).toBe('PAUSED');
    expect(t.translate('hud.alive', { count: 3 })).toBe('3 alive');
    expect(t.translate('result.final_round', { round: 7 })).toBe('Final Round: 7');
  });

  test('실제 게임 string 출력 검증 (ko)', () => {
    const t = new JsonTranslator({ en, ko }, 'ko');
    expect(t.translate('lobby.title')).toBe('GRID REAPER');
    expect(t.translate('result.game_over')).toBe('게임 오버');
    expect(t.translate('pause.title')).toBe('일시정지');
    expect(t.translate('hud.alive', { count: 3 })).toBe('3 생존');
    expect(t.translate('result.final_round', { round: 7 })).toBe('최종 라운드: 7');
  });

  test('locale 전환 후 즉시 다른 언어 출력', () => {
    const t = new JsonTranslator({ en, ko }, 'en');
    expect(t.translate('lobby.start')).toBe('START');

    t.setLocale('ko');
    expect(t.translate('lobby.start')).toBe('시작');

    t.setLocale('en');
    expect(t.translate('lobby.start')).toBe('START');
  });
});
