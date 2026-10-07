// [현대백화점 문화센터 수집 — 파서](2026-10-08 사용자 제공 실제 요청 캡처로
// 시작): 목록 페이지(CT010100_L.do)는 이마트(GraphQL API)와도, 롯데마트
// (searchList.do, 상세는 별도 스크립트)와도 다르다 — 서버 렌더 HTML이면서도
// 목록 자체에 썸네일 이미지가 이미 포함돼 있어(실측 확인) 별도 상세수집
// 스크립트가 필요 없다. 지점은 stCd=ALL로 전 지점이 한 응답에 섞여 나옴을
// 실측 확인(목동점/천호점/판교점/신촌점/울산점/킨텍스점/미아점이 동시에
// 등장) — 이마트의 64개 지점 순회, 롯데마트의 지점×대상×학기 조합 없이
// "카테고리(keyword) × 페이지"만 돌면 된다.
//
// [수집 범위 — 사용자 확정](2026-10-08): 전체 12개 카테고리 중 "025(엄마랑
// 아가랑)"/"026(어린이 패밀리)" 2개만. "027(자녀교육 프리맘)"은 사용자
// 판단으로 제외("아기랑 같이가는 강좌 아니야" — 부모 대상 강의로 보임).
import { parse } from 'node-html-parser';
import { normalizeDaysToCodes } from './schedule-normalizer.mjs';
import { parseAgeRangeToMonths } from './age-range-parser.mjs';

export const HYUNDAI_CATEGORY_CODES = ['025', '026'];

// [날짜 — 단발성 "2026.10.17(토)" 또는 범위 "2026.10.11(일) ~ 2026.12.13
// (일)" 둘 다 실측 확인]. 범위의 "요일"은 매주 반복을 뜻한다고 보고(다른
// 두 브랜드와 동일한 가정), 시작일의 요일을 class_day로 쓴다 — 종료일의
// 요일이 시작일과 다를 가능성은 없다(둘 다 "범위 내 같은 요일 반복" 전제,
// 실데이터에서도 시작/종료 요일 표기가 항상 일치함을 확인).
const DATE_RANGE_REGEX = /(\d{4})\.(\d{1,2})\.(\d{1,2})\(([가-힣])\)(?:\s*~\s*(\d{4})\.(\d{1,2})\.(\d{1,2})\(([가-힣])\))?/;

export function parseDateRange(text) {
  if (!text) return { startDate: null, endDate: null, dayOfWeek: null };
  const match = text.match(DATE_RANGE_REGEX);
  if (!match) return { startDate: null, endDate: null, dayOfWeek: null };

  const [, y1, m1, d1, w1, y2, m2, d2] = match;
  const pad = (n) => String(n).padStart(2, '0');
  const startDate = `${y1}-${pad(m1)}-${pad(d1)}`;
  const endDate = y2 ? `${y2}-${pad(m2)}-${pad(d2)}` : startDate;
  return { startDate, endDate, dayOfWeek: w1 };
}

// [시간 — "15:30-16:30" 실측 확인]
export function parseTimeRange(text) {
  if (!text) return { startTime: null, endTime: null };
  const match = text.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
  if (!match) return { startTime: null, endTime: null };
  const [, h1, mi1, h2, mi2] = match;
  return { startTime: `${h1.padStart(2, '0')}${mi1}`, endTime: `${h2.padStart(2, '0')}${mi2}` };
}

// [회차 — "1회" 실측 확인]
export function parseSessionCount(text) {
  if (!text) return null;
  const match = text.match(/(\d+)\s*회/);
  return match ? Number(match[1]) : null;
}

// [가격 — "30,000" 실측 확인, 쉼표 제거]
export function parseFee(text) {
  if (!text) return null;
  const digits = text.replace(/[^\d]/g, '');
  return digits ? Number(digits) : null;
}

// [상태 — 실측 확인된 값: 신청가능/중간신청/마감임박. "마감"류(완전 마감)는
// 샘플에서 직접 보지는 못했지만 — orderGubn=status 정렬상 마감 건이 뒤쪽
// 페이지에 몰려 있어 샘플링에서 놓쳤을 가능성이 있다 — 알려진 3개가 아니면
// CLOSED로 안전하게 처리한다(추측으로 새 상태를 지어내지 않음).
const OPEN_RAW_STATUSES = new Set(['신청가능', '중간신청', '마감임박']);

export function normalizeHyundaiStatus(rawStatus) {
  return OPEN_RAW_STATUSES.has(rawStatus) ? 'OPEN' : 'CLOSED';
}

