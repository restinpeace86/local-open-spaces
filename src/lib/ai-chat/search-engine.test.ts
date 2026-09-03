import { describe, expect, it } from 'vitest';
import {
  applyStrictFilters,
  assembleResults,
  ChatAnswers,
  getEffectiveQueryRadiusMeters,
  isPublicFacility,
  nextRadiusTier,
  runSearch,
  VIBE_EVENT_CATEGORY_MINS,
} from './search-engine';
import { CATEGORY_MAJ_OPTIONS } from '@/lib/spaces/category-maj-meta';
import { NearbyItem } from '@/lib/spaces/get-nearby';

function spot(overrides: Partial<NearbyItem> = {}): NearbyItem {
  return {
    id: `id-${Math.random()}`,
    name: '테스트 공원',
    category: 'PARK',
    distance_meters: 500,
    item_type: 'SPACE',
    lng: 127,
    lat: 37,
    address: '서울특별시 강남구',
    thumbnail_url: null,
    start_date: null,
    end_date: null,
    reservation_start_date: null,
    reservation_end_date: null,
    reservation_url: null,
    is_reservation_required: null,
    operating_hours: null,
    is_free: true,
    info_url: null,
    is_kids_friendly: true,
    has_parking: true,
    stroller_accessible: true,
    facility_type: '야외',
    target_age_group: '전연령',
    booking_status: null,
    category_min: '공원',
    ...overrides,
  };
}

function answers(overrides: Partial<ChatAnswers> = {}): ChatAnswers {
  return {
    transportRadiusMeters: 5000,
    outdoorPreference: 'EITHER',
    budget: 'ANY',
    kidsCount: 1,
    kidsAgeGroup: '전연령',
    vibes: ['NATURE_CAMPING'],
    ...overrides,
  };
}

describe('isPublicFacility', () => {
  it('키즈카페/놀이방식당은 민간 사업자로 판정한다', () => {
    expect(isPublicFacility(spot({ category_min: '키즈카페' }))).toBe(false);
    expect(isPublicFacility(spot({ category_min: '놀이방식당' }))).toBe(false);
  });

  it('공원 등 나머지는 공공시설로 판정한다', () => {
    expect(isPublicFacility(spot({ category_min: '공원' }))).toBe(true);
    expect(isPublicFacility(spot({ category_min: '도서관' }))).toBe(true);
  });
});

