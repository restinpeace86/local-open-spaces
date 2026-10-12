import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./lib/fetch-with-timeout.mjs', () => ({
  fetchWithTimeout: vi.fn(),
}));

const { run, splitOpenAndClosedRows, looksLikeSuspiciousEmptyResponse } = await import('./eland-retail-culture-club.mjs');
const { fetchWithTimeout } = await import('./lib/fetch-with-timeout.mjs');

function cardHtml({ storeId = '8222', semNum = '66', lecTypeId, seq, statusText, title }) {
  return `<li><a href="#;" onclick="culture04('${storeId}','${semNum}','${lecTypeId}','${seq}');">
    <mark class="mark2">${statusText}</mark>
    <strong>${title}</strong>
    <span class="assist">부천 <span>|</span> ${lecTypeId}${seq} <span>|</span> 전문강사</span>
    <span class="assist"> 월요일 13:50 ~ 14:30 <span>|</span> 77,000원</span>
  </a></li>`;
}

describe('looksLikeSuspiciousEmptyResponse', () => {
  it('실측으로 확인된 진짜 "0건" 응답(mobLectureCnt_1=0 고정 템플릿)은 의심하지 않는다', () => {
    const realEmptyResponse = '\n\n\n\n\n\t\n\t<input type="hidden" id="mobLectureCnt_1" value="0">\n';
    expect(looksLikeSuspiciousEmptyResponse(realEmptyResponse, 0)).toBe(false);
  });

  it('카드가 1건 이상 있으면(정상 데이터) 의심하지 않는다', () => {
    const html = '<input type="hidden" id="mobLectureCnt_1" value="1">';
    expect(looksLikeSuspiciousEmptyResponse(html, 1)).toBe(false);
  });

  it('카드가 0건인데 "0건" 마커가 없으면(차단/공지 페이지 등) 의심한다', () => {
    const blockLikeHtml = '<html><body>일시적으로 접속이 원활하지 않습니다.</body></html>';
    expect(looksLikeSuspiciousEmptyResponse(blockLikeHtml, 0)).toBe(true);
  });
});

describe('splitOpenAndClosedRows — 현장문의/마감 등 비활성 상태 제외', () => {
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

describe('run(dryRun) — LecTypeID 8개를 각각 지점 없이 조회한다', () => {
  afterEach(() => vi.clearAllMocks());

  // [타임아웃 연장] 8개 카테고리 사이 랜덤 pacing 지연(1~2초)이 7번 들어가
  // 기본 5초 테스트 타임아웃을 넘긴다 — 실제 배치 동작을 그대로 두고
  // 테스트 쪽 제한만 늘린다.
  it('B/C/D/F/J/K/L/M 8개 코드 각각에 대해 StoreID를 비운 채로 요청한다', async () => {
    for (const code of ['B', 'C', 'D', 'F', 'J', 'K', 'L', 'M']) {
      if (code === 'B') {
        fetchWithTimeout.mockResolvedValueOnce({
          ok: true,
          text: async () => cardHtml({ lecTypeId: 'B', seq: '36', statusText: '현장문의', title: '(월)테스트(11-20개월)' }),
        });
      } else {
        fetchWithTimeout.mockResolvedValueOnce({
          ok: true,
          text: async () => '<input type="hidden" id="mobLectureCnt_1" value="0">',
        });
      }
    }

    const result = await run({ dryRun: true });

    expect(fetchWithTimeout).toHaveBeenCalledTimes(8);
    const bodies = fetchWithTimeout.mock.calls.map(([, options]) => JSON.parse(options.body));
    expect(bodies.map((b) => b.LecTypeID)).toEqual(['B', 'C', 'D', 'F', 'J', 'K', 'L', 'M']);
    expect(bodies.every((b) => b.StoreID === '')).toBe(true);
    expect(bodies.every((b) => b.PageSize === 1000)).toBe(true);

    // 현장문의(CLOSED)라 저장 대상에서 제외됨.
    expect(result.count).toBe(0);
  }, 15000);
});
