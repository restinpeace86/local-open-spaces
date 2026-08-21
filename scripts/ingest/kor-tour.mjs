// CLI 진입점 — 실제 수집 로직은 adapters/kor-tour-adapter.mjs (BaseCollectorAdapter 구현체)
import { loadEnv } from '../lib/load-env.mjs';
import { KorTourAdapter } from './adapters/kor-tour-adapter.mjs';

loadEnv();

const dryRun = process.argv.includes('--dry-run');
// Task 1: 문화시설(14)/레포츠(28)의 is_free: null 보완 — 전체 목록 수집과 분리된
// 선택적 플래그로만 detailIntro2를 호출한다 (N+1 방지).
const withDetail = process.argv.includes('--with-detail');

async function main() {
  const adapter = new KorTourAdapter({ detailContentTypeIds: withDetail ? [14, 28] : [] });
  await adapter.run({ dryRun });
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exitCode = 1;
});
