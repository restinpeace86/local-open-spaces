// [스팟픽 AI 맞춤 추천 챗봇 엔진](2026-09-01 사용자 지시) 4단계(검색 결과 도출 및 예외
// 처리): 8단계 인터뷰 답변을 근거로 `get_nearby_spaces_and_events` RPC가 이미 내려준
// 후보(NearbyItem[], 거리순)를 필터/점수화해 최대 10개를 뽑는다. 순수 함수로만 구성해
// DB 접근 없이 단위 테스트할 수 있게 한다 — 실제 Supabase 조회는 API 라우트가 맡는다.
import { NearbyItem } from '@/lib/spaces/get-nearby';

export type OutdoorPreference = 'OUTDOOR' | 'INDOOR' | 'EITHER';
// [챗봇 문제점 수정](2026-09-03 사용자 지시) 예산 옵션 재설계: "1만원 이하/2~3만원 이하"는
// open_spaces에 실제 이용료 숫자 데이터가 사실상 없어(전체 142,109건 중 요금 텍스트
// 필드가 존재하는 소스는 CULTURE_FACILITY 1,080건=0.76%뿐, 그마저도 파싱이 필요한
// 자유서식 텍스트) 항상 필터링에 실질적 영향이 없던 "가짜 정밀도"였다. 사용자와 함께
// 원천 데이터를 직접 조사해 확인한 뒤(구현 기록 참고), 거의 전체 데이터에 안정적으로
// 채워져 있는 `is_free`만으로 판단 가능한 무료/유료/상관없음 3단계로 되돌린다 — 실제로
// 걸러낼 수 없는 세분화 옵션을 화면에 보여주지 않는 것이 정직한 선택이다(제3장 제5조).
export type Budget = 'FREE' | 'PAID' | 'ANY';
export type KidsAgeGroup = '영유아' | '초등' | '전연령';
export type Vibe = 'ACTIVE' | 'EDUCATION' | 'NATURE' | 'CULTURE';

// [챗봇 문제점 수정](2026-09-02 사용자 지시) 5: "분위기를 여러 개 고를 수 있게 하거나
// 전체도 고를 수 있게 해달라" — 단일 값(vibe: Vibe)을 배열(vibes: Vibe[])로 바꾼다.
// 빈 배열은 "전체"(분위기로 필터링하지 않음)를 뜻한다 — 별도 'ALL' 상수를 만드는 대신
// "필터 조건 없음 = 전부 통과"라는 자연스러운 의미를 그대로 쓴다.
export type ChatAnswers = {
  transportRadiusMeters: number;
  outdoorPreference: OutdoorPreference;
  budget: Budget;
  kidsCount: number;
  kidsAgeGroup: KidsAgeGroup | null;
  vibes: Vibe[];
};

// 8단계(Purpose/Vibe)의 부모 친화적 말투 선택지 → 실제 category_min 매핑. CORE_SPOT_
// CATEGORIES(spot-category-groups.ts)의 나들이 전용 핵심 중분류 전체를 키즈친화 식당(별도
// Meal 단계가 담당)을 제외하고 정확히 4개 성향으로 분류한다 — 임의로 지어낸 값이 아니라
// 기존 필터 칩 taxonomy를 그대로 재사용한 것이다(제5장 제4조 기존 구조 우선).
export const VIBE_CATEGORY_MINS: Record<Vibe, string[]> = {
  ACTIVE: ['어린이놀이터', '어린이놀이시설(야외)', '어린이놀이시설(실내)', '키즈카페'],
  EDUCATION: ['종합/기타박물관', '역사박물관', '미술관', '도서관', '유아교육진흥원', '육아종합지원센터'],
  NATURE: ['공원', '자연휴양림'],
  CULTURE: ['문화의집', '문화원'],
};

// "공공시설/공공장소" 판정: 이 카탈로그(open_spaces)는 대부분 정부/지자체 공공데이터
// 출처지만, 키즈카페/키즈친화 식당(놀이방식당)만은 민간 사업자(카페·식당) 데이터다
// (gg-kidscafe-adapter.mjs 등에서 이미 확인된 사실 — 추측 아님). 그 둘을 제외한 나머지는
// 전부 공공시설로 취급한다.
const PRIVATE_BUSINESS_CATEGORY_MINS = new Set(['키즈카페', '놀이방식당']);
export function isPublicFacility(item: NearbyItem): boolean {
  return !!item.category_min && !PRIVATE_BUSINESS_CATEGORY_MINS.has(item.category_min);
}

