// [facility_type 기본값 결함 수정 — 기존 데이터 정리](2026-09-19 사용자 지시): "default를
// 복합으로 한게 잘못된거야.. unknown 혹은 null로 놔야돼" — 코드/스키마는 이미 고쳤지만
// (2026-09-19-facility-type-nullable-remove-default.sql), 기존에 facility_type='복합'로
// 쌓인 행 중 "애초에 LLM 분류 배치의 후보였던 적이 한 번도 없어 100% 확실히 미판별
// 기본값"인 것만 null로 되돌린다.
//
// [판단 근거] LLM 분류 배치(scripts/classify-events-facility-type.mjs 등)의 대상 조건은
// 항상 "is_active=true AND target_audience IN (INFANT/KIDS_PRE/KIDS_SCHOOL/FAMILY)"였다
// — 이 조건 밖의 행은 100% 확실히 그 배치를 거친 적이 없다:
//   1. is_active=false인 행 (배치 조건에서 애초에 제외)
//   2. is_active=true인데 target_audience가 저 4종이 아니거나 NULL인 행
// 이 조건 안(is_active=true AND target_audience IN eligible)의 '복합' 행은 실제로 LLM이
// BOTH로 판정했을 수도, 아직 배치가 못 미친 극소수(약 13건)일 수도 있어 구분이 안 되므로
// (개별 분류 이력을 남겨두지 않았음) 이번엔 건드리지 않는다 — 안전한 쪽만 정리한다
// (제3장 제5조 추측 금지).
//
// [실측 장애 수정] 20,014건 규모를 단일 UPDATE...WHERE로 한 번에 반영하려 하면
// statement timeout이 난다(실측 확인) — "조건에 맞는 첫 PAGE_SIZE건 조회 → 즉시
// UPDATE → 재조회"(id 목록으로 직접 UPDATE)로 나눠 처리한다. UPDATE가 매번 대상
// 집합을 줄여주므로(더 이상 '복합'이 아니게 됨) 커서 없이도 자연히 수렴한다(가격/
// 연령 백필 스크립트와 동일한 패턴).
import { loadEnv } from '../lib/load-env.mjs';
import { createAdminClient } from '../ingest/lib/supabase-admin.mjs';

loadEnv();
const dryRun = process.argv.includes('--dry-run');
const ELIGIBLE_AUDIENCES = ['INFANT', 'KIDS_PRE', 'KIDS_SCHOOL', 'FAMILY'];
const PAGE_SIZE = 500;

async function resetBatch(client, label, applyFilters) {
  let total = 0;
  for (;;) {
    const { data, error } = await applyFilters(client.from('events').select('id')).limit(PAGE_SIZE);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;

    if (!dryRun) {
      const ids = data.map((r) => r.id);
      const { error: updateError } = await client.from('events').update({ facility_type: null }).in('id', ids);
      if (updateError) throw new Error(updateError.message);
    }
    total += data.length;
    console.log(`  ${label}: 누적 ${total}건${dryRun ? ' [dry-run]' : ''}`);
    if (dryRun || data.length < PAGE_SIZE) break; // dry-run은 반영을 안 하므로 재조회해도 항상 같은 페이지 — 1회만 세고 종료
  }
  return total;
}

// dry-run에서는 반영이 없어 같은 페이지가 반복되므로, 전체 건수만 별도로 count 쿼리로 센다.
async function dryRunCount(client, label, applyFilters) {
  const { count, error } = await applyFilters(client.from('events').select('id', { count: 'exact', head: true }));
  if (error) throw new Error(error.message);
  console.log(`  [dry-run] ${label}: ${count}건`);
  return count ?? 0;
}

async function main() {
  const client = createAdminClient();
  let total = 0;

  const targets = [
    { label: 'is_active=false', apply: (q) => q.eq('facility_type', '복합').eq('is_active', false) },
    {
      label: 'is_active=true AND target_audience IS NULL',
      apply: (q) => q.eq('facility_type', '복합').eq('is_active', true).is('target_audience', null),
    },
    {
      label: 'is_active=true AND target_audience NOT IN eligible(NULL 아님)',
      apply: (q) =>
        q.eq('facility_type', '복합').eq('is_active', true).not('target_audience', 'in', `(${ELIGIBLE_AUDIENCES.join(',')})`),
    },
  ];

  for (const t of targets) {
    total += dryRun ? await dryRunCount(client, t.label, t.apply) : await resetBatch(client, t.label, t.apply);
  }

  console.log(`\n${dryRun ? '[dry-run] ' : ''}총 ${total}건 ${dryRun ? '반영 예정' : '반영'}`);
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exitCode = 1;
});
