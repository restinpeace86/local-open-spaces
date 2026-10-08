// [AK플라자 문화아카데미 강좌 파싱](2026-10-09 사용자 캡처 요청 기반):
// 실측 확인(culture.akplaza.com/course/getPeltList_New, POST, JSON 직접
// 응답 — 서버 렌더 HTML 아님, 파싱 불필요. 신세계와 동일한 구조).
//
// [지점 — "전체"/"다중값" 둘 다 불가, 세션 기반이라 더 특이함](실측 확인)
// 이 엔드포인트의 `store` 바디 파라미터는 **완전히 무시된다** — 존재하지
// 않는 지점 코드(예: "99")를 넣어도 결과가 전혀 달라지지 않는다. 실제
// 지점은 `/common/change_main_store`(POST, body `store=0N`)를 먼저
// 호출해 응답의 `Set-Cookie: JSESSIONID=...`를 세션으로 저장해야 하고,
// 이후 `getPeltList_New` 호출은 그 세션에 저장된 지점 데이터를 그대로
// 돌려준다(akplaza-culture-club.mjs의 fetchAllForStore 참고). 지점이
// 롯데마트(60+)/신세계(12)/현대백화점(10)보다 훨씬 적은 **4개뿐**이라
// 매 지점마다 세션을 새로 설정하고 순회해도 가볍다.
//
// [지점 목록 — 홈페이지 "지점 안내" 메뉴에서 직접 확인](전용 목록 API
// 없음, culture.akplaza.com 메인 페이지의 `<a href="/academy/store0N">`
// 링크 4개).
import { parseAgeRangeToMonths } from './age-range-parser.mjs';

export const AKPLAZA_STORES = [
  ['01', '분당점'],
  ['02', '수원점'],
  ['03', '평택점'],
  ['04', '원주점'],
];

// [수강대상(main_cd) — getMain 엔드포인트가 라벨을 직접 내려줌, 추측
// 불필요](실측 확인: POST culture.akplaza.com/getMain → {"mainlist":[...]}
// SUB_CODE/LONG_NAME/SHORT_NAME) 1=Adult(성인 대상, 제외)/2=Baby(엄마랑
// 아가랑)/3=Kids(유아, 어린이)/4=Family(가족 이벤트)/5=미사용 코드(제외).
export const AKPLAZA_MAIN_CODES = ['2', '3', '4'];
export const AKPLAZA_MAIN_LABELS = {
  1: 'Adult',
  2: '엄마랑 아가랑',
  3: '유아, 어린이',
  4: '가족 이벤트',
  5: '미사용 코드',
};

// [main_cd 다중값 — 콤마로 묶으면 깨짐](실측 확인: `main_cd=2,3` → 0건)
// 하지만 빈 값으로 보내면 Adult/Baby/Kids/Family/미사용 전부가 한 응답에
// 섞여 나오고, 각 행 자체에 MAIN_CD 필드가 그대로 있어(신세계의 rcptStat
// 빈값 트릭과 동일한 패턴) 지점당 단 1회 요청 후 사후 필터링으로 충분하다
// — main_cd별로 따로 돌 필요가 없다(akplaza-culture-club.mjs 참고).

// [상태값 — 3종 확인](실측 확인: STATUS_TXT) 접수가능/마감임박/마감.
// "마감임박"은 아직 접수 가능한 상태라 OPEN으로 묵는다(원문은 raw_status에
// 보존해 추후 "마감임박 알림" 같은 기능에서 구분해 쓸 수 있게 한다).
// "대기"(WAITING) 상태는 실측 범위에서 보이지 않았다 — 없다고 단정하지
// 않고, 매핑에 없는 값은 안전하게 CLOSED로 처리한다(제3장 제5조).
const OPEN_RAW_STATUSES = new Set(['접수가능', '마감임박']);
export function normalizeAkplazaStatus(statusText) {
  if (OPEN_RAW_STATUSES.has(statusText)) return 'OPEN';
  return 'CLOSED'; // 마감 / 매핑에 없는 값
}

// "14:50~16:10" → { startTime: '1450', endTime: '1610' }(다른 브랜드와
// 동일한 HHmm 포맷으로 통일. 브랜드별 독립 구현 — Decision 028 제4항).
export function parseTimeRange(text) {
  if (!text) return { startTime: null, endTime: null };
  const match = text.match(/(\d{1,2}):(\d{2})\s*~\s*(\d{1,2}):(\d{2})/);
  if (!match) return { startTime: null, endTime: null };
  const [, h1, mi1, h2, mi2] = match;
  return { startTime: `${h1.padStart(2, '0')}${mi1}`, endTime: `${h2.padStart(2, '0')}${mi2}` };
}

// "20261017" → "2026-10-17"(다른 브랜드의 yyyymmddToIso와 동일한 포맷,
// 브랜드별 독립 구현).
export function yyyymmddToDash(text) {
  if (typeof text !== 'string' || !/^\d{8}$/.test(text)) return null;
  return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
}

