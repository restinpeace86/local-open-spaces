import { describe, expect, it } from 'vitest';
import { splitOpenAndClosedRows } from './shinsegae-culture-club.mjs';

// [RC(접수마감) 제외 — 사용자 지시](2026-10-08, todo.md 원본 캡처 주석:
// "RC는 접수마감을 의미하여 제외") "신세계 문화센터 배치... 우리가 필요한
// 데이터만 남기고 제거하고? RC인거 제외시키고?"라는 질문에 대한 답으로
// 추가한 로직 — openRows는 upsert 대상, closedClassIds는 "이미 저장된
// 강좌가 오늘 RC로 바뀐 경우"만 상태 갱신 대상으로 분리한다(신규 insert
// 아님, 2026-10-08 롯데마트 접수불가 동기화 버그 수정과 동일한 패턴).
describe('splitOpenAndClosedRows', () => {
  it('RC가 아닌 행만 openRows로, RC인 행의 class_id만 closedClassIds로 분리한다', () => {
    const rows = [
      { class_id: 'A', raw_status: 'RT' },
      { class_id: 'B', raw_status: 'RC' },
      { class_id: 'C', raw_status: 'PR' },
      { class_id: 'D', raw_status: 'ST' },
      { class_id: 'E', raw_status: 'RC' },
    ];
    const { openRows, closedClassIds } = splitOpenAndClosedRows(rows);

    expect(openRows.map((r) => r.class_id)).toEqual(['A', 'C', 'D']);
    expect(closedClassIds).toEqual(['B', 'E']);
  });

  it('RC가 하나도 없으면 전부 openRows, closedClassIds는 빈 배열', () => {
    const rows = [{ class_id: 'A', raw_status: 'RT' }];
    const { openRows, closedClassIds } = splitOpenAndClosedRows(rows);

    expect(openRows).toHaveLength(1);
    expect(closedClassIds).toEqual([]);
  });

  it('입력이 비어있으면 둘 다 빈 배열', () => {
    expect(splitOpenAndClosedRows([])).toEqual({ openRows: [], closedClassIds: [] });
  });
});
