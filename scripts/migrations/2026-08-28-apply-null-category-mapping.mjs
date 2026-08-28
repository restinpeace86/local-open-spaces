// [NULL 데이터 중분류 매핑 실제 적용](2026-08-28) — docs/null-category-analysis.md에서
// "적용 가능"으로 판정한 범위를 실제 DB에 반영하는 1회성 실행 스크립트. 로직 자체는
// scripts/ingest/lib/legacy-source-category-mapping.mjs 참고(run-daily.mjs/run-monthly.mjs
// 배치에도 재발 방지용으로 연결돼 있다).
import { pathToFileURL } from 'url';
import { loadEnv } from '../lib/load-env.mjs';
import { createAdminClient } from '../ingest/lib/supabase-admin.mjs';
import { applyLegacySourceCategoryMapping } from '../ingest/lib/legacy-source-category-mapping.mjs';
import { analyzeOpenSpaces } from '../ingest/lib/supabase-admin.mjs';

loadEnv();

async function main() {
  const client = createAdminClient();
  const result = await applyLegacySourceCategoryMapping(client);
  console.log('매핑 적용 완료.');
  console.log(JSON.stringify(result, null, 2));

  console.log('\nANALYZE 실행 중...');
  await analyzeOpenSpaces(client);
  console.log('ANALYZE 완료.');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('❌', err.message);
    process.exitCode = 1;
  });
}
