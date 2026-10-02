// [스팟/이벤트 상세 "주변 주차장" 아코디언](2026-10-02 사용자 지시): 서울시 공영주차장
// 안내 정보(data.seoul.go.kr GetParkInfo)를 수집한다. open_spaces가 아니라 전용 테이블
// (seoul_public_parking_lots, 2026-10-02-nearby-parking-and-restaurant-amenities.sql)에
// 적재한다 — 공영주차장 자체는 "방문할 공간"(스팟픽 콘텐츠)이 아니라 다른 스팟/이벤트의
// 보조 정보라 BaseCollectorAdapter(open_spaces/events 전용)를 쓰지 않고, 이 파일만의
// 단순 fetch+upsert로 처리한다(제5장 제4조 기존 구조 우선이되, 테이블 성격이 달라 억지로
// 끼워맞추지 않는다 — homeplus-collect-lecture-list.py와 동일한 "완전 별도" 판단).
//
// [실측 확인](2026-10-02): 전체 2,189건(구획 포함) 중 고유 주차장은 850개뿐이고(노상
// 주차장 하나가 여러 구획으로 중복 등재됨), 그중 좌표가 있는 건 117개(13.8%)뿐이다.
// 사용자 지시: "주소 기반 지오코딩 보강 추가해.. vworld꺼 지오코딩 우리쓰고 있지않아?
// 기존에 쓰던거 써봐" — 이미 다른 어댑터(전국문화기반시설총람 등)가 쓰는
// vworld-geocoder.mjs(무료 국토교통부 공공API, 카카오 폴백 내장)를 그대로 재사용해
// 좌표 없는 행을 ADDR 기준으로 백필한다(추측 좌표 생성이 아니라 실제 지오코딩 결과만
// 사용 — 실패하면 null 유지).
import { pathToFileURL } from 'url';
import { loadEnv } from '../lib/load-env.mjs';
import { fetchWithTimeout } from './lib/fetch-with-timeout.mjs';
import { createAdminClient } from './lib/supabase-admin.mjs';
import { toPointWKT } from './lib/geometry.mjs';
import { geocode } from './adapters/lib/vworld-geocoder.mjs';

const env = loadEnv();
const SOURCE_KEY = 'SEOUL_PUBLIC_PARKING';
const PAGE_SIZE = 1000;
// 기존 enrichment 스크립트(gg-culture-location-enrichment.mjs)와 동일한 완급 조절 —
// VWorld에 문서화된 레이트리밋은 없지만, 수백 건을 연속 호출하는 배치이니 안전하게
// 약간의 간격을 둔다.
const GEOCODE_PACING_MS = 300;
const UPSERT_CHUNK_SIZE = 500;

function buildUrl(startIdx, endIdx) {
  return `http://openapi.seoul.go.kr:8088/${env.SEOUL_OPEN_DATA_KEY}/json/GetParkInfo/${startIdx}/${endIdx}/`;
}

async function fetchAllParkingLots() {
  const items = [];
  let startIdx = 1;
  let totalCount = Infinity;

  while (startIdx <= totalCount) {
    const endIdx = startIdx + PAGE_SIZE - 1;
    const res = await fetchWithTimeout(buildUrl(startIdx, endIdx));
    const text = await res.text();

    if (!res.ok) {
      throw new Error(`GetParkInfo 호출 실패 (HTTP ${res.status}): ${text.slice(0, 300)}`);
    }

    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`GetParkInfo 응답이 JSON이 아닙니다: ${text.slice(0, 300)}`);
    }

    const body = json.GetParkInfo;
    const result = body?.RESULT ?? json.RESULT;
    if (result && result.CODE !== 'INFO-000') {
      throw new Error(`GetParkInfo 에러 응답: ${result.CODE} ${result.MESSAGE}`);
    }

    totalCount = body?.list_total_count ?? 0;
    items.push(...(body?.row ?? []));
    startIdx += PAGE_SIZE;
  }

  return items;
}

