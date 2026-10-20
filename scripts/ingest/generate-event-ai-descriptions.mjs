// [설명글 감성 톤 재작성 — 이벤트](2026-10-21 todo.md 개선사항2 사용자 지시):
// "글 쓰는것도 기본 글과 설명있으면 이를 가지고 AI가 글쓰는것도 좋을 것 같아" +
// "전체적으로 감성적이고 부드러운 톤으로". 전체 일괄 재작성은 보류하고
// "신규/인기 스팟부터 단계적으로"로 범위를 좁혔다(사용자 확인) — 이 스크립트는
// 매 실행마다 소수(BATCH_SIZE)씩만 처리하고, 우선순위는 ①이미 맘스픽 리뷰가
// 달린 이벤트(인기 — popular-spots/route.ts가 이미 쓰는 것과 동일한 대리 신호,
// 이 앱엔 조회수 집계가 없어 추측 금지 원칙상 새로 지어내지 않는다) ②나머지는
// 최근 생성분(신규, created_at desc) 순이다.
//
// [EVENT 한정](2026-10-21): SPACE(스팟)는 description 필드/노출 영역 자체가
// 없어(실측 확인) 이번 범위에 포함하지 않았다. 마이그레이션 파일 주석 참고.
//
// [검토 게이트 없음](2026-10-21 사용자 확인 "생성되면 바로 공개"): 생성 즉시
// events.ai_description에 저장 — 관리자 승인 단계 없음.
//
// [테스트 가능한 구조](write-back-naver-place-id.mjs와 동일 패턴): env 체크/
// 클라이언트 생성을 모듈 최상단이 아니라 run() 안에서 지연 수행한다 — 테스트가
// 이 파일을 import하는 순간 바로 process.exit되는 것을 막는다.
import { pathToFileURL } from 'url';
import { loadEnv } from '../lib/load-env.mjs';
import { generateDescription } from './lib/event-ai-description.mjs';

loadEnv();

const BATCH_SIZE = 20;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// [실측 버그 수정](2026-10-21): 처음엔 popular-spots/route.ts처럼 후보 ID 목록을
// `.in('event_id', eventIds)`로 필터링했는데, 실제 대상 건수(2,009건, 실측 확인)가
// 많아 PostgREST 요청 URL이 너무 길어져 "Bad Request"로 실패했다(supabase-admin.mjs
// 주석의 "500건 URL 길이 제한" 문제와 동일 종류). mom_pick_posts는 이벤트 수보다
// 훨씬 적을 것으로 보여(실측: event_id 보유 행 0건) 후보 ID로 필터링하지 않고
// event_id가 있는 행 전체를 가져와 JS에서 교집합을 구한다 — 테이블이 커지면 이
// 가정도 재검증 필요.
async function fetchReviewedEventIds(client) {
  const { data, error } = await client.from('mom_pick_posts').select('event_id').not('event_id', 'is', null);
  if (error) throw new Error(`맘스픽 리뷰 조회 실패: ${error.message}`);
  return new Set((data ?? []).map((row) => row.event_id).filter(Boolean));
}

const CANDIDATE_PAGE_SIZE = 1000;

// [PostgREST 1,000건 묵시적 상한 수정](2026-10-21 실측): .range() 없이 조회하면
// PostgREST가 기본 1,000건에서 조용히 자른다(이 프로젝트에서 반복적으로 발견된
// 패턴, get-nearby.ts/get_open_spaces_by_category_min과 동일한 원인). 실측 확인:
// 실제 후보 2,009건인데 .range() 없이는 1,000건만 조회됐다 — 전부 가져올 때까지
// 페이지네이션한다.
async function fetchAllCandidateRows(client) {
  const rows = [];
  for (let from = 0; ; from += CANDIDATE_PAGE_SIZE) {
    // eslint-disable-next-line no-await-in-loop
    const { data, error } = await client
      .from('events')
      .select('id, title, description, created_at')
      .eq('is_active', true)
      .not('description', 'is', null)
      .is('ai_description', null)
      .order('created_at', { ascending: false })
      .range(from, from + CANDIDATE_PAGE_SIZE - 1);
    if (error) throw new Error(`대상 조회 실패: ${error.message}`);
    rows.push(...(data ?? []));
    if ((data ?? []).length < CANDIDATE_PAGE_SIZE) break;
  }
  return rows;
}

