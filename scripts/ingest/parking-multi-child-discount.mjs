// [주차장 다자녀 할인 혜택 연동](implementation/todo.md 개선사항3, 2026-10-15):
// 경기도(마이데이터통합플랫폼_다자녀카드수혜정보.csv, 좌표 포함)와 서울시(다둥이
// 행복카드 협력업체 정보.csv, 주소만)의 "공영주차장" 다자녀 할인 레코드를
// parking_metadata에 매칭해 is_multi_child_discount/discount_info를 채운다.
//
// [별도 "다자녀혜택" 테이블 대신 parking_metadata에 직접 필드 — 설계 변경](
// 2026-10-15) 원 명세는 별도 테이블 + FK 관계형 매핑을 제안했지만, 실제
// 데이터는 "주차장 1곳 : 다자녀 할인 레코드 1건"으로 1:1에 가깝고(경기도
// CSV도 대상자명='다자녀가정'으로 필터링하면 주차장당 중복이 사실상 없음),
// 개선사항1에서 이미 parking_metadata에 이 용도의 컬럼(is_multi_child_
// discount/discount_info)을 선점해뒀다 — 별도 테이블을 또 만들면 "주차장
// 정보를 가진 테이블이 여러개"(todo.md가 명시적으로 피하라고 한 상태)가
// 재발한다(제5장 제4조 기존 구조 우선). 향후 "한 주차장이 여러 종류의
// 혜택을 동시에 가짐" 같은 요구가 생기면 그때 별도 테이블로 확장 가능 —
// 지금은 Phase 1 범위를 넘지 않는다(제5장 제7조).
//
// [경기도 — 좌표 있음, 반경 매칭] CSV의 "위경도좌표" 컬럼이 이미
// "POINT (lng lat)" WKT 형식이라 바로 파싱해 반경검색(search_parking_
// metadata_near RPC)에 쓴다.
// [서울시 — 좌표 없음, VWorld 지오코딩 선행] 주소만 있어 개선사항1과 동일한
// vworld-geocoder.mjs로 먼저 좌표를 구한 뒤 같은 반경검색을 쓴다.
//
// [매칭 — 반경 50m + 이름 유사도, match-parking-to-spots.mjs 재사용] 부설
// 매칭과 동일한 보수적 임계값(0.5)을 그대로 쓴다 — 오탐(엉뚱한 주차장에
// 할인 뱃지가 붙는 것)이 미탐보다 나쁘다는 동일한 판단.
import { pathToFileURL } from 'url';
import { readFileSync } from 'fs';
import { parse } from 'csv-parse/sync';
import { loadEnv } from '../lib/load-env.mjs';
import { createAdminClient } from './lib/supabase-admin.mjs';
import { geocode, hasVworldApiKey } from './adapters/lib/vworld-geocoder.mjs';
import { nameSimilarity } from './match-parking-to-spots.mjs';

loadEnv();
const SOURCE_KEY = 'PARKING_MULTI_CHILD_DISCOUNT';
const GYEONGGI_CSV_PATH = 'metadata/마이데이터통합플랫폼_다자녀카드수혜정보.csv';
const SEOUL_CSV_PATH = 'metadata/서울시 다둥이 행복카드 협력업체 정보.csv';
const MATCH_RADIUS_METERS = 50;
const MIN_SIMILARITY = 0.5;
const GEOCODE_PACING_MS = 300;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readCsv(path) {
  const buf = readFileSync(path);
  const text = new TextDecoder('euc-kr').decode(buf);
  return parse(text, { columns: true, skip_empty_lines: true });
}

// "POINT (127.0837786 36.9937654)" → { lng, lat }. 형식이 다르면 null(추측 금지).
export function parseWktPoint(value) {
  const m = value?.match(/POINT\s*\(\s*([\d.]+)\s+([\d.]+)\s*\)/);
  if (!m) return null;
  return { lng: Number(m[1]), lat: Number(m[2]) };
}

export function buildGyeonggiCandidates(rows) {
  return rows
    .filter((r) => r['사용처구분'] === '공영주차장' && r['대상자명'] === '다자녀가정')
    .map((r) => {
      const point = parseWktPoint(r['위경도좌표']);
      if (!point) return null;
      const discountParts = [r['할인율'], r['혜택기타사항']].filter(Boolean);
      return {
        name: r['혜택명'],
        lng: point.lng,
        lat: point.lat,
        discountInfo: discountParts.join(' · ') || null,
      };
    })
    .filter(Boolean);
}

export function buildSeoulCandidates(rows) {
  return rows
    .filter((r) => r['업종'] === '공영주차장')
    .map((r) => ({
      name: r['업체명'],
      address: r['주소'],
      discountInfo: r['지원혜택']?.trim() || null,
    }));
}

