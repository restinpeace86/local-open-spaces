import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./lib/fetch-with-timeout.mjs', () => ({
  fetchWithTimeout: vi.fn(),
}));

const { fetchAllForStore, splitOpenAndClosedRows } = await import('./akplaza-culture-club.mjs');
const { fetchWithTimeout } = await import('./lib/fetch-with-timeout.mjs');

function changeStoreResponse(setCookie) {
  return {
    ok: true,
    headers: { get: (name) => (name === 'set-cookie' ? setCookie : null) },
  };
}

function listResponse(json) {
  return { ok: true, text: async () => JSON.stringify(json) };
}

// [마감 제외 — 신세계/롯데마트와 동일한 정책을 AK플라자에도 적용](2026-10-09
// 사용자 지시: "제안하는 수집방식으로 해" — 기존에 확립된 "마감/RC 상태는
// 새로 쌓지 않고 기존 행만 상태 갱신" 정책을 그대로 적용한다.
describe('splitOpenAndClosedRows', () => {
  it('마감이 아닌 행만 openRows로, 마감인 행의 class_id만 closedClassIds로 분리한다', () => {
    const rows = [
      { class_id: 'A', raw_status: '접수가능' },
      { class_id: 'B', raw_status: '마감' },
      { class_id: 'C', raw_status: '마감임박' },
      { class_id: 'D', raw_status: '마감' },
    ];
    const { openRows, closedClassIds } = splitOpenAndClosedRows(rows);

    expect(openRows.map((r) => r.class_id)).toEqual(['A', 'C']);
    expect(closedClassIds).toEqual(['B', 'D']);
  });

  it('입력이 비어있으면 둘 다 빈 배열', () => {
    expect(splitOpenAndClosedRows([])).toEqual({ openRows: [], closedClassIds: [] });
  });
});

// [지점 — 세션 기반 전환 메커니즘](2026-10-09 실측 확인) change_main_store의
// Set-Cookie에서 JSESSIONID를 추출해 getPeltList_New 호출의 Cookie 헤더로
// 그대로 실어 보내는지 검증한다 — 이 메커니즘이 틀리면 지점이 전혀 안 바뀐
// 채로 조용히 동일한 데이터만 계속 수집하게 된다(실측상 store 바디
// 파라미터 자체는 완전히 무시됨).
describe('fetchAllForStore — 세션 기반 지점 전환', () => {
  afterEach(() => vi.clearAllMocks());

  it('change_main_store 응답의 Set-Cookie를 getPeltList_New 호출의 Cookie 헤더로 그대로 전달한다', async () => {
    fetchWithTimeout
      .mockResolvedValueOnce(changeStoreResponse('JSESSIONID=ABC123.front-was-svr; Path=/; Secure; HttpOnly'))
      .mockResolvedValueOnce(
        listResponse({
          listCnt: 1,
          image_dir: 'http://img-culture.akplaza.com/upload',
          list: [{ SUBJECT_CD: '1', SUBJECT_NM: '테스트 강좌', STORE: '02', MAIN_CD: '3', STATUS_TXT: '접수가능' }],
        })
      );

    const items = await fetchAllForStore('02');

    expect(fetchWithTimeout).toHaveBeenCalledTimes(2);
    const [changeStoreCall, listCall] = fetchWithTimeout.mock.calls;
    expect(changeStoreCall[0]).toBe('https://culture.akplaza.com/common/change_main_store');
    expect(listCall[0]).toBe('https://culture.akplaza.com/course/getPeltList_New');
    expect(listCall[1].headers.Cookie).toBe('JSESSIONID=ABC123.front-was-svr');
    expect(items).toHaveLength(1);
    expect(items[0].class_id).toBe('1');
  });

  it('change_main_store 응답에 Set-Cookie가 없으면 에러를 던진다(세션 없이 조회하면 지점이 전혀 안 바뀜)', async () => {
    fetchWithTimeout.mockResolvedValueOnce(changeStoreResponse(null));

    await expect(fetchAllForStore('02')).rejects.toThrow(/세션 쿠키/);
  });
});
