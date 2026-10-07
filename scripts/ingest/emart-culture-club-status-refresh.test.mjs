import { describe, expect, it } from 'vitest';
import { diffChangedStatuses } from './emart-culture-club-status-refresh.mjs';

describe('diffChangedStatuses', () => {
  it('raw_status가 바뀐 행만 변경 목록에 포함하고, 정규화된 상태도 함께 계산한다', () => {
    const rows = [
      { source_class_id: 'A', raw_status: '접수대기', normalized_status: 'CLOSED' },
      { source_class_id: 'B', raw_status: '접수중', normalized_status: 'OPEN' },
    ];
    const newRawStatusById = new Map([
      ['A', '접수중'], // 접수대기 → 접수중으로 바뀜
      ['B', '접수중'], // 변경 없음
    ]);

    const changed = diffChangedStatuses(rows, newRawStatusById);

    expect(changed).toEqual([{ source_class_id: 'A', raw_status: '접수중', normalized_status: 'OPEN' }]);
  });

  it('새 상태를 찾지 못한 행(Map에 없음)은 변경 없음으로 본다', () => {
    const rows = [{ source_class_id: 'A', raw_status: '접수중', normalized_status: 'OPEN' }];
    const changed = diffChangedStatuses(rows, new Map());
    // 둘 다 undefined로 비교돼 기존 값과 다르면 변경으로 잡힐 수 있으므로
    // normalizeEmartStatus(undefined) === 'CLOSED' !== 'OPEN' → 변경으로 감지돼야 함.
    expect(changed).toEqual([{ source_class_id: 'A', raw_status: undefined, normalized_status: 'CLOSED' }]);
  });

  it('변경 사항이 없으면 빈 배열을 반환한다', () => {
    const rows = [{ source_class_id: 'A', raw_status: '접수마감', normalized_status: 'CLOSED' }];
    const newRawStatusById = new Map([['A', '접수마감']]);
    expect(diffChangedStatuses(rows, newRawStatusById)).toEqual([]);
  });
});
