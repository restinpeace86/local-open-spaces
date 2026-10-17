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
import { pickBestCandidate, normalizeText } from './lib/address-match.mjs';
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

// [공원형 시설 이름 변형 재시도](2026-10-16/17 사용자 지시, 유아숲체험원 사례):
// "불암산공원 유아숲체험원은 불암산 유아숲체험원처럼.. 바꿔봐" + "배봉산근린공원
// 유아숲체험원 이런식으로 검색안될때 배봉산 유아숲체험원 이렇게도 검색해서
// 나오나 보고" — 공공데이터 원본 명칭에 "근린공원"/"도시자연공원" 등 공원형
// 접미어가 붙어있으면 네이버에 등록된 실제 이름과 달라 검색이 실패하는 경우가
// 실측으로 확인됐다. 복합어(근린공원 등)를 먼저 통째로 떼야 "배봉산근린 유아숲
// 체험원"처럼 "근린"만 덜렁 남는 것을 피할 수 있다 — 그래서 긴 복합어부터
// 순서대로 시도한다. 결정적 문자열 변형이라 LLM보다 먼저, 무료로 한 번 더
// 시도한다. 주소 교차검증은 그대로 거치므로(pickBestCandidate) 엉뚱한 변형이어도
// 오탐으로 이어지지 않고 그냥 매칭 실패로 끝난다 — 식당 등 다른 카테고리에도
// 안전하게 적용 가능(해당 접미어가 없으면 null을 반환해 재시도 자체를 건너뜀).
const PARK_SUFFIX_WORDS = ['도시자연공원', '근린공원', '생태공원', '시민공원', '공원'];

function buildGenericRetryTerm(name) {
  let stripped = name.replace(/\([^)]*\)/g, '');
  for (const word of PARK_SUFFIX_WORDS) {
    stripped = stripped.split(word).join('');
  }
  stripped = stripped.replace(/\s+/g, ' ').trim();
  return stripped && stripped !== name.trim() ? stripped : null;
}

// [주소로 검색하는 최종 재시도](2026-10-17 사용자 지시): "그래도 안나오면 우리쪽
// 주소로 검색해서 유아숲체험원이 나오는지 확인하고" — 이름으로는 아예 못 찾을
// 때, 같은 주소에 등록된 업체 목록에서 카테고리 키워드가 이름에 포함된 것을
// 찾는다(실측 확인: 주소로 검색하면 그 건물/부지에 등록된 모든 업체가 나옴,
// 예: "태릉선수촌" 부지의 여러 시설). 주소 검색 결과는 전부 그 주소에 있다는
// 것 자체가 이미 위치 확인이 끝난 거라 nameSimilarity/addressSimilarity 임계값을
// 다시 적용하지 않고, 카테고리 키워드 포함 여부만 본다 — 키워드가 없는
// 카테고리(예: 식당)는 이 단계를 호출하지 않으면 그만이라 안전하다.
function findByAddressSearchResult(results, categoryKeyword) {
  const matches = results.filter((r) => r.name.includes(categoryKeyword));
  // 같은 주소에 같은 키워드를 포함한 업체가 여러 개면(드물지만 가능) 어느 걸
  // 골라야 할지 근거가 없다 — 추측하지 않고 미매칭으로 남긴다(제3장 제5조).
  return matches.length === 1 ? matches[0] : null;
}

async function matchOneRestaurant(row, { apiKey, delayMs, addressSearchCategoryKeyword }) {
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

  if (apiKey) {
    const suggestedTerm = await suggestSearchTerm({ name: row.명칭, address: row.주소, apiKey });
    if (suggestedTerm && suggestedTerm !== row.명칭) {
      const { results: secondResults, status: secondStatus } = await searchNaverPlaces(suggestedTerm);
      if (secondStatus === 429) return { outcome: 'RATE_LIMITED' };

      const secondMatch = pickBestCandidate(target, secondResults);
      if (secondMatch) return { outcome: 'MATCHED', candidate: secondMatch.candidate };

      await sleep(delayMs);
    }
  }

  if (addressSearchCategoryKeyword) {
    const { results: addressResults, status: addressStatus } = await searchNaverPlaces(row.주소);
    if (addressStatus === 429) return { outcome: 'RATE_LIMITED' };

    const addressMatch = findByAddressSearchResult(addressResults, addressSearchCategoryKeyword);
    if (addressMatch) return { outcome: 'MATCHED', candidate: addressMatch };
  }

  return { outcome: 'NOT_FOUND' };
}

