// CLI 진입점 — 실제 수집 로직은 adapters/cultural-facility-summary-adapter.mjs (BaseCollectorAdapter 구현체)
import { loadEnv } from '../lib/load-env.mjs';
import { CulturalFacilitySummaryAdapter } from './adapters/cultural-facility-summary-adapter.mjs';

loadEnv();

const dryRun = process.argv.includes('--dry-run');

async function main() {
  const adapter = new CulturalFacilitySummaryAdapter();
  await adapter.run({ dryRun });
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exitCode = 1;
});
