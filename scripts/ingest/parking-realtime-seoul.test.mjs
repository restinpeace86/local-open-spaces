// [서울시 시영주차장 실시간 주차대수 연동](implementation/todo.md 개선사항2) —
// transform()/findBestParkingMatch() 단위 테스트. 실측 GetParkingInfo 샘플
// 그대로(2026-10-15 직접 호출).
import { describe, expect, it } from 'vitest';
import { transform, findBestParkingMatch } from './parking-realtime-seoul.mjs';

const ROW_NOEOI = {
  PKLT_CD: '171721',
  PKLT_NM: '세종로 공영주차장(시)',
  ADDR: '종로구 세종로 80-1',
  PRK_TYPE_NM: '노외 주차장',
  TPKCT: 1260.0,
  NOW_PRK_VHCL_CNT: 475.0,
  NOW_PRK_VHCL_UPDT_TM: '2026-10-15 19:37:23',
};

const ROW_NOSANG = { ...ROW_NOEOI, PRK_TYPE_NM: '노상 주차장' };

describe('transform', () => {
  it('노상 주차장은 null(제외 대상)을 반환한다', () => {
    expect(transform(ROW_NOSANG)).toBeNull();
  });

  it('노외 주차장은 가능 면수를 (총면수 - 현재주차차량)으로 계산한다', () => {
    const result = transform(ROW_NOEOI);
    expect(result).toMatchObject({
      name: '세종로 공영주차장(시)',
      address: '종로구 세종로 80-1',
      gu: '종로구',
      availableCount: 785, // 1260 - 475
    });
    expect(result.updatedAt).toBe(new Date('2026-10-15T19:37:23').toISOString());
  });

  it('필수 필드(이름/주소)가 없으면 null을 반환한다', () => {
    expect(transform({ ...ROW_NOEOI, PKLT_NM: '' })).toBeNull();
  });

  it('총면수/현재차량 중 하나라도 숫자가 아니면 availableCount는 null', () => {
    const result = transform({ ...ROW_NOEOI, TPKCT: '' });
    expect(result.availableCount).toBeNull();
  });
});

describe('findBestParkingMatch', () => {
  it('같은 구 + 이름 유사도 임계값 이상인 후보 중 가장 유사한 것을 고른다', () => {
    const row = { name: '세종로 공영주차장(시)', gu: '종로구' };
    const candidates = [
      { id: 'a', name: '세종로공영주차장', road_address: '서울특별시 종로구 세종로 80-1', lot_address: null },
      { id: 'b', name: '세종로', road_address: '서울특별시 종로구 세종로 80-1', lot_address: null },
    ];
    const result = findBestParkingMatch(row, candidates);
    expect(result?.id).toBe('a');
  });

  it('구가 다르면 이름이 같아도 매칭하지 않는다(흔한 이름 오매칭 방지)', () => {
    const row = { name: '매봉산유아숲체험원', gu: '중구' };
    const candidates = [{ id: 'a', name: '매봉산유아숲체험원', road_address: '서울특별시 용산구 한남동', lot_address: null }];
    expect(findBestParkingMatch(row, candidates)).toBeNull();
  });

  it('유사도가 임계값 미달이면 null을 반환한다', () => {
    const row = { name: '세종로 공영주차장', gu: '종로구' };
    const candidates = [{ id: 'a', name: '전혀 다른 이름', road_address: '서울특별시 종로구', lot_address: null }];
    expect(findBestParkingMatch(row, candidates)).toBeNull();
  });

  it('후보가 없으면 null을 반환한다', () => {
    expect(findBestParkingMatch({ name: 'X', gu: '종로구' }, [])).toBeNull();
  });
});
