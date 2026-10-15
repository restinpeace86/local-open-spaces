// [서울시 시영주차장 실시간 주차대수 연동](implementation/todo.md 개선사항2,
// 2026-10-15): "서울시 시영주차장 실시간 주차대수 정보 데이터 api 연동 및 관리
// (실시간 데이터 주기 정책 수립 필요)" — data.seoul.go.kr GetParkingInfo.
//
// [GetParkInfo(안내정보)와 다른 API — 실측 확인] 개선사항1에서 쓰는 전국
// 표준데이터/과거 GetParkInfo는 요금·운영시간 등 정적 정보뿐이다. 이 API
// (GetParkingInfo)는 서울시 "시영" 주차장 122개소만 다루고, 그중 56개소만
// `PRK_TYPE_NM='노외 주차장'`이다(나머지 66개소는 노상 주차장 — parking_
// metadata가 노상을 전면 제외하므로 이 스크립트도 그대로 건너뛴다).
//
// [NOW_PRK_VHCL_CNT는 "현재 주차된 차량 수"(점유), 가능 면수가 아님 — 실측
// 확인] 필드명 그대로 "현재 주차 차량 수"다. 사용자에게 보여줄 "주차 가능
// 면수"는 `TPKCT(총 주차면수) - NOW_PRK_VHCL_CNT`로 직접 계산한다.
//
// [매칭 방식 — 좌표 없이 이름+주소로 매칭] 이 API는 좌표를 안 준다(실측
// 확인) — PostGIS 반경 매칭이 불가능해, match-parking-to-spots.mjs와 동일한
// 결정적 이름 유사도(normalizeFacilityName/nameSimilarity)를 재사용하되,
// 추가로 "구" 토큰이 양쪽에 공통으로 있어야만 후보로 인정한다(2026-10-15
// "매봉산" 사례에서 배운 교훈 — 흔한 이름이 다른 구의 다른 시설과 잘못
// 묶이는 것을 막는 안전장치).
//
// [수집 주기 제안 — 10분](todo.md가 명시적으로 요청한 정책 결정, 2026-10-15)
// 응답 데이터 자체의 `PRK_STTS_NM`이 "현재~20분이내 연계데이터 존재"라고
// 명시한다 — 서울시 백엔드 자체 갱신 주기가 최대 20분이라, 그보다 더 자주
// 긁어도 새 값이 안 나올 수 있다(낭비). 이 프로젝트의 기존 "빈번한 반경
// 감시"류 배치(문화센터 찜 상태감시 5분)보다는 느슨하게, 그렇다고 20분
// 경계에 바로 붙지도 않게 중간인 10분으로 제안 — 로컬 PC 작업 스케줄러로
// 등록해야 한다(이 API 호출 자체는 가볍지만 "자주 도는 배치는 로컬 PC"
// 관례를 따름, 문화센터 사례와 동일).
import { pathToFileURL } from 'url';
import { loadEnv } from '../lib/load-env.mjs';
import { createAdminClient } from './lib/supabase-admin.mjs';
import { fetchWithTimeout } from './lib/fetch-with-timeout.mjs';
import { normalizeFacilityName, nameSimilarity } from './match-parking-to-spots.mjs';

const env = loadEnv();
const SOURCE_KEY = 'PARKING_REALTIME_SEOUL';
const MIN_SIMILARITY = 0.5;

function extractGu(address) {
  const m = address?.match(/([가-힣]+구)/);
  return m ? m[1] : null;
}

function buildUrl(startIdx, endIdx) {
  return `http://openapi.seoul.go.kr:8088/${env.SEOUL_OPEN_DATA_KEY}/json/GetParkingInfo/${startIdx}/${endIdx}/`;
}

async function fetchAllRealtimeRows() {
  const items = [];
  let startIdx = 1;
  let totalCount = Infinity;
  const pageSize = 200;

  while (startIdx <= totalCount) {
    const endIdx = startIdx + pageSize - 1;
    const res = await fetchWithTimeout(buildUrl(startIdx, endIdx));
    const text = await res.text();
    if (!res.ok) throw new Error(`GetParkingInfo 호출 실패 (HTTP ${res.status}): ${text.slice(0, 300)}`);

    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`GetParkingInfo 응답이 JSON이 아닙니다: ${text.slice(0, 300)}`);
    }

    const body = json.GetParkingInfo;
    const result = body?.RESULT ?? json.RESULT;
    if (result && result.CODE !== 'INFO-000') {
      throw new Error(`GetParkingInfo 에러 응답: ${result.CODE} ${result.MESSAGE}`);
    }

    totalCount = body?.list_total_count ?? 0;
    items.push(...(body?.row ?? []));
    startIdx += pageSize;
  }

  return items;
}