// CHGD_FREE_SE: "Y"=유료, "N"=무료(실측 확인, 2026-10-02 샘플 조사).
export function transform(item) {
  if (!item.PKLT_CD || !item.PKLT_NM) return null;

  const lng = Number(item.LOT);
  const lat = Number(item.LAT);
  const hasCoords = Number.isFinite(lng) && Number.isFinite(lat) && lat !== 0 && lng !== 0;

  return {
    pklt_cd: item.PKLT_CD,
    name: item.PKLT_NM,
    address: item.ADDR || null,
    kind_name: item.PKLT_KND_NM || null,
    operation_type_name: item.OPER_SE_NM || null,
    tel: item.TELNO || null,
    total_capacity: Number.isFinite(Number(item.TPKCT)) ? Math.trunc(Number(item.TPKCT)) : null,
    is_paid: item.CHGD_FREE_SE === 'Y' ? true : item.CHGD_FREE_SE === 'N' ? false : null,
    base_fee: Number.isFinite(Number(item.PRK_CRG)) ? Math.trunc(Number(item.PRK_CRG)) : null,
    base_minutes: Number.isFinite(Number(item.PRK_HM)) ? Math.trunc(Number(item.PRK_HM)) : null,
    add_fee: Number.isFinite(Number(item.ADD_CRG)) ? Math.trunc(Number(item.ADD_CRG)) : null,
    add_minutes: Number.isFinite(Number(item.ADD_UNIT_TM_MNT)) ? Math.trunc(Number(item.ADD_UNIT_TM_MNT)) : null,
    weekday_open_time: item.WD_OPER_BGNG_TM || null,
    weekday_close_time: item.WD_OPER_END_TM || null,
    weekend_open_time: item.WE_OPER_BGNG_TM || null,
    weekend_close_time: item.WE_OPER_END_TM || null,
    realtime_info_status: item.PRK_NOW_INFO_PVSN_YN || null,
    realtime_info_status_name: item.PRK_NOW_INFO_PVSN_YN_NM || null,
    location: hasCoords ? toPointWKT(lng, lat) : null,
    last_data_sync_at: item.LAST_DATA_SYNC_TM ? new Date(item.LAST_DATA_SYNC_TM.replace(' ', 'T')).toISOString() : null,
  };
}

