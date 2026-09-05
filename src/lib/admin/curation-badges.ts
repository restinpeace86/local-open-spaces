import { createElement, Fragment, type ReactNode } from 'react';

// [관리자용 블로그 큐레이션 모달](2026-09-05 사용자 지시, Decision 021) — 사용자가
// 제시한 뱃지 목록/하이라이트 키워드를 그대로 상수화한다. 사용자 요구사항 원문은
// "다중 선택 11개"라고 썼지만 실제로 나열한 항목을 세어 보면 12개다(이동/편의 4 +
// 식사/아기 5 + 공간/놀이 2 + 운영 1 = 12) — 어느 항목을 뺄지 추측하지 않고(제3장
// 제5조) 사용자가 실제로 나열한 12개를 그대로 구현한다.
export type CurationBadgeGroup = '이동/편의' | '식사/아기' | '공간/놀이' | '운영';

export type CurationBadgeOption = {
  key: string;
  label: string;
  group: CurationBadgeGroup;
};

export const CURATION_BADGE_OPTIONS: CurationBadgeOption[] = [
  { key: 'parking', label: '주차 완비', group: '이동/편의' },
  { key: 'stroller', label: '유모차 가능', group: '이동/편의' },
  { key: 'nursing_room', label: '수유실 있음', group: '이동/편의' },
  { key: 'diaper_table', label: '기저귀 갈이대', group: '이동/편의' },
  { key: 'kids_chair', label: '아기의자', group: '식사/아기' },
  { key: 'kids_tableware', label: '유아 식기', group: '식사/아기' },
  { key: 'kids_menu', label: '키즈 메뉴', group: '식사/아기' },
  { key: 'floor_seating', label: '좌식/온돌 있음', group: '식사/아기' },
  { key: 'private_room', label: '룸/개별 공간 있음', group: '식사/아기' },
  { key: 'kids_zone', label: '키즈존/놀이방', group: '공간/놀이' },
  { key: 'outdoor_yard', label: '야외 마당/테라스', group: '공간/놀이' },
  { key: 'reservation_required', label: '예약 필수', group: '운영' },
];

export function isKnownCurationBadgeKey(key: string): boolean {
  return CURATION_BADGE_OPTIONS.some((opt) => opt.key === key);
}

// [핵심 기능: 자동 형광펜 하이라이팅](사용자 지시 원문) — 뱃지 관련 키워드를 그대로
// 옮긴 목록. 정규식 기반으로 본문 텍스트에서 이 키워드들을 찾아 <mark>로 표시한다.
// 사용자가 제시한 그룹/키워드 원문 그대로(순서·표현 변경 없음).
const HIGHLIGHT_KEYWORDS: string[] = [
  // 주차
  '주차', '주차장', '파킹',
  // 유모차
  '유모차', '유모차반입',
  // 기저귀/갈이대
  '기저귀', '갈이대', '기저귀존',
  // 수유실
  '수유실', '모유수유',
  // 아기의자/식기
  '아기의자', '하이체어', '유아식기', '식판',
  // 메뉴
  '키즈메뉴', '돈가스', '주먹밥',
  // 좌식/룸
  '좌식', '온돌', '룸', '개별룸', '단독룸',
  // 키즈존
  '키즈존', '놀이방', '장난감', '정글짐',
  // 야외
  '마당', '잔디밭', '테라스', '야외',
  // 예약
  '예약', '사전예약', '캐치테이블', '네이버예약',
];

// 정규식 특수문자가 섞인 키워드는 없지만(전부 한글), 방어적으로 이스케이프한다.
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 길이가 긴 키워드부터 매칭해야 "유모차반입"이 "유모차"에 가려 앞부분만 하이라이트되는
// 것을 방지한다(예: "유모차반입" 전체가 아니라 "유모차"만 마킹되는 사고 방지).
const HIGHLIGHT_REGEX = new RegExp(
  `(${[...HIGHLIGHT_KEYWORDS].sort((a, b) => b.length - a.length).map(escapeRegExp).join('|')})`,
  'g'
);

// 순수 텍스트 배열로 쪼갠 뒤, 매칭된 조각만 <mark>로 감싼 React 노드 배열을 만든다.
// 블로그 본문은 외부(크롤링) 출처라 dangerouslySetInnerHTML로 렌더링하면 XSS 위험이
// 있다 — React가 문자열 자식을 자동으로 이스케이프하는 이 방식이 안전하다.
export function highlightKeywords(text: string): ReactNode {
  if (!text) return text;
  const parts = text.split(HIGHLIGHT_REGEX);
  return createElement(
    Fragment,
    null,
    ...parts.map((part, i) =>
      HIGHLIGHT_KEYWORDS.includes(part)
        ? createElement('mark', { key: i, style: { backgroundColor: '#fef08a' } }, part)
        : part
    )
  );
}

export { HIGHLIGHT_KEYWORDS };
