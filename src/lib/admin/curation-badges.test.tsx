import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import {
  aggregateMinAgeFromTexts,
  clampMinAgeRecommended,
  getBadgeGroupsForCategory,
  getBadgeOptionsForCategory,
  highlightKeywords,
  isKnownCurationBadgeKey,
  matchBadgeKeysFromText,
  resolveCurationCategoryId,
  suggestMinAgeFromText,
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

  it('6개 그룹(이동/편의, 놀이/시설, 부대시설/보호자, 운영, 공공/민간, 연령대)으로 나뉜다', () => {
    expect(getBadgeGroupsForCategory('kids_cafe')).toEqual([
      '이동/편의',
      '놀이/시설',
      '부대시설/보호자',
      '운영',
      '공공/민간',
      '연령대',
    ]);
  });

  // [뱃지 확장](2026-09-08 사용자 지시): "미끄럼틀 추가해.. 체험존 같은것도..
  // 공공인지 민간인지 뱃지도.. 연령대.. 체크할수있는거"
  it('신규 뱃지(미끄럼틀/체험존/공공·민간/연령대 3종)가 정확히 존재한다', () => {
    const options = getBadgeOptionsForCategory('kids_cafe');
    expect(options.map((o) => o.label)).toEqual(
      expect.arrayContaining([
        '미끄럼틀',
        '체험존/프로그램존(미술·오감놀이 등)',
        '공공 운영',
        '민간 운영',
        '영유아(0~36개월)',
        '미취학(7세 이하)',
        '취학(초등학생)',
      ])
    );
    expect(options).toHaveLength(20);
  });

  it('미끄럼틀은 볼풀장/정글짐과 별개의 전용 뱃지로 매칭된다(예전엔 볼풀장 키워드에 섞여 있었음)', () => {
    const result = matchBadgeKeysFromText('미끄럼틀이랑 볼풀장이 있어요', 'kids_cafe');
    expect(result).toEqual(new Set(['kc_slide', 'kc_ball_pool_jungle']));
  });

  it('체험존/드로잉존 키워드는 kc_experience_zone으로 매칭된다', () => {
    const result = matchBadgeKeysFromText('물감 놀이하는 드로잉존이 따로 있어요', 'kids_cafe');
    expect(result).toEqual(new Set(['kc_experience_zone']));
  });

  it('카페테리아는 기존 식사/간식 판매 뱃지(kc_food)로 매칭된다(신규 뱃지 아님)', () => {
    const result = matchBadgeKeysFromText('카페테리아에서 간단히 먹을 수 있어요', 'kids_cafe');
    expect(result).toEqual(new Set(['kc_food']));
  });

  it('공공/민간 운영 키워드가 각각 다른 뱃지로 매칭된다', () => {
    expect(matchBadgeKeysFromText('구립으로 운영되는 곳이에요', 'kids_cafe')).toEqual(new Set(['kc_public_operated']));
    expect(matchBadgeKeysFromText('사설 프랜차이즈 키즈카페입니다', 'kids_cafe')).toEqual(
      new Set(['kc_private_operated'])
    );
  });

  it('연령대 3종(영유아/미취학/취학)은 동시에 여러 개가 매칭될 수 있다(복수 선택)', () => {
    const result = matchBadgeKeysFromText('영유아부터 미취학, 초등학생까지 다 즐길 수 있어요', 'kids_cafe');
    expect(result).toEqual(new Set(['kc_age_infant', 'kc_age_preschool', 'kc_age_school']));
  });

  // [트램펄린 표기 동의어](2026-09-08 사용자 지시, todo.md 개선사항1-1): "트램폴린에
  // 대하여 키워드 트램펄린도 가져가도록 할것"
  it('트램펄린(대체 표기)도 트램폴린과 같은 뱃지로 매칭된다', () => {
    expect(matchBadgeKeysFromText('트램펄린 존이 있어요', 'kids_cafe')).toEqual(new Set(['kc_trampoline']));
    expect(matchBadgeKeysFromText('트램폴린 존이 있어요', 'kids_cafe')).toEqual(new Set(['kc_trampoline']));
  });
});

