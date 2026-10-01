import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HomeplusLectureListPanel } from './homeplus-lecture-list-panel';

// [홈플러스 문화센터 강좌 리스트 — data-grid 탭](2026-10-02 사용자 지시):
// 다른 자기완결 패널과 동일한 관례(마운트 시 자동 조회 안 함, "조회하기"
// 버튼으로 시작) — 목록 조회, 마감/신청가능 필터 토글을 검증한다.
// [일일 배치 자동화 — 상태 배너](2026-10-02 사용자 지시: "세션 만료되었다고
// 다시 카카오폰 로그인 해달라는거... 홈플러스 강좌 리스트에서 진행할수있게
// 해줘") 추가 후: /api/admin/pipeline-logs 응답에 따른 배너(OK/세션
// 만료/일반 실패)도 함께 검증한다.
const OPEN_ROW = {
  id: 1,
  search_batch: 1 as const,
  store_name: '강서점',
  date_range_text: '2026.08.01 ~ 2026.08.31',
  is_closed: false,
  raw_text: '강서점\n정규\n잉글리쉬 토피아',
  collected_at: '2026-10-02T00:00:00.000Z',
};
const CLOSED_ROW = {
  id: 2,
  search_batch: 2 as const,
  store_name: '부산점',
  date_range_text: '2026.09.01 ~ 2026.09.30',
  is_closed: true,
  raw_text: '부산점\n단기\n마감된 강좌',
  collected_at: '2026-10-02T01:00:00.000Z',
};

// [URL별 응답 분기] 패널이 마운트 시 /api/admin/pipeline-logs(배치 상태
// 배너)를, 조회하기 클릭 시 /api/admin/homeplus-lecture-list(목록)를 각각
// 호출하므로, 어느 쪽 테스트든 두 엔드포인트 모두에 응답을 지정할 수 있게
// URL 기준으로 분기하는 공용 mock을 둔다.
function mockFetchRouter({
  rows,
  rowsError,
  history,
}: {
  rows?: unknown[];
  rowsError?: string;
  history?: unknown[];
}) {
  return vi.fn((input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/api/admin/pipeline-logs')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ history: history ?? [] }) } as Response);
    }
    if (url.includes('/api/admin/homeplus-lecture-list')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(rowsError ? { error: rowsError } : { rows: rows ?? [] }),
      } as Response);
    }
    return Promise.reject(new Error(`예상치 못한 fetch 호출: ${url}`));
  });
}

describe('HomeplusLectureListPanel', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('마운트 시 자동 조회하지 않고, 조회하기를 눌러야 목록을 가져온다', async () => {
    vi.stubGlobal('fetch', mockFetchRouter({ rows: [OPEN_ROW, CLOSED_ROW] }));

    render(<HomeplusLectureListPanel />);
    expect(screen.getByText("'조회하기'를 눌러 수집 결과를 불러오세요.")).toBeInTheDocument();

    fireEvent.click(screen.getByText('조회하기'));

    expect(await screen.findByText('강서점')).toBeInTheDocument();
    expect(screen.getByText('부산점')).toBeInTheDocument();
    expect(screen.getByText('총 2건 (마감 1건 / 신청가능 1건)')).toBeInTheDocument();
  });

  it('마감/신청가능 필터 토글이 목록을 걸러낸다', async () => {
    vi.stubGlobal('fetch', mockFetchRouter({ rows: [OPEN_ROW, CLOSED_ROW] }));

    render(<HomeplusLectureListPanel />);
    fireEvent.click(screen.getByText('조회하기'));
    await waitFor(() => expect(screen.getByText('강서점')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: '마감' }));
    expect(screen.queryByText('강서점')).not.toBeInTheDocument();
    expect(screen.getByText('부산점')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '신청가능' }));
    expect(screen.getByText('강서점')).toBeInTheDocument();
    expect(screen.queryByText('부산점')).not.toBeInTheDocument();
  });

  it('조회 실패 시 에러 메시지를 보여준다', async () => {
    vi.stubGlobal('fetch', mockFetchRouter({ rowsError: '조회 실패' }));

    render(<HomeplusLectureListPanel />);
    fireEvent.click(screen.getByText('조회하기'));

    expect(await screen.findByText('조회 실패')).toBeInTheDocument();
  });

  it('마지막 배치가 성공이면 성공 배너를 보여준다', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchRouter({
        history: [
          {
            status: 'OK',
            executed_at: '2026-10-02T03:20:00.000Z',
            error_message: null,
            meta_data: { collected: 40, closed: 40 },
          },
        ],
      })
    );

    render(<HomeplusLectureListPanel />);

    expect(await screen.findByText(/마지막 자동 수집 성공/)).toBeInTheDocument();
    expect(screen.getByText(/총 40건, 마감 40건/)).toBeInTheDocument();
  });

  it('세션 만료로 실패했으면 재로그인 안내 배너를 보여준다', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchRouter({
        history: [
          {
            status: 'FAILED',
            executed_at: '2026-10-03T03:20:00.000Z',
            error_message: '세션 만료 — 카카오 로그인 재인증 필요',
            meta_data: { reason: 'session_expired' },
          },
        ],
      })
    );

    render(<HomeplusLectureListPanel />);

    expect(await screen.findByText(/세션 만료/)).toBeInTheDocument();
    expect(screen.getByText(/homeplus-save-login-session\.py/)).toBeInTheDocument();
    expect(screen.getByText(/HOMEPLUS_STATE_JSON/)).toBeInTheDocument();
  });

  it('세션 만료가 아닌 일반 실패는 에러 메시지를 그대로 보여준다', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchRouter({
        history: [
          {
            status: 'FAILED',
            executed_at: '2026-10-03T03:20:00.000Z',
            error_message: 'Timeout 15000ms exceeded',
            meta_data: null,
          },
        ],
      })
    );

    render(<HomeplusLectureListPanel />);

    expect(await screen.findByText(/마지막 자동 수집 실패/)).toBeInTheDocument();
    expect(screen.getByText(/Timeout 15000ms exceeded/)).toBeInTheDocument();
  });
});
