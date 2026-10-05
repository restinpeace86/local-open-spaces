// [롯데마트 문화센터 강좌 리스트 수집](2026-10-04 사용자 지시): "롯데마트 문화센터
// 확인좀 해줘" — 이마트 컬처클럽(emart-culture-club.mjs, 2026-10-03)과 동일한
// "로그인/Playwright 불필요, 공개 엔드포인트 직접 호출" 패턴이지만 구조는 다르다.
//
// [실측 확인 — 2026-10-04]
// - 페이지 쉘(courselist.do)이 아니라 그 안의 `fn_getList()`가 호출하는
//   `searchList.do`(POST, x-www-form-urlencoded)가 실제 목록 API다. JSON이 아니라
//   서버가 렌더링한 `<tr>` HTML 조각을 그대로 돌려준다 — JSON 파싱이 아니라 HTML
//   파싱이 필요하다(node-html-parser 사용 — src/lib/admin/naver-blog-body.ts의
//   주석에 jsdom이 Vercel 프로덕션에서 ESM/CJS 충돌로 500 에러를 냈던 전례가
//   남아있어, 이미 이 프로젝트에서 검증된 가벼운 pure-CJS 파서를 그대로 쓴다).
// - 쿠키/세션이 전혀 필요 없다(사용자가 제공한 JSESSIONID로 요청해도, 없이
//   요청해도 응답이 동일함을 실측 확인).
// - 이마트의 `filterData` 배열 같은 다중값 배치 조회가 안 된다(실측 확인 —
//   `search_str_cd`/`search_cls_target`에 콤마로 여러 값을 넣으면 빈/깨진 응답) —
//   지점×대상×학기를 하나씩 순회해야 해서 요청 수가 이마트보다 훨씬 많다
//   (지점 60 × 대상 3 × 학기 2 = 360개 조합 + 조합별 페이지네이션).
// - 목록 응답에 썸네일 이미지가 전혀 없다(여러 지점/대상 조합 실측 확인 — `<img>`
//   태그 0건). 이마트처럼 이미지 CDN을 찾을 필요가 없다.
// - 등록상태를 나타내는 별도 요청 파라미터가 없다(`search_reg_status`를 채워도
//   효과 없음, 실측 확인) — 행(row)마다 상태 버튼의 onclick으로 직접 판별한다.
//   한 행에 "접수마감"(비활성 라벨)과 "대기자 신청"(활성 버튼)이 동시에 존재하는
//   경우가 실측으로 확인됐다 — 이땐 실제로 신청 가능한 "대기자신청"을 최종
//   상태로 채택한다(우선순위: 바로신청 > 대기자신청 > 전화문의 > 접수마감).
//
// [필터 코드 — 사용자 제공 + 실측 교정](2026-10-04)
// - search_term_cd: 202603=2026년 가을, 202604=2026년 겨울(사용자 확인 그대로).
// - search_cls_target: 1=성인(사용자 지시로 제외: "성인 1은 확실히 안가져와도돼"),
//   2=어린이/청소년, 3=유아, 4=엄마와 함께(사용자 확인 그대로).
// - search_cls_fg(단기/정규/일일)는 사용자가 준 코드 순서가 실측과 달랐다
//   (사용자: 01=정기추정, 실측: 01=단기/02=정규/04=일일) — 다만 이 값은 목록
//   응답 행에 식별 가능한 필드로 노출되지 않아(실측 확인), 요청 시 빈 값(전체)으로
//   한 번에 받는다. 별도 수집 차원으로 쓰지 않는다(요청량을 3배로 늘릴 가치가
//   지금은 없음 — 필요해지면 후속 지시로 추가).
//
// [접수마감 기본 제외하지 않음] 이마트는 사용자가 명시적으로 "접수마감은 데이터가
// 너무 많아 제외해도 된다"고 지시해서 뺐다. 롯데마트는 그런 지시가 없었다 —
// 추측으로 데이터를 버리지 않는다(제3장 제5조). 전부 수집하고, 필요해지면
// is_excluded로 관리자가 개별 배제하거나 후속 지시로 기본 수집 범위를 좁힌다.
import { pathToFileURL } from 'url';
import { parse } from 'node-html-parser';
import { loadEnv } from '../lib/load-env.mjs';
import { fetchWithTimeout } from './lib/fetch-with-timeout.mjs';
import { createAdminClient } from './lib/supabase-admin.mjs';
import { applyRandomStartupDelay } from './lib/random-startup-delay.mjs';

