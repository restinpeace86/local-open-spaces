// [스타필드 문화센터(클래스콕) 강좌 파싱](2026-10-09 사용자 캡처 요청
// 기반): "스타필드쪽도 3개 데이터 넣을까하는데" — 실측 확인(POST
// www.classkok.com/mlt/selectLctrList.do, JSON 직접 응답 — 서버 렌더
// HTML 아님, 파싱 불필요).
//
// [지점 — 완전 무상태(stateless), 다른 5개 브랜드보다 더 간단함](실측
// 확인) 이 사이트엔 "_classkok_store_" 쿠키(클라이언트 JS가 document.
// cookie로 직접 설정, 서버 세션 아님) 게이트가 있어 쿠키가 전혀 없으면
// 모든 요청이 /selectStore.do로 리다이렉트된다. 그런데 **쿠키 값 자체는
// 무엇이든 상관없고(존재만 하면 통과), 실제 지점은 요청 바디의 storeCd
// 파라미터가 그대로 적용**된다(실측: 쿠키=고양, storeCd=수원으로 보내면
// 수원 데이터가 나옴) — 그래서 AK플라자처럼 지점마다 세션을 다시 설정할
// 필요 없이, 고정된 쿠키 헤더 하나(아래 STATIC_STORE_COOKIE)만 달고
// storeCd만 바꿔가며 완전히 무상태로 지점을 순회할 수 있다.
//
// [지점 목록 — 홈페이지 지점선택 화면에서 직접 확인](전용 목록 API 없음,
// classkok.com/selectStore.do의 goStore("01"/"02"/"03") 리터럴 + 지점
// 조회(/mcm/selectStoreList.do)의 storeEnNm으로 확정).
import { parseAgeRangeToMonths } from './age-range-parser.mjs';
import { normalizeDaysToCodes } from './schedule-normalizer.mjs';

export const STARFIELD_STORES = [
  ['01', '고양', 'goyang'],
  ['02', '수원', 'suwon'],
  ['03', '운정', 'unjeong'],
];

// 모든 요청에 필요한 고정 쿠키(값은 무엇이든 상관없음 — 존재만 확인하는
// 게이트, 실제 지점은 storeCd 바디 파라미터로 결정됨. "01"을 Base64(UTF8)
// 인코딩한 값).
export const STATIC_STORE_COOKIE = '_classkok_store_=MDE=';

// [수강대상(lctrTrgCtgryCd) — 공용 조회로 라벨 확정](실측 확인: POST
// /mcm/selectLctrSrchPopUpNeedInfo.do → lctrTrgCtgryList) 1=성인(제외,
// 사용자 지시: "lctrTrgCtgryCd 1 이거 성인인데 이건 필요없어")/2=어린이/
// 3=영유아/4=펫(제외). 이 두 코드만 수집한다.
export const STARFIELD_TARGET_CODES = ['2', '3'];
export const STARFIELD_TARGET_LABELS = { 2: '어린이', 3: '영유아' };

// [수강대상 다중값 — 콤마로 묶으면 깨짐](실측 확인: `lctrTrgCtgryCd=2,3`
// → 0건) [빈 값 트릭도 안 통함](실측 확인) 빈 값으로 보내면 성인/펫까지
// 섞여서 나오는데, 신세계/AK플라자와 달리 응답의 각 행에 실제 카테고리를
// 되비춰주는 필드가 전혀 없다(lctrTrgCtgryCd/lctrTrgCtgryNm이 행마다
// 항상 null — 요청 파라미터를 그대로 echo하는 메타필드일 뿐 실제 값이
// 아님). 그래서 2/3을 반드시 따로따로 조회해야 하고, 그 요청에 쓴 코드를
// 호출부가 parseLecture()에 직접 넘겨줘야 한다(신세계의 targetCode 전달
// 패턴과 동일 — 응답이 스스로 말해주지 않는 정보를 호출 컨텍스트가 채움).
//
// [페이지네이션 — 고정 20건, recordsPerPage 무시됨](실측 확인) 매 행에
// 들어있는 lctrTotCnt로 총량을 보고 ceil(총량/20)만큼 페이지를 순회해야
// 한다.
export const RECORDS_PER_PAGE = 20;

// [상태값 — JS 코드에 라벨이 그대로 박혀 있어 추측 불필요](실측 확인:
// 목록 페이지의 뱃지 렌더링 if/else 분기) I=접수중/AA=추가접수중/
// P=매진임박(셋 다 "아직 신청 가능" — OPEN) / WD=대기불가(CLOSED) /
// 그 외(실측된 예: S)=대기가능(WAITING, else 분기).
const OPEN_RAW_STATUSES = new Set(['I', 'AA', 'P']);
const CLOSED_RAW_STATUSES = new Set(['WD']);
export function normalizeStarfieldStatus(acptStCd) {
  if (OPEN_RAW_STATUSES.has(acptStCd)) return 'OPEN';
  if (CLOSED_RAW_STATUSES.has(acptStCd)) return 'CLOSED';
  return 'WAITING';
}

