import { describe, expect, it } from 'vitest';
import { escapeIlikePattern, selectTrigramFriendlyTokens, splitSearchTokens } from './keyword-search';

describe('splitSearchTokens', () => {
  it('공백으로 구분된 여러 단어를 토큰 배열로 나눈다', () => {
    expect(splitSearchTokens('용인 어린이상상')).toEqual(['용인', '어린이상상']);
  });

  it('연속된 공백/탭/줄바꿈도 하나의 구분자로 취급한다', () => {
    expect(splitSearchTokens('용인   어린이상상\t숲')).toEqual(['용인', '어린이상상', '숲']);
  });

  it('앞뒤 공백은 무시한다', () => {
    expect(splitSearchTokens('  용인  ')).toEqual(['용인']);
  });

  it('공백 없는 단일 단어는 토큰 1개로 반환한다', () => {
    expect(splitSearchTokens('용인어린이상상')).toEqual(['용인어린이상상']);
  });

  it('빈 문자열/공백만 있는 문자열은 빈 배열을 반환한다', () => {
    expect(splitSearchTokens('')).toEqual([]);
    expect(splitSearchTokens('   ')).toEqual([]);
  });
});

describe('escapeIlikePattern', () => {
  it('%, _, \\를 리터럴로 취급하도록 이스케이프한다', () => {
    expect(escapeIlikePattern('50% 할인')).toBe('50\\% 할인');
    expect(escapeIlikePattern('a_b')).toBe('a\\_b');
    expect(escapeIlikePattern('a\\b')).toBe('a\\\\b');
  });

  it('특수문자가 없는 일반 검색어는 그대로 반환한다', () => {
    expect(escapeIlikePattern('용인 어린이상상')).toBe('용인 어린이상상');
  });
});

// [성능 버그 수정 — 2026-09-14 사용자 리포트] "장소찾는것도 엄청느리고" —
// 실측(EXPLAIN ANALYZE)으로 확인: pg_trgm GIN 인덱스는 3글자 미만 토큰에서는
// 완전한 trigram을 만들 수 없어 사실상 테이블 전체를 후보로 반환해버린다.
// "행복 어린이집"처럼 짧은 단어가 섞인 자연스러운 검색에서 8초 넘게 걸리던
// 것을, 3자 미만 토큰을 걸러내는 것으로 100ms대까지 줄였다(실측).
describe('selectTrigramFriendlyTokens', () => {
  it('3자 미만 토큰은 걸러내고, 3자 이상 토큰만 남긴다', () => {
    expect(selectTrigramFriendlyTokens(['행복', '어린이집'])).toEqual(['어린이집']);
    expect(selectTrigramFriendlyTokens(splitSearchTokens('용인 어린이상상'))).toEqual(['어린이상상']);
  });

  it('모든 토큰이 3자 이상이면 그대로 반환한다', () => {
    expect(selectTrigramFriendlyTokens(['강남구', '어린이집'])).toEqual(['강남구', '어린이집']);
  });

  it('모든 토큰이 3자 미만이면(예외적인 경우) 결과가 아예 없는 것보다 낫도록 원래 토큰을 그대로 반환한다', () => {
    expect(selectTrigramFriendlyTokens(['행복', '집'])).toEqual(['행복', '집']);
  });

  it('빈 배열은 빈 배열을 반환한다', () => {
    expect(selectTrigramFriendlyTokens([])).toEqual([]);
  });
});
