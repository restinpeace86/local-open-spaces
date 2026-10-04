// [롯데마트 문화센터 변화 감지 ping](2026-10-04) — detectChange() 단위 테스트.
// (사용자 지시로 v1의 버킷-합계 비교에서 v2의 "성인 제외 후 실제 데이터와
// 직접 비교" 방식으로 재설계됨 — "성인꺼는 데이터 가져온것에서 빼고나서
// 우리꺼 기존에 적재된거랑 비교를 해야지 변화가 있는지를 알수 있어".)
import { describe, expect, it } from 'vitest';
import { detectChange } from './lottemart-culture-club-ping.mjs';

function makeRow(classId, status) {
  return { class_id: classId, registration_status: status };
}

describe('detectChange', () => {
  it('모든 행의 상태가 기존 데이터와 동일하면 변화 없음으로 판단한다', () => {
    const fresh = [makeRow('a', '바로신청'), makeRow('b', '접수마감')];
    const stored = new Map([
      ['a', '바로신청'],
      ['b', '접수마감'],
    ]);
    expect(detectChange(fresh, stored)).toBe(false);
  });

  it('한 행이라도 상태가 바뀌었으면 변화로 감지한다', () => {
    const fresh = [makeRow('a', '바로신청'), makeRow('b', '전화문의')];
    const stored = new Map([
      ['a', '바로신청'],
      ['b', '접수마감'],
    ]);
    expect(detectChange(fresh, stored)).toBe(true);
  });

  it('기존 데이터에 없는 class_id(신규 강좌)가 있으면 변화로 감지한다', () => {
    const fresh = [makeRow('a', '바로신청'), makeRow('new-class', '바로신청')];
    const stored = new Map([['a', '바로신청']]);
    expect(detectChange(fresh, stored)).toBe(true);
  });

  it('빈 배열이면 변화 없음으로 판단한다', () => {
    expect(detectChange([], new Map())).toBe(false);
  });
});
