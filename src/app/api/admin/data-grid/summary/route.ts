import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// /admin/data-grid 요약 메트릭. 실측 확인(2026-08-25): open_spaces(12만 건)는 커스텀 RPC
// 함수(단일 패스 조건부 집계)로 묶어도 PostgREST RPC 경로의 8초 statement_timeout을 넘나들며
// 불안정했지만, 네이티브 count/head 쿼리는 개별 호출이 0.1~1.5초로 훨씬 빠르고 안정적이었다
// (scripts/migrations/2026-08-25-admin-data-grid-rpcs.sql 상단 주석 참고). 다만 10개를 한꺼번에
// 병렬 호출하면 커넥션 경합으로 일부가 실패하는 것도 실측했다 — 3~4개씩 배치로 나눠 순차
// 실행한다. 개별 쿼리가 실패해도 그 지표만 null로 응답해 요약 패널 전체가 죽지 않도록 한다
// (제5장 제11조 무중단 원칙).
type SupabaseClientType = Awaited<ReturnType<typeof createClient>>;
type MetricJob = { key: string; run: (supabase: SupabaseClientType) => PromiseLike<{ count: number | null; error: { message: string } | null }> };

// [매일 배치 신규 데이터 모니터링](2026-08-28): "오늘 자정 이후 반영" 요약 카드용 지표.
// [events.updated_at 컬럼 + 자동 갱신 트리거](2026-09-12 사용자 지시): "updated_at
// 어 이거 추가해.. 자동 갱신 트리거도 하고" — 2026-08-28 당시엔 events에 updated_at
// 컬럼이 아예 없고 open_spaces의 updated_at도 트리거 없이 수동 수정 시에만 채워져
// "내용 갱신 건수"를 집계할 근거가 없었다(그래서 이 카드가 "오늘 신규 생성"만
// 보여줬다). 이제 events에 실제 내용이 바뀔 때만 갱신되는 트리거 기반 updated_at이
// 생겨(2026-09-12-events-updated-at-trigger.sql, raw_data 등 잡음 컬럼은 비교에서
// 제외해 "값이 하나도 안 바뀐 재적재"까지 오늘 갱신으로 잡히지 않게 함) events만
// "오늘 갱신" 건수도 함께 집계한다. open_spaces는 여전히 트리거가 없어(수동 수정 시만
// 갱신) 갱신 집계 대상에서 제외한다 — 이 스코프 밖(오늘 요청은 events 한정).
const todayStartIso = () => `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`;

const JOBS: MetricJob[] = [
  { key: 'open_spaces_count', run: (s) => s.from('open_spaces').select('*', { count: 'exact', head: true }) },
  { key: 'open_spaces_missing_location', run: (s) => s.from('open_spaces').select('*', { count: 'exact', head: true }).is('location', null) },
  { key: 'open_spaces_missing_address', run: (s) => s.from('open_spaces').select('*', { count: 'exact', head: true }).eq('address', '') },
  { key: 'open_spaces_missing_fee', run: (s) => s.from('open_spaces').select('*', { count: 'exact', head: true }).is('is_free', null) },
  { key: 'open_spaces_missing_url', run: (s) => s.from('open_spaces').select('*', { count: 'exact', head: true }).is('info_url', null) },
  { key: 'open_spaces_created_today', run: (s) => s.from('open_spaces').select('*', { count: 'exact', head: true }).gte('created_at', todayStartIso()) },
  { key: 'events_count', run: (s) => s.from('events').select('*', { count: 'exact', head: true }) },
  { key: 'events_missing_location', run: (s) => s.from('events').select('*', { count: 'exact', head: true }).is('location', null) },
  { key: 'events_missing_fee', run: (s) => s.from('events').select('*', { count: 'exact', head: true }).is('is_free', null) },
  { key: 'events_missing_reservation_url', run: (s) => s.from('events').select('*', { count: 'exact', head: true }).is('reservation_url', null) },
  { key: 'events_created_today', run: (s) => s.from('events').select('*', { count: 'exact', head: true }).gte('created_at', todayStartIso()) },
  { key: 'events_updated_today', run: (s) => s.from('events').select('*', { count: 'exact', head: true }).gte('updated_at', todayStartIso()) },
  { key: 'raw_ingest_data_count', run: (s) => s.from('raw_ingest_data').select('*', { count: 'exact', head: true }) },
];

const BATCH_SIZE = 4;

async function runJob(supabase: SupabaseClientType, job: MetricJob): Promise<[string, number | null]> {
  try {
    const { count, error } = await job.run(supabase);
    if (error) {
      console.error(`[admin/data-grid/summary] ${job.key} 조회 실패:`, error.message);
      return [job.key, null];
    }
    return [job.key, count];
  } catch (err) {
    console.error(`[admin/data-grid/summary] ${job.key} 조회 예외:`, err);
    return [job.key, null];
  }
}

export async function GET() {
  const supabase = await createClient();

  const entries: [string, number | null][] = [];
  for (let i = 0; i < JOBS.length; i += BATCH_SIZE) {
    const batch = JOBS.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(batch.map((job) => runJob(supabase, job)));
    entries.push(...batchResults);
  }

  return NextResponse.json(Object.fromEntries(entries));
}
