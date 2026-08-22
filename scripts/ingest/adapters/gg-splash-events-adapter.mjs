// GG_SPLASH_EVENTS: 경기데이터드림(data.gg.go.kr) 물놀이형 수경시설(바닥분수 등) 수집 (Task 9-6-4)
// 기존 gg-events-adapter.mjs(GgEventsAdapter)가 API2로 함께 수집하던 TBWTRWTRPLYHYDRDTAM을
// 분리 이전했다 — 이 시설은 원본 OPR_PRD 필드("3개월(6월~8월)" 등)가 보여주듯 여름 한정 계절
// 운영 설치물이라 "상시 개방 공간"(open_spaces)이 아니라 시한성 이벤트(events)로 분류한다
// (project/data_sources.md §2.2 참고).
//
// OPR_PRD 파싱(실측 확인, 2026-08-23 라이브 전수 호출로 발견한 실제 형식 4종 — 최초에는
// "N개월(M월~M월)" 하나만 가정했다가 실제 811건 중 상당수가 다른 형식이라 전량 스킵되는 것을
// 실측으로 발견해 보완함):
//   1) "N개월(M월~M월)" — 예: "3개월(6월~8월)" (양쪽 다 "월" 있음)
//   2) "N개월(M~M월)"   — 예: "3개월(6~8월)" (시작월에는 "월" 없음)
//   3) "N개월(M월D일~M월D일)" / "N일(M월D일~M월D일)" — 예: "2개월(6월22일~8월18일)",
//      "45일(7월15일~8월31일)" (일자까지 명시)
//   4) "YYYY.M.D~M.D." — 예: "2025.5.24~10.10." (점 구분 날짜, 연도 포함)
// 4)의 연도는 "기록 당시" 값일 뿐 규칙적으로 반복 운영되는 계절 시설(OPR_INST='지자체')의
// 매년 반복 기간 자체가 의미 있어, 명시된 연도는 버리고 월/일만 추출한다(1)~3)과 동일하게
// "오늘 기준 가장 가까운 미래/현재 해당 연도"로 재계산한다 — 매일 재수집되므로, 이미 이번 해
// 시즌이 끝났으면(end < 오늘) 다음 해 같은 기간으로 굴린다. 날짜를 지어내는 게 아니라 원본이
// 명시한 "몇 월(며칠)~몇 월(며칠)" 구간을 그대로 쓰는 것이다. 위 4개 형식 어디에도 해당하지
// 않으면(예: "상시운영") 행 자체를 만들지 않는다(추측 금지).
//
// 주소(HYDR_ADDR)는 처음부터 실제 도로명/지번 주소라(gg-culture-events-adapter.mjs의 API1처럼
// 텍스트에서 지역명만 추출해야 하는 경우와 다름) VWorld 지오코딩으로 바로 EXACT 정밀도를
// 확보한다. 이 소스는 경기도 전용이라 gg-culture-events-adapter.mjs와 동일한 GYEONGGI_BOUNDS
// 오매칭 방지 검증을 재사용한다.
//
// is_free/is_kids_friendly: 기존 gg-events-adapter.mjs API2 처리와 동일하게 사용자 명시 지시대로
// 고정 매핑한다(바닥분수/물놀이터는 기본 무료+키즈친화). facility_type도 동일하게 '야외' 고정
// (계절 운영형 실외 수경시설이라는 물리적 특성).
import crypto from 'crypto';
import { BaseCollectorAdapter } from './base-collector-adapter.mjs';
import { buildEventRow, UI_CATEGORY } from './lib/schema-mapper.mjs';
import { geocode, hasVworldApiKey } from './lib/vworld-geocoder.mjs';
import { isWithinGyeonggiBounds } from './gg-culture-events-adapter.mjs';

const SPLASH_BASE_URL = 'https://openapi.gg.go.kr/TBWTRWTRPLYHYDRDTAM';
const PAGE_SIZE = 100;
const SUCCESS_RESULT_CODE = 'INFO-000';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const GEOCODE_PACING_MS = 250;
const GEOCODE_MAX_ATTEMPTS = 3;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isValidMonthDay(month, day) {
  if (month < 1 || month > 12) return false;
  if (day !== null && (day < 1 || day > 31)) return false;
  return true;
}

