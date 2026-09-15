// [이벤트/체험 스팟 다중 소스 가격 수집](2026-09-15 사용자 지시, implementation/todo.md
// [개선사항 6]): 4개 소스(블로그 큐레이션/원천 설명/공식 홈페이지/정형 요금 필드)에서
// 가격·연령 후보를 각각 독립적으로 뽑아내는 순수 로직. 실제 네트워크 요청(블로그 본문
// 재조회, 공식 홈페이지 크롤링)은 API 라우트(price-candidates/route.ts)가 담당하고,
// 여기는 "주어진 텍스트/데이터에서 후보를 뽑는" 부분만 다뤄 단위 테스트하기 쉽게 한다.
import { parse } from 'node-html-parser';
import { parsePriceFromText } from './parse-price-from-text';
import { AGE_HINT_KEYWORDS } from './curation-badges';

export type PriceCandidateSource = 'blog' | 'description' | 'official_site' | 'raw_field';
export type PriceCandidateStatus = 'found' | 'not_found' | 'error';

export type PriceCandidate = {
  source: PriceCandidateSource;
  status: PriceCandidateStatus;
  priceText: string | null;
  ageText: string | null;
  // [연령별 가격 구간 파싱](2026-09-15 사용자 지시 보완): "성인 15,000원 / 36개월
  // 미만 무료 / 아동 5,000원"처럼 가격이 연령별로 나뉘어 있으면, 각 구간의 금액과
  // 그 금액에 적용되는 연령/대상 라벨을 짝지어 남긴다 — priceText/ageText는 전체
  // 텍스트에서 "가격 하나"/"연령 힌트 하나"만 뽑는 반면, 이 필드는 여러 구간이
  // 있을 때 "어떤 라벨에 어떤 금액이 붙는지" 매칭 관계 자체를 보존한다. optional인
  // 이유: event_price_verifications.candidates에 이미 저장된 과거 스냅샷(이 필드
  // 도입 이전)에는 이 값이 없을 수 있다.
  priceTiers?: PriceAgeTier[];
  // 소스1(블로그)/소스3(공식 홈페이지): 원문으로 바로 이동할 외부 링크.
  sourceUrl?: string | null;
  // 소스4(정형 요금 필드): 실제로 어느 raw_data 키에서 가져왔는지("어느 부분에
  // 정형 요금 필드가 있어서 가져왔는지 명시" 요구사항).
  rawFieldName?: string | null;
  // 소스2/3: 관리자가 "원문 전문 보기"로 펼칠 수 있는 발췌(너무 길면 자름).
  excerpt?: string | null;
  errorMessage?: string | null;
};

// [정형 요금 필드](소스4): 실제 코드베이스에서 쓰이는 필드명만 근거로 삼는다(제3장
// 제5조 추측 금지) — seoul-culture-events.mjs의 USE_FEE, gg-culture-events-adapter.mjs의
// PARTCPT_EXPN_INFO. TOUR_API_FESTIVAL/SEOUL_YEYAK은 실측 확인 결과 별도의 정형 요금
// 필드가 없다(TOUR_API_FESTIVAL은 price_text가 항상 null, SEOUL_YEYAK은 DTLCONT
// 설명문에서 파싱할 뿐 전용 필드가 없음 — 이 경우 raw_field 후보는 "데이터 없음"이
// 정직한 결과다).
export const RAW_FEE_FIELD_NAMES = ['USE_FEE', 'PARTCPT_EXPN_INFO'] as const;

const MAX_EXCERPT_LENGTH = 4000;

function truncate(text: string): string {
  return text.length > MAX_EXCERPT_LENGTH ? `${text.slice(0, MAX_EXCERPT_LENGTH)}...` : text;
}

