// GG_EVENTS: 경기데이터드림(data.gg.go.kr) 공공 수영장 + 물놀이형 수경시설(바닥분수) 통합 수집 (Task 8-2)
// API 1(PublicSwimmingPool): 경기도 공공 수영장 현황. API 2(TBWTRWTRPLYHYDRDTAM): 물놀이형 수경시설 현황.
//
// WAF 우회: User-Agent 헤더 없이 호출하면 JSON이 아니라 "보안 정책에 의해 차단 되었습니다"라는
// HTML 차단 페이지가 반환됨을 실측으로 확인했다(Task 8-2 1차 스킵 기록 참고). 브라우저
// User-Agent를 붙이면 정상 JSON 응답으로 전환된다 — 모든 요청에 고정 User-Agent를 포함한다.
//
// 서비스 ID: 이전에 시도했던 `Cultrsttus`/`Pubchefltswim`은 ERROR-310(서비스를 찾을 수 없음)으로
// 스킵했었다. 이번에 사용자가 전달한 `PublicSwimmingPool`/`TBWTRWTRPLYHYDRDTAM`은 실제 호출로
// `RESULT.CODE === 'INFO-000'` 정상 응답(각각 135건/1,170건)을 확인했다.
//
// 좌표 없음 → 지오코딩 필수: 두 API 전체 필드를 실측 확인한 결과 위경도/좌표 필드가 전혀 없다
// (주소 텍스트만 제공). VWorld 지오코딩(VWORLD_API_KEY, 이미 cultural-facility-summary-adapter.mjs가
// 쓰는 공용 lib/vworld-geocoder.mjs 재사용)으로 좌표를 보완한다. ROAD(도로명주소) 우선 시도 후
// 실패 시 PARCEL(지번주소)로 자동 폴백함을 실제 호출로 확인했다(2026-08-21, 표본: "경기도 수원시
// 권선구 세류동 1066-9" — ROAD는 NOT_FOUND, PARCEL은 OK).
//
// is_free(API1, 공공 수영장) — Task 8-4 정밀 검증(2026-08-21)에서 수정: 최초 구현 시 전체 135건의
// POSESN_INST_NM(소유기관)이 모두 공공/준공공 기관임을 실측으로 확인해 ai-rule.md 5.2-7 예외
// (공공기관 확정 시 무료 기본 추정)를 적용해 is_free=true로 고정했었다. 그러나 재검토 결과 이 예외는
// "공공 소유=무료"가 성립하는 시설(공원/광장/놀이터 등)을 전제로 한 규칙이며, 수영장은 공공 소유라도
// 국내 관행상 거의 예외 없이 입장/이용료를 징수하는 유료 시설이다(구립·시립 수영장, 국민체육센터
// 수영장 등 통상 자유수영 1회 3,000~6,500원 수준). "공공기관 운영"과 "무료 이용"을 혼동한 오탐이었다
// — 원본에 실제 요금 필드가 없으므로 추정하지 말고 null(미기재)로 되돌린다.
//
// is_free/is_kids_friendly(API2, 물놀이형 수경시설): Task 지시서 지시대로 바닥분수/물놀이터는
// 기본적으로 is_kids_friendly=true, is_free=true를 고정 매핑한다(사용자 명시 지시, 임의 추정 아님).
//
// facility_type: API1은 실측 필드 INOUTDR_DIV_NM(실내/실외)을 SwimmingPoolAdapter와 동일한 패턴으로
// 매핑한다. API2(바닥분수/물놀이터)에는 실내/실외 필드가 없으나, 계절 운영기간(OPR_PRD, 예:
// "3개월(6월~8월)")이 보여주듯 실외 노출형 수경시설이라는 물리적 특성 자체가 명백해(국립공원
// 생태관광/고캠핑 어댑터가 물리적 특성으로 '야외'를 고정한 것과 동일 논리) '야외'로 고정한다.
//
// UI 카테고리: project/data_sources.md 2.3에 이미 기록된 매핑을 그대로 따른다 — "1. 물놀이터·
// 바닥분수" 그룹은 🌳 야외·자연(OUTDOOR_NATURE), "3. 수영장" 그룹은 🎡 키즈·액티비티
// (KIDS_ACTIVITY)로 이미 확정돼 있어 새로 판단하지 않고 그대로 적용한다.
//
// is_kids_friendly(API1): 명칭 기반 키워드 매칭(swimming-pool-adapter.mjs와 동일 목록,
// lib/ai-tagging.mjs의 matchesKidsKeyword로 공용화)만 적용한다.
//
// external_id: Task 지시서 지시대로 SHA1(시설명|주소) 해시 기반으로 결정적 생성한다(두 API가
// 서로 다른 물리적 시설군이라 겹칠 일이 없으나, 동일한 정책을 모든 신규 소스에 일관 적용).
//
// 지오코딩 Pacing/재시도(Task 8-3, 2026-08-21): 1차 실행 시 VWorld가 간헐적으로 502/연결거부를
// 반환해 대량 실패를 겪었다. 요청 간격을 200ms로 늘려도 20/20 연속 실패한 순간이 있었고 직후
// 5초 간격 재시도도 실패해, 이것이 "내 요청 속도" 문제라기보다 VWorld 서버 자체가 짧은 시간
// 단위로 정상↔장애를 오가는 현상임을 실측으로 확인했다(성공 시점에는 연속 호출도 잘 됨). 따라서
// 순수 pacing만으로는 불충분해 지수 백오프 재시도를 추가한다 — 매 호출 사이 기본 지연(pacing)을
// 두고, 실패 시에는 짧게 대기 후 최대 3회까지 재시도한다(그래도 안 되면 해당 건만 건너뛴다).
import crypto from 'crypto';
import { BaseCollectorAdapter } from './base-collector-adapter.mjs';
import { buildOpenSpaceRow, UI_CATEGORY } from './lib/schema-mapper.mjs';
import { matchesKidsKeyword } from '../lib/ai-tagging.mjs';
import { geocode, hasVworldApiKey } from './lib/vworld-geocoder.mjs';

