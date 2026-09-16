// [마이리얼트립 공식 파트너 API 연동](2026-09-16 사용자 지시): "MYREALTRIP_API_KEY
// 발급받음. 공식적인 API를 통하여 데이터 가져오는 방법 확인해보자" — 이후 사용자와
// 함께 실측으로 확인한 5개 엔드포인트(categories/search/detail/options/calendars) 중,
// 이번 1차 구현 범위는 "키즈 카테고리뿐만 아니라 가족끼리 갈만한 곳도 확인해봐야
// 하는데.. 데이터 나오는 걸 보고 축소하든 결정하든 해야 할 것 같아"에 맞춰 관리자가
// 도시/카테고리/키워드로 자유롭게 탐색만 해볼 수 있는 최소 범위(categories+search)로
// 잡는다 — detail/options/calendars(상세 설명·날짜별 예약가능여부)는 카테고리 범위
// 결정 이후 실제 등록/노출 기능을 만들 때 붙이면 된다(제3장 제3조 MVP 우선).
//
// [개선사항 1과의 관계] 이전에 스킵했던 "URL 붙여넣기 → 자동 크롤링"(마이리얼트립
// robots.txt가 상세 페이지 크롤링을 전 User-Agent에 금지)은 이 공식 API로 완전히
// 대체된다 — 크롤링이 아니라 승인된 파트너 API 호출이라 정책 충돌이 없다.
export type MyRealTripCategory = {
  name: string;
  value: string;
};

export type MyRealTripSearchItem = {
  gid: string;
  itemName: string;
  description: string;
  salePrice: number;
  priceDisplay: string;
  category: string;
  reviewScore: number;
  reviewCount: number;
  imageUrl: string;
  productUrl: string;
  deepLink: string;
  tags: string[];
};

export const MYREALTRIP_SORT_OPTIONS = ['price_asc', 'price_desc', 'review_score_desc', 'selling_count_desc'] as const;
export type MyRealTripSort = (typeof MYREALTRIP_SORT_OPTIONS)[number];

// [큐레이션 등록 폼 사전 채움](2026-09-16 사용자 지시 후속): 검색 결과 카드에서
// "＋ 큐레이션에 등록"을 누르면 curated-item-form-modal.tsx의 신규 등록 폼에
// 그대로 채워 넣을 값. 가격/카테고리/리뷰는 curated_items 스키마에 대응 컬럼이
// 없어(요구사항 범위 밖 — 제5장 제7조, 필요한 컬럼이 아직 정의되지 않음) 옮기지
// 않는다 — 이미 존재하는 3개 필드(제목/이미지/제휴링크)만 채운다.
export function mapSearchItemToCuratedItemPrefill(item: MyRealTripSearchItem): {
  title: string;
  image_url: string;
  booking_url: string;
} {
  return {
    title: item.itemName,
    image_url: item.imageUrl,
    booking_url: item.productUrl,
  };
}