describe('아직 전용 콘텐츠가 없는 노출 중분류(보편 임시 뱃지)', () => {
  it('식당/키즈카페 전용 항목 없이 보편적인 항목(주차/유모차 등)만 갖는다', () => {
    // [2026-09-10] '캠핑장 / 피크닉장'은 전용 config로 승격돼(아래 describe 참고)
    // 이 테스트는 여전히 보편 임시 뱃지인 '어린이 도서관'으로 검증한다.
    const categoryId = resolveCurationCategoryId('어린이 도서관');
    const labels = getBadgeOptionsForCategory(categoryId).map((o) => o.label);
    expect(labels).toEqual(['주차 완비', '유모차 가능', '수유실 있음', '기저귀 갈이대', '예약 필수', '예약 가능']);
  });
});

// [캠핑장/휴양마을/체험농장 뱃지 체계 전면 재작성](2026-09-10 사용자 지시,
// implementation/todo.md 개선사항1): 임시 cp_/rv_/ef_ 키 → 스펙 확정 키
// (CAMPING_TRAMPOLINE / NEG_BACKPACKING / RURAL_* / EDU_*)로 교체.
describe('camping(캠핑장 / 피크닉장) 카테고리 뱃지', () => {
  it('노출 중분류 "캠핑장 / 피크닉장"은 camping으로 매핑된다', () => {
    expect(resolveCurationCategoryId('캠핑장 / 피크닉장')).toBe('camping');
  });

  it('포지티브(트램폴린/물놀이/모래놀이/온수 등)와 네거티브(백패킹/험지/노키즈존 등) 뱃지를 모두 갖는다', () => {
    const labels = getBadgeOptionsForCategory('camping').map((o) => o.label);
    expect(labels).toEqual(
      expect.arrayContaining([
        '트램폴린/방방',
        '수영장/물놀이장/계곡 인접',
        '모래놀이터',
        '온수 샤워/온수 개수대',
        '백패킹/오지 전용',
        '험지/고지대',
        '노키즈존/성인 전용',
      ])
    );
  });

  it('4개 그룹(놀이/물놀이, 편의/시설, 캠핑 유형, 주의/제한)으로 나뉜다', () => {
    expect(getBadgeGroupsForCategory('camping')).toEqual(['놀이/물놀이', '편의/시설', '캠핑 유형', '주의/제한']);
  });

  it('스펙 예시 문구가 각 뱃지 키로 정확히 매칭된다', () => {
    expect(matchBadgeKeysFromText('방방이랑 트램펄린, 모래놀이터, 온수샤워까지 다 있어요', 'camping')).toEqual(
      new Set(['CAMPING_TRAMPOLINE', 'CAMPING_SAND', 'CAMPING_WARM_WATER'])
    );
    expect(matchBadgeKeysFromText('백패킹 전용이라 험지를 올라가야 하고 노키즈존이에요', 'camping')).toEqual(
      new Set(['NEG_BACKPACKING', 'NEG_ROUGH_TERRAIN', 'NEG_NO_KIDS'])
    );
  });

  it('"위험한 계곡"은 물놀이(CAMPING_WATER_PLAY)가 아니라 네거티브(NEG_DANGEROUS_VALLEY)로 귀속된다', () => {
    expect(matchBadgeKeysFromText('안전펜스 없는 위험한 계곡이라 물살 센 편', 'camping')).toEqual(
      new Set(['NEG_DANGEROUS_VALLEY'])
    );
  });
});

describe('rural_village(휴양마을) 카테고리 뱃지', () => {
  it('노출 중분류 "휴양마을"은 rural_village로 매핑된다', () => {
    expect(resolveCurationCategoryId('휴양마을')).toBe('rural_village');
  });

  it('포지티브(냇가 물놀이/동물 먹이주기 등)와 네거티브(깊은 계곡/오지 마을 등) 뱃지를 모두 갖는다', () => {
    const labels = getBadgeOptionsForCategory('rural_village').map((o) => o.label);
    expect(labels).toEqual(
      expect.arrayContaining([
        '냇가/계곡/갯벌 물놀이',
        '동물 먹이주기/교감',
        '안전펜스 없는 위험한 냇가/계곡',
        '오지 마을/진입로 협소',
      ])
    );
  });

  it('갯벌/동물 먹이주기 키워드가 정확히 매칭된다', () => {
    expect(matchBadgeKeysFromText('조개캐기 하러 갯벌에 다녀왔어요', 'rural_village')).toEqual(
      new Set(['RURAL_STREAM_PLAY'])
    );
    expect(matchBadgeKeysFromText('토끼 먹이주기 체험이 있어요', 'rural_village')).toEqual(
      new Set(['RURAL_ANIMAL_FEEDING'])
    );
  });
});