// 요청 원문 "36개월 이상, 초등학생 이하 등" — 미리 정해진 몇 개 값으로 정규화하지
// 않고(추측 금지), 신호가 발견된 문장/구절을 그대로 짧게 보여준다. AGE_HINT_KEYWORDS는
// 이미 이벤트 블로그 큐레이션 하이라이팅(event-blog-curation-modal.tsx)에 쓰이고 있는
// 목록을 그대로 재사용한다(제5장 제4조).
const AGE_WINDOW_RADIUS = 15;

export function extractAgeText(text: string | null | undefined): string | null {
  if (!text) return null;
  for (const keyword of AGE_HINT_KEYWORDS) {
    const index = text.indexOf(keyword);
    if (index === -1) continue;
    const start = Math.max(0, index - AGE_WINDOW_RADIUS);
    const end = Math.min(text.length, index + keyword.length + AGE_WINDOW_RADIUS);
    return text.slice(start, end).trim();
  }
  return null;
}

// [연령별 가격 구간 파싱](2026-09-15 사용자 지시 보완): "가격이 연령별로 구분되어
//있다면 이 연령기준도 같이 파싱되어야 한다 — 예: 성인 15,000원 / 36개월 미만 무료 /
// 아동 5,000원이면 '아동'이 몇 세부터 몇 세까지인지도". label은 원문에 실제로 쓰인
// 표현을 그대로 보존한다("아동"/"36개월 미만"/"미취학" 등) — "아동" 같은 범주어의
// 실제 나이 경계(예: 만 몇 세부터 몇 세까지)는 소스 텍스트가 명시적으로 정의해주지
// 않는 한 서비스마다 다르고 확인할 근거가 없어(제3장 제5조 추측 금지) 임의의 나이
// 범위를 지어내 채우지 않는다 — 원문에 "36개월 미만"처럼 숫자가 이미 포함된 라벨은
// 그 숫자 그대로가 곧 나이 기준이 되어 별도 변환이 필요 없다.
export type PriceAgeTier = {
  label: string;
  priceWon: number;
  isFree: boolean;
};

function stripMarkup(text: string): string {
  return text.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&amp;|&middot;/g, ' ');
}

// [실측 문제] "■ 이용요금: 성인 15,000원"처럼 첫 구간 맨 앞에 붙는 섹션 제목까지
// 라벨로 잡혀버리면("■ 이용요금: 성인") 정작 필요한 대상/연령 라벨이 묻힌다.
// parse-price-from-text.ts의 기존 라벨 키워드(이용료/요금/참가비/입장료/사용료/
// 수강료/관람료)를 그대로 재사용해(제5장 제4조) 이런 섹션 제목만 선택적으로 걷어낸
// 뒤 라벨+금액을 매칭한다 — 임의의 새 키워드를 지어내지 않는다.
const PRICE_SECTION_HEADER = /^[■□▪◆●○·\-*\s]*(?:이용료|요금|참가비|입장료|사용료|수강료|관람료)\s*[:：]?\s*/;

function stripPriceSectionHeader(segment: string): string {
  return segment.replace(PRICE_SECTION_HEADER, '');
}