// [한 강좌 카드 파싱 — 실측 확인된 구조]
// <li><a href="CT010100_V.do?stCd=..&sqCd=..&crsSqNo=..&crsCd=..&proCustNo=..">
//   <img src="완전한 절대 URL">
//   <div class="branch_info"><span class="state">상태</span><span class="etc">카테고리명</span></div>
//   <dl><dt>제목(날짜 접두사 포함, 원문 그대로 보존)</dt>
//     <dd class="class_info">
//       <div class="info"><span>[지점명] N회</span> <span>강사명</span></div>
//       <div class="info">날짜(범위 또는 단일)</div><div class="info">시간</div>
//       <div class="price">가격</div>
//     </dd>
//   </dl>
// </li>
export function parseCourseItem(liElement, categoryKeyword) {
  const anchor = liElement.querySelector('a');
  if (!anchor) return null;

  const href = anchor.getAttribute('href') ?? '';
  const url = new URL(href, 'https://www.ehyundai.com');
  const stCd = url.searchParams.get('stCd');
  const sqCd = url.searchParams.get('sqCd');
  const crsSqNo = url.searchParams.get('crsSqNo');
  const crsCd = url.searchParams.get('crsCd');
  const proCustNo = url.searchParams.get('proCustNo');
  if (!crsSqNo) return null;

  const title = liElement.querySelector('dt')?.text.trim() ?? '';
  const rawStatus = liElement.querySelector('.state')?.text.trim() ?? null;
  const subCategoryName = liElement.querySelector('.etc')?.text.trim() ?? null;
  const imageUrl = liElement.querySelector('img')?.getAttribute('src') ?? null;

  const infoDivs = liElement.querySelectorAll('.info');
  // 첫 번째 info: "[지점명] N회" + 강사명. 두 번째/세 번째 info: 날짜/시간.
  const firstInfoSpans = infoDivs[0]?.querySelectorAll('span') ?? [];
  const branchAndSession = firstInfoSpans[0]?.text.trim() ?? '';
  const storeNameMatch = branchAndSession.match(/\[([^\]]+)\]/);
  const storeName = storeNameMatch ? storeNameMatch[1] : null;
  const totalSessions = parseSessionCount(branchAndSession);
  const instructorName = firstInfoSpans[1]?.text.trim() || null;

  const dateText = infoDivs[1]?.text.trim() ?? '';
  const timeText = infoDivs[2]?.text.trim() ?? '';
  const { startDate, endDate, dayOfWeek } = parseDateRange(dateText);
  const { startTime, endTime } = parseTimeRange(timeText);

  const priceText = liElement.querySelector('.price')?.text.trim() ?? '';
  const classFee = parseFee(priceText);
  // [연령 — 제목에서 추출](2026-10-07 사용자 지시: "원본 그대로.. 괜히
  // 파싱했다 잘못될수도 있으니" — 제목 문자열 자체는 전혀 건드리지 않고,
  // 별도 컬럼으로만 파싱해 덧붙인다. 다른 두 브랜드와 동일한 공유 유틸
  // 재사용(제5장 제4조). 실측: "...3세 이상 / 보호자 1인 동반" 패턴.
  const { minAgeMonths, maxAgeMonths } = parseAgeRangeToMonths(title);

  return {
    class_id: crsSqNo,
    class_title: title,
    store_code: stCd,
    store_name: storeName,
    sub_category_name: subCategoryName,
    min_age_months: minAgeMonths,
    max_age_months: maxAgeMonths,
    // [class_day vs schedule_days_code](실측 확인 — emart-culture-club.mjs/
    // lottemart-culture-club.mjs 참고) class_day는 한글 요일 원문 배열
    // (예: ['토']), schedule_days_code는 영문 3자 코드(예: ['SAT'])로 서로
    // 다른 컬럼이다 — 혼동해서 같은 값을 넣지 않는다.
    class_day: dayOfWeek ? [dayOfWeek] : null,
    schedule_days_code: dayOfWeek ? normalizeDaysToCodes([dayOfWeek]) : null,
    start_time: startTime,
    end_time: endTime,
    class_fee: classFee,
    instructor_name: instructorName,
    schedule_start_date: startDate,
    schedule_end_date: endDate,
    total_sessions: totalSessions,
    raw_status: rawStatus,
    normalized_status: normalizeHyundaiStatus(rawStatus),
    main_image_url: imageUrl,
    category_keyword: categoryKeyword,
    sq_cd: sqCd,
    crs_cd: crsCd,
    pro_cust_no: proCustNo,
  };
}

export function parseCourseListPage(html, categoryKeyword) {
  const root = parse(html);
  const items = root.querySelectorAll('li').filter((li) => li.querySelector('a[href*="CT010100_V.do"]'));
  return items.map((li) => parseCourseItem(li, categoryKeyword)).filter(Boolean);
}
