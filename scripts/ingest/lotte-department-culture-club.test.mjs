import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./lib/fetch-with-timeout.mjs', () => ({
  fetchWithTimeout: vi.fn(),
}));

const { run, splitOpenAndClosedRows } = await import('./lotte-department-culture-club.mjs');
const { fetchWithTimeout } = await import('./lib/fetch-with-timeout.mjs');

function cardHtml({ href, statusText, storeName }) {
  return `<div class="card_list_v" data-tot-cnt="1">
    <a href="${href}" class="lec_list">
      <div class="img_box"><img src="https://culture.lotteshopping.com/x.jpg"></div>
      <div class="con">
        <div class="label_div"><p class="label small gray">${statusText}</p><p class="label small black_gray">${storeName}</p></div>
        <p class="tit">테스트 강좌</p>
      </div>
    </a>
  </div>`;
}

describe('splitOpenAndClosedRows — 지점문의/접수마감 등 비활성 상태 제외', () => {
  it('OPEN/WAITING만 openRows로, 그 외(CLOSED)는 closedClassIds로 분리한다', () => {
    const rows = [
      { class_id: 'A', normalized_status: 'OPEN' },
      { class_id: 'B', normalized_status: 'CLOSED' },
      { class_id: 'C', normalized_status: 'WAITING' },
      { class_id: 'D', normalized_status: 'CLOSED' },
    ];
    const { openRows, closedClassIds } = splitOpenAndClosedRows(rows);

    expect(openRows.map((r) => r.class_id)).toEqual(['A', 'C']);
    expect(closedClassIds).toEqual(['B', 'D']);
  });

  it('입력이 비어있으면 둘 다 빈 배열', () => {
    expect(splitOpenAndClosedRows([])).toEqual({ openRows: [], closedClassIds: [] });
  });
});

// [봇 차단/정책 변경 의심 — 디스코드 알림에 명확히 드러나야 함](2026-10-09
// 사용자 지시: "차단 정책이 바뀌면 나한테 알려줘서 내가 인지할수있게해줘")
describe('run — 봇 차단 의심 응답은 명확한 에러로 실패한다', () => {
  afterEach(() => vi.clearAllMocks());

  it('data-tot-cnt가 없는 응답(예: Incapsula 챌린지 페이지)이면 "봇 차단" 문구가 포함된 에러를 던진다', async () => {
    fetchWithTimeout.mockResolvedValueOnce({ ok: true, text: async () => '<html>이상한 페이지</html>' });

    await expect(run({ dryRun: false })).rejects.toThrow(/봇 차단/);
  });
});

describe('run(dryRun) — 실제 요청 파라미터와 파싱 결과', () => {
  afterEach(() => vi.clearAllMocks());

  it('대분류(lrclsCtegryCd) 02와 03 각각 한 번씩, 전체 지점/소분류를 비운 채로 요청한다', async () => {
    fetchWithTimeout
      .mockResolvedValueOnce({ ok: true, text: async () => cardHtml({ href: '/application/search/view.do?brchCd=0025&yy=2026&lectSmsterCd=3&lectCd=0001', statusText: '접수중', storeName: '전주점' }) })
      .mockResolvedValueOnce({ ok: true, text: async () => cardHtml({ href: '/application/search/view.do?brchCd=0025&yy=2026&lectSmsterCd=3&lectCd=0002', statusText: '지점문의', storeName: '전주점' }) });

    const result = await run({ dryRun: true });

    expect(fetchWithTimeout).toHaveBeenCalledTimes(2);
    const [, firstOptions] = fetchWithTimeout.mock.calls[0];
    expect(firstOptions.body).toContain('lrclsCtegryCd=02');
    expect(firstOptions.body).toContain('mdclsCtegryCd=');
    expect(firstOptions.body).toContain('brchCdList=');
    expect(firstOptions.body).toContain('listCnt=10000');
    const [, secondOptions] = fetchWithTimeout.mock.calls[1];
    expect(secondOptions.body).toContain('lrclsCtegryCd=03');

    // 접수중 1건만 저장 대상(지점문의는 비활성으로 제외).
    expect(result.count).toBe(1);
  });
});
