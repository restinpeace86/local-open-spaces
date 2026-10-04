// [롯데마트 문화센터 변화 감지 — 경량 ping](2026-10-04 사용자 지시): "전체
// 찌르는건 시간 많이 걸리고 성능 많이 걸리는데... ping 같은 기능이지... 실시간
// 감지 하는건 어렵나?" — 매일 1회 전체 재수집만으로는 하루 종일 상태가
// 바뀌어도 다음날 새벽까지 못 잡는다는 지적에서 출발. 60개 지점을 "1페이지만"
// 가볍게 찔러보고, 뭔가 바뀐 지점만 그 지점 전체를 다시 긁는다.
//
// [범위 축소 — 사용자 확정](2026-10-04): "학기 2가지 하지마 지금 가을이니깐
// 가을학기만해" — 실측 확인: 60개 지점 중 103/455/802 전부 겨울학기(202604)
// 응답이 빈 값(27바이트, pageInfo 자체가 없음). ping은 가을학기(202603) 고정.
// "수강대상은 일단안넣어도 되는데?" — search_cls_target을 비워서 요청하면
// 대상 구분 없이(성인강좌 포함) 돌려준다 — 덕분에 조합 수가 180(지점×대상)
// 이 아니라 60(지점만)으로 줄어든다("성인꺼도 포함해서 대상 선택안하고
// 가져오는건 핑 요청건을 줄이려고하는거니깐" — 사용자가 명시한 목적).
//
// [비교 방식 — v2 재설계](2026-10-04 사용자 지시): "성인꺼는 데이터 가져온것
// 에서 빼고나서 우리꺼 기존에 적재된거랑 비교를 해야지 변화가 있는지를 알수
// 있어" — v1은 target 없이 받은 응답의 pageInfo 버킷 합계(접수가능/온라인
// 마감/접수마감)를 지점별로 저장해 비교했는데, 이 합계엔 성인강좌 변동도
// 섞여 있어 성인강좌만 바뀌어도 오탐했다. v2는 받아온 행(최대 20개, 1페이지)
// 중 main_category_name이 "성인강좌"인 것만 걸러내고, 남은 행의 class_id로
// 이미 적재된 lottemart_culture_club_classes를 직접 조회해 registration_status
// 가 다르거나(상태 전환) class_id 자체가 없으면(신규 강좌) "변화"로 판단한다.
// 별도 집계값을 저장해 둘 필요가 없어졌다 — 매번 실제 데이터와 직접 비교.
//
// [page 1만 보는 한계 — 정직하게 기록] 1페이지(기본 정렬, 최대 20행)만 보므로
// 그 지점의 변화가 전부 1페이지 안에 있으리라는 보장은 없다(실측 확인: 기본
// 정렬은 "강좌군별"이고, 마감임박순으로 바꾸면 오히려 성인강좌가 페이지를
// 독점해버려 더 나쁨 — 기본 정렬 유지가 더 낫다는 것도 실측으로 확인). 이
// ping은 "완전한 변화 감지"가 아니라 "저비용으로 자주 찔러보는 신호" — 놓친
// 변화는 기존 일 1회 전체 배치(lottemart-culture-club.mjs)가 결국 잡아준다.
import { pathToFileURL } from 'url';
import { parse } from 'node-html-parser';
import { loadEnv } from '../lib/load-env.mjs';
import { createAdminClient } from './lib/supabase-admin.mjs';
import { applyRandomStartupDelay } from './lib/random-startup-delay.mjs';
import { fetchAllForCombo, fetchPage, parseRow, STORES, TARGETS } from './lottemart-culture-club.mjs';

loadEnv();

const SOURCE_KEY = 'LOTTEMART_CULTURE_CLUB_PING';
const CURRENT_SEMESTER = '202603';
const ADULT_CATEGORY = '성인강좌';
const REQUEST_PACING_MIN_MS = 1000;
const REQUEST_PACING_MAX_MS = 1500;
// [랜덤 시작 지연](2026-10-04 사용자 지시): "매시 7분이면 이것도 기계적인건
// 아닌건가" — 매시 정각에서 7분으로 고정 오프셋만 준 것도 결국 매번 똑같이
// 규칙적이라는 지적. 트리거(cron)는 고정이어도 실제 요청이 나가는 시각은
// 매번 흔들리도록, 최대 5분까지 추가로 랜덤 대기한다(다음 ping까지 1시간
// 여유가 있어 5분 정도는 안전하게 흡수됨).
const MAX_STARTUP_DELAY_MS = 5 * 60 * 1000;
const UPSERT_CHUNK_SIZE = 500;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomPacingDelay() {
  return REQUEST_PACING_MIN_MS + Math.random() * (REQUEST_PACING_MAX_MS - REQUEST_PACING_MIN_MS);
}

