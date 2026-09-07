import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import {
  getBadgeGroupsForCategory,
  getBadgeOptionsForCategory,
  highlightKeywords,
  isKnownCurationBadgeKey,
  matchBadgeKeysFromText,
  resolveCurationCategoryId,
} from './curation-badges';

// [관리자용 블로그 큐레이션 모달](2026-09-05 사용자 지시, Decision 021) 단위 테스트.
// [뱃지 목록 정정 → 재정정](2026-09-06 사용자 지시): "룸/개별 공간 있음"을 room/
// private_space로 분리했다가, "룸하고 개별공간이 뭔 차이야? 그냥 2는 다시
// 합쳐줘"라는 피드백으로 원래의 단일 뱃지(private_room)로 되돌렸다. "예약
// 가능"(reservation_possible) 추가는 그대로 유지 — 12개 → 13개.
// [카테고리별 뱃지/룰 완전 독립 Config 구조](2026-09-07 개선사항4): 전역
// CURATION_BADGE_OPTIONS/isKnownCurationBadgeKey(key)가 카테고리별
// getBadgeOptionsForCategory(categoryId)/isKnownCurationBadgeKey(categoryId, key)로
// 바뀌었다. 'restaurant'가 기존(식당) 카테고리 id다.
describe('restaurant 카테고리 뱃지', () => {
  it('정정 반영 후 13개 뱃지가 정확히 존재한다', () => {
    const options = getBadgeOptionsForCategory('restaurant');
    expect(options).toHaveLength(13);
    expect(options.map((o) => o.label)).toEqual([
      '주차 완비',
      '유모차 가능',
      '수유실 있음',
      '기저귀 갈이대',
      '아기의자',
      '유아 식기',
      '키즈 메뉴',
      '좌식/온돌 있음',
      '룸/개별 공간 있음',
      '키즈존/놀이방',
      '야외 마당/테라스',
      '예약 필수',
      '예약 가능',
    ]);
  });

  it('4개 그룹(이동/편의, 식사/아기, 공간/놀이, 운영)으로 나뉜다', () => {
    const groupCounts = getBadgeOptionsForCategory('restaurant').reduce<Record<string, number>>((acc, o) => {
      acc[o.group] = (acc[o.group] ?? 0) + 1;
      return acc;
    }, {});
    expect(groupCounts).toEqual({ '이동/편의': 4, '식사/아기': 5, '공간/놀이': 2, 운영: 2 });
  });

  it('isKnownCurationBadgeKey는 실제 키만 true를 반환한다', () => {
    expect(isKnownCurationBadgeKey('restaurant', 'parking')).toBe(true);
    expect(isKnownCurationBadgeKey('restaurant', 'private_room')).toBe(true);
    expect(isKnownCurationBadgeKey('restaurant', 'reservation_possible')).toBe(true);
    expect(isKnownCurationBadgeKey('restaurant', 'room')).toBe(false); // 분리했다가 되돌린 임시 키는 없음
    expect(isKnownCurationBadgeKey('restaurant', 'private_space')).toBe(false);
    expect(isKnownCurationBadgeKey('restaurant', '완전히새로운키')).toBe(false);
  });
});

// [카테고리별 뱃지/룰 완전 독립 Config 구조](2026-09-07 개선사항4 — 사용자 지시):
// "노출 중분류에 대하여 적용시 [전부] 같이 가도록.. 하나씩 채워넣어야지 거기에
// 맞는거" — 실측 확인한 노출 중분류 13개(service_categories 실제 값) 전부가
// 등록돼 있어야 하고, "키즈카페 / 실내놀이터"는 식당과 완전히 다른 전용 뱃지를
// 갖는다.
describe('resolveCurationCategoryId — 노출 중분류 → 뱃지 카테고리 매핑', () => {
  it('키즈친화 식당(놀이시설 포함)은 restaurant로 매핑된다', () => {
    expect(resolveCurationCategoryId('키즈친화 식당(놀이시설 포함)')).toBe('restaurant');
  });

  it('키즈카페 / 실내놀이터는 kids_cafe로 매핑된다', () => {
    expect(resolveCurationCategoryId('키즈카페 / 실내놀이터')).toBe('kids_cafe');
  });

  it('노출 중분류가 없거나(null) 매칭되는 config가 없으면 restaurant로 되돌아간다(기존 최다 실사용 카테고리)', () => {
    expect(resolveCurationCategoryId(null)).toBe('restaurant');
    expect(resolveCurationCategoryId(undefined)).toBe('restaurant');
    expect(resolveCurationCategoryId('존재하지 않는 이름')).toBe('restaurant');
  });

  it('나머지 노출 중분류(예: 캠핑장/피크닉장, 어린이 도서관)도 각자 다른 카테고리 id로 매핑되고, 서로 다른 카테고리끼리는 겹치지 않는다', () => {
    const camping = resolveCurationCategoryId('캠핑장 / 피크닉장');
    const library = resolveCurationCategoryId('어린이 도서관');
    expect(camping).not.toBe('restaurant');
    expect(camping).not.toBe('kids_cafe');
    expect(library).not.toBe('restaurant');
    expect(library).not.toBe(camping);
  });
});