// [실측으로 발견한 희박 주소로 덮어쓰는 회귀](2026-10-17, 전체 재매칭 결과
// 검수 중 발견) — "북서울꿈의숲 유아숲체험원"은 네이버 등록명도 정확히 같아
// 이름 기준으로는 올바르게 매칭됐지만, 네이버 쪽 주소가 "서울특별시 강북구"
// 뿐이라(동/번지 없음) 그대로 덮어쓰면 원래 갖고 있던 상세 주소를 쓸모없는
// 값으로 되돌리는 꼴이 된다. address-match.mjs가 이미 "너무 짧은 주소는
// 근거로 못 쓴다"고 판단하는 것과 같은 기준(시/도+시/군/구만 있고 그 뒤가
// 거의 없음)으로, 짧은 주소로는 덮어쓰지 않는다.
const MIN_ADDRESS_LENGTH_TO_ADOPT = 10;

function isAddressDetailedEnough(address) {
  return Boolean(address) && normalizeText(address).length >= MIN_ADDRESS_LENGTH_TO_ADOPT;
}

// [이름이 정확히 같으면 지번을 네이버 쪽으로 보정](2026-10-17 사용자 지시):
// "정확히 같은 이름인데 지번이 다르면 지번을 네이버껄로 바꿔" — 공원/산림
// 시설은 우리 쪽 원본 지번이 네이버의 등록 지번과 정확히 안 맞을 수 있는데,
// 이름이 완전히 같다면 네이버 쪽 주소를 더 신뢰할 수 있는 최신 등록 정보로
// 본다. 이름이 "포함"(지점명 등)으로만 맞은 경우는 다른 지점일 수 있어
// 덮어쓰지 않는다 — 완전 일치일 때만 적용한다. 네이버 주소가 너무 짧으면
// (위 사례) 오히려 정보가 줄어드는 것이므로 덮어쓰지 않고 우리 주소를 유지한다.
function resolveFinalAddress(row, candidate) {
  const isExactName = normalizeText(row.명칭) === normalizeText(candidate.name);
  if (!isExactName) return row.주소;
  const naverAddress = candidate.fullAddress ?? candidate.address;
  return isAddressDetailedEnough(naverAddress) ? naverAddress : row.주소;
}

export async function run({
  csvPath = CSV_PATH,
  limit = Infinity,
  apiKey = process.env.GEMINI_API_KEY,
  delayMs = REQUEST_DELAY_MS,
  addressSearchCategoryKeyword = null,
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

    const result = await matchOneRestaurant(row, { apiKey, delayMs, addressSearchCategoryKeyword });
    if (result.outcome === 'MATCHED') {
      row.네이버플레이스ID = result.candidate.id;
      row.네이버플레이스URL = buildPlaceUrl(result.candidate.id);
      row.주소 = resolveFinalAddress(row, result.candidate);
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
// [요청 간격 조정 가능](2026-10-16) — 1,594건 식당 전체 실행 때 500ms 간격이
// 네이버 WAF에 걸린 전례(실측: 1,334건 429)가 있어, 카테고리/건수에 맞게
// 호출부가 직접 더 느린 간격을 줄 수 있게 3번째 인자로 열어둔다.
// [주소 검색 카테고리 키워드](2026-10-17) — 5번째 인자로 넘기면 이름 검색이
// 전부 실패했을 때 주소로 검색해 그 키워드가 포함된 업체를 찾는 최종 재시도를
// 켠다(예: 유아숲체험원은 "유아숲체험"). 식당처럼 이름이 다양한 카테고리는
// 비워두면 그만이라 하위 호환이 깨지지 않는다.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const csvPathArg = process.argv[2] ? path.resolve(process.cwd(), process.argv[2]) : CSV_PATH;
  const limitArg = process.argv[3] ? Number(process.argv[3]) : Infinity;
  const delayMsArg = process.argv[4] ? Number(process.argv[4]) : REQUEST_DELAY_MS;
  const addressSearchCategoryKeywordArg = process.argv[5] || null;
  run({
    csvPath: csvPathArg,
    limit: limitArg,
    delayMs: delayMsArg,
    addressSearchCategoryKeyword: addressSearchCategoryKeywordArg,
  })
    .then((stats) => {
      console.log(`✅ 검색/매칭 완료(${csvPathArg}):`, stats);
    })
    .catch((err) => {
      console.error('❌ 검색/매칭 실패:', err.message);
      process.exit(1);
    });
}
