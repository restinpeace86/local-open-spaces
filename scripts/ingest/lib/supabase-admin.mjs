import { createClient } from '@supabase/supabase-js';
import { withRetry } from './retry.mjs';

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
    // [수집 파이프라인 자동 재시도 메커니즘](2026-08-28): DB 부하/네트워크 불안정으로 인한
    // 일시적 실패가 배치 전체를 실패시키지 않도록 재시도 가능한 에러만 짧은 백오프로 재시도한다.
    await withRetry(
      async () => {
        const { error } = await client.from(table).upsert(batch, { onConflict: 'external_id' });
        if (error) throw new Error(`${table} upsert 실패: ${error.message}`);
      },
      { label: `${table} upsert` }
    );
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
    await withRetry(
      async () => {
        const { error } = await client.from('raw_ingest_data').upsert(batch, { onConflict: 'source,source_id' });
        if (error) throw new Error(`raw_ingest_data upsert 실패: ${error.message}`);
      },
      { label: 'raw_ingest_data upsert' }
    );
  }

  return { count: dedupedRows.length };
}

// Decision 017(2026-08-25) 3항: 같은 수집 배치 안에 동일 external_id(SVCID)가 여러 번 나오면
// (upsertRows의 dedupeByExternalId처럼) 마지막 값이 무조건 이기는 게 아니라, 컬럼 단위로 값이
// 있는 쪽을 채택한다 — 앞선 항목에만 있던 컬럼값을 뒤 항목의 NULL이 되돌리지 않게 하기 위함.
// ''(빈 문자열)도 "값 없음"으로 취급한다(buildOpenSpaceRow의 address: address || '' 같은
// 폴백이 있어 단순 null/undefined 체크만으로는 부족함).
function isEmptyValue(value) {
  return value === null || value === undefined || value === '';
}

function dedupeByExternalIdMergeNulls(rows) {
  const byId = new Map();
  let duplicateCount = 0;

  for (const row of rows) {
    const existing = byId.get(row.external_id);
    if (!existing) {
      byId.set(row.external_id, row);
      continue;
    }

    duplicateCount += 1;
    const merged = { ...row };
    const keys = new Set([...Object.keys(existing), ...Object.keys(row)]);
    for (const key of keys) {
      if (isEmptyValue(merged[key]) && !isEmptyValue(existing[key])) {
        merged[key] = existing[key];
      }
    }
    byId.set(row.external_id, merged);
  }

  return { rows: [...byId.values()], duplicateCount };
}

// [긴급 아키텍처 개편] 2단계(RAW→Service 재가공) 전용 Safe UPSERT. 일반 upsertRows()는 충돌 시
// 새 값으로 무조건 덮어쓰지만, RAW 재가공 시점의 파서가 일부 컬럼을 못 채워 NULL로 보낼 수
// 있으므로 그 값으로 기존에 이미 채워진 실데이터를 되돌리면 안 된다 — 기존 행의 컬럼이 NULL일
// 때만 새 값으로 채우고, 이미 값이 있으면 보존한다(COALESCE(existing, incoming) 시맨틱).
// 컬럼 목록을 하드코딩한 SQL(RPC 함수)을 새로 만드는 대신(제5장 제6조/제4조 — 스키마가 계속
// 바뀌는데 SQL이 따로 있으면 컬럼 추가 때마다 둘 다 고쳐야 함) 기존 행을 조회해 JS에서
// 일반적으로 병합한다. 기존 25개 어댑터가 쓰는 run()/upsertRows()는 그대로 두고, 새로 만든
// runServiceTransformFromRaw()와 Decision 017의 다중 테이블 어댑터에서만 이 함수를 쓴다 —
// 기존 동작에 영향 없음.
// Decision 017(2026-08-25) 3항: 배치 내 중복(같은 external_id가 이번 수집 결과에 여러 번
// 등장)도 마지막 값 우선이 아니라 컬럼별 NULL 병합으로 처리하도록 dedupeByExternalIdMergeNulls로
// 교체했다. duplicateWithinBatch(배치 내 병합 건수)/mergedWithExisting(기존 DB 행과 병합된
// 건수)를 반환해 파이프라인 로그에 "중복/병합 건수"를 정밀 기록할 수 있게 한다.
// 실측 확인(2026-08-25, Decision 017 실적용 중): select().in('external_id', ids)는 GET 요청
// 쿼리스트링에 id 목록을 그대로 실어 보내는데, 500개(UPSERT_BATCH_SIZE)를 한 번에 넣으면
// "TypeError: fetch failed"로 요청 자체가 실패한다(400개는 성공, 500개는 실패 — URL 길이
// 제한). upsert()는 POST 본문이라 500건이 문제없어 UPSERT_BATCH_SIZE는 그대로 두고, 조회만
// 더 작은 단위로 쪼갠다.
const SELECT_LOOKUP_BATCH_SIZE = 200;

