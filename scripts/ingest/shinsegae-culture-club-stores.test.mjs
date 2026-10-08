// [신세계 아카데미 지점 지오코딩](2026-10-08 사용자 지적으로 발견한 버그
// 수정) — buildSearchQuery()/buildOpenSpaceRow() 단위 테스트. 실측으로
// 확정한 함정(이미 "점"으로 끝나는 이름에 중복으로 "점"을 덧붙이면 깨짐,
// "& ON"이 섞인 온라인 통합 표기, 이름에 이미 "신세계"가 있는 경우)을
// 그대로 검증한다.
import { describe, expect, it } from 'vitest';
import { buildOpenSpaceRow, buildSearchQuery } from './shinsegae-culture-club-stores.mjs';

describe('buildSearchQuery', () => {
  it('본점은 특별 케이스로 고정 쿼리를 쓴다', () => {
    expect(buildSearchQuery({ storeCode: '01', storeName: '본점' })).toBe('신세계백화점 본점');
  });

  it('이름이 이미 "점"으로 끝나면 중복으로 더 붙이지 않는다(실측: "강남점점"으로 하면 엉뚱한 곳이 매칭됨)', () => {
    expect(buildSearchQuery({ storeCode: '14', storeName: '강남점' })).toBe('신세계백화점 강남점');
    expect(buildSearchQuery({ storeCode: '15', storeName: '마산점' })).toBe('신세계백화점 마산점');
  });

  it('"점"으로 끝나지 않는 이름에는 "점"을 붙인다', () => {
    expect(buildSearchQuery({ storeCode: '16', storeName: '사우스시티' })).toBe('신세계백화점 사우스시티점');
    expect(buildSearchQuery({ storeCode: '18', storeName: '센텀시티' })).toBe('신세계백화점 센텀시티점');
  });

  it('"& ON" 같은 온라인 통합 표기는 제거하고 검색한다(실측 확인 — 그대로 두면 검색 결과 없음)', () => {
    expect(buildSearchQuery({ storeCode: '03', storeName: '타임스퀘어 & ON' })).toBe('신세계백화점 타임스퀘어점');
  });

  it('이름에 이미 "신세계"가 들어있으면 "신세계백화점"을 중복으로 앞에 붙이지 않는다', () => {
    expect(buildSearchQuery({ storeCode: '90', storeName: '대구신세계' })).toBe('대구신세계점');
    expect(buildSearchQuery({ storeCode: 'D1', storeName: '대전신세계' })).toBe('대전신세계점');
  });
});

describe('buildOpenSpaceRow', () => {
  it('EXTERNAL_ID_PREFIX와 백화점문화센터 카테고리로 open_spaces 행을 만든다', () => {
    const row = buildOpenSpaceRow(
      { storeCode: '03', storeName: '타임스퀘어 & ON' },
      { placeName: '신세계백화점 타임스퀘어점', address: '서울 영등포구 영중로 15', lng: 126.9, lat: 37.5 },
      'service-cat-id'
    );
    expect(row.external_id).toBe('SHINSEGAE_STORE_03');
    expect(row.category_min).toBe('백화점문화센터');
    expect(row.display_name).toBe('신세계 타임스퀘어 & ON');
    expect(row.service_category_id).toBe('service-cat-id');
  });
});
