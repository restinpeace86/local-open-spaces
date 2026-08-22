// CLI 진입점 — 실제 수집 로직은 adapters/gg-culture-events-adapter.mjs (BaseCollectorAdapter 구현체)
// 실행 전 .env.local에 GG_DATA_API_KEY, VWORLD_API_KEY 설정 필요(GEMINI_API_KEY는 선택 — 미설정 시
// 카테고리가 ETC로 폴백됨).
import { loadEnv } from '../lib/load-env.mjs';
import { GgCultureEventsAdapter } from './adapters/gg-culture-events-adapter.mjs';

loadEnv();

const dryRun = process.argv.includes('--dry-run');

async function main() {
  const adapter = new GgCultureEventsAdapter();
  await adapter.run({ dryRun });
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exitCode = 1;
});