// [실측 확인](2026-10-02): 동일 pklt_cd가 노상주차장 구획 수만큼 중복 등재된다 — 그룹 내
// 좌표 있는 행이 하나라도 있으면 그걸 대표로 남긴다(단순 "마지막 값" 사용 시 좌표 보유율이
// 66.5%→13.8%로 급락하는 버그를 수정, 위 run() 상단 주석 참고).
export function dedupeByPkltCdPreferringCoords(rows) {
  const byCode = new Map();
  for (const row of rows) {
    const existing = byCode.get(row.pklt_cd);
    if (!existing || (!existing.location && row.location)) {
      byCode.set(row.pklt_cd, row);
    }
  }
  return [...byCode.values()];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// [좌표 없는 행 주소 지오코딩 백필](2026-10-02 사용자 지시) — rows를 직접 변형한다(제자리
// 수정, 반환값은 성공 건수). geocode()는 실패 시 null을 반환하도록 이미 안전하게
// 설계돼 있어(vworld-geocoder.mjs) 여기서는 성공한 것만 location을 채운다 — 실패한
// 행은 좌표 없이 그대로 두고(추측 좌표 생성 금지) 다음 실행에서 다시 시도된다.
export async function backfillMissingCoordsByAddress(rows) {
  let successCount = 0;
  for (const row of rows) {
    if (row.location || !row.address) continue;
    const result = await geocode(row.address);
    if (result) {
      row.location = toPointWKT(result.lng, result.lat);
      successCount += 1;
    }
    await sleep(GEOCODE_PACING_MS);
  }
  return successCount;
}

async function postPipelineLog(client, { status, errorMessage = null, metaData = null }) {
  try {
    const { error } = await client.from('pipeline_logs').insert({
      agent_name: SOURCE_KEY,
      status,
      error_message: errorMessage,
      meta_data: metaData,
      description: '서울시 공영주차장 안내 정보 수집(GetParkInfo) — open_spaces 아님, 주변 주차장 아코디언 전용',
      period: 'monthly',
    });
    if (error) {
      console.error(`⚠️ pipeline_logs 기록 실패(배치 자체에는 영향 없음): ${error.message}`);
    }
  } catch (err) {
    console.error(`⚠️ pipeline_logs 기록 중 예외(배치 자체에는 영향 없음): ${err.message}`);
  }
}

export async function run({ dryRun = false } = {}) {
  console.log(`▶ 서울시 공영주차장 정보 수집 시작 (dry-run: ${dryRun})`);
  const items = await fetchAllParkingLots();
  console.log(`✅ 서울 열린데이터광장 호출 성공: ${items.length}건 수신`);

  const transformedRows = items.map(transform).filter(Boolean);
  // [실측 확인](2026-10-02): 동일 PKLT_CD가 대량 중복 등재되는데(예: "봉천복개3 공영
  // 주차장" 1건이 56개 행), 이는 데이터 오류가 아니라 노상주차장 하나가 여러 구획
  // (segment)으로 나뉘어 구획별 좌표를 각각 보고하는 구조다(노상주차장이 노외주차장보다
  // 훨씬 많다는 1,000건 표본 결과와 일치). ON CONFLICT DO UPDATE는 "command cannot
  // affect row a second time"로 중복을 거부하므로 같은 pklt_cd는 대표 1개만 남겨야
  // 하는데, 단순히 "마지막 값"을 취하면 구획들 중 하필 좌표가 0.0인 행이 마지막일 때
  // 멀쩡한 좌표를 가진 다른 구획이 있었는데도 그 주차장 전체가 좌표 없음으로 저장되는
  // 버그가 생긴다(실측: 단순 중복 제거 시 좌표 보유율이 66.5%→13.8%로 급락). 그룹 내에
  // 좌표 있는 행이 하나라도 있으면 그걸 대표로 쓴다.
  const rows = dedupeByPkltCdPreferringCoords(transformedRows);
  const withCoords = rows.filter((r) => r.location).length;
  console.log(`  → 유효 데이터: ${rows.length}건(중복 제거 전 ${transformedRows.length}건, 좌표 보유 ${withCoords}건)`);

  if (dryRun) {
    console.log(JSON.stringify(rows.slice(0, 3), null, 2));
    return { sourceKey: SOURCE_KEY, count: rows.length, upserted: false, rawCount: items.length };
  }

  const geocodedCount = await backfillMissingCoordsByAddress(rows);
  const withCoordsAfterGeocode = rows.filter((r) => r.location).length;
  console.log(
    `  → 주소 지오코딩 백필: ${geocodedCount}건 성공 (좌표 보유 ${withCoords}건 → ${withCoordsAfterGeocode}건)`
  );

  const client = createAdminClient();
  let upsertedCount = 0;
  try {
    for (let i = 0; i < rows.length; i += UPSERT_CHUNK_SIZE) {
      const chunk = rows.slice(i, i + UPSERT_CHUNK_SIZE);
      const { error } = await client
        .from('seoul_public_parking_lots')
        .upsert(chunk, { onConflict: 'pklt_cd' });
      if (error) {
        throw new Error(`seoul_public_parking_lots upsert 실패: ${error.message}`);
      }
      upsertedCount += chunk.length;
    }
  } catch (err) {
    await postPipelineLog(client, { status: 'FAILED', errorMessage: err.message.slice(0, 500) });
    throw err;
  }

  console.log(`✅ Supabase(seoul_public_parking_lots) upsert 완료: ${upsertedCount}건`);
  await postPipelineLog(client, {
    status: 'OK',
    metaData: {
      parkingLotsCount: upsertedCount,
      withCoordsBeforeGeocode: withCoords,
      withCoordsAfterGeocode,
      geocodedCount,
      rawCount: items.length,
    },
  });

  return { sourceKey: SOURCE_KEY, count: upsertedCount, upserted: true, rawCount: items.length };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dryRun = process.argv.includes('--dry-run');
  run({ dryRun }).catch((err) => {
    console.error(`❌ 서울시 공영주차장 수집 실패: ${err.message}`);
    process.exit(1);
  });
}