// "성인 15,000원" / "36개월 미만 무료" 처럼 "라벨 + 금액(또는 무료)"로 끝나는 한
// 구간을 판정한다. 라벨이 비어 있으면(금액/무료 표현만 있고 대상이 안 붙어 있으면)
// "어떤 연령에 적용되는 가격인지 알 수 없는" 구간이라 채택하지 않는다 — 추측 금지.
const TIER_AMOUNT_PATTERN = /^(.*?)\s*([0-9][0-9,]{2,})\s*원\s*$/;
const TIER_FREE_PATTERN = /^(.*?)\s*(무료|없음)\s*$/;
// 구분자로 나뉘지 않고 한 줄에 이어 붙은 형태("성인 15,000원 아동 5,000원")를 위한
// 보강 패턴 — 짧은 한글 라벨(최대 12자, 연령 힌트 접미사 포함) 뒤에 금액이 바로
// 붙는 경우만 잡는다(과도하게 긴 라벨을 잡아 문장 전체를 오인식하지 않도록). 라벨
// 자체는 한글로만 제한한다 — 숫자까지 포함하면("성인15,000원"처럼 라벨과 금액
// 사이에 공백이 없을 때) 탐욕적 매칭이 금액의 앞자리 숫자를 라벨로 잘못
// 집어삼키는 문제가 실측으로 확인됐다(예: "성인1" + "5,000원"으로 잘못 분리).
const GLOBAL_TIER_AMOUNT_PATTERN = /([가-힣]{1,12}(?:\s*(?:미만|이하|이상|초과|부터))?)\s*([0-9][0-9,]{2,})\s*원/g;
// 구분자 없이 이어 붙은 형태의 무료 구간("36개월 미만 무료")은 오탐지(예: "무료
// 주차 가능")를 막기 위해 명시적 나이 숫자+방향 표현이 붙은 라벨만 인정한다.
const GLOBAL_TIER_FREE_PATTERN = /((?:\d{1,3}\s*개월|(?:만\s*)?\d{1,2}\s*세)\s*(?:미만|이하|이상|초과|부터))\s*(?:은|는)?\s*무료/g;

export function parsePriceAgeTiers(text: string | null | undefined): PriceAgeTier[] {
  if (!text) return [];
  const plain = stripMarkup(text);
  const tiers: PriceAgeTier[] = [];
  const seenLabels = new Set<string>();

  function addTier(label: string, priceWon: number, isFree: boolean) {
    const trimmed = label.trim();
    if (!trimmed || seenLabels.has(trimmed)) return;
    seenLabels.add(trimmed);
    tiers.push({ label: trimmed, priceWon, isFree });
  }

  // [실측 버그 수정] 애초에 '/'나 줄바꿈이 하나도 없는 문자열(예: "성인15,000원
  // 아동5,000원")을 split()하면 원본 전체가 "구간 1개"로 그대로 남는데, 여기에
  // TIER_AMOUNT_PATTERN(비탐욕적이지만 문자열 끝 "...원"에 고정)을 그대로 적용하면
  // 두 구간이 하나로 뭉개져("성인15,000원 아동" 같은 라벨) 잘못 매칭된다 — 실제
  // 구분자가 있었을 때만(segments.length > 1) 1순위(구간별 매칭)를 쓰고, 구분자가
  // 전혀 없으면 처음부터 2순위(구간 경계를 가정하지 않는 전역 패턴)로 간다.
  const segments = plain
    .split(/[\/\n]+/)
    .map((s) => stripPriceSectionHeader(s.trim()))
    .filter(Boolean);

  if (segments.length > 1) {
    for (const segment of segments) {
      const amountMatch = segment.match(TIER_AMOUNT_PATTERN);
      if (amountMatch) {
        addTier(amountMatch[1], Number(amountMatch[2].replace(/,/g, '')), false);
        continue;
      }
      const freeMatch = segment.match(TIER_FREE_PATTERN);
      if (freeMatch) addTier(freeMatch[1], 0, true);
    }
  } else {
    for (const m of plain.matchAll(GLOBAL_TIER_AMOUNT_PATTERN)) {
      addTier(m[1], Number(m[2].replace(/,/g, '')), false);
    }
    for (const m of plain.matchAll(GLOBAL_TIER_FREE_PATTERN)) {
      addTier(m[1], 0, true);
    }
  }

  return tiers;
}

function findRawFeeField(rawData: unknown): { fieldName: string; value: string } | null {
  if (!rawData || typeof rawData !== 'object' || Array.isArray(rawData)) return null;
  const record = rawData as Record<string, unknown>;
  for (const fieldName of RAW_FEE_FIELD_NAMES) {
    const value = record[fieldName];
    if (typeof value === 'string' && value.trim()) return { fieldName, value: value.trim() };
  }
  return null;
}

