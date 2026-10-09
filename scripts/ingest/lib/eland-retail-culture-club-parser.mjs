import { parse } from 'node-html-parser';
import { parseAgeRangeToMonths } from './age-range-parser.mjs';
import { normalizeDaysToCodes } from './schedule-normalizer.mjs';

// [이랜드리테일 문화센터 강좌 파싱](2026-10-09 사용자 캡처 기반) 실측
// 확인(POST www.elandretail.com/m/culture/getLectureList.do, JSON 바디/
// `dataType:'html'` — 서버가 `<li>` 카드 목록 HTML을 그대로 돌려준다,
// node-html-parser로 파싱).
//
// [지점 — 6개, 전용 select 옵션에서 직접 확인](culture02.do 페이지의
// <select id="StoreID"> 옵션 텍스트 그대로).
export const ELAND_STORES = [
  ['8202', '야탑'],
  ['8205', '평촌아울렛'],
  ['8206', '강남패션'],
  ['8212', '순천'],
  ['8222', '부천'],
  ['8224', '송파'],
];

// [LecTypeID — <select id="LecTypeID"> 옵션에서 라벨 전부 확인](실측
// 확인) A=성인/E=성인단기/G=성인일일/X=미술관(전부 제외, 추측 아니라
// 라벨 자체가 비아동 대상임) — 사용자 지시(2026-10-09): "K 중도수강도
// 포함해 이거 연령이 성인꺼도 나와있는데 아이꺼도 있는거 확인했어. J도
// 뭐 일단은 포함시켜 나도 0건이라 확인은 못했어" — B/C/D/F/L/M은 실제
// 강좌 제목에 연령이 명확히 박혀있어 확인됐고(예: "(11-20개월)"), J/K는
// 사용자 지시로 포함(K는 성인/아동이 섞여 있어 사후에 min/max_age_months
// 기반 연령 필터가 자연히 걸러준다 — 별도 특수 처리 불필요).
export const ELAND_LEC_TYPE_CODES = ['B', 'C', 'D', 'F', 'J', 'K', 'L', 'M'];
export const ELAND_LEC_TYPE_LABELS = {
  B: '엄마랑아기랑',
  C: '아동',
  D: '초등',
  F: '아동단기',
  J: '방학특강',
  K: '중도수강',
  L: '아동일일',
  M: '엄마랑 아가랑 단기',
};

// [LecTypeID 다중값 — 콤마로 묶으면 깨짐](실측 확인: `LecTypeID=B,C` →
// 0건) 8개를 전부 따로 조회해야 한다. [지점은 비우면 전체](실측 확인:
// StoreID를 비우면 6개 지점 전체가 합쳐져서 나온다) — 지점 순회는
// 필요 없다.
// [PageSize를 크게 — 페이지네이션 없이 전량 한 번에](실측 확인:
// PageSize=500으로 카테고리 하나의 전량을 한 응답에 받음).
export const LARGE_PAGE_SIZE = 1000;

// [상태값 — "신청현황" select 옵션에서 코드/라벨 전부 확인](실측 확인:
// <select id="Status"> 03=수강신청/04=대기신청/01=현장문의/05=온라인
// 접수마감/02=마감) 목록 응답의 <mark> 텍스트는 코드가 아니라 이 라벨
// 그대로 나온다. [실측 특이사항] 현재 전체 지점·전체 카테고리를 통틀어
// 수강신청(03)/대기신청(04) 상태인 강좌가 하나도 없었다 — 상세 페이지의
// "온라인 수강신청 접수 가능시간이 아닙니다" 안내로 보아 온라인 접수가
// 상시가 아니라 특정 시간대에만 열리는 구조로 보인다(추측 금지 — 그냥
// 실측 사실만 기록).
const OPEN_STATUS_LABELS = new Set(['수강신청']);
const WAITING_STATUS_LABELS = new Set(['대기신청']);
export function normalizeElandStatus(statusText) {
  if (OPEN_STATUS_LABELS.has(statusText)) return 'OPEN';
  if (WAITING_STATUS_LABELS.has(statusText)) return 'WAITING';
  return 'CLOSED'; // 현장문의/마감/온라인 접수마감
}