describe('education_farm(체험농장·농원) 카테고리 뱃지', () => {
  it('노출 중분류 "체험농장·농원"은 education_farm으로 매핑된다', () => {
    expect(resolveCurationCategoryId('체험농장·농원')).toBe('education_farm');
  });

  it('포지티브(동물 교감/수확 학습 등)와 네거티브(해충 주의/농기계 위험 등) 뱃지를 모두 갖는다', () => {
    const labels = getBadgeOptionsForCategory('education_farm').map((o) => o.label);
    expect(labels).toEqual(
      expect.arrayContaining([
        '동물 교감·승마 체험',
        '농작물 수확·관찰 학습',
        '농기계 이동 구간 등 안전 주의',
        '벌·모기 등 해충 주의 야외',
      ])
    );
  });

  it('체험/위험 관련 키워드가 정확히 매칭된다', () => {
    expect(matchBadgeKeysFromText('승마도 하고 채집도 하고 도자기도 빚어요', 'education_farm')).toEqual(
      new Set(['EDU_ANIMAL_EXPERIENCE', 'EDU_CROP_HARVEST', 'EDU_MAKING_COOKING'])
    );
    expect(matchBadgeKeysFromText('농기계 이동 구간이 있어 말벌도 조심해야 해요', 'education_farm')).toEqual(
      new Set(['NEG_EDU_MACHINE_HAZARD', 'NEG_EDU_PESTS_RISK'])
    );
  });

  it('단일 음절 키워드("양")는 오검출 방지를 위해 "양떼"로 구체화되어 있다', () => {
    expect(matchBadgeKeysFromText('수량이 많고 다양한 프로그램', 'education_farm')).toEqual(new Set());
    expect(matchBadgeKeysFromText('양떼 목장 체험', 'education_farm')).toEqual(new Set(['EDU_ANIMAL_EXPERIENCE']));
  });
});

// [동적 연령 추천 시스템 — min_age_recommended](2026-09-10 사용자 지시,
// implementation/todo.md 개선사항1): 후기 텍스트 → 추천 만 나이 하한 자동 판정.
describe('suggestMinAgeFromText', () => {
  it('미취학 제한 맥락("초등 이상"/"미취학 어려움")이면 7을 제안한다', () => {
    expect(suggestMinAgeFromText('놀이 난이도가 있어서 초등 이상 추천이에요')).toBe(7);
    expect(suggestMinAgeFromText('미취학 아이는 좀 어려워하더라고요')).toBe(7);
    expect(suggestMinAgeFromText('초등학생부터 제대로 즐길 수 있어요')).toBe(7);
  });

  it('영유아 제한 맥락("영유아 힘들다"/"36개월 이하")이면 3을 제안한다', () => {
    expect(suggestMinAgeFromText('영유아는 힘들 수 있어요')).toBe(3);
    expect(suggestMinAgeFromText('36개월 이하는 입장이 안 됩니다')).toBe(3);
  });

  it('명시된 "만 N세 이상 / N세부터"는 그 숫자를 제안한다', () => {
    expect(suggestMinAgeFromText('만 5세 이상만 이용 가능')).toBe(5);
    expect(suggestMinAgeFromText('8세부터 참여할 수 있는 프로그램')).toBe(8);
  });

  it('단순 "3세 아이와 다녀왔어요"처럼 하한 표현이 없으면 제안하지 않는다', () => {
    expect(suggestMinAgeFromText('3세 아이와 다녀왔는데 좋았어요')).toBeNull();
    expect(suggestMinAgeFromText('평범한 후기입니다')).toBeNull();
  });

  it('여러 신호가 잡히면 가장 보수적인(큰) 값을 채택한다', () => {
    expect(suggestMinAgeFromText('영유아는 어렵고 초등학생 이상이면 딱 좋아요')).toBe(7);
  });

  it('aggregateMinAgeFromTexts는 여러 본문 중 최댓값을, 신호 없으면 null을 반환한다', () => {
    expect(aggregateMinAgeFromTexts(['영유아 어렵다는 후기', '초등 이상 추천'])).toBe(7);
    expect(aggregateMinAgeFromTexts([null, '평범', undefined])).toBeNull();
  });

  it('clampMinAgeRecommended는 0~19로 제한하고 잘못된 값은 0으로 만든다', () => {
    expect(clampMinAgeRecommended(7)).toBe(7);
    expect(clampMinAgeRecommended(-3)).toBe(0);
    expect(clampMinAgeRecommended(99)).toBe(19);
    expect(clampMinAgeRecommended('abc')).toBe(0);
    expect(clampMinAgeRecommended(5.7)).toBe(5);
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
