import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { haversineDistanceMeters } from '@/lib/geo/haversine';
import { buildAgeOverlapFilter } from '@/lib/home/culture-club-age-filter';

// [문화센터 통합검색](2026-10-06 사용자 지시, project/decision-log.md Decision
// 028): "전체 통합검색 및 롯데마트나 이마트 필터검색도 가능하게" — 기존
// /api/culture-club/classes(이마트 전용)/lottemart-classes(롯데마트 전용)를
// culture_club_classes 하나로 대체한다. brand를 생략하면 전체(모든 브랜드)를
// 반환한다.
//
// [지점 필터는 단일 브랜드 선택 시에만 의미 있음] 지점 코드가 브랜드마다
// 독립적으로 부여돼(이마트 '964'와 롯데마트 '455' 등 서로 다른 네임스페이스)
// store_code만으로는 브랜드를 특정할 수 없다 — 이 라우트는 brand가 정확히
// 1개로 지정됐을 때만 store_code 필터를 받는다(그 외에는 무시, 추측으로
// 브랜드를 짐작하지 않음).
//
// [카테고리/대상 필터는 브랜드별로 다른 축] 이마트는 sub_category_name(5개
// 고정값), 롯데마트는 target_code(수강대상, raw_extra에 보관)로 서로 다른
// 분류 체계를 쓴다 — 억지로 하나의 공통 카테고리로 합치지 않고, 각자 원래
// 쓰던 파라미터 이름을 그대로 받는다(둘 다 와도 됨, 각자 해당 브랜드 행에만
// 적용됨).
//
// [기본 필터 2종 — 2026-10-07 사용자 지시](project/decision-log.md Decision
// 028 연장): "1차적인 검색조건" — 아이 연령(age_months)과 현재 위치(lat/lng)
// 기반 거리순 정렬. 둘 다 생략 가능(선택적 쿼리 파라미터)하지만, 프론트엔드가
// 로그인/위치 정보가 있으면 항상 자동으로 실어 보낸다.
//
// [거리순 정렬 — 구현 방식] culture_club_classes는 좌표를 직접 갖지 않는다
// (store_code로 open_spaces를 가리킴). 문화센터 지점은 124개뿐이라
// get_culture_club_store_coordinates() RPC로 전부 가져와 메모리에서 join한다.
// "가까운 순"이 전체 필터링 결과를 기준으로 정확해야 하므로(사용자 지시:
// "본인 위치 기준으로 가까운 것부터 보여줄꺼야"가 1차 조건), schedule_
// start_date로 먼저 솎아낸 뒤 그 안에서만 거리 정렬하면 틀린 "가장 가까운"
// 이 나올 수 있다(실측으로 발견 — 연령 필터만 걸었을 때 3,722건이 걸렸는데
// 1,000건으로 자르고 날짜순으로 추렸더니 실제로 가장 가까운 지점이 아닌
// 다른 지점이 1~3등으로 나왔다). 그래서 필터링된 전체를 가져와(안전상한
// DISTANCE_SORT_FETCH_SAFETY_CEILING까지만 — 이 앱 규모(총 2만여 건)에서
// 실제로 걸릴 일은 없고, 쿼리 폭주 방지용 방어선일 뿐이다) 거리순으로 정확히
// 정렬한 뒤 페이지를 자른다.
const DEFAULT_PAGE_SIZE = 20;
const VALID_BRANDS = new Set(['emart', 'lottemart']);
const DISTANCE_SORT_FETCH_SAFETY_CEILING = 5000;

