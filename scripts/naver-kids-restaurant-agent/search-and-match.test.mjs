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
// normalizeText는 실제 구현을 그대로 재사용한다(resolveFinalAddress가
// "이름이 정확히 같은지" 판단할 때 쓰는 실제 동작을 테스트에서도 검증하기 위함).
vi.mock('./lib/address-match.mjs', () => ({
  pickBestCandidate: pickBestCandidateMock,
  normalizeText: (text) => (text ? text.replace(/[\s()·\-,]/g, '') : ''),
}));

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

  it('이름에 "근린공원"이 있으면 복합어를 통째로 떼고 재시도한다("근린"만 남기지 않음)', async () => {
    const row = { 명칭: '배봉산근린공원 유아숲체험원', 주소: '서울특별시 동대문구 휘경동 산 6-91', 네이버플레이스ID: '' };
    readCsvUtf8Mock.mockReturnValue([row]);
    searchNaverPlacesMock
      .mockResolvedValueOnce({ results: [], status: 200 })
      .mockResolvedValueOnce({ results: [{ id: '615747111', name: '배봉산근린공원 유아숲체험원' }], status: 200 });
    pickBestCandidateMock
      .mockReturnValueOnce(null)
      .mockReturnValueOnce({ candidate: { id: '615747111', name: '배봉산근린공원 유아숲체험원' } });

    const stats = await run({ apiKey: null, delayMs: 0 });

    expect(stats.matched).toBe(1);
    expect(searchNaverPlacesMock).toHaveBeenNthCalledWith(2, '배봉산 유아숲체험원');
  });

  // [이름이 정확히 같으면 지번을 네이버 쪽으로 보정](2026-10-17 사용자 지시)
  it('이름이 정확히 일치하면 주소를 네이버 쪽 주소로 덮어쓴다', async () => {
    const row = { 명칭: '배봉산근린공원 유아숲체험원', 주소: '서울특별시 동대문구 휘경동 산 6-91', 네이버플레이스ID: '' };
    readCsvUtf8Mock.mockReturnValue([row]);
    searchNaverPlacesMock.mockResolvedValue({
      results: [{ id: '615747111', name: '배봉산근린공원 유아숲체험원', fullAddress: '서울특별시 동대문구 휘경동 산6-80' }],
      status: 200,
    });
    pickBestCandidateMock.mockReturnValue({
      candidate: { id: '615747111', name: '배봉산근린공원 유아숲체험원', fullAddress: '서울특별시 동대문구 휘경동 산6-80' },
    });

    await run({ apiKey: null, delayMs: 0 });

    expect(row.주소).toBe('서울특별시 동대문구 휘경동 산6-80');
  });

  // [실측 회귀 테스트](2026-10-17, 전체 재매칭 결과 검수 중 발견) — 이름이
  // 정확히 같아도 네이버 주소가 "서울특별시 강북구"처럼 너무 짧으면(동/번지
  // 없음) 오히려 정보가 줄어드는 덮어쓰기라 하지 않아야 한다.
  it('이름이 정확히 같아도 네이버 주소가 너무 짧으면(동/번지 없음) 덮어쓰지 않는다', async () => {
    const row = { 명칭: '북서울꿈의숲 유아숲체험원', 주소: '서울특별시 강북구 번동 90', 네이버플레이스ID: '' };
    readCsvUtf8Mock.mockReturnValue([row]);
    searchNaverPlacesMock.mockResolvedValue({
      results: [{ id: '1090645168', name: '북서울꿈의숲 유아숲체험원', fullAddress: '서울특별시 강북구' }],
      status: 200,
    });
    pickBestCandidateMock.mockReturnValue({
      candidate: { id: '1090645168', name: '북서울꿈의숲 유아숲체험원', fullAddress: '서울특별시 강북구' },
    });

    await run({ apiKey: null, delayMs: 0 });

    expect(row.주소).toBe('서울특별시 강북구 번동 90');
  });

  it('이름이 완전히 같지 않으면(지점명 등) 주소를 덮어쓰지 않는다', async () => {
    const row = { 명칭: '불암산공원 유아숲체험원', 주소: '서울특별시 노원구 중계동 산 95-1', 네이버플레이스ID: '' };
    readCsvUtf8Mock.mockReturnValue([row]);
    searchNaverPlacesMock.mockResolvedValue({
      results: [{ id: '777', name: '불암산 유아숲체험장', fullAddress: '전혀 다른 주소' }],
      status: 200,
    });
    pickBestCandidateMock.mockReturnValue({
      candidate: { id: '777', name: '불암산 유아숲체험장', fullAddress: '전혀 다른 주소' },
    });

    await run({ apiKey: null, delayMs: 0 });

    expect(row.주소).toBe('서울특별시 노원구 중계동 산 95-1');
  });

  // [주소로 검색하는 최종 재시도](2026-10-17 사용자 지시: "그래도 안나오면
  // 우리쪽 주소로 검색해서 유아숲체험원이 나오는지 확인하고")
  describe('addressSearchCategoryKeyword(주소 검색 최종 재시도)', () => {
    it('이름 검색이 전부 실패하고 키워드가 주어지면 주소로 검색해 카테고리 키워드가 포함된 유일한 결과를 매칭한다', async () => {
      // 이름에 "공원"이 없는 값을 써서(예: 배봉산 유아숲체험원이 아니라 임의의
      // 이름) 공원제거 재시도 단계가 끼어들지 않게 한다 — 1차 검색 → 바로 주소
      // 검색 순서만 검증하려는 테스트.
      const row = { 명칭: '임의의시설명', 주소: '서울특별시 노원구 화랑로 727', 네이버플레이스ID: '' };
      readCsvUtf8Mock.mockReturnValue([row]);
      searchNaverPlacesMock
        .mockResolvedValueOnce({ results: [], status: 200 }) // 1차(원본명)
        .mockResolvedValueOnce({
          results: [
            { id: '1', name: '태릉선수촌행정동' },
            { id: '2', name: '화랑대 유아숲체험원' },
          ],
          status: 200,
        }); // 주소 검색
      pickBestCandidateMock.mockReturnValue(null);

      const stats = await run({ apiKey: null, delayMs: 0, addressSearchCategoryKeyword: '유아숲체험' });

      expect(stats.matched).toBe(1);
      expect(row.네이버플레이스ID).toBe('2');
      expect(searchNaverPlacesMock).toHaveBeenNthCalledWith(2, row.주소);
    });

    it('주소 검색 결과에 카테고리 키워드가 포함된 게 여러 개면 매칭하지 않는다(근거 불충분)', async () => {
      const row = { 명칭: '식당A', 주소: '어떤 주소', 네이버플레이스ID: '' };
      readCsvUtf8Mock.mockReturnValue([row]);
      searchNaverPlacesMock.mockResolvedValueOnce({ results: [], status: 200 }).mockResolvedValueOnce({
        results: [
          { id: '1', name: '유아숲체험원 A' },
          { id: '2', name: '유아숲체험원 B' },
        ],
        status: 200,
      });
      pickBestCandidateMock.mockReturnValue(null);

      const stats = await run({ apiKey: null, delayMs: 0, addressSearchCategoryKeyword: '유아숲체험' });

      expect(stats.notFound).toBe(1);
    });

    it('키워드를 주지 않으면 주소 검색 단계 자체를 하지 않는다', async () => {
      const row = { 명칭: '식당A', 주소: '주소A', 네이버플레이스ID: '' };
      readCsvUtf8Mock.mockReturnValue([row]);
      searchNaverPlacesMock.mockResolvedValue({ results: [], status: 200 });
      pickBestCandidateMock.mockReturnValue(null);

      await run({ apiKey: null, delayMs: 0 });

      // 1차(원본)만 — "공원" 없음 + apiKey 없음 + 키워드 없음.
      expect(searchNaverPlacesMock).toHaveBeenCalledTimes(1);
    });
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
