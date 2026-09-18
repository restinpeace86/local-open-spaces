// [관리자 페이지 스팟 큐레이션 URL 크롤링 기능](2026-09-18 사용자 지시): "네이버 플레이스
// 주소를 입력하면 영업시간/메뉴/기본정보/뱃지/대표이미지를 자동으로 가져와 채워준다" —
// pcmap.place.naver.com은 Next.js + Apollo Client 기반 서버 렌더링 페이지라, 실제 데이터가
// `window.__APOLLO_STATE__`에 완전한 JSON으로 정적 HTML 안에 그대로 박혀 있다(실측 확인,
// 2026-09-18 — 헤드리스 브라우저 없이 fetch만으로 파싱 가능. seoul-yeyak-adapter의 가격
// 크롤링이 "동적 로딩이라 헤드리스 브라우저 없이는 불가능해 미구현"했던 것과는 다른 케이스).
// 이 파일은 순수 파싱/포맷 함수만 담아(네트워크 호출은 API 라우트가 담당) 단위 테스트가
// 쉽도록 한다(llm-blog-verification.ts와 동일한 관례).

export type NaverPlaceBusinessHourDay = {
  day: string;
  start: string | null;
  end: string | null;
  breakStart: string | null;
  breakEnd: string | null;
  description: string | null;
};

export type NaverPlaceMenuItem = {
  name: string;
  price: number | null;
  priceDisplayText: string | null;
  thumbnailUrl: string | null;
};

export type NaverPlaceCrawlResult = {
  placeId: string;
  name: string | null;
  roadAddress: string | null;
  address: string | null;
  phone: string | null;
  category: string | null;
  conveniences: string[];
  businessHourDays: NaverPlaceBusinessHourDay[];
  businessHoursFreeText: string | null;
  representativeImageUrl: string | null;
  menuItems: NaverPlaceMenuItem[];
};

// [URL 형식 다양성](실측 확인): "https://map.naver.com/p/entry/place/36200306?..." 외에도
// "https://map.naver.com/p/search/.../place/36200306", "https://pcmap.place.naver.com/
// restaurant/36200306/home"처럼 place ID 앞뒤 경로가 제각각이다 — "/place/숫자" 또는
// "/restaurant|entertainment|accommodation 등/숫자" 공통 패턴(경로 세그먼트로서의 순수
// 숫자 ID)만으로 넓게 매칭한다. 못 찾으면 null(추측으로 다른 값을 쓰지 않음).
export function extractNaverPlaceId(url: string): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  const patterns = [/\/place\/(\d+)/, /\/restaurant\/(\d+)/, /\/(?:hairshop|entertainment|accommodation)\/(\d+)/];
  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match) return match[1];
  }
  return null;
}

export function buildNaverPlaceUrls(placeId: string): { homeUrl: string; menuUrl: string } {
  return {
    homeUrl: `https://pcmap.place.naver.com/restaurant/${placeId}/home`,
    menuUrl: `https://pcmap.place.naver.com/restaurant/${placeId}/menu/list`,
  };
}

// Apollo Client 정규화 캐시 — 값이 { __ref: "TypeName:id" } 형태면 실제 객체로 치환해야
// 한다(GraphQL 정규화 캐시의 표준 동작). 재귀적으로 전체 트리를 순회해 어떤 필드에 ref가
// 나오든 일반적으로 해결한다(특정 필드만 하드코딩하지 않음 — 스키마가 넓고 계속 바뀔 수
// 있는 서드파티 데이터라 범용 처리가 안전하다).
export function denormalizeApolloValue(state: Record<string, unknown>, value: unknown, seen = new Set<string>()): unknown {
  if (Array.isArray(value)) return value.map((v) => denormalizeApolloValue(state, v, seen));
  if (value && typeof value === 'object') {
    const ref = (value as { __ref?: string }).__ref;
    if (typeof ref === 'string') {
      if (seen.has(ref)) return null; // 순환 참조 방어
      const target = state[ref];
      if (target === undefined) return null;
      return denormalizeApolloValue(state, target, new Set(seen).add(ref));
    }
    const result: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      result[key] = denormalizeApolloValue(state, v, seen);
    }
    return result;
  }
  return value;
}

