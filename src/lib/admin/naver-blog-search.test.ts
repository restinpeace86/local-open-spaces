import { describe, expect, it } from 'vitest';
import {
  cleanNaverText,
  parsePostdate,
  isWithinRecentWindow,
  resolveBlogSort,
  extractSigunguCoreName,
  buildSmartBlogQuery,
} from './naver-blog-search';

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

// [정렬 기준을 화면에서 전환](2026-09-06 사용자 지시): "내가 화면에서 sim/date
// 기준 변경해서도 호출할 수 있게.. default는 date로."
describe('resolveBlogSort', () => {
  it('sim/date는 그대로 통과시킨다', () => {
    expect(resolveBlogSort('sim')).toBe('sim');
    expect(resolveBlogSort('date')).toBe('date');
  });

  it('값이 없거나(null) 알 수 없는 값이면 추측하지 않고 기본값(date)으로 되돌린다', () => {
    expect(resolveBlogSort(null)).toBe('date');
    expect(resolveBlogSort('')).toBe('date');
    expect(resolveBlogSort('relevance')).toBe('date');
  });
});

// [스마트 검색 쿼리 조합](2026-09-07 사용자 지시): "서울시 노원구라고 하면 상호명 +
// 노원 이런식으로" — sigungu_name 마지막 토큰에서 시/군/구 접미사만 뗀다.
describe('extractSigunguCoreName', () => {
  it('마지막 토큰에서 시/군/구 접미사를 뗀다', () => {
    expect(extractSigunguCoreName('서울시 노원구')).toBe('노원');
    expect(extractSigunguCoreName('경기도 성남시')).toBe('성남');
    expect(extractSigunguCoreName('경기도 여주시')).toBe('여주');
  });

  it('공백이 없는(단일 토큰) 경우도 접미사만 뗀다', () => {
    expect(extractSigunguCoreName('노원구')).toBe('노원');
  });

  it('null/undefined/빈 문자열은 빈 문자열을 반환한다(추측하지 않음)', () => {
    expect(extractSigunguCoreName(null)).toBe('');
    expect(extractSigunguCoreName(undefined)).toBe('');
    expect(extractSigunguCoreName('')).toBe('');
  });
});

describe('buildSmartBlogQuery', () => {
  it('상호명 뒤에 시군구 핵심 지역명을 붙인다', () => {
    expect(buildSmartBlogQuery('쿠우쿠우', '서울시 노원구')).toBe('쿠우쿠우 노원');
  });

  it('sigungu_name이 없으면 상호명만 그대로 반환한다', () => {
    expect(buildSmartBlogQuery('쿠우쿠우', null)).toBe('쿠우쿠우');
    expect(buildSmartBlogQuery('쿠우쿠우', undefined)).toBe('쿠우쿠우');
  });

  // [지역명 중복 방지 → 재수정](2026-09-07 사용자 지시): "이유있는감자탕
  // 상인월성점처럼.. 상호명에 +점으로 끝나면 지역명 붙이지 말고.. 그대로
  // 상인월성으로 점만 빼고.. 지역명은 추가하지말고.. 이유있는감자탕과 같이
  // +점으로 안끝나면 이유있는감자탕 달서 같이 붙여줘" — "상인월성"은 시군구
  // 핵심 지역명("달서")과 무관해, "[추출 지역명]+점" 매칭이 아니라 "점"으로
  // 끝나는지만으로 판단한다.
  it('상호명이 "점"으로 끝나면(지점명이 시군구 지역명과 무관해도) 지역명을 붙이지 않고 "점"만 뗀다', () => {
    expect(buildSmartBlogQuery('이유있는감자탕 상인월성점', '대구광역시 달서구')).toBe('이유있는감자탕 상인월성');
    expect(buildSmartBlogQuery('임성근국가공인진갈비 김포점', '경기도 김포시')).toBe('임성근국가공인진갈비 김포');
  });

  it('상호명이 "점"으로 끝나지 않으면 시군구 핵심 지역명을 붙인다', () => {
    expect(buildSmartBlogQuery('이유있는감자탕', '대구광역시 달서구')).toBe('이유있는감자탕 달서');
    expect(buildSmartBlogQuery('김포공항한식뷔페', '경기도 김포시')).toBe('김포공항한식뷔페 김포');
  });
});
