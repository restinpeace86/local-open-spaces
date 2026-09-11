// [Decision 024(2026-09-11, 사용자 명시적 재확인) — 개선사항9]: "체육시설 대관/축구장/
// 농구장 등 시설 대관 예약관련 seoul_public_reservation 데이터가 open_spaces에 보이는데
// events로 이관해달라." Decision 017 2항을 개정해 SEOUL_YEYAK의 체육시설/공간시설을
// open_spaces → events로 재라우팅했다(seoul-yeyak-adapter.mjs) — 이 스크립트는 이미
// open_spaces에 적재된 기존 레코드를 events로 재적재하고 원본을 삭제하는 일회성
// 데이터 마이그레이션이다.
//
// [방식] 각 open_spaces 행의 raw_data(원본 API 응답, Decision 017 4항이 무손실 보존해
// 둔 값)를 실제 어댑터의 SeoulYeyakAdapter.transformSplit()에 다시 통과시킨다 — 컬럼
// 매핑을 이 스크립트가 별도로 추측/재구현하지 않고, 지금 막 events로 바꾼 것과 정확히
// 동일한 로직을 재사용한다(제3장 제5조 추측 금지, 제5장 제4조 기존 구조 우선). 이제
// MAXCLASSNM_TABLE이 체육시설/공간시설도 'events'로 매핑하므로 transformSplit이 자동으로
// result.events에 담아준다.
//
// [안전장치] events에 upsert가 완전히 성공한 뒤에만 open_spaces 원본을 삭제한다(순서
// 보장 — 실패 시 open_spaces에 그대로 남아 재시도 가능, 데이터 유실 없음). --dry-run으로
// 먼저 건수만 확인할 수 있다.
import { loadEnv } from '../lib/load-env.mjs';
loadEnv();

import { createAdminClient, upsertRowsSafeMerge } from '../ingest/lib/supabase-admin.mjs';
import { SeoulYeyakAdapter } from '../ingest/adapters/seoul-yeyak-adapter.mjs';

const SOURCE = 'seoul_public_reservation';
const TARGET_MAXCLASSNM = ['체육시설', '공간시설'];
const FETCH_CHUNK = 1000; // PostgREST max_rows(supabase/config.toml)와 동일한 안전 상한.
const dryRun = process.argv.includes('--dry-run');

async function fetchAllMisroutedRows(admin) {
  const all = [];
  let offset = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await admin
      .from('open_spaces')
      .select('id, external_id, raw_data')
      .eq('source', SOURCE)
      .in('raw_data->>MAXCLASSNM', TARGET_MAXCLASSNM)
      .order('id', { ascending: true })
      .range(offset, offset + FETCH_CHUNK - 1);
    if (error) throw new Error(`open_spaces 조회 실패: ${error.message}`);
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < FETCH_CHUNK) break;
    offset += FETCH_CHUNK;
  }
  return all;
}

async function main() {
  console.log(`▶ SEOUL_YEYAK 체육시설/공간시설 open_spaces → events 마이그레이션 시작 (dry-run: ${dryRun})`);

  const admin = createAdminClient();
  const misroutedRows = await fetchAllMisroutedRows(admin);
  console.log(`✅ 대상 open_spaces 행 ${misroutedRows.length}건 조회 완료`);

  if (misroutedRows.length === 0) {
    console.log('이관할 행이 없습니다. 종료.');
    return;
  }

  const rawItems = misroutedRows.map((row) => row.raw_data);
  const adapter = new SeoulYeyakAdapter();
  const { events, open_spaces: stillOpenSpaces, errorCounts, excludedCount } = adapter.transformSplit(rawItems);

  console.log(`▶ 변환 결과: events ${events.length}건 / open_spaces ${stillOpenSpaces.length}건(0이어야 정상) / 제외 ${excludedCount}건`);
  if (Object.keys(errorCounts).length > 0) {
    console.log('▶ 변환 중 에러 집계:', errorCounts);
  }
  if (stillOpenSpaces.length > 0) {
    // 이제 MAXCLASSNM_TABLE이 둘 다 events로 매핑하므로 이 갈래는 나오면 안 된다 —
    // 나온다면 코드 변경이 반영 안 됐거나 예상 밖 MAXCLASSNM이 섞인 것이라 중단한다.
    throw new Error(`예상과 달리 ${stillOpenSpaces.length}건이 여전히 open_spaces로 분류됐습니다 — 중단합니다.`);
  }

  if (dryRun) {
    console.log('dry-run이라 실제 upsert/delete는 수행하지 않습니다.');
    console.log('샘플(최대 3건):', events.slice(0, 3).map((r) => ({ external_id: r.external_id, title: r.title, event_type: r.event_type })));
    return;
  }

  const upsertResult = await upsertRowsSafeMerge(admin, 'events', events);
  console.log(`✅ events upsert 완료: ${upsertResult.count}건 (배치 내 중복 ${upsertResult.duplicateWithinBatch}건, 기존과 병합 ${upsertResult.mergedWithExisting}건)`);

  // events에 안전하게 반영된 것을 확인했으니(위에서 에러 시 이미 throw) 원본 open_spaces 행을 삭제한다.
  // [실측] chunk=500으로 한 번에 지우려다 "canceling statement due to statement
  // timeout"이 발생했다 — DB 부하를 낮추려 훨씬 작은 단위로 나누고, 청크 사이 짧은
  // 지연을 둔다.
  const idsToDelete = misroutedRows.map((row) => row.id);
  const DELETE_CHUNK = 50;
  const DELETE_PACING_MS = 300;
  let deletedCount = 0;
  for (let i = 0; i < idsToDelete.length; i += DELETE_CHUNK) {
    const chunk = idsToDelete.slice(i, i + DELETE_CHUNK);
    const { error: deleteError, count } = await admin.from('open_spaces').delete({ count: 'exact' }).in('id', chunk);
    if (deleteError) throw new Error(`open_spaces 삭제 실패(이미 events에는 반영됨, 수동 확인 필요): ${deleteError.message}`);
    deletedCount += count ?? chunk.length;
    if (i + DELETE_CHUNK < idsToDelete.length) await new Promise((resolve) => setTimeout(resolve, DELETE_PACING_MS));
  }
  console.log(`✅ 원본 open_spaces 행 삭제 완료: ${deletedCount}건`);
  console.log('▶ 마이그레이션 완료.');
}

main().catch((err) => {
  console.error('❌ 마이그레이션 실패:', err.message);
  process.exit(1);
});