function buildExternalId(brand: string, storeCode: string | null): string | null {
  if (!storeCode) return null;
  return `${brand.toUpperCase()}_STORE_${storeCode}`;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const brands = (searchParams.get('brand') ?? '')
      .split(',')
      .filter(Boolean)
      .filter((b) => VALID_BRANDS.has(b));
    const storeCode = searchParams.get('store_code');
    const days = (searchParams.get('days') ?? '').split(',').filter(Boolean);
    const subCategories = (searchParams.get('sub_category_name') ?? '').split(',').filter(Boolean);
    const targetCodes = (searchParams.get('target_code') ?? '').split(',').filter(Boolean);
    const q = (searchParams.get('q') ?? '').trim();
    const ageMonthsRaw = searchParams.get('age_months');
    const ageMonths = ageMonthsRaw != null && ageMonthsRaw !== '' ? Number(ageMonthsRaw) : null;
    const hasAgeFilter = ageMonths != null && Number.isFinite(ageMonths);
    const lat = Number(searchParams.get('lat'));
    const lng = Number(searchParams.get('lng'));
    const hasLocation = Number.isFinite(lat) && Number.isFinite(lng);
    const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);
    const pageSize = Number(searchParams.get('page_size')) || DEFAULT_PAGE_SIZE;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const supabase = createAdminClient();

    function applyCommonFilters<T>(builder: T): T {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q2 = builder as any;
      if (brands.length > 0) q2 = q2.in('brand', brands);
      if (brands.length === 1 && storeCode) q2 = q2.eq('store_code', storeCode);
      if (days.length > 0) q2 = q2.overlaps('class_day', days);
      if (subCategories.length > 0) q2 = q2.in('sub_category_name', subCategories);
      if (targetCodes.length > 0) q2 = q2.or(targetCodes.map((code) => `raw_extra->>target_code.eq.${code}`).join(','));
      if (q) q2 = q2.ilike('class_title', `%${q}%`);
      if (hasAgeFilter) q2 = q2.or(buildAgeOverlapFilter(ageMonths as number));
      return q2 as T;
    }

    // 총 건수는 거리 정렬 상한과 무관하게 항상 정직한 값을 별도로 조회한다.
    const countQuery = applyCommonFilters(supabase.from('culture_club_classes').select('*', { count: 'exact', head: true }).eq('is_excluded', false));
    const { count, error: countError } = await countQuery;
    if (countError) throw new Error(countError.message);

    if (hasLocation) {
      // [PostgREST 1,000건 truncation 방지] 이 프로젝트에서 이미 여러 번 겪은
      // 문제(emart-culture-club-detail.mjs 등 참고) — .limit()을 아무리 크게
      // 줘도 PostgREST가 한 요청당 조용히 1,000건으로 자른다. 안전상한까지
      // .range()로 1,000건씩 반복 조회해 합친다(실측으로 발견 — 최초 구현은
      // .limit(5000)만 걸어뒀다가 실제로는 여전히 1,000건만 받아와 "가장
      // 가까운 지점"이 틀리게 나왔다).
      // 최종 순서는 어차피 아래에서 거리로 다시 정렬하므로, DB 단계에서는
      // 정렬을 걸지 않는다(불필요한 정렬 비용 제거) — 페이지들을 병렬로
      // 조회해 왕복 시간도 줄인다(순차 조회 시 페이지당 최대 수 초씩 걸려
      // 체감 지연이 컸다, 실측 확인).
      const PAGE_FETCH_SIZE = 1000;
      const offsets: number[] = [];
      for (let offset = 0; offset < DISTANCE_SORT_FETCH_SAFETY_CEILING; offset += PAGE_FETCH_SIZE) offsets.push(offset);

      const pages = await Promise.all(
        offsets.map((offset) =>
          applyCommonFilters(
            supabase
              .from('culture_club_classes')
              .select('*')
              .eq('is_excluded', false)
              .range(offset, offset + PAGE_FETCH_SIZE - 1)
          )
        )
      );
      for (const { error: pageError } of pages) {
        if (pageError) throw new Error(pageError.message);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any[] = pages.flatMap((p) => p.data ?? []);

      const { data: coords, error: coordsError } = await supabase.rpc('get_culture_club_store_coordinates');
      if (coordsError) throw new Error(coordsError.message);
      const coordMap = new Map((coords ?? []).map((c: { external_id: string; lng: number; lat: number }) => [c.external_id, c]));

      const withDistance = (data ?? []).map((item) => {
        const externalId = buildExternalId(item.brand, item.store_code);
        const coord = externalId ? coordMap.get(externalId) : undefined;
        const distanceMeters = coord ? haversineDistanceMeters({ lat, lng }, coord) : null;
        return { ...item, distance_meters: distanceMeters };
      });
      withDistance.sort((a, b) => {
        if (a.distance_meters == null && b.distance_meters == null) return 0;
        if (a.distance_meters == null) return 1;
        if (b.distance_meters == null) return -1;
        return a.distance_meters - b.distance_meters;
      });

      const pageItems = withDistance.slice(from, to + 1);
      return NextResponse.json({ items: pageItems, total: count ?? 0, page, pageSize });
    }

    const query = applyCommonFilters(
      supabase.from('culture_club_classes').select('*').eq('is_excluded', false).order('schedule_start_date', { ascending: true }).range(from, to)
    );
    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return NextResponse.json({ items: data ?? [], total: count ?? 0, page, pageSize });
  } catch (err) {
    const message = err instanceof Error ? err.message : '문화센터 통합검색 조회 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
