// GG_KIDSCAFE: 경기데이터드림(openapi.gg.go.kr) 키즈카페(Kidscafe) + 놀이시설 포함
// 휴게음식점(Resrestrtkidscafe) 통합 수집.
//
// 실측 확인(2026-08-29): 두 API 모두 gg-events-adapter.mjs와 동일한 응답 봉투
// (json[rootKey][0].head에 list_total_count/RESULT, json[rootKey][1].row에 배열)를
// 쓰고, WAF 우회를 위해 동일한 User-Agent가 필요함을 확인했다.
//
// 카테고리 구분(사용자 지시): Kidscafe는 기존 '키즈카페' category_min으로, Resrestrtkidscafe는
// 별도 '놀이방식당' category_min으로 구분한다. 실측 확인 결과 Resrestrtkidscafe는 그
// 이름과 달리 SANITTN_BIZCOND_NM이 '키즈카페'인 업소는 264건 중 356건뿐이고(전체
// 2,654건 중), 나머지는 한식/커피숍/편의점/일식/중국식/호프·통닭 등 매우 다양한 일반
// 음식점 업종이 섞여 있다(실측: 34종 업종 분포 확인) — 즉 이 API의 정체성은 "특정
// 업종"이 아니라 "놀이시설(키즈존)을 갖춘 휴게음식점 전체"이므로, 개별 업종으로 세분화하지
// 않고 소스 전체를 하나의 category_min('놀이방식당')으로 묶는다(제3장 제5조 추측 금지 —
// 업종별로 다시 분류할 근거 있는 필드가 없다).
//
// 운영 상태 필터: 실측 결과 BSN_STATE_NM은 '영업'/'폐업' 2종만 관측됨(Kidscafe 264건 중
// 영업 105/폐업 159, Resrestrtkidscafe 2,654건 중 영업 1,792/폐업 862) — amusement-park-
// adapter.mjs/swimming-pool-adapter.mjs와 동일한 관례로 '영업'만 수집한다.
//
// 좌표: REFINE_WGS84_LOGT/REFINE_WGS84_LAT 필드로 대부분 이미 좌표가 제공됨을 실측
// 확인했다(Kidscafe 264건 중 258건, Resrestrtkidscafe 2,654건 중 2,644건 — 결측은
// 각각 6/10건뿐). gg-events-adapter.mjs(좌표 필드 자체가 없어 전량 지오코딩)와 달리, 이미
// 제공된 좌표를 그대로 쓰고 결측 건에만 VWorld 지오코딩으로 보정한다(불필요한 API 호출
// 최소화).
//
// is_free: 원본에 요금 필드가 없고 전량 민간 상업시설(유원시설업/휴게음식점업 등록
// 업체)이라 amusement-park-adapter.mjs와 동일하게 추정하지 않고 null로 둔다.
//
// is_kids_friendly: 두 소스 모두 "아이 놀이시설을 갖춘 곳"이 정의상 소스 전체의 성격이라
// (Kidscafe: 업종 자체가 키즈카페, Resrestrtkidscafe: 놀이시설 보유 조건으로 선별된
// 업소만 존재) 개별 텍스트 근거 없이 소스 레벨에서 true로 고정한다(playground-
// adapter.mjs의 동일 논리 준용).
//
// facility_type: 두 소스 모두 상가 건물 내부에 위치한 상업시설(주소 표본에 "지상3층
// 303호", "11층 1104호" 등 건물 내 호실 표기가 실측으로 다수 확인됨) — 물리적 특성 자체가
// 명백한 실내 시설이라 '실내'로 고정한다.
//
// external_id: 두 API 모두 원본에 고유 ID 필드가 없어(실측 확인) gg-events-adapter.mjs와
// 동일하게 SHA1(시설명|주소) 해시 기반으로 결정적 생성한다.
import crypto from 'crypto';
import { BaseCollectorAdapter } from './base-collector-adapter.mjs';
import { buildOpenSpaceRow, UI_CATEGORY } from './lib/schema-mapper.mjs';
import { geocode, hasVworldApiKey } from './lib/vworld-geocoder.mjs';

const KIDSCAFE_BASE_URL = 'https://openapi.gg.go.kr/Kidscafe';
const RESRESTRT_BASE_URL = 'https://openapi.gg.go.kr/Resrestrtkidscafe';
const PAGE_SIZE = 100;
const SUCCESS_RESULT_CODE = 'INFO-000';
const ACTIVE_STATUS_NAME = '영업';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const GEOCODE_PACING_MS = 250;
const GEOCODE_MAX_ATTEMPTS = 3;
const SOURCE = 'gg_public';

export const KIDS_CAFE_CATEGORY_MIN = '키즈카페';
export const PLAY_RESTAURANT_CATEGORY_MIN = '놀이방식당';

// gg-events-adapter.mjs와 동일한 근거로 경기도 범위를 벗어난 지오코딩 결과는 잘못된
// 매칭으로 보고 건너뛴다(REFINE_WGS84 좌표가 이미 제공된 행에는 이 검증을 적용하지
// 않는다 — 원본이 직접 제공한 좌표까지 임의로 의심하지 않는다).
const GYEONGGI_BOUNDS = { minLng: 126.0, maxLng: 128.0, minLat: 36.7, maxLat: 38.5 };

