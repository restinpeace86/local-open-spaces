// CLI 진입점 — 실제 수집 로직은 adapters/gg-splash-events-adapter.mjs.
// 실행 전 .env.local에 GG_DATA_API_KEY, VWORLD_API_KEY 설정 필요.
import { loadEnv } from '../lib/load-env.mjs';
import { GgSplashEventsAdapter } from './adapters/gg-splash-events-adapter.mjs';

loadEnv();

const dryRun = process.argv.includes('--dry-run');

async function main() {
  const adapter = new GgSplashEventsAdapter();
  await adapter.run({ dryRun });
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exitCode = 1;
});
