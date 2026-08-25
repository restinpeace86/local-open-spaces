import fs from 'fs';
import path from 'path';

const LOG_PATH = path.resolve(process.cwd(), 'docs/pipeline-log.md');

// [배치 자동화 및 로깅 체계 확정](2026-08-25): 기존 pipeline-log.mjs의 recordPipelineRun()은
// "소스 1개 실행 1행"을 표 최상단에 끼워 넣는 형식이라(Decision 012부터 이어짐), 여러 소스를
// 한 번에 묶어 실행하는 배치(run-daily.mjs/run-weekly.mjs) 단위의 리포트에는 맞지 않는다.
// 사용자가 지정한 새 포맷("## [타임스탬프] [배치명] Ingestion Log" 헤더 + 소스별 표 + 검증
// 문구)은 완전히 별개의 로깅 단위라 별도 모듈로 분리했다 — 기존 recordPipelineRun()은 개별
// 어댑터의 run() 내부에서 계속 그대로 호출되므로(변경 없음) 이 모듈은 그 위에 배치 단위
// 요약을 "추가로" 남기는 것이지 대체하는 것이 아니다.
function formatKstTimestamp(date = new Date()) {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const d = String(kst.getUTCDate()).padStart(2, '0');
  const hh = String(kst.getUTCHours()).padStart(2, '0');
  const mm = String(kst.getUTCMinutes()).padStart(2, '0');
  const ss = String(kst.getUTCSeconds()).padStart(2, '0');
  return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
}

// targetTable: 'multi'(예: SeoulYeyakAdapter)는 result.perTable.{events,open_spaces}에 이미
// 테이블별 건수가 나뉘어 있다. 단일 테이블 소스는 result.count 전부가 그 테이블 몫이다.
function splitTableCounts(result) {
  if (result.targetTable === 'multi') {
    return { events: result.perTable?.events ?? 0, openSpaces: result.perTable?.open_spaces ?? 0 };
  }
  if (result.targetTable === 'events') {
    return { events: result.count ?? 0, openSpaces: 0 };
  }
  return { events: 0, openSpaces: result.count ?? 0 };
}

// results: 각 소스의 run()/run({dryRun}) 반환값을 그대로 배열로 넘긴다. 실행 자체가 예외를
// 던진 소스는 { failed: true, source, sourceKey, note } 형태로 넣어야 한다 — 실패한 소스도
// 표에서 빠지지 않고 "❌ 실행 실패"로 남아야 배치 전체 상태가 투명해진다(제5장 제11조
// 무중단 원칙: 배치는 한 소스 실패로 중단되지 않고, 실패 사실은 숨기지 않는다).
export function recordBatchRun({ batchName, results }) {
  if (!fs.existsSync(LOG_PATH)) return;

  const timestamp = formatKstTimestamp();
  const tableRows = [];

  let totalRaw = 0;
  let totalLoaded = 0;
  let totalError = 0;
  let totalExcluded = 0;
  let hasUnknownRaw = false;

  for (const r of results) {
    const label = r.source ?? r.sourceKey ?? '(알 수 없음)';

    if (r.failed) {
      tableRows.push(`| ${label} | - | 0 | 0 | 0 | - | ❌ 실행 실패: ${r.note ?? '(사유 미기록)'} |`);
      hasUnknownRaw = true;
      continue;
    }

    const { events, openSpaces } = splitTableCounts(r);
    const rawCell = typeof r.rawCount === 'number' ? r.rawCount : '-';

    // excludeFromVerification: 신규 수집이 아니라 이미 적재된 행을 보강하는 후처리 단계
    // (예: enrich-gg-culture-event-locations — 좌표 정밀도만 CITY_APPROX/UNKNOWN→EXACT로
    // 승격, 신규 row가 아님)는 표에는 남기되 "전체 수신 vs 적재" 드롭 검증 합계에는 넣지
    // 않는다 — 같은 행을 다른 소스(gg-culture-events)가 이미 집계했는데 여기서 또 더하면
    // 검증 수치가 왜곡된다.
    if (!r.excludeFromVerification) {
      if (typeof r.rawCount === 'number') totalRaw += r.rawCount;
      else hasUnknownRaw = true;
      totalLoaded += events + openSpaces;
      totalError += r.errorCount ?? 0;
      totalExcluded += r.excludedCount ?? 0;
    }

    tableRows.push(
      `| ${label} | ${rawCell} | ${events} | ${openSpaces} | ${r.safeMergeCount ?? 0} | ${r.errorCount ?? 0} | ${r.note ?? ''} |`
    );
  }

  const accounted = totalLoaded + totalError + totalExcluded;
  const unexplainedDrop = totalRaw - accounted;
  const verificationLine = hasUnknownRaw
    ? `**검증**: 전체 RAW 수신 ${totalRaw}건(일부 소스 실패/미확인 — 완전한 대조 불가) vs DB 적재 ${totalLoaded}건 (+에러 ${totalError}건 +범위제외 ${totalExcluded}건)`
    : unexplainedDrop === 0
      ? `**검증**: 전체 RAW 수신 ${totalRaw}건 vs DB 적재 ${totalLoaded}건 (+에러 ${totalError}건 +범위제외 ${totalExcluded}건) → **드롭 0건 확인 ✅**`
      : `**검증**: 전체 RAW 수신 ${totalRaw}건 vs DB 적재 ${totalLoaded}건 (+에러 ${totalError}건 +범위제외 ${totalExcluded}건) → **드롭 ${unexplainedDrop}건 발견 ⚠️** (원인 미상 — 개별 소스 행 확인 필요)`;

  const block = [
    '',
    `## [${timestamp}] [${batchName}] Ingestion Log`,
    '',
    '| API 출처 식별자 (`source`) | RAW 수신 건수 | events 적재 건수 | open_spaces 적재 건수 | Safe Merge 건수 | 에러 건수 | 비고 |',
    '| :--- | ---: | ---: | ---: | ---: | ---: | :--- |',
    ...tableRows,
    '',
    verificationLine,
    '',
  ].join('\n');

  fs.appendFileSync(LOG_PATH, block);
}