// 요구사항 4 "이동 거리 → 한 단계 살짝 넓혀서 차선책 재조사"의 "한 단계"가 뭘 의미하는지
// 지정돼 있지 않아, 4단계(Transport & Distance) 선택지 자체의 단계(도보→차10분→30분→
// 1시간 이상)를 그대로 다음 단계로 쓰는 것이 가장 자연스럽다고 판단했다(구현 판단,
// 기록에 명시).
export const RADIUS_FALLBACK_TIERS = [1000, 5000, 15000, 40000];
export function nextRadiusTier(current: number): number | null {
  const idx = RADIUS_FALLBACK_TIERS.findIndex((tier) => tier === current);
  if (idx === -1 || idx === RADIUS_FALLBACK_TIERS.length - 1) return null;
  return RADIUS_FALLBACK_TIERS[idx + 1];
}

function matchesOutdoorPreference(item: NearbyItem, pref: OutdoorPreference): boolean {
  if (pref === 'EITHER') return true;
  const facilityType = item.facility_type;
  if (!facilityType) return true; // 정보 없으면 배제하지 않음(데이터 없다고 추천 기회를 뺏지 않음)
  if (pref === 'OUTDOOR') return facilityType === '야외' || facilityType === '복합';
  return facilityType === '실내' || facilityType === '복합';
}

// 예산: open_spaces에는 무료 여부(is_free)만 있고 실제 이용료 숫자 컬럼이 없다 —
// FREE/PAID는 is_free로 정확히 필터링 가능하고, ANY(상관없음)만 걸지 않는다.
function matchesBudget(item: NearbyItem, budget: Budget): boolean {
  if (budget === 'FREE') return item.is_free === true;
  if (budget === 'PAID') return item.is_free === false;
  return true;
}

function matchesVibe(item: NearbyItem, vibes: Vibe[]): boolean {
  if (vibes.length === 0) return true; // "전체" — 분위기로 걸러내지 않음
  return !!item.category_min && vibes.some((v) => VIBE_CATEGORY_MINS[v].includes(item.category_min as string));
}

function withinRadius(item: NearbyItem, radiusMeters: number): boolean {
  return item.distance_meters <= radiusMeters;
}

// [AI 챗봇 맞춤 추천 상세 구현(초개인화 고도화)](2026-09-02 사용자 지시) Step 3-②: "최근에
// 이미 다녀온 장소는 결과에서 제외" — 이 앱에 별도 "방문 이력" 테이블은 없지만, 맘스픽
// 후기/체크리스트(mom_pick_posts, Decision 019)는 본인이 실제로 그 스팟에 다녀왔다는
// 사실을 이미 담고 있는 기존 데이터다(신규 개념을 지어낸 게 아니라 기존 데이터의 자연스러운
// 재해석 — 제5장 제4조 기존 구조 우선). 완전 제외(후순위가 아니라 제외)한다 — "늘 새로운
// 경험 제공"이라는 요구 취지에 더 맞고, 결과가 부족해지면 기존 반경 완화 폴백이 이미
// 흡수한다.
export function applyStrictFilters(
  items: NearbyItem[],
  answers: ChatAnswers,
  radiusMeters: number,
  visitedSpotIds: ReadonlySet<string> = new Set()
): NearbyItem[] {
  return items.filter(
    (item) =>
      withinRadius(item, radiusMeters) &&
      matchesVibe(item, answers.vibes) &&
      matchesOutdoorPreference(item, answers.outdoorPreference) &&
      matchesBudget(item, answers.budget) &&
      !visitedSpotIds.has(item.id)
  );
}

const PROXIMITY_NORMALIZE_METERS = 5000;
// [Step 3-①] 찜한 장소가 현재 조건에 부합하면 결과 상단에 우선 배치 — 거리 만점(40점)보다도
// 확실히 앞서도록 큰 가중치를 준다(사용자가 이미 관심을 표시한 곳이므로).
const BOOKMARK_SCORE_BONUS = 50;

function scoreItem(item: NearbyItem, answers: ChatAnswers, bookmarkedSpotIds: ReadonlySet<string>): number {
  let score = 0;
  score += Math.max(0, 1 - item.distance_meters / PROXIMITY_NORMALIZE_METERS) * 40;
  if (answers.kidsCount > 0 && item.is_kids_friendly) score += 20;
  if (answers.kidsCount > 0 && item.stroller_accessible) score += 10;
  if (answers.kidsCount > 0 && item.has_parking) score += 10;
  if (answers.kidsAgeGroup && item.target_age_group === answers.kidsAgeGroup) score += 15;
  if (item.is_free) score += 5;
  if (bookmarkedSpotIds.has(item.id)) score += BOOKMARK_SCORE_BONUS;
  return score;
}

