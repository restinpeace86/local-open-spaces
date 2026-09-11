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

// [GG_CULTURE_EVENTS 반복 upsert 실패 수정](2026-09-07): "events upsert 실패: new row
// for relation "events" violates check constraint
// "events_location_precision_consistency_check"" — 2026-09-06/09-07 배치 로그에서
// 반복 재현된 것을 실측 확인. 근본 원인: location과 location_precision은
// (open_spaces/events 둘 다) "UNKNOWN이면 location이 반드시 NULL, 그 외에는 반드시
// NOT NULL"이라는 쌍(pair) 정합성 제약이 있는데(2026-08-23/2026-08-25 마이그레이션),
// 위 컬럼별 독립 병합(모든 키를 하나씩 "값 있는 쪽 채택")은 이 두 컬럼을 서로 다른
// 소스에서 따로 가져올 수 있다 — 예: 기존 행이 location_precision='UNKNOWN'
// (location=NULL, 둘 다 자체적으로는 정합적)인 상태에서 새로 들어온 행이
// location_precision='CITY_APPROX'(location=유효 좌표, 역시 자체적으로 정합적)이면,
// 컬럼별 병합은 location_precision은 "값 있음"인 기존 'UNKNOWN' 문자열을 채택하면서
// location은 "값 없음(NULL)"인 기존 것 대신 새 행의 유효 좌표를 채택해버려 —
// location_precision='UNKNOWN' + location=유효좌표라는, 제약을 위반하는 조합이
// 만들어진다. 두 컬럼을 절대 따로 떼어 병합하면 안 되고 항상 같은 출처(둘 다 기존,
// 또는 둘 다 신규)에서 함께 가져와야 한다 — 정밀도가 더 나은(EXACT > CITY_APPROX >
// UNKNOWN) 쪽의 두 값을 통째로 채택한다(같으면 기존 값 유지, 안정적인 기본값).
const LOCATION_PRECISION_RANK = { EXACT: 2, CITY_APPROX: 1, UNKNOWN: 0 };

function hasLocationPrecisionPair(row) {
  return Object.prototype.hasOwnProperty.call(row, 'location_precision') && Object.prototype.hasOwnProperty.call(row, 'location');
}

// existing/incoming 두 후보 중 location_precision이 더 나은(랭크가 높은) 쪽의
// {location, location_precision} 쌍을 통째로 돌려준다. 랭크를 알 수 없는 값(예상 밖
// 문자열)은 가장 낮은 취급으로 방어한다.
function pickBetterLocationPair(existing, incoming) {
  const existingRank = LOCATION_PRECISION_RANK[existing.location_precision] ?? -1;
  const incomingRank = LOCATION_PRECISION_RANK[incoming.location_precision] ?? -1;
  const winner = incomingRank > existingRank ? incoming : existing;
  return { location: winner.location, location_precision: winner.location_precision };
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
    if (hasLocationPrecisionPair(existing) && hasLocationPrecisionPair(row)) {
      Object.assign(merged, pickBetterLocationPair(existing, row));
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

// [예약/운영 상태 필드는 항상 최신값으로 갱신](2026-09-12 사용자 지시): "서울형 키즈카페"
// 실측 확인 결과, 위 SafeMerge의 "기존 값이 있으면 보존" 규칙이 events.start_date/
// end_date/reservation_start_date/reservation_end_date/is_active/booking_status처럼
// *원본에서 주기적으로(회차가 바뀔 때마다) 실제로 달라지는* 필드에도 그대로 적용돼,
// 한 번 채워진 뒤로는 새 예약 회차가 열려도 옛날 값에 영원히 멈춰 있는 버그가 있었다
// (실측: 관악구 난곡동점 등 서울형 키즈카페 대부분이 2026-08-25에 적재된 2026-08-25~
// 09-07 회차에 고정된 채, 09-10 재수집 시점엔 원본이 이미 09-10~09-21 새 회차로
// 넘어갔는데도 갱신되지 않음). 이 필드들은 "이 자리가 지금 언제까지 유효한가"를
// 나타내므로 최신 수집 결과가 항상 이겨야 한다 — category_min/target_audience처럼
// 관리자가 수동으로 덮어쓸 수 있는 필드(_source 컬럼이 있는 것들)는 절대 포함하지
// 않는다(포함하면 관리자의 수동 분류 작업이 재수집 때마다 사라짐).
// open_spaces는 이런 "회차성" 시간 필드 자체가 없어(상시 시설 전제) 대상에서 제외했다
// (project/database_schema.md 실측 확인 — start_date/end_date/booking_status 등 없음).
const ALWAYS_REFRESH_FIELDS = {
  events: ['start_date', 'end_date', 'reservation_start_date', 'reservation_end_date', 'is_active', 'booking_status'],
};

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

    const alwaysRefreshFields = ALWAYS_REFRESH_FIELDS[table] ?? [];
    const mergedBatch = batch.map((row) => {
      const existing = existingById.get(row.external_id);
      if (!existing) return row;

      mergedWithExisting += 1;
      const merged = { ...row };
      for (const key of Object.keys(row)) {
        if (alwaysRefreshFields.includes(key)) {
          // 최신 수집 결과를 우선하되, 이번 재가공이 일시적으로 이 필드를 못 채웠을
          // 때(null/undefined)만 예외적으로 기존 값을 보존한다 — "항상 최신화"의
          // 목적은 원본이 실제로 바뀐 걸 반영하는 것이지, 일시적 파싱 실패로 멀쩡한
          // 기존 값을 지우는 것이 아니다.
          if (row[key] === null || row[key] === undefined) {
            merged[key] = existing[key];
          }
          continue;
        }
        if (existing[key] !== null && existing[key] !== undefined) {
          merged[key] = existing[key];
        }
      }
      // location/location_precision 쌍 정합성 보호 — dedupeByExternalIdMergeNulls
      // 위쪽의 상세 주석 참고. 여기서도 동일하게 두 컬럼을 절대 따로 병합하지 않는다.
      if (hasLocationPrecisionPair(existing) && hasLocationPrecisionPair(row)) {
        Object.assign(merged, pickBetterLocationPair(existing, row));
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

// [노출 중분류별 중복 스팟 검수 + 기존 그룹 자동 편입](2026-09-09 사용자 지시):
// "일단 중복되는 것에 대하여 대표스팟을 만들고 추후에 들어온 데이터들도 동일
// 좌표면 대표스팟내로 묶이는걸로 하자" — 관리자가 이미 확정한 그룹(open_spaces.
// group_id)의 좌표 30m 이내에 새로 들어온 미그룹 행을 자동으로 그 그룹에
// 편입한다(RPC 본문: 2026-09-09-spot-dedup-by-category-and-auto-group.sql).
export async function autoAssignOpenSpacesToExistingGroups(client) {
  const { data, error } = await client.rpc('auto_assign_open_spaces_to_existing_groups');
  if (error) throw new Error(`기존 그룹 자동 편입 실패: ${error.message}`);
  return data ?? 0;
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
