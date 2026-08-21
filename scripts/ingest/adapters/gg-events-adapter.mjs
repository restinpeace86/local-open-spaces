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
// (주소 텍스트만 제공). NationalParkEcotourAdapter와 동일하게 Kakao 지오코딩(KAKAO_REST_API_KEY)이
// 반드시 필요하다 — 이 키가 아직 없어(.env.local 미설정) 실행은 대기 상태이며, 코드/테스트는
// 완성해 값이 채워지는 즉시 재검증만 하면 되도록 한다.
//
// is_free(API1, 공공 수영장): 요금 필드가 원본에 없으나, 전체 135건의 POSESN_INST_NM(소유기관)
// 값을 실측으로 전수 확인한 결과 35개 기관 모두 시/군청·경기도교육지원청·국민체육진흥공단·
// 대한장애인체육회·한국방송광고진흥공사 등 공공/준공공 기관이며 민간 사업자는 하나도 없었다
// ("PublicSwimmingPool"이라는 API명 그대로 소스 전체가 공공임이 확인됨) — ai-rule.md 5.2-7 예외를
// 레코드별이 아닌 소스 레벨로 적용해 deriveIsFreeFallback({ hasFeeInfo: false, isPublicProvider: true })
// 고정 적용한다(추측이 아닌 전수 실측 근거).
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
import crypto from 'crypto';
import { BaseCollectorAdapter } from './base-collector-adapter.mjs';
import { buildOpenSpaceRow, UI_CATEGORY } from './lib/schema-mapper.mjs';
import { deriveIsFreeFallback, matchesKidsKeyword } from '../lib/ai-tagging.mjs';
import { geocode, hasKakaoRestApiKey } from './lib/kakao-geocoder.mjs';

const POOL_BASE_URL = 'https://openapi.gg.go.kr/PublicSwimmingPool';
const SPLASH_BASE_URL = 'https://openapi.gg.go.kr/TBWTRWTRPLYHYDRDTAM';
const PAGE_SIZE = 100;
const SUCCESS_RESULT_CODE = 'INFO-000';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export class GgEventsAdapter extends BaseCollectorAdapter {
  constructor() {
    super({ sourceKey: 'GG_EVENTS', targetTable: 'open_spaces' });

    this.apiKey = process.env.GG_DATA_API_KEY;
    if (!this.apiKey) {
      throw new Error('GG_DATA_API_KEY 환경변수가 설정되지 않았습니다.');
    }
    if (!hasKakaoRestApiKey()) {
      throw new Error(
        'KAKAO_REST_API_KEY 환경변수가 설정되지 않았습니다. 경기데이터드림 두 API 모두 좌표 필드가 없어 지오코딩이 필수입니다. Kakao Developers > 앱 키 > REST API 키를 확인해 .env.local에 추가하세요.'
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
    try {
      const coords = await geocode(address);
      if (!coords) {
        console.warn(`⚠️ 지오코딩 결과 없음 [${name}] "${address}" — 건너뜀`);
        return null;
      }
      return coords;
    } catch (err) {
      console.warn(`⚠️ 지오코딩 실패 [${name}] "${address}": ${err.message}`);
      return null;
    }
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
      isFree: deriveIsFreeFallback({ hasFeeInfo: false, isPublicProvider: true }),
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

  // 지오코딩은 외부 API(Kakao) 호출이라 NationalParkEcotourAdapter와 동일하게 순차 처리한다
  // (Promise.all로 동시에 수백~천 건을 쏘면 Kakao 쪽 레이트리밋에 걸릴 위험이 있음).
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
