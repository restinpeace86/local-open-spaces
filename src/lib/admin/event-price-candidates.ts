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
    return { source: 'raw_field', status: 'not_found', priceText: null, ageText: null };
  }
  return {
    source: 'raw_field',
    status: 'found',
    priceText: found.value,
    ageText: extractAgeText(found.value),
    rawFieldName: found.fieldName,
  };
}

// 소스2: events.description(원천 상세 설명, 이미 DB에 저장돼 있어 네트워크 요청이
// 필요 없다).
export function buildDescriptionCandidate(description: string | null | undefined): PriceCandidate {
  if (!description || !description.trim()) {
    return { source: 'description', status: 'not_found', priceText: null, ageText: null };
  }
  const priceText = parsePriceFromText(description);
  const ageText = extractAgeText(description);
  return {
    source: 'description',
    status: priceText || ageText ? 'found' : 'not_found',
    priceText,
    ageText,
    excerpt: truncate(description),
  };
}

// 소스1: 이미 존재하는 "블로그 큐레이션" 기능(event-blog-curation-modal.tsx)이
// curated_blog_urls/price_text를 이미 저장해 두므로, 여기서는 그 저장된 결과를
// 후보로 재구성한다 — 블로그 검색·본문 조회 UI를 이 화면에서 다시 만들지 않는다
// (제5장 제4조 기존 구조 우선. 블로그 자체를 다시 검수하고 싶으면 기존 "🔍 블로그
// 큐레이션" 버튼을 쓰면 된다).
export function buildBlogCandidate(params: {
  curatedBlogUrls: string[] | null | undefined;
  existingPriceText: string | null | undefined;
}): PriceCandidate {
  const firstUrl = params.curatedBlogUrls?.[0] ?? null;
  if (!firstUrl) {
    return { source: 'blog', status: 'not_found', priceText: null, ageText: null };
  }
  return {
    source: 'blog',
    status: params.existingPriceText ? 'found' : 'not_found',
    priceText: params.existingPriceText ?? null,
    ageText: extractAgeText(params.existingPriceText),
    sourceUrl: firstUrl,
  };
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
    return { source: 'official_site', status: 'not_found', priceText: null, ageText: null };
  }
  if (params.errorMessage) {
    return {
      source: 'official_site',
      status: 'error',
      priceText: null,
      ageText: null,
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
    ageText,
    sourceUrl: params.sourceUrl,
    excerpt: params.pageText ? truncate(params.pageText) : null,
  };
}