export type SearchResultItem =
  | { kind: 'SPOT'; item: NearbyItem; isBookmarked: boolean }
  | { kind: 'AFFILIATE'; item: { id: string; title: string; image_url: string | null; booking_url: string; category: string } };

export type SearchOutcome = {
  results: SearchResultItem[];
  usedFallback: boolean;
  exhausted: boolean; // true면 완화 1회까지 시도했지만 결과가 0건이었다는 뜻(요구사항 4 최종 안내 문구 대상)
};

const MAX_RESULTS = 10;

export type CuratedAffiliateItem = { id: string; title: string; image_url: string | null; booking_url: string; category: string };

// pool: 이미 반경/예산/성향/실내외 조건을 전부 통과한 후보(비어있지 않다고 가정 — 호출부가
// 0건 여부를 먼저 판단). 점수화 → 상위 N개 선정 → 필수 믹스 룰(①공공시설 최소 1개,
// ②제휴 상품 최소 1개) 적용까지 담당한다. DB 접근 없는 순수 함수라 API 라우트가
// "반경별 재조회" 사이사이에도 재사용할 수 있다.
export function assembleResults(
  pool: NearbyItem[],
  answers: ChatAnswers,
  curatedItem: CuratedAffiliateItem | null,
  bookmarkedSpotIds: ReadonlySet<string> = new Set()
): SearchResultItem[] {
  const scored = pool.map((item) => ({ item, score: scoreItem(item, answers, bookmarkedSpotIds) })).sort((a, b) => b.score - a.score);

  const spotSlots = curatedItem ? MAX_RESULTS - 1 : MAX_RESULTS;
  let top = scored.slice(0, spotSlots).map((s) => s.item);

  // 필수 믹스 룰 ①: 공공시설이 하나도 없으면, 최하위 항목을 최선의 공공시설 후보로 교체한다.
  if (top.length > 0 && !top.some(isPublicFacility)) {
    const bestPublic = scored.find((s) => isPublicFacility(s.item) && !top.includes(s.item));
    if (bestPublic) {
      top = [...top.slice(0, -1), bestPublic.item];
    }
  }

  const results: SearchResultItem[] = top.map((item) => ({ kind: 'SPOT' as const, item, isBookmarked: bookmarkedSpotIds.has(item.id) }));
  // 필수 믹스 룰 ②: 제휴 상품 1개 이상 — 실제 활성 상품이 있을 때만 자연스럽게 섞는다
  // (없는데 억지로 만들지 않음).
  if (curatedItem) {
    results.push({ kind: 'AFFILIATE', item: curatedItem });
  }

  return results;
}

// [단위 테스트/소규모 시나리오 전용] candidates 배열 하나에 폴백 반경까지의 후보가 이미
// 전부 담겨 있다고 가정하고 필터→완화→조립을 한 번에 수행한다. 실제 API 라우트
// (src/app/api/ai-chat/search/route.ts)는 이 함수를 쓰지 않는다 — 141,980행 규모에서
// "일단 가장 넓은 반경(1시간 이상=40km)으로 미리 넉넉히 조회"하면 PostgREST 8초
// statement_timeout에 실측으로 걸렸기 때문이다(같은 반경이라도 개발자 콘솔 관리자 연결은
// 통과하지만 anon 키 PostgREST 경로는 실제로 타임아웃 — 라이브 서버로 직접 확인). 라우트는
// 대신 "선택한 반경으로 먼저 조회 → 0건일 때만 다음 반경으로 재조회"하는 2단계 네트워크
// 왕복으로 이 문제를 피한다(applyStrictFilters/assembleResults를 직접 조합).
export function runSearch(candidates: NearbyItem[], answers: ChatAnswers, curatedItem: CuratedAffiliateItem | null): SearchOutcome {
  let pool = applyStrictFilters(candidates, answers, answers.transportRadiusMeters);
  let usedFallback = false;

  if (pool.length === 0) {
    const fallbackRadius = nextRadiusTier(answers.transportRadiusMeters);
    if (fallbackRadius != null) {
      pool = applyStrictFilters(candidates, answers, fallbackRadius);
      usedFallback = pool.length > 0;
    }
  }

  if (pool.length === 0) {
    return { results: [], usedFallback: false, exhausted: true };
  }

  return { results: assembleResults(pool, answers, curatedItem), usedFallback, exhausted: false };
}
