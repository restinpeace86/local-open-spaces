import { createElement, Fragment, type ReactNode } from 'react';

// [관리자용 블로그 큐레이션 모달](2026-09-05 사용자 지시, Decision 021) — 사용자가
// 제시한 뱃지 목록/하이라이트 키워드를 그대로 상수화한다. 사용자 요구사항 원문은
// "다중 선택 11개"라고 썼지만 실제로 나열한 항목을 세어 보면 12개다(이동/편의 4 +
// 식사/아기 5 + 공간/놀이 2 + 운영 1 = 12) — 어느 항목을 뺄지 추측하지 않고(제3장
// 제5조) 사용자가 실제로 나열한 12개를 그대로 구현했다.
//
// [뱃지 목록 정정](2026-09-06 사용자 지시): 그 12개 중 2가지를 사용자가 실사용
// 관점에서 다시 지적했다.
// 1. "룸/개별 공간 있음"(private_room) 하나로 묶여 있었는데, "룸과 개별공간만
//    있는건 아니고 공존하는거잖아" — 한 장소에 "룸"과 "개별 공간(룸이 아닌 칸막이
//    좌석 등)"이 서로 독립적으로 있을 수도, 둘 다 있을 수도 있어 하나의 뱃지로
//    묶으면 표현할 수 없다는 지적으로 room/private_space 두 개로 분리했었다.
//    [재정정] 곧바로 "룸하고 개별공간이 뭔 차이야? 그냥 2는 다시 합쳐줘"라는
//    피드백을 받아 원래의 단일 뱃지(private_room, "룸/개별 공간 있음")로 되돌린다
//    — 실제 구분 기준이 모호해 관리자가 고르기 더 어려워졌다는 판단.
// 2. "운영에 예약 필수만 있는데.. 룸같은데는 보통 예약해서 가긴 하는데.. 예약
//    가능이지 필수 아니잖아" — "예약 없이는 입장 자체가 안 됨(필수)"과 "예약하면
//    좋지만 워크인도 가능(가능)"은 실제로 다른 의미라 별도 뱃지로 추가한다
//    (기존 reservation_required는 그대로 두고 reservation_possible을 새로 추가 —
//    기존 데이터에 이미 골라둔 reservation_required 값은 그대로 유효하다). 이
//    항목은 재정정 없이 그대로 유지한다.
export type CurationBadgeGroup = '이동/편의' | '식사/아기' | '공간/놀이' | '운영';

// [All-in-One 모바일 큐레이션 워크벤치](2026-09-05 사용자 지시): 뱃지 그룹을
// 순서대로 나열해야 하는 곳(BlogCurationModal, CurationBadgeForm)이 두 곳이 돼
// 여기 한 곳에 상수화한다(제5장 제4조 기존 구조 우선 — 값 중복 방지).
export const CURATION_BADGE_GROUPS: CurationBadgeGroup[] = ['이동/편의', '식사/아기', '공간/놀이', '운영'];

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
  { key: 'reservation_possible', label: '예약 가능', group: '운영' },
];

export function isKnownCurationBadgeKey(key: string): boolean {
  return CURATION_BADGE_OPTIONS.some((opt) => opt.key === key);
}

// [핵심 기능: 자동 형광펜 하이라이팅](사용자 지시 원문) — 뱃지 관련 키워드를 그대로
// 옮긴 목록. 정규식 기반으로 본문 텍스트에서 이 키워드들을 찾아 <mark>로 표시한다.
// 사용자가 제시한 그룹/키워드 원문을 뱃지 키(CURATION_BADGE_OPTIONS.key)별로 묶었다
// (기존엔 평면 배열 하나였는데, [지능형 자가 치유 및 텍스트 정규화](2026-09-07
// implementation/todo.md 개선사항3) 4번 "키워드 하이라이팅에 따른 뱃지 자동 체크"를
// 구현하려면 "어느 키워드가 매칭됐을 때 어느 뱃지를 체크할지" 역참조가 필요하다).
// [유의어 확장](2026-09-07 개선사항3 2번): "아기의자 ↔ 유아용 의자, 유아 의자" 등
// todo.md가 예시로 든 유의어를 추가했다 — 원래 평면 목록에 없던 표현이 실제 블로그
// 본문에 흔하다는 사용자 예시를 그대로 반영.
const BADGE_KEYWORD_GROUPS: Record<string, string[]> = {
  parking: ['주차', '주차장', '파킹', '차댈곳', '발렛'],
  stroller: ['유모차', '유모차반입', '유모차동반'],
  nursing_room: ['수유실', '모유수유'],
  diaper_table: ['기저귀', '갈이대', '기저귀존'],
  kids_chair: ['아기의자', '하이체어', '유아용의자', '유아의자'],
  kids_tableware: ['유아식기', '식판', '아기식기'],
  kids_menu: ['키즈메뉴', '돈가스', '주먹밥', '어린이메뉴'],
  floor_seating: ['좌식', '온돌'],
  private_room: ['룸', '개별룸', '단독룸', '프라이빗룸'],
  kids_zone: ['키즈존', '놀이방', '장난감', '정글짐'],
  outdoor_yard: ['마당', '잔디밭', '테라스', '야외'],
  reservation_required: ['예약필수', '사전예약필수'],
  reservation_possible: ['예약', '사전예약', '캐치테이블', '네이버예약'],
};

// 평면 하이라이트 목록은 위 그룹에서 파생한다(값 중복 방지, 제5장 제4조).
const HIGHLIGHT_KEYWORDS: string[] = Object.values(BADGE_KEYWORD_GROUPS).flat();

