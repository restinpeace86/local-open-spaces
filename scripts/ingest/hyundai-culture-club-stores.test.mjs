// [현대백화점 지점 지오코딩](2026-10-08 사용자가 지적한 신세계와 동일한
// 버그를 현대백화점에도 함께 수정) — buildSearchQuery()/buildOpenSpaceRow()
// 단위 테스트.
import { describe, expect, it } from 'vitest';
import { buildOpenSpaceRow, buildSearchQuery } from './hyundai-culture-club-stores.mjs';

describe('buildSearchQuery', () => {
  it('"점"으로 끝나는 지점명에는 중복으로 더 붙이지 않는다', () => {
    expect(buildSearchQuery({ storeCode: '220', storeName: '무역센터점' })).toBe('현대백화점 무역센터점');
  });

  it('"점"으로 끝나지 않는 지점명에는 "점"을 붙인다(실측: "가든파이브"가 유일한 예외 사례)', () => {
    expect(buildSearchQuery({ storeCode: '750', storeName: '가든파이브' })).toBe('현대백화점 가든파이브점');
  });
});

describe('buildOpenSpaceRow', () => {
  it('EXTERNAL_ID_PREFIX와 백화점문화센터 카테고리로 open_spaces 행을 만든다', () => {
    const row = buildOpenSpaceRow(
      { storeCode: '220', storeName: '무역센터점' },
      { placeName: '현대백화점 무역센터점', address: '서울 강남구 테헤란로 517', lng: 127.05, lat: 37.5 },
      'service-cat-id'
    );
    expect(row.external_id).toBe('HYUNDAI_STORE_220');
    expect(row.category_min).toBe('백화점문화센터');
    expect(row.display_name).toBe('현대백화점 무역센터점');
    expect(row.service_category_id).toBe('service-cat-id');
  });
});
