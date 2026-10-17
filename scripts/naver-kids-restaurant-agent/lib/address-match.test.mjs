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

  it('도로명이 없으면 동 이름+번지로 비교한다(지번 주소)', () => {
    expect(addressSimilarity('월곶동 643-8', '월곶동 643-8')).toBe(1);
  });

  // [실측 회귀 테스트](2026-10-16, 유아숲체험원 매칭 중 발견) — 도로명도 동/번지도
  // 둘 중 하나라도 추출되면 그걸로 비교해야 하는데, 수정 전엔 둘 다 지번
  // 주소라도 "동 이름 비교"를 거치지 않고 곧장 전체 문자열 Dice로 대체되면서
  // "서울특별시 노원구"라는 긴 공유 접두어 때문에 전혀 다른 동(공릉동 vs
  // 상계동)인데도 0.5를 넘어 오탐이 났다(실제로 "불암산공원.. 공릉동 산223-1"이
  // "수락산.. 상계동 산59-2"로 잘못 매칭됨).
  it('동 이름이 다른 지번 주소는 시/구가 같아도 낮은 점수(공유 접두어로 인한 오탐 방지)', () => {
    const score = addressSimilarity('서울특별시 노원구 공릉동 산 223-1', '서울특별시 노원구 상계동 산59-2');
    expect(score).toBeLessThan(0.5);
  });

  // [실측 과잉교정 회귀 테스트](2026-10-17 사용자 지적: "배봉산근린공원
  // 유아숲체험원 이거는 쳤을때 나오는데?") — 네이버에 정확히 같은 이름으로
  // 결과가 있었는데도("휘경동 산6-80") 우리 DB 행("휘경동 산6-91")과 번지
  // 끝자리만 달라 매칭되지 않았다. 공원/산림 시설은 같은 부지가 여러 인접
  // 지번에 걸쳐 등재되는 경우가 흔하므로, 동과 메인 지번(하이픈 앞)까지
  // 같으면 서브 지번만 달라도 높은 점수(0.5 이상)를 줘야 한다.
  it('동과 메인 지번이 같으면 서브 지번만 달라도 매칭 가능한 점수(인접 지번 허용)', () => {
    const score = addressSimilarity('서울특별시 동대문구 휘경동 산 6-91', '서울특별시 동대문구 휘경동 산6-80');
    expect(score).toBeGreaterThanOrEqual(0.5);
  });

  it('동 이름 뒤 "N가" 구역 표기가 있어도 지번을 정확히 추출한다(금호동3가 사례)', () => {
    // 수정 전엔 "3가"의 "3"을 지번으로 잘못 잡아 "2-1"을 놓쳤다 — 서로 다른
    // 지번("2-1" vs "9-9")인데도 "3"만 비교해 우연히 같아져 오탐이 날 수 있는
    // 구조였다. 지금은 정확히 "2-1"/"9-9"를 비교해 제대로 구분해야 한다.
    const score = addressSimilarity('서울특별시 성동구 금호동3가 산 2-1번지', '서울특별시 성동구 금호동3가 산 9-9번지');
    expect(score).toBeLessThan(0.5);
  });

  it('도로명도 동 이름도 둘 다 추출 실패하면 전체 문자열 유사도로 최종 대체한다', () => {
    // "번지"형태(동/읍/면/리 명시 없음)라 DONG_LOT_PATTERN도 매칭되지 않는 극단적
    // 사례 — 완전히 같은 문자열이면 짧아도(10자 미만) 1.0이어야 한다(아래
    // "너무 짧은 주소" 테스트와 구분 — 완전 일치는 길이와 무관하게 신뢰).
    const score = addressSimilarity('산 1-2번지 일대', '산 1-2번지 일대');
    expect(score).toBe(1);
  });

  // [실측 회귀 테스트](2026-10-16, 유아숲체험원 "참고 목록" 매칭 중 발견) — 네이버
  // 쪽 주소가 "서울특별시 강북구"처럼 시/구까지만 있고 동/번지가 전혀 없는 경우가
  // 실제로 있었다("북서울꿈의숲유아숲체험원" 등). 이 짧은 문자열은 상대 주소가
  // 같은 시/구로 시작하기만 하면 모든 2-gram이 그대로 포함돼 Dice 비율이 높게
  // 나와, 완전히 다른 동(번동 vs 어딘지 모름)인데도 통과했다.
  it('한쪽 주소가 시/구까지만 있고 너무 짧으면(동/도로명 없음) 매칭하지 않는다', () => {
    const score = addressSimilarity('서울특별시 강북구 번동 336-2번지', '서울특별시 강북구');
    expect(score).toBeLessThan(0.5);
  });

  // [실측 회귀 테스트 — 2단계](2026-10-16, 같은 날 재검증 중 추가 발견) — 위
  // "너무 짧은 주소" 수정만으로는 양쪽 다 어느 정도 길이가 있을 때는 여전히
  // 뚫렸다: "오리로 1102-4, 천왕동"과 "개봉동 416-102"는 동도 번지도 전혀
  // 다른데, 둘 다 "서울특별시 구로구"로 시작한다는 이유만으로 Dice 비율이
  // 0.5를 넘어 통과했다("개웃개웃 유아숲체험원"이 "잣절 유아숲체험원"으로
  // 오매칭). 시/도+시/군/구 접두어를 떼고 비교하도록 고쳤다.
  it('시/구 접두어가 같아도 그 뒤 동/번지가 다르면 낮은 점수(접두어 제외 비교)', () => {
    const score = addressSimilarity('서울특별시 구로구 오리로 1102-4, (천왕동)', '서울특별시 구로구 개봉동 416-102');
    expect(score).toBeLessThan(0.5);
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

  // [매칭 기준 변경](2026-10-17 사용자 지시): "이름 검색시 여러개 나오는경우..
  // 이경우 다건에 대하여 우리주소 교차로 봐서 가장 적합한거.. 정확히 같은
  // 이름인데 지번이 다르면 지번을 네이버껄로 바꿔" — 주소 교차검증은 동명이
  // 여러 건 나왔을 때만 쓰는 도구다. 검색 결과에 이름이 정확히 같은 후보가
  // 단 하나뿐이면, 주소/지번 표기가 달라도(공원/산림 시설은 지번이 여러 개로
  // 쪼개져 있을 수 있음) 그 자체로 확정한다 — 이전엔 주소까지 안 맞으면
  // 거부했으나, 더 이상 그렇게 하지 않는다(아래 "여러 건" 테스트와 대비).
  it('이름이 정확히 일치하는 후보가 유일하면 주소가 달라도 확정한다(지번은 네이버가 더 정확할 수 있음)', () => {
    const candidates = [
      { id: '1', name: '원조남원추어탕', roadAddress: '테헤란로 152', fullAddress: '서울특별시 강남구 테헤란로 152' },
    ];

    const result = pickBestCandidate(target, candidates);
    expect(result.candidate.id).toBe('1');
  });

  it('이름이 정확히 같은 후보가 여러 개면(동명이인) 주소가 가장 잘 맞는 것을 고른다', () => {
    const candidates = [
      { id: 'wrong-region', name: '원조남원추어탕', roadAddress: '테헤란로 152', fullAddress: '서울특별시 강남구 테헤란로 152' },
      { id: 'right-region', name: '원조남원추어탕', roadAddress: '동서로10번길 3', fullAddress: '경기도 시흥시 동서로10번길 3' },
    ];

    const result = pickBestCandidate(target, candidates);
    expect(result.candidate.id).toBe('right-region');
  });

  it('이름이 정확히 같은 후보가 여러 개인데 주소로도 못 가르면 매칭하지 않는다', () => {
    const candidates = [
      { id: 'a', name: '원조남원추어탕', roadAddress: '테헤란로 152', fullAddress: '서울특별시 강남구 테헤란로 152' },
      { id: 'b', name: '원조남원추어탕', roadAddress: '올림픽로 300', fullAddress: '서울특별시 송파구 올림픽로 300' },
    ];

    expect(pickBestCandidate(target, candidates)).toBeNull();
  });

  it('후보가 없으면 null', () => {
    expect(pickBestCandidate(target, [])).toBeNull();
  });

  it('이름이 정확히 같은 후보가 없으면 이름+주소 둘 다 최소 기준을 만족하는 것 중 합산 점수가 가장 높은 것을 고른다', () => {
    const candidates = [
      { id: 'low', name: '원조남원추어탕집', roadAddress: '동서로10번길', fullAddress: '시흥 동서로10번길' },
      { id: 'also-low', name: '원조남원추어탕점', roadAddress: '동서로10번길 3', fullAddress: '경기도 시흥시 동서로10번길 3' },
    ];

    const result = pickBestCandidate(target, candidates);
    expect(result.candidate.id).toBe('also-low');
  });
});