// 정규식 특수문자가 섞인 키워드는 없지만(전부 한글), 방어적으로 이스케이프한다.
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// [공백 무시 매칭](2026-09-07 개선사항3 2번): "아기의자", "아기 의자", "아 기 의 자"를
// 모두 동일하게 매칭하기 위해 키워드의 각 글자 사이에 선택적 공백(\s*)을 끼워 넣는다.
function toWhitespaceInsensitivePattern(keyword: string): string {
  return [...keyword].map(escapeRegExp).join('\\s*');
}

// 정규식에서 캡처 그룹으로 감싼 부분만 split() 결과에 원본 매칭 텍스트로 남는다 —
// 이 매칭 텍스트를 어느 원래 키워드(공백 유무와 무관하게 정규화한 키)가 낳았는지
// 되짚어야 뱃지 자동 체크(4번)에 쓸 수 있다. 공백을 전부 제거한 값을 정규화 키로
// 쓴다(원래 키워드도 공백이 없으므로 서로 일치).
function normalizeForLookup(value: string): string {
  return value.replace(/\s+/g, '');
}

// 정규화된(공백 제거) 키워드 → 뱃지 키 역참조 맵. 여러 뱃지가 같은 키워드를 공유하는
// 경우는 없지만(각 그룹의 키워드가 서로 겹치지 않게 설계됨), 혹시 겹치더라도 Map은
// 마지막 등록을 유지해 최소한 하나의 뱃지는 체크되도록 안전하게 동작한다.
const KEYWORD_TO_BADGE_KEY = new Map<string, string>();
for (const [badgeKey, keywords] of Object.entries(BADGE_KEYWORD_GROUPS)) {
  for (const keyword of keywords) KEYWORD_TO_BADGE_KEY.set(normalizeForLookup(keyword), badgeKey);
}

// 길이가 긴 키워드부터 매칭해야 "유모차반입"이 "유모차"에 가려 앞부분만 하이라이트되는
// 것을 방지한다(예: "유모차반입" 전체가 아니라 "유모차"만 마킹되는 사고 방지). 정규식
// 대체(|)는 나열 순서대로 첫 매칭을 채택하므로, 원래(공백 없는) 키워드 길이 기준으로
// 정렬하면 공백 삽입 매칭에서도 동일한 우선순위가 유지된다.
function buildHighlightRegex(extraKeywords: string[] = []): RegExp {
  const all = [...HIGHLIGHT_KEYWORDS, ...extraKeywords];
  const sorted = [...all].sort((a, b) => b.length - a.length);
  return new RegExp(`(${sorted.map(toWhitespaceInsensitivePattern).join('|')})`, 'g');
}

const DEFAULT_HIGHLIGHT_REGEX = buildHighlightRegex();

// 순수 텍스트 배열로 쪼갠 뒤, 매칭된 조각만 <mark>로 감싼 React 노드 배열을 만든다.
// 블로그 본문은 외부(크롤링) 출처라 dangerouslySetInnerHTML로 렌더링하면 XSS 위험이
// 있다 — React가 문자열 자식을 자동으로 이스케이프하는 이 방식이 안전하다.
// [지역/지점명 동시 하이라이팅](2026-09-07 개선사항3 3번): "해당 스팟의 고유
// 지역/지점명 키워드도.. 노란색 배경으로 함께 하이라이팅" — extraKeywords로 뱃지
// 키워드가 아닌 임의 키워드(지역명 등)도 같은 방식(공백 무시 포함)으로 하이라이트할
// 수 있게 한다. 매번 정규식을 새로 만들지 않도록, extraKeywords가 없는(가장 흔한)
// 호출은 미리 만들어 둔 DEFAULT_HIGHLIGHT_REGEX를 재사용한다.
export function highlightKeywords(text: string, extraKeywords: string[] = []): ReactNode {
  if (!text) return text;
  const regex = extraKeywords.length > 0 ? buildHighlightRegex(extraKeywords) : DEFAULT_HIGHLIGHT_REGEX;
  const parts = text.split(regex);
  // split()은 홀수 인덱스에 캡처 그룹 매칭 결과를, 짝수 인덱스에 그 사이 일반 텍스트를
  // 담는다 — 매칭인지 여부를 정규식 재실행으로 다시 판정하지 않고 인덱스 패리티로
  // 안전하게 구분한다(빈 문자열 조각을 우연히 알려진 키워드로 오인하는 것도 방지).
  return createElement(
    Fragment,
    null,
    ...parts.map((part, i) =>
      i % 2 === 1
        ? createElement('mark', { key: i, style: { backgroundColor: '#fef08a' } }, part)
        : part
    )
  );
}

// [키워드 하이라이팅에 따른 뱃지 자동 체크](2026-09-07 개선사항3 4번): "블로그 본문 및
// 하이라이트 데이터를 기반으로 관련 뱃지가 1차로 자동 체크(Pre-check)되도록" — 본문
// 텍스트에서 실제로 매칭된 키워드들을 훑어 어느 뱃지가 걸리는지 Set으로 돌려준다.
// 관리자는 이 결과를 보고 문맥상 아니다 싶으면 클릭 한 번으로 체크 해제하면 된다
// (세미오토 검수 — 실제 체크박스 상태 반영은 호출부인 useSpotCurationForm이 담당).
export function matchBadgeKeysFromText(text: string): Set<string> {
  const matched = new Set<string>();
  if (!text) return matched;
  const hits = text.match(DEFAULT_HIGHLIGHT_REGEX) ?? [];
  for (const hit of hits) {
    const badgeKey = KEYWORD_TO_BADGE_KEY.get(normalizeForLookup(hit));
    if (badgeKey) matched.add(badgeKey);
  }
  return matched;
}

export { HIGHLIGHT_KEYWORDS };
