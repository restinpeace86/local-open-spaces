// CLI 진입점 — 실제 수집 로직은 adapters/rural-education-farm-adapter.mjs
// (BaseCollectorAdapter 구현체).
// ⚠️ 실행 전 .env.local에 NONGSARO_API_KEY(농사로 자체 발급 키, data.go.kr의
// PUBLIC_DATA_API_KEY와 별개), VWORLD_API_KEY 설정 필요. 2026-08-29 기준 실제 키가 없어
// 라이브 검증이 안 된 상태다 — 어댑터 파일 상단 주석 참고.
import { loadEnv } from '../lib/load-env.mjs';
import { RuralEducationFarmAdapter } from './adapters/rural-education-farm-adapter.mjs';

loadEnv();

const dryRun = process.argv.includes('--dry-run');

async function main() {
  const adapter = new RuralEducationFarmAdapter();
  await adapter.run({ dryRun });
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exitCode = 1;
});
