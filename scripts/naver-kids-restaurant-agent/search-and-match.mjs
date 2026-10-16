// [네이버 플레이스 키즈친화 스크래핑 에이전트 2단계](todo.md 개선사항4, 1~3단계):
// 식당.csv의 명칭/주소로 네이버 플레이스를 검색 → 이름+주소 교차 검증 → 실패 시
// LLM 보조 검색어로 재시도 → 확정되면 네이버 플레이스 ID/URL을 CSV에 추가한다.
//
// [재시작 가능(resumable) 설계] 1,594건을 매번 처음부터 전부 재검색하면 네이버에
// 과도한 요청을 보내고 오래 걸린다 — 이미 "네이버플레이스ID" 컬럼에 값이 있는 행은
// 건너뛴다. 매칭 실패도 빈 문자열이 아니라 NOT_FOUND 마커로 명시적으로 기록해(추측
// 금지 — "아직 시도 안 함"과 "시도했지만 못 찾음"을 구분), 재실행 시 실패 건을
// 무한히 재시도하지 않는다. 일정 건수마다 중간 저장해 중단되어도 그동안의 진행이
// 남는다.
import path from 'path';
import { pathToFileURL } from 'url';
import { loadEnv } from '../lib/load-env.mjs';
import { readCsvUtf8, writeCsvUtf8, mergeHeader } from './lib/csv.mjs';
import { searchNaverPlaces } from './lib/naver-search.mjs';
import { pickBestCandidate } from './lib/address-match.mjs';
import { suggestSearchTerm } from './lib/llm-search-term.mjs';

loadEnv();

const CSV_PATH = path.resolve(process.cwd(), 'metadata', '식당.csv');
const REQUIRED_COLUMNS = ['명칭', '주소', '위도', '경도', '네이버플레이스ID', '네이버플레이스URL'];
const NOT_FOUND_MARKER = 'NOT_FOUND';
// 네이버 WAF 429 레이트리밋 실측 전례(naver-crawl/route.ts)를 감안한 보수적 간격 —
// 한 건당 검색이 최대 2회(원본명 + LLM 재시도)라 429를 유발하지 않을 정도로 둔다.
const REQUEST_DELAY_MS = 500;
const SAVE_EVERY = 20;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildPlaceUrl(id) {
  return `https://map.naver.com/p/entry/place/${id}`;
}

// [공원형 시설 이름 변형 재시도](2026-10-16 사용자 지시, 유아숲체험원 사례):
// "불암산공원 유아숲체험원은 불암산 유아숲체험원처럼.. 바꿔봐" — 공공데이터
// 원본 명칭에 "공원"이 붙어있으면 네이버에 등록된 실제 이름과 달라 검색이
// 실패하는 경우가 실측으로 확인됐다. 결정적 문자열 변형이라 LLM보다 먼저,
// 무료로 한 번 더 시도한다. 주소 교차검증은 그대로 거치므로(pickBestCandidate)
// 엉뚱한 변형이어도 오탐으로 이어지지 않고 그냥 매칭 실패로 끝난다 — 식당 등
// 다른 카테고리에도 안전하게 적용 가능(이름에 "공원"이 없으면 null을 반환해
// 재시도 자체를 건너뜀).
function buildGenericRetryTerm(name) {
  const stripped = name
    .replace(/\([^)]*\)/g, '')
    .replace(/공원/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return stripped && stripped !== name.trim() ? stripped : null;
}