describe('kids_cafe 카테고리 뱃지 — 식당과 완전히 독립적', () => {
  it('식당에는 없는 키즈카페 전용 뱃지(트램폴린/방방 등)를 갖는다', () => {
    const options = getBadgeOptionsForCategory('kids_cafe');
    expect(options.map((o) => o.label)).toContain('트램폴린/방방');
    expect(options.map((o) => o.label)).not.toContain('좌식/온돌 있음'); // 식당 전용 항목은 없음
  });

  it('4개 그룹(이동/편의, 놀이/시설, 부대시설/보호자, 운영)으로 나뉜다', () => {
    expect(getBadgeGroupsForCategory('kids_cafe')).toEqual(['이동/편의', '놀이/시설', '부대시설/보호자', '운영']);
  });
});

describe('아직 전용 콘텐츠가 없는 노출 중분류(보편 임시 뱃지)', () => {
  it('식당/키즈카페 전용 항목 없이 보편적인 항목(주차/유모차 등)만 갖는다', () => {
    const categoryId = resolveCurationCategoryId('캠핑장 / 피크닉장');
    const labels = getBadgeOptionsForCategory(categoryId).map((o) => o.label);
    expect(labels).toEqual(['주차 완비', '유모차 가능', '수유실 있음', '기저귀 갈이대', '예약 필수', '예약 가능']);
  });
});

// [핵심 기능: 자동 형광펜 하이라이팅](사용자 지시 원문): "핵심 뱃지 관련 키워드들에
// 자동으로 노란색 배경 형광펜 마킹(<mark>)이 적용되도록.."
describe('highlightKeywords', () => {
  it('키워드를 <mark>로 감싼다', () => {
    const { container } = render(<div>{highlightKeywords('여기는 주차장이 넓고 유모차도 편해요')}</div>);
    const marks = container.querySelectorAll('mark');
    expect(Array.from(marks).map((m) => m.textContent)).toEqual(['주차장', '유모차']);
  });

  it('노란색 배경(#fef08a)이 인라인 스타일로 적용된다', () => {
    const { container } = render(<div>{highlightKeywords('수유실 있어요')}</div>);
    const mark = container.querySelector('mark')!;
    expect(mark.style.backgroundColor).toBe('rgb(254, 240, 138)'); // #fef08a
  });

  it('긴 키워드를 우선 매칭한다("유모차반입"이 "유모차"에 가려 잘리지 않음)', () => {
    const { container } = render(<div>{highlightKeywords('유모차반입 가능합니다')}</div>);
    const marks = container.querySelectorAll('mark');
    expect(marks).toHaveLength(1);
    expect(marks[0].textContent).toBe('유모차반입');
  });

  it('매칭 키워드가 없으면 원문 그대로 렌더링된다', () => {
    const { container } = render(<div>{highlightKeywords('평범한 문장입니다')}</div>);
    expect(container.querySelectorAll('mark')).toHaveLength(0);
    expect(container.textContent).toBe('평범한 문장입니다');
  });

  it('빈 문자열이면 그대로 반환한다(에러 없음)', () => {
    const { container } = render(<div>{highlightKeywords('')}</div>);
    expect(container.textContent).toBe('');
  });

  // [공백 무시 매칭](2026-09-07 개선사항3 2번): "아기의자", "아기 의자", "아 기 의 자"를
  // 전부 동일하게 매칭할 것.
  it('키워드 사이에 공백이 끼어 있어도 매칭한다', () => {
    const { container } = render(<div>{highlightKeywords('아기 의자가 있어요')}</div>);
    const marks = container.querySelectorAll('mark');
    expect(Array.from(marks).map((m) => m.textContent)).toEqual(['아기 의자']);
  });

  it('키워드 글자마다 공백이 끼어 있어도(아 기 의 자) 매칭한다', () => {
    const { container } = render(<div>{highlightKeywords('아 기 의 자 완비')}</div>);
    const marks = container.querySelectorAll('mark');
    expect(Array.from(marks).map((m) => m.textContent)).toEqual(['아 기 의 자']);
  });

  // [유의어 확장](2026-09-07 개선사항3 2번): "아기의자 ↔ 유아용 의자" 등.
  it('유의어(유아용 의자)도 매칭한다', () => {
    const { container } = render(<div>{highlightKeywords('유아용 의자가 준비돼 있어요')}</div>);
    const marks = container.querySelectorAll('mark');
    expect(Array.from(marks).map((m) => m.textContent)).toEqual(['유아용 의자']);
  });

  // [지역/지점명 동시 하이라이팅](2026-09-07 개선사항3 3번): 뱃지 키워드가 아닌 임의
  // 키워드(스팟의 지역명 등)도 함께 하이라이트할 수 있어야 한다.
  it('extraKeywords로 넘긴 지역명도 뱃지 키워드와 함께 하이라이트한다', () => {
    const { container } = render(<div>{highlightKeywords('노원에 있는 주차 가능한 곳', 'restaurant', ['노원'])}</div>);
    const marks = container.querySelectorAll('mark');
    expect(Array.from(marks).map((m) => m.textContent)).toEqual(['노원', '주차']);
  });

  it('extraKeywords도 공백 무시 매칭이 똑같이 적용된다', () => {
    const { container } = render(<div>{highlightKeywords('노 원 맛집이에요', 'restaurant', ['노원'])}</div>);
    const marks = container.querySelectorAll('mark');
    expect(Array.from(marks).map((m) => m.textContent)).toEqual(['노 원']);
  });

  // [카테고리별 실시간 전환](2026-09-07 개선사항4): 카테고리를 바꾸면 그 카테고리의
  // 키워드로만 하이라이트한다.
  it('카테고리를 바꾸면 그 카테고리 전용 키워드로 하이라이트가 바뀐다', () => {
    const text = '트램폴린이 있고 좌식 공간도 있어요';
    const { container: restaurantView } = render(<div>{highlightKeywords(text, 'restaurant')}</div>);
    expect(Array.from(restaurantView.querySelectorAll('mark')).map((m) => m.textContent)).toEqual(['좌식']);

    const { container: kidsCafeView } = render(<div>{highlightKeywords(text, 'kids_cafe')}</div>);
    expect(Array.from(kidsCafeView.querySelectorAll('mark')).map((m) => m.textContent)).toEqual(['트램폴린']);
  });
});

