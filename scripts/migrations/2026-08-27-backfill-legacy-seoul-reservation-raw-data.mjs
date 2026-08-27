// implementation/todo.md "[레거시 백필 실행 및 Target Audience 10대 분류 체계 시뮬레이션]"
// 1번째 하위 작업(실제 DB 반영): source/raw_data가 비어 있는 구버전 events 행
// (external_id LIKE 'SEOUL_RESERVATION_%', source IS NULL — Decision 017 재작성 이전
// seoul-public-reservation.mjs 구버전 어댑터가 적재한 2,544건)을 실제 DB에 백필한다.
//
// 복구 방법: external_id의 'SEOUL_RESERVATION_' 접두 뒤에 SVCID가 그대로 보존돼 있고
// (예: SEOUL_RESERVATION_S251215145720755175), reservation_url에도 동일 SVCID가 쿼리스트링
// (rsv_svc_id=)으로 남아있음을 실측 확인했다. 서울시 예약 통합 API(tvYeyakCOllect)를
// 현재 시점 기준 전수 재수집해 SVCID로 정확히 매칭되는 건만 source='seoul_public_reservation'/
// raw_data=<API 원본>으로 채운다 — 제목/날짜 유사도 등 추측성 매칭은 전혀 사용하지 않았다
// (제3장 제4조 추측 금지). 이미 신규 어댑터가 쓰는 external_id 접두(SEOUL_YEYAK_)로 값을
// 바꾸거나 upsert하지 않고, 기존 행의 id를 그대로 두고 source/raw_data 두 컬럼만 UPDATE했다
// (external_id를 바꾸면 신규 어댑터의 upsert 대상과 물리적으로 같은 행이 두 번 생기는 위험이
// 있어 원천적으로 피함).
//
// 실행 결과(2026-08-27): live 피드 2,925건 중 SVCID 매칭 2,322건 백필 성공, 222건은 라이브
// 피드에서 이미 사라져(서비스 종료/만료로 API가 더 이상 내려주지 않음) 복구 불가 — 공공
// API가 과거 스냅샷을 제공하지 않는 구조적 한계이며 추측으로 채우지 않고 NULL로 남겼다.
// 실행 후 재실행해도 안전(멱등) — 이미 source가 채워진 행은 조회 조건(source IS NULL)에서
// 제외되므로 중복 UPDATE가 발생하지 않는다.
import { loadEnv } from '../lib/load-env.mjs';
import { createAdminClient } from '../ingest/lib/supabase-admin.mjs';
import { SeoulYeyakAdapter } from '../ingest/adapters/seoul-yeyak-adapter.mjs';

loadEnv();

const dryRun = process.argv.includes('--dry-run');
const SOURCE = 'seoul_public_reservation';
const PREFIX = 'SEOUL_RESERVATION_';

async function main() {
  const supabase = createAdminClient();

  console.log('▶ 서울 예약 통합 API(tvYeyakCOllect) 전수 재수집 중...');
  const adapter = new SeoulYeyakAdapter();
  const liveItems = await adapter.fetch();
  console.log(`  live items: ${liveItems.length}건`);

  const svcidMap = new Map();
  for (const item of liveItems) {
    if (item.SVCID) svcidMap.set(item.SVCID, item);
  }

  console.log('▶ 레거시 SEOUL_RESERVATION_* (source=null) 행 조회 중...');
  const legacyRows = [];
  const PAGE_SIZE = 1000;
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('events')
      .select('id, external_id')
      .is('source', null)
      .like('external_id', `${PREFIX}%`)
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`조회 실패: ${error.message}`);
    legacyRows.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  console.log(`  legacy rows: ${legacyRows.length}건`);

  const toUpdate = [];
  let unmatched = 0;
  for (const row of legacyRows) {
    const svcid = row.external_id.slice(PREFIX.length);
    const item = svcidMap.get(svcid);
    if (item) toUpdate.push({ id: row.id, raw_data: item });
    else unmatched += 1;
  }

  console.log(`  matched (backfill 가능): ${toUpdate.length}건`);
  console.log(`  unmatched (라이브 피드에 더 이상 없음 — 복구 불가): ${unmatched}건`);

  if (dryRun) {
    console.log('DRY-RUN: 실제 UPDATE 미실행');
    return;
  }

  console.log('▶ 실제 DB UPDATE 실행 중...');
  const CONCURRENCY = 15;
  let done = 0;
  let failed = 0;
  for (let i = 0; i < toUpdate.length; i += CONCURRENCY) {
    const batch = toUpdate.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (row) => {
        const { error } = await supabase
          .from('events')
          .update({ source: SOURCE, raw_data: row.raw_data })
          .eq('id', row.id);
        return error;
      })
    );
    for (const err of results) {
      if (err) {
        failed += 1;
        console.error('  ⚠️ update 실패:', err.message);
      } else {
        done += 1;
      }
    }
  }
  console.log(`✅ 백필 완료: 성공 ${done}건, 실패 ${failed}건`);
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exitCode = 1;
});
