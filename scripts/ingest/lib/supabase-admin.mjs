import { createClient } from '@supabase/supabase-js';

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 없습니다.');
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

// 원본 데이터에 완전히 동일한 external_id(예: 동일 시설명+주소)를 가진 행이 두 건 이상
// 섞여 있으면 Postgres가 "ON CONFLICT DO UPDATE command cannot affect row a second time"로
// 배치 전체를 거부한다(실측 확인: GgEventsAdapter의 TBWTRWTRPLYHYDRDTAM 원본에 완전히 동일한
// 시설명+주소 레코드가 중복 등재된 사례, 2026-08-21). 같은 external_id는 같은 물리적 대상을
// 가리키므로 마지막 값으로 병합해 배치를 한 번만 보내도 안전하게 한다 — 이 방어는 어떤
// 어댑터든 원본에 완전 중복 레코드가 섞여 있을 수 있는 일반적인 경우라 공용 upsertRows에 둔다.
function dedupeByExternalId(rows) {
  const byId = new Map();
  for (const row of rows) {
    byId.set(row.external_id, row);
  }
  return [...byId.values()];
}

// 사용자 지시(2026-08-22) 전체 어댑터 정책 점검에서 발견한 버그: playground.mjs(놀이시설,
// 82,373건)처럼 대량 소스는 전체 행을 단일 upsert 호출 하나에 담아 보내면 요청이 지나치게
// 커져 응답 없이 멈춰버렸다(실측 확인 — 0건 적재 상태로 무한 대기). 배치로 나눠 순차 upsert한다.
const UPSERT_BATCH_SIZE = 500;

// project/database_schema.md: external_id 기준 Upsert
export async function upsertRows(client, table, rows) {
  if (rows.length === 0) return { count: 0 };

  const dedupedRows = dedupeByExternalId(rows);

  for (let i = 0; i < dedupedRows.length; i += UPSERT_BATCH_SIZE) {
    const batch = dedupedRows.slice(i, i + UPSERT_BATCH_SIZE);
    const { error } = await client.from(table).upsert(batch, { onConflict: 'external_id' });
    if (error) throw new Error(`${table} upsert 실패: ${error.message}`);
  }

  return { count: dedupedRows.length };
}

// [긴급 아키텍처 개편] RAW 레이어 — upsertRows와 동일한 이유(같은 배치 안에 동일 (source,
// source_id) 행이 중복되면 Postgres가 배치 전체를 거부함)로 동일 로직을 재사용하되, 여기서는
// "유효성 검증으로 드롭"이 절대 없어야 한다 — 완전히 동일한 source_id가 중복될 때만(같은
// 물리적 대상의 중복 레코드) 마지막 값으로 병합한다.
function dedupeBySourceId(rows) {
  const byId = new Map();
  for (const row of rows) {
    byId.set(row.source_id, row);
  }
  return [...byId.values()];
}

// rawRows: [{ sourceId, payload }] — 원본 API 응답에서 필터링/가공 없이 그대로 뽑아낸 쌍.
// source는 어댑터의 sourceKey를 그대로 쓴다(예: 'SEOUL_YEYAK') — 이미 각 어댑터마다 고유하게
// 부여돼 있는 식별자라 별도의 새 이름 체계를 만들지 않는다(제5장 제4조 기존 구조 우선).
export async function upsertRawIngestData(client, source, rawRows) {
  if (rawRows.length === 0) return { count: 0 };

  const fetchedAt = new Date().toISOString();
  const rows = rawRows.map(({ sourceId, payload }) => ({
    source,
    source_id: sourceId,
    fetched_at: fetchedAt,
    raw_payload: payload,
  }));
  const dedupedRows = dedupeBySourceId(rows);

  for (let i = 0; i < dedupedRows.length; i += UPSERT_BATCH_SIZE) {
    const batch = dedupedRows.slice(i, i + UPSERT_BATCH_SIZE);
    const { error } = await client.from('raw_ingest_data').upsert(batch, { onConflict: 'source,source_id' });
    if (error) throw new Error(`raw_ingest_data upsert 실패: ${error.message}`);
  }

  return { count: dedupedRows.length };
}

// [긴급 아키텍처 개편] 2단계(RAW→Service 재가공) 전용 Safe UPSERT. 일반 upsertRows()는 충돌 시
// 새 값으로 무조건 덮어쓰지만, RAW 재가공 시점의 파서가 일부 컬럼을 못 채워 NULL로 보낼 수
// 있으므로 그 값으로 기존에 이미 채워진 실데이터를 되돌리면 안 된다 — 기존 행의 컬럼이 NULL일
// 때만 새 값으로 채우고, 이미 값이 있으면 보존한다(COALESCE(existing, incoming) 시맨틱).
// 컬럼 목록을 하드코딩한 SQL(RPC 함수)을 새로 만드는 대신(제5장 제6조/제4조 — 스키마가 계속
// 바뀌는데 SQL이 따로 있으면 컬럼 추가 때마다 둘 다 고쳐야 함) 기존 행을 조회해 JS에서
// 일반적으로 병합한다. 기존 25개 어댑터가 쓰는 run()/upsertRows()는 그대로 두고, 새로 만든
// runServiceTransformFromRaw()에서만 이 함수를 쓴다 — 기존 동작에 영향 없음.
export async function upsertRowsSafeMerge(client, table, rows) {
  if (rows.length === 0) return { count: 0 };

  const dedupedRows = dedupeByExternalId(rows);
  let totalCount = 0;

  for (let i = 0; i < dedupedRows.length; i += UPSERT_BATCH_SIZE) {
    const batch = dedupedRows.slice(i, i + UPSERT_BATCH_SIZE);
    const externalIds = batch.map((row) => row.external_id);

    const { data: existingRows, error: selectError } = await client
      .from(table)
      .select('*')
      .in('external_id', externalIds);
    if (selectError) throw new Error(`${table} 기존 행 조회 실패: ${selectError.message}`);

    const existingById = new Map((existingRows ?? []).map((row) => [row.external_id, row]));

    const mergedBatch = batch.map((row) => {
      const existing = existingById.get(row.external_id);
      if (!existing) return row;

      const merged = { ...row };
      for (const key of Object.keys(row)) {
        if (existing[key] !== null && existing[key] !== undefined) {
          merged[key] = existing[key];
        }
      }
      return merged;
    });

    const { error } = await client.from(table).upsert(mergedBatch, { onConflict: 'external_id' });
    if (error) throw new Error(`${table} upsert 실패: ${error.message}`);
    totalCount += mergedBatch.length;
  }

  return { count: totalCount };
}

// [긴급 아키텍처 개편] RAW 레이어 재가공(2단계 단독 재실행)용 — 원본 API를 다시 호출하지 않고
// 이미 raw_ingest_data에 보존된 원본을 읽어온다.
export async function fetchRawIngestData(client, source) {
  const rows = [];
  const PAGE_SIZE = 1000;
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await client
      .from('raw_ingest_data')
      .select('source_id, raw_payload, fetched_at')
      .eq('source', source)
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`raw_ingest_data 조회 실패: ${error.message}`);
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  return rows;
}