// 소스4: 원천 데이터의 정형 요금 필드. 크롤링/파싱이 필요 없어 동기 순수 함수다.
export function buildRawFieldCandidate(rawData: unknown): PriceCandidate {
  const found = findRawFeeField(rawData);
  if (!found) {
    return { source: 'raw_field', status: 'not_found', priceText: null, ageText: null, priceTiers: [] };
  }
  return {
    source: 'raw_field',
    status: 'found',
    priceText: found.value,
    ageText: extractAgeText(found.value),
    priceTiers: parsePriceAgeTiers(found.value),
    rawFieldName: found.fieldName,
  };
}

// 소스2: events.description(원천 상세 설명, 이미 DB에 저장돼 있어 네트워크 요청이
// 필요 없다).
export function buildDescriptionCandidate(description: string | null | undefined): PriceCandidate {
  if (!description || !description.trim()) {
    return { source: 'description', status: 'not_found', priceText: null, ageText: null, priceTiers: [] };
  }
  const priceText = parsePriceFromText(description);
  const ageText = extractAgeText(description);
  return {
    source: 'description',
    status: priceText || ageText ? 'found' : 'not_found',
    priceText,
    ageText,
    priceTiers: parsePriceAgeTiers(description),
    excerpt: truncate(description),
  };
}

// [실측 버그 수정](2026-09-16 사용자 지적): "소스1은 블로그 큐레이션과 유사하게..
// 적합한 블로그들 최대 3개에 대하여 내용들 크롤링하여 가격 정보 있는지 확인하고
// 있다면 가져와서 보여주는구조인데?" — 스펙 원문("소스 1: 연동된 선별 블로그
// **본문 내** 가격 및 연령 키워드 텍스트 추출")도 명확히 본문 텍스트 추출을
// 요구하는데, 예전 구현은 이미 존재하는 "블로그 큐레이션" 모달에서 관리자가
// 수동으로 입력해 둔 events.price_text를 그대로 되돌려 보여주기만 했다 — 블로그
// 본문 자체는 한 번도 열어보지 않는 잘못된 구현이었다. 소스3(공식 홈페이지)이
// 이미 하는 것과 동일하게 실제 블로그 본문 HTML을 크롤링해 parsePriceFromText로
// 분석하도록 고쳤다.
//
// [소스1 독립 검색으로 재변경](2026-09-16 사용자 후속 지시): "어떤 걸로 검색했는지
// 표시해줘.. 정말 맞는 검색어를 던져서 블로그 서치했고 봤는지 확인하게.. 블로그
// 큐레이션 기존꺼 처럼 이상한 검색어면 수동으로 수정해서 다시 던져보게" — 기존
// "🔍 블로그 큐레이션" 모달에서 미리 선택해 둔 curated_blog_urls에 의존하면(그
// 모달을 아직 안 썼거나 검색어가 이상했던 이벤트는) 실제로 가격 정보가 있는
// 블로그가 있어도 소스1이 찾을 방법이 없다 — 이 화면 안에서 독립적으로
// (buildSmartBlogQuery로 만든 검색어를 기본값으로) 네이버 블로그를 검색하고,
// 그 검색어를 화면에 노출해 관리자가 직접 확인/수정 후 재검색할 수 있게
// 바꿨다(기존 blog-search 라우트 재사용, 제5장 제4조). 실제 네트워크
// 검색/크롤링(검색 → 최대 3개 결과의 본문 추출)은 API 라우트가 수행하고, 이
// 함수는 그 결과(성공/실패 목록)를 받아 "그중 가격 정보를 찾은 첫 블로그"를
// 후보로 만드는 순수 로직만 담당한다(테스트 용이성 유지) — 이 부분은 검색 결과가
// 어디서 왔든(curated_blog_urls든 실시간 검색이든) 그대로 재사용할 수 있어
// 변경이 필요 없었다.
export type BlogBodyFetchResult = {
  url: string;
  // null이면 이 URL은 크롤링 실패(네이버 블로그가 아니거나, 본문 영역을 못 찾았거나,
  // HTTP 오류 등) — naver-blog-body.ts와 동일하게 네이버 블로그만 지원 범위다
  // (추측으로 다른 사이트 구조까지 처리하지 않음, 제3장 제5조).
  bodyText: string | null;
};

