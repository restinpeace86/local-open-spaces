// [전국 주차장 표준데이터 수집](implementation/todo.md 개선사항1, 2026-10-15 지시):
// "전국주차장정보표준데이터.csv 파일 제공... 해당 데이터를 담을수 있는 테이블 생성
// (table 명 : parking_metadata)" — data.go.kr 표준데이터 CSV(18,939건)를 파싱해
// parking_metadata 테이블에 적재한다. seoul_public_parking_lots(서울 전용, 850개소)를
// 대체하는 전국 단위 마스터 테이블이다(2026-10-15-parking-metadata-national-dataset.sql).
//
// [노상 전면 제외](todo.md 핵심 규칙 2): "갓길 주차 등 안전과 유모차 동선에 치명적인
// '노상' 타입은 수집 단계에서 제거" — CSV 파싱 직후 바로 걸러낸다(DB CHECK 제약으로도
// 한 번 더 막혀 있지만, 애초에 보내지 않는다).
//
// [CSV 인코딩 — 실측 확인] 원본 파일은 EUC-KR(CP949)이다 — Node 내장 TextDecoder가
// 'euc-kr'을 지원해(실측 확인) 별도 iconv 라이브러리 없이 처리 가능.
//
// [주차장관리번호가 유일키 아님 — 실측 확인] 18,939건 중 고유값 17,798개뿐 — 서로 다른
// 지자체 데이터가 합쳐지며 완전히 다른 시설이 같은 번호를 쓰는 충돌이 1,141건 있다.
// 안정적인 자연키가 없으므로 이 스크립트는 매 실행마다 전체 교체(TRUNCATE + INSERT)
// 방식으로 동작한다 — 증분 upsert가 아니다.
import { pathToFileURL } from 'url';
import { readFileSync } from 'fs';
import { parse } from 'csv-parse/sync';
import { loadEnv } from '../lib/load-env.mjs';
import { createAdminClient } from './lib/supabase-admin.mjs';
import { toPointWKT } from './lib/geometry.mjs';
import { geocode, hasVworldApiKey } from './adapters/lib/vworld-geocoder.mjs';

loadEnv();
const SOURCE_KEY = 'PARKING_METADATA';
const CSV_PATH = 'metadata/전국주차장정보표준데이터.csv';
const UPSERT_CHUNK_SIZE = 500;
const GEOCODE_PACING_MS = 300;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toIntOrNull(value) {
  const n = Number(value);
  return value !== '' && Number.isFinite(n) ? Math.trunc(n) : null;
}

function toDateOrNull(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : null;
}

export function readParkingCsv(path = CSV_PATH) {
  const buf = readFileSync(path);
  const text = new TextDecoder('euc-kr').decode(buf);
  return parse(text, { columns: true, skip_empty_lines: true });
}

// [노상 제외] 반환값이 null이면 스킵 대상(노상 또는 필수 필드 누락).
export function transform(row) {
  const type = row['주차장유형'];
  if (type === '노상') return null;
  if (type !== '노외' && type !== '부설') return null;
  if (!row['주차장명']) return null;

  const lat = Number(row['위도']);
  const lng = Number(row['경도']);
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0;

  return {
    management_no: row['주차장관리번호'] || null,
    name: row['주차장명'],
    category_name: row['주차장구분'] || null,
    type_name: type,
    road_address: row['소재지도로명주소'] || null,
    lot_address: row['소재지지번주소'] || null,
    capacity: toIntOrNull(row['주차구획수']),
    fee_type: row['요금정보'] || null,
    base_minutes: toIntOrNull(row['주차기본시간']),
    base_fee: toIntOrNull(row['주차기본요금']),
    extra_unit_minutes: toIntOrNull(row['추가단위시간']),
    extra_unit_fee: toIntOrNull(row['추가단위요금']),
    day_pass_hours: toIntOrNull(row['1일주차권요금적용시간']),
    day_pass_fee: toIntOrNull(row['1일주차권요금']),
    monthly_fee: toIntOrNull(row['월정기권요금']),
    payment_methods: row['결제방법'] || null,
    notes: row['특기사항'] || null,
    management_org: row['관리기관명'] || null,
    phone: row['전화번호'] || null,
    has_disabled_parking: row['장애인전용주차구역보유여부'] === 'Y' ? true : row['장애인전용주차구역보유여부'] === 'N' ? false : null,
    data_reference_date: toDateOrNull(row['데이터기준일자']),
    provider_code: row['제공기관코드'] || null,
    provider_name: row['제공기관명'] || null,
    location: hasCoords ? toPointWKT(lng, lat) : null,
    // [주소만 보존 — 지오코딩 백필 대상 표시용] run()에서 location이 null인 행만
    // 주소 기준으로 백필을 시도한다(추측 좌표 생성 금지, 실패하면 null 유지).
    _geocodeAddress: hasCoords ? null : row['도로명주소'] || row['소재지도로명주소'] || row['소재지지번주소'] || null,
  };
}

