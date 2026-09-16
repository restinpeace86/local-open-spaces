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

// [상품 상세 확인 후 등록](2026-09-16 사용자 지시 후속): "상품리스트 보고..
// 상품 상세 들어가서 해당 상품에 대하여 제휴상품으로 등록하는 흐름으로" — 검색
// API(title/salePrice/imageUrl)만으로는 볼 수 없는 소개 문구/포함·불포함 사항을
// 등록 전에 확인할 수 있게 한다. title은 실측상 항상 빈 문자열이라(스키마 특성,
// 여러 상품으로 확인) 화면에 표시할 제목은 검색 결과의 itemName을 그대로 쓴다.
export type MyRealTripProductDetail = {
  gid: string;
  title: string;
  description: string;
  reviewScore: number | null;
  reviewCount: number | null;
  included: string[];
  excluded: string[];
  itineraries: Array<{ title: string; description: string }>;
};

// [큐레이션 등록 폼 사전 채움](2026-09-16 사용자 지시 후속): 검색 결과에서 등록
// 폼에 채워 넣을 값. bookingUrl은 호출부가 명시적으로 넘긴다 — [마이링크(제휴
// 추적 링크) 자동 생성](2026-09-16 후속 지시: "그냥 productUrl 넣으면 추적 안
// 됨") 이후로는 원본 productUrl이 아니라 /v1/mylink로 변환한 myrealt.rip
// 단축 링크를 넘겨야 클릭이 실제로 추적/정산된다 — 이 함수 자체는 어느 URL이
// 오든 상관없는 순수 매핑만 담당한다(마이링크 생성이라는 네트워크 호출은 API
// 라우트가 맡음). 가격/카테고리/리뷰는 curated_items 스키마에 대응 컬럼이 없어
// (요구사항 범위 밖 — 제5장 제7조) 옮기지 않는다.
// [스팟 매칭 검색의 OR 검색 문제 수정](2026-09-16 사용자 지적: "검색조건이 &가
// 아니고 OR야 오키드 키즈카페 할경우 이것만 나오는게 아니고 키즈카페 모두다
// 나오는거같아") — 실측 확인 결과 마이리얼트립 검색 API는 키워드를 토큰
// 단위로 OR 매칭한다("오키드 키즈카페" 검색 시 "[김포] 오키드 키즈카페"(정확한
// 매칭)와 무관한 다른 지역 "키즈카페" 상품 46건이 뒤섞여 나옴, 정확한 매칭은
// 결과 안에 존재는 함). 이건 일반 탐색(MyRealTripSearchPanel)과 달리 "이
// 스팟과 정확히 일치하는 상품 찾기"가 목적이라, 검색어의 모든 공백 구분
// 토큰을 상품명에 전부 포함하는 결과만 남기는 클라이언트 측 AND 필터를
// 적용한다(일반 탐색 패널에는 적용하지 않는다 — 그쪽은 도시명이 상품명에
// 문자 그대로 없어도 실제로 관련 있는 상품을 놓칠 위험이 있어 필터링을
// 보류했던 것과 같은 이유로, 여기서는 반대로 "정확한 상호명 일치"가 목적이라
// AND 필터가 오히려 정확도를 높인다). 전부 걸러져 0건이 되면(표현 차이로 토큰이
// 그대로 안 맞을 수 있음) 원본 목록을 그대로 반환해 관리자가 직접 훑어볼 수
// 있게 한다 — 아무것도 안 보여주는 것보다 낫다.
export function filterSearchItemsByAllKeywordTokens(items: MyRealTripSearchItem[], keyword: string): MyRealTripSearchItem[] {
  const tokens = keyword.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return items;
  const strictMatches = items.filter((item) => tokens.every((token) => item.itemName.includes(token)));
  return strictMatches.length > 0 ? strictMatches : items;
}

export function mapSearchItemToCuratedItemPrefill(
  item: MyRealTripSearchItem,
  bookingUrl: string
): {
  title: string;
  image_url: string;
  booking_url: string;
} {
  return {
    title: item.itemName,
    image_url: item.imageUrl,
    booking_url: bookingUrl,
  };
}