// HTML 안의 `window.__APOLLO_STATE__ = {...};` 대입문에서 JSON 객체 리터럴만 뽑아 파싱한다.
// 페이지 구조가 바뀌어 못 찾으면 null을 반환하고(추측 금지), 호출부가 "크롤링 실패"로
// 정직하게 안내한다.
export function parseApolloState(html: string): Record<string, unknown> | null {
  const match = html.match(/window\.__APOLLO_STATE__\s*=\s*(\{[\s\S]*?\});\s*(?:window\.|<\/script>)/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function findRootPlaceDetail(state: Record<string, unknown>, placeId: string): Record<string, unknown> | null {
  const rootQuery = state.ROOT_QUERY as Record<string, unknown> | undefined;
  if (!rootQuery) return null;
  const key = Object.keys(rootQuery).find((k) => k.startsWith('placeDetail(') && k.includes(`"id":"${placeId}"`));
  if (!key) return null;
  return denormalizeApolloValue(state, rootQuery[key]) as Record<string, unknown>;
}

// [영업시간 실측 스키마](2026-09-18, 실제 네이버 플레이스 페이지 직접 확인): placeDetail.
// newBusinessHours[0].businessHours[]가 요일별 { day, businessHours: {start,end},
// breakHours: [{start,end}], description(휴무 사유 등) } 구조다. 값이 없거나 스키마가
// 바뀌어 못 읽으면 빈 배열을 반환한다(추측으로 시간을 지어내지 않음).
function extractBusinessHourDays(placeDetail: Record<string, unknown>): NaverPlaceBusinessHourDay[] {
  const newBusinessHours = placeDetail.newBusinessHours as Array<Record<string, unknown>> | null | undefined;
  const firstSchedule = newBusinessHours?.[0];
  const days = firstSchedule?.businessHours as Array<Record<string, unknown>> | null | undefined;
  if (!Array.isArray(days)) return [];

  return days.map((d) => {
    const hours = d.businessHours as { start?: string; end?: string } | null;
    const breaks = d.breakHours as Array<{ start?: string; end?: string }> | null;
    return {
      day: String(d.day ?? ''),
      start: hours?.start ?? null,
      end: hours?.end ?? null,
      breakStart: breaks?.[0]?.start ?? null,
      breakEnd: breaks?.[0]?.end ?? null,
      description: (d.description as string | null) ?? null,
    };
  });
}

// [기존 스마트 파서 형식에 맞춘 텍스트 생성](2026-09-18): spot-curation-parsers.ts의
// parseOperatingHoursText는 "메인 시간대(첫 번째 시간 범위)"와 "브레이크타임"/"라스트오더"
// 키워드가 붙은 시간을 찾는다 — 요일별로 시간이 같은 그룹을 묶어 그 형식에 맞는 텍스트를
// 만든다(완전히 같은 시간이면 자동 파싱이 정확히 맞아떨어지고, 요일마다 다르면 첫 그룹만
// 자동 반영되고 나머지는 관리자가 직접 읽고 보정 — 기존 정책과 동일하게 추측하지 않음).
export function formatBusinessHoursText(days: NaverPlaceBusinessHourDay[]): string | null {
  if (days.length === 0) return null;

  const openDays = days.filter((d) => d.start && d.end);
  const closedDays = days.filter((d) => !d.start || !d.end);
  const lines: string[] = [];

  if (openDays.length > 0) {
    // 같은 (start,end,breakStart,breakEnd) 조합끼리 묶는다.
    const groups = new Map<string, { day: NaverPlaceBusinessHourDay[]; key: NaverPlaceBusinessHourDay }>();
    for (const d of openDays) {
      const key = `${d.start}|${d.end}|${d.breakStart ?? ''}|${d.breakEnd ?? ''}`;
      const group = groups.get(key);
      if (group) group.day.push(d);
      else groups.set(key, { day: [d], key: d });
    }
    // 가장 많은 요일이 속한 그룹을 "메인 시간대"로 맨 앞에 둔다 — parseOperatingHoursText가
    // 텍스트에서 처음 발견하는 시간 범위를 메인으로 채택하기 때문.
    const sortedGroups = [...groups.values()].sort((a, b) => b.day.length - a.day.length);
    for (const group of sortedGroups) {
      const dayLabel = group.day.map((d) => d.day).join(', ');
      lines.push(`${dayLabel} ${group.key.start} - ${group.key.end}`);
      if (group.key.breakStart && group.key.breakEnd) {
        lines.push(`브레이크타임 ${group.key.breakStart} - ${group.key.breakEnd}`);
      }
    }
  }

  for (const d of closedDays) {
    lines.push(`${d.day} ${d.description ?? '휴무'}`);
  }

  return lines.join('\n');
}

// [메뉴 텍스트 생성](2026-09-18): spot-curation-parsers.ts의 parseMenuText가 이해하는
// "이름 가격원" 한 줄 형식으로 그대로 변환한다 — 새 파서를 만들지 않고 기존 것을 재사용
// (제5장 제4조). 가격이 구조화돼 있지 않은 메뉴(price가 null, 예: "시가"/"품절")는
// 파서가 어차피 가격 없는 줄을 버리므로 이름만 있는 줄로 남겨 자동 파싱 결과에서는
// 빠지되(추측 금지), 관리자가 원문을 보고 직접 채울 수 있게 원문 자체는 보존한다.
export function formatMenuText(items: NaverPlaceMenuItem[]): string {
  return items
    .map((item) => (item.price != null ? `${item.name} ${item.price.toLocaleString('ko-KR')}원` : item.name))
    .join('\n');
}

function extractMenuItems(state: Record<string, unknown>): NaverPlaceMenuItem[] {
  const items: NaverPlaceMenuItem[] = [];
  for (const [key, value] of Object.entries(state)) {
    if (!key.startsWith('PlaceMenuItem:')) continue;
    const item = denormalizeApolloValue(state, value) as Record<string, unknown>;
    const price = item.price as { displayText?: string } | null;
    const priceText = price?.displayText ?? null;
    // "8,900원"에서 숫자만 뽑는다 — "시가"/"변동" 등 숫자가 없는 표기는 null로 남긴다
    // (추측으로 가격을 만들어내지 않음).
    const numeric = priceText ? Number(priceText.replace(/[^0-9]/g, '')) : NaN;
    items.push({
      name: String(item.name ?? ''),
      price: Number.isFinite(numeric) && numeric > 0 ? numeric : null,
      priceDisplayText: priceText,
      thumbnailUrl: (item.thumbnailUrl as string | null) ?? null,
    });
  }
  return items.filter((item) => item.name);
}

// [실측 확인 — 네이버 자체 메뉴 미등록 업체](2026-09-19, 사용자가 실제로 URL을 넣어보고
// "메뉴가 안돼"라고 지적해 라이브 페이지를 다시 받아 확인): 업체가 네이버에 직접 메뉴를
// 등록하지 않고 배달의민족 메뉴만 연동한 경우(실측 사례: "딸부자 닭갈비 닭도리탕",
// placeId 1107293125) `PlaceMenuItem:*` 엔티티가 아예 0개이고, 대신
// `placeDetail.baemin.menuGroups[].menus[]`(엔티티 키 `PlaceDetail_BaeminMenu:*`)에
// 배달 메뉴 데이터(name/price/images)가 들어있다 — 이 경로를 놓치면 메뉴가 통째로
// 비어버린다. Apollo 정규화 캐시는 같은 id의 엔티티를 한 번만 저장하므로(여러 메뉴
// 그룹이 같은 항목을 중복 참조해도) 접두어로 평탄 스캔해도 자연히 중복 없이 모인다
// (기존 PlaceMenuItem 스캔과 동일한 방식).
function extractBaeminMenuItems(state: Record<string, unknown>): NaverPlaceMenuItem[] {
  const items: NaverPlaceMenuItem[] = [];
  for (const [key, value] of Object.entries(state)) {
    if (!key.startsWith('PlaceDetail_BaeminMenu:')) continue;
    const item = denormalizeApolloValue(state, value) as Record<string, unknown>;
    const numeric = item.price != null ? Number(item.price) : NaN;
    const hasPrice = Number.isFinite(numeric) && numeric > 0;
    const images = item.images as string[] | null;
    items.push({
      name: String(item.name ?? ''),
      price: hasPrice ? numeric : null,
      priceDisplayText: hasPrice ? `${numeric.toLocaleString('ko-KR')}원` : null,
      thumbnailUrl: Array.isArray(images) && images[0] ? images[0] : null,
    });
  }
  return items.filter((item) => item.name);
}

// [실측 스키마 정정](2026-09-18): placeDetail.topPhotos는 배열이 아니라
// `{ total, items: [...] }` 형태다(실제 라이브 페이지로 직접 확인 — 처음엔 items 없이
// 바로 배열이라고 잘못 가정해 대표 이미지가 항상 null로 나오는 버그가 있었다).
function extractRepresentativeImageUrl(placeDetail: Record<string, unknown>): string | null {
  const topPhotos = placeDetail.topPhotos as { items?: Array<Record<string, unknown>> } | null | undefined;
  const items = topPhotos?.items;
  if (Array.isArray(items)) {
    // mediaSource: "business"(업체 직접 등록 사진)를 최우선으로 삼는다 — 방문자가 찍은
    // 사진(mediaSource: "visitor")보다 업체 대표 이미지로서의 신뢰도가 높다.
    const business = items.find((p) => p.mediaSource === 'business' && p.originalUrl);
    if (business) return business.originalUrl as string;
    const anyPhoto = items.find((p) => p.originalUrl);
    if (anyPhoto) return anyPhoto.originalUrl as string;
  }
  return null;
}

// homeHtml/menuHtml 둘 다 파싱을 시도해 결과를 합친다(둘 중 하나가 페이지 구조 변경 등의
// 이유로 실패해도 나머지 하나로부터는 얻을 수 있는 만큼 얻는다 — 무중단 원칙과 동일한
// 정신, 이 프로젝트의 다른 어댑터들이 항목 단위로 실패를 허용하는 것과 같은 이유).
export function extractNaverPlaceCrawlResult(
  placeId: string,
  homeHtml: string | null,
  menuHtml: string | null
): NaverPlaceCrawlResult {
  const homeState = homeHtml ? parseApolloState(homeHtml) : null;
  const menuState = menuHtml ? parseApolloState(menuHtml) : null;

  const placeDetail = homeState ? findRootPlaceDetail(homeState, placeId) : null;
  const base = (homeState?.[`PlaceDetailBase:${placeId}`] ?? null) as Record<string, unknown> | null;

  const businessHourDays = placeDetail ? extractBusinessHourDays(placeDetail) : [];

  // 메뉴는 home/menu 두 페이지 중 어느 쪽이든 있는 대로 모아 이름 기준 중복 제거한다
  // (실측 확인: 두 페이지가 같은 PlaceMenuItem 데이터를 담고 있어 보통 완전히 겹치지만,
  // 드물게 한쪽만 로딩에 성공하는 경우를 대비한 방어적 병합).
  const nativeMenuItems = [...(homeState ? extractMenuItems(homeState) : []), ...(menuState ? extractMenuItems(menuState) : [])];
  // [배달의민족 메뉴 폴백](2026-09-19 실측): 네이버에 자체 메뉴(PlaceMenuItem)를 등록하지
  // 않은 업체는 배달 메뉴(PlaceDetail_BaeminMenu)만 있다 — 배달가와 매장가가 다를 수 있어
  // 자체 메뉴가 하나라도 있으면 그쪽을 우선하고(추측으로 두 출처를 섞지 않음), 자체 메뉴가
  // 아예 없을 때만 배달 메뉴로 대체한다.
  const menuItemsRaw =
    nativeMenuItems.length > 0
      ? nativeMenuItems
      : [...(homeState ? extractBaeminMenuItems(homeState) : []), ...(menuState ? extractBaeminMenuItems(menuState) : [])];
  const menuItemsByName = new Map(menuItemsRaw.map((item) => [item.name, item]));

  return {
    placeId,
    name: (base?.name as string | null) ?? null,
    roadAddress: (base?.roadAddress as string | null) ?? null,
    address: (base?.address as string | null) ?? null,
    phone: (base?.phone as string | null) ?? null,
    category: (base?.category as string | null) ?? null,
    conveniences: (base?.conveniences as string[] | null) ?? [],
    businessHourDays,
    businessHoursFreeText: formatBusinessHoursText(businessHourDays),
    representativeImageUrl: placeDetail ? extractRepresentativeImageUrl(placeDetail) : null,
    menuItems: [...menuItemsByName.values()],
  };
}