describe('runSearch', () => {
  it('거리/무료/실외 조건을 만족하는 후보만 통과시켜 점수순으로 정렬한다', () => {
    const near = spot({ id: 'near', distance_meters: 300, category_min: '공원' });
    const far = spot({ id: 'far', distance_meters: 4000, category_min: '공원' });
    const outcome = runSearch([far, near], answers(), null);

    expect(outcome.exhausted).toBe(false);
    expect(outcome.results[0]).toEqual({ kind: 'SPOT', item: near, isBookmarked: false });
  });

  it('반경 밖 후보는 제외한다', () => {
    const outOfRange = spot({ distance_meters: 6000, category_min: '공원' });
    const outcome = runSearch([outOfRange], answers({ transportRadiusMeters: 1000 }), null);
    // 1000m 다음 폴백 티어(5000m)에서도 6000m는 여전히 범위 밖이라 exhausted여야 한다.
    expect(outcome.exhausted).toBe(true);
  });

  it('예산이 완전무료면 is_free=false 후보를 제외한다', () => {
    const paid = spot({ is_free: false, category_min: '공원' });
    const outcome = runSearch([paid], answers({ budget: 'FREE' }), null);
    expect(outcome.exhausted).toBe(true);
  });

  // [챗봇 문제점 수정](2026-09-03 사용자 지시) 예산 옵션을 무료/유료/상관없음
  // 3단계로 재설계 — 실제 이용료 숫자 데이터가 없어(원천 데이터 실측 확인) 세분화
  // 옵션(1만원 이하 등)을 없애고 is_free 하나로 판단 가능한 3단계만 남긴다.
  it('예산이 유료면 is_free=true 후보를 제외한다', () => {
    const free = spot({ is_free: true, category_min: '공원' });
    const outcome = runSearch([free], answers({ budget: 'PAID' }), null);
    expect(outcome.exhausted).toBe(true);
  });

  it('예산이 상관없으면 무료/유료 둘 다 통과한다', () => {
    const free = spot({ id: 'free', is_free: true, category_min: '공원' });
    const paid = spot({ id: 'paid', is_free: false, category_min: '공원' });
    const outcome = runSearch([free, paid], answers({ budget: 'ANY' }), null);
    expect(outcome.results).toHaveLength(2);
  });

  it('vibe와 category_min이 매칭되는 후보만 통과한다', () => {
    const wrongVibe = spot({ category_min: '박물관이 아닌 값' });
    const outcome = runSearch([wrongVibe], answers({ vibes: ['NATURE_CAMPING'] }), null);
    expect(outcome.exhausted).toBe(true);
  });

  it('실내 선호면 facility_type이 야외 단독인 후보를 제외한다', () => {
    const outdoorOnly = spot({ facility_type: '야외', category_min: '공원' });
    const outcome = runSearch([outdoorOnly], answers({ outdoorPreference: 'INDOOR', vibes: ['NATURE_CAMPING'] }), null);
    expect(outcome.exhausted).toBe(true);
  });

  it('엄격 조건 0건이면 반경을 한 단계만 완화해 재시도한다(1회 한정)', () => {
    const slightlyFar = spot({ distance_meters: 2000, category_min: '공원' }); // 1000m 밖, 5000m 안
    const outcome = runSearch([slightlyFar], answers({ transportRadiusMeters: 1000 }), null);
    expect(outcome.usedFallback).toBe(true);
    expect(outcome.exhausted).toBe(false);
    expect(outcome.results).toHaveLength(1);
  });

  it('완화 1회로도 0건이면 즉시 중단하고 exhausted를 반환한다(무한 완화 금지)', () => {
    const veryFar = spot({ distance_meters: 20000, category_min: '공원' }); // 1000m, 5000m 폴백 둘 다 밖
    const outcome = runSearch([veryFar], answers({ transportRadiusMeters: 1000 }), null);
    expect(outcome.exhausted).toBe(true);
    expect(outcome.usedFallback).toBe(false);
  });

  it('최대 10개까지만 반환한다', () => {
    const many = Array.from({ length: 15 }, (_, i) => spot({ id: `p${i}`, distance_meters: i * 10, category_min: '공원' }));
    const outcome = runSearch(many, answers(), null);
    expect(outcome.results).toHaveLength(10);
  });

  it('필수 믹스 룰: 제휴 상품이 있으면 결과 마지막에 섞어 넣는다(전체 10개 유지)', () => {
    const many = Array.from({ length: 15 }, (_, i) => spot({ id: `p${i}`, distance_meters: i * 10, category_min: '공원' }));
    const curated = { id: 'c1', title: '제휴 상품', image_url: null, booking_url: 'https://example.com', category: 'ticket' };
    const outcome = runSearch(many, answers(), curated);

    expect(outcome.results).toHaveLength(10);
    expect(outcome.results[9]).toEqual({ kind: 'AFFILIATE', item: curated });
    expect(outcome.results.slice(0, 9).every((r) => r.kind === 'SPOT')).toBe(true);
  });

  it('필수 믹스 룰: 공공시설이 하나도 없으면 최하위 항목을 공공시설로 교체한다', () => {
    // KIDS_CAFE vibe는 키즈카페(민간)/놀이터(공공)를 모두 포함 — 키즈카페만 여럿, 놀이터 1개 섞어 검증.
    const kidsCafes = Array.from({ length: 9 }, (_, i) =>
      spot({ id: `cafe${i}`, distance_meters: i * 10, category_min: '키즈카페', is_kids_friendly: true })
    );
    const onePlayground = spot({ id: 'playground', distance_meters: 999, category_min: '어린이놀이터' });
    const outcome = runSearch([...kidsCafes, onePlayground], answers({ vibes: ['KIDS_CAFE'] }), null);

    const hasPublic = outcome.results.some((r) => r.kind === 'SPOT' && isPublicFacility(r.item));
    expect(hasPublic).toBe(true);
  });

  it('제휴 상품이 없으면 억지로 만들지 않고 SPOT만으로 채운다', () => {
    const one = spot({ category_min: '공원' });
    const outcome = runSearch([one], answers(), null);
    expect(outcome.results.every((r) => r.kind === 'SPOT')).toBe(true);
  });
});

// [실측으로 발견한 성능 함정 대응] API 라우트가 "반경별 재조회" 2단계 왕복을 직접
// 조합할 때 쓰는 저수준 함수들 — runSearch와 별개로 export되어 있는지, 동작이 올바른지
// 확인한다.
describe('nextRadiusTier', () => {
  it('다음 반경 티어를 반환한다', () => {
    expect(nextRadiusTier(1000)).toBe(5000);
    expect(nextRadiusTier(15000)).toBe(40000);
  });

  it('마지막 티어거나 알 수 없는 값이면 null이다', () => {
    expect(nextRadiusTier(40000)).toBeNull();
    expect(nextRadiusTier(999)).toBeNull();
  });
});

