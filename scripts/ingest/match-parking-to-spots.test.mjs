// [부설 주차장 1:1 스팟 매칭](implementation/todo.md 개선사항1) — 이름 유사도/
// 최선 매칭 선택 로직 단위 테스트. 실제 DB RPC 호출은 mock 처리.
import { describe, expect, it } from 'vitest';
import { normalizeFacilityName, nameSimilarity, pickBestMatches } from './match-parking-to-spots.mjs';

describe('normalizeFacilityName', () => {
  it('공통 단어(주차장/공영/지하 등)와 공백/특수문자를 제거한다', () => {
    expect(normalizeFacilityName('삼청공원 공영 주차장')).toBe('삼청공원');
    expect(normalizeFacilityName('OO빌딩 지하 주차장')).toBe('OO빌딩');
  });
});

describe('nameSimilarity', () => {
  it('정규화 후 완전히 같으면 1.0', () => {
    expect(nameSimilarity('삼청공원 주차장', '삼청공원')).toBe(1);
  });

  it('한쪽이 다른쪽을 포함하면 1.0', () => {
    expect(nameSimilarity('태종대유원지부설주차장', '태종대유원지')).toBe(1);
  });

  it('전혀 무관한 이름은 낮은 점수', () => {
    expect(nameSimilarity('삼청공원 주차장', '한강공원')).toBeLessThan(0.5);
  });

  it('둘 중 하나가 비어있으면 0', () => {
    expect(nameSimilarity('', '삼청공원')).toBe(0);
    expect(nameSimilarity('삼청공원', null)).toBe(0);
  });
});

describe('pickBestMatches', () => {
  it('유사도가 임계값 미달이면 매칭하지 않는다', () => {
    const candidates = [
      { parking_id: 'p1', parking_name: '삼청공원 주차장', spot_id: 's1', spot_name: '전혀 다른 장소', distance_meters: 10 },
    ];
    expect(pickBestMatches(candidates)).toEqual([]);
  });

  it('같은 parking_id에 후보가 여럿이면 유사도 높은(그 다음 거리 가까운) 쪽만 남긴다', () => {
    const candidates = [
      { parking_id: 'p1', parking_name: '삼청공원 주차장', spot_id: 's1', spot_name: '전혀 다른 곳', distance_meters: 5 },
      { parking_id: 'p1', parking_name: '삼청공원 주차장', spot_id: 's2', spot_name: '삼청공원', distance_meters: 40 },
    ];
    const result = pickBestMatches(candidates);
    expect(result).toHaveLength(1);
    expect(result[0].spot_id).toBe('s2');
  });

  it('두 개의 다른 parking_id가 같은 spot_id를 주장하면 더 유사하거나 더 가까운 쪽만 남긴다', () => {
    const candidates = [
      { parking_id: 'p1', parking_name: '삼청공원 주차장', spot_id: 's1', spot_name: '삼청공원', distance_meters: 30 },
      { parking_id: 'p2', parking_name: '삼청공원 공영주차장', spot_id: 's1', spot_name: '삼청공원', distance_meters: 10 },
    ];
    const result = pickBestMatches(candidates);
    expect(result).toHaveLength(1);
    expect(result[0].parking_id).toBe('p2');
  });

  it('임계값을 직접 지정할 수 있다', () => {
    const candidates = [
      { parking_id: 'p1', parking_name: 'AB', spot_id: 's1', spot_name: 'CD', distance_meters: 5 },
    ];
    expect(pickBestMatches(candidates, 0)).toHaveLength(1);
  });
});
