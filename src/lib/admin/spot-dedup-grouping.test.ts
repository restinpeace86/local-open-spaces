import { describe, expect, it } from 'vitest';
import { DedupCandidateRow, formatDedupGroupLabel, groupDedupCandidates, haversineDistanceMeters } from './spot-dedup-grouping';

// [2026-09-05] 기본 픽스처는 좌표를 null로 둔다 — 좌표 근접 판정이 이제 전체 후보를
// 대상으로 한 O(n²) Haversine 비교라, 여러 행이 우연히 같은 기본 좌표를 공유하면
// 의도치 않게 서로 "근접"으로 묶여 다른 테스트(주소 기반 묶음 등)의 기대와 어긋난다.
// 좌표 근접을 검증하는 테스트에서만 명시적으로 lat/lng를 채운다.
function row(overrides: Partial<DedupCandidateRow> = {}): DedupCandidateRow {
  return {
    id: 'id-1',
    name: '테스트스팟',
    category: 'PARK',
    category_min: '공원',
    address: '경기도 성남시 분당구 어딘가 123',
    normalized_address: '경기도성남시분당구어딘가123',
    lat: null,
    lng: null,
    ...overrides,
  };
}

describe('haversineDistanceMeters', () => {
  // [실측 재현](2026-09-05 사용자 지시): 사용자가 실제 데이터로 지적한 사례를 그대로
  // 재현한다 — "물빛어린이공원 바닥분수"(37.3909817582482, 127.067398062731)와
  // "판교제2호(물빛)공원"(37.391069, 127.067673)은 PostGIS
  // ST_Distance(geography)로 직접 확인한 실제 거리가 26.2m다. 기존 degree 기반
  // 근사 임계값(eps=0.00027도)은 이 쌍을 근소하게 놓쳤었다 — Haversine으로 정확히
  // 같은 값이 나오는지 검증해 회귀를 방지한다.
  it('실측 사례 — 물빛어린이공원 바닥분수 ~ 판교제2호(물빛)공원(실제 26.2m)을 정확히 계산한다', () => {
    const meters = haversineDistanceMeters(37.3909817582482, 127.067398062731, 37.391069, 127.067673);
    expect(meters).toBeGreaterThan(25);
    expect(meters).toBeLessThan(27);
  });

  it('실측 사례 — 성남시운중도서관 ~ 운중도서관 시청각실(실제 6.9m)을 정확히 계산한다', () => {
    const meters = haversineDistanceMeters(37.3900402326834, 127.07518647422, 37.390042, 127.075109);
    expect(meters).toBeGreaterThan(6);
    expect(meters).toBeLessThan(8);
  });

  it('완전히 같은 좌표는 거리 0을 반환한다', () => {
    expect(haversineDistanceMeters(37.3881134, 127.085758, 37.3881134, 127.085758)).toBe(0);
  });
});

describe('groupDedupCandidates', () => {
  it('정규화 주소가 같은 행들을 하나의 그룹으로 묶는다', () => {
    const rows = [
      row({ id: 'a', normalized_address: 'addr-1' }),
      row({ id: 'b', normalized_address: 'addr-1' }),
      row({ id: 'c', normalized_address: 'addr-2' }),
    ];
    const groups = groupDedupCandidates(rows);
    expect(groups).toHaveLength(1);
    expect(groups[0].members.map((m) => m.id).sort()).toEqual(['a', 'b']);
  });

  // [2026-09-05 실측 재현] 26.2m — 기존 degree 근사 임계값(eps=0.00027도)이 놓쳤던
  // 바로 그 실제 사례. Haversine 기반 30m 임계값으로는 정확히 잡혀야 한다.
  it('실제 거리 30m 이내(정확한 Haversine 기준)면 주소가 달라도 하나의 그룹으로 묶는다', () => {
    const rows = [
      row({ id: 'a', name: '물빛어린이공원 바닥분수', normalized_address: 'addr-a', lat: 37.3909817582482, lng: 127.067398062731 }),
      row({ id: 'b', name: '판교제2호(물빛)공원', normalized_address: 'addr-b', lat: 37.391069, lng: 127.067673 }),
    ];
    const groups = groupDedupCandidates(rows);
    expect(groups).toHaveLength(1);
    expect(groups[0].members.map((m) => m.id).sort()).toEqual(['a', 'b']);
  });

  it('30m를 초과하면(같은 주소가 아닌 한) 그룹으로 묶지 않는다', () => {
    const rows = [
      row({ id: 'a', normalized_address: 'addr-a', lat: 37.3881134, lng: 127.085758 }),
      // 위도로 약 0.001도 ≈ 111m 떨어진 좌표 — 명백히 30m 초과.
      row({ id: 'b', normalized_address: 'addr-b', lat: 37.3891134, lng: 127.085758 }),
    ];
    expect(groupDedupCandidates(rows)).toHaveLength(0);
  });

  it('주소로 묶인 그룹과 좌표로 묶인 그룹이 하나의 행을 공유하면 하나로 병합한다(연결된 요소)', () => {
    // A-B는 주소로 연결, B-C는 좌표로 연결 → A-B-C 전부 한 그룹이어야 한다.
    const rows = [
      row({ id: 'a', normalized_address: 'addr-1' }),
      row({ id: 'b', normalized_address: 'addr-1', lat: 37.3881134, lng: 127.085758 }),
      row({ id: 'c', normalized_address: 'addr-2', lat: 37.3881134, lng: 127.085758 }),
    ];
    const groups = groupDedupCandidates(rows);
    expect(groups).toHaveLength(1);
    expect(groups[0].members.map((m) => m.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('빈 정규화 주소는 그룹핑 근거로 쓰지 않는다(전부 빈 문자열이면 전부 같은 그룹으로 잘못 묶이는 것을 방지)', () => {
    const rows = [row({ id: 'a', normalized_address: '' }), row({ id: 'b', normalized_address: '' })];
    expect(groupDedupCandidates(rows)).toHaveLength(0);
  });

  it('좌표가 없는(null) 행은 좌표 근접 판정에서 안전하게 제외된다(에러 없이)', () => {
    const rows = [
      row({ id: 'a', normalized_address: 'addr-a', lat: null, lng: null }),
      row({ id: 'b', normalized_address: 'addr-b', lat: null, lng: null }),
    ];
    expect(() => groupDedupCandidates(rows)).not.toThrow();
    expect(groupDedupCandidates(rows)).toHaveLength(0);
  });

  it('1건짜리(중복 아님)는 그룹으로 반환하지 않는다', () => {
    const rows = [row({ id: 'a', normalized_address: 'addr-only-one' })];
    expect(groupDedupCandidates(rows)).toHaveLength(0);
  });

  it('입력이 비어있으면 빈 배열을 반환한다', () => {
    expect(groupDedupCandidates([])).toEqual([]);
  });
});

describe('formatDedupGroupLabel', () => {
  it('주소 앞부분 + 첫 행 이름 + 나머지 건수로 라벨을 만든다', () => {
    const groups = groupDedupCandidates([
      row({ id: 'a', name: '행복놀이터', address: '경기도 성남시 분당구 정자동 1', normalized_address: 'x' }),
      row({ id: 'b', name: '행복놀이터(구)', address: '경기도 성남시 분당구 정자동 1-1', normalized_address: 'x' }),
      row({ id: 'c', name: '행복놀이터(신)', address: '경기도 성남시 분당구 정자동 1-2', normalized_address: 'x' }),
    ]);
    expect(formatDedupGroupLabel(groups[0])).toBe('경기도 성남시 등 행복놀이터 외 2건');
  });
});
