// [이벤트 화면 중복 표시 제거](2026-09-20 사용자 지시): "동일한 이벤트가 앱
// 화면에서 중복해서 보이지 않으면 문제없어.. 현재 그렇게 안되어 있으면 만들어줘"
// — 이벤트 중복 검수용 관리자 UI가 있는지 조사하던 중, 훨씬 더 확실한 원인을
// 실측으로 발견했다: 활성 이벤트 3,318건 중 599건(18%)이 진짜 중복이었다.
//
// [원인] Decision 017(2026-08-25) 재작성 이전의 구버전 어댑터(seoul-public-
// reservation.mjs)가 만든 레거시 행(external_id='SEOUL_RESERVATION_{SVCID}')이,
// 신버전 어댑터(seoul-yeyak-adapter.mjs, external_id='SEOUL_YEYAK_{SVCID}')로
// 완전히 대체된 뒤에도 비활성화되지 않고 그대로 남아 있었다(2026-08-27 백필
// 스크립트가 source/raw_data만 채우고 external_id는 의도적으로 안 바꿨던 것 —
// 그 자체는 옳은 판단이었으나, 레거시 행을 비활성화하는 후속 조치가 없었다).
//
// [판정 기준 — 추측 아님] 같은 SVCID(external_id 접두사 뒤 부분)를 공유하는
// SEOUL_RESERVATION_*/SEOUL_YEYAK_* 쌍은 100% 같은 실제 예약 프로그램이다 —
// 2026-08-27 백필 스크립트 자체가 이미 이 동일성을 전제로 짜여 있었다(그
// 스크립트의 주석 그대로 재사용). 제목 유사도 등 애매한 판단은 전혀 쓰지
// 않는다.
//
// [삭제가 아니라 비활성화] reservations 등 다른 테이블이 이 행들을 참조하고
// 있을 수 있어 삭제 대신 is_active=false로 안전하게 숨긴다(기존 관리자
// "노출 활성화" 토글과 동일한 메커니즘 — 되돌릴 수 있음).
import { loadEnv } from '../lib/load-env.mjs';
import { createAdminClient } from '../ingest/lib/supabase-admin.mjs';

loadEnv();

const dryRun = process.argv.includes('--dry-run');
const LEGACY_PREFIX = 'SEOUL_RESERVATION_';
const CURRENT_PREFIX = 'SEOUL_YEYAK_';
const PAGE_SIZE = 1000;

async function fetchAllActive(supabase) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('events')
      .select('id, external_id, title')
      .eq('is_active', true)
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`조회 실패: ${error.message}`);
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  return rows;
}

async function main() {
  const supabase = createAdminClient();

  console.log('▶ 활성 이벤트 전체 조회 중...');
  const rows = await fetchAllActive(supabase);
  console.log(`  활성 이벤트: ${rows.length}건`);

  const currentSvcids = new Set(
    rows.filter((r) => r.external_id?.startsWith(CURRENT_PREFIX)).map((r) => r.external_id.slice(CURRENT_PREFIX.length))
  );

  const legacyDupes = rows.filter(
    (r) => r.external_id?.startsWith(LEGACY_PREFIX) && currentSvcids.has(r.external_id.slice(LEGACY_PREFIX.length))
  );

  console.log(`\n비활성화 대상(레거시 중복): ${legacyDupes.length}건`);

  if (dryRun) {
    console.log('DRY-RUN: 실제 UPDATE 미실행 — 대상 10건 예시:');
    for (const r of legacyDupes.slice(0, 10)) console.log(`   - ${r.external_id}: "${r.title}"`);
    return;
  }

  let done = 0;
  let failed = 0;
  const CONCURRENCY = 20;
  for (let i = 0; i < legacyDupes.length; i += CONCURRENCY) {
    const batch = legacyDupes.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (row) => {
        const { error } = await supabase.from('events').update({ is_active: false }).eq('id', row.id);
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
  console.log(`✅ 완료: 비활성화 성공 ${done}건, 실패 ${failed}건`);
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exitCode = 1;
});