loadEnv();

const SOURCE_KEY = 'LOTTEMART_CULTURE_CLUB';
const LIST_URL = 'https://culture.lottemart.com/cu/gus/course/courseinfo/searchList.do';
const UPSERT_CHUNK_SIZE = 500;
const EXISTING_ID_PAGE_SIZE = 1000;
const REQUEST_PACING_MIN_MS = 1000;
const REQUEST_PACING_MAX_MS = 1500;
// [랜덤 시작 지연](2026-10-04 사용자 지시) — 하루 1회 배치라 다음 배치(상세
// 수집, KST 01:30)까지 충분히 여유가 있어 넉넉하게(최대 10분) 둔다.
const MAX_STARTUP_DELAY_MS = 10 * 60 * 1000;
const PAGE_SIZE = 20;

// [ping 배치 재사용](2026-10-04) — lottemart-culture-club-ping.mjs가 동일한
// 60개 지점 목록을 그대로 쓴다(제5장 제4조 — 지점 목록을 두 번 관리하지 않음).
export const STORES = [
  ['103', 'MAXX영등포점'], ['322', '송파점'], ['328', '양평점'], ['342', '은평점'], ['307', '중계점'],
  ['455', '고양점'], ['463', '광교점'], ['405', '구리점'], ['458', '권선점'], ['479', '김포한강점'],
  ['435', '동두천점'], ['446', '롯데몰수지점'], ['476', '시흥배곧점'], ['468', '신갈점'], ['415', '안산점'],
  ['417', '안성점'], ['410', '오산점'], ['409', '의왕점'], ['422', '이천점'], ['436', '평택점'],
  ['433', '검단점'], ['469', '계양점'], ['426', '부평점'], ['418', '삼산점'], ['465', '송도점'],
  ['424', '영종도점'], ['461', '청라점'], ['516', '노은점'], ['515', '당진점'], ['508', '대덕점'],
  ['519', '상당점'], ['504', '서대전점'], ['506', '서산점'], ['507', '성정점'], ['505', '충주점'],
  ['112', 'MAXX창원중앙점'], ['645', '거제점'], ['613', '구미점'], ['647', '김천점'], ['629', '대구율하점'],
  ['626', '부산점'], ['612', '사상점'], ['643', '양덕점'], ['601', '울산점'], ['610', '웅상점'],
  ['609', '장유점'], ['614', '진장점'], ['611', '진해점'], ['608', '통영점'], ['109', 'MAXX목포점'],
  ['108', 'MAXX상무점'], ['110', 'MAXX송천점'], ['707', '군산점'], ['715', '수완점'], ['705', '여수점'],
  ['706', '월드컵점'], ['702', '익산점'], ['708', '전주점'], ['704', '첨단점'], ['802', '춘천점'],
];
const STORE_NAME_BY_CODE = new Map(STORES);

export const TARGETS = [
  ['2', '어린이청소년'],
  ['3', '유아'],
  ['4', '엄마와함께'],
];

const SEMESTERS = ['202603', '202604'];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomPacingDelay() {
  return REQUEST_PACING_MIN_MS + Math.random() * (REQUEST_PACING_MAX_MS - REQUEST_PACING_MIN_MS);
}

