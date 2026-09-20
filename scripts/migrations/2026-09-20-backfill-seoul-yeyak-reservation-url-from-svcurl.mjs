// [실사용 버그 제보](2026-09-20 사용자 지시, 마포구 망원한강공원 서울형키즈카페 사례):
// "예약하기 눌렀는데 페이지 표시할 수 없대.. 원천소스 SVCURL은
// umppa.seoul.go.kr/icare/user/kidsCafeResve/... 인데 저장된 reservation_url은
// yeyak.seoul.go.kr 였다" — seoul-yeyak-adapter.mjs가 SVCID로 yeyak.seoul.go.kr URL을
// 항상 새로 구성하던 방식을 원본 SVCURL을 그대로 쓰도록 고쳤다(같은 날 커밋). 이 스크립트는
// 그 수정 *이전에* 이미 잘못된 reservation_url로 적재된 기존 행을 복구한다.
//
// 복구 방법: raw_data(원본 API 응답 그대로 보존됨, 어댑터가 항상 저장)에 SVCURL 필드가
// 남아있으므로, source='seoul_public_reservation'인 events 중 raw_data.SVCURL이 존재하고
// 현재 reservation_url과 다른 행만 SVCURL 값으로 UPDATE한다 — 재크롤링/추측 없이 이미
// 저장된 원본 데이터만 사용한다(제3장 제5조 추측 금지). 실행 후 재실행해도 안전(멱등):
// 이미 일치하는 행은 다시 UPDATE 대상에 잡히지 않는다.
import { loadEnv } from '../lib/load-env.mjs';
import { createAdminClient } from '../ingest/lib/supabase-admin.mjs';

loadEnv();

const dryRun = process.argv.includes('--dry-run');
const SOURCE = 'seoul_public_reservation';
const PAGE_SIZE = 1000;

async function main() {
  const supabase = createAdminClient();

  console.log('▶ source=seoul_public_reservation 행 조회 중...');
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('events')
      .select('id, reservation_url, raw_data')
      .eq('source', SOURCE)
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`조회 실패: ${error.message}`);
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  console.log(`  조회: ${rows.length}건`);

  const toUpdate = rows
    .map((row) => ({ id: row.id, svcUrl: row.raw_data?.SVCURL ?? null, current: row.reservation_url }))
    .filter((row) => row.svcUrl && row.svcUrl !== row.current);

  console.log(`  불일치(복구 대상): ${toUpdate.length}건`);
  for (const row of toUpdate) {
    console.log(`   - ${row.id}: ${row.current} → ${row.svcUrl}`);
  }

  if (dryRun) {
    console.log('DRY-RUN: 실제 UPDATE 미실행');
    return;
  }

  console.log('▶ 실제 DB UPDATE 실행 중...');
  let done = 0;
  let failed = 0;
  for (const row of toUpdate) {
    const { error } = await supabase.from('events').update({ reservation_url: row.svcUrl }).eq('id', row.id);
    if (error) {
      failed += 1;
      console.error(`  ⚠️ update 실패(${row.id}):`, error.message);
    } else {
      done += 1;
    }
  }
  console.log(`✅ 백필 완료: 성공 ${done}건, 실패 ${failed}건`);
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exitCode = 1;
});
