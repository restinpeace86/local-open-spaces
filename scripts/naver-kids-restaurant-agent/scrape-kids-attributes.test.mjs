import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/load-env.mjs', () => ({ loadEnv: vi.fn() }));

const readCsvUtf8Mock = vi.fn();
const writeCsvUtf8Mock = vi.fn();
const mergeHeaderMock = vi.fn((rows, required) => required);
vi.mock('./lib/csv.mjs', () => ({
  readCsvUtf8: readCsvUtf8Mock,
  writeCsvUtf8: writeCsvUtf8Mock,
  mergeHeader: mergeHeaderMock,
}));

const fetchPlaceConveniencesMock = vi.fn();
vi.mock('./lib/naver-place-detail.mjs', () => ({ fetchPlaceConveniences: fetchPlaceConveniencesMock }));

const fetchKidGoodReviewBodiesMock = vi.fn();
vi.mock('./lib/naver-reviews.mjs', () => ({ fetchKidGoodReviewBodies: fetchKidGoodReviewBodiesMock }));

const extractKidsFriendlyAttributesMock = vi.fn();
vi.mock('./lib/kids-friendly-extraction.mjs', () => ({
  extractKidsFriendlyAttributes: extractKidsFriendlyAttributesMock,
}));

const { run } = await import('./scrape-kids-attributes.mjs');

describe('scrape-kids-attributes run()', () => {
  beforeEach(() => {
    readCsvUtf8Mock.mockReset();
    writeCsvUtf8Mock.mockReset();
    fetchPlaceConveniencesMock.mockReset();
    fetchKidGoodReviewBodiesMock.mockReset();
    extractKidsFriendlyAttributesMock.mockReset();
  });

  it('네이버플레이스ID가 NOT_FOUND이거나 비어있으면 건너뛴다', async () => {
    readCsvUtf8Mock.mockReturnValue([
      { 명칭: 'A', 네이버플레이스ID: 'NOT_FOUND' },
      { 명칭: 'B', 네이버플레이스ID: '' },
    ]);

    const stats = await run({ apiKey: null, delayMs: 0 });

    expect(stats.noPlaceId).toBe(2);
    expect(fetchPlaceConveniencesMock).not.toHaveBeenCalled();
  });

  it('이미 분석된 행(아기의자 값 있음)은 건너뛴다', async () => {
    readCsvUtf8Mock.mockReturnValue([{ 명칭: 'A', 네이버플레이스ID: '123', 아기의자: '있음' }]);

    const stats = await run({ apiKey: null, delayMs: 0 });

    expect(stats.skipped).toBe(1);
    expect(fetchPlaceConveniencesMock).not.toHaveBeenCalled();
  });

  it('정상 분석되면 6개 컬럼을 채운다', async () => {
    const row = { 명칭: 'A', 네이버플레이스ID: '123' };
    readCsvUtf8Mock.mockReturnValue([row]);
    fetchPlaceConveniencesMock.mockResolvedValue({ conveniences: ['주차'], status: 200 });
    fetchKidGoodReviewBodiesMock.mockResolvedValue({ bodies: ['아기의자 있어요'], status: 200 });
    extractKidsFriendlyAttributesMock.mockResolvedValue({
      kidsChair: { present: true, evidence: '리뷰 근거' },
      kidsTableware: { present: false, evidence: null },
      kidsMenu: { present: true, evidence: '메뉴판 확인' },
    });

    const stats = await run({ apiKey: 'key', delayMs: 0 });

    expect(stats.analyzed).toBe(1);
    expect(row.아기의자).toBe('있음');
    expect(row.아기의자_근거).toBe('리뷰 근거');
    expect(row.유아식기).toBe('없음');
    expect(row.유아식기_근거).toBe('');
    expect(row.키즈메뉴).toBe('있음');
  });

  it('홈 페이지 조회가 429면 레이트리밋으로 집계하고 행은 그대로 둔다', async () => {
    const row = { 명칭: 'A', 네이버플레이스ID: '123' };
    readCsvUtf8Mock.mockReturnValue([row]);
    fetchPlaceConveniencesMock.mockResolvedValue({ conveniences: [], status: 429 });

    const stats = await run({ apiKey: 'key', delayMs: 0 });

    expect(stats.rateLimited).toBe(1);
    expect(row.아기의자).toBeUndefined();
  });

  it('LLM 추출이 실패하면 분석실패로 기록한다', async () => {
    const row = { 명칭: 'A', 네이버플레이스ID: '123' };
    readCsvUtf8Mock.mockReturnValue([row]);
    fetchPlaceConveniencesMock.mockResolvedValue({ conveniences: [], status: 200 });
    fetchKidGoodReviewBodiesMock.mockResolvedValue({ bodies: [], status: 200 });
    extractKidsFriendlyAttributesMock.mockResolvedValue(null);

    const stats = await run({ apiKey: 'key', delayMs: 0 });

    expect(stats.llmFailed).toBe(1);
    expect(row.아기의자).toBe('분석실패');
  });

  it('limit만큼만 처리한다', async () => {
    const rows = [
      { 명칭: 'A', 네이버플레이스ID: '123' },
      { 명칭: 'B', 네이버플레이스ID: '456' },
    ];
    readCsvUtf8Mock.mockReturnValue(rows);
    fetchPlaceConveniencesMock.mockResolvedValue({ conveniences: [], status: 200 });
    fetchKidGoodReviewBodiesMock.mockResolvedValue({ bodies: [], status: 200 });
    extractKidsFriendlyAttributesMock.mockResolvedValue({
      kidsChair: { present: false, evidence: null },
      kidsTableware: { present: false, evidence: null },
      kidsMenu: { present: false, evidence: null },
    });

    const stats = await run({ apiKey: 'key', delayMs: 0, limit: 1 });

    expect(stats.processed).toBe(1);
    expect(rows[0].아기의자).toBe('없음');
    expect(rows[1].아기의자).toBeUndefined();
  });
});
