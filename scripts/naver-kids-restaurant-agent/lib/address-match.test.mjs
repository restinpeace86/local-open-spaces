import { describe, it, expect } from 'vitest';
import {
  nameSimilarity,
  extractRoadAndNumber,
  addressSimilarity,
  pickBestCandidate,
} from './address-match.mjs';

describe('nameSimilarity', () => {
  it('완전히 같은 이름은 1.0', () => {
    expect(nameSimilarity('원조남원추어탕', '원조남원추어탕')).toBe(1);
  });

  it('한쪽이 다른 쪽을 포함하면(지점명 등) 1.0', () => {
    expect(nameSimilarity('맥도날드', '맥도날드 동판교점')).toBe(1);
  });

  it('완전히 다른 이름은 낮은 점수', () => {
    expect(nameSimilarity('원조남원추어탕', '스타벅스')).toBeLessThan(0.3);
  });

  it('공백/괄호/하이픈 차이는 무시한다', () => {
    expect(nameSimilarity('(유)아웃백스테이크하우스코리아 판교점', '아웃백스테이크하우스 판교점')).toBeGreaterThan(0.5);
  });
});

describe('extractRoadAndNumber', () => {
  it('도로명+번지를 추출한다', () => {
    expect(extractRoadAndNumber('경기도 시흥시 동서로10번길 3')).toBe('동서로10번길 3');
  });

  it('하이픈 붙은 번지도 추출한다', () => {
    expect(extractRoadAndNumber('경기도 성남시 분당구 분당내곡로 131-1')).toBe('분당내곡로 131-1');
  });

  it('도로명 패턴이 없으면 null', () => {
    expect(extractRoadAndNumber('월곶동 643-8')).toBeNull();
  });

  it('주소가 없으면 null', () => {
    expect(extractRoadAndNumber(null)).toBeNull();
  });
});

describe('addressSimilarity', () => {
  it('도로명+번지가 일치하면 높은 점수(>=0.9)', () => {
    const score = addressSimilarity('경기도 시흥시 동서로10번길 3', '동서로10번길 3');
    expect(score).toBeGreaterThanOrEqual(0.9);
  });

  it('도로명이 다르면 낮은 점수', () => {
    const score = addressSimilarity('경기도 시흥시 동서로10번길 3', '서울특별시 강남구 테헤란로 152');
    expect(score).toBeLessThan(0.5);
  });

  it('도로명 추출이 둘 다 실패하면 전체 문자열 유사도로 대체한다', () => {
    const score = addressSimilarity('월곶동 643-8', '월곶동 643-8');
    expect(score).toBe(1);
  });
});

describe('pickBestCandidate', () => {
  const target = { name: '원조남원추어탕', address: '경기도 시흥시 동서로10번길 3' };

  it('이름+주소 모두 일치하는 후보를 고른다', () => {
    const candidates = [
      { id: '1', name: '전혀다른식당', roadAddress: '다른로 1', fullAddress: '서울 다른로 1' },
      { id: '2', name: '원조남원추어탕', roadAddress: '동서로10번길 3', fullAddress: '경기도 시흥시 동서로10번길 3' },
    ];

    const result = pickBestCandidate(target, candidates);
    expect(result.candidate.id).toBe('2');
  });

  it('이름은 같지만 주소가 전혀 다르면(동명이인) 매칭하지 않는다', () => {
    const candidates = [
      { id: '1', name: '원조남원추어탕', roadAddress: '테헤란로 152', fullAddress: '서울특별시 강남구 테헤란로 152' },
    ];

    expect(pickBestCandidate(target, candidates)).toBeNull();
  });

  it('후보가 없으면 null', () => {
    expect(pickBestCandidate(target, [])).toBeNull();
  });

  it('여러 후보가 기준을 만족하면 이름+주소 합산 점수가 가장 높은 것을 고른다', () => {
    const candidates = [
      { id: 'low', name: '원조남원추어탕집', roadAddress: '동서로10번길', fullAddress: '시흥 동서로10번길' },
      { id: 'high', name: '원조남원추어탕', roadAddress: '동서로10번길 3', fullAddress: '경기도 시흥시 동서로10번길 3' },
    ];

    const result = pickBestCandidate(target, candidates);
    expect(result.candidate.id).toBe('high');
  });
});
