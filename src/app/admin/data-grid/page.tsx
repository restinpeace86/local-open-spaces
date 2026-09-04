import { createClient } from '@/lib/supabase/server';
import { AdminDataGridClient } from '@/components/admin/data-grid-client';
import { rpcWithRetry } from '@/lib/supabase/rpc-retry';
import { OPEN_SPACES_CATEGORY_MIN_FALLBACK, EVENTS_CATEGORY_MIN_FALLBACK } from '@/lib/admin/category-min-fallback';

// [개편] /admin/data-grid: Decision 017 및 RAW/Service ETL로 전수 적재된 원천 데이터를
// 관리자가 검증할 수 있는 그리드 도구. 탭별 필터 옵션(출처/카테고리/원천 중분류/접수상태)은
// 하드코딩하지 않고 DB의 실제 값을 RPC로 조회해 구성한다(scripts/migrations/2026-08-25-
// admin-data-grid-rpcs.sql). 요약 메트릭은 별도로 클라이언트에서 /api/admin/data-grid/summary를
// 비동기 호출한다(실측상 open_spaces 12만 건 집계가 수 초 걸릴 수 있어 페이지 렌더를 막지 않음).
//
// 실측 확인(2026-08-25): open_spaces 대상 RPC는 8초 statement_timeout 경계에 걸쳐 있어 가끔
// 타임아웃한다. 필터 옵션 하나가 실패했다고 페이지 전체를 죽이면 안 되므로(제5장 제11조
// 무중단 원칙) 각 RPC를 개별적으로 처리하고, 실패한 것만 빈 배열로 대체한다.
// [Admin 필터 체크박스 렌더링 안정성 확보](2026-08-28) 후속 실측: 대량 UPDATE 직후뿐 아니라
// 평상시에도 8개 RPC 전부가 동시다발적으로 timeout 나는 것을 실측으로 재현했다(연속 요청 시
// 실패 개수가 7→2→2로 점차 줄어드는 콜드 캐시 패턴과 정확히 일치). 모든 RPC를
// rpcWithRetry()로 감싸 이 흔한 일시적 실패를 흡수한다(src/lib/supabase/rpc-retry.ts).
type RpcResult<T> = { data: T | null; error: { message: string } | null };

function firstRow<T>(result: RpcResult<T[]>, label: string): T | undefined {
  if (result.error) {
    console.error(`[admin/data-grid] ${label} 조회 실패:`, result.error.message);
    return undefined;
  }
  return result.data?.[0];
}