// [성인 제외](2026-10-04 사용자 지시) — main_category_name이 정확히 "성인강좌"
// 인 행만 걸러낸다(화이트리스트가 아니라 블랙리스트 — 유아강좌/영아강좌/
// 어린이청소년/일일 특강 등 앞으로 새 카테고리 라벨이 추가돼도 안전).
export async function fetchNonAdultPage1Rows(storeCode, storeName) {
  const html = await fetchPage(storeCode, '', CURRENT_SEMESTER, 1);
  const root = parse(html);
  const trs = root.querySelectorAll('tr');
  const context = { storeCode, storeName, targetCode: '', targetName: '', semesterCode: CURRENT_SEMESTER };

  const rows = [];
  for (const tr of trs) {
    const row = parseRow(tr, context);
    if (row && row.main_category_name !== ADULT_CATEGORY) rows.push(row);
  }
  return rows;
}

// [변화 판정] 신선하게 받아온(성인 제외) 행들의 class_id로 기존 적재 데이터를
// 조회해, 상태가 다르거나(전환) class_id 자체가 없으면(신규) "변화"로 본다.
export function detectChange(freshRows, storedStatusByClassId) {
  for (const row of freshRows) {
    const storedStatus = storedStatusByClassId.get(row.class_id);
    if (storedStatus === undefined || storedStatus !== row.registration_status) {
      return true;
    }
  }
  return false;
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
      description: '롯데마트 문화센터 지점별 경량 ping(1페이지, 성인 제외 후 기존 데이터와 비교) — 변화 감지된 지점만 선택적 재수집',
      // [period 제약 재확인](2026-10-04 실측): pipeline_logs.period는 CHECK
      // 제약으로 'daily'/'monthly'/null만 허용한다('hourly'를 썼다가 실제로
      // insert가 거부되는 걸 실측으로 확인) — 이 배치는 매시간이라 어느 쪽도
      // 정확하지 않으니 null로 둔다(거짓 라벨을 붙이지 않음, 제3장 제5조).
      period: null,
    });
    if (error) console.error(`⚠️ pipeline_logs 기록 실패(배치 자체에는 영향 없음): ${error.message}`);
  } catch (err) {
    console.error(`⚠️ pipeline_logs 기록 중 예외(배치 자체에는 영향 없음): ${err.message}`);
  }
}

export async function run() {
  console.log(`▶ 롯데마트 문화센터 ping 시작 — 지점 ${STORES.length}곳`);
  const client = createAdminClient();

  let changedCount = 0;
  let rescannedRowCount = 0;
  const changedStores = [];

  for (const [storeCode, storeName] of STORES) {
    try {
      const freshRows = await fetchNonAdultPage1Rows(storeCode, storeName);
      let changed = false;

      if (freshRows.length > 0) {
        const classIds = freshRows.map((r) => r.class_id);
        const { data: storedRows, error: storedError } = await client
          .from('lottemart_culture_club_classes')
          .select('class_id, registration_status')
          .in('class_id', classIds);
        if (storedError) throw new Error(`기존 데이터 조회 실패: ${storedError.message}`);

        const storedStatusByClassId = new Map((storedRows ?? []).map((r) => [r.class_id, r.registration_status]));
        changed = detectChange(freshRows, storedStatusByClassId);
      }

      if (changed) {
        changedCount += 1;
        changedStores.push(storeCode);
        const rowCount = await rescanStore(client, storeCode, storeName);
        rescannedRowCount += rowCount;
        console.log(`  [${storeName}] 변화 감지 → 재수집 ${rowCount}건`);
      }

      const { error: upsertStateError } = await client.from('lottemart_culture_club_store_ping_state').upsert(
        { store_code: storeCode, checked_at: new Date().toISOString(), ...(changed ? { changed_at: new Date().toISOString() } : {}) },
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
  applyRandomStartupDelay(MAX_STARTUP_DELAY_MS)
    .then(() => run())
    .catch((err) => {
      console.error(`❌ 롯데마트 문화센터 ping 실패: ${err.message}`);
      process.exit(1);
    });
}
