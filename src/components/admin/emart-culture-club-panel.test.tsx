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
  class_material_fee: null,
  min_class_capacity: 1,
  class_start_date: '20261003',
  class_end_date: '20261003',
  register_start_date: '202608101000',
  register_end_date: '20261130',
  filter_status: '접수중' as const,
  is_excluded: false,
  collected_at: '2026-10-03T00:00:00.000Z',
  class_detail_title: '상세 제목',
  class_detail_content: '상세 설명 내용입니다.',
  main_image_bucket: 'test-bucket',
  main_image_region: 'ap-northeast-2',
  main_image_key: 'category/4/404/test-key',
  detail_fetched_at: '2026-10-03T01:00:00.000Z',
};

function mockFetch(rows: unknown[], total: number) {
  return vi.fn((_url: string) => Promise.resolve({ ok: true, json: () => Promise.resolve({ rows, total }) } as Response));
}

function mockFetchRouter({ rows, total, patchOk = true }: { rows: unknown[]; total: number; patchOk?: boolean }) {
  const patchSpy = vi.fn((_url: string, _init?: RequestInit) =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(patchOk ? { ok: true } : { error: '제외 처리 실패' }) } as Response)
  );
  const fn = vi.fn((_url: string, init?: RequestInit) => {
    if (init?.method === 'PATCH') return patchSpy(_url, init);
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ rows, total }) } as Response);
  });
  return { fn, patchSpy };
}

describe('EmartCultureClubPanel', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('마운트 시 자동 조회하지 않고, 조회하기를 눌러야 목록을 가져온다', async () => {
    vi.stubGlobal('fetch', mockFetch([ROW], 1));

    render(<EmartCultureClubPanel />);
    expect(screen.getByText("카테고리/상태/지점을 선택하고 '조회하기'를 눌러 수집 결과를 불러오세요.")).toBeInTheDocument();

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
    // 마운트 시 지점 목록도 함께 조회해(/api/culture-club/stores) 호출이
    // 2건이 된다 — 쿼리 파라미터가 실제로 붙는 "조회하기" 클릭발 호출(마지막
    // 호출)만 검사한다.
    const calledUrl = fetchMock.mock.calls.at(-1)?.[0] as string;
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

  // [수동 노출 제외](2026-10-03 사용자 지시): "화면에 노출 배제할꺼 수동으로
  // 체크할수 있어? ... Club Original은 섞여있어서 어른께 더 많은편이야"
  describe('노출 제외 체크박스', () => {
    it('체크하면 PATCH로 class_id/is_excluded를 전송한다', async () => {
      const { fn, patchSpy } = mockFetchRouter({ rows: [ROW], total: 1 });
      vi.stubGlobal('fetch', fn);

      render(<EmartCultureClubPanel />);
      fireEvent.click(screen.getByText('조회하기'));
      const checkbox = await screen.findByRole('checkbox', { name: '키즈 댄스 클래스 노출 제외' });

      fireEvent.click(checkbox);

      expect(patchSpy).toHaveBeenCalledWith(
        '/api/admin/emart-culture-club',
        expect.objectContaining({ body: JSON.stringify({ class_id: 'abc123', is_excluded: true }) })
      );
      expect(checkbox).toBeChecked();
    });

    it('PATCH 실패 시 체크 상태를 되돌리고 에러 메시지를 보여준다', async () => {
      const { fn } = mockFetchRouter({ rows: [ROW], total: 1, patchOk: false });
      vi.stubGlobal('fetch', fn);

      render(<EmartCultureClubPanel />);
      fireEvent.click(screen.getByText('조회하기'));
      const checkbox = await screen.findByRole('checkbox', { name: '키즈 댄스 클래스 노출 제외' });

      fireEvent.click(checkbox);

      await screen.findByText(/노출 제외 처리 실패/);
      expect(checkbox).not.toBeChecked();
    });

    it('이미 제외된 강좌는 체크박스가 체크된 채로 표시되고 취소선이 적용된다', async () => {
      vi.stubGlobal('fetch', mockFetch([{ ...ROW, is_excluded: true }], 1));

      render(<EmartCultureClubPanel />);
      fireEvent.click(screen.getByText('조회하기'));

      const checkbox = await screen.findByRole('checkbox', { name: '키즈 댄스 클래스 노출 제외' });
      expect(checkbox).toBeChecked();
      expect(screen.getByText('키즈 댄스 클래스')).toHaveClass('line-through');
    });
  });

  // [상세보기](2026-10-03 사용자 지시): "상세데이터 가져왔다는데 볼수가없네..
  // 각 row 누르면 상세데이터 볼수있도록 해줘"
  describe('상세보기 모달', () => {
    it('행을 누르면 상세 모달이 열리고 상세설명을 보여준다', async () => {
      vi.stubGlobal('fetch', mockFetch([ROW], 1));

      render(<EmartCultureClubPanel />);
      fireEvent.click(screen.getByText('조회하기'));
      fireEvent.click(await screen.findByText('키즈 댄스 클래스'));

      expect(await screen.findByText('상세 제목')).toBeInTheDocument();
      expect(screen.getByText('상세 설명 내용입니다.')).toBeInTheDocument();
    });

    it('체크박스를 눌러도 모달이 열리지 않는다(이벤트 버블링 방지)', async () => {
      vi.stubGlobal('fetch', mockFetch([ROW], 1));

      render(<EmartCultureClubPanel />);
      fireEvent.click(screen.getByText('조회하기'));
      const checkbox = await screen.findByRole('checkbox', { name: '키즈 댄스 클래스 노출 제외' });
      fireEvent.click(checkbox);

      expect(screen.queryByText('상세 설명 내용입니다.')).not.toBeInTheDocument();
    });

    it('아직 상세정보가 수집되지 않은 강좌는 안내 문구를 보여준다', async () => {
      vi.stubGlobal('fetch', mockFetch([{ ...ROW, detail_fetched_at: null, class_detail_content: null }], 1));

      render(<EmartCultureClubPanel />);
      fireEvent.click(screen.getByText('조회하기'));
      fireEvent.click(await screen.findByText('키즈 댄스 클래스'));

      expect(await screen.findByText(/아직 상세정보가 수집되지 않았습니다/)).toBeInTheDocument();
    });

    it('✕ 버튼을 누르면 모달이 닫힌다', async () => {
      vi.stubGlobal('fetch', mockFetch([ROW], 1));

      render(<EmartCultureClubPanel />);
      fireEvent.click(screen.getByText('조회하기'));
      fireEvent.click(await screen.findByText('키즈 댄스 클래스'));
      await screen.findByText('상세 설명 내용입니다.');

      fireEvent.click(screen.getByText('✕'));

      expect(screen.queryByText('상세 설명 내용입니다.')).not.toBeInTheDocument();
    });
  });
});