// [배치 대상 선정] description은 있고 ai_description은 아직 없는 활성 이벤트
// 전부를 후보로 가져온 뒤(이 테이블 규모에서는 전수 조회가 과하지 않다 — 다른
// 배치들도 동일하게 is_active 전체를 그대로 조회한다), 인기(리뷰 존재) → 최신순
// (created_at desc)으로 정렬해 앞에서 batchSize개만 처리한다.
export async function fetchCandidates(client, batchSize = BATCH_SIZE) {
  const data = await fetchAllCandidateRows(client);

  const reviewedIds = await fetchReviewedEventIds(client);
  const sorted = [...(data ?? [])].sort((a, b) => {
    const aReviewed = reviewedIds.has(a.id) ? 0 : 1;
    const bReviewed = reviewedIds.has(b.id) ? 0 : 1;
    if (aReviewed !== bReviewed) return aReviewed - bReviewed;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
  return { rows: sorted.slice(0, batchSize), totalCandidates: data?.length ?? 0, reviewedIds };
}

export async function run({ dryRun = false } = {}) {
  const openaiApiKey = process.env.OPENAI_API_KEY;
  const geminiApiKey = process.env.GEMINI_API_KEY;
  // [OpenAI 선 사용, Gemini 폴백](2026-10-21 사용자 지시): "한쪽 사용하고 나서
  // 무료 비용끝나면 다른 한쪽 사용" — 둘 다 없으면 애초에 아무것도 생성할 수 없다.
  if (!openaiApiKey && !geminiApiKey) {
    throw new Error('OPENAI_API_KEY와 GEMINI_API_KEY가 모두 없습니다 — 최소 하나는 필요합니다.');
  }
  if (!openaiApiKey) {
    console.warn('⚠️  OPENAI_API_KEY가 없어 Gemini만 사용합니다(설정하면 OpenAI를 우선 시도).');
  }

  const { createAdminClient } = await import('./lib/supabase-admin.mjs');
  const client = createAdminClient();

  console.log('📋 설명글 재작성 대상(description 있음 + ai_description 없음) 조회 중...');
  const { rows, totalCandidates, reviewedIds } = await fetchCandidates(client);
  console.log(
    `✅ 전체 대상 ${totalCandidates}건 중 이번 실행 ${rows.length}건 처리(인기 우선, 나머지는 최신순).${dryRun ? ' (--dry-run: DB 저장 생략)' : ''}`
  );
  if (rows.length === 0) {
    console.log('처리할 대상이 없습니다 — 종료합니다.');
    return { processed: 0, succeeded: 0, failed: 0 };
  }

  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const isPopular = reviewedIds.has(row.id);
    try {
      // eslint-disable-next-line no-await-in-loop
      const rewritten = await generateDescription(row.title, row.description, { openaiApiKey, geminiApiKey });
      if (!dryRun) {
        // eslint-disable-next-line no-await-in-loop
        const { error } = await client.from('events').update({ ai_description: rewritten }).eq('id', row.id);
        if (error) throw new Error(`DB 갱신 실패: ${error.message}`);
      }
      succeeded += 1;
      console.log(`  [${i + 1}/${rows.length}] "${row.title.slice(0, 30)}"${isPopular ? '(인기)' : ''} → 재작성 완료`);
    } catch (err) {
      failed += 1;
      console.error(`  ❌ [${row.id}] "${row.title.slice(0, 30)}": ${err.message}`);
    }
    if (i < rows.length - 1) {
      // eslint-disable-next-line no-await-in-loop
      await sleep(1000);
    }
  }

  console.log(`\n📊 처리 결과: 성공 ${succeeded}건 / 실패 ${failed}건 (이번 실행 대상 ${rows.length}건)`);
  return { processed: rows.length, succeeded, failed };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dryRun = process.argv.includes('--dry-run');
  run({ dryRun })
    .then((stats) => {
      console.log('✅ 완료:', stats);
    })
    .catch((err) => {
      console.error('❌ 스크립트 실행 실패:', err.message);
      process.exit(1);
    });
}
