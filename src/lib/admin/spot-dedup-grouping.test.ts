import { describe, expect, it } from 'vitest';
import { DedupCandidateRow, formatDedupGroupLabel, groupDedupCandidates } from './spot-dedup-grouping';

function row(overrides: Partial<DedupCandidateRow> = {}): DedupCandidateRow {
  return {
    id: 'id-1',
    name: '테스트스팟',
    category: 'PARK',
    category_min: '공원',
    address: '경기도 성남시 분당구 어딘가 123',
    normalized_address: '경기도성남시분당구어딘가123',
    lat: 37.38,
    lng: 127.12,
    proximity_cluster_id: null,
    ...overrides,
  };
}

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

  it('좌표 근접 클러스터 id가 같은 행들을 하나의 그룹으로 묶는다', () => {
    const rows = [
      row({ id: 'a', normalized_address: 'addr-a', proximity_cluster_id: 1 }),
      row({ id: 'b', normalized_address: 'addr-b', proximity_cluster_id: 1 }),
    ];
    const groups = groupDedupCandidates(rows);
    expect(groups).toHaveLength(1);
    expect(groups[0].members.map((m) => m.id).sort()).toEqual(['a', 'b']);
  });

  it('주소로 묶인 그룹과 좌표로 묶인 그룹이 하나의 행을 공유하면 하나로 병합한다(연결된 요소)', () => {
    // A-B는 주소로 연결, B-C는 좌표로 연결 → A-B-C 전부 한 그룹이어야 한다.
    const rows = [
      row({ id: 'a', normalized_address: 'addr-1', proximity_cluster_id: null }),
      row({ id: 'b', normalized_address: 'addr-1', proximity_cluster_id: 5 }),
      row({ id: 'c', normalized_address: 'addr-2', proximity_cluster_id: 5 }),
    ];
    const groups = groupDedupCandidates(rows);
    expect(groups).toHaveLength(1);
    expect(groups[0].members.map((m) => m.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('빈 정규화 주소는 그룹핑 근거로 쓰지 않는다(전부 빈 문자열이면 전부 같은 그룹으로 잘못 묶이는 것을 방지)', () => {
    const rows = [
      row({ id: 'a', normalized_address: '', proximity_cluster_id: null }),
      row({ id: 'b', normalized_address: '', proximity_cluster_id: null }),
    ];
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
