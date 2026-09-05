import { describe, expect, it } from 'vitest';
import { cleanNaverText, parsePostdate, isWithinRecentWindow } from './naver-blog-search';

// [관리자용 블로그 큐레이션 모달](2026-09-05 사용자 지시, Decision 021) 단위 테스트.
describe('cleanNaverText', () => {
  it('네이버 자체 <b> 태그를 제거한다(직접 하이라이팅을 다시 입히므로)', () => {
    expect(cleanNaverText('여기 <b>주차장</b>이 넓어요')).toBe('여기 주차장이 넓어요');
  });

  it('HTML 엔티티를 원문 문자로 되돌린다', () => {
    expect(cleanNaverText('&quot;최고&quot;예요 &amp; 추천 &lt;3&gt;')).toBe('"최고"예요 & 추천 <3>');
  });
});

describe('parsePostdate', () => {
  it('YYYYMMDD 형식을 정확히 파싱한다', () => {
    const parsed = parsePostdate('20260101');
    expect(parsed?.getFullYear()).toBe(2026);
    expect(parsed?.getMonth()).toBe(0); // 0-indexed
    expect(parsed?.getDate()).toBe(1);
  });

  it('형식이 아니면 추측하지 않고 null을 반환한다', () => {
    expect(parsePostdate('2026-01-01')).toBeNull();
    expect(parsePostdate('')).toBeNull();
    expect(parsePostdate('abcdefgh')).toBeNull();
  });
});

// [최신성 검증(1년 룰)](사용자 지시 원문): "가져온 글 3개의 발행일(postdate)을
// 분석하여 최근 1년 이내 작성된 글이 하나라도 있는지 체크함."
describe('isWithinRecentWindow', () => {
  const now = new Date(2026, 8, 5); // 2026-09-05 고정(테스트 결정성)

  it('1년 이내(364일 전)면 true', () => {
    // 2026-09-05 - 364일 ≈ 2025-09-07
    expect(isWithinRecentWindow('20250907', now)).toBe(true);
  });

  it('정확히 365일 전이면 경계값으로 true(포함)', () => {
    // 2026-09-05 - 365일 = 2025-09-05
    expect(isWithinRecentWindow('20250905', now)).toBe(true);
  });

  it('1년보다 더 지났으면(366일 전) false', () => {
    expect(isWithinRecentWindow('20250904', now)).toBe(false);
  });

  it('아주 오래된 글(3년 전)이면 false', () => {
    expect(isWithinRecentWindow('20230101', now)).toBe(false);
  });

  it('형식이 잘못된 postdate는 최신으로 추측하지 않고 false', () => {
    expect(isWithinRecentWindow('', now)).toBe(false);
  });
});
