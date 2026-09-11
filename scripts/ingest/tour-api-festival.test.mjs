// [가격 정보 파싱 고도화](2026-09-11 사용자 지시, implementation/todo.md 개선사항7-1)
// 단위 테스트 — 이 파일(레거시 구조, BaseCollectorAdapter 미사용)은 이전엔 테스트가
// 없었으나, 새로 추가한 source_url(detailCommon2의 homepage 필드) 추출 로직을 검증한다.
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./lib/fetch-with-timeout.mjs', () => ({
  fetchWithTimeout: vi.fn(),
}));

const { mapToEventRow } = await import('./tour-api-festival.mjs');
const { fetchWithTimeout } = await import('./lib/fetch-with-timeout.mjs');

// 실측 표본 그대로(2026-09-11 프로덕션 raw_data 직접 조회).
const BASE_ITEM = {
  contentid: '2648460',
  title: '경복궁 별빛야행',
  mapx: '126.9767218661',
  mapy: '37.5760307000',
  addr1: '서울특별시 종로구 사직로 161 (세종로)',
  eventstartdate: '20260902',
  eventenddate: '20261024',
  firstimage: 'https://tong.visitkorea.or.kr/cms/resource/35/4100435_image2_1.jpg',
};

function detailCommon2Response({ overview = '', homepage = '' } = {}) {
  return {
    ok: true,
    text: async () =>
      JSON.stringify({
        response: {
          header: { resultCode: '0000', resultMsg: 'OK' },
          body: { items: { item: { overview, homepage } } },
        },
      }),
  };
}

describe('tour-api-festival mapToEventRow (가격 정보 파싱 고도화)', () => {
  afterEach(() => vi.clearAllMocks());

  it('detailCommon2의 homepage(HTML 앵커 태그)에서 순수 URL만 뽑아 source_url로 쓴다', async () => {
    fetchWithTimeout.mockResolvedValue(
      detailCommon2Response({
        overview: '경복궁 별빛야행 개요',
        homepage: '<a href="https://royal.khs.go.kr" target="_blank">https://royal.khs.go.kr</a>',
      })
    );
    const row = await mapToEventRow(BASE_ITEM, { dryRun: false });

    expect(row.source_url).toBe('https://royal.khs.go.kr');
    expect(row.description).toBe('경복궁 별빛야행 개요');
    // 가격 필드는 API 어디에도 없음이 실측 확인됨 — 추측으로 만들지 않고 null.
    expect(row.price_text).toBeNull();
  });

  it('homepage가 순수 URL 형태로 오면 그대로 쓴다(방어적 처리)', async () => {
    fetchWithTimeout.mockResolvedValue(detailCommon2Response({ homepage: 'https://plain-url.example.com' }));
    const row = await mapToEventRow(BASE_ITEM, { dryRun: false });

    expect(row.source_url).toBe('https://plain-url.example.com');
  });

  it('homepage가 없으면 source_url은 null이다', async () => {
    fetchWithTimeout.mockResolvedValue(detailCommon2Response({ homepage: '' }));
    const row = await mapToEventRow(BASE_ITEM, { dryRun: false });

    expect(row.source_url).toBeNull();
  });

  it('dry-run이면 상세 호출 자체를 하지 않고 source_url도 null이다', async () => {
    const row = await mapToEventRow(BASE_ITEM, { dryRun: true });

    expect(fetchWithTimeout).not.toHaveBeenCalled();
    expect(row.source_url).toBeNull();
  });
});
