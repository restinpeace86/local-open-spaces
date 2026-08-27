// implementation/todo.md "[1단계 중분류(Category Mid) raw_data 원천 필드 우선 탐색 및
// Dry-run 시뮬레이션]" — 읽기 전용(SELECT만 사용) 시뮬레이션 스크립트. 실제 DB에는 어떤
// UPDATE도 수행하지 않는다.
//
// 이 프로젝트의 실제 DB 컬럼명은 `category_min`이다(지시문 원문의 "Category Mid"는 한글
// "중분류"의 영문 표기일 뿐, 신규 컬럼이 아니다 — [카테고리 정제 & 어드민 확장](2026-08-26)
// 작업에서 이미 `category_min`/`category_min_source`(RAW/RULE/MANUAL)로 구현되어 있음).
//
// 확장자 참고: 지시문은 `.ts`를 지정했으나, 이 프로젝트의 scripts/ 하위는 전부 순수 Node ESM
// (.mjs)이며 standalone .ts를 직접 실행할 tsx/ts-node 등의 런타임이 devDependencies에 없다
// (package.json 확인 완료). 새 런타임 의존성을 임의로 추가하는 대신(제5장 제4조 기존 구조
// 우선) 기존 scripts/ 관례를 그대로 따라 .mjs로 작성했다.
import { loadEnv } from '../lib/load-env.mjs';
import { createAdminClient } from '../ingest/lib/supabase-admin.mjs';

loadEnv();

const PAGE_SIZE = 1000;

// 소스별로 raw_data에서 중분류 후보로 쓸 수 있는 원천 필드를 어떻게 읽어낼지 정의한다.
// 이 목록 자체가 "0순위 원천 필드 동적 탐색"의 결과물이다(실제 raw_data 키 전수 스캔으로 확인).
function extractCandidateField(source, rawData) {
  if (!rawData) return null;
  switch (source) {
    case 'seoul_public_reservation':
      return rawData.MINCLASSNM || null;
    case 'seoul_public_culture':
      return rawData.CODENAME || null;
    case 'gg_public':
      return rawData.CATEGORY_NM || null;
    case 'tourapi_4.0':
      return rawData.cat3 || rawData.lclsSystm3 || null;
    default:
      return null;
  }
}

// seoul_public_reservation 전용: MINCLASSNM은 이미 [카테고리 정제 & 어드민 확장](2026-08-26)
// 결정으로 "곧바로 RAW 태깅"이 승인된 필드다(신규 판단 아님) — 값을 그대로 category_min으로
// 채택하는 시뮬레이션만 수행한다.
function simulateRawFieldPriority(source, candidateValue) {
  if (source === 'seoul_public_reservation') {
    return candidateValue || null;
  }
  return null; // 다른 소스는 승인된 0순위 규칙이 아직 없음 — 아래 "제안" 섹션에서 별도 시뮬레이션
}

// seoul_public_culture CODENAME → category_min 제안 매핑 (승인 대기, 시뮬레이션 전용 —
// category_rules 테이블에 실제 반영하지 않음). 기존 events 표준 중분류 값 중 장르 의미가
// 가장 가까운 것으로 초안 매핑했다.
const CODENAME_PROPOSAL_MAP = {
  '연극': '문화행사',
  '무용': '문화행사',
  '국악': '문화행사',
  '클래식': '문화행사',
  '콘서트': '문화행사',
  '뮤지컬/오페라': '문화행사',
  '독주/독창회': '문화행사',
  '영화': '문화행사',
  '축제-문화/예술': '지역축제/페스티벌',
  '축제-기타': '지역축제/페스티벌',
  '축제-전통/역사': '지역축제/페스티벌',
  '축제-시민화합': '지역축제/페스티벌',
  '축제-자연/경관': '지역축제/페스티벌',
  '축제-관광/체육': '지역축제/페스티벌',
  '전시/미술': '전시/관람',
  '교육/체험': '교육체험',
  // '기타'는 의미가 없어 매핑하지 않는다(그대로 NULL 유지 원칙 준수).
};

