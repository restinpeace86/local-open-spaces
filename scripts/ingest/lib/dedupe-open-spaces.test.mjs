// [open_spaces 중복 데이터 정제](2026-08-28): findOpenSpacesDuplicateGroups는 순수 함수라
// 실제 DB 없이 검증한다. dedupeOpenSpaces(client DI 오케스트레이터)는 이 세션에서 확립한
// 관례대로 실제 supabase-admin.mjs를 호출하는 부분만 별도 테스트하지 않는다(실측 dry-run으로
// 검증) — 여기서는 병합 판정 로직 자체의 정확성만 단위 테스트로 보장한다.
import { describe, expect, it } from 'vitest';
import { findOpenSpacesDuplicateGroups } from './dedupe-open-spaces.mjs';

function makeRow(overrides) {
  return {
    id: overrides.id,
    external_id: overrides.external_id ?? `EXT_${overrides.id}`,
    source: overrides.source ?? 'test_source',
    source_type: overrides.source_type,
    name: overrides.name,
    address: overrides.address ?? null,
    location: overrides.location ?? null,
    location_precision: overrides.location_precision ?? 'EXACT',
    category: overrides.category ?? null,
    category_min: overrides.category_min ?? null,
    category_min_source: overrides.category_min_source ?? null,
    is_free: overrides.is_free ?? null,
    operating_hours: overrides.operating_hours ?? null,
    info_url: overrides.info_url ?? null,
    is_kids_friendly: overrides.is_kids_friendly ?? null,
    has_parking: overrides.has_parking ?? null,
    stroller_accessible: overrides.stroller_accessible ?? null,
    facility_type: overrides.facility_type ?? null,
    target_age_group: overrides.target_age_group ?? null,
    sigungu_name: overrides.sigungu_name ?? null,
    created_at: overrides.created_at ?? '2026-08-20T00:00:00.000Z',
  };
}

const point = (lng, lat) => ({ type: 'Point', coordinates: [lng, lat] });

describe('findOpenSpacesDuplicateGroups', () => {
  it('서로 다른 source_type이 같은 좌표+이름을 가지면 중복 그룹으로 판정한다', () => {
    const rows = [
      makeRow({ id: 'a', source_type: 'KOR_TOUR_API_V4', name: '선화랑', location: point(126.98, 37.57), created_at: '2026-08-20T00:00:00.000Z' }),
      makeRow({ id: 'b', source_type: 'CULTURE_FACILITY', name: '선화랑', location: point(126.98, 37.57), created_at: '2026-08-19T00:00:00.000Z' }),
    ];
    const groups = findOpenSpacesDuplicateGroups(rows);
    expect(groups).toHaveLength(1);
    expect(groups[0].map((r) => r.id)).toEqual(['b', 'a']); // 최초 생성(b)이 survivor로 앞에 온다
  });

  it('같은 source_type 안에서 좌표+이름이 같아도 중복으로 판정하지 않는다(단일 registry 반복 제외)', () => {
    const rows = [
      makeRow({ id: 'a', source_type: 'LOCALDATA_PLAYGROUND', name: '예당마을23단지', location: point(127.2, 37.7) }),
      makeRow({ id: 'b', source_type: 'LOCALDATA_PLAYGROUND', name: '예당마을23단지', location: point(127.2, 37.7) }),
    ];
    const groups = findOpenSpacesDuplicateGroups(rows);
    expect(groups).toHaveLength(0);
  });

  it('서로 다른 source_type이 이름+주소가 같으면(좌표 없어도) 중복 그룹으로 판정한다', () => {
    const rows = [
      makeRow({ id: 'a', source_type: 'GO_CAMPING', name: '오차드블리스', address: '충청북도 제천시 봉양읍 의암로 232' }),
      makeRow({ id: 'b', source_type: 'KOR_TOUR_API_V4', name: '오차드블리스', address: '충청북도 제천시 봉양읍 의암로 232' }),
    ];
    const groups = findOpenSpacesDuplicateGroups(rows);
    expect(groups).toHaveLength(1);
  });

  it('주소가 빈 문자열이면 이름+주소 기준으로 중복 판정하지 않는다(빈 문자열은 의미있는 일치가 아님)', () => {
    const rows = [
      makeRow({ id: 'a', source_type: 'SEOUL_YEYAK', name: '삼청테니스장 코트이용(야간)', address: '' }),
      makeRow({ id: 'b', source_type: 'SEOUL_YEYAK', name: '삼청테니스장 코트이용(야간)', address: '' }),
    ];
    const groups = findOpenSpacesDuplicateGroups(rows);
    expect(groups).toHaveLength(0);
  });

  it('전이적으로 연결된 3개 행(교차 기준으로만 연결)을 하나의 그룹으로 합친다', () => {
    const rows = [
      // a-b: 좌표+이름 일치(서로 다른 source_type)
      makeRow({ id: 'a', source_type: 'CITY_PARK', name: '은곡마을공원', location: point(127.1, 37.4), created_at: '2026-08-20T00:00:00.000Z' }),
      makeRow({ id: 'b', source_type: 'KOR_TOUR_API_V4', name: '은곡마을공원', location: point(127.1, 37.4), created_at: '2026-08-18T00:00:00.000Z' }),
      // b-c: 이름+주소 일치(서로 다른 source_type), 좌표는 c에 없음
      makeRow({ id: 'c', source_type: 'CULTURAL_FACILITY_SUMMARY', name: '은곡마을공원', address: '서울 강남구 세곡동', created_at: '2026-08-25T00:00:00.000Z' }),
    ];
    // b와 c가 이름+주소로 이어지려면 b도 같은 주소를 가져야 하므로 보정
    rows[1].address = '서울 강남구 세곡동';
    const groups = findOpenSpacesDuplicateGroups(rows);
    expect(groups).toHaveLength(1);
    expect(groups[0].map((r) => r.id)).toEqual(['b', 'a', 'c']); // created_at 오름차순
  });

  it('이름이 다르면 좌표가 같아도 중복으로 판정하지 않는다', () => {
    const rows = [
      makeRow({ id: 'a', source_type: 'LOCALDATA_PLAYGROUND', name: '어린이놀이터 1', location: point(127.1, 37.4) }),
      makeRow({ id: 'b', source_type: 'PUBLIC_FACILITY_OPEN', name: '어린이놀이터 2', location: point(127.1, 37.4) }),
    ];
    const groups = findOpenSpacesDuplicateGroups(rows);
    expect(groups).toHaveLength(0);
  });

  it('중복이 없는 행들은 빈 배열을 반환한다', () => {
    const rows = [
      makeRow({ id: 'a', source_type: 'CITY_PARK', name: '공원A', location: point(127.0, 37.0) }),
      makeRow({ id: 'b', source_type: 'KOR_TOUR_API_V4', name: '공원B', location: point(128.0, 38.0) }),
    ];
    expect(findOpenSpacesDuplicateGroups(rows)).toEqual([]);
  });
});
