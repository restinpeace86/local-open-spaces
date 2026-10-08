// [AK플라자 지점 지오코딩](2026-10-09) buildSearchQuery()/buildOpenSpaceRow()
// 단위 테스트 — 신세계/현대백화점에서 겪은 "open_spaces 미등록으로 화면에
// 안 보이는" 버그를 처음부터 피하기 위해 목록 배치와 함께 바로 추가한다.
import { describe, expect, it } from 'vitest';
import { buildOpenSpaceRow, buildSearchQuery } from './akplaza-culture-club-stores.mjs';

describe('buildSearchQuery', () => {
  it('"AK플라자 {지점명}"으로 쿼리를 만든다(4개 지점 전부 이미 "점"으로 끝나 특수 케이스 불필요)', () => {
    expect(buildSearchQuery(['01', '분당점'])).toBe('AK플라자 분당점');
    expect(buildSearchQuery(['02', '수원점'])).toBe('AK플라자 수원점');
  });
});

describe('buildOpenSpaceRow', () => {
  it('EXTERNAL_ID_PREFIX와 백화점문화센터 카테고리로 open_spaces 행을 만든다', () => {
    const row = buildOpenSpaceRow(
      ['02', '수원점'],
      { placeName: 'AK플라자 수원', address: '경기 수원시 팔달구 덕영대로 924', lng: 127.0, lat: 37.26 },
      'service-cat-id'
    );
    expect(row.external_id).toBe('AKPLAZA_STORE_02');
    expect(row.category_min).toBe('백화점문화센터');
    expect(row.display_name).toBe('AK플라자 수원점');
    expect(row.service_category_id).toBe('service-cat-id');
  });
});
