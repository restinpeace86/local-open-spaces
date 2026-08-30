import { describe, expect, it } from 'vitest';
import { escapeIlikePattern, splitSearchTokens } from './keyword-search';

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