export default async function AdminDataGridPage() {
  const supabase = await createClient();

  const [
    sourceTypeOptions,
    categoryOptions,
    sourceOptions,
    seoulYeyakOptions,
    eventsOptions,
    rawIngestOptions,
    openSpacesCategoryMinOptions,
    eventsCategoryMinOptions,
  ] = await Promise.all([
    rpcWithRetry(async () => supabase.rpc('get_open_spaces_source_type_options')),
    rpcWithRetry(async () => supabase.rpc('get_open_spaces_category_options')),
    rpcWithRetry(async () => supabase.rpc('get_open_spaces_source_options')),
    rpcWithRetry(async () => supabase.rpc('get_open_spaces_seoul_yeyak_options')),
    rpcWithRetry(async () => supabase.rpc('get_events_filter_options')),
    rpcWithRetry(async () => supabase.rpc('get_raw_ingest_data_filter_options')),
    rpcWithRetry<{ category_min: string }[]>(async () => supabase.rpc('get_category_min_options', { p_target_table: 'open_spaces' })),
    rpcWithRetry<{ category_min: string }[]>(async () => supabase.rpc('get_category_min_options', { p_target_table: 'events' })),
  ]);

  const stRow = firstRow(sourceTypeOptions, 'get_open_spaces_source_type_options');
  const catRow = firstRow(categoryOptions, 'get_open_spaces_category_options');
  const srcRow = firstRow(sourceOptions, 'get_open_spaces_source_options');
  const yeyakRow = firstRow(seoulYeyakOptions, 'get_open_spaces_seoul_yeyak_options');
  const ev = firstRow(eventsOptions, 'get_events_filter_options');
  const raw = firstRow(rawIngestOptions, 'get_raw_ingest_data_filter_options');

  // [카테고리 정제 & 어드민 확장](2026-08-26): get_category_min_options는 (RPC 관례상) 행마다
  // 하나의 category_min을 돌려주는 테이블 함수라 firstRow가 아니라 전체 행을 그대로 매핑한다.
  // [Admin 필터 체크박스 렌더링 안정성 확보](2026-08-28): 재시도까지 모두 실패하면(실측상
  // 드물지 않게 발생 — 이 세션 중 직접 재현함) categoryMinsFetchFailed를 true로 넘기고,
  // 하드코딩된 최후의 폴백 목록(category-min-fallback.ts, 서비스 데이터 원천이 아니라
  // "완전히 실패했을 때도 필터 UI를 계속 쓸 수 있게 하는" 안전망)을 대신 사용한다 — 조용히
  // NULL 체크박스만 남기지 않는다.
  if (openSpacesCategoryMinOptions.error) {
    console.error('[admin/data-grid] get_category_min_options(open_spaces) 조회 실패(재시도 포함) — 폴백 목록 사용:', openSpacesCategoryMinOptions.error.message);
  }
  if (eventsCategoryMinOptions.error) {
    console.error('[admin/data-grid] get_category_min_options(events) 조회 실패(재시도 포함) — 폴백 목록 사용:', eventsCategoryMinOptions.error.message);
  }
  const openSpacesCategoryMins = openSpacesCategoryMinOptions.error
    ? OPEN_SPACES_CATEGORY_MIN_FALLBACK
    : (openSpacesCategoryMinOptions.data ?? []).map((r) => r.category_min);
  const eventsCategoryMins = eventsCategoryMinOptions.error
    ? EVENTS_CATEGORY_MIN_FALLBACK
    : (eventsCategoryMinOptions.data ?? []).map((r) => r.category_min);
  const openSpacesCategoryMinsFetchFailed = Boolean(openSpacesCategoryMinOptions.error);
  const eventsCategoryMinsFetchFailed = Boolean(eventsCategoryMinOptions.error);

  return (
    <AdminDataGridClient
      filterOptions={{
        open_spaces: {
          sourceTypes: stRow?.source_types ?? [],
          categories: catRow?.categories ?? [],
          sources: srcRow?.sources ?? [],
          minClassNames: yeyakRow?.min_class_names ?? [],
          svcStatNms: yeyakRow?.svc_stat_nms ?? [],
          categoryMins: openSpacesCategoryMins,
          categoryMinsFetchFailed: openSpacesCategoryMinsFetchFailed,
        },
        events: {
          sources: ev?.sources ?? [],
          categories: ev?.event_types ?? [],
          minClassNames: ev?.min_class_names ?? [],
          svcStatNms: ev?.svc_stat_nms ?? [],
          categoryMins: eventsCategoryMins,
          categoryMinsFetchFailed: eventsCategoryMinsFetchFailed,
        },
        raw_ingest_data: {
          sources: raw?.sources ?? [],
        },
        // [관리자 화면 기능 고도화 및 범용 제휴 상품 테이블 개편](2026-08-30 사용자 지시):
        // curated_items 탭은 자기완결적인 CuratedItemsPanel이 자체 API로 필터 옵션 없이
        // 동작해 이 필터 체계가 필요 없다 — 타입만 맞춰주는 빈 객체.
        curated_items: {},
        // [스팟 큐레이션 탭](2026-09-01 사용자 지시): SpotCurationsPanel도 동일하게
        // 자기완결적이라 빈 객체만 넘긴다.
        spot_curations: {},
        // [맘스픽 채택 관리 탭](2026-09-02, Decision 019): MomPickPostsPanel도 동일하게
        // 자기완결적이라 빈 객체만 넘긴다.
        mom_pick_posts: {},
        // [개선사항10 - 중복 스팟 그룹핑 및 매핑 탭](2026-09-04): SpotDedupPanel도 동일하게
        // 자기완결적이라 빈 객체만 넘긴다.
        spot_dedup: {},
      }}
    />
  );
}
