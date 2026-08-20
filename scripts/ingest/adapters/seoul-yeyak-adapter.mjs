// SEOUL_YEYAK: 서울시 공공서비스예약 (data.seoul.go.kr, tvYeyakCOllect 통합 엔드포인트)
// 문화행사/시설대관/진료/체육시설/교육 등 예약형 프로그램 전체를 커버함을 실제 호출로 확인함
// (implementation/2026-08-21-seoul-reservation-unified-collect.md 참고).
import { BaseCollectorAdapter } from './base-collector-adapter.mjs';
import { buildEventRow, UI_CATEGORY } from './lib/schema-mapper.mjs';

const BASE_URL = 'http://openapi.seoul.go.kr:8088';
const SERVICE_NAME = 'tvYeyakCOllect';
const PAGE_SIZE = 100;
const OUTLINK_BASE = 'https://yeyak.seoul.go.kr/web/reservation/selectReservView.do';

// 서울시 DIV(분류) → 5대 UI 카테고리. 놀거리 도메인과 무관한 분류(예: 진료)는
// 임의로 끼워 맞추지 않고 null(ETC)로 남긴다 (spec/data/ai-rule.md 4.1).
const DIV_TO_UI_CATEGORY = {
  문화행사: UI_CATEGORY.PERFORMANCE_FESTIVAL,
  체육시설: UI_CATEGORY.KIDS_ACTIVITY,
  교육: UI_CATEGORY.EXPERIENCE_CLASS,
  시설대관: null,
  진료: null,
};

function toDateOnly(dateTimeStr) {
  return dateTimeStr ? dateTimeStr.slice(0, 10) : null;
}

function isActiveStatus(svcStatNm) {
  if (!svcStatNm) return true;
  return !svcStatNm.includes('종료') && !svcStatNm.includes('마감');
}

export class SeoulYeyakAdapter extends BaseCollectorAdapter {
  constructor() {
    super({ sourceKey: 'SEOUL_YEYAK', targetTable: 'events' });

    this.apiKey = process.env.SEOUL_OPEN_DATA_KEY;
    if (!this.apiKey) {
      throw new Error('SEOUL_OPEN_DATA_KEY 환경변수가 설정되지 않았습니다.');
    }
  }

  async fetchPage(startIdx, endIdx) {
    const url = `${BASE_URL}/${this.apiKey}/json/${SERVICE_NAME}/${startIdx}/${endIdx}/`;
    const res = await fetch(url);
    const text = await res.text();

    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`${SERVICE_NAME} 응답이 JSON이 아닙니다: ${text.slice(0, 300)}`);
    }

    const body = json[SERVICE_NAME];
    if (body?.RESULT?.CODE !== 'INFO-000') {
      throw new Error(`${SERVICE_NAME} 오류: ${body?.RESULT?.CODE} ${body?.RESULT?.MESSAGE}`);
    }

    return { items: body.row ?? [], totalCount: body.list_total_count ?? 0 };
  }

  async fetch() {
    const items = [];
    let startIdx = 1;
    let totalCount = Infinity;

    while (startIdx <= totalCount) {
      const endIdx = startIdx + PAGE_SIZE - 1;
      const page = await this.fetchPage(startIdx, endIdx);
      totalCount = page.totalCount;
      items.push(...page.items);
      startIdx += PAGE_SIZE;
    }

    return items;
  }

  // eslint-disable-next-line class-methods-use-this
  transform(rawItems) {
    return rawItems.map((item) => {
      const lng = Number(item.X);
      const lat = Number(item.Y);
      if (!lng || !lat || !item.SVCID || !item.SVCNM || !item.SVCOPNBGNDT || !item.SVCOPNENDDT) {
        return null;
      }

      // SVCID로부터 예약 Outlink URL을 직접 구성한다 (API의 SVCURL 필드에 의존하지 않음 —
      // 응답 포맷이 바뀌어도 이 어댑터가 자체적으로 안정적인 링크를 생성하도록 함).
      const reservationUrl = `${OUTLINK_BASE}?rsv_svc_id=${item.SVCID}`;

      return buildEventRow({
        externalId: `SEOUL_YEYAK_${item.SVCID}`,
        title: item.SVCNM,
        uiCategory: DIV_TO_UI_CATEGORY[item.DIV] ?? null,
        startDate: toDateOnly(item.SVCOPNBGNDT),
        endDate: toDateOnly(item.SVCOPNENDDT),
        lng,
        lat,
        isReservationRequired: true, // SEOUL_YEYAK 소스는 전건 "사전 예약 필수" 뱃지 기본 부여
        reservationUrl,
        reservationStartDate: item.RCPTBGNDT || null,
        reservationEndDate: item.RCPTENDDT || null,
        isFree: item.PAYATNM === '무료',
        thumbnailUrl: item.IMGURL || null,
        isActive: isActiveStatus(item.SVCSTATNM),
      });
    });
  }
}
