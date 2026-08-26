// [0순위 우선 요청] 만료 데이터 자동 비활성화(2026-08-26): "현재일 기준 2일 이상 지난
// 데이터들(end_date < CURRENT_DATE - INTERVAL '2 DAY')"을 is_active=false로 전환한다.
// 시뮬레이션(docs/category-mapping-keywords-draft.md 4절, 읽기 전용 COUNT로 사전 검증)에서
// 확인한 대로 이미 is_active=false인 행에는 영향이 없고, end_date IS NULL인 행은 비교
// 자체가 불가능해 자동으로 대상에서 제외된다(WHERE 조건에 end_date가 들어가면 NULL은
// 조건을 만족하지 못함 — Postgres 3치 논리).
//
// 오늘/컷오프 날짜는 이 프로젝트 전반에서 이미 쓰는 관례(get-home-feed.ts 등)와 동일하게
// UTC 기준 `new Date().toISOString().slice(0, 10)`로 계산한다 — Supabase Postgres도 기본
// UTC라 CURRENT_DATE와 동일한 날짜를 가리킨다.
const EXPIRY_GRACE_DAYS = 2;

export function computeExpiryCutoffDate(now = new Date()) {
  const cutoff = new Date(now);
  cutoff.setUTCHours(0, 0, 0, 0);
  cutoff.setUTCDate(cutoff.getUTCDate() - EXPIRY_GRACE_DAYS);
  return cutoff.toISOString().slice(0, 10);
}

// 반환값: { cutoffDate, deactivatedCount }. count는 supabase-js의 update().select()로
// 실제로 바뀐 행만 돌려받아 정확히 센다(추정치 아님).
export async function deactivateExpiredEvents(client, now = new Date()) {
  const cutoffDate = computeExpiryCutoffDate(now);

  const { data, error } = await client
    .from('events')
    .update({ is_active: false })
    .lt('end_date', cutoffDate)
    .eq('is_active', true)
    .select('id');

  if (error) throw new Error(`만료 이벤트 비활성화 실패: ${error.message}`);

  return { cutoffDate, deactivatedCount: (data ?? []).length };
}