function isWithinGyeonggiBounds({ lng, lat }) {
  return (
    lng >= GYEONGGI_BOUNDS.minLng &&
    lng <= GYEONGGI_BOUNDS.maxLng &&
    lat >= GYEONGGI_BOUNDS.minLat &&
    lat <= GYEONGGI_BOUNDS.maxLat
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveName(item) {
  return item.BIZPLC_NM;
}

function resolveAddress(item) {
  return item.REFINE_ROADNM_ADDR || item.REFINE_LOTNO_ADDR || '';
}

export class GgKidscafeAdapter extends BaseCollectorAdapter {
  constructor() {
    super({ sourceKey: 'GG_KIDSCAFE', targetTable: 'open_spaces', source: SOURCE });

    this.apiKey = process.env.GG_DATA_API_KEY;
    if (!this.apiKey) {
      throw new Error('GG_DATA_API_KEY 환경변수가 설정되지 않았습니다.');
    }
    if (!hasVworldApiKey()) {
      throw new Error(
        'VWORLD_API_KEY 환경변수가 설정되지 않았습니다. 경기데이터드림 Kidscafe/Resrestrtkidscafe API는 대부분 좌표를 제공하지만 일부 결측 건 보정에 지오코딩이 필요합니다.'
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
      throw new Error(`GgKidscafe(${rootKey}) 호출 실패 (HTTP ${res.status}): ${text.slice(0, 300)}`);
    }

    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`GgKidscafe(${rootKey}) 응답이 JSON이 아닙니다: ${text.slice(0, 300)}`);
    }

    const root = json[rootKey];
    if (!root) {
      throw new Error(`GgKidscafe(${rootKey}) 응답에 루트 키가 없습니다: ${text.slice(0, 300)}`);
    }

    const head = root[0]?.head ?? [];
    const totalCount = head.find((h) => 'list_total_count' in h)?.list_total_count ?? 0;
    const result = head.find((h) => 'RESULT' in h)?.RESULT;

    if (result?.CODE !== SUCCESS_RESULT_CODE) {
      throw new Error(`GgKidscafe(${rootKey}) 에러 응답: ${result?.CODE} ${result?.MESSAGE}`);
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
    const [kidscafeItems, resrestrtItems] = await Promise.all([
      this.fetchAll(KIDSCAFE_BASE_URL, 'Kidscafe'),
      this.fetchAll(RESRESTRT_BASE_URL, 'Resrestrtkidscafe'),
    ]);
    return { kidscafeItems, resrestrtItems };
  }

  // eslint-disable-next-line class-methods-use-this
  buildExternalId(name, address) {
    const hash = crypto.createHash('sha1').update(`${name}|${address}`).digest('hex').slice(0, 16);
    return `GG_KIDSCAFE_${hash}`;
  }

  // [전체 파이프라인 일괄 가동] RAW 레이어 opt-in.
  // eslint-disable-next-line class-methods-use-this
  buildRawRows(items) {
    return items
      .map((item) => ({ item, name: resolveName(item), address: resolveAddress(item) }))
      .filter(({ name, address }) => name && address)
      .map(({ item, name, address }) => ({
        sourceId: crypto.createHash('sha1').update(`${name}|${address}`).digest('hex').slice(0, 16),
        payload: item,
      }));
  }

  getRawRows({ kidscafeItems, resrestrtItems }) {
    return [...this.buildRawRows(kidscafeItems), ...this.buildRawRows(resrestrtItems)];
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

  // 원본이 REFINE_WGS84_LOGT/LAT를 이미 제공하면 그대로 쓰고, 결측일 때만 지오코딩으로
  // 보정한다(실측: 대부분 이미 좌표가 채워져 있어 불필요한 VWorld 호출을 최소화한다).
  async resolveCoords(item, name, address) {
    const providedLng = Number(item.REFINE_WGS84_LOGT);
    const providedLat = Number(item.REFINE_WGS84_LAT);
    if (providedLng && providedLat) {
      return { lng: providedLng, lat: providedLat };
    }
    return this.geocodeOrSkip(name, address);
  }

  async transformItem(item, categoryMin) {
    if (item.BSN_STATE_NM !== ACTIVE_STATUS_NAME) return null;

    const name = resolveName(item);
    const address = resolveAddress(item);
    if (!name || !address) return null;

    const coords = await this.resolveCoords(item, name, address);
    if (!coords) return null;

    return buildOpenSpaceRow({
      externalId: this.buildExternalId(name, address),
      sourceType: 'GG_KIDSCAFE',
      source: SOURCE,
      name,
      uiCategory: UI_CATEGORY.KIDS_ACTIVITY,
      address,
      lng: coords.lng,
      lat: coords.lat,
      isFree: null,
      isKidsFriendly: true,
      facilityType: '실내',
      rawData: item,
      categoryMin,
      categoryMinSource: 'RAW',
    });
  }

  // 지오코딩은 결측 건에 한해서만 순차 호출한다(NationalParkEcotourAdapter/GgEventsAdapter와
  // 동일하게 Promise.all 동시 호출로 인한 레이트리밋 위험을 피한다).
  async transform({ kidscafeItems, resrestrtItems }) {
    const rows = [];

    for (const item of kidscafeItems) {
      const row = await this.transformItem(item, KIDS_CAFE_CATEGORY_MIN);
      if (row) rows.push(row);
    }

    for (const item of resrestrtItems) {
      const row = await this.transformItem(item, PLAY_RESTAURANT_CATEGORY_MIN);
      if (row) rows.push(row);
    }

    return rows;
  }
}