// "월요일" → "월"(다른 브랜드의 단일 글자 요일 표기와 통일).
export function parseKoreanDayChar(text) {
  if (typeof text !== 'string' || text.length === 0) return null;
  return text.trim().charAt(0) || null;
}

// "13:50 ~ 14:30" → { startTime: '1350', endTime: '1430' }.
export function parseTimeRange(text) {
  if (typeof text !== 'string') return { startTime: null, endTime: null };
  const match = /(\d{1,2}):(\d{2})\s*~\s*(\d{1,2}):(\d{2})/.exec(text);
  if (!match) return { startTime: null, endTime: null };
  const [, h1, mi1, h2, mi2] = match;
  return { startTime: `${h1.padStart(2, '0')}${mi1}`, endTime: `${h2.padStart(2, '0')}${mi2}` };
}

// "77,000원" → 77000.
export function parseFeeAmount(text) {
  if (typeof text !== 'string') return null;
  const digits = text.replace(/[^0-9]/g, '');
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}

// "11회 (월)동화촉감놀이 당나귀똥(11-20개월) 13:50" → 11(맨 앞 "N회").
export function parseTotalSessionsFromTitle(title) {
  if (typeof title !== 'string') return null;
  const match = /^(\d+)\s*회/.exec(title.trim());
  return match ? Number(match[1]) : null;
}

// [목록 카드 1건 파싱](실측 확인된 구조): onclick="culture04('storeid',
// 'semnum','lectypeid','seq')"에서 상세 페이지 재구성에 필요한 4개 값을
// 전부 얻는다(지점명/요일/시간/가격은 두 개의 .assist span을 "|"로
// 나눠서 읽는다 — 중첩된 <span>|</span>도 .text로 그대로 "|" 문자가
// 나옴을 실측 확인).
export function parseLectureCard(anchorEl) {
  const onclick = anchorEl.getAttribute('onclick') ?? '';
  const match = /culture04\('(\w+)','(\w+)','(\w+)','(\w+)'\)/.exec(onclick);
  if (!match) return null;
  const [, storeId, semNum, lecTypeId, seq] = match;

  const titleEl = anchorEl.querySelector('strong');
  const classTitle = titleEl?.text.replace(/\s+/g, ' ').trim();
  if (!classTitle) return null;

  const statusText = anchorEl.querySelector('mark')?.text.trim() ?? null;
  const assists = anchorEl.querySelectorAll('span.assist');
  const [storeName] = (assists[0]?.text ?? '').split('|').map((s) => s.trim());
  const [dayTimeText, feeText] = (assists[1]?.text ?? '').split('|').map((s) => s.trim());
  const dayMatch = /^(\S+)\s/.exec(dayTimeText ?? '');
  const dayChar = dayMatch ? parseKoreanDayChar(dayMatch[1]) : null;
  const { startTime, endTime } = parseTimeRange(dayTimeText);
  // [연령 — 강좌명 제목에서 추출](다른 브랜드와 동일한 공유 유틸 — 제5장
  // 제4조) 목록 응답에 별도 연령 컬럼이 없어 제목 괄호 표기("11-20개월"/
  // "5-7세")에서 파싱한다.
  const { minAgeMonths, maxAgeMonths } = parseAgeRangeToMonths(classTitle);

  return {
    class_id: `${storeId}_${semNum}_${lecTypeId}_${seq}`,
    store_id: storeId,
    sem_num: semNum,
    lec_type_id: lecTypeId,
    seq,
    class_title: classTitle,
    store_code: storeId,
    store_name: storeName || null,
    class_day: dayChar ? [dayChar] : null,
    schedule_days_code: dayChar ? normalizeDaysToCodes([dayChar]) : null,
    start_time: startTime,
    end_time: endTime,
    class_fee: parseFeeAmount(feeText),
    total_sessions: parseTotalSessionsFromTitle(classTitle),
    min_age_months: minAgeMonths,
    max_age_months: maxAgeMonths,
    raw_status: statusText,
    normalized_status: normalizeElandStatus(statusText),
    target_code: lecTypeId,
    target_name: ELAND_LEC_TYPE_LABELS[lecTypeId] ?? null,
  };
}

export function parseLectureListResponse(html) {
  const root = parse(html);
  const anchors = root.querySelectorAll('li a');
  return anchors.map(parseLectureCard).filter(Boolean);
}
