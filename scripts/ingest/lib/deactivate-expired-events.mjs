// [0순위 우선 요청] 만료 데이터 자동 비활성화(2026-08-26, 최초 도입 시 유예 2일).
// [행사 데이터 수집/정제 파이프라인 및 홈 피드 필터링 개선](2026-08-27) 사용자 지시 1번으로
// 유예 기간을 완전히 없앴다 — "행사 종료일(end_date) 기준 단 하루만 지나도(D+1일 시점)
// is_active=true였던 상태를 즉시 false로 전환"해야 하므로, 유예 없이(EXPIRY_GRACE_DAYS=0)
// `end_date < CURRENT_DATE`인 행을 바로 비활성화한다 — 종료일 당일(D+0)까지는 그대로
// 노출되고, 그다음 날(D+1) 첫 배치부터 즉시 비활성화된다.
// 시뮬레이션(docs/category-mapping-keywords-draft.md 4절, 읽기 전용 COUNT로 사전 검증)에서
// 확인한 대로 이미 is_active=false인 행에는 영향이 없고, end_date IS NULL인 행은 비교
// 자체가 불가능해 자동으로 대상에서 제외된다(WHERE 조건에 end_date가 들어가면 NULL은
// 조건을 만족하지 못함 — Postgres 3치 논리).
//
// 오늘/컷오프 날짜는 이 프로젝트 전반에서 이미 쓰는 관례(get-home-feed.ts 등)와 동일하게
// UTC 기준 `new Date().toISOString().slice(0, 10)`로 계산한다 — Supabase Postgres도 기본
// UTC라 CURRENT_DATE와 동일한 날짜를 가리킨다.
const EXPIRY_GRACE_DAYS = 0;

export function computeExpiryCutoffDate(now = new Date()) {
  const cutoff = new Date(now);
  cutoff.setUTCHours(0, 0, 0, 0);
  cutoff.setUTCDate(cutoff.getUTCDate() - EXPIRY_GRACE_DAYS);
  return cutoff.toISOString().slice(0, 10);
}

// [만료 비활성화 누락 백로그 수정](2026-09-12 사용자 지시: "표준 중분류가 미지정NULL
// 체크 된거는 활성 상태가 is_active true로 된게 안먹던데? 아주 옛날 이벤트들도 다
// 나오고 있어"): 실측 확인 결과 필터 로직 버그가 아니라 데이터 자체가 잘못돼 있었다 —
// 이 함수가 원래 `.update(...).select('id')`를 딱 한 번만 호출했는데, PostgREST의
// max_rows(supabase/config.toml, 1000)가 `Prefer: return=representation`이 붙는
// UPDATE...RETURNING에도 그대로 적용돼(SELECT 전용이 아님) 매일 최대 1000건만
// 비활성화되고 나머지는 그대로 is_active=true로 남았다. 매일 새로 만료되는 행이
// 1000건보다 많으면 백로그가 계속 쌓이기만 해, 실측 시점엔 무려 21,453건이 밀려
// 있었다(end_date가 2016년인 행도 is_active=true로 남아 있었음).
//
// [배치를 명시적으로 작게 쪼갠다] 1000건 단위(암묵적 max_rows 캡)로 한 번에 UPDATE+
// RETURNING을 시도하면, `end_date < cutoff AND is_active = true` 조건에 효율적인
// 인덱스가 없어(idx_events_dates는 (start_date, end_date) 복합이라 이 조건엔 안 맞고,
// is_active 단독 인덱스도 없음) 실측 시 statement timeout이 났다. 그래서 이 조건에
// 맞는 id를 소량(BATCH_SIZE)만 먼저 SELECT한 뒤, 그 id 목록으로만 UPDATE한다(id는
// PK 인덱스로 바로 찾아지므로 빠름) — 다른 대량 처리 코드(예: supabase-admin.mjs의
// SELECT_LOOKUP_BATCH_SIZE)와 동일한 관례.
const BATCH_SIZE = 200;
const MAX_ITERATIONS = 300; // 300 × 200건 = 6만 건까지 안전하게 처리(현재 전체 events가 약 2.9만 건).

// 반환값: { cutoffDate, deactivatedCount }. count는 실제로 바뀐 행만 정확히 센다
// (추정치 아님) — 여러 배치에 걸쳐 누적한다.
export async function deactivateExpiredEvents(client, now = new Date()) {
  const cutoffDate = computeExpiryCutoffDate(now);

  let deactivatedCount = 0;
  for (let i = 0; i < MAX_ITERATIONS; i += 1) {
    const { data: idRows, error: selectError } = await client
      .from('events')
      .select('id')
      .lt('end_date', cutoffDate)
      .eq('is_active', true)
      .limit(BATCH_SIZE);

    if (selectError) throw new Error(`만료 이벤트 조회 실패: ${selectError.message}`);

    const ids = (idRows ?? []).map((row) => row.id);
    if (ids.length === 0) break;

    const { error: updateError } = await client.from('events').update({ is_active: false }).in('id', ids);

    if (updateError) throw new Error(`만료 이벤트 비활성화 실패: ${updateError.message}`);

    deactivatedCount += ids.length;
    if (ids.length < BATCH_SIZE) break;
  }

  return { cutoffDate, deactivatedCount };
}
