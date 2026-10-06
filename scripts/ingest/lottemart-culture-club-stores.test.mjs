// [롯데마트 지점 지오코딩](2026-10-07 사용자 지시) — buildSearchQuery()/
// buildOpenSpaceRow() 단위 테스트. 실측으로 확정한 쿼리 포맷(store_name에
// 이미 "점"이 포함돼 있어 추가로 붙이면 안 됨 — 최초 시도에서 60개 중 52개가
// 실패했던 원인)을 그대로 검증한다.
import { describe, expect, it } from 'vitest';
import { buildSearchQuery, buildDisplayName, buildOpenSpaceRow } from './lottemart-culture-club-stores.mjs';

describe('buildSearchQuery', () => {
  it('일반 롯데마트 지점은 "롯데마트 {지점명}"으로 검색한다(store_name에 이미 "점"이 포함돼 있어 추가로 붙이지 않음)', () => {
    expect(buildSearchQuery({ store_code: '455', store_name: '고양점' })).toEqual({
      query: '롯데마트 고양점',
      skipMt1Filter: false,
    });
  });

  it('MAXX 지점은 "롯데마트맥스" 브랜드로 검색한다', () => {
    expect(buildSearchQuery({ store_code: '103', store_name: 'MAXX영등포점' }).query).toBe('롯데마트맥스 영등포점');
  });
});

describe('buildDisplayName', () => {
  it('일반 롯데마트 지점은 "롯데마트 {지점명}"으로 표시한다', () => {
    expect(buildDisplayName({ store_code: '455', store_name: '고양점' })).toBe('롯데마트 고양점');
  });

  it('MAXX 지점은 "롯데마트맥스 {지점명}"으로 표시한다', () => {
    expect(buildDisplayName({ store_code: '103', store_name: 'MAXX영등포점' })).toBe('롯데마트맥스 영등포점');
  });
});

describe('buildOpenSpaceRow', () => {
  const SERVICE_CATEGORY_ID = 'ad36cf12-821e-4cca-929d-c7e6242a8a4f';

  it('지오코딩 결과를 open_spaces 행 형식으로 변환한다(이마트와 같은 category_min 공유)', () => {
    const store = { store_code: '455', store_name: '고양점' };
    const geo = { placeName: '롯데마트 고양점', address: '경기 고양시 덕양구 충장로 150', lng: 126.834, lat: 37.6336 };

    const row = buildOpenSpaceRow(store, geo, SERVICE_CATEGORY_ID);

    expect(row).toMatchObject({
      external_id: 'LOTTEMART_STORE_455',
      source: 'lottemart_culture_club',
      category: '대형마트',
      category_min: '대형마트문화센터',
      service_category_id: SERVICE_CATEGORY_ID,
      name: '롯데마트 고양점',
      display_name: '롯데마트 고양점',
      address: '경기 고양시 덕양구 충장로 150',
      location: 'SRID=4326;POINT(126.834 37.6336)',
      location_precision: 'EXACT',
      is_free: true,
    });
  });

  it('service_category_id가 누락되면 안 된다(노출 중분류 미지정 방지 — emart와 동일한 회귀 테스트)', () => {
    const store = { store_code: '455', store_name: '고양점' };
    const geo = { placeName: '롯데마트 고양점', address: '경기 고양시 덕양구 충장로 150', lng: 126.834, lat: 37.6336 };

    const row = buildOpenSpaceRow(store, geo, SERVICE_CATEGORY_ID);

    expect(row.service_category_id).toBe(SERVICE_CATEGORY_ID);
    expect(row.service_category_id).not.toBeNull();
  });
});