// 괄호 앞의 "N개월"/"N일" 부분은 검증 없이 무시한다(개월수/일수는 파생값이라 별도 검증 불필요).
// 반환값은 항상 { startMonth, startDay, endMonth, endDay } 형태 — startDay/endDay는 일자가
// 명시되지 않은 형식(1, 2번)이면 null(호출부에서 "1일"/"그 달 말일"로 보완).
export function parseOprPrd(raw) {
  if (!raw) return null;

  // 형식 3) "M월D일~M월D일" — 형식 4)(점 구분)보다 먼저 시도해야 "일" 문자가 있는 이 형식이
  // 아래 점 구분 정규식에 잘못 걸리지 않는다.
  const dayRangeMatch = raw.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일\s*~\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  if (dayRangeMatch) {
    const [, sm, sd, em, ed] = dayRangeMatch.map(Number);
    if (!isValidMonthDay(sm, sd) || !isValidMonthDay(em, ed)) return null;
    return { startMonth: sm, startDay: sd, endMonth: em, endDay: ed };
  }

  // 형식 4) "YYYY.M.D~M.D." — 연도(YYYY.)는 있어도 무시한다(위 헤더 주석 참고).
  const dotDateMatch = raw.match(/(?:\d{4}\.)?(\d{1,2})\.(\d{1,2})\s*~\s*(\d{1,2})\.(\d{1,2})\.?/);
  if (dotDateMatch) {
    const [, sm, sd, em, ed] = dotDateMatch.map(Number);
    if (!isValidMonthDay(sm, sd) || !isValidMonthDay(em, ed)) return null;
    return { startMonth: sm, startDay: sd, endMonth: em, endDay: ed };
  }

  // 형식 1)/2) "M월~M월" 또는 "M~M월" — 일자 없이 월만 명시된 경우.
  const monthRangeMatch = raw.match(/(\d{1,2})\s*월?\s*~\s*(\d{1,2})\s*월/);
  if (monthRangeMatch) {
    const [, sm, em] = monthRangeMatch.map(Number);
    if (!isValidMonthDay(sm, null) || !isValidMonthDay(em, null)) return null;
    return { startMonth: sm, startDay: null, endMonth: em, endDay: null };
  }

  return null;
}

// 실측으로 발견한 버그: toISOString()은 UTC로 변환하므로, KST(UTC+9)에서 구성한 로컬 자정
// Date는 전날로 밀린다(예: 2026-06-01 00:00 KST → "2026-05-31T15:00:00Z"). 로컬 연/월/일
// 값을 직접 읽어 문자열로 조립해 타임존 변환 없이 그대로 사용한다.
function toIsoDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// 해당 연도 endMonth의 마지막 날. new Date(year, month, 0)은 "month"의 0일째 = "month-1"의
// 말일을 반환하므로, 1-indexed month를 그대로 넘기면 그 달의 말일이 나온다.
function lastDayOfMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

export function computeSeasonDateRange({ startMonth, startDay, endMonth, endDay }, today) {
  const year = today.getFullYear();
  const startOfYear = (y) => new Date(y, startMonth - 1, startDay ?? 1);
  const endOfYear = (y) => new Date(y, endMonth - 1, endDay ?? lastDayOfMonth(y, endMonth));

  let start = startOfYear(year);
  let end = endOfYear(year);
  if (end < today) {
    start = startOfYear(year + 1);
    end = endOfYear(year + 1);
  }
  return { startDate: toIsoDate(start), endDate: toIsoDate(end) };
}

export class GgSplashEventsAdapter extends BaseCollectorAdapter {
  constructor() {
    super({ sourceKey: 'GG_SPLASH_EVENTS', targetTable: 'events' });

    this.apiKey = process.env.GG_DATA_API_KEY;
    if (!this.apiKey) {
      throw new Error('GG_DATA_API_KEY 환경변수가 설정되지 않았습니다.');
    }
    if (!hasVworldApiKey()) {
      throw new Error(
        'VWORLD_API_KEY 환경변수가 설정되지 않았습니다. 물놀이형 수경시설 원본에는 좌표 필드가 없어 지오코딩이 필수입니다.'
      );
    }
  }

