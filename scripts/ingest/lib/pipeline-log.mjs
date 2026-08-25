import fs from 'fs';
import path from 'path';

const LOG_PATH = path.resolve(process.cwd(), 'docs/pipeline-log.md');
const SEPARATOR_ROW = '| :--- | :--- | :--- | :--- | :--- | :--- |';

function formatKstTimestamp(date = new Date()) {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const d = String(kst.getUTCDate()).padStart(2, '0');
  const hh = String(kst.getUTCHours()).padStart(2, '0');
  const mm = String(kst.getUTCMinutes()).padStart(2, '0');
  return `${y}-${m}-${d} ${hh}:${mm}`;
}

// 원본 fetch() 반환값 형태가 어댑터마다 다르다(대부분 배열, gg-culture-events-adapter.mjs처럼
// { cultureEventItems, foundationEventItems } 같은 배열 묶음 객체도 있음) — 두 형태 모두에서
// "원본 수신 건수"를 뽑아 최종 유효 행 수와 비교해 파싱/스킵 에러 건수를 추정한다.
function countRawItems(raw) {
  if (Array.isArray(raw)) return raw.length;
  if (raw && typeof raw === 'object') {
    return Object.values(raw).reduce((sum, v) => sum + (Array.isArray(v) ? v.length : 0), 0);
  }
  return null;
}

// Task 9-6-14(Decision 012): 수집 워크플로우 실행 시 수집 건수/파싱 에러 내역을 docs/pipeline-log.md
// 표 최상단(헤더 바로 아래)에 한 줄씩 추가한다. BaseCollectorAdapter.run()이 모든 어댑터의 공통
// 진입점이라 여기 한 곳만 연결하면 개별 어댑터를 고치지 않아도 전체 소스에 자동 적용된다
// (제5장 제4조 기존 구조 우선). 로그 파일이 없는 환경(단위 테스트 등)에서는 조용히 건너뛴다.
export function recordPipelineRun({ sourceKey, rawCount, count, status, note }) {
  if (!fs.existsSync(LOG_PATH)) return;

  const errorCount = typeof rawCount === 'number' ? Math.max(0, rawCount - count) : 'N/A';
  const isCritical = status === 'FAILED' || count === 0;
  const statusBadge = isCritical ? '🚨 [CRITICAL]' : '✅ [OK]';
  const row = `| ${formatKstTimestamp()} | ${sourceKey} | ${count} | ${errorCount} | ${statusBadge} | ${note ?? ''} |`;

  const lines = fs.readFileSync(LOG_PATH, 'utf8').split('\n');
  const separatorIndex = lines.findIndex((line) => line.trim() === SEPARATOR_ROW);

  if (separatorIndex === -1) {
    fs.appendFileSync(LOG_PATH, `${row}\n`);
    return;
  }

  lines.splice(separatorIndex + 1, 0, row);
  fs.writeFileSync(LOG_PATH, lines.join('\n'));
}

export { countRawItems };
