import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { EmartCultureClubPanel } from './emart-culture-club-panel';

// [이마트 컬처클럽 강좌 리스트 — data-grid 탭](2026-10-03 사용자 지시): 다른
// 자기완결 패널과 동일한 관례(마운트 시 자동 조회 안 함, "조회하기" 버튼으로
// 시작) — 목록 조회, 카테고리/상태 필터 쿼리 파라미터 전달을 검증한다.
const ROW = {
  id: 1,
  class_id: 'abc123',
  class_title: '키즈 댄스 클래스',
  class_day: ['화'],
  start_time: '1400',
  end_time: '1500',
  sub_category_name: 'Kids & Children',
  store_name: '강서',
  class_fee: 50000,
  class_capacity: 10,
  occupied_full_flag: false,
  semester: '가을',
  semester_year: '2026',
  register_start_date: '202608101000',
  register_end_date: '20261130',
  filter_status: '접수중' as const,
  collected_at: '2026-10-03T00:00:00.000Z',
};

function mockFetch(rows: unknown[], total: number) {
  return vi.fn((_url: string) => Promise.resolve({ ok: true, json: () => Promise.resolve({ rows, total }) } as Response));
}

describe('EmartCultureClubPanel', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('마운트 시 자동 조회하지 않고, 조회하기를 눌러야 목록을 가져온다', async () => {
    vi.stubGlobal('fetch', mockFetch([ROW], 1));

    render(<EmartCultureClubPanel />);
    expect(screen.getByText("카테고리/상태를 선택하고 '조회하기'를 눌러 수집 결과를 불러오세요.")).toBeInTheDocument();

    fireEvent.click(screen.getByText('조회하기'));

    expect(await screen.findByText('키즈 댄스 클래스')).toBeInTheDocument();
    expect(screen.getByText('총 1건')).toBeInTheDocument();
  });

  it('카테고리/상태 필터를 선택하면 쿼리 파라미터로 전달한다', async () => {
    const fetchMock = mockFetch([ROW], 1);
    vi.stubGlobal('fetch', fetchMock);

    render(<EmartCultureClubPanel />);
    fireEvent.change(screen.getByDisplayValue('전체 카테고리'), { target: { value: '404' } });
    fireEvent.change(screen.getByDisplayValue('전체 상태'), { target: { value: '접수중' } });
    fireEvent.click(screen.getByText('조회하기'));

    await screen.findByText('키즈 댄스 클래스');
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain('sub_category_code=404');
    expect(calledUrl).toContain('filter_status=%EC%A0%91%EC%88%98%EC%A4%91');
  });

  it('전체 건수가 표시 건수보다 많으면 안내 문구를 보여준다', async () => {
    vi.stubGlobal('fetch', mockFetch([ROW], 6516));

    render(<EmartCultureClubPanel />);
    fireEvent.click(screen.getByText('조회하기'));

    expect(await screen.findByText(/총 6,516건 중 최신 1건 표시/)).toBeInTheDocument();
  });

  it('조회 실패 시 에러 메시지를 보여준다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ error: '조회 실패' }) } as Response))
    );

    render(<EmartCultureClubPanel />);
    fireEvent.click(screen.getByText('조회하기'));

    expect(await screen.findByText('조회 실패')).toBeInTheDocument();
  });

  it('정원마감 상태는 "대기접수 가능"으로 표시한다', async () => {
    vi.stubGlobal('fetch', mockFetch([{ ...ROW, filter_status: '정원마감' }], 1));

    render(<EmartCultureClubPanel />);
    fireEvent.click(screen.getByText('조회하기'));

    expect(await screen.findByText('대기접수 가능')).toBeInTheDocument();
  });
});
