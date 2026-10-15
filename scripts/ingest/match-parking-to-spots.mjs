// [부설 주차장 1:1 스팟 매칭](implementation/todo.md 개선사항1 핵심 규칙 3):
// "목적지 건물 자체의 주차장입니다. 우리 DB의 스팟(Spots) 좌표와 부설 주차장
// 좌표를 비교하여, 반경 내(예: 50m 이내)에 매칭되는 경우... 주차장명과 위경도를
// LLM으로 던져서 교차확인하는 것이 필요하다고 판단됨... 스팟 테이블에 parking_id
// (FK)를 연결".
//
// [LLM 교차확인 대신 결정적 이름 유사도 비교를 쓰는 이유](2026-10-15 설계 결정)
// 매 실행마다 같은 입력이면 같은 결과가 나와야 하는 반복 배치(월 1회 재실행)인데,
// LLM 호출은 (a) 매번 비용이 들고 (b) 같은 입력에도 응답이 달라질 수 있어 결정성이
// 없다. 제2장 제5조("AI는 보조 역할... 최종 책임은 사람")에도 맞춰, 이 스크립트는
// 결정적 문자열 유사도로 자동 매칭하고, 유사도가 애매한 경계 케이스는 매칭하지
// 않고 그대로 pipeline_logs에 "검토 필요" 목록으로만 남긴다(추측 매칭 금지,
// 제3장 제5조) — 사람이 그 목록을 보고 필요하면 수동 확인(또는 그때 LLM/사람이
// 직접 봄) 하는 구조.
import { pathToFileURL } from 'url';
import { loadEnv } from '../lib/load-env.mjs';
import { createAdminClient } from './lib/supabase-admin.mjs';

loadEnv();
const SOURCE_KEY = 'PARKING_SPOT_MATCHING';
const MATCH_RADIUS_METERS = 50;
// [임계값 — 실측 기반 조정 전 1차값](2026-10-15) 공통 단어 토큰(주차장/공영/
// 지하/옥상 등)을 제거한 뒤 두 이름이 서로를 포함하면 1.0, 부분 겹침이면 그
// 비율을 쓴다. 0.5 미만(핵심 단어의 절반도 안 겹침)은 매칭하지 않는다 —
// 오탐(엉뚱한 곳에 뱃지가 붙는 것)이 미탐(뱃지가 안 붙는 것)보다 사용자
// 신뢰도에 더 나쁘다고 판단해 보수적으로 잡았다.
const MIN_SIMILARITY = 0.5;

const STRIP_WORDS = ['주차장', '공영', '민영', '부설', '지하', '옥상', '별관', '본관', '제1', '제2', '제3', '별동'];

export function normalizeFacilityName(name) {
  if (!name) return '';
  let result = name.replace(/[\s()·\-,]/g, '');
  for (const word of STRIP_WORDS) {
    result = result.split(word).join('');
  }
  return result;
}

