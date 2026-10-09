import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./lib/fetch-with-timeout.mjs', () => ({
  fetchWithTimeout: vi.fn(),
}));

const { fetchAllForStoreAndTarget, splitOpenAndClosedRows } = await import('./starfield-culture-club.mjs');
const { fetchWithTimeout } = await import('./lib/fetch-with-timeout.mjs');

function listResponse(rows) {
  return { ok: true, text: async () => JSON.stringify({ list: rows }) };
}

function makeRow(lctrNo, totalCnt) {
  return { lctrNo, lctrNm: '테스트 강좌', storeCd: '01', storeNm: '고양점', acptStCd: 'I', lctrTotCnt: totalCnt };
}

// [대기불가(WD) 제외 — 다른 브랜드와 동일한 정책](2026-10-09 사용자 승인:
// "그렇게 진행하자") 기존에 확립된 "마감/WD 상태는 새로 쌓지 않고 기존
// 행만 상태 갱신" 정책을 그대로 적용한다.
describe('splitOpenAndClosedRows', () => {
  it('WD가 아닌 행만 openRows로, WD인 행의 class_id만 closedClassIds로 분리한다', () => {
    const rows = [
      { class_id: 'A', raw_status: 'I' },
      { class_id: 'B', raw_status: 'WD' },
      { class_id: 'C', raw_status: 'P' },
      { class_id: 'D', raw_status: 'WD' },
    ];
    const { openRows, closedClassIds } = splitOpenAndClosedRows(rows);

    expect(openRows.map((r) => r.class_id)).toEqual(['A', 'C']);
    expect(closedClassIds).toEqual(['B', 'D']);
  });

  it('입력이 비어있으면 둘 다 빈 배열', () => {
    expect(splitOpenAndClosedRows([])).toEqual({ openRows: [], closedClassIds: [] });
  });
});

// [페이지네이션 — 고정 20건, lctrTotCnt로 총 페이지 계산](2026-10-09
// 실측 확인: recordsPerPage 파라미터는 무시되고 서버가 늘 20건만 돌려줌)
// 수신 건수가 총건수에 도달할 때까지 다음 페이지를 계속 요청하는지,
// 도달하면 멈추는지 검증한다.
describe('fetchAllForStoreAndTarget — 페이지네이션', () => {
  afterEach(() => vi.clearAllMocks());

  it('총건수(lctrTotCnt)에 도달할 때까지 여러 페이지를 순회해 전부 합친다', async () => {
    const page1 = Array.from({ length: 20 }, (_, i) => makeRow(`L${i}`, 25));
    const page2 = Array.from({ length: 5 }, (_, i) => makeRow(`L2-${i}`, 25));
    fetchWithTimeout.mockResolvedValueOnce(listResponse(page1)).mockResolvedValueOnce(listResponse(page2));

    const items = await fetchAllForStoreAndTarget('01', '3', { srchBeginDt: '2026.10.09', srchTrmntDt: '2027.10.09' });

    expect(fetchWithTimeout).toHaveBeenCalledTimes(2);
    expect(items).toHaveLength(25);
  });

  it('첫 페이지만으로 총건수에 도달하면 두 번째 요청을 보내지 않는다', async () => {
    const page1 = Array.from({ length: 5 }, (_, i) => makeRow(`L${i}`, 5));
    fetchWithTimeout.mockResolvedValueOnce(listResponse(page1));

    const items = await fetchAllForStoreAndTarget('01', '3', { srchBeginDt: '2026.10.09', srchTrmntDt: '2027.10.09' });

    expect(fetchWithTimeout).toHaveBeenCalledTimes(1);
    expect(items).toHaveLength(5);
  });

  it('요청 바디에 고정 쿠키 헤더와 storeCd/lctrTrgCtgryCd가 올바르게 실린다', async () => {
    fetchWithTimeout.mockResolvedValueOnce(listResponse([makeRow('L1', 1)]));

    await fetchAllForStoreAndTarget('02', '2', { srchBeginDt: '2026.10.09', srchTrmntDt: '2027.10.09' });

    const [url, options] = fetchWithTimeout.mock.calls[0];
    expect(url).toBe('https://www.classkok.com/mlt/selectLctrList.do');
    expect(options.headers.Cookie).toBe('_classkok_store_=MDE=');
    expect(options.body).toContain('storeCd=02');
    expect(options.body).toContain('lctrTrgCtgryCd=2');
  });
});