export async function backfillMissingCoordsByAddress(rows) {
  let successCount = 0;
  for (const row of rows) {
    if (row.location || !row._geocodeAddress) continue;
    const result = await geocode(row._geocodeAddress);
    if (result) {
      row.location = toPointWKT(result.lng, result.lat);
      successCount += 1;
    }
    await sleep(GEOCODE_PACING_MS);
  }
  return successCount;
}

function stripInternalFields(row) {
  const { _geocodeAddress, ...rest } = row;
  return rest;
}

async function postPipelineLog(client, { status, errorMessage = null, metaData = null }) {
  try {
    const { error } = await client.from('pipeline_logs').insert({
      agent_name: SOURCE_KEY,
      status,
      error_message: errorMessage,
      meta_data: metaData,
      description: '전국주차장정보표준데이터(data.go.kr) 수집 — 노상 제외, parking_metadata 전체 교체',
      period: 'monthly',
    });
    if (error) console.error(`⚠️ pipeline_logs 기록 실패(배치 자체에는 영향 없음): ${error.message}`);
  } catch (err) {
    console.error(`⚠️ pipeline_logs 기록 중 예외(배치 자체에는 영향 없음): ${err.message}`);
  }
}

export async function run({ dryRun = false, csvPath = CSV_PATH } = {}) {
  console.log(`▶ 전국 주차장 표준데이터 수집 시작 (dry-run: ${dryRun})`);
  if (!dryRun && !hasVworldApiKey()) {
    console.warn('⚠️ VWORLD_API_KEY가 없어 좌표 없는 행의 지오코딩 백필을 건너뜁니다.');
  }

  const rawRows = readParkingCsv(csvPath);
  console.log(`✅ CSV 파싱 완료: ${rawRows.length}건`);

  const rows = rawRows.map(transform).filter(Boolean);
  const excludedCount = rawRows.length - rows.length;
  console.log(`  → 노상/유효하지 않은 행 제외: ${excludedCount}건, 수집 대상 ${rows.length}건`);

  const withCoords = rows.filter((r) => r.location).length;
  console.log(`  → 좌표 보유: ${withCoords}건 (${rows.length - withCoords}건 지오코딩 필요)`);

  if (dryRun) {
    console.log(JSON.stringify(rows.slice(0, 3).map(stripInternalFields), null, 2));
    return { sourceKey: SOURCE_KEY, count: rows.length, upserted: false, rawCount: rawRows.length };
  }

  const geocodedCount = hasVworldApiKey() ? await backfillMissingCoordsByAddress(rows) : 0;
  const withCoordsAfterGeocode = rows.filter((r) => r.location).length;
  console.log(`  → 지오코딩 백필: ${geocodedCount}건 성공 (좌표 보유 ${withCoords}건 → ${withCoordsAfterGeocode}건)`);

  const finalRows = rows.map(stripInternalFields);
  const client = createAdminClient();

  let insertedCount = 0;
  try {
    // [전체 교체] 안정적인 자연키가 없어(위 헤더 주석 참고) 증분 upsert 대신 매번
    // 전체를 비우고 새로 넣는다 — is_multi_child_discount/realtime_available_count
    // 등 다른 배치(개선사항2/3)가 채우는 컬럼은 이 전체교체로 함께 사라지므로,
    // 그 배치들은 이 ingest 이후에 실행되는 순서를 지켜야 한다(README/문서에 명시).
    const { error: truncateError } = await client.rpc('truncate_parking_metadata');
    if (truncateError) throw new Error(`parking_metadata 비우기 실패: ${truncateError.message}`);

    for (let i = 0; i < finalRows.length; i += UPSERT_CHUNK_SIZE) {
      const chunk = finalRows.slice(i, i + UPSERT_CHUNK_SIZE);
      const { error } = await client.from('parking_metadata').insert(chunk);
      if (error) throw new Error(`parking_metadata insert 실패: ${error.message}`);
      insertedCount += chunk.length;
    }
  } catch (err) {
    await postPipelineLog(client, { status: 'FAILED', errorMessage: err.message.slice(0, 500) });
    throw err;
  }

  console.log(`✅ Supabase(parking_metadata) 전체 교체 완료: ${insertedCount}건`);
  await postPipelineLog(client, {
    status: 'OK',
    metaData: {
      insertedCount,
      rawCount: rawRows.length,
      excludedCount,
      withCoordsBeforeGeocode: withCoords,
      withCoordsAfterGeocode,
      geocodedCount,
    },
  });

  return { sourceKey: SOURCE_KEY, count: insertedCount, upserted: true, rawCount: rawRows.length };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dryRun = process.argv.includes('--dry-run');
  run({ dryRun }).catch((err) => {
    console.error(`❌ 전국 주차장 표준데이터 수집 실패: ${err.message}`);
    process.exit(1);
  });
}