async function scanActiveEvents(supabase) {
  const rows = [];
  let lastId = null;
  for (;;) {
    let query = supabase
      .from('events')
      .select('id, source, category_min, category_min_source, raw_data')
      .eq('is_active', true)
      .order('id', { ascending: true })
      .limit(PAGE_SIZE);
    if (lastId) query = query.gt('id', lastId);
    const { data, error } = await query;
    if (error) throw new Error(`events 조회 실패: ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...data);
    lastId = data[data.length - 1].id;
    if (data.length < PAGE_SIZE) break;
  }
  return rows;
}

function main() {
  return createAdminClient();
}

async function run() {
  const supabase = main();
  console.log('▶ events(is_active=true) 전수 스캔 중 (Read-Only)...');
  const rows = await scanActiveEvents(supabase);
  console.log(`  스캔 대상: ${rows.length}건\n`);

  const bySource = {};
  for (const row of rows) {
    const s = row.source ?? '(null)';
    if (!bySource[s]) {
      bySource[s] = {
        total: 0,
        currentNull: 0,
        currentFilled: 0,
        candidateFieldPresent: 0,
        rawPriorityResolved: 0, // 승인된 0순위 규칙(MINCLASSNM)만
        proposalResolved: 0, // 미승인 제안 매핑(CODENAME 등) 시뮬레이션 전용
        rawVsExistingMismatch: 0, // 이미 RAW로 채워진 행 중 raw_data 값과 불일치
        ruleVsCandidateAgreement: {}, // RULE로 채워진 행에서 후보필드값=최종값 일치 건수 집계용
      };
    }
    const bucket = bySource[s];
    bucket.total += 1;
    const candidate = extractCandidateField(s, row.raw_data);
    if (candidate) bucket.candidateFieldPresent += 1;

    if (row.category_min == null) {
      bucket.currentNull += 1;
      const rawResolved = simulateRawFieldPriority(s, candidate);
      if (rawResolved) bucket.rawPriorityResolved += 1;
      else if (s === 'seoul_public_culture' && candidate && CODENAME_PROPOSAL_MAP[candidate]) {
        bucket.proposalResolved += 1;
      }
    } else {
      bucket.currentFilled += 1;
      if (row.category_min_source === 'RAW' && s === 'seoul_public_reservation') {
        if (candidate !== row.category_min) bucket.rawVsExistingMismatch += 1;
      }
      if (row.category_min_source === 'RULE' && candidate) {
        const agree = candidate === row.category_min;
        const k = agree ? 'agree' : 'disagree';
        bucket.ruleVsCandidateAgreement[k] = (bucket.ruleVsCandidateAgreement[k] ?? 0) + 1;
      }
    }
  }

  console.log('=== 소스별 raw_data 중분류 후보 필드 및 Dry-run 시뮬레이션 결과 ===\n');
  let totalNull = 0;
  let totalRawPriorityResolved = 0;
  let totalProposalResolved = 0;
  for (const [source, b] of Object.entries(bySource)) {
    totalNull += b.currentNull;
    totalRawPriorityResolved += b.rawPriorityResolved;
    totalProposalResolved += b.proposalResolved;
    console.log(`--- ${source} ---`);
    console.log(`  전체: ${b.total}건 | 현재 category_min NULL: ${b.currentNull}건 | 채워짐: ${b.currentFilled}건`);
    console.log(`  후보 원천 필드 보유: ${b.candidateFieldPresent}건`);
    console.log(`  [승인된 0순위 규칙 재적용 시뮬레이션] NULL 중 해소 가능: ${b.rawPriorityResolved}건`);
    if (b.proposalResolved > 0) {
      console.log(`  [미승인 제안 매핑 시뮬레이션, 승인 대기] NULL 중 추가 해소 가능: ${b.proposalResolved}건`);
    }
    if (source === 'seoul_public_reservation') {
      console.log(`  RAW 소스 기존 값 vs raw_data 재확인 불일치: ${b.rawVsExistingMismatch}건 (정합성 점검)`);
    }
    const agree = b.ruleVsCandidateAgreement.agree ?? 0;
    const disagree = b.ruleVsCandidateAgreement.disagree ?? 0;
    if (agree + disagree > 0) {
      const rate = ((agree / (agree + disagree)) * 100).toFixed(1);
      console.log(`  기존 RULE(텍스트 매칭) 최종값 vs 후보 원천 필드값 일치율: ${agree}/${agree + disagree} (${rate}%)`);
    }
    console.log('');
  }

  console.log('=== 종합 ===');
  console.log(`전체 스캔: ${rows.length}건, 현재 NULL 잔여: ${totalNull}건 (${((totalNull / rows.length) * 100).toFixed(2)}%)`);
  console.log(`승인된 0순위 원천 필드 우선 매핑 재적용 시 해소: ${totalRawPriorityResolved}건`);
  const afterApproved = totalNull - totalRawPriorityResolved;
  console.log(`  → 재적용 후 NULL 잔여: ${afterApproved}건 (${((afterApproved / rows.length) * 100).toFixed(2)}%)`);
  console.log(`(참고, 승인 대기) 제안 매핑까지 추가 반영 시 추가 해소: ${totalProposalResolved}건`);
  const afterProposal = afterApproved - totalProposalResolved;
  console.log(`  → 제안 반영 시 NULL 잔여: ${afterProposal}건 (${((afterProposal / rows.length) * 100).toFixed(2)}%)`);
  console.log('\n실제 DB에는 어떠한 UPDATE도 실행하지 않았다 (Read-Only Dry-run).');
}

run().catch((err) => {
  console.error('❌', err.message);
  process.exitCode = 1;
});
