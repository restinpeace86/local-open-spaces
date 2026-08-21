// CLI 진입점 — 실제 수집 로직은 adapters/gg-events-adapter.mjs (BaseCollectorAdapter 구현체)
// 실행 전 .env.local에 KAKAO_REST_API_KEY 설정 필요 (지오코딩용, JS 지도 키와는 다른 값)
import { loadEnv } from '../lib/load-env.mjs';
import { GgEventsAdapter } from './adapters/gg-events-adapter.mjs';

loadEnv();

const dryRun = process.argv.includes('--dry-run');

async function main() {
  const adapter = new GgEventsAdapter();
  await adapter.run({ dryRun });
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exitCode = 1;
});