// [키워드 하이라이팅에 따른 뱃지 자동 체크](2026-09-07 개선사항3 4번): "시스템이
// 자동 체크해 둔 뱃지를 눈으로 빠르게 검수하고.. 간편하게 체크를 해제할 수 있는"
// 세미오토 검수 — 자동 체크 대상 뱃지 판정 로직만 이 함수의 책임이고, 실제 체크
// 해제 UX는 useSpotCurationForm/CurationBadgeForm이 담당한다.
describe('matchBadgeKeysFromText', () => {
  it('본문에서 매칭된 키워드에 해당하는 뱃지 키를 모두 반환한다(기본 restaurant 카테고리)', () => {
    const result = matchBadgeKeysFromText('주차 가능하고 유모차도 반입되고 수유실도 있어요');
    expect(result).toEqual(new Set(['parking', 'stroller', 'nursing_room']));
  });

  it('유의어/공백 변형으로 매칭돼도 같은 뱃지 키로 귀속된다', () => {
    const result = matchBadgeKeysFromText('아 기 의 자랑 유아용 의자 둘 다 있어요');
    expect(result).toEqual(new Set(['kids_chair']));
  });

  it('매칭이 없으면 빈 Set을 반환한다', () => {
    expect(matchBadgeKeysFromText('평범한 문장입니다')).toEqual(new Set());
  });

  it('빈 문자열이면 빈 Set을 반환한다', () => {
    expect(matchBadgeKeysFromText('')).toEqual(new Set());
  });

  it('예약필수처럼 더 구체적인 문구는 예약(가능) 대신 예약필수 뱃지로만 귀속된다', () => {
    const result = matchBadgeKeysFromText('예약필수입니다');
    expect(result).toEqual(new Set(['reservation_required']));
  });

  it('kids_cafe 카테고리로 지정하면 그 카테고리의 뱃지 키로 귀속된다', () => {
    const result = matchBadgeKeysFromText('트램폴린이랑 볼풀장이 있어요', 'kids_cafe');
    expect(result).toEqual(new Set(['kc_trampoline', 'kc_ball_pool_jungle']));
  });
});
