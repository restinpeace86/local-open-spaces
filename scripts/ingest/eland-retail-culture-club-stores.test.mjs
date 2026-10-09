// [이랜드리테일 지점 지오코딩](2026-10-09) buildSearchQuery()/
// buildOpenSpaceRow() 단위 테스트 — 신세계/현대백화점/AK플라자/
// 스타필드/롯데백화점에서 겪은 "open_spaces 미등록으로 화면에 안 보이는"
// 버그를 처음부터 피하기 위해 목록 배치와 함께 바로 추가한다.
import { describe, expect, it } from 'vitest';
import { buildOpenSpaceRow, buildSearchQuery } from './eland-retail-culture-club-stores.mjs';

describe('buildSearchQuery', () => {
  it('실측 확인된 실제 건물명 검색 쿼리를 그대로 쓴다(내부 명칭과 다름)', () => {
    expect(buildSearchQuery(['8202', 'NC백화점 야탑점', 'NC백화점 야탑점'])).toBe('NC백화점 야탑점');
    expect(buildSearchQuery(['8205', '뉴코아아울렛 평촌점', '뉴코아아울렛 평촌점'])).toBe('뉴코아아울렛 평촌점');
  });
});

describe('buildOpenSpaceRow', () => {
  it('EXTERNAL_ID_PREFIX와 아울렛문화센터 카테고리로 open_spaces 행을 만든다', () => {
    const row = buildOpenSpaceRow(
      ['8222', 'NC백화점 부천점', 'NC백화점 부천점'],
      { placeName: 'NC백화점 부천점', address: '경기 부천시 원미구 송내대로 239', lng: 126.78, lat: 37.49 },
      'service-cat-id'
    );
    expect(row.external_id).toBe('ELAND_STORE_8222');
    expect(row.category_min).toBe('아울렛문화센터');
    expect(row.display_name).toBe('NC백화점 부천점');
    expect(row.service_category_id).toBe('service-cat-id');
  });
});
