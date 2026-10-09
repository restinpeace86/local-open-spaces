// [스타필드 지점 지오코딩](2026-10-09) buildSearchQuery()/buildOpenSpaceRow()
// 단위 테스트 — 신세계/현대백화점/AK플라자에서 겪은 "open_spaces 미등록
// 으로 화면에 안 보이는" 버그를 처음부터 피하기 위해 목록 배치와 함께
// 바로 추가한다.
import { describe, expect, it } from 'vitest';
import { buildOpenSpaceRow, buildSearchQuery } from './starfield-culture-club-stores.mjs';

describe('buildSearchQuery', () => {
  it('실측 확인된 공식 표기(storeFullNm)를 그대로 검색 쿼리로 쓴다(운정만 "스타필드 빌리지" 접두사)', () => {
    expect(buildSearchQuery(['01', '스타필드 고양'])).toBe('스타필드 고양');
    expect(buildSearchQuery(['02', '스타필드 수원'])).toBe('스타필드 수원');
    expect(buildSearchQuery(['03', '스타필드 빌리지 운정'])).toBe('스타필드 빌리지 운정');
  });
});

describe('buildOpenSpaceRow', () => {
  it('EXTERNAL_ID_PREFIX와 쇼핑몰문화센터 카테고리로 open_spaces 행을 만든다', () => {
    const row = buildOpenSpaceRow(
      ['02', '스타필드 수원'],
      { placeName: '스타필드 수원', address: '경기 수원시 장안구 수성로 175', lng: 127.01, lat: 37.29 },
      'service-cat-id'
    );
    expect(row.external_id).toBe('STARFIELD_STORE_02');
    expect(row.category_min).toBe('쇼핑몰문화센터');
    expect(row.display_name).toBe('스타필드 수원');
    expect(row.service_category_id).toBe('service-cat-id');
  });
});