// [ping 배치 재사용](2026-10-04 사용자 지시로 추가될 lottemart-culture-club-
// ping.mjs가 이 함수를 그대로 가져다 쓴다 — 요청 로직을 두 번 안 만듦).
//
// [수집 범위 축소 — search_reg_status=1 고정](2026-10-04 사용자 지시): "여기에
// 대하여 1인 것만 우리가 받아도 문제 없을까? 조금이라도 비용을 줄여볼까해서" —
// 실측 확인(5개 지점): 2번(온라인마감/현장접수) 버킷은 전부 0건, 1번(접수가능/
// 접수준비 — 바로신청/마감임박) 버킷 비율은 6.4%~23.6%(평균 10%대)뿐이라, 1번만
// 받으면 페이지네이션 요청량이 85~93% 줄어든다. 3번(접수마감/대기자신청/전화문의)
// 은 더 이상 수집하지 않는다 — 대기자신청 전용 강좌를 새로 발견하는 경로는
// 없어지지만(사용자가 수용한 트레이드오프), 이미 찜한 강좌는 찜-상태감시
// (lottemart-culture-club-status-watch.mjs)가 상세페이지를 직접 찔러 확인하므로
// 영향이 없다. 1번 버킷에서 빠진 기존 행은 run()의 markFallenOutRowsAsUnavailable
// 이 '접수불가'로 정리한다.
export async function fetchPage(storeCode, targetCode, termCode, pageNo) {
  const body = new URLSearchParams({
    currPageNo: String(pageNo),
    search_str_cd: storeCode,
    search_term_cd: termCode,
    search_cls_target: targetCode,
    search_reg_status: '1',
  });

  const res = await fetchWithTimeout(LIST_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Requested-With': 'XMLHttpRequest',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
    body: body.toString(),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`롯데마트 목록 API 호출 실패 (HTTP ${res.status}, store=${storeCode} target=${targetCode} term=${termCode} page=${pageNo}): ${text.slice(0, 300)}`);
  }
  return text;
}

// [실측 확인] "수강료 : 8회 96,000원" 또는 "수강료 : 11회 137,500원 82,500원"
// (할인 시 원가+할인가 순서) — 숫자 토큰을 순서대로 뽑아 1개면 fee만, 2개면
// [original, fee] 순으로 해석한다.
function parseFeeLine(text) {
  const sessionMatch = text.match(/(\d+)\s*회/);
  const sessionCount = sessionMatch ? Number(sessionMatch[1]) : null;
  const prices = [...text.matchAll(/([\d,]+)\s*원/g)].map((m) => Number(m[1].replace(/,/g, '')));
  if (prices.length >= 2) {
    return { sessionCount, classOriginalFee: prices[0], classFee: prices[1] };
  }
  if (prices.length === 1) {
    return { sessionCount, classOriginalFee: null, classFee: prices[0] };
  }
  return { sessionCount, classOriginalFee: null, classFee: null };
}

// [실측 확인] "강사명 : 이정연 / 개강일 : 2026.10.06" — 날짜는 다른 날짜 컬럼들과의
// 일관성을 위해 "YYYYMMDD"로 정규화해 저장한다(원본 표기 "YYYY.MM.DD"는 이
// 테이블에서 쓰지 않음 — 이마트 스키마에 맞추는 게 아니라 이 테이블 내부에서
// 날짜를 다루기 쉽게 하기 위한 정규화일 뿐).
function parseInstructorAndDate(text) {
  const m = text.match(/강사명\s*:\s*(.+?)\s*\/\s*개강일\s*:\s*(\d{4})\.(\d{2})\.(\d{2})/);
  if (!m) return { instructorName: null, classStartDate: null };
  return { instructorName: m[1].trim(), classStartDate: `${m[2]}${m[3]}${m[4]}` };
}

// [실측 확인] "요일 / 시간 : (화) 11:00~11:40" — 요일이 여러 글자(예: "월,수")로
// 올 가능성에 대비해 쉼표/슬래시/가운뎃점 구분자로 분리한다.
function parseDayAndTime(text) {
  const m = text.match(/요일\s*\/\s*시간\s*:\s*\(([^)]+)\)\s*([\d:]+)\s*~\s*([\d:]+)/);
  if (!m) return { classDay: null, startTime: null, endTime: null };
  const classDay = m[1].split(/[,./·\s]+/).filter(Boolean);
  return { classDay, startTime: m[2], endTime: m[3] };
}