// [챗봇 카테고리 체계 동기화](2026-09-03) KIDS_CAFE 초고밀도 카테고리 타임아웃 방지용
// 조회 반경 상한 — 실측(EXPLAIN ANALYZE)으로 8km는 항상 8초 안에 들어오고 40km는
// 6.8~8초로 위험하다는 것을 확인한 뒤 도입했다.
describe('getEffectiveQueryRadiusMeters', () => {
  it('KIDS_CAFE가 포함되면 요청 반경이 상한(8km)보다 커도 8km로 줄인다', () => {
    expect(getEffectiveQueryRadiusMeters(['KIDS_CAFE'], 40000)).toBe(8000);
    expect(getEffectiveQueryRadiusMeters(['KIDS_CAFE'], 15000)).toBe(8000);
  });

  it('KIDS_CAFE가 포함돼도 요청 반경이 상한보다 이미 작으면 그대로 둔다', () => {
    expect(getEffectiveQueryRadiusMeters(['KIDS_CAFE'], 5000)).toBe(5000);
  });

  it('KIDS_CAFE 외 다른 vibe에는 상한이 적용되지 않는다', () => {
    expect(getEffectiveQueryRadiusMeters(['NATURE_CAMPING'], 40000)).toBe(40000);
    expect(getEffectiveQueryRadiusMeters(['FESTIVAL_EVENT', 'CULTURE_EXHIBITION'], 40000)).toBe(40000);
  });

  it('vibes가 빈 배열("전체")이면 요청 반경 그대로 둔다', () => {
    expect(getEffectiveQueryRadiusMeters([], 40000)).toBe(40000);
  });

  it('KIDS_CAFE를 다른 vibe와 함께 선택해도 전체 조회 반경이 8km로 줄어든다(둘 이상 선택 시 가장 낮은 상한 적용)', () => {
    expect(getEffectiveQueryRadiusMeters(['NATURE_CAMPING', 'KIDS_CAFE'], 40000)).toBe(8000);
  });
});

describe('applyStrictFilters + assembleResults (라우트 2단계 왕복 조합)', () => {
  it('반경 내 조건 만족 후보만 필터링하고 조립까지 정상 동작한다', () => {
    const near = spot({ id: 'near', distance_meters: 300, category_min: '공원' });
    const far = spot({ id: 'far', distance_meters: 4000, category_min: '공원' });
    const pool = applyStrictFilters([near, far], answers({ transportRadiusMeters: 1000 }), 1000);

    expect(pool).toEqual([near]);
    expect(assembleResults(pool, answers(), null)).toEqual([{ kind: 'SPOT', item: near, isBookmarked: false }]);
  });
});

// [AI 챗봇 맞춤 추천 상세 구현(초개인화 고도화)](2026-09-02 사용자 지시) Step 3.
describe('찜(북마크) 스마트 연동 — Step 3-①', () => {
  it('찜한 장소는 결과 상단에 우선 배치되고 isBookmarked=true로 표시된다', () => {
    // 거리상으로는 far가 near보다 훨씬 불리하지만, far가 찜한 장소라면 그래도 앞에 온다.
    const near = spot({ id: 'near', distance_meters: 100, category_min: '공원' });
    const far = spot({ id: 'far', distance_meters: 4900, category_min: '공원' });
    const results = assembleResults([near, far], answers(), null, new Set(['far']));

    expect(results[0]).toEqual({ kind: 'SPOT', item: far, isBookmarked: true });
    expect(results[1]).toEqual({ kind: 'SPOT', item: near, isBookmarked: false });
  });

  it('찜 정보가 없으면(비로그인 등) 기존처럼 거리/점수순 그대로 동작한다', () => {
    const near = spot({ id: 'near', distance_meters: 100, category_min: '공원' });
    const far = spot({ id: 'far', distance_meters: 4900, category_min: '공원' });
    const results = assembleResults([near, far], answers(), null);

    expect(results[0]).toEqual({ kind: 'SPOT', item: near, isBookmarked: false });
  });
});

describe('방문 이력(mom_pick_posts) 기반 중복 배제 — Step 3-②', () => {
  it('이미 방문 후기/체크리스트를 남긴 스팟은 결과에서 제외한다', () => {
    const visited = spot({ id: 'visited', distance_meters: 200, category_min: '공원' });
    const fresh = spot({ id: 'fresh', distance_meters: 800, category_min: '공원' });
    const pool = applyStrictFilters([visited, fresh], answers(), 5000, new Set(['visited']));

    expect(pool).toEqual([fresh]);
  });

  it('방문 이력이 없으면(비로그인 등) 기존처럼 전부 통과한다', () => {
    const a = spot({ id: 'a', distance_meters: 200, category_min: '공원' });
    const b = spot({ id: 'b', distance_meters: 800, category_min: '공원' });
    const pool = applyStrictFilters([a, b], answers(), 5000);

    expect(pool).toEqual([a, b]);
  });
});

