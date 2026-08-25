// TourAPI 4.0 계열(B551011) 서비스 공통 베이스 — areaBasedList2 오퍼레이션으로
// 지역기반 관광정보를 contentTypeId별로 페이지네이션 수집해 open_spaces에 매핑한다.
// KorPetTourService2(반려동물 동반여행), KorWithService2(무장애 여행), KorService2(국문관광정보)
// 등 동일한 응답 스키마를 쓰는 서비스가 이 베이스를 상속한다 (제4조 기존 구조 우선 — 중복 방지).
//
// 이 서비스들은 모두 같은 `contentid` 네임스페이스를 공유하는 큐레이션 서브셋 관계다
// (예: KorService2의 "전주드림랜드" contentid=2790515가 KorWithService2에도 동일 ID로 존재함을
// 실제 호출로 확인함, 2026-08-21). 사용자 확인(2026-08-21, "contentid 기준으로 통합(중복제거)
// 권장")에 따라 external_id/source_type을 소스별로 분리하지 않고 contentid 기준 단일 키로
// 통합해 upsert(onConflict: external_id)가 자연스럽게 중복을 제거하도록 한다.
import { BaseCollectorAdapter } from '../base-collector-adapter.mjs';
import { buildOpenSpaceRow } from './schema-mapper.mjs';
import { createAdminClient } from '../../lib/supabase-admin.mjs';
import { deriveIsFreeFromFeeText } from '../../lib/ai-tagging.mjs';

const PAGE_SIZE = 100;
export const TOUR_API_V4_SOURCE_TYPE = 'KOR_TOUR_API_V4';
const SOURCE = 'tourapi_4.0';

// Task 1: contentTypeId=14(문화시설)/28(레포츠)만 detailIntro2 요금 필드명이 다르다
// (실제 호출로 확인함, 2026-08-21: 14→usefee, 28→usefeeleports). 다른 contentTypeId는
// 이 어댑터의 수집 대상(12/14/28)에 usefee 성격의 필드가 없거나 대상 밖이라 다루지 않는다.
const FEE_FIELD_BY_CONTENT_TYPE = { 14: 'usefee', 28: 'usefeeleports' };

export class TourApiV4AreaBasedAdapter extends BaseCollectorAdapter {
  constructor({
    sourceKey,
    serviceName,
    contentTypeToCategory,
    detailContentTypeIds = [],
    detailCallBudget = 900,
  }) {
    super({ sourceKey, targetTable: 'open_spaces' });

    this.apiKey = process.env.PUBLIC_DATA_API_KEY;
    if (!this.apiKey) {
      throw new Error('PUBLIC_DATA_API_KEY 환경변수가 설정되지 않았습니다.');
    }

    this.serviceName = serviceName;
    this.contentTypeToCategory = contentTypeToCategory;
    this.baseUrl = `https://apis.data.go.kr/B551011/${serviceName}/areaBasedList2`;
    this.detailUrl = `https://apis.data.go.kr/B551011/${serviceName}/detailIntro2`;
    // 전체 목록 수집(N+1 방지) 시에는 빈 배열 기본값으로 detailIntro2를 호출하지 않는다.
    // CLI에서 --with-detail 지정 시에만 [14, 28]을 넘겨 선별적으로 활성화한다 (Task 1).
    this.detailContentTypeIds = detailContentTypeIds;
    this.detailCallBudget = detailCallBudget;
  }

