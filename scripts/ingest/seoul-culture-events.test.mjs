// [가격 정보 파싱 고도화](2026-09-11 사용자 지시, implementation/todo.md 개선사항7-1)
// 단위 테스트 — 이 파일(레거시 구조, BaseCollectorAdapter 미사용)은 이전엔 테스트가
// 없었으나, 새로 추가한 price_text/source_url 추출 로직만 검증한다.
import { describe, expect, it } from 'vitest';
import { mapToEventRow } from './seoul-culture-events.mjs';

// 실측 표본 그대로(2026-09-11 프로덕션 raw_data 직접 조회).
const BASE_ITEM = {
  LAT: '37.4966251468796',
  LOT: '126.890315032666',
  TITLE: '2022 브런치콘서트 [이달의 공연] 7월, 고전의 맛',
  GUNAME: '구로구',
  IS_FREE: '유료',
  PROGRAM: '',
  USE_FEE: '전석 10,000원 / 단체10인 이상 할인 20% (전화예매필수)',
  CODENAME: '클래식', // SEOUL_CODENAME_MAP에 직접 매핑돼 있어 AI 호출 없이 분류됨.
  END_DATE: '2022-07-26 00:00:00.0',
  ETC_DESC: '',
  ORG_LINK: 'https://www.guroartsvalley.or.kr/user/performance/performanceView.do?performanceSeq=3570',
  HMPG_ADDR: 'https://culture.seoul.go.kr/culture/culture/cultureEvent/view.do?cultcode=138465',
  PLACE: '구로아트밸리 예술극장',
  STRTDATE: '2022-07-26 00:00:00.0',
};

describe('seoul-culture-events mapToEventRow (가격 정보 파싱 고도화)', () => {
  it('USE_FEE를 그대로 price_text로 쓴다', async () => {
    const row = await mapToEventRow(BASE_ITEM, {});
    expect(row.price_text).toBe('전석 10,000원 / 단체10인 이상 할인 20% (전화예매필수)');
  });

  it('USE_FEE가 없으면 price_text는 null이다', async () => {
    const row = await mapToEventRow({ ...BASE_ITEM, USE_FEE: '' }, {});
    expect(row.price_text).toBeNull();
  });

  it('ORG_LINK를 우선해 source_url로 쓴다', async () => {
    const row = await mapToEventRow(BASE_ITEM, {});
    expect(row.source_url).toBe(BASE_ITEM.ORG_LINK);
  });

  it('ORG_LINK가 없으면 HMPG_ADDR로 대체한다', async () => {
    const row = await mapToEventRow({ ...BASE_ITEM, ORG_LINK: '' }, {});
    expect(row.source_url).toBe(BASE_ITEM.HMPG_ADDR);
  });

  it('둘 다 없으면 source_url은 null이다', async () => {
    const row = await mapToEventRow({ ...BASE_ITEM, ORG_LINK: '', HMPG_ADDR: '' }, {});
    expect(row.source_url).toBeNull();
  });
});
