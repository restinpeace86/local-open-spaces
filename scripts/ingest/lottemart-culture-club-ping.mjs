// [롯데마트 문화센터 변화 감지 — 경량 ping](2026-10-04 사용자 지시): "전체
// 찌르는건 시간 많이 걸리고 성능 많이 걸리는데... 1페이지라던가 ... 변화가
// 있는지에 대하여 주기적으로 찔러서 변화감지하는거 ... ping 같은 기능 ...
// 이런거로 확인 실시간 감지 하는건 어렵나?" — 매일 1회 전체 재수집(60개 지점
// × 대상 3 × 학기 2, 650~700개 요청)만으로는 하루 종일 상태가 바뀌어도 다음날
// 새벽까지 못 잡는다는 지적에서 출발. 60개 지점을 "1페이지만" 가볍게 찔러보고,
// 뭔가 바뀐 지점만 그 지점 전체를 다시 긁는다.
//
// [범위 축소 — 사용자 확정](2026-10-04):
// "학기 2가지 하지마 지금 가을이니깐 가을학기만해. 겨울학기께 올라오기
// 시작하면 그때 겨울학기꺼하면되는거아닌가?" — 실측 확인(2026-10-04): 60개
// 지점 중 확인한 전부(103/455/802) 겨울학기(202604) 응답이 빈 값(27바이트,
// pageInfo 자체가 없음)이었다 — 겨울학기는 아직 데이터가 전혀 없다. ping은
// 가을학기(202603) 고정. 겨울학기 데이터가 실제로 올라오기 시작하면(기존
// lottemart-culture-club.mjs의 일 1회 전체 배치는 이미 두 학기 다 돌고 있어
// 그쪽에서 먼저 감지됨) 이 상수를 수동으로 넓히면 된다.
//
// "수강대상은 일단안넣어도 되는데? 다만 이경우 성인이 포함되어서 성인꺼가
// 들어와도 변화 감지되긴 할텐데" — 실측 확인(2026-10-04): search_cls_target을
// 비워서 요청하면 대상 구분 없이 전부 섞어서(성인강좌 포함) 돌려준다. 덕분에
// ping 조합 수가 360(지점×대상×학기)에서 60(지점만)으로 줄어든다 — 그 대신
// pageInfo의 버킷 합계에 성인강좌 변동도 섞여 들어와, 성인강좌만 바뀌어도
// "이 지점 뭔가 바뀜"으로 오탐할 수 있다. 오탐 비용은 "그 지점 1곳 재수집"
// 정도라 작고, 대상별로 따로 ping하는 것보다 훨씬 가볍다는 트레이드오프를
// 사용자가 명시적으로 받아들였다.
//
// [탐지 시 처리] 지점의 버킷 3개(접수가능/온라인마감/접수마감) 합계가 마지막
// ping 때와 다르면 그 지점만 fetchAllForCombo()로 대상 2/3/4 전체 재수집해
// lottemart_culture_club_classes를 갱신한다(기존 lottemart-culture-club.mjs의
// 전체 배치가 매일 하는 것과 동일한 upsert 로직, 범위만 지점 1곳으로 좁힘).
import { pathToFileURL } from 'url';
import { loadEnv } from '../lib/load-env.mjs';
import { createAdminClient } from './lib/supabase-admin.mjs';
import { fetchAllForCombo, fetchPage, parsePageInfo, STORES, TARGETS } from './lottemart-culture-club.mjs';

loadEnv();

const SOURCE_KEY = 'LOTTEMART_CULTURE_CLUB_PING';
const CURRENT_SEMESTER = '202603';
const REQUEST_PACING_MIN_MS = 1000;
const REQUEST_PACING_MAX_MS = 1500;
const UPSERT_CHUNK_SIZE = 500;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomPacingDelay() {
  return REQUEST_PACING_MIN_MS + Math.random() * (REQUEST_PACING_MAX_MS - REQUEST_PACING_MIN_MS);
}

async function fetchStoreBuckets(storeCode) {
  const html = await fetchPage(storeCode, '', CURRENT_SEMESTER, 1);
  const { acceptTotalCnt, onlnCloseTotalCnt, acceptCloseTotalCnt } = parsePageInfo(html);
  return { acceptTotalCnt, onlnCloseTotalCnt, acceptCloseTotalCnt };
}

