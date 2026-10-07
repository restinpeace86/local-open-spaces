import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { haversineDistanceMeters } from '@/lib/geo/haversine';
import { buildAgeOverlapFilter } from '@/lib/home/culture-club-age-filter';
import { getCachedStoreCoordinates } from '@/lib/home/culture-club-store-coordinates-cache';

// [문화센터 통합검색](2026-10-06 사용자 지시, project/decision-log.md Decision
// 028): "전체 통합검색 및 롯데마트나 이마트 필터검색도 가능하게" — 기존
// /api/culture-club/classes(이마트 전용)/lottemart-classes(롯데마트 전용)를
// culture_club_classes 하나로 대체한다. brand를 생략하면 전체(모든 브랜드)를
// 반환한다.
//
// [기본 필터 2종 — 2026-10-07 사용자 지시](project/decision-log.md Decision
// 028 연장): "1차적인 검색조건" — 아이 연령(age_months)과 현재 위치(lat/lng)
// 기반 거리순 정렬.
//
// [Branch-First 성능 최적화 + 반경 필터](2026-10-07 todo.md 개선사항1-1):
// "수만 건에 달하는 강좌 데이터 전체를 대상으로 거리 계산을 하거나 필터를
// 걸면 성능이 심각하게 떨어진다" — 이전 구현은 (나이/브랜드/요일 등) 필터링된
// 전체 강좌를 안전상한(5,000건)까지 끌어와 메모리에서 거리를 계산해 정렬했다.
// 이제는 반대 순서로 간다: 지점(Branch)은 124개뿐이라 먼저 지점 좌표만 전부
// 가져와 거리를 계산하고, 반경(radius_km) 내 지점만 골라낸 뒤, 그 지점들에
// 소속된 강좌만 조회한다(브랜드+store_code 조합을 OR로 묶어 culture_club_
// classes 쿼리 자체를 좁힌다). 반경이 좁을수록 조회 대상 강좌 수 자체가
// 줄어들어 훨씬 빠르다.
//
// [지점 필터 — 다중 선택으로 전환](2026-10-07 todo.md 개선사항1-3): "계층형
// 지점 선택 UI/UX" — 기존엔 브랜드 하나를 고르면 그 브랜드 지점 중 하나만
// 고를 수 있었다(store_code 단일값). 이제는 반경 내 지점들을 뱃지로 다중
// 선택할 수 있어야 하므로 store_codes(콤마구분, 복수)로 바꾼다. 아무 지점도
// 선택하지 않으면(빈 값) "반경 내 전체 지점"과 동일하게 취급한다.
const DEFAULT_PAGE_SIZE = 20;
const VALID_BRANDS = new Set(['emart', 'lottemart']);
const DISTANCE_SORT_FETCH_SAFETY_CEILING = 5000;
const PAGE_FETCH_SIZE = 1000;

// get_culture_club_store_coordinates()가 돌려주는 external_id는
// "{BRAND}_STORE_{storeCode}" 형태다(scripts/ingest/emart-culture-club-
// stores.mjs / lottemart-culture-club-stores.mjs의 buildOpenSpaceRow 참고).
function parseExternalId(externalId: string): { brand: string; storeCode: string } | null {
  const match = /^([A-Z]+)_STORE_(.+)$/.exec(externalId);
  if (!match) return null;
  return { brand: match[1].toLowerCase(), storeCode: match[2] };
}

type StoreCandidate = { brand: string; storeCode: string; distanceMeters: number; lat: number; lng: number };

