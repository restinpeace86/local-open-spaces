// [신세계 아카데미 문화센터 강좌 파싱](2026-10-08, implementation/todo.md
// 개선사항2 사용자 캡처 요청 기반): 실측 확인(sacademy.shinsegae.com/
// sdotcom/web/HP0010P0/getLectList.do, POST, JSON 직접 응답 — 서버 렌더
// HTML 아님, 파싱 불필요).
//
// [다중값 요청 — 전부 불가, 실측 확인] storeCode/targetCode 둘 다 공백
// 구분("01 03")·콤마 구분("01,03") 모두 totalCount=0으로 깨진다(롯데마트와
// 동일한 실패 패턴) — 지점 12개 × 수강대상(targetCode) 3개를 전부 단건으로
// 순회해야 한다.
//
// [rcptStat(접수상태)만 예외 — 빈 값으로 한 번에] 실측: rcptStat을 아예
// 안 보내면 PR(접수전)+RT(접수중)+RC(접수마감)+ST(대기등록) 전부의 합집합을
// 한 번에 돌려준다(본점 기준 빈값=208건, 개별합 94+103+11+0=208건으로 정확히
// 일치) — 응답의 lectStat 필드로 각 행이 어느 상태인지 그대로 알 수 있어
// (targetCode와 달리 응답에 상태를 되비춰주는 필드가 있음), 지점당 상태별
// 3번 나눠 조회할 필요 없이 1번만 조회하고 사후에 걸러내면 된다.
//
// [targetCode 라벨 — 전부 확정](2026-10-08 사용자 제보: "상세쪽에
// 수강대상이 있고 목록 리스트쪽엔 없네" — 목록 응답에 라벨이 없는 건
// 맞지만, 사용자가 찾아준 공용 코드 조회 엔드포인트(POST sacademy.
// shinsegae.com/sdotcom/cmmn/code/getCommCode.do, userdefHeaderCode=
// "0025")로 라벨 전체를 확정했다: B1=위드맘(대디), B2=키즈, C1=패밀리
// (headName "수강대상" 그룹 전체 — A3=임산부/A4=시니어/A5=남성/A9=기타/
// D1=커플/Z1=성인도 같은 그룹에 있지만 전부 "성인" 대상이라 이번 수집
// 범위(자녀 동반) 밖이다). 이 엔드포인트는 학기 코드(headCode "0009":
// S1=봄/S2=여름/S3=가을/S4=겨울)도 함께 확인해줬다 — 실측으로 S1/S2/S4는
// 전부 0건, S3만 현재 활성 학기임을 재확인(SCHOOL_SEMESTER_CODE 그대로
// 유지).
//
// [접수상태 라벨 — 전부 확정](실측: HP0010P0.do 원문 HTML의 라디오 버튼
// title 속성) PR=접수전, RT=접수중, RC=접수마감, ST=대기등록.
import { parseAgeRangeToMonths } from './age-range-parser.mjs';
import { normalizeDaysToCodes } from './schedule-normalizer.mjs';

export const SHINSEGAE_STORES = [
  ['01', '본점'],
  ['03', '타임스퀘어 & ON'],
  ['14', '강남점'],
  ['15', '마산점'],
  ['16', '사우스시티'],
  ['18', '센텀시티'],
  ['19', '의정부점'],
  ['37', '김해점'],
  ['40', '스타필드 하남점'],
  ['70', '천안아산점'],
  ['90', '대구신세계'],
  ['D1', '대전신세계'],
];

// [수강대상 — getCommCode.do(headCode=0025)로 라벨까지 전부 확정]
export const SHINSEGAE_TARGET_CODES = ['B1', 'B2', 'C1'];
export const SHINSEGAE_TARGET_LABELS = {
  B1: '위드맘(대디)',
  B2: '키즈',
  C1: '패밀리',
};

const OPEN_RAW_STATUSES = new Set(['RT']);
const WAITING_RAW_STATUSES = new Set(['ST']);
export function normalizeShinsegaeStatus(rawStatus) {
  if (OPEN_RAW_STATUSES.has(rawStatus)) return 'OPEN';
  if (WAITING_RAW_STATUSES.has(rawStatus)) return 'WAITING';
  return 'CLOSED'; // RC(접수마감)/PR(접수전) — 둘 다 "아직 신청 불가"로 안전하게 CLOSED.
}

