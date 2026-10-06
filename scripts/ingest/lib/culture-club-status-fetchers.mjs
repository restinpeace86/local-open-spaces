// [찜 상태감시 브랜드별 재확인 로직 — 공유 모듈](2026-10-06, project/decision-
// log.md Decision 028): emart-culture-club-status-watch.mjs/lottemart-
// culture-club-status-watch.mjs 각각에 있던 "찜한 강좌 한 건의 현재 상태를
// 어떻게 다시 확인하는지" 로직을 culture-club-status-watch.mjs(통합 스크립트)
// 가 브랜드별로 분기해 쓸 수 있도록 공유 모듈로 뽑았다 — 사이트 구조가
// 완전히 다른 두 수집 방식(이마트: GraphQL API, 롯데마트: HTML 스크래핑)은
// 그대로 유지하고, "어떤 브랜드인지 먼저 구분하고 그에 맞는 재확인 로직으로
// 분기"(사용자 지시)만 한 파일에서 담당한다.
import { parse } from 'node-html-parser';
import { fetchWithTimeout } from './fetch-with-timeout.mjs';

const EMART_GRAPHQL_URL = 'https://wrihg4edszhmvagptse4t4eggi.appsync-api.ap-northeast-2.amazonaws.com/graphql';
const EMART_STATUS_CHECK_ORDER = ['접수중', '정원마감', '접수대기'];
const EMART_FALLBACK_STATUS = '접수마감';
const EMART_BROWSER_LIKE_HEADERS = {
  Origin: 'https://www.cultureclub.emart.com',
  Referer: 'https://www.cultureclub.emart.com/enrolment',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'application/json',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
};
const EMART_QUERY = `query getClassByFiltering($keyword: String, $filterData: [FilterData], $sortKey: String, $from: Int, $size: Int) {
  getClassByFiltering(keyword: $keyword, filterData: $filterData, sortKey: $sortKey, from: $from, size: $size) {
    total
    data { classId }
  }
}`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// [이마트 — 실측 확인] 응답에 "현재 상태"를 직접 알려주는 필드가 없다 — classId +
// classStatus 필터를 함께 넣어 3개 버킷을 순서대로 조회해, 걸리는 버킷을 현재
// 상태로 역산한다(emart-culture-club.mjs의 메인 배치와 동일한 방식, class_id
// 단건 범위로 축소). 3개 전부에서 빠지면 메인 배치가 추적하지 않는 네 번째
// 상태 '접수마감'으로 본다(2026-10-06-emart-culture-club-filter-status-
// closed.sql 참고 — 추측이 아니라 메인 배치의 버킷 구성상 확정적).
async function isEmartClassInStatusBucket(apiKey, classId, status) {
  const res = await fetchWithTimeout(EMART_GRAPHQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, ...EMART_BROWSER_LIKE_HEADERS },
    body: JSON.stringify({
      query: EMART_QUERY,
      variables: {
        keyword: '',
        filterData: [
          { type: 'classId', data: [classId] },
          { type: 'classStatus', data: [status] },
        ],
        sortKey: 'deadline',
        from: 0,
        size: 1,
      },
    }),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`이마트 상태 조회 실패 (HTTP ${res.status}, class_id=${classId}): ${text.slice(0, 300)}`);

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`이마트 상태 응답이 JSON이 아닙니다(class_id=${classId}): ${text.slice(0, 300)}`);
  }
  if (json.errors) {
    throw new Error(`이마트 상태 조회 GraphQL 에러(class_id=${classId}): ${JSON.stringify(json.errors).slice(0, 300)}`);
  }
  return (json.data?.getClassByFiltering?.data ?? []).length > 0;
}

export async function fetchEmartCurrentStatus({ apiKey, sourceClassId, pacingDelayMs }) {
  if (!apiKey) throw new Error('EMART_CULTURE_CLUB_API_KEY 환경변수가 설정되지 않았습니다.');
  for (const status of EMART_STATUS_CHECK_ORDER) {
    if (await isEmartClassInStatusBucket(apiKey, sourceClassId, status)) return status;
    if (pacingDelayMs) await sleep(pacingDelayMs());
  }
  return EMART_FALLBACK_STATUS;
}

// [롯데마트 — 실측 확인] 상세 페이지(courseview.do)는 목록 페이지와 달리
// class="btn-status-red"를 쓰지만 onclick 함수명/"현장접수" 텍스트 판별 로직은
// lottemart-culture-club.mjs의 parseRegistrationStatus와 동일하게 재사용
// 가능하다. store_code/semester_code/target_code는 culture_club_classes.
// raw_extra에 보관돼 있다(브랜드 전용 요청 파라미터).
const LOTTEMART_DETAIL_URL = 'https://culture.lottemart.com/cu/gus/course/courseinfo/courseview.do';

export function parseLottemartDetailPageStatus(html) {
  const root = parse(html);
  const buttons = root.querySelectorAll('a').filter((a) => (a.getAttribute('class') ?? '').includes('btn-status'));
  const htmls = buttons.map((b) => b.outerHTML).join(' ');

  if (/fn_courseApp\(/.test(htmls)) return '바로신청';
  if (/fn_waitAppPopOpen\(/.test(htmls)) return '대기자신청';
  if (/fn_fieldCnsl\(\s*['"]{2}\s*\)/.test(htmls)) return '전화문의';
  if (/>현장접수</.test(htmls)) return '현장접수';
  return '접수마감';
}

export async function fetchLottemartCurrentStatus({ storeCode, sourceClassId, semesterCode, targetCode }) {
  const params = new URLSearchParams({
    search_str_cd: storeCode,
    cls_cd: sourceClassId,
    search_term_cd: semesterCode,
    search_cls_target: targetCode,
  });
  const res = await fetchWithTimeout(`${LOTTEMART_DETAIL_URL}?${params.toString()}`, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });
  if (!res.ok) throw new Error(`상세 페이지 조회 실패 (HTTP ${res.status}, class_id=${sourceClassId})`);
  const html = await res.text();
  return parseLottemartDetailPageStatus(html);
}