// 둘 중 짧은 쪽이 긴 쪽에 완전히 포함되면 1.0, 아니면 공통 2-gram 비율로 점수화.
export function nameSimilarity(nameA, nameB) {
  const a = normalizeFacilityName(nameA);
  const b = normalizeFacilityName(nameB);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 1;

  const bigrams = (s) => {
    const set = new Set();
    for (let i = 0; i < s.length - 1; i += 1) set.add(s.slice(i, i + 2));
    return set;
  };
  const setA = bigrams(a);
  const setB = bigrams(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let common = 0;
  for (const g of setA) if (setB.has(g)) common += 1;
  return common / Math.min(setA.size, setB.size);
}

function keepBestPerKey(items, keyFn) {
  const byKey = new Map();
  for (const item of items) {
    const key = keyFn(item);
    const existing = byKey.get(key);
    if (
      !existing ||
      item.similarity > existing.similarity ||
      (item.similarity === existing.similarity && item.distance_meters < existing.distance_meters)
    ) {
      byKey.set(key, item);
    }
  }
  return [...byKey.values()];
}

// 각 parking_id에 대해, 후보들 중 (유사도 내림차순, 거리 오름차순)으로 최선
// 하나만 남긴다. 임계값 미달이면 그 parking_id는 매칭 후보에서 빠진다(미매칭).
// 그 다음 spot_id 기준으로도 한 번 더 같은 방식으로 추려서, 서로 다른 두
// 부설 주차장이 같은 스팟을 동시에 주장하는 경우가 없도록 한다(진짜 1:1).
export function pickBestMatches(candidates, minSimilarity = MIN_SIMILARITY) {
  const scored = candidates
    .map((c) => ({ ...c, similarity: nameSimilarity(c.parking_name, c.spot_name) }))
    .filter((c) => c.similarity >= minSimilarity);
  const byParking = keepBestPerKey(scored, (c) => c.parking_id);
  return keepBestPerKey(byParking, (c) => c.spot_id);
}

async function postPipelineLog(client, { status, errorMessage = null, metaData = null }) {
  try {
    const { error } = await client.from('pipeline_logs').insert({
      agent_name: SOURCE_KEY,
      status,
      error_message: errorMessage,
      meta_data: metaData,
      description: '부설 주차장 1:1 스팟 매칭(50m 반경 + 이름 유사도) — open_spaces.parking_id 갱신',
      period: 'monthly',
    });
    if (error) console.error(`⚠️ pipeline_logs 기록 실패(배치 자체에는 영향 없음): ${error.message}`);
  } catch (err) {
    console.error(`⚠️ pipeline_logs 기록 중 예외(배치 자체에는 영향 없음): ${err.message}`);
  }
}

export async function run({ dryRun = false } = {}) {
  console.log(`▶ 부설 주차장-스팟 매칭 시작 (dry-run: ${dryRun})`);
  const client = createAdminClient();

  const { data: candidates, error: rpcError } = await client.rpc('find_busul_parking_candidates', {
    radius_meters: MATCH_RADIUS_METERS,
  });
  if (rpcError) throw new Error(`find_busul_parking_candidates 호출 실패: ${rpcError.message}`);

  console.log(`  → 반경 ${MATCH_RADIUS_METERS}m 내 후보 쌍: ${candidates.length}건`);
  const matches = pickBestMatches(candidates);
  console.log(`  → 이름 유사도 ${MIN_SIMILARITY} 이상 매칭: ${matches.length}건`);

  // 후보는 있었지만 임계값 미달이라 매칭에서 빠진 parking_id(검토 참고용 기록)
  const consideredParkingIds = new Set(candidates.map((c) => c.parking_id));
  const matchedParkingIds = new Set(matches.map((m) => m.parking_id));
  const unmatchedWithCandidates = [...consideredParkingIds].filter((id) => !matchedParkingIds.has(id)).length;

  if (dryRun) {
    console.log(JSON.stringify(matches.slice(0, 5), null, 2));
    return { sourceKey: SOURCE_KEY, count: matches.length, upserted: false };
  }

  let updatedCount = 0;
  try {
    // [매칭 재설정 — 이전 매칭 초기화 후 재적용] parking-metadata.mjs가 매번
    // parking_id를 전부 끊고(truncate_parking_metadata) 전체 교체하므로, 이
    // 스크립트는 그 다음 순서로 실행되는 것을 전제로 한다(README/워크플로 순서
    // 참고) — 별도로 끊는 작업은 필요 없다.
    for (const match of matches) {
      const { error } = await client
        .from('open_spaces')
        .update({ parking_id: match.parking_id })
        .eq('id', match.spot_id);
      if (error) throw new Error(`open_spaces.parking_id 갱신 실패(spot_id=${match.spot_id}): ${error.message}`);
      updatedCount += 1;
    }
  } catch (err) {
    await postPipelineLog(client, { status: 'FAILED', errorMessage: err.message.slice(0, 500) });
    throw err;
  }

  console.log(`✅ open_spaces.parking_id 매칭 완료: ${updatedCount}건`);
  await postPipelineLog(client, {
    status: 'OK',
    metaData: {
      candidatesCount: candidates.length,
      matchedCount: matches.length,
      unmatchedWithCandidates,
      minSimilarity: MIN_SIMILARITY,
      radiusMeters: MATCH_RADIUS_METERS,
    },
  });

  return { sourceKey: SOURCE_KEY, count: updatedCount, upserted: true };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dryRun = process.argv.includes('--dry-run');
  run({ dryRun }).catch((err) => {
    console.error(`❌ 부설 주차장-스팟 매칭 실패: ${err.message}`);
    process.exit(1);
  });
}
