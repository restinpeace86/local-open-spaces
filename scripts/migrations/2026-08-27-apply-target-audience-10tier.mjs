// implementation/todo.md "[10대 타겟 분류 체계 및 활성 데이터 실데이터 반영 및 성능 최적화]"
// 실제 UPDATE 실행 스크립트. scripts/ingest/lib/target-audience-taxonomy.mjs의
// applyTargetAudienceTaxonomy(3단계 퍼널: 0순위 원천 필드 → 1단계 카테고리/FACILITY 판정 →
// 2단계 텍스트 파싱)를 is_active=true인 events 전체에 실제 반영한다.
//
// 전제 조건: scripts/migrations/2026-08-27-target-audience-10tier-real-application.sql로
// events.target_audience/target_audience_source 컬럼이 이미 추가돼 있어야 한다.
//
// 재실행해도 안전(멱등) — 판정 로직이 title/description/raw_data/category_min만 참조하고
// target_audience 자기 자신의 이전 값에 의존하지 않는다(target_audience_source='MANUAL'인
// 행만 예외적으로 보존).
import { loadEnv } from '../lib/load-env.mjs';
import { createAdminClient } from '../ingest/lib/supabase-admin.mjs';
import { applyTargetAudienceTaxonomy } from '../ingest/lib/target-audience-taxonomy.mjs';

loadEnv();

async function main() {
  const supabase = createAdminClient();

  console.log('▶ target_audience 10대 분류 체계 실제 적용 중 (is_active=true 대상)...');
  const result = await applyTargetAudienceTaxonomy(supabase);

  console.log(`  스캔: ${result.scanned}건`);
  console.log(`  MANUAL 보존: ${result.preservedManual}건`);
  console.log(`  태그 부여: ${result.updatedToValue}건`);
  console.log(`  NULL 유지(수동 검수 대상): ${result.clearedToNull}건`);
  console.log('  태그별 분포:');
  for (const [tag, count] of [...result.tagCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${tag}: ${count}건`);
  }
  console.log('  판정 근거별 분포:');
  for (const [source, count] of [...result.sourceCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${source}: ${count}건`);
  }
}

main().catch((err) => {
  console.error('실패:', err);
  process.exit(1);
});
