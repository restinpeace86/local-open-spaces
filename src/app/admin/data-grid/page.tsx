import { createClient } from '@/lib/supabase/server';
import { AdminDataGridClient } from '@/components/admin/data-grid-client';

// [개편] /admin/data-grid: Decision 017 및 RAW/Service ETL로 전수 적재된 원천 데이터를
// 관리자가 검증할 수 있는 그리드 도구. 탭별 필터 옵션(출처/카테고리/원천 중분류/접수상태)은
// 하드코딩하지 않고 DB의 실제 값을 RPC로 조회해 구성한다(scripts/migrations/2026-08-25-
// admin-data-grid-rpcs.sql). 요약 메트릭은 별도로 클라이언트에서 /api/admin/data-grid/summary를
// 비동기 호출한다(실측상 open_spaces 12만 건 집계가 수 초 걸릴 수 있어 페이지 렌더를 막지 않음).
//
// 실측 확인(2026-08-25): open_spaces 대상 RPC는 8초 statement_timeout 경계에 걸쳐 있어 가끔
// 타임아웃한다. 필터 옵션 하나가 실패했다고 페이지 전체를 죽이면 안 되므로(제5장 제11조
// 무중단 원칙) 각 RPC를 개별적으로 처리하고, 실패한 것만 빈 배열로 대체한다.
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
    supabase.rpc('get_open_spaces_source_type_options'),
    supabase.rpc('get_open_spaces_category_options'),
    supabase.rpc('get_open_spaces_source_options'),
    supabase.rpc('get_open_spaces_seoul_yeyak_options'),
    supabase.rpc('get_events_filter_options'),
    supabase.rpc('get_raw_ingest_data_filter_options'),
    supabase.rpc('get_category_min_options', { p_target_table: 'open_spaces' }),
    supabase.rpc('get_category_min_options', { p_target_table: 'events' }),
  ]);

  const stRow = firstRow(sourceTypeOptions, 'get_open_spaces_source_type_options');
  const catRow = firstRow(categoryOptions, 'get_open_spaces_category_options');
  const srcRow = firstRow(sourceOptions, 'get_open_spaces_source_options');
  const yeyakRow = firstRow(seoulYeyakOptions, 'get_open_spaces_seoul_yeyak_options');
  const ev = firstRow(eventsOptions, 'get_events_filter_options');
  const raw = firstRow(rawIngestOptions, 'get_raw_ingest_data_filter_options');

  // [카테고리 정제 & 어드민 확장](2026-08-26): get_category_min_options는 (RPC 관례상) 행마다
  // 하나의 category_min을 돌려주는 테이블 함수라 firstRow가 아니라 전체 행을 그대로 매핑한다.
  if (openSpacesCategoryMinOptions.error) {
    console.error('[admin/data-grid] get_category_min_options(open_spaces) 조회 실패:', openSpacesCategoryMinOptions.error.message);
  }
  if (eventsCategoryMinOptions.error) {
    console.error('[admin/data-grid] get_category_min_options(events) 조회 실패:', eventsCategoryMinOptions.error.message);
  }
  const openSpacesCategoryMins = (openSpacesCategoryMinOptions.data ?? []).map((r) => r.category_min);
  const eventsCategoryMins = (eventsCategoryMinOptions.data ?? []).map((r) => r.category_min);

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
        },
        events: {
          sources: ev?.sources ?? [],
          categories: ev?.event_types ?? [],
          minClassNames: ev?.min_class_names ?? [],
          svcStatNms: ev?.svc_stat_nms ?? [],
          categoryMins: eventsCategoryMins,
        },
        raw_ingest_data: {
          sources: raw?.sources ?? [],
        },
      }}
    />
  );
}