// [챗봇 문제점 수정](2026-09-02 사용자 지시) 5: 분위기 다중 선택 + "전체" 지원.
// [챗봇 카테고리 체계 동기화](2026-09-03 사용자 지시) 이후: NATURE_CAMPING/CULTURE_
// EXHIBITION/LEARNING_CLASS 3개 서로 다른 vibe에 속한 category_min으로 갱신.
describe('분위기(vibe) 다중 선택 및 전체 옵션', () => {
  it('vibes가 여러 개면 그중 하나라도 일치하면 통과한다', () => {
    const park = spot({ category_min: '공원' }); // NATURE_CAMPING
    const museum = spot({ category_min: '역사박물관' }); // CULTURE_EXHIBITION
    const library = spot({ category_min: '도서관' }); // LEARNING_CLASS — 선택하지 않은 분위기
    const pool = applyStrictFilters(
      [park, museum, library],
      answers({ vibes: ['NATURE_CAMPING', 'CULTURE_EXHIBITION'] }),
      5000
    );

    expect(pool).toEqual([park, museum]);
  });

  it('vibes가 빈 배열("전체")이면 분위기로 걸러내지 않는다', () => {
    const park = spot({ category_min: '공원' });
    const library = spot({ category_min: '도서관' });
    const pool = applyStrictFilters([park, library], answers({ vibes: [] }), 5000);

    expect(pool).toEqual([park, library]);
  });

  // [챗봇 개선](2026-09-04 사용자 지시) 5: "장소(open_spaces)가 아니라 이벤트 기준으로
  // 먼저 찾아라" — RPC가 events에서 category_min으로 이미 정확히 좁혀 내려준 후보를
  // matchesVibe가 (open_spaces 전용 매핑만 보고) 다시 걸러내 버리면 안 된다.
  it('item_type이 EVENT이고 category_min이 이벤트 도메인 값이어도 해당 vibe로 통과한다', () => {
    const festivalEvent = spot({ item_type: 'EVENT', category_min: '지역축제/페스티벌' }); // FESTIVAL_EVENT(이벤트 도메인 전용, open_spaces엔 없음)
    const pool = applyStrictFilters([festivalEvent], answers({ vibes: ['FESTIVAL_EVENT'] }), 5000);

    expect(pool).toEqual([festivalEvent]);
  });

  it('item_type이 SPACE이고 category_min이 open_spaces 도메인 값이면 기존처럼 그대로 통과한다', () => {
    const plaza = spot({ item_type: 'SPACE', category_min: '광장' }); // FESTIVAL_EVENT(open_spaces 도메인)
    const pool = applyStrictFilters([plaza], answers({ vibes: ['FESTIVAL_EVENT'] }), 5000);

    expect(pool).toEqual([plaza]);
  });
});

// [챗봇 개선](2026-09-04 사용자 지시) 5: VIBE_EVENT_CATEGORY_MINS가 category-maj-meta.ts의
// CATEGORY_MAJ_OPTIONS(이벤트픽 홈 화면 대분류, 이미 이 6개 vibe와 1:1 동기화됨)에서
// 그대로 파생됐는지 검증한다 — 하드코딩 중복이 아니라 단일 소스에서 나온 값인지가
// 핵심이므로, 실제 값을 다시 베껴 쓰지 않고 CATEGORY_MAJ_OPTIONS 자체를 기준으로
// 비교한다.
describe('VIBE_EVENT_CATEGORY_MINS', () => {
  it('CATEGORY_MAJ_OPTIONS의 해당 대분류 minorCategories와 정확히 일치한다', () => {
    const majByLabel = (label: string) => CATEGORY_MAJ_OPTIONS.find((opt) => opt.maj === label)?.minorCategories;

    expect(VIBE_EVENT_CATEGORY_MINS.NATURE_CAMPING).toEqual(majByLabel('자연 / 캠핑'));
    expect(VIBE_EVENT_CATEGORY_MINS.KIDS_CAFE).toEqual(majByLabel('공공 키즈카페'));
    expect(VIBE_EVENT_CATEGORY_MINS.FARM_EXPERIENCE).toEqual(majByLabel('체험 / 농장'));
    expect(VIBE_EVENT_CATEGORY_MINS.FESTIVAL_EVENT).toEqual(majByLabel('축제 / 이벤트'));
    expect(VIBE_EVENT_CATEGORY_MINS.CULTURE_EXHIBITION).toEqual(majByLabel('문화 / 전시'));
    expect(VIBE_EVENT_CATEGORY_MINS.LEARNING_CLASS).toEqual(majByLabel('배움 / 클래스'));
  });

  it('6개 vibe 모두 빈 배열이 아니다(매핑 누락/오타로 죽은 vibe가 없어야 함)', () => {
    for (const list of Object.values(VIBE_EVENT_CATEGORY_MINS)) {
      expect(list.length).toBeGreaterThan(0);
    }
  });
});
