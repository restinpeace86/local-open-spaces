// RURAL_EXPERIENCE_VILLAGE: 전국농어촌체험휴양마을 표준데이터
// (data.go.kr, tn_pubr_public_frhl_exprn_vilage_api)
//
// 실측 확인(2026-08-29): 실제 서비스키로 직접 호출해 응답 필드를 확인했다 —
// city-park-adapter.mjs와 동일한 표준데이터 봉투(header.resultCode/resultMsg,
// body.items.item[]/totalCount)를 쓴다. 전량(1,254건) 조회해 데이터 품질도 확인했다:
// exprnVilageNm(명칭)/rdnmadr 또는 lnmadr(주소)/latitude/longitude 전량 결측 없음,
// homepageUrl은 1,254건 중 106건에만 존재.
//
// 좌표: 실측상 전량 제공되지만(위 확인), 사용자 지시("결측 시 지오코딩 보완")에 따라
// 방어적으로 VWorld 폴백을 추가한다 — gg-kidscafe-adapter.mjs와 동일한 패턴("대부분
// 이미 좌표가 있고 결측 건에만 지오코딩").
//
// 좌표 범위 검증: 전국 단위 소스라(경기도 한정 아님) GYEONGGI_BOUNDS 같은 지역 범위
// 검증은 적용하지 않는다 — national-park-ecotour-adapter.mjs와 동일한 전국 소스 관례.
//
// external_id: 원본에 고유 ID 필드가 없어(실측 확인 — insttCode는 마을이 아니라 관리
// 기관 단위 코드라 마을별로 겹침) gg-kidscafe-adapter.mjs와 동일하게 SHA1(마을명|주소)
// 해시로 결정적 생성한다.
//
// 카테고리: 사용자 지시에 따라 5대 UI 카테고리 중 "체험·클래스"(EXPERIENCE_CLASS)로
// 묶고, category_min은 '체험휴양마을'로 RAW 태깅한다.
//
// is_free: 원본에 요금 필드가 없고, 체험휴양마을은 프로그램별로 유료/무료가 섞여
// 있는 게 실제 성격이라(수확 체험 등은 통상 유료) 추정하지 않고 null로 둔다.
//
// is_kids_friendly 등 4대 뱃지: exprnSe(체험구분)/exprnCn(체험내용) 텍스트에 실제
// 키워드가 있는지로 판별한다(ai-tagging.mjs의 deriveParentalTags 재사용,
// city-park-adapter.mjs와 동일한 관례) — 소스 전체를 임의로 true 고정하지 않는다.
import crypto from 'crypto';
import { BaseCollectorAdapter } from './base-collector-adapter.mjs';
import { buildOpenSpaceRow, UI_CATEGORY } from './lib/schema-mapper.mjs';
import { geocode, hasVworldApiKey } from './lib/vworld-geocoder.mjs';
import { deriveParentalTags } from '../lib/ai-tagging.mjs';

const BASE_URL = 'https://api.data.go.kr/openapi/tn_pubr_public_frhl_exprn_vilage_api';
const PAGE_SIZE = 100;
const SOURCE = 'rural_experience_village';
const GEOCODE_PACING_MS = 250;
const GEOCODE_MAX_ATTEMPTS = 3;

export const RURAL_EXPERIENCE_VILLAGE_CATEGORY_MIN = '체험휴양마을';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveName(item) {
  return item.exprnVilageNm;
}

function resolveAddress(item) {
  return item.rdnmadr || item.lnmadr || '';
}

export class RuralExperienceVillageAdapter extends BaseCollectorAdapter {
  constructor() {
    super({ sourceKey: 'RURAL_EXPERIENCE_VILLAGE', targetTable: 'open_spaces', source: SOURCE });

    this.apiKey = process.env.PUBLIC_DATA_API_KEY;
    if (!this.apiKey) {
      throw new Error('PUBLIC_DATA_API_KEY 환경변수가 설정되지 않았습니다.');
    }
    if (!hasVworldApiKey()) {
      throw new Error(
        'VWORLD_API_KEY 환경변수가 설정되지 않았습니다. 전국농어촌체험휴양마을 API는 대부분 좌표를 제공하지만 결측 건 보정에 지오코딩이 필요합니다.'
      );
    }
  }

