// CLI 진입점 — 실제 수집 로직은 adapters/rural-experience-village-adapter.mjs
// (BaseCollectorAdapter 구현체). 실행 전 .env.local에 PUBLIC_DATA_API_KEY, VWORLD_API_KEY
// 설정 필요(지오코딩은 좌표 결측 건에만 사용 — 실측상 원본이 전량 좌표를 제공함).
import { loadEnv } from '../lib/load-env.mjs';
import { RuralExperienceVillageAdapter } from './adapters/rural-experience-village-adapter.mjs';

loadEnv();

const dryRun = process.argv.includes('--dry-run');

async function main() {
  const adapter = new RuralExperienceVillageAdapter();
  await adapter.run({ dryRun });
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exitCode = 1;
});
