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

const searchNaverPlacesMock = vi.fn();
vi.mock('./lib/naver-search.mjs', () => ({ searchNaverPlaces: searchNaverPlacesMock }));

const pickBestCandidateMock = vi.fn();
vi.mock('./lib/address-match.mjs', () => ({ pickBestCandidate: pickBestCandidateMock }));

const suggestSearchTermMock = vi.fn();
vi.mock('./lib/llm-search-term.mjs', () => ({ suggestSearchTerm: suggestSearchTermMock }));

const { run } = await import('./search-and-match.mjs');

describe('search-and-match run()', () => {
  beforeEach(() => {
    readCsvUtf8Mock.mockReset();
    writeCsvUtf8Mock.mockReset();
    searchNaverPlacesMock.mockReset();
    pickBestCandidateMock.mockReset();
    suggestSearchTermMock.mockReset();
  });

  it('이미 네이버플레이스ID가 있는 행은 건너뛴다', async () => {
    readCsvUtf8Mock.mockReturnValue([{ 명칭: '식당A', 주소: '주소A', 네이버플레이스ID: '123' }]);

    const stats = await run({ apiKey: null, delayMs: 0 });

    expect(stats.skipped).toBe(1);
    expect(searchNaverPlacesMock).not.toHaveBeenCalled();
  });

  it('1차 검색에서 매칭되면 ID/URL을 채운다', async () => {
    const row = { 명칭: '원조남원추어탕', 주소: '경기도 시흥시', 네이버플레이스ID: '' };
    readCsvUtf8Mock.mockReturnValue([row]);
    searchNaverPlacesMock.mockResolvedValue({ results: [{ id: '36621594', name: '원조남원추어탕' }], status: 200 });
    pickBestCandidateMock.mockReturnValue({ candidate: { id: '36621594', name: '원조남원추어탕' } });

    const stats = await run({ apiKey: null, delayMs: 0 });

    expect(stats.matched).toBe(1);
    expect(row.네이버플레이스ID).toBe('36621594');
    expect(row.네이버플레이스URL).toContain('36621594');
    expect(suggestSearchTermMock).not.toHaveBeenCalled();
  });

  it('1차 실패 + apiKey 없음이면 NOT_FOUND로 기록한다', async () => {
    const row = { 명칭: '식당A', 주소: '주소A', 네이버플레이스ID: '' };
    readCsvUtf8Mock.mockReturnValue([row]);
    searchNaverPlacesMock.mockResolvedValue({ results: [], status: 200 });
    pickBestCandidateMock.mockReturnValue(null);

    const stats = await run({ apiKey: null, delayMs: 0 });

    expect(stats.notFound).toBe(1);
    expect(row.네이버플레이스ID).toBe('NOT_FOUND');
  });

  it('1차 실패 후 LLM 제안 검색어로 2차 검색에 성공하면 매칭된다', async () => {
    const row = { 명칭: '식당A', 주소: '주소A', 네이버플레이스ID: '' };
    readCsvUtf8Mock.mockReturnValue([row]);
    searchNaverPlacesMock
      .mockResolvedValueOnce({ results: [], status: 200 })
      .mockResolvedValueOnce({ results: [{ id: '999', name: '식당A 공식점' }], status: 200 });
    pickBestCandidateMock
      .mockReturnValueOnce(null)
      .mockReturnValueOnce({ candidate: { id: '999', name: '식당A 공식점' } });
    suggestSearchTermMock.mockResolvedValue('식당A 공식점');

    const stats = await run({ apiKey: 'key', delayMs: 0 });

    expect(stats.matched).toBe(1);
    expect(row.네이버플레이스ID).toBe('999');
  });

  it('이름에 "공원"이 있고 1차 검색이 실패하면, "공원"을 뗀 이름으로 재시도한다', async () => {
    const row = { 명칭: '불암산공원 유아숲체험원', 주소: '서울특별시 노원구 중계동 산 95-1', 네이버플레이스ID: '' };
    readCsvUtf8Mock.mockReturnValue([row]);
    searchNaverPlacesMock
      .mockResolvedValueOnce({ results: [], status: 200 })
      .mockResolvedValueOnce({ results: [{ id: '777', name: '불암산 유아숲체험장' }], status: 200 });
    pickBestCandidateMock
      .mockReturnValueOnce(null)
      .mockReturnValueOnce({ candidate: { id: '777', name: '불암산 유아숲체험장' } });

    const stats = await run({ apiKey: null, delayMs: 0 });

    expect(stats.matched).toBe(1);
    expect(row.네이버플레이스ID).toBe('777');
    expect(searchNaverPlacesMock).toHaveBeenNthCalledWith(2, '불암산 유아숲체험원');
  });

  it('이름에 "공원"이 없으면 공원제거 재시도 없이 바로 LLM 단계로 간다', async () => {
    const row = { 명칭: '식당A', 주소: '주소A', 네이버플레이스ID: '' };
    readCsvUtf8Mock.mockReturnValue([row]);
    searchNaverPlacesMock.mockResolvedValue({ results: [], status: 200 });
    pickBestCandidateMock.mockReturnValue(null);
    suggestSearchTermMock.mockResolvedValue('식당A 공식점');

    await run({ apiKey: 'key', delayMs: 0 });

    // 1차(원본) + LLM 제안 검색어 2회만 — "공원" 제거 재시도 단계는 호출되지 않는다.
    expect(searchNaverPlacesMock).toHaveBeenCalledTimes(2);
  });

  it('429(레이트리밋)이면 NOT_FOUND로 기록하지 않고 빈 값을 유지한다', async () => {
    const row = { 명칭: '식당A', 주소: '주소A', 네이버플레이스ID: '' };
    readCsvUtf8Mock.mockReturnValue([row]);
    searchNaverPlacesMock.mockResolvedValue({ results: [], status: 429 });

    const stats = await run({ apiKey: null, delayMs: 0 });

    expect(stats.rateLimited).toBe(1);
    expect(row.네이버플레이스ID).toBe('');
  });

  it('limit만큼만 처리하고 나머지는 그대로 둔다', async () => {
    const rows = [
      { 명칭: '식당A', 주소: '주소A', 네이버플레이스ID: '' },
      { 명칭: '식당B', 주소: '주소B', 네이버플레이스ID: '' },
    ];
    readCsvUtf8Mock.mockReturnValue(rows);
    searchNaverPlacesMock.mockResolvedValue({ results: [], status: 200 });
    pickBestCandidateMock.mockReturnValue(null);

    const stats = await run({ apiKey: null, delayMs: 0, limit: 1 });

    expect(stats.processed).toBe(1);
    expect(rows[0].네이버플레이스ID).toBe('NOT_FOUND');
    expect(rows[1].네이버플레이스ID).toBe('');
  });

  it('마지막에 항상 CSV를 저장한다', async () => {
    readCsvUtf8Mock.mockReturnValue([{ 명칭: '식당A', 주소: '주소A', 네이버플레이스ID: '123' }]);

    await run({ apiKey: null, delayMs: 0 });

    expect(writeCsvUtf8Mock).toHaveBeenCalled();
  });
});
