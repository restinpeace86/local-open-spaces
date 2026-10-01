import { describe, expect, it } from 'vitest';
import { buildSmartSeoulMapExternalId, transformSmartSeoulMapContent } from './smart-seoul-map-transform.mjs';
import { UI_CATEGORY } from './schema-mapper.mjs';

describe('buildSmartSeoulMapExternalId', () => {
  // [짧은 해시 채택](2026-10-01 실측 장애): 원래 `SMART_SEOUL_{themeId}_
  // {contentId}` 그대로 썼다가 긴 문자열 때문에 upsertRowsSafeMerge()의
  // GET 기존 행 조회가 URL 길이 초과로 실패했다(오케이존 654건 재현) —
  // rural-experience-village-adapter.mjs와 동일한 SHA1 16자 해시로 줄였다.
  it('SMART_SEOUL_ 접두사 + 16자 해시로 짧고 결정적인 external_id를 만든다', () => {
    const id1 = buildSmartSeoulMapExternalId('1679901034775', 'JG240301');
    const id2 = buildSmartSeoulMapExternalId('1679901034775', 'JG240301');
    expect(id1).toMatch(/^SMART_SEOUL_[0-9a-f]{16}$/);
    expect(id1).toBe(id2); // 동일 입력 → 동일 해시(결정적)
  });

  it('테마ID 또는 콘텐츠ID가 다르면 다른 external_id를 만든다', () => {
    const base = buildSmartSeoulMapExternalId('1679901034775', 'JG240301');
    expect(buildSmartSeoulMapExternalId('1679901034775', 'OTHER_ID')).not.toBe(base);
    expect(buildSmartSeoulMapExternalId('999', 'JG240301')).not.toBe(base);
  });

  it('콘텐츠 ID가 없으면 null이다', () => {
    expect(buildSmartSeoulMapExternalId('1679901034775', '')).toBeNull();
    expect(buildSmartSeoulMapExternalId('1679901034775', null)).toBeNull();
  });
});

describe('transformSmartSeoulMapContent', () => {
  const baseConfig = {
    themeId: '1679901034775',
    uiCategory: UI_CATEGORY.KIDS_ACTIVITY,
    categoryMin: '키즈카페',
    serviceCategoryId: 'service-cat-id',
  };

  it('정상 항목을 open_spaces 행으로 변환한다(좌표 있음)', () => {
    const item = {
      COT_CONTS_ID: 'JG240301',
      COT_CONTS_NAME: '서울형 키즈카페 중구 중림동점',
      COT_ADDR_FULL_NEW: '서울특별시 중구 서소문로6길 16',
      COT_ADDR_FULL_OLD: '서울특별시 중구 중림동 156-176',
      COT_COORD_X: 126.96625,
      COT_COORD_Y: 37.55952,
    };
    const row = transformSmartSeoulMapContent(item, baseConfig);

    expect(row.external_id).toBe(buildSmartSeoulMapExternalId('1679901034775', 'JG240301'));
    expect(row.name).toBe('서울형 키즈카페 중구 중림동점');
    expect(row.address).toBe('서울특별시 중구 서소문로6길 16');
    expect(row.location_precision).toBe('EXACT');
    expect(row.location).toBe('SRID=4326;POINT(126.96625 37.55952)');
    expect(row.category_min).toBe('키즈카페');
    expect(row.category_min_source).toBe('MANUAL');
    expect(row.service_category_id).toBe('service-cat-id');
    expect(row.source).toBe('smart_seoul_map');
    expect(row.source_type).toBe('SMART_SEOUL_MAP');
    expect(row.is_free).toBeNull();
    expect(row.operating_hours).toBeNull();
    expect(row.raw_data).toEqual(item);
  });

  it('도로명 주소가 없으면 지번 주소로 대체한다', () => {
    const item = {
      COT_CONTS_ID: 'X1',
      COT_CONTS_NAME: '테스트',
      COT_ADDR_FULL_NEW: null,
      COT_ADDR_FULL_OLD: '서울특별시 중구 지번주소 1',
      COT_COORD_X: 126.9,
      COT_COORD_Y: 37.5,
    };
    const row = transformSmartSeoulMapContent(item, baseConfig);
    expect(row.address).toBe('서울특별시 중구 지번주소 1');
  });

  it('좌표가 없으면 location_precision=UNKNOWN으로 보존한다(드롭하지 않음)', () => {
    const item = {
      COT_CONTS_ID: 'NOCOORD',
      COT_CONTS_NAME: '좌표없는곳',
      COT_ADDR_FULL_NEW: '',
      COT_ADDR_FULL_OLD: '',
      COT_COORD_X: null,
      COT_COORD_Y: null,
    };
    const row = transformSmartSeoulMapContent(item, baseConfig);
    expect(row).not.toBeNull();
    expect(row.location_precision).toBe('UNKNOWN');
    expect(row.location).toBeNull();
  });

  it('콘텐츠명이 없으면 null을 반환한다(행 드롭)', () => {
    const item = { COT_CONTS_ID: 'X2', COT_CONTS_NAME: '', COT_COORD_X: 126.9, COT_COORD_Y: 37.5 };
    expect(transformSmartSeoulMapContent(item, baseConfig)).toBeNull();
  });

  it('콘텐츠 ID가 없으면 null을 반환한다(행 드롭)', () => {
    const item = { COT_CONTS_ID: '', COT_CONTS_NAME: '이름있음', COT_COORD_X: 126.9, COT_COORD_Y: 37.5 };
    expect(transformSmartSeoulMapContent(item, baseConfig)).toBeNull();
  });
});