  async fetchPage(contentTypeId, pageNo) {
    const params = new URLSearchParams({
      MobileOS: 'ETC',
      MobileApp: 'local-open-spaces',
      _type: 'json',
      arrange: 'C',
      contentTypeId: String(contentTypeId),
      numOfRows: String(PAGE_SIZE),
      pageNo: String(pageNo),
    });

    const url = `${this.baseUrl}?serviceKey=${encodeURIComponent(this.apiKey)}&${params.toString()}`;
    const res = await fetch(url);
    const text = await res.text();

    if (!res.ok) {
      throw new Error(`${this.serviceName} 호출 실패 (HTTP ${res.status}): ${text.slice(0, 300)}`);
    }

    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`${this.serviceName} 응답이 JSON이 아닙니다: ${text.slice(0, 300)}`);
    }

    const header = json.response?.header;
    if (header?.resultCode !== '0000') {
      throw new Error(`${this.serviceName} 에러 응답: ${header?.resultCode} ${header?.resultMsg}`);
    }

    const body = json.response?.body;
    const items = body?.items?.item ?? [];
    return {
      items: Array.isArray(items) ? items : [items],
      totalCount: body?.totalCount ?? 0,
    };
  }

  async fetchContentType(contentTypeId) {
    const items = [];
    let pageNo = 1;
    let totalCount = Infinity;

    while ((pageNo - 1) * PAGE_SIZE < totalCount) {
      const result = await this.fetchPage(contentTypeId, pageNo);
      totalCount = result.totalCount;
      items.push(...result.items);
      pageNo += 1;
    }

    return items;
  }

  async fetch() {
    const contentTypeIds = Object.keys(this.contentTypeToCategory).map(Number);
    const items = [];

    for (const contentTypeId of contentTypeIds) {
      const typeItems = await this.fetchContentType(contentTypeId);
      items.push(...typeItems);
    }

    return items;
  }

  // [전체 파이프라인 일괄 가동] RAW 레이어 opt-in. contentid가 external_id 구성에도 쓰이는
  // TourAPI 4.0 공통 콘텐츠 ID다. KorTour/KorWithTour/KorPetTour가 이 베이스를 공유하므로
  // 한 곳만 고치면 세 어댑터 모두에 적용된다(제5장 제4조 기존 구조 우선).
  // eslint-disable-next-line class-methods-use-this
  getRawRows(rawItems) {
    return rawItems.filter((item) => item.contentid).map((item) => ({ sourceId: String(item.contentid), payload: item }));
  }

  async fetchDetailIntro(contentId, contentTypeId) {
    const params = new URLSearchParams({
      MobileOS: 'ETC',
      MobileApp: 'local-open-spaces',
      _type: 'json',
      contentId: String(contentId),
      contentTypeId: String(contentTypeId),
    });

    const url = `${this.detailUrl}?serviceKey=${encodeURIComponent(this.apiKey)}&${params.toString()}`;
    const res = await fetch(url);
    const text = await res.text();

    if (!res.ok) {
      throw new Error(`${this.serviceName} detailIntro2 호출 실패 (HTTP ${res.status}): ${text.slice(0, 300)}`);
    }

    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`${this.serviceName} detailIntro2 응답이 JSON이 아닙니다: ${text.slice(0, 300)}`);
    }

    const header = json.response?.header;
    if (header?.resultCode !== '0000') {
      throw new Error(`${this.serviceName} detailIntro2 에러 응답: ${header?.resultCode} ${header?.resultMsg}`);
    }

    const item = json.response?.body?.items?.item;
    return Array.isArray(item) ? item[0] : item;
  }

  // DB에 이미 존재하지만 is_free가 아직 null인 contentid만 골라 상세 호출 대상으로 삼는다
  // (신규 contentid만 상세 호출 — 캐싱/배치 전략, Task 1). 신규 수집분(DB 미존재)은 이번 회차엔
  // null로 두고 다음 회차(정기 목록 수집→DB 반영 후 이 어댑터 재실행)에 자동으로 대상이 된다.
  async fetchPendingIsFreeExternalIds(client, targetCategories) {
    const { data, error } = await client
      .from('open_spaces')
      .select('external_id')
      .eq('source_type', TOUR_API_V4_SOURCE_TYPE)
      .in('category', targetCategories)
      .is('is_free', null)
      .limit(this.detailCallBudget);

    if (error) throw new Error(`is_free 보완 대상 조회 실패: ${error.message}`);
    return new Set((data ?? []).map((row) => row.external_id));
  }

  async transform(rawItems) {
    const isFreeByContentId = new Map();

    if (this.detailContentTypeIds.length > 0) {
      const targetCategories = this.detailContentTypeIds
        .map((contentTypeId) => this.contentTypeToCategory[contentTypeId])
        .filter(Boolean);

      const client = createAdminClient();
      const pendingExternalIds = await this.fetchPendingIsFreeExternalIds(client, targetCategories);

      const candidates = rawItems.filter(
        (item) =>
          this.detailContentTypeIds.includes(Number(item.contenttypeid)) &&
          pendingExternalIds.has(`${TOUR_API_V4_SOURCE_TYPE}_${item.contentid}`)
      );

      console.log(
        `  🔍 [${this.sourceKey}] detailIntro2 보완 대상 ${candidates.length}건 (예산 ${this.detailCallBudget}건)`
      );

      for (const item of candidates) {
        const contentTypeId = Number(item.contenttypeid);
        const feeField = FEE_FIELD_BY_CONTENT_TYPE[contentTypeId];
        try {
          const detail = await this.fetchDetailIntro(item.contentid, contentTypeId);
          const isFree = feeField ? deriveIsFreeFromFeeText(detail?.[feeField]) : null;
          isFreeByContentId.set(item.contentid, { isFree, detail });
        } catch (err) {
          console.warn(`  ⚠️ detailIntro2 호출 실패 [${item.contentid}]: ${err.message}`);
        }
      }
    }

    return rawItems
      .map((item) => {
        const lng = Number(item.mapx);
        const lat = Number(item.mapy);
        if (!item.contentid || !item.title || !lng || !lat) return null;

        const uiCategory = this.contentTypeToCategory[Number(item.contenttypeid)];
        const enrichment = isFreeByContentId.get(item.contentid);

        return buildOpenSpaceRow({
          externalId: `${TOUR_API_V4_SOURCE_TYPE}_${item.contentid}`,
          sourceType: TOUR_API_V4_SOURCE_TYPE,
          source: SOURCE,
          name: item.title,
          uiCategory,
          address: item.addr1 || '',
          lng,
          lat,
          // 관광지/문화시설/레포츠는 공공/민간 운영이 혼재하고 areaBasedList2 응답에
          // 운영주체를 판별할 필드가 없어 ai-rule.md 5.2-7 Fallback 대상이 아님 — null 유지(추측 금지).
          // detailIntro2로 실측 요금 텍스트를 확보한 경우(enrichment)에만 그 파싱값을 사용한다.
          isFree: enrichment ? enrichment.isFree : null,
          infoUrl: null,
          rawData: enrichment?.detail ? { ...item, detailIntro: enrichment.detail } : item,
        });
      })
      .filter(Boolean);
  }
}