export function buildBlogCandidate(results: BlogBodyFetchResult[]): PriceCandidate {
  if (results.length === 0) {
    return { source: 'blog', status: 'not_found', priceText: null, ageText: null, priceTiers: [] };
  }
  for (const result of results) {
    if (!result.bodyText) continue;
    const priceText = parsePriceFromText(result.bodyText);
    const ageText = extractAgeText(result.bodyText);
    if (priceText || ageText) {
      return {
        source: 'blog',
        status: 'found',
        priceText,
        ageText,
        priceTiers: parsePriceAgeTiers(result.bodyText),
        sourceUrl: result.url,
        excerpt: truncate(result.bodyText),
      };
    }
  }
  // 어느 블로그에서도 가격/연령 신호를 못 찾았어도, 관리자가 직접 열어 확인할 수
  // 있도록 첫 번째 블로그 링크는 그대로 노출한다(기존 동작 유지).
  return { source: 'blog', status: 'not_found', priceText: null, ageText: null, priceTiers: [], sourceUrl: results[0].url };
}

const PAGE_TEXT_MAX_LENGTH = 20000;

// [소스3: 공식 홈페이지 크롤링] naver-blog-body.ts의 extractBlogBodyText()와 달리
// "임의의 공식 홈페이지"는 알려진 본문 컨테이너 클래스가 없다(사이트마다 제각각) —
// 특정 구조를 가정하지 않고, nav/header/footer/script/style처럼 본문이 아닐 가능성이
// 큰 영역만 제거한 뒤 페이지 전체 텍스트를 뽑는다. parsePriceFromText가 어차피
// "라벨+금액 근접" 매칭이라 약간의 노이즈(메뉴/푸터 문구)가 섞여도 오탐지 위험이
// 낮다(제3장 제5조 추측 금지 — 특정 사이트 구조를 안다고 가정하지 않음).
export function extractGenericPageText(html: string): string {
  const root = parse(html);
  root.querySelectorAll('script, style, nav, header, footer, noscript').forEach((node) => node.remove());
  const text = root.structuredText.replace(/[^\S\n]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  return text.length > PAGE_TEXT_MAX_LENGTH ? text.slice(0, PAGE_TEXT_MAX_LENGTH) : text;
}

// 소스3: 공식 홈페이지(events.source_url) 크롤링 결과. 실제 fetch+HTML 파싱은
// 네트워크 I/O라 API 라우트에서 수행하고, 이 함수는 이미 텍스트로 변환된 페이지
// 본문을 받아 후보로 만든다.
export function buildOfficialSiteCandidate(params: {
  sourceUrl: string | null | undefined;
  pageText: string | null;
  errorMessage?: string | null;
}): PriceCandidate {
  if (!params.sourceUrl) {
    return { source: 'official_site', status: 'not_found', priceText: null, ageText: null, priceTiers: [] };
  }
  if (params.errorMessage) {
    return {
      source: 'official_site',
      status: 'error',
      priceText: null,
      ageText: null,
      priceTiers: [],
      sourceUrl: params.sourceUrl,
      errorMessage: params.errorMessage,
    };
  }
  const priceText = parsePriceFromText(params.pageText);
  const ageText = extractAgeText(params.pageText);
  return {
    source: 'official_site',
    status: priceText || ageText ? 'found' : 'not_found',
    priceText,
    priceTiers: parsePriceAgeTiers(params.pageText),
    ageText,
    sourceUrl: params.sourceUrl,
    excerpt: params.pageText ? truncate(params.pageText) : null,
  };
}