export async function upsertRowsSafeMerge(client, table, rows) {
  if (rows.length === 0) return { count: 0, duplicateWithinBatch: 0, mergedWithExisting: 0 };

  const { rows: dedupedRows, duplicateCount } = dedupeByExternalIdMergeNulls(rows);
  let totalCount = 0;
  let mergedWithExisting = 0;

  for (let i = 0; i < dedupedRows.length; i += UPSERT_BATCH_SIZE) {
    const batch = dedupedRows.slice(i, i + UPSERT_BATCH_SIZE);

    const existingById = new Map();
    for (let j = 0; j < batch.length; j += SELECT_LOOKUP_BATCH_SIZE) {
      const idsChunk = batch.slice(j, j + SELECT_LOOKUP_BATCH_SIZE).map((row) => row.external_id);
      const existingRows = await withRetry(
        async () => {
          const { data, error: selectError } = await client.from(table).select('*').in('external_id', idsChunk);
          if (selectError) throw new Error(`${table} 기존 행 조회 실패: ${selectError.message}`);
          return data;
        },
        { label: `${table} 기존 행 조회` }
      );
      for (const existingRow of existingRows ?? []) {
        existingById.set(existingRow.external_id, existingRow);
      }
    }

    const mergedBatch = batch.map((row) => {
      const existing = existingById.get(row.external_id);
      if (!existing) return row;

      mergedWithExisting += 1;
      const merged = { ...row };
      for (const key of Object.keys(row)) {
        if (existing[key] !== null && existing[key] !== undefined) {
          merged[key] = existing[key];
        }
      }
      return merged;
    });

    await withRetry(
      async () => {
        const { error } = await client.from(table).upsert(mergedBatch, { onConflict: 'external_id' });
        if (error) throw new Error(`${table} upsert 실패: ${error.message}`);
      },
      { label: `${table} upsert` }
    );
    totalCount += mergedBatch.length;
  }

  return { count: totalCount, duplicateWithinBatch: duplicateCount, mergedWithExisting };
}

// [open_spaces 성능 최적화 및 타임아웃 재발 방지](2026-08-28): 대량 배치(예: playground
// 82,373건) 직후 플래너 통계가 stale해져 바로 다음 open_spaces upsert가 statement timeout으로
// 실패하는 패턴이 이 세션에서 반복 확인됐다(scripts/migrations/2026-08-28-open-spaces-auto-analyze-rpc.sql
// 참고). 지금까지 수동으로 실행하던 `ANALYZE public.open_spaces;`를 배치 종료 시점에
// 자동으로 호출해 통계를 항상 최신으로 유지한다 — 매번 원인 재조사 없이 구조적으로 재발을 막는다.
export async function analyzeOpenSpaces(client) {
  const { error } = await client.rpc('analyze_open_spaces');
  if (error) throw new Error(`open_spaces ANALYZE 실패: ${error.message}`);
}

// [챗봇 개선](2026-09-04 사용자 지시) 3: get_sigungu_options()가 매 요청마다 open_spaces+
// events 전체(16만+ 행)를 다시 집계해 17.68초가 걸려 PostgREST 8초 타임아웃에 항상
// 걸리던 문제를 sigungu_options_cache 머티리얼라이즈드 뷰로 해결했다(scripts/migrations/
// 2026-09-04-sigungu-options-cache.sql). 이 참조 데이터는 새 지역이 수집되거나
// sigungu_name 정규화가 바뀔 때만 달라지므로, 매일 배치 마지막에 한 번씩만 갱신하면
// 충분하다(실시간 최신성 불필요).
export async function refreshSigunguOptionsCache(client) {
  const { error } = await client.rpc('refresh_sigungu_options_cache');
  if (error) throw new Error(`sigungu_options_cache 갱신 실패: ${error.message}`);
}

// [긴급 아키텍처 개편] RAW 레이어 재가공(2단계 단독 재실행)용 — 원본 API를 다시 호출하지 않고
// 이미 raw_ingest_data에 보존된 원본을 읽어온다.
export async function fetchRawIngestData(client, source) {
  const rows = [];
  const PAGE_SIZE = 1000;
  for (let from = 0; ; from += PAGE_SIZE) {
    const data = await withRetry(
      async () => {
        const { data: page, error } = await client
          .from('raw_ingest_data')
          .select('source_id, raw_payload, fetched_at')
          .eq('source', source)
          .range(from, from + PAGE_SIZE - 1);
        if (error) throw new Error(`raw_ingest_data 조회 실패: ${error.message}`);
        return page;
      },
      { label: 'raw_ingest_data 조회' }
    );
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  return rows;
}
