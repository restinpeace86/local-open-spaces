import { CuratedItem } from '@/components/home/best-pick-slider';

// [제휴 상품 성격 이원화(기간한정 특가 vs 상시 티켓)](2026-09-17 사용자 지시,
// implementation/todo.md [개선사항 1]): "이번 주말 실패 없는 베스트 나들이 픽"에
// 마이리얼트립 제휴 상품이 다 몰려 노출되던 기존 방식을 상품 성격에 따라 이원화한다.
// operation_end_date가 있으면(관리자가 명시한 기간 마감이 있는 시한적 특가) "기간한정
// 특가", 없으면(상시 노출로 설정된 상품, 예: 키즈카페 이용권) "상시 티켓"으로 나눈다 —
// 두 컬럼 다 이미 존재하고(제휴 상품 ↔ 스팟 연동 이전부터 있던 필드), 새 플래그를
// 추가하지 않아도 이 기준 하나로 완전히 분류된다.
export function splitCuratedItemsByPeriod(items: CuratedItem[]): {
  limitedDeals: CuratedItem[];
  evergreenTickets: CuratedItem[];
} {
  const limitedDeals = items.filter((item) => Boolean(item.operation_end_date));
  const evergreenTickets = items.filter((item) => !item.operation_end_date);
  return { limitedDeals, evergreenTickets };
}

// [상시 추천 픽 테마별 분류](2026-09-20 사용자 지시): "언제가도 좋은 상시 테마별
// 추천픽으로 해주고 5개로 나눠 분류하고.. 클릭하면 거기에 맞는 제휴 상품들 나오는
// 구조로 해줘" — 기간한정 특가(위 limitedDeals)는 마감 임박이 중요해 그대로 flat
// list를 유지하고, 이 테마 분류는 상시 티켓(evergreenTickets)에만 적용한다. 실제
// 등록된 40건의 제휴상품을 실측으로 분류해 정한 5개 — 상품/매장 용어("~점",
// "이용권", "특가") 없이 "지금 뭘 하고 싶은지"로 포장한다(사용자 확정 문구 그대로).
export type CuratedItemThemeKey =
  | 'KIDS_CAFE'
  | 'THEME_PARK'
  | 'ANIMAL_AQUARIUM'
  | 'NATURE_EXPERIENCE'
  | 'SPECIAL_EXPERIENCE';

export const CURATED_ITEM_THEME_OPTIONS: { key: CuratedItemThemeKey; label: string; emoji: string }[] = [
  { key: 'KIDS_CAFE', label: '아이들이 오늘 하루 신나게 뛰어놀 수 있는 곳', emoji: '🏠' },
  { key: 'THEME_PARK', label: '온 가족이 하루 종일 알차게 즐길 수 있는 곳', emoji: '🎢' },
  { key: 'ANIMAL_AQUARIUM', label: '동물들과 가까이서 교감할 수 있는 곳', emoji: '🐘' },
  { key: 'NATURE_EXPERIENCE', label: '자연 속에서 몸으로 느끼고 배울 수 있는 곳', emoji: '🌲' },
  { key: 'SPECIAL_EXPERIENCE', label: '평소와 다른 특별한 경험을 만날 수 있는 곳', emoji: '✨' },
];

export function isCuratedItemThemeKey(value: string): value is CuratedItemThemeKey {
  return CURATED_ITEM_THEME_OPTIONS.some((opt) => opt.key === value);
}

// 테마 태그가 하나도 없는(관리자가 아직 안 골랐거나, 이 5개 어디에도 안 맞는) 상품은
// 화면에서 조용히 사라지지 않도록 SPECIAL_EXPERIENCE(기타)로 안전하게 폴백한다 —
// buildCategoryMinGroups의 '기타' catch-all과 동일한 관례.
export function filterCuratedItemsByTheme(items: CuratedItem[], theme: CuratedItemThemeKey): CuratedItem[] {
  return items.filter((item) => {
    const themes = item.themes && item.themes.length > 0 ? item.themes : ['SPECIAL_EXPERIENCE'];
    return themes.includes(theme);
  });
}