  async fetchPage(pageNo) {
    const params = new URLSearchParams({
      serviceKey: this.apiKey,
      pageNo: String(pageNo),
      numOfRows: String(PAGE_SIZE),
      type: 'json',
    });

    const url = `${BASE_URL}?${params.toString()}`;
    const res = await fetch(url);
    const text = await res.text();

    if (!res.ok) {
      throw new Error(`RuralExperienceVillage 호출 실패 (HTTP ${res.status}): ${text.slice(0, 300)}`);
    }

    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`RuralExperienceVillage 응답이 JSON이 아닙니다: ${text.slice(0, 300)}`);
    }

    if (json.header?.resultCode !== '00') {
      throw new Error(`RuralExperienceVillage 에러 응답: ${json.header?.resultCode} ${json.header?.resultMsg}`);
    }

    const items = json.body?.items?.item ?? [];
    return {
      items: Array.isArray(items) ? items : [items],
      totalCount: Number(json.body?.totalCount ?? 0),
    };
  }

  async fetch() {
    const items = [];
    let pageNo = 1;
    let totalCount = Infinity;

    while ((pageNo - 1) * PAGE_SIZE < totalCount) {
      const result = await this.fetchPage(pageNo);
      totalCount = result.totalCount;
      items.push(...result.items);
      pageNo += 1;
    }

    return items;
  }

  // eslint-disable-next-line class-methods-use-this
  buildExternalId(name, address) {
    const hash = crypto.createHash('sha1').update(`${name}|${address}`).digest('hex').slice(0, 16);
    return `RURAL_VILLAGE_${hash}`;
  }

  // [전체 파이프라인 일괄 가동] RAW 레이어 opt-in.
  getRawRows(rawItems) {
    return rawItems
      .map((item) => ({ item, name: resolveName(item), address: resolveAddress(item) }))
      .filter(({ name, address }) => name && address)
      .map(({ item, name, address }) => ({
        sourceId: crypto.createHash('sha1').update(`${name}|${address}`).digest('hex').slice(0, 16),
        payload: item,
      }));
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

  // 원본이 latitude/longitude를 이미 제공하면 그대로 쓰고, 결측일 때만 지오코딩으로
  // 보정한다(실측: 1,254건 전량 제공되지만 방어적으로 유지).
  async resolveCoords(item, name, address) {
    const providedLng = Number(item.longitude);
    const providedLat = Number(item.latitude);
    if (providedLng && providedLat) {
      return { lng: providedLng, lat: providedLat };
    }
    return this.geocodeOrSkip(name, address);
  }

  async transformItem(item) {
    const name = resolveName(item);
    const address = resolveAddress(item);
    if (!name || !address) return null;

    const coords = await this.resolveCoords(item, name, address);
    if (!coords) return null;

    // ai-rule.md 5.1: 원본 응답의 실제 텍스트(체험구분/체험내용)를 근거로만 태깅한다.
    const tags = deriveParentalTags(`${item.exprnSe ?? ''} ${item.exprnCn ?? ''}`);

    return buildOpenSpaceRow({
      externalId: this.buildExternalId(name, address),
      sourceType: 'RURAL_EXPERIENCE_VILLAGE',
      source: SOURCE,
      name,
      uiCategory: UI_CATEGORY.EXPERIENCE_CLASS,
      address,
      lng: coords.lng,
      lat: coords.lat,
      isFree: null,
      infoUrl: item.homepageUrl || null,
      operatingHours: null,
      isKidsFriendly: tags.is_kids_friendly,
      hasParking: tags.has_parking,
      strollerAccessible: tags.stroller_accessible,
      facilityType: tags.facility_type,
      targetAgeGroup: tags.target_age_group,
      rawData: item,
      categoryMin: RURAL_EXPERIENCE_VILLAGE_CATEGORY_MIN,
      categoryMinSource: 'RAW',
    });
  }

  // 지오코딩은 결측 건에 한해서만 순차 호출한다(gg-kidscafe-adapter.mjs와 동일하게
  // Promise.all 동시 호출로 인한 레이트리밋 위험을 피한다).
  async transform(rawItems) {
    const rows = [];
    for (const item of rawItems) {
      const row = await this.transformItem(item);
      if (row) rows.push(row);
    }
    return rows;
  }
}
