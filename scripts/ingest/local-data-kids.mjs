// CLI 진입점 — 실제 수집 로직은 adapters/local-data-kids-adapter.mjs (BaseCollectorAdapter 구현체)
// 실행 전 .env.local에 LOCAL_DATA_KIDS_CSV_URL 설정 필요 (localdata.go.kr에서 확인)
import { loadEnv } from '../lib/load-env.mjs';
import { LocalDataKidsAdapter } from './adapters/local-data-kids-adapter.mjs';

loadEnv();

const dryRun = process.argv.includes('--dry-run');

async function main() {
  const adapter = new LocalDataKidsAdapter();
  await adapter.run({ dryRun });
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exitCode = 1;
});
