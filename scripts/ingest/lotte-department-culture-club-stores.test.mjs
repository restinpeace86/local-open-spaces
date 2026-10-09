// [롯데백화점 지점 지오코딩](2026-10-09) buildSearchQuery()/
// buildOpenSpaceRow() 단위 테스트 — 신세계/현대백화점/AK플라자/
// 스타필드에서 겪은 "open_spaces 미등록으로 화면에 안 보이는" 버그를
// 처음부터 피하기 위해 목록 배치와 함께 바로 추가한다.
import { describe, expect, it } from 'vitest';
import { buildOpenSpaceRow, buildSearchQuery } from './lotte-department-culture-club-stores.mjs';

describe('buildSearchQuery', () => {
  it('일반 지점은 "롯데백화점 {지점명}"으로 검색한다', () => {
    expect(buildSearchQuery(['0001', '본점'])).toBe('롯데백화점 본점');
    expect(buildSearchQuery(['0025', '전주점'])).toBe('롯데백화점 전주점');
  });

  it('이미 완전한 고유명(타임빌라스 수원/롯데몰광명점)은 접두사를 붙이지 않는다(실측: 붙이면 엉뚱한 곳이 매칭될 위험)', () => {
    expect(buildSearchQuery(['0349', '타임빌라스 수원'])).toBe('타임빌라스 수원');
    expect(buildSearchQuery(['0350', '롯데몰광명점'])).toBe('롯데몰광명점');
  });
});

describe('buildOpenSpaceRow', () => {
  it('EXTERNAL_ID_PREFIX와 백화점문화센터 카테고리로 open_spaces 행을 만든다', () => {
    const row = buildOpenSpaceRow(
      ['0025', '전주점'],
      { placeName: '롯데백화점 전주점', address: '전북 전주시 완산구 전주객사3길 1', lng: 127.14, lat: 35.82 },
      'service-cat-id'
    );
    expect(row.external_id).toBe('LOTTEDEPT_STORE_0025');
    expect(row.category_min).toBe('백화점문화센터');
    expect(row.display_name).toBe('롯데백화점 전주점');
    expect(row.service_category_id).toBe('service-cat-id');
  });

  it('타임빌라스 수원은 display_name에도 "롯데백화점"을 붙이지 않는다', () => {
    const row = buildOpenSpaceRow(
      ['0349', '타임빌라스 수원'],
      { placeName: '타임빌라스 수원', address: '경기 수원시 장안구 수성로 175', lng: 127.01, lat: 37.29 },
      'service-cat-id'
    );
    expect(row.display_name).toBe('타임빌라스 수원');
  });
});
