// [open_spaces 중복 데이터 정제](2026-08-28) — 기존 누적 데이터에 대한 1회성 정제 실행.
// 판정 기준과 근거는 scripts/ingest/lib/dedupe-open-spaces.mjs 상단 주석 참고.
// 실측(dry-run, 2026-08-28): 총 139,461건 중 828개 그룹(1,685건)이 교차 출처 중복으로
// 판정됨 — survivor 828건 유지, 나머지 857건 삭제 대상.
import { pathToFileURL } from 'url';
import { loadEnv } from '../lib/load-env.mjs';
import { dedupeOpenSpaces } from '../ingest/lib/dedupe-open-spaces.mjs';

loadEnv();

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dryRun = process.argv.includes('--dry-run');
  dedupeOpenSpaces({ dryRun })
    .then((result) => {
      console.log(dryRun ? 'dry-run: 실제 UPDATE/DELETE 없이 대상 건수만 집계합니다.' : '실제 UPDATE/DELETE 완료.');
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((err) => {
      console.error('❌', err.message);
      process.exitCode = 1;
    });
}
