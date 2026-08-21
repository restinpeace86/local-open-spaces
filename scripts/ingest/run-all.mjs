// implementation/todo.md 파이프라인 자동화: 7대 공공 API 수집 스크립트를 순차 실행한 뒤
// ai-tagger.mjs를 자동 연쇄 실행하고, 단계별 성공/실패·처리 건수를 ingest.log에 기록한다.
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { logIngest } from './lib/log.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const forwardedArgs = process.argv.slice(2);

const INGEST_SCRIPTS = [
  'city-park.mjs',
  'cultural-spaces.mjs',
  'seoul-public-reservation.mjs',
  'seoul-culture-events.mjs',
  'tour-api-festival.mjs',
];

function runScript(scriptFile) {
  const scriptPath = path.join(__dirname, scriptFile);
  const startedAt = Date.now();
  const result = spawnSync(process.execPath, [scriptPath, ...forwardedArgs], {
    stdio: ['inherit', 'pipe', 'pipe'],
    encoding: 'utf8',
  });
  const durationMs = Date.now() - startedAt;

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  const countMatch = (result.stdout ?? '').match(/완료:\s*(?:총\s*)?(\d+)건/);
  const count = countMatch ? Number(countMatch[1]) : null;
  const success = result.status === 0;

  logIngest(
    `  ${success ? '✅' : '❌'} ${scriptFile} (${durationMs}ms)` +
      `${count !== null ? ` — ${count}건` : ''}` +
      `${success ? '' : ` — 종료코드 ${result.status}`}`
  );

  return success;
}

function main() {
  logIngest(`▶ run-all 파이프라인 시작 (${INGEST_SCRIPTS.length}개 수집 스크립트)`);

  let allSucceeded = true;
  for (const script of INGEST_SCRIPTS) {
    const success = runScript(script);
    allSucceeded = allSucceeded && success;
  }

  logIngest(`  수집 단계 ${allSucceeded ? '전체 성공' : '일부 실패'} → ai-tagger.mjs 연쇄 실행`);

  const taggerResult = spawnSync(process.execPath, [path.join(__dirname, 'ai-tagger.mjs'), ...forwardedArgs], {
    stdio: 'inherit',
  });
  const taggerSuccess = taggerResult.status === 0;

  logIngest(
    `✅ run-all 파이프라인 종료 (수집: ${allSucceeded ? '성공' : '실패'}, 태깅: ${taggerSuccess ? '성공' : '실패'})`
  );

  process.exitCode = allSucceeded && taggerSuccess ? 0 : 1;
}

main();