// [이미지 — 목록 응답 자체에 이미 있음, 상세 페이지 조사 불필요](실측
// 확인) 상세 페이지(/course/detail)의 썸네일 표시 블록은 사이트 자체가
// "<!-- 썸네일 임시제거 -->" 주석으로 꺼둔 상태라 상세 페이지에서는 이미지를
// 전혀 볼 수 없다 — 그러나 목록 응답(getPeltList_New)의 각 행에 여전히
// THUMBNAIL_IMG 파일명이 내려오고, `${image_dir}/wlect/${THUMBNAIL_IMG}`
// 로 조합하면 실제로 살아있는 이미지(200 OK)를 바로 받을 수 있음을 실측
// 확인했다. 그래서 이 함수는 akplaza-culture-club.mjs(목록 배치)에서
// 바로 쓰고, 별도 상세수집 스크립트는 이미지가 아니라 소개 텍스트
// (lect_info)만 채운다.
export function buildThumbnailUrl(imageDir, thumbnailImg) {
  if (!imageDir || !thumbnailImg) return null;
  return `${imageDir}/wlect/${thumbnailImg}`;
}

// [분류 2단계 — AK플라자는 "수강대상"과 "강좌분야"를 둘 다 구조화된
// 필드로 갖고 있다](실측 확인: 상세 페이지 표 "수강대상: Kids / 강좌분야:
// 키즈 신규") 신세계(수강대상만 있고 분류가 없어 target_name을
// sub_category_name 자리에 썼음)와 달리, AK플라자는 이마트처럼 진짜
// main>sub 2단계 분류가 가능하다 — main_category_name엔 수강대상 한글
// 라벨(엄마랑 아가랑/유아,어린이/가족 이벤트)을, sub_category_name엔
// 강좌분야(SECT_NM, 예: "외국어"/"쿠킹/베이킹")를 둔다.
export function parseLecture(row) {
  if (!row.SUBJECT_CD || !row.SUBJECT_NM) return null;

  const { startTime, endTime } = parseTimeRange(row.LECT_HOUR);
  const mainCd = row.MAIN_CD != null ? String(row.MAIN_CD) : null;
  const dayOfWeek = row.DAY || null;
  // [연령 — 강좌명 제목에서 추출](다른 브랜드와 동일한 공유 유틸 — 제5장
  // 제4조. 목록 응답에 별도 연령 컬럼이 없어 이마트/신세계와 동일하게
  // 제목 괄호 표기("4-7세, 혼자"/"10-20개월"/"48개월-7세")에서 파싱한다.
  // "7세-초등"처럼 숫자가 아닌 쪽은 매칭되지 않아 둘 다 null이 된다
  // (추측으로 지어내지 않음).
  const { minAgeMonths, maxAgeMonths } = parseAgeRangeToMonths(row.SUBJECT_NM);
  // [재료비 — FOOD_YN이 'Y'일 때만 FOOD_AMT가 확정값](실측 확인: FOOD_YN은
  // Y(확정 금액)/N(재료비 없음)/R(재료비 있지만 금액 별도 — FOOD_AMT=0은
  // "0원"이 아니라 "금액 미확정"을 뜻함) — N이 아닌데 R인 경우 0을 그대로
  // 쓰면 "재료비 0원"으로 오해하게 돼, Y가 아니면 null로 둔다(제3장 제5조).
  const materialFee = row.FOOD_YN === 'Y' && row.FOOD_AMT != null ? Number(row.FOOD_AMT) : null;

  return {
    class_id: row.SUBJECT_CD,
    class_title: row.SUBJECT_NM,
    store_code: row.STORE,
    main_category_name: mainCd != null ? AKPLAZA_MAIN_LABELS[mainCd] ?? null : null,
    sub_category_name: row.SECT_NM || null,
    class_day: dayOfWeek ? [dayOfWeek] : null,
    start_time: startTime,
    end_time: endTime,
    class_fee: row.REGIS_FEE != null ? Number(row.REGIS_FEE) : null,
    class_material_fee: materialFee,
    instructor_name: row.LECTURER_NM || null,
    min_age_months: minAgeMonths,
    max_age_months: maxAgeMonths,
    schedule_start_date: yyyymmddToDash(row.START_YMD),
    schedule_end_date: yyyymmddToDash(row.END_YMD),
    total_sessions: row.LECT_CNT != null ? Number(row.LECT_CNT) : null,
    raw_status: row.STATUS_TXT ?? null,
    normalized_status: normalizeAkplazaStatus(row.STATUS_TXT),
    main_cd: mainCd,
    sect_cd: row.SECT_CD ?? null,
    subject_fg_name: row.SUBJECT_FG_NM ?? null,
    reco_cnt: row.RECO_CNT != null ? Number(row.RECO_CNT) : null,
    main_image_url: buildThumbnailUrl(row.__imageDir, row.THUMBNAIL_IMG),
  };
}

export function parseLectureListResponse(json) {
  const imageDir = json?.image_dir ?? null;
  const list = json?.list ?? [];
  return list.map((row) => parseLecture({ ...row, __imageDir: imageDir })).filter(Boolean);
}

export function getLectureListTotalCount(json) {
  const n = Number(json?.listCnt);
  return Number.isFinite(n) ? n : 0;
}