// [노상 전면 제외, 현재 주차 가능 면수 계산](위 헤더 주석 참고) null이면
// 스킵 대상(노상이거나 필수 필드 누락).
export function transform(row) {
  if (row.PRK_TYPE_NM !== '노외 주차장') return null;
  if (!row.PKLT_NM || !row.ADDR) return null;

  // [빈 문자열 함정 — 실측 발견] `Number('')`는 `NaN`이 아니라 `0`이라
  // `Number.isFinite()` 검사를 그냥 통과해버린다 — 값 자체가 비어있는지
  // 먼저 확인해야 한다(단위 테스트로 직접 발견).
  const hasCapacity = row.TPKCT !== '' && row.TPKCT !== null && row.TPKCT !== undefined;
  const hasOccupied =
    row.NOW_PRK_VHCL_CNT !== '' && row.NOW_PRK_VHCL_CNT !== null && row.NOW_PRK_VHCL_CNT !== undefined;
  const capacity = hasCapacity ? Number(row.TPKCT) : NaN;
  const occupied = hasOccupied ? Number(row.NOW_PRK_VHCL_CNT) : NaN;
  const available =
    Number.isFinite(capacity) && Number.isFinite(occupied) ? Math.max(0, Math.round(capacity - occupied)) : null;

  return {
    name: row.PKLT_NM,
    address: row.ADDR,
    gu: extractGu(row.ADDR),
    availableCount: available,
    updatedAt: row.NOW_PRK_VHCL_UPDT_TM ? new Date(row.NOW_PRK_VHCL_UPDT_TM.replace(' ', 'T')).toISOString() : null,
  };
}

// 서울 소재 노외 주차장 중, 같은 "구" 토큰이 있고 이름 유사도가 임계값
// 이상인 것만 후보로 남겨 가장 높은 것 하나를 선택한다(흔한 이름이 다른
// 구의 시설과 잘못 묶이는 사고 방지 — "매봉산" 사례 참고).
export function findBestParkingMatch(realtimeRow, candidates) {
  let best = null;
  for (const candidate of candidates) {
    const candidateGu = extractGu(candidate.road_address) ?? extractGu(candidate.lot_address);
    if (!candidateGu || candidateGu !== realtimeRow.gu) continue;
    const similarity = nameSimilarity(realtimeRow.name, candidate.name);
    if (similarity < MIN_SIMILARITY) continue;
    if (!best || similarity > best.similarity) {
      best = { id: candidate.id, similarity };
    }
  }
  return best;
}

async function postPipelineLog(client, { status, errorMessage = null, metaData = null }) {
  try {
    const { error } = await client.from('pipeline_logs').insert({
      agent_name: SOURCE_KEY,
      status,
      error_message: errorMessage,
      meta_data: metaData,
      description: '서울시 시영주차장 실시간 주차대수(GetParkingInfo) 수집 — parking_metadata.realtime_available_count 갱신',
      period: 'daily',
    });
    if (error) console.error(`⚠️ pipeline_logs 기록 실패(배치 자체에는 영향 없음): ${error.message}`);
  } catch (err) {
    console.error(`⚠️ pipeline_logs 기록 중 예외(배치 자체에는 영향 없음): ${err.message}`);
  }
}

export async function run({ dryRun = false } = {}) {
  console.log(`▶ 서울시 시영주차장 실시간 주차대수 수집 시작 (dry-run: ${dryRun})`);

  const rawRows = await fetchAllRealtimeRows();
  console.log(`✅ API 응답: ${rawRows.length}건`);

  const rows = rawRows.map(transform).filter(Boolean);
  console.log(`  → 노상 제외 후 노외 대상: ${rows.length}건`);

  const client = createAdminClient();
  const { data: candidates, error: fetchError } = await client
    .from('parking_metadata')
    .select('id, name, road_address, lot_address')
    .eq('type_name', '노외')
    .or('road_address.ilike.%서울%,lot_address.ilike.%서울%');
  if (fetchError) throw new Error(`parking_metadata 후보 조회 실패: ${fetchError.message}`);
  console.log(`  → 매칭 후보(서울 소재 노외): ${candidates.length}건`);

  const matches = [];
  for (const row of rows) {
    const best = findBestParkingMatch(row, candidates);
    if (best) matches.push({ parkingId: best.id, availableCount: row.availableCount, updatedAt: row.updatedAt, name: row.name });
  }
  console.log(`  → 매칭 성공: ${matches.length}건 (매칭 실패 ${rows.length - matches.length}건)`);

  if (dryRun) {
    console.log(JSON.stringify(matches.slice(0, 5), null, 2));
    return { sourceKey: SOURCE_KEY, count: matches.length, upserted: false };
  }

  let updatedCount = 0;
  try {
    for (const match of matches) {
      const { error } = await client
        .from('parking_metadata')
        .update({ realtime_available_count: match.availableCount, realtime_updated_at: match.updatedAt })
        .eq('id', match.parkingId);
      if (error) throw new Error(`realtime_available_count 갱신 실패(${match.name}): ${error.message}`);
      updatedCount += 1;
    }
  } catch (err) {
    await postPipelineLog(client, { status: 'FAILED', errorMessage: err.message.slice(0, 500) });
    throw err;
  }

  console.log(`✅ parking_metadata 실시간 현황 갱신 완료: ${updatedCount}건`);
  await postPipelineLog(client, {
    status: 'OK',
    metaData: { rawCount: rawRows.length, noeoiCount: rows.length, matchedCount: matches.length, updatedCount },
  });

  return { sourceKey: SOURCE_KEY, count: updatedCount, upserted: true };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dryRun = process.argv.includes('--dry-run');
  run({ dryRun }).catch((err) => {
    console.error(`❌ 서울시 시영주차장 실시간 주차대수 수집 실패: ${err.message}`);
    process.exit(1);
  });
}