  async fetchPage(pIndex) {
    const params = new URLSearchParams({
      KEY: this.apiKey,
      Type: 'json',
      pIndex: String(pIndex),
      pSize: String(PAGE_SIZE),
    });

    const url = `${SPLASH_BASE_URL}?${params.toString()}`;
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    const text = await res.text();

    if (!res.ok) {
      throw new Error(`GgSplashEvents 호출 실패 (HTTP ${res.status}): ${text.slice(0, 300)}`);
    }

    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`GgSplashEvents 응답이 JSON이 아닙니다: ${text.slice(0, 300)}`);
    }

    const root = json.TBWTRWTRPLYHYDRDTAM;
    if (!root) {
      throw new Error(`GgSplashEvents 응답에 루트 키가 없습니다: ${text.slice(0, 300)}`);
    }

    const head = root[0]?.head ?? [];
    const totalCount = head.find((h) => 'list_total_count' in h)?.list_total_count ?? 0;
    const result = head.find((h) => 'RESULT' in h)?.RESULT;

    if (result?.CODE !== SUCCESS_RESULT_CODE) {
      throw new Error(`GgSplashEvents 에러 응답: ${result?.CODE} ${result?.MESSAGE}`);
    }

    const items = root[1]?.row ?? [];
    return { items, totalCount };
  }

  async fetch() {
    const items = [];
    let pIndex = 1;
    let totalCount = Infinity;

    while ((pIndex - 1) * PAGE_SIZE < totalCount) {
      const page = await this.fetchPage(pIndex);
      totalCount = page.totalCount;
      items.push(...page.items);
      pIndex += 1;
    }

    return { items };
  }

  // eslint-disable-next-line class-methods-use-this
  buildExternalId(name, address) {
    const hash = crypto.createHash('sha1').update(`${name}|${address}`).digest('hex').slice(0, 16);
    return `GG_SPLASH_EVENT_${hash}`;
  }

  async geocodeOrSkip(name, address) {
    for (let attempt = 1; attempt <= GEOCODE_MAX_ATTEMPTS; attempt += 1) {
      try {
        const coords = await geocode(address);
        await sleep(GEOCODE_PACING_MS);

        if (!coords) {
          console.warn(`⚠️ 지오코딩 결과 없음 [${name}] "${address}" — 건너뜀`);
          return null;
        }
        if (!isWithinGyeonggiBounds(coords)) {
          console.warn(
            `⚠️ 지오코딩 결과가 경기도 범위를 벗어남 [${name}] "${address}" → (${coords.lng}, ${coords.lat}) — 잘못된 매칭으로 보고 건너뜀`
          );
          return null;
        }
        return coords;
      } catch (err) {
        if (attempt < GEOCODE_MAX_ATTEMPTS) {
          const backoffMs = GEOCODE_PACING_MS * 2 ** attempt;
          console.warn(
            `⚠️ 지오코딩 일시 실패 [${name}] "${address}" (시도 ${attempt}/${GEOCODE_MAX_ATTEMPTS}): ${err.message} — ${backoffMs}ms 후 재시도`
          );
          await sleep(backoffMs);
        } else {
          console.warn(`⚠️ 지오코딩 최종 실패 [${name}] "${address}": ${err.message}`);
          return null;
        }
      }
    }
    return null;
  }

  async transform({ items }) {
    const rows = [];
    const today = new Date();

    for (const item of items) {
      const name = item.HYDR_NM;
      const address = item.HYDR_ADDR;
      if (!name || !address) continue;

      const period = parseOprPrd(item.OPR_PRD);
      if (!period) {
        console.warn(`⚠️ OPR_PRD 형식을 해석할 수 없어 건너뜀 [${name}] "${item.OPR_PRD}"`);
        continue;
      }
      const { startDate, endDate } = computeSeasonDateRange(period, today);

      const coords = await this.geocodeOrSkip(name, address);
      if (!coords) continue;

      const row = buildEventRow({
        externalId: this.buildExternalId(name, address),
        title: name,
        uiCategory: UI_CATEGORY.OUTDOOR_NATURE,
        startDate,
        endDate,
        lng: coords.lng,
        lat: coords.lat,
        locationPrecision: 'EXACT',
        isFree: true, // Task 8-2 지시서 명시: 바닥분수/물놀이터는 기본 무료로 매핑
        isKidsFriendly: true, // Task 8-2 지시서 명시: 바닥분수/물놀이터는 기본 키즈 친화로 매핑
        facilityType: '야외', // 계절 운영(OPR_PRD)형 실외 수경시설이라는 물리적 특성
        // 실측으로 발견한 버그: venue_name에 street address(HYDR_ADDR)를 넣었더니 테마 칩
        // 키워드 매칭(theme-spots.ts, venue_name 컬럼 ILIKE)이 항상 0건이었다 — 실제 시설명
        // (예: "나혜석거리 분수", "효원공원 바닥분수")에는 있는 "분수" 등의 키워드가 street
        // address 문자열에는 나타나지 않기 때문. 다른 이벤트 어댑터들과 동일하게 venue_name에는
        // 실제 장소/시설명을 넣는다(정확한 주소는 EXACT 정밀도 좌표로 지도에서 이미 확인 가능).
        venueName: name,
        sigunguName: item.SIGUN_NM || null,
      });

      if (row) rows.push(row);
    }

    return rows;
  }
}
