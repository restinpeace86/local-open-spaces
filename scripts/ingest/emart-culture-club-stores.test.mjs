// [대형마트 문화센터 신규 표준중분류](2026-10-03 사용자 지시) —
// buildSearchQuery()/buildOpenSpaceRow() 단위 테스트. 실측으로 확정한 지오코딩
// 전략(트레이더스/스타필드/괄호 처리/경산 예외)을 그대로 검증한다.
import { describe, expect, it } from 'vitest';
import { buildSearchQuery, buildDisplayName, buildOpenSpaceRow } from './emart-culture-club-stores.mjs';

describe('buildSearchQuery', () => {
  it('일반 이마트 지점은 "이마트 {지점명}점"으로 검색한다', () => {
    expect(buildSearchQuery({ store_code: '180', store_name: '춘천', store_center: 'emart' })).toEqual({
      query: '이마트 춘천점',
      skipMt1Filter: false,
    });
  });

  it('괄호로 지역을 보조 표기한 지점은 괄호를 제거하고 검색한다(실측 확인 — 괄호를 그대로 넣으면 오매칭)', () => {
    expect(buildSearchQuery({ store_code: '490', store_name: '천안(쌍용)', store_center: 'emart' }).query).toBe('이마트 천안점');
    expect(buildSearchQuery({ store_code: '950', store_name: '하남(경기)', store_center: 'emart' }).query).toBe('이마트 하남점');
  });

  it('트레이더스 지점은 "트레이더스" 브랜드로 검색한다(이마트 접두사 붙이지 않음)', () => {
    expect(buildSearchQuery({ store_code: '100', store_name: '트레이더스킨텍스', store_center: 'emart' }).query).toBe(
      '트레이더스 킨텍스점'
    );
  });

  it('"이마트트레이더스"가 이름에 이미 섞인 지점도 올바르게 분리한다', () => {
    expect(buildSearchQuery({ store_code: '970', store_name: '이마트트레이더스연산', store_center: 'emart' }).query).toBe(
      '트레이더스 연산점'
    );
  });

  it('스타필드/스타필드시티는 각각 다른 브랜드 접두사로 검색한다', () => {
    expect(buildSearchQuery({ store_code: '982', store_name: '스타필드안성', store_center: 'starfield' }).query).toBe(
      '스타필드 안성점'
    );
    expect(buildSearchQuery({ store_code: '996', store_name: '스타필드시티위례', store_center: 'starfieldcity' }).query).toBe(
      '스타필드시티위례점'
    );
  });

  it('실측으로 확정된 예외(경산)는 MT1 필터를 건너뛰고 수동 쿼리를 쓴다', () => {
    expect(buildSearchQuery({ store_code: '935', store_name: '경산', store_center: 'emart' })).toMatchObject({
      query: '스타필드마켓 경산점',
      skipMt1Filter: true,
    });
  });
});

// [display_name 브랜드 버그 수정 — 실측 확인](2026-10-03): 첫 실행 결과를 직접
// 조회해보니 트레이더스/스타필드 지점에도 "이마트"가 무조건 붙어("이마트
// 트레이더스킨텍스점") 있었다 — 브랜드별로 올바른 이름이 나오는지 검증한다.
describe('buildDisplayName', () => {
  it('일반 이마트 지점은 "이마트 {지점명}점"으로 표시한다', () => {
    expect(buildDisplayName({ store_code: '180', store_name: '춘천', store_center: 'emart' })).toBe('이마트 춘천점');
  });

  it('트레이더스 지점은 "이마트"를 붙이지 않고 "트레이더스 {지점명}점"으로 표시한다', () => {
    expect(buildDisplayName({ store_code: '100', store_name: '트레이더스킨텍스', store_center: 'emart' })).toBe(
      '트레이더스 킨텍스점'
    );
  });

  it('스타필드/스타필드시티는 각 브랜드명으로 표시한다', () => {
    expect(buildDisplayName({ store_code: '982', store_name: '스타필드안성', store_center: 'starfield' })).toBe(
      '스타필드 안성점'
    );
    expect(buildDisplayName({ store_code: '996', store_name: '스타필드시티위례', store_center: 'starfieldcity' })).toBe(
      '스타필드시티위례점'
    );
  });

  it('경산은 실측으로 확인된 실제 브랜드명(스타필드마켓)으로 표시한다', () => {
    expect(buildDisplayName({ store_code: '935', store_name: '경산', store_center: 'emart' })).toBe('스타필드마켓 경산점');
  });
});

describe('buildOpenSpaceRow', () => {
  it('지오코딩 결과를 open_spaces 행 형식으로 변환한다', () => {
    const store = { store_code: '180', store_name: '춘천', store_center: 'emart' };
    const geo = { placeName: '이마트 춘천점', address: '강원특별자치도 춘천시 경춘로 2353', lng: 127.7186, lat: 37.8638 };

    const row = buildOpenSpaceRow(store, geo);

    expect(row).toMatchObject({
      external_id: 'EMART_STORE_180',
      source: 'emart_culture_club',
      category: '대형마트',
      category_min: '대형마트문화센터',
      name: '이마트 춘천점',
      display_name: '이마트 춘천점',
      address: '강원특별자치도 춘천시 경춘로 2353',
      location: 'SRID=4326;POINT(127.7186 37.8638)',
      location_precision: 'EXACT',
      is_free: true,
    });
  });

  it('display_name은 괄호를 제거하고 "이마트 {지점명}점" 형식으로 만든다', () => {
    const store = { store_code: '490', store_name: '천안(쌍용)', store_center: 'emart' };
    const geo = { placeName: '이마트 천안점', address: '충남 천안시 서북구 충무로 187', lng: 127.127, lat: 36.7961 };

    const row = buildOpenSpaceRow(store, geo);

    expect(row.display_name).toBe('이마트 천안점');
  });
});
