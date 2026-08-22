// CLI 진입점 — 실제 로직은 adapters/gg-culture-location-enrichment.mjs.
// 실행 전 .env.local에 GG_DATA_API_KEY, VWORLD_API_KEY, SUPABASE_SERVICE_ROLE_KEY 설정 필요.
import { loadEnv } from '../lib/load-env.mjs';
import { createAdminClient } from './lib/supabase-admin.mjs';
import { GgCultureEventsAdapter } from './adapters/gg-culture-events-adapter.mjs';
import { enrichGgCultureEventLocations } from './adapters/gg-culture-location-enrichment.mjs';

loadEnv();

const dryRun = process.argv.includes('--dry-run');

async function main() {
  const client = createAdminClient();
  const adapter = new GgCultureEventsAdapter();

  const result = await enrichGgCultureEventLocations({ client, adapter, dryRun });

  console.log(
    `\n▶ 완료: 총 ${result.total}건 중 ${result.updated}건 EXACT 승격${dryRun ? ' (dry-run, 실제 DB 변경 없음)' : ''}`
  );
  console.log(
    `   URL 복원 실패: ${result.noUrlRecovered}건 / 장소 필드 없음: ${result.noVenueField}건 / 지오코딩 실패: ${result.geocodeFailed}건`
  );
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exitCode = 1;
});