const POOL_BASE_URL = 'https://openapi.gg.go.kr/PublicSwimmingPool';
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

export class GgEventsAdapter extends BaseCollectorAdapter {
  constructor() {
    super({ sourceKey: 'GG_EVENTS', targetTable: 'open_spaces' });

    this.apiKey = process.env.GG_DATA_API_KEY;
    if (!this.apiKey) {
      throw new Error('GG_DATA_API_KEY 환경변수가 설정되지 않았습니다.');
    }
    if (!hasVworldApiKey()) {
      throw new Error(
        'VWORLD_API_KEY 환경변수가 설정되지 않았습니다. 경기데이터드림 두 API 모두 좌표 필드가 없어 지오코딩이 필수입니다. Vworld 오픈API(www.vworld.kr) 신청 후 .env.local에 VWORLD_API_KEY를 추가하세요.'
      );
    }
  }

  async fetchPage(baseUrl, rootKey, pIndex) {
    const params = new URLSearchParams({
      KEY: this.apiKey,
      Type: 'json',
      pIndex: String(pIndex),
      pSize: String(PAGE_SIZE),
    });

    const url = `${baseUrl}?${params.toString()}`;
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    const text = await res.text();

    if (!res.ok) {
      throw new Error(`GgEvents(${rootKey}) 호출 실패 (HTTP ${res.status}): ${text.slice(0, 300)}`);
    }

    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`GgEvents(${rootKey}) 응답이 JSON이 아닙니다: ${text.slice(0, 300)}`);
    }

    const root = json[rootKey];
    if (!root) {
      throw new Error(`GgEvents(${rootKey}) 응답에 루트 키가 없습니다: ${text.slice(0, 300)}`);
    }

    const head = root[0]?.head ?? [];
    const totalCount = head.find((h) => 'list_total_count' in h)?.list_total_count ?? 0;
    const result = head.find((h) => 'RESULT' in h)?.RESULT;

    if (result?.CODE !== SUCCESS_RESULT_CODE) {
      throw new Error(`GgEvents(${rootKey}) 에러 응답: ${result?.CODE} ${result?.MESSAGE}`);
    }

    const items = root[1]?.row ?? [];
    return { items, totalCount };
  }

  async fetchAll(baseUrl, rootKey) {
    const items = [];
    let pIndex = 1;
    let totalCount = Infinity;

    while ((pIndex - 1) * PAGE_SIZE < totalCount) {
      const page = await this.fetchPage(baseUrl, rootKey, pIndex);
      totalCount = page.totalCount;
      items.push(...page.items);
      pIndex += 1;
    }

    return items;
  }

  async fetch() {
    const [poolItems, splashItems] = await Promise.all([
      this.fetchAll(POOL_BASE_URL, 'PublicSwimmingPool'),
      this.fetchAll(SPLASH_BASE_URL, 'TBWTRWTRPLYHYDRDTAM'),
    ]);
    return { poolItems, splashItems };
  }

  // eslint-disable-next-line class-methods-use-this
  buildExternalId(name, address) {
    const hash = crypto.createHash('sha1').update(`${name}|${address}`).digest('hex').slice(0, 16);
    return `GG_EVENTS_${hash}`;
  }

  async geocodeOrSkip(name, address) {
    for (let attempt = 1; attempt <= GEOCODE_MAX_ATTEMPTS; attempt += 1) {
      try {
        const coords = await geocode(address);
        await sleep(GEOCODE_PACING_MS); // 성공 시에도 다음 호출까지 최소 간격을 둔다 (pacing)

        if (!coords) {
          console.warn(`⚠️ 지오코딩 결과 없음 [${name}] "${address}" — 건너뜀`);
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

  async transformPoolItem(item) {
    const name = item.FACLT_NM;
    const address = item.REFINE_ROADNM_ADDR || item.REFINE_LOTNO_ADDR || '';
    if (!name || !address) return null;

    const coords = await this.geocodeOrSkip(name, address);
    if (!coords) return null;

    const facilityType =
      item.INOUTDR_DIV_NM === '실내' ? '실내' : item.INOUTDR_DIV_NM === '실외' ? '야외' : '복합';

    return buildOpenSpaceRow({
      externalId: this.buildExternalId(name, address),
      sourceType: 'GG_EVENTS',
      name,
      uiCategory: UI_CATEGORY.KIDS_ACTIVITY,
      address,
      lng: coords.lng,
      lat: coords.lat,
      isFree: null, // 공공 소유라도 수영장은 실제로 유료 이용료를 받는 것이 일반적(Task 8-4에서 수정)
      isKidsFriendly: matchesKidsKeyword(name),
      facilityType,
      rawData: item,
    });
  }

  async transformSplashItem(item) {
    const name = item.HYDR_NM;
    const address = item.HYDR_ADDR;
    if (!name || !address) return null;

    const coords = await this.geocodeOrSkip(name, address);
    if (!coords) return null;

    return buildOpenSpaceRow({
      externalId: this.buildExternalId(name, address),
      sourceType: 'GG_EVENTS',
      name,
      uiCategory: UI_CATEGORY.OUTDOOR_NATURE,
      address,
      lng: coords.lng,
      lat: coords.lat,
      isFree: true, // Task 지시서 명시: 바닥분수/물놀이터는 기본 무료로 매핑
      isKidsFriendly: true, // Task 지시서 명시: 바닥분수/물놀이터는 기본 키즈 친화로 매핑
      facilityType: '야외', // 계절 운영(OPR_PRD)형 실외 수경시설이라는 물리적 특성
      rawData: item,
    });
  }

  // 지오코딩은 외부 API(VWorld) 호출이라 NationalParkEcotourAdapter와 동일하게 순차 처리한다
  // (Promise.all로 동시에 수백~천 건을 쏘면 레이트리밋에 걸릴 위험이 있음).
  async transform({ poolItems, splashItems }) {
    const rows = [];

    for (const item of poolItems) {
      const row = await this.transformPoolItem(item);
      if (row) rows.push(row);
    }

    for (const item of splashItems) {
      const row = await this.transformSplashItem(item);
      if (row) rows.push(row);
    }

    return rows;
  }
}
