import { describe, expect, it } from 'vitest';
import {
  buildCategoryMinGroups,
  buildOpenSpacesCategoryMinGroups,
  buildEventsCategoryMinGroups,
  type CategoryMinGroup,
} from './category-min-groups';

describe('buildCategoryMinGroups', () => {
  const staticGroups: CategoryMinGroup[] = [
    { major: 'A', minors: ['a1', 'a2'] },
    { major: 'B', minors: ['b1'] },
    { major: '기타', minors: ['기타'] },
  ];

  it('실제 존재하는 옵션만 각 그룹에 남긴다(존재하지 않는 정적 정의는 제외)', () => {
    const result = buildCategoryMinGroups(['a1', 'b1', '기타'], staticGroups);
    expect(result).toEqual([
      { major: 'A', minors: ['a1'] },
      { major: 'B', minors: ['b1'] },
      { major: '기타', minors: ['기타'] },
    ]);
  });

  it('정적 그룹 정의에 없는 값은 기타로 합쳐 누락되지 않는다', () => {
    const result = buildCategoryMinGroups(['a1', '신규카테고리'], staticGroups);
    const etc = result.find((g) => g.major === '기타');
    expect(etc?.minors).toContain('신규카테고리');
  });

  it('빈 그룹(살아있는 옵션이 하나도 없는 그룹)은 결과에서 제외한다', () => {
    const result = buildCategoryMinGroups(['a1'], staticGroups);
    expect(result.find((g) => g.major === 'B')).toBeUndefined();
  });

  it('모든 실제 옵션이 어딘가에는 반드시 배정된다(추가 검증)', () => {
    const liveOptions = ['a1', 'a2', 'b1', '기타', '완전히새로운값'];
    const result = buildCategoryMinGroups(liveOptions, staticGroups);
    const allAssigned = result.flatMap((g) => g.minors);
    for (const opt of liveOptions) {
      expect(allAssigned).toContain(opt);
    }
  });
});

describe('buildOpenSpacesCategoryMinGroups', () => {
  it('open_spaces의 실제 category_min 50종을 전부 어떤 그룹에는 배정한다(누락 없음)', () => {
    const liveOptions = [
      '강당', '강의실', '골프장', '공연장', '공원', '과학관', '관광명소', '광장', '교육시설', '기타',
      '녹화장소', '농구장', '다목적경기장', '다목적실', '도서관', '문화원', '문화의집', '미술관',
      '민원 등 기타', '바닥분수/물놀이시설', '배구장', '배드민턴장', '생태공원', '수목원', '수영장',
      '시민교육센터', '야구장', '어린이놀이시설(실내)', '어린이놀이시설(야외)', '어린이놀이터',
      '역사박물관', '역사유적지', '운동장', '자연휴양림', '전시실', '족구장', '종합/기타박물관',
      '주민공유공간', '청년공간', '체육관', '체험학습장', '축구장', '캠핑장', '키즈카페', '탁구장',
      '테니스장', '풋살장', '피클볼장', '회의실',
      '알수없는깨진값', // 인코딩 손상 등 예상 밖 값도 절대 누락되지 않아야 한다
    ];
    const result = buildOpenSpacesCategoryMinGroups(liveOptions);
    const allAssigned = result.flatMap((g) => g.minors);
    for (const opt of liveOptions) {
      expect(allAssigned).toContain(opt);
    }
    // 예상 밖 값은 '기타' 그룹으로 안전하게 들어간다
    const etc = result.find((g) => g.major === '기타');
    expect(etc?.minors).toContain('알수없는깨진값');
  });

  // [농어촌체험휴양마을 + 농촌교육농장 통합 수집](2026-08-29 사용자 지시)
  it('체험휴양마을/교육농장은 "농장/체험" 그룹에 배정된다', () => {
    const result = buildOpenSpacesCategoryMinGroups(['체험휴양마을', '교육농장']);
    const group = result.find((g) => g.major === '농장/체험');
    expect(group?.minors).toEqual(expect.arrayContaining(['체험휴양마을', '교육농장']));
  });
});

describe('buildEventsCategoryMinGroups', () => {
  it('events의 실제 category_min 값을 전부 어떤 그룹에는 배정한다(누락 없음)', () => {
    const liveOptions = [
      '강당', '강의실', '골프장', '공공키즈카페', '공연장', '공예/취미', '공원탐방', '광장', '교양/어학',
      '교육시설', '교육체험', '기타', '녹화장소', '농구장', '농장체험', '다목적경기장', '다목적실',
      '단체봉사', '도시농업', '문화행사', '미술제작', '민원 등 기타', '배구장', '배드민턴장', '보건소',
      '산림여가', '서북병원', '스포츠', '야구장', '어린이병원', '어린이실내놀이터', '역사', '운동장',
      '자연/과학', '장애인버스', '전문/자격증', '전시/관람', '전시실', '정보통신', '족구장', '주민공유공간',
      '지역축제/페스티벌', '청년공간', '청년정보', '체육관', '축구장', '캠핑장', '탁구장', '테니스장',
      '풋살장', '피클볼장', '회의실',
    ];
    const result = buildEventsCategoryMinGroups(liveOptions);
    const allAssigned = result.flatMap((g) => g.minors);
    for (const opt of liveOptions) {
      expect(allAssigned).toContain(opt);
    }
  });
});