// [실측 확인 — 2026-10-04, 15,101행 전수 스캔으로 5번째 상태 발견] 사용자 지시:
// "접수상태/수강신청쪽에 상태쪽은 어떤것들이 있지?" — 처음 투입 때 만든 4분류
// (바로신청/대기자신청/전화문의/접수마감)가 실제로는 하나를 놓치고 있었다.
// 전체 60개 지점 × 대상 3 × 학기 2 조합을 모두 스캔해 버튼 텍스트를 전수
// 집계한 결과 정확히 5개뿐임을 확인했다: 바로신청(3,374) / 전화문의(5,209) /
// 접수마감(6,504) / 대기자 신청(295) / 현장접수(14, 희귀). "현장접수"는
// `<a class="btn-status">현장접수</a>`로 onclick 자체가 아예 없다(전화문의의
// fn_fieldCnsl('')처럼 빈 함수 호출도 아님) — 그래서 onclick 패턴이 아니라
// 텍스트로 직접 판별해야 한다. 이 버그로 기존 수집분의 현장접수 14건은
// 접수마감(기본 폴백)으로 잘못 분류돼 있었다 — 마이그레이션 후 재수집으로
// 교정한다.
//
// 상태 판별 우선순위: 바로신청(fn_courseApp) > 대기자신청(fn_waitAppPopOpen) >
// 전화문의(fn_fieldCnsl('')) > 현장접수(텍스트 "현장접수") > 접수마감
// (fn_fieldCnsl('close'), class="btn-status finish", 그 외 전부). 한 행에
// 접수마감 라벨과 대기자신청 버튼이 동시에 있을 수 있어(실측 확인) 텍스트
// 존재 여부가 아니라 onclick 패턴으로 우선순위를 매긴다(현장접수만 예외).
function parseRegistrationStatus(statusLiHtml) {
  if (/fn_courseApp\(/.test(statusLiHtml)) return '바로신청';
  if (/fn_waitAppPopOpen\(/.test(statusLiHtml)) return '대기자신청';
  if (/fn_fieldCnsl\(\s*['"]{2}\s*\)/.test(statusLiHtml)) return '전화문의';
  if (/>현장접수</.test(statusLiHtml)) return '현장접수';
  return '접수마감';
}

// [실측 확인] info-ico의 em 뱃지는 0~2개 동시 존재 가능(예: "35% 할인" +
// "마감임박"). 뱃지 텍스트로 재료비/할인/마감임박/신설을 구분한다 — class명이
// ico_sale 하나로 재료비와 할인 두 가지 의미를 겸하고 있어(실측 확인) class명이
// 아니라 텍스트 내용으로 구분해야 한다.
function parseBadges(emElements) {
  let classMaterialFee = null;
  let discountBadgeText = null;
  let isClosingSoon = false;
  let isNew = false;

  for (const em of emElements) {
    const text = em.text.trim();
    const className = em.getAttribute('class') ?? '';
    if (className.includes('ico_hit')) {
      isClosingSoon = true;
    } else if (className.includes('ico_new')) {
      isNew = true;
    } else if (className.includes('ico_sale')) {
      const materialMatch = text.match(/재료비\s*([\d,]+)\s*원/);
      if (materialMatch) {
        classMaterialFee = Number(materialMatch[1].replace(/,/g, ''));
      } else {
        discountBadgeText = text;
      }
    }
  }

  return { classMaterialFee, discountBadgeText, isClosingSoon, isNew };
}

export function parseRow(tr, context) {
  const firstTd = tr.querySelector('td.align-l');
  if (!firstTd) return null;

  const cartLink = firstTd.querySelector('a.btn-cart');
  const cartOnclick = cartLink?.getAttribute('onclick') ?? '';
  const classIdMatch = cartOnclick.match(/fn_courseCart\('([^']+)'/);
  const classId = classIdMatch ? classIdMatch[1] : null;
  if (!classId) return null;

  const titleLink = firstTd.querySelector('.info-txt a');
  const rawTitle = titleLink ? titleLink.text.trim().replace(/\s+/g, ' ') : '';
  const classTitle = rawTitle.replace(/^\[[^\]]+\]\s*/, '');

  const ps = firstTd.querySelectorAll('.info-txt p');
  const categoryP = ps.find((p) => p.text.includes('>'));
  const [mainCategoryName, subCategoryName] = categoryP
    ? categoryP.text.split('>').map((s) => s.trim())
    : [null, null];
  const ageRangeP = ps.find((p) => p !== categoryP && p.text.trim());
  const ageRangeText = ageRangeP ? ageRangeP.text.trim() : null;

  const lis = firstTd.querySelectorAll('ul.table-tit-list > li');
  const { instructorName, classStartDate } = lis[0] ? parseInstructorAndDate(lis[0].text) : {};
  const { classDay, startTime, endTime } = lis[1] ? parseDayAndTime(lis[1].text) : {};
  const { sessionCount, classOriginalFee, classFee } = lis[2] ? parseFeeLine(lis[2].text) : {};

  const statusLi = firstTd.querySelector('li.td-status');
  const registrationStatus = statusLi ? parseRegistrationStatus(statusLi.outerHTML) : '접수마감';

  const likeEl = firstTd.querySelector('.like-this strong');
  const likeCount = likeEl ? Number(likeEl.text.trim()) || null : null;

  const emElements = firstTd.querySelectorAll('.info-ico em');
  const { classMaterialFee, discountBadgeText, isClosingSoon, isNew } = parseBadges(emElements);

  return {
    class_id: classId,
    class_title: classTitle,
    store_code: context.storeCode,
    store_name: context.storeName,
    main_category_name: mainCategoryName,
    sub_category_name: subCategoryName,
    age_range_text: ageRangeText,
    instructor_name: instructorName ?? null,
    class_day: classDay ?? null,
    start_time: startTime ?? null,
    end_time: endTime ?? null,
    class_start_date: classStartDate ?? null,
    session_count: sessionCount ?? null,
    class_original_fee: classOriginalFee ?? null,
    class_fee: classFee ?? null,
    class_material_fee: classMaterialFee,
    discount_badge_text: discountBadgeText,
    is_closing_soon: isClosingSoon,
    is_new: isNew,
    like_count: likeCount,
    registration_status: registrationStatus,
    semester_code: context.semesterCode,
    target_code: context.targetCode,
    target_name: context.targetName,
  };
}

// [실측 확인] "1|18|354|34|0|320" 형태의 문자열이 hidden input 등에 그대로 박혀
// 있다 — "{currPage}|{totalPage}|{totalCnt}|{acceptTotalCnt}|
// {onlnCloseTotalCnt}|{acceptCloseTotalCnt}"(접수가능/온라인마감/접수마감
// 3개 버킷 건수 — search_reg_status='1'/'2'/'3' 필터와 1:1 대응, 2026-10-04
// 실측 확인). ping 배치는 이 3개 버킷 건수만으로 "뭔가 바뀌었는지"를 감지한다
// (바로신청→전화문의 같은 개별 강좌 상태 전환도 버킷 합계가 바뀌므로 잡힘).
export function parsePageInfo(html) {
  const m = html.match(/(\d+)\|(\d+)\|(\d+)\|(\d+)\|(\d+)\|(\d+)/);
  if (!m) return { totalPage: 1, acceptTotalCnt: 0, onlnCloseTotalCnt: 0, acceptCloseTotalCnt: 0 };
  return {
    totalPage: Number(m[2]),
    acceptTotalCnt: Number(m[4]),
    onlnCloseTotalCnt: Number(m[5]),
    acceptCloseTotalCnt: Number(m[6]),
  };
}

export async function fetchAllForCombo(storeCode, storeName, targetCode, targetName, semesterCode) {
  const rows = [];
  let page = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const html = await fetchPage(storeCode, targetCode, semesterCode, page);
    const root = parse(html);
    const trs = root.querySelectorAll('tr');
    const context = { storeCode, storeName, targetCode, targetName, semesterCode };
    for (const tr of trs) {
      const row = parseRow(tr, context);
      if (row) rows.push(row);
    }

    const { totalPage } = parsePageInfo(html);
    if (page >= totalPage || trs.length === 0) break;
    page += 1;
    await sleep(randomPacingDelay());
  }
  return rows;
}

// [1번 버킷에서 빠진 행 정리](2026-10-04 사용자 지시): "뭉뚱그려서 현재
// 바로신청 안되는상태가 되었다.. 즉 온라인으로 할수있는게 없다"로 처리 —
// 이번에 새로 받은(1번 버킷) class_id 목록과, DB에 '바로신청'/'대기자신청'
// 으로 저장돼 있던 기존 행을 대조해서 빠진 것만 '접수불가'로 갱신한다.
// 롯데마트에 추가 요청을 보내지 않는다(우리 DB끼리 비교) — 찜-상태감시가
// 이미 정확히 추적 중인 class_id는 건드리지 않는다(덮어써서 되돌리지 않기
// 위함 — status-watch가 5분마다 더 정확하게 알고 있는 걸 하루 1번 배치가
// 뭉개면 안 됨).
export async function markFallenOutRowsAsUnavailable(client, freshClassIds, storeCodes) {
  const { data: bookmarkedRows, error: bookmarkError } = await client
    .from('user_bookmarks')
    .select('lottemart_class_id')
    .not('lottemart_class_id', 'is', null);
  if (bookmarkError) throw new Error(`찜한 class_id 조회 실패: ${bookmarkError.message}`);
  const bookmarkedIds = new Set((bookmarkedRows ?? []).map((r) => r.lottemart_class_id));

  // [부분 실행 안전장치] storesLimit으로 일부 지점만 돈 실행에서는 돌지 않은
  // 지점의 접수가능 행까지 "빠졌다"고 오판하면 안 되므로, 이번에 실제로 조회한
  // 지점(storeCodes)으로만 비교 범위를 좁힌다.
  const currentlyBookableIds = [];
  for (let from = 0; ; from += EXISTING_ID_PAGE_SIZE) {
    const { data, error } = await client
      .from('lottemart_culture_club_classes')
      .select('class_id')
      .in('registration_status', ['바로신청', '대기자신청'])
      .in('store_code', storeCodes)
      .range(from, from + EXISTING_ID_PAGE_SIZE - 1);
    if (error) throw new Error(`기존 접수가능 목록 조회 실패: ${error.message}`);
    currentlyBookableIds.push(...data.map((r) => r.class_id));
    if (data.length < EXISTING_ID_PAGE_SIZE) break;
  }

  const freshSet = new Set(freshClassIds);
  const staleIds = currentlyBookableIds.filter((id) => !freshSet.has(id) && !bookmarkedIds.has(id));
  if (staleIds.length === 0) return 0;

  for (let i = 0; i < staleIds.length; i += UPSERT_CHUNK_SIZE) {
    const chunk = staleIds.slice(i, i + UPSERT_CHUNK_SIZE);
    const { error } = await client.from('lottemart_culture_club_classes').update({ registration_status: '접수불가' }).in('class_id', chunk);
    if (error) throw new Error(`접수불가 갱신 실패: ${error.message}`);
  }
  return staleIds.length;
}

async function postPipelineLog(client, { status, errorMessage = null, metaData = null }) {
  try {
    const { error } = await client.from('pipeline_logs').insert({
      agent_name: SOURCE_KEY,
      status,
      error_message: errorMessage,
      meta_data: metaData,
      description: '롯데마트 문화센터 강좌 리스트 수집(searchList.do HTML 파싱) — 관리자 검토용, open_spaces 아님',
      period: 'daily',
    });
    if (error) {
      console.error(`⚠️ pipeline_logs 기록 실패(배치 자체에는 영향 없음): ${error.message}`);
    }
  } catch (err) {
    console.error(`⚠️ pipeline_logs 기록 중 예외(배치 자체에는 영향 없음): ${err.message}`);
  }
}

export async function run({ dryRun = false, storesLimit = null } = {}) {
  console.log(`▶ 롯데마트 문화센터 강좌 리스트 수집 시작 (dry-run: ${dryRun})`);

  const stores = storesLimit ? STORES.slice(0, storesLimit) : STORES;
  const allRows = [];

  for (const [storeCode, storeName] of stores) {
    for (const [targetCode, targetName] of TARGETS) {
      for (const semesterCode of SEMESTERS) {
        const rows = await fetchAllForCombo(storeCode, storeName, targetCode, targetName, semesterCode);
        allRows.push(...rows);
        await sleep(randomPacingDelay());
      }
    }
    console.log(`  [${storeName}] 누적 ${allRows.length}건`);
  }

  // 동일 classId가 여러 대상(target) 조회에 걸쳐 중복 수신될 가능성에 대비
  // (예: "엄마와 함께" 강좌가 유아 카테고리에도 걸릴 경우 등).
  const rows = [...new Map(allRows.map((row) => [row.class_id, row])).values()];
  console.log(`✅ 전체 수신 ${allRows.length}건, 중복 제거 후 ${rows.length}건`);

  if (dryRun) {
    console.log(JSON.stringify(rows.slice(0, 3), null, 2));
    return { sourceKey: SOURCE_KEY, count: rows.length, upserted: false };
  }

  const client = createAdminClient();

  let upsertedCount = 0;
  try {
    for (let i = 0; i < rows.length; i += UPSERT_CHUNK_SIZE) {
      const chunk = rows.slice(i, i + UPSERT_CHUNK_SIZE);
      const { error } = await client.from('lottemart_culture_club_classes').upsert(chunk, { onConflict: 'class_id' });
      if (error) {
        throw new Error(`lottemart_culture_club_classes upsert 실패: ${error.message}`);
      }
      upsertedCount += chunk.length;
    }
  } catch (err) {
    await postPipelineLog(client, { status: 'FAILED', errorMessage: err.message.slice(0, 500) });
    throw err;
  }

  console.log(`✅ Supabase(lottemart_culture_club_classes) upsert 완료: ${upsertedCount}건`);

  let unavailableCount = 0;
  try {
    unavailableCount = await markFallenOutRowsAsUnavailable(
      client,
      rows.map((r) => r.class_id),
      stores.map(([storeCode]) => storeCode)
    );
    if (unavailableCount > 0) {
      console.log(`  → 1번 버킷에서 빠진 ${unavailableCount}건을 '접수불가'로 갱신`);
    }
  } catch (err) {
    console.error(`⚠️ 접수불가 갱신 실패(배치 자체는 성공으로 처리): ${err.message}`);
  }

  await postPipelineLog(client, {
    status: 'OK',
    metaData: {
      unavailableCount,
      count: upsertedCount,
      // [search_reg_status=1 고정 이후] 신규 수신분은 거의 항상 바로신청/대기자신청
      // 뿐이지만, 혹시 다른 상태가 섞여 들어오면(실측과 다른 경우) 0이 아닌 값으로
      // 바로 드러나도록 5개 상태 전부 센다(접수불가는 신규 수신이 아니라 갱신
      // 전용이라 제외).
      byStatus: ['바로신청', '대기자신청', '접수마감', '전화문의', '현장접수'].reduce(
        (acc, s) => ({ ...acc, [s]: rows.filter((r) => r.registration_status === s).length }),
        {}
      ),
    },
  });

  return { sourceKey: SOURCE_KEY, count: upsertedCount, upserted: true };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dryRun = process.argv.includes('--dry-run');
  applyRandomStartupDelay(MAX_STARTUP_DELAY_MS)
    .then(() => run({ dryRun }))
    .catch((err) => {
      console.error(`❌ 롯데마트 문화센터 수집 실패: ${err.message}`);
      process.exit(1);
    });
}