async function geocodeSeoulCandidates(candidates) {
  const geocoded = [];
  let successCount = 0;
  for (const candidate of candidates) {
    const result = await geocode(`서울특별시 ${candidate.address}`);
    if (result) {
      geocoded.push({ ...candidate, lng: result.lng, lat: result.lat });
      successCount += 1;
    }
    await sleep(GEOCODE_PACING_MS);
  }
  return { geocoded, successCount };
}

export async function findBestMatch(client, candidate) {
  const { data: nearby, error } = await client.rpc('search_parking_metadata_near', {
    target_lng: candidate.lng,
    target_lat: candidate.lat,
    radius_meters: MATCH_RADIUS_METERS,
  });
  if (error) throw new Error(`search_parking_metadata_near 호출 실패: ${error.message}`);

  let best = null;
  for (const row of nearby) {
    const similarity = nameSimilarity(candidate.name, row.name);
    if (similarity < MIN_SIMILARITY) continue;
    if (!best || similarity > best.similarity) {
      best = { id: row.id, similarity };
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
      description: '주차장 다자녀 할인 혜택(경기도+서울시) 매칭 — parking_metadata.is_multi_child_discount/discount_info 갱신',
      period: 'monthly',
    });
    if (error) console.error(`⚠️ pipeline_logs 기록 실패(배치 자체에는 영향 없음): ${error.message}`);
  } catch (err) {
    console.error(`⚠️ pipeline_logs 기록 중 예외(배치 자체에는 영향 없음): ${err.message}`);
  }
}

export async function run({ dryRun = false } = {}) {
  console.log(`▶ 주차장 다자녀 할인 혜택 매칭 시작 (dry-run: ${dryRun})`);

  const gyeonggiRows = readCsv(GYEONGGI_CSV_PATH);
  const gyeonggiCandidates = buildGyeonggiCandidates(gyeonggiRows);
  console.log(`✅ 경기도 CSV: ${gyeonggiRows.length}건 → 필터+좌표 있음 ${gyeonggiCandidates.length}건`);

  const seoulRows = readCsv(SEOUL_CSV_PATH);
  const seoulRaw = buildSeoulCandidates(seoulRows);
  console.log(`✅ 서울시 CSV: ${seoulRows.length}건 → 필터 ${seoulRaw.length}건`);

  let seoulCandidates = [];
  if (!dryRun && hasVworldApiKey()) {
    const { geocoded, successCount } = await geocodeSeoulCandidates(seoulRaw);
    seoulCandidates = geocoded;
    console.log(`  → 서울시 주소 지오코딩: ${successCount}/${seoulRaw.length}건 성공`);
  } else if (dryRun) {
    console.log('  → dry-run이라 서울시 지오코딩은 건너뜀(비용 절감)');
  } else {
    console.warn('⚠️ VWORLD_API_KEY가 없어 서울시 후보는 건너뜁니다.');
  }

  const allCandidates = [...gyeonggiCandidates, ...seoulCandidates];

  if (dryRun) {
    console.log(JSON.stringify(allCandidates.slice(0, 3), null, 2));
    return { sourceKey: SOURCE_KEY, count: allCandidates.length, upserted: false };
  }

  const client = createAdminClient();
  let matchedCount = 0;
  let updatedCount = 0;
  try {
    for (const candidate of allCandidates) {
      const match = await findBestMatch(client, candidate);
      if (!match) continue;
      matchedCount += 1;
      const { error } = await client
        .from('parking_metadata')
        .update({ is_multi_child_discount: true, discount_info: candidate.discountInfo })
        .eq('id', match.id);
      if (error) throw new Error(`다자녀 할인 갱신 실패(${candidate.name}): ${error.message}`);
      updatedCount += 1;
    }
  } catch (err) {
    await postPipelineLog(client, { status: 'FAILED', errorMessage: err.message.slice(0, 500) });
    throw err;
  }

  console.log(`✅ 매칭 ${matchedCount}건, 갱신 ${updatedCount}건 (전체 후보 ${allCandidates.length}건)`);
  await postPipelineLog(client, {
    status: 'OK',
    metaData: {
      gyeonggiCount: gyeonggiCandidates.length,
      seoulCount: seoulCandidates.length,
      totalCandidates: allCandidates.length,
      matchedCount,
      updatedCount,
    },
  });

  return { sourceKey: SOURCE_KEY, count: updatedCount, upserted: true };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dryRun = process.argv.includes('--dry-run');
  run({ dryRun }).catch((err) => {
    console.error(`❌ 주차장 다자녀 할인 혜택 매칭 실패: ${err.message}`);
    process.exit(1);
  });
}