// 브랜드별 store_code 네임스페이스가 서로 달라(이마트 '180'과 롯데마트 '455'가
// 우연히 같은 숫자일 수 있음) brand+store_code를 묶어서 OR 그룹으로 만든다 —
// store_code만으로 .in()을 걸면 다른 브랜드의 동일 코드까지 잘못 걸릴 수 있다.
function buildStoreScopeFilter(candidates: StoreCandidate[]): string {
  const codesByBrand = new Map<string, string[]>();
  for (const c of candidates) {
    if (!codesByBrand.has(c.brand)) codesByBrand.set(c.brand, []);
    codesByBrand.get(c.brand)!.push(c.storeCode);
  }
  return [...codesByBrand.entries()].map(([brand, codes]) => `and(brand.eq.${brand},store_code.in.(${codes.join(',')}))`).join(',');
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const brands = (searchParams.get('brand') ?? '')
      .split(',')
      .filter(Boolean)
      .filter((b) => VALID_BRANDS.has(b));
    const storeCodes = (searchParams.get('store_codes') ?? '').split(',').filter(Boolean);
    const days = (searchParams.get('days') ?? '').split(',').filter(Boolean);
    const subCategories = (searchParams.get('sub_category_name') ?? '').split(',').filter(Boolean);
    const targetCodes = (searchParams.get('target_code') ?? '').split(',').filter(Boolean);
    const q = (searchParams.get('q') ?? '').trim();
    const ageMonthsRaw = searchParams.get('age_months');
    const ageMonths = ageMonthsRaw != null && ageMonthsRaw !== '' ? Number(ageMonthsRaw) : null;
    const hasAgeFilter = ageMonths != null && Number.isFinite(ageMonths);
    // [버그 수정] searchParams.get()이 파라미터 부재 시 null을 돌려주는데,
    // Number(null)은 NaN이 아니라 0이라 Number.isFinite(0)이 true가 되어
    // lat/lng를 아예 안 보낸 요청도 "위치 있음"으로 잘못 판별되는 숨은
    // 버그가 있었다(실측 확인 — age_months 전용 테스트에서 발견). 파라미터가
    // 없으면 명시적으로 NaN으로 취급한다.
    const latRaw = searchParams.get('lat');
    const lngRaw = searchParams.get('lng');
    const lat = latRaw != null && latRaw !== '' ? Number(latRaw) : NaN;
    const lng = lngRaw != null && lngRaw !== '' ? Number(lngRaw) : NaN;
    const hasLocation = Number.isFinite(lat) && Number.isFinite(lng);
    const radiusKmRaw = searchParams.get('radius_km');
    const radiusKm = radiusKmRaw != null && radiusKmRaw !== '' ? Number(radiusKmRaw) : null;
    const hasRadius = radiusKm != null && Number.isFinite(radiusKm) && radiusKm > 0;
    const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);
    const pageSize = Number(searchParams.get('page_size')) || DEFAULT_PAGE_SIZE;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const supabase = createAdminClient();

    function applyCommonFilters<T>(builder: T, storeScopeFilter: string | null): T {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q2 = builder as any;
      if (brands.length > 0) q2 = q2.in('brand', brands);
      if (days.length > 0) q2 = q2.overlaps('class_day', days);
      if (subCategories.length > 0) q2 = q2.in('sub_category_name', subCategories);
      if (targetCodes.length > 0) q2 = q2.or(targetCodes.map((code) => `raw_extra->>target_code.eq.${code}`).join(','));
      if (q) q2 = q2.ilike('class_title', `%${q}%`);
      if (hasAgeFilter) q2 = q2.or(buildAgeOverlapFilter(ageMonths as number));
      if (storeScopeFilter) q2 = q2.or(storeScopeFilter);
      return q2 as T;
    }

    // [Branch-First] 위치가 있으면 지점(124개)부터 거리 계산 + 반경/브랜드/
    // 선택 지점으로 좁힌 뒤, 그 지점들에 속한 강좌만 조회한다.
    let storeScopeFilter: string | null = null;
    // [위치 팝업 — 지점 좌표도 함께 내려줌](2026-10-07 사용자 지시: "스타필드
    // 시티위례.. 링크걸어놔서 누르면 위치 뜨도록") 카드/상세의 "위치" 줄을
    // 누르면 인앱 지도 모달(MapPreviewModal, 기존 스팟/이벤트 상세와 동일한
    // 컴포넌트 재사용 — 제5장 제4조)을 띄우려면 지점의 실제 lat/lng가
    // 필요하다. 이미 Branch-First 과정에서 모든 후보 지점의 좌표를 들고
    // 있으므로 거리와 함께 좌표도 그대로 맵에 담아 응답에 실어 보낸다.
    let storeInfoByKey: Map<string, { distanceMeters: number; lat: number; lng: number }> | null = null;

    if (hasLocation) {
      const coords = await getCachedStoreCoordinates();

      let candidates: StoreCandidate[] = coords
        .map((c: { external_id: string; lng: number; lat: number }) => {
          const parsed = parseExternalId(c.external_id);
          if (!parsed) return null;
          return { ...parsed, distanceMeters: haversineDistanceMeters({ lat, lng }, c), lat: c.lat, lng: c.lng };
        })
        .filter((c: StoreCandidate | null): c is StoreCandidate => c !== null);

      if (hasRadius) candidates = candidates.filter((c) => c.distanceMeters <= radiusKm! * 1000);
      if (brands.length > 0) candidates = candidates.filter((c) => brands.includes(c.brand));
      if (storeCodes.length > 0) candidates = candidates.filter((c) => storeCodes.includes(c.storeCode));

      if (candidates.length === 0) {
        return NextResponse.json({ items: [], total: 0, page, pageSize });
      }

      storeScopeFilter = buildStoreScopeFilter(candidates);
      storeInfoByKey = new Map(
        candidates.map((c) => [`${c.brand}:${c.storeCode}`, { distanceMeters: c.distanceMeters, lat: c.lat, lng: c.lng }])
      );
    } else if (storeCodes.length > 0) {
      // 위치 없이 지점만 지정된 경우(드문 호출 패턴) — brand가 정확히 1개일 때만
      // store_code만으로 안전하게 좁힐 수 있다(네임스페이스 충돌 방지).
      if (brands.length === 1) storeScopeFilter = storeCodes.map((code) => `store_code.eq.${code}`).join(',');
    }

    // [성능 최적화 — 왕복 횟수 줄이기](2026-10-07 사용자 지적: "성능 너무
    // 느린데?") — 실측으로 원인을 찾았다: Supabase 원격 호출은 행 수와
    // 무관하게 왕복마다 ~400~600ms 고정 지연이 있다. 이전엔 count 쿼리를
    // 먼저 기다렸다가(1 왕복) 그 결과로 range 쿼리들을 보내(+1 왕복) 순차
    // 3단계(지점 좌표 RPC → count → range)였다. count는 "첫 1,000건을
    // 가져왔다"는 사실과 독립적인 정보이므로, count와 첫 페이지(최대
    // 1,000건) 조회를 동시에 보낸다. 첫 페이지가 꽉 차지 않았으면(=더 없음)
    // 그 자체가 정확한 총건수라 count 결과를 쓸 필요도 없다(실제로는 그래도
    // 정직한 count 값을 그대로 쓴다 — 거의 항상 서로 일치하고, 더 저렴한
    // 쪽을 고르느라 복잡도를 늘리지 않는다).
    const countQuery = applyCommonFilters(
      supabase.from('culture_club_classes').select('*', { count: 'exact', head: true }).eq('is_excluded', false),
      storeScopeFilter
    );
    const firstPageQuery = applyCommonFilters(
      supabase.from('culture_club_classes').select('*').eq('is_excluded', false),
      storeScopeFilter
    );
    const firstPageRange = hasLocation ? ([0, PAGE_FETCH_SIZE - 1] as const) : ([from, to] as const);
    if (!hasLocation) {
      // 위치 없는 폴백 경로는 거리 재정렬이 없어 DB 정렬 그대로 원하는
      // 페이지만 바로 가져오면 된다(Branch-First 안전상한 로직 불필요).
      firstPageQuery.order('schedule_start_date', { ascending: true });
    }

    const [{ count, error: countError }, firstPageResult] = await Promise.all([
      countQuery,
      firstPageQuery.range(...firstPageRange),
    ]);
    if (countError) throw new Error(countError.message);
    if (firstPageResult.error) throw new Error(firstPageResult.error.message);

    const total = count ?? 0;

    if (!hasLocation) {
      return NextResponse.json({ items: firstPageResult.data ?? [], total, page, pageSize });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let data: any[] = firstPageResult.data ?? [];
    const fetchCeiling = Math.min(total, DISTANCE_SORT_FETCH_SAFETY_CEILING);
    if (fetchCeiling > PAGE_FETCH_SIZE) {
      // 첫 페이지가 꽉 찼고 더 가져올 게 남아 있을 때만 추가 왕복을 보낸다
      // (Branch-First로 좁혀진 흔한 경우는 대부분 여기 들어오지 않는다).
      const remainingOffsets: number[] = [];
      for (let offset = PAGE_FETCH_SIZE; offset < fetchCeiling; offset += PAGE_FETCH_SIZE) remainingOffsets.push(offset);
      const morePages = await Promise.all(
        remainingOffsets.map((offset) =>
          applyCommonFilters(supabase.from('culture_club_classes').select('*').eq('is_excluded', false), storeScopeFilter).range(
            offset,
            offset + PAGE_FETCH_SIZE - 1
          )
        )
      );
      for (const { error: pageError } of morePages) {
        if (pageError) throw new Error(pageError.message);
      }
      data = data.concat(...morePages.map((p) => p.data ?? []));
    }

    const withDistance = data.map((item) => {
      const info = storeInfoByKey!.get(`${item.brand}:${item.store_code}`);
      return {
        ...item,
        distance_meters: info?.distanceMeters ?? null,
        store_lat: info?.lat ?? null,
        store_lng: info?.lng ?? null,
      };
    });
    withDistance.sort((a, b) => {
      if (a.distance_meters == null && b.distance_meters == null) return 0;
      if (a.distance_meters == null) return 1;
      if (b.distance_meters == null) return -1;
      return a.distance_meters - b.distance_meters;
    });

    const pageItems = withDistance.slice(from, to + 1);
    return NextResponse.json({ items: pageItems, total, page, pageSize });
  } catch (err) {
    const message = err instanceof Error ? err.message : '문화센터 통합검색 조회 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
