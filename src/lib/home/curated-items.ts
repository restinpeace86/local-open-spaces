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