async function matchOneRestaurant(row, { apiKey, delayMs }) {
  const target = { name: row.명칭, address: row.주소 };

  const { results: firstResults, status: firstStatus } = await searchNaverPlaces(row.명칭);
  if (firstStatus === 429) return { outcome: 'RATE_LIMITED' };

  const firstMatch = pickBestCandidate(target, firstResults);
  if (firstMatch) return { outcome: 'MATCHED', candidate: firstMatch.candidate };

  await sleep(delayMs);

  const genericRetryTerm = buildGenericRetryTerm(row.명칭);
  if (genericRetryTerm) {
    const { results: genericResults, status: genericStatus } = await searchNaverPlaces(genericRetryTerm);
    if (genericStatus === 429) return { outcome: 'RATE_LIMITED' };

    const genericMatch = pickBestCandidate(target, genericResults);
    if (genericMatch) return { outcome: 'MATCHED', candidate: genericMatch.candidate };

    await sleep(delayMs);
  }

  if (!apiKey) return { outcome: 'NOT_FOUND' };

  const suggestedTerm = await suggestSearchTerm({ name: row.명칭, address: row.주소, apiKey });
  if (!suggestedTerm || suggestedTerm === row.명칭) return { outcome: 'NOT_FOUND' };

  const { results: secondResults, status: secondStatus } = await searchNaverPlaces(suggestedTerm);
  if (secondStatus === 429) return { outcome: 'RATE_LIMITED' };

  const secondMatch = pickBestCandidate(target, secondResults);
  if (secondMatch) return { outcome: 'MATCHED', candidate: secondMatch.candidate };

  return { outcome: 'NOT_FOUND' };
}

export async function run({
  csvPath = CSV_PATH,
  limit = Infinity,
  apiKey = process.env.GEMINI_API_KEY,
  delayMs = REQUEST_DELAY_MS,
} = {}) {
  const rows = readCsvUtf8(csvPath);
  const header = mergeHeader(rows, REQUIRED_COLUMNS);
  const stats = { matched: 0, notFound: 0, skipped: 0, rateLimited: 0 };
  let processed = 0;

  for (const row of rows) {
    if (row.네이버플레이스ID && row.네이버플레이스ID.trim()) {
      stats.skipped += 1;
      continue;
    }
    if (processed >= limit) break;

    const result = await matchOneRestaurant(row, { apiKey, delayMs });
    if (result.outcome === 'MATCHED') {
      row.네이버플레이스ID = result.candidate.id;
      row.네이버플레이스URL = buildPlaceUrl(result.candidate.id);
      stats.matched += 1;
    } else if (result.outcome === 'RATE_LIMITED') {
      // 429는 "이 식당을 못 찾았다"는 사실이 아니므로 NOT_FOUND로 기록하지 않고
      // 빈 값 그대로 둔다 — 다음 실행에서 다시 시도하도록.
      stats.rateLimited += 1;
    } else {
      row.네이버플레이스ID = NOT_FOUND_MARKER;
      row.네이버플레이스URL = '';
      stats.notFound += 1;
    }

    processed += 1;
    if (processed % SAVE_EVERY === 0) {
      writeCsvUtf8(csvPath, header, rows);
    }
    await sleep(delayMs);
  }

  writeCsvUtf8(csvPath, header, rows);
  return { ...stats, processed, total: rows.length };
}

// [비주기적 수동 실행](2026-10-15 사용자 지시): "주기적으로 할건 아니고..
// 새로운 식당들에 대하여 csv파일로 추출하면 그 파일에 대하여 수동으로
// 돌릴수있도록 해놔" — pipeline-agent-registry.mjs(일일/월간 자동배치)에
// 등록하지 않고, 사용자가 필요할 때마다 임의의 CSV 경로를 지정해 직접
// 실행하는 용도로만 둔다. 인자 없이 실행하면 기존 metadata/식당.csv를
// 그대로 쓴다(하위 호환, classify-unassigned-category-min.mjs와 동일한
// "위치 인자 + 기본값" 관례).
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const csvPathArg = process.argv[2] ? path.resolve(process.cwd(), process.argv[2]) : CSV_PATH;
  const limitArg = process.argv[3] ? Number(process.argv[3]) : Infinity;
  run({ csvPath: csvPathArg, limit: limitArg })
    .then((stats) => {
      console.log(`✅ 검색/매칭 완료(${csvPathArg}):`, stats);
    })
    .catch((err) => {
      console.error('❌ 검색/매칭 실패:', err.message);
      process.exit(1);
    });
}
