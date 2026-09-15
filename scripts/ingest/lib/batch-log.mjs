import { createAdminClient } from './supabase-admin.mjs';
import { getAgentMeta } from './pipeline-agent-registry.mjs';

// [파이프라인 로그 DB화](2026-09-15 사용자 지시, implementation/todo.md [개선사항 3]):
// "기존에 마크다운 파일(pipeline-log.md)에 기록하던 파이프라인 실행 로그 방식을 폐기하고,
// 파이프라인 실행 결과를 데이터베이스에 구조화된 데이터로 직접 적재" — 기존
// docs/pipeline-log.md 파일에 표를 append하던 로직을 걷어내고 pipeline_logs 테이블에
// 소스(에이전트)당 1행씩 insert한다.
//
// [기존 이중 로깅 통합] 원래는 개별 어댑터의 run() 내부(BaseCollectorAdapter →
// pipeline-log.mjs의 recordPipelineRun)와 배치 오케스트레이터(이 파일)가 각각 별도
// 시점에 마크다운에 기록했다(전자: 상세 <details> 블록, 후자: 배치 요약 표). DB로
// 옮기면서 두 기록이 같은 실행을 가리키는 중복 행을 만들지 않도록, 배치 오케스트레이터가
// 이미 모든 소스(원본 수집 4~16개 + 후처리 단계 전부)의 최종 result를 한 곳에 모아 받고
// 있다는 점(run-daily.mjs/run-monthly.mjs가 STEPS 실행 결과를 전부 results 배열에 push)에
// 착안해 이 함수 하나만 DB에 기록하는 단일 창구로 삼았다(recordPipelineRun은 이제 아무것도
// 쓰지 않는다 — pipeline-log.mjs 참고). "상세 <details>" 블록이 담던 테이블별
// 세부 수치(perTable/errorCounts/excludedCount)는 meta_data JSON에 그대로 보존된다.
//
// [검증 문구(수신 vs 적재+에러+제외) 미보존] 마크다운 버전은 배치 전체 합계를 텍스트
// 한 줄로 남겼지만, 이는 여러 행의 파생값이라 DB에는 원본 수치만 저장하고 집계는 관리자
// 화면(조회 시점)에서 계산한다 — 저장 시점 문구를 고정하면 나중에 집계 로직을 고쳐도
// 과거 로그의 문구가 갱신되지 않는 문제를 피할 수 있다.
function splitTableCounts(result) {
  if (result.targetTable === 'multi') {
    return { events: result.perTable?.events ?? 0, openSpaces: result.perTable?.open_spaces ?? 0 };
  }
  if (result.targetTable === 'events') {
    return { events: result.count ?? 0, openSpaces: 0 };
  }
  return { events: 0, openSpaces: result.count ?? 0 };
}

function derivePeriod(batchName) {
  if (batchName.includes('Daily')) return 'daily';
  if (batchName.includes('Monthly')) return 'monthly';
  return null;
}

function buildRow({ batchName, period, result }) {
  const agentName = result.sourceKey ?? result.source ?? '(알 수 없음)';
  const meta = getAgentMeta(agentName);

  if (result.failed) {
    return {
      agent_name: agentName,
      status: 'FAILED',
      error_message: result.note ?? '(사유 미기록)',
      meta_data: { batchName, source: result.source ?? null },
      description: meta.description,
      period,
    };
  }

  const { events, openSpaces } = splitTableCounts(result);
  // [SEOUL_YEYAK 등 targetTable:'multi' 부분 실패] open_spaces/events 중 한쪽 테이블
  // upsert만 실패해도 failed:true는 아니지만(무중단 원칙 — 성공한 다른 테이블 건수는
  // 계속 보고해야 함) 실패 사실 자체는 status에 반영해야 한다.
  const isPartialFailure = result.hasPartialFailure === true;
  return {
    agent_name: agentName,
    status: isPartialFailure ? 'FAILED' : 'OK',
    error_message: isPartialFailure ? (result.note ?? '테이블별 부분 실패') : null,
    meta_data: {
      batchName,
      source: result.source ?? null,
      rawCount: result.rawCount ?? null,
      eventsCount: events,
      openSpacesCount: openSpaces,
      safeMergeCount: result.safeMergeCount ?? 0,
      errorCount: result.errorCount ?? 0,
      excludedCount: result.excludedCount ?? 0,
      excludeFromVerification: result.excludeFromVerification ?? false,
      perTable: result.perTable ?? null,
      errorCounts: result.errorCounts ?? null,
      note: result.note ?? null,
    },
    description: meta.description,
    period,
  };
}

// results: 각 소스의 run()/run({dryRun}) 반환값을 그대로 배열로 넘긴다. 실행 자체가 예외를
// 던진 소스는 { failed: true, source, sourceKey, note } 형태로 넣어야 한다 — 실패한 소스도
// 빠지지 않고 FAILED 행으로 남아야 배치 전체 상태가 투명해진다(제5장 제11조 무중단 원칙:
// 배치는 한 소스 실패로 중단되지 않고, 실패 사실은 숨기지 않는다).
export async function recordBatchRun({ batchName, results }) {
  if (!results || results.length === 0) return;

  const period = derivePeriod(batchName);
  const rows = results.map((result) => buildRow({ batchName, period, result }));

  try {
    const client = createAdminClient();
    const { error } = await client.from('pipeline_logs').insert(rows);
    if (error) {
      console.error(`[batch-log] pipeline_logs insert 실패(배치 자체는 계속 진행): ${error.message}`);
    }
  } catch (err) {
    // 로깅 실패가 배치 자체를 중단시켜서는 안 된다(제5장 제11조).
    console.error(`[batch-log] pipeline_logs insert 예외(배치 자체는 계속 진행): ${err.message}`);
  }
}