export function hasChanged(prev, current) {
  if (!prev) return true; // 처음 보는 지점(ping 테이블에 아직 없음) — 기준값을 세워야 하니 재수집.
  return (
    prev.accept_total_cnt !== current.acceptTotalCnt ||
    prev.onln_close_total_cnt !== current.onlnCloseTotalCnt ||
    prev.accept_close_total_cnt !== current.acceptCloseTotalCnt
  );
}

async function rescanStore(client, storeCode, storeName) {
  const rows = [];
  for (const [targetCode, targetName] of TARGETS) {
    const targetRows = await fetchAllForCombo(storeCode, storeName, targetCode, targetName, CURRENT_SEMESTER);
    rows.push(...targetRows);
    await sleep(randomPacingDelay());
  }

  for (let i = 0; i < rows.length; i += UPSERT_CHUNK_SIZE) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK_SIZE);
    const { error } = await client.from('lottemart_culture_club_classes').upsert(chunk, { onConflict: 'class_id' });
    if (error) throw new Error(`[${storeCode}] 재수집 upsert 실패: ${error.message}`);
  }
  return rows.length;
}

async function postPipelineLog(client, { status, errorMessage = null, metaData = null }) {
  try {
    const { error } = await client.from('pipeline_logs').insert({
      agent_name: SOURCE_KEY,
      status,
      error_message: errorMessage,
      meta_data: metaData,
      description: '롯데마트 문화센터 지점별 경량 ping — 변화 감지된 지점만 선택적 재수집',
      period: 'hourly',
    });
    if (error) console.error(`⚠️ pipeline_logs 기록 실패(배치 자체에는 영향 없음): ${error.message}`);
  } catch (err) {
    console.error(`⚠️ pipeline_logs 기록 중 예외(배치 자체에는 영향 없음): ${err.message}`);
  }
}

export async function run() {
  console.log(`▶ 롯데마트 문화센터 ping 시작 — 지점 ${STORES.length}곳`);
  const client = createAdminClient();

  const { data: prevStates, error: prevError } = await client
    .from('lottemart_culture_club_store_ping_state')
    .select('store_code, accept_total_cnt, onln_close_total_cnt, accept_close_total_cnt');
  if (prevError) throw new Error(`기존 ping 상태 조회 실패: ${prevError.message}`);
  const prevByStore = new Map((prevStates ?? []).map((row) => [row.store_code, row]));

  let changedCount = 0;
  let rescannedRowCount = 0;
  const changedStores = [];

  for (const [storeCode, storeName] of STORES) {
    try {
      const current = await fetchStoreBuckets(storeCode);
      const prev = prevByStore.get(storeCode);
      const changed = hasChanged(prev, current);

      if (changed) {
        changedCount += 1;
        changedStores.push(storeCode);
        const rowCount = await rescanStore(client, storeCode, storeName);
        rescannedRowCount += rowCount;
        console.log(`  [${storeName}] 변화 감지 → 재수집 ${rowCount}건`);
      }

      const { error: upsertStateError } = await client.from('lottemart_culture_club_store_ping_state').upsert(
        {
          store_code: storeCode,
          accept_total_cnt: current.acceptTotalCnt,
          onln_close_total_cnt: current.onlnCloseTotalCnt,
          accept_close_total_cnt: current.acceptCloseTotalCnt,
          checked_at: new Date().toISOString(),
          changed_at: changed ? new Date().toISOString() : (prev?.changed_at ?? null),
        },
        { onConflict: 'store_code' }
      );
      if (upsertStateError) console.error(`⚠️ [${storeCode}] ping 상태 저장 실패: ${upsertStateError.message}`);
    } catch (err) {
      console.error(`⚠️ [${storeCode}] ping 실패(계속 진행): ${err.message}`);
    }

    await sleep(randomPacingDelay());
  }

  console.log(`✅ ping 완료 — 변화 감지 ${changedCount}/${STORES.length}개 지점, 재수집 ${rescannedRowCount}건`);
  await postPipelineLog(client, {
    status: 'OK',
    metaData: { storeCount: STORES.length, changedCount, changedStores, rescannedRowCount },
  });

  return { sourceKey: SOURCE_KEY, changedCount, rescannedRowCount };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch((err) => {
    console.error(`❌ 롯데마트 문화센터 ping 실패: ${err.message}`);
    process.exit(1);
  });
}
