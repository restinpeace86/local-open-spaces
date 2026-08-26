import { describe, expect, it } from 'vitest';
import { extractDescription } from './backfill-contents.mjs';

describe('extractDescription', () => {
  it('seoul_public_culture: PROGRAM과 ETC_DESC를 둘 다 있으면 공백으로 이어붙인다', () => {
    expect(extractDescription('seoul_public_culture', { PROGRAM: '프로그램 소개', ETC_DESC: '기타 안내' })).toBe(
      '프로그램 소개 기타 안내'
    );
  });

  it('seoul_public_culture: 하나만 있으면 그것만 반환한다', () => {
    expect(extractDescription('seoul_public_culture', { PROGRAM: '프로그램 소개', ETC_DESC: '' })).toBe('프로그램 소개');
  });

  it('seoul_public_culture: 둘 다 빈 문자열이면 null(추측으로 다른 값을 만들지 않음)', () => {
    expect(extractDescription('seoul_public_culture', { PROGRAM: '', ETC_DESC: '' })).toBeNull();
  });

  it('gg_public: DTCONT가 실제 내용이 있으면 그대로 반환한다', () => {
    expect(extractDescription('gg_public', { DTCONT: '경기문화재단 행사 프로그램 상세 설명' })).toBe(
      '경기문화재단 행사 프로그램 상세 설명'
    );
  });

  it('gg_public: DTCONT가 "-"(플레이스홀더)면 null로 정리한다(실측 발견 패턴)', () => {
    expect(extractDescription('gg_public', { DTCONT: '-' })).toBeNull();
  });

  it('gg_public: DTCONT 자체가 없으면(API1, 문화행사) null이다', () => {
    expect(extractDescription('gg_public', { TITLE: '무관', CATEGORY_NM: '공연' })).toBeNull();
  });

  it('알 수 없는 소스는 null을 반환한다(추측으로 임의 추출하지 않음)', () => {
    expect(extractDescription('unknown_source', { anything: 'value' })).toBeNull();
  });
});
