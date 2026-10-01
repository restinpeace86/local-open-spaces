import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HomeplusLectureListPanel } from './homeplus-lecture-list-panel';

// [홈플러스 문화센터 강좌 리스트 — data-grid 탭](2026-10-02 사용자 지시):
// 다른 자기완결 패널과 동일한 관례(마운트 시 자동 조회 안 함, "조회하기"
// 버튼으로 시작) — 목록 조회, 마감/신청가능 필터 토글을 검증한다.
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

function mockFetch(rows: unknown[]) {
  return vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ rows }) } as Response));
}

describe('HomeplusLectureListPanel', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('마운트 시 자동 조회하지 않고, 조회하기를 눌러야 목록을 가져온다', async () => {
    vi.stubGlobal('fetch', mockFetch([OPEN_ROW, CLOSED_ROW]));

    render(<HomeplusLectureListPanel />);
    expect(screen.getByText("'조회하기'를 눌러 수집 결과를 불러오세요.")).toBeInTheDocument();

    fireEvent.click(screen.getByText('조회하기'));

    expect(await screen.findByText('강서점')).toBeInTheDocument();
    expect(screen.getByText('부산점')).toBeInTheDocument();
    expect(screen.getByText('총 2건 (마감 1건 / 신청가능 1건)')).toBeInTheDocument();
  });

  it('마감/신청가능 필터 토글이 목록을 걸러낸다', async () => {
    vi.stubGlobal('fetch', mockFetch([OPEN_ROW, CLOSED_ROW]));

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
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ error: '조회 실패' }) } as Response))
    );

    render(<HomeplusLectureListPanel />);
    fireEvent.click(screen.getByText('조회하기'));

    expect(await screen.findByText('조회 실패')).toBeInTheDocument();
  });
});