// "2026.11.28~2026.11.28" 또는 "2026.11.28" 단일 — 날짜만, 시각 없음.
const PERIOD_REGEX = /(\d{4})\.(\d{1,2})\.(\d{1,2})(?:\s*~\s*(\d{4})\.(\d{1,2})\.(\d{1,2}))?/;

export function parsePeriod(text) {
  if (!text) return { startDate: null, endDate: null };
  const match = text.match(PERIOD_REGEX);
  if (!match) return { startDate: null, endDate: null };
  const [, y1, m1, d1, y2, m2, d2] = match;
  const pad = (n) => String(n).padStart(2, '0');
  const startDate = `${y1}-${pad(m1)}-${pad(d1)}`;
  const endDate = y2 ? `${y2}-${pad(m2)}-${pad(d2)}` : startDate;
  return { startDate, endDate };
}

// "11:00~11:40" → { startTime: '1100', endTime: '1140' }(다른 브랜드와 동일한
// HHmm 포맷으로 통일).
export function parseTimeRange(text) {
  if (!text) return { startTime: null, endTime: null };
  const match = text.match(/(\d{1,2}):(\d{2})\s*~\s*(\d{1,2}):(\d{2})/);
  if (!match) return { startTime: null, endTime: null };
  const [, h1, mi1, h2, mi2] = match;
  return { startTime: `${h1.padStart(2, '0')}${mi1}`, endTime: `${h2.padStart(2, '0')}${mi2}` };
}

export function parseFee(text) {
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

export function parseLecture(row, targetCode) {
  if (!row.lectCode || !row.lectName) return null;

  const { startDate, endDate } = parsePeriod(row.lectPeriod);
  const { startTime, endTime } = parseTimeRange(row.lectHm);
  // [접수 기간 — 시각 없음, 날짜만](실측 확인) inetLectPeriod가 온라인 접수
  // 시작~종료일을 담고 있지만 날짜만 있고 시각이 없다 — 다른 브랜드의
  // register_start_at(정밀 시각, 접수시작 10분 전 알림에 쓰임)과 달리
  // 가짜 시각을 지어내 채우지 않는다(제3장 제5조). 표시용으로만 raw_extra에
  // 날짜 문자열 그대로 둔다.
  const { startDate: registerStartDate, endDate: registerEndDate } = parsePeriod(row.inetLectPeriod);
  const { minAgeMonths, maxAgeMonths } = parseAgeRangeToMonths(row.lectName);
  const dayOfWeek = row.dayCodeName || null;

  return {
    class_id: row.lectCode,
    class_title: row.lectName,
    store_code: row.storeCode,
    store_name: row.storeName,
    class_day: dayOfWeek ? [dayOfWeek] : null,
    schedule_days_code: dayOfWeek ? normalizeDaysToCodes([dayOfWeek]) : null,
    start_time: startTime,
    end_time: endTime,
    class_fee: parseFee(row.lectAmt),
    instructor_name: row.tchName || null,
    min_age_months: minAgeMonths,
    max_age_months: maxAgeMonths,
    schedule_start_date: startDate,
    schedule_end_date: endDate,
    total_sessions: row.lectCnt != null ? Number(row.lectCnt) : null,
    raw_status: row.lectStat ?? null,
    normalized_status: normalizeShinsegaeStatus(row.lectStat),
    target_code: targetCode,
    target_name: SHINSEGAE_TARGET_LABELS[targetCode] ?? null,
    semester_code: row.smstCode ?? null,
    register_start_date: registerStartDate,
    register_end_date: registerEndDate,
  };
}

export function parseLectureListResponse(json, targetCode) {
  const list = json?.lectList ?? [];
  return list.map((row) => parseLecture(row, targetCode)).filter(Boolean);
}

export function getLectureListTotalCount(json) {
  const n = Number(json?.param?.totalCount);
  return Number.isFinite(n) ? n : 0;
}