// "11:30" → "1130"(다른 브랜드와 동일한 HHmm 포맷. 브랜드별 독립 구현 —
// Decision 028 제4항). AK플라자의 parseTimeRange와 달리 시작/종료가 이미
// 별도 필드(lctrBeginHrmnt/lctrTrmntHrmnt)로 나뉘어 있어 "~" 구분자를
// 파싱할 필요가 없다.
export function parseHHMM(text) {
  if (!text) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(text);
  if (!match) return null;
  return `${match[1].padStart(2, '0')}${match[2]}`;
}

// "2026.10.09" → "2026-10-09".
export function parseDotDate(text) {
  if (typeof text !== 'string') return null;
  const match = /^(\d{4})\.(\d{2})\.(\d{2})$/.exec(text);
  if (!match) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

// [접수 시작/종료 — 날짜+시각까지 정밀하게 제공됨](실측 확인: acptBeginDtm
// /acptTrmntDtm이 "2026-09-10 00:00:00" 형태) 다른 브랜드(신세계/현대/
// AK플라자)는 날짜만 있거나 이 개념 자체가 없었는데, 스타필드는 KST
// 기준 날짜+시각이 그대로 있어 emart와 동일한 정밀도의 register_start_at
// 을 만들 수 있다(emart-culture-club.mjs의 parseRegisterStartAt과 동일한
// "+09:00" 고정 오프셋 관례 — 이 서비스는 한국 사용자 전용).
export function parseRegisterAt(raw) {
  if (typeof raw !== 'string') return null;
  const match = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/.exec(raw);
  if (!match) return null;
  return `${match[1]}T${match[2]}+09:00`;
}

// [이미지 — 목록 응답 자체에 완전한 URL로 이미 있음](실측 확인:
// thumbnailImgPath) AK플라자처럼 별도 조합이 필요 없다 — 별도 상세수집
// 단계는 이미지가 아니라 소개 텍스트만 책임진다(starfield-culture-club-
// detail.mjs 참고).
//
// [수강료 — 학습비/재료비 분리는 항상 null, 총액만 신뢰 가능](실측
// 확인: dcAfterStdyAmt/dcAfterMtrlAmt는 샘플 전체에서 항상 null, dc
// AfterSmtnAmt/dcBfrSmtnAmt만 실제 값이 있음) 분리된 적이 없는 값을
// 지어내 쪼개지 않고 총액만 class_fee/class_original_fee에 쓴다
// (제3장 제5조).
export function parseLecture(row, targetCtgryCd) {
  if (!row.lctrNo || !row.lctrNm) return null;

  const { minAgeMonths, maxAgeMonths } = parseAgeRangeToMonths(row.lctrNm);
  const dayOfWeek = row.indcnDywkNm || null;

  return {
    class_id: row.lctrNo,
    class_title: row.lctrNm,
    store_code: row.storeCd,
    store_name: row.storeNm,
    class_day: dayOfWeek ? [dayOfWeek] : null,
    schedule_days_code: dayOfWeek ? normalizeDaysToCodes([dayOfWeek]) : null,
    start_time: parseHHMM(row.lctrBeginHrmnt),
    end_time: parseHHMM(row.lctrTrmntHrmnt),
    class_fee: row.dcAfterSmtnAmt != null ? Number(row.dcAfterSmtnAmt) : null,
    class_original_fee: row.dcBfrSmtnAmt != null ? Number(row.dcBfrSmtnAmt) : null,
    min_age_months: minAgeMonths,
    max_age_months: maxAgeMonths,
    schedule_start_date: parseDotDate(row.lctrBeginDt),
    schedule_end_date: parseDotDate(row.lctrTrmntDt),
    total_sessions: row.totalTmcnt != null ? Number(row.totalTmcnt) : null,
    raw_status: row.acptStCd ?? null,
    normalized_status: normalizeStarfieldStatus(row.acptStCd),
    register_start_at: parseRegisterAt(row.acptBeginDtm),
    // [수강대상 라벨 — 응답에 없어 호출 컨텍스트가 채움](위 STARFIELD_
    // TARGET_CODES 주석 참고) 신세계의 targetCode 전달 패턴과 동일.
    target_code: targetCtgryCd,
    target_name: STARFIELD_TARGET_LABELS[targetCtgryCd] ?? null,
    pfmco_nm: row.pfmcoNm ?? null,
    fdtr_yn: row.fdtrYn ?? null,
    lctr_type: row.lctrType ?? null,
    register_end_at: parseRegisterAt(row.acptTrmntDtm),
    main_image_url: row.thumbnailImgPath || null,
  };
}

export function parseLectureListResponse(json, targetCtgryCd) {
  const list = json?.list ?? [];
  return list.map((row) => parseLecture(row, targetCtgryCd)).filter(Boolean);
}

// [총건수 — 행마다 중복으로 들어있음](실측 확인: 응답에 별도 totalCount
// 필드가 없고, 각 행의 lctrTotCnt가 전부 동일한 총건수를 담고 있다) 첫
// 행에서 한 번만 읽으면 된다.
export function getLectureListTotalCount(json) {
  const n = Number(json?.list?.[0]?.lctrTotCnt);
  return Number.isFinite(n) ? n : 0;
}
