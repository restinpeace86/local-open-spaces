import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CategoryMappingPanel } from './category-mapping-panel';

// [노출 중분류 매핑/중복 스팟 검수 탭 분리](2026-09-05 사용자 지시): "중분류 매핑과
// 중복 스팟 검수 탭을 분리해라" — 기존 spot-dedup-panel.test.tsx에 있던 "노출 중분류
// 관리"/"노출 중분류 대량 매핑" 테스트를 그대로 옮기고, 신규 요구사항("원본 중분류의
// 데이터들의 다건에 대하여 노출중분류로 다수 이동")에 대한 테스트를 추가한다.
const CATEGORY_MIN_OPTIONS = ['공원', '어린이놀이터'];

function renderPanel() {
  return render(<CategoryMappingPanel categoryMinOptions={CATEGORY_MIN_OPTIONS} />);
}

function mockFetchByUrl(handlers: {
  categories?: unknown;
  bulkPreview?: unknown;
  bulkApply?: unknown;
  dataGridRows?: unknown; // GET /api/admin/data-grid 응답(RowPicker 조회용)
  rowsApply?: unknown; // POST /api/admin/open-spaces/bulk-category-mapping { ids } 응답
  deleteOk?: boolean; // DELETE /api/admin/service-categories 성공 여부(기본 true)
  deleteError?: string; // deleteOk가 false일 때 응답 error 문구
}) {
  return vi.fn((url: string, init?: RequestInit) => {
    if (url.includes('/api/admin/service-categories')) {
      if (init?.method === 'DELETE') {
        const ok = handlers.deleteOk !== false;
        return Promise.resolve({
          ok,
          json: () => Promise.resolve(ok ? { ok: true } : { error: handlers.deleteError ?? '삭제 실패' }),
        } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(handlers.categories ?? { items: [] }) } as Response);
    }
    if (url.includes('/api/admin/data-grid')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(handlers.dataGridRows ?? { table: 'open_spaces', rows: [], total: 0, page: 1, pageSize: 50 }),
      } as Response);
    }
    if (url.includes('/api/admin/open-spaces/bulk-category-mapping')) {
      if (!init || init.method === undefined) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(handlers.bulkPreview ?? { matching_count: 0 }) } as Response);
      }
      const body = JSON.parse((init.body as string) ?? '{}');
      if (Array.isArray(body.ids)) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(handlers.rowsApply ?? { updated_count: body.ids.length }) } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(handlers.bulkApply ?? { updated_count: 0 }) } as Response);
    }
    return Promise.reject(new Error(`unexpected fetch: ${url}`));
  });
}

describe('CategoryMappingPanel', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('진입 시 자동으로 조회하지 않고, "불러오기"를 눌러야 노출 중분류 목록이 조회된다', () => {
    vi.stubGlobal('fetch', mockFetchByUrl({}));
    renderPanel();

    expect(screen.getByText('📥 불러오기')).toBeInTheDocument();
  });

  it('중분류 불러오기를 누르면 목록을 보여준다', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchByUrl({ categories: { items: [{ id: 'c1', parent_category: '문화시설', category_name: '어린이 도서관' }] } })
    );
    renderPanel();

    fireEvent.click(screen.getByText('📥 불러오기'));

    await waitFor(() => expect(screen.getAllByText('문화시설 > 어린이 도서관').length).toBeGreaterThan(0));
  });

  it('새 중분류를 추가하면 목록에 즉시 반영된다', async () => {
    const fetchMock = mockFetchByUrl({ categories: { items: [] } });
    vi.stubGlobal('fetch', fetchMock);
    renderPanel();
    fireEvent.click(screen.getByText('📥 불러오기'));
    await waitFor(() => expect(screen.queryByText('문화시설 > 어린이 도서관')).not.toBeInTheDocument());

    fetchMock.mockImplementationOnce(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ item: { id: 'new-1', parent_category: '자연/공원', category_name: '야외 물놀이터' } }) } as Response)
    );
    fireEvent.change(screen.getByPlaceholderText('새 중분류명 (예: 야외 물놀이터)'), { target: { value: '야외 물놀이터' } });
    fireEvent.click(screen.getByText('+ 추가'));

    await waitFor(() => expect(screen.getAllByText('자연/공원 > 야외 물놀이터').length).toBeGreaterThan(0));
  });

  // [노출 중분류 삭제](2026-09-05 사용자 지시): "노출 중분류 기존거 삭제도 가능하도록
  // 해줘.. 동물 먹이주기 체험농장하고 자연 체험장 분류하기 어렵네."
  describe('노출 중분류 삭제', () => {
    it('삭제 버튼을 눌러 확인하면 DELETE를 호출하고 목록에서 제거한다', async () => {
      const fetchMock = mockFetchByUrl({
        categories: { items: [{ id: 'c1', parent_category: '농장/체험', category_name: '동물 먹이주기 체험농장' }] },
      });
      vi.stubGlobal('fetch', fetchMock);
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      renderPanel();

      fireEvent.click(screen.getByText('📥 불러오기'));
      // 같은 라벨이 칩(span)과 "노출 중분류 대량 매핑" select의 옵션에도 함께 나타나
      // exact getByText는 항상 모호하다 — getAllByText로 존재 여부만 먼저 확인한다.
      await waitFor(() => expect(screen.getAllByText('농장/체험 > 동물 먹이주기 체험농장').length).toBeGreaterThan(0));

      fireEvent.click(screen.getByLabelText('농장/체험 > 동물 먹이주기 체험농장 삭제'));

      await waitFor(() => expect(screen.queryAllByText('농장/체험 > 동물 먹이주기 체험농장')).toHaveLength(0));
      const deleteCall = fetchMock.mock.calls.find(
        (c) => (c[0] as string).includes('/api/admin/service-categories') && c[1]?.method === 'DELETE'
      );
      expect(deleteCall![0]).toContain('id=c1');
    });

    it('확인창에서 취소하면 삭제 API를 호출하지 않는다', async () => {
      const fetchMock = mockFetchByUrl({
        categories: { items: [{ id: 'c1', parent_category: '농장/체험', category_name: '동물 먹이주기 체험농장' }] },
      });
      vi.stubGlobal('fetch', fetchMock);
      vi.spyOn(window, 'confirm').mockReturnValue(false);
      renderPanel();

      fireEvent.click(screen.getByText('📥 불러오기'));
      await waitFor(() => expect(screen.getAllByText('농장/체험 > 동물 먹이주기 체험농장').length).toBeGreaterThan(0));
      fetchMock.mockClear();

      fireEvent.click(screen.getByLabelText('농장/체험 > 동물 먹이주기 체험농장 삭제'));

      expect(fetchMock).not.toHaveBeenCalled();
      expect(screen.getAllByText('농장/체험 > 동물 먹이주기 체험농장').length).toBeGreaterThan(0);
    });

    it('참조 중인 데이터가 있어 서버가 거부하면(409) 에러 문구를 보여주고 목록은 그대로 남는다', async () => {
      const fetchMock = mockFetchByUrl({
        categories: { items: [{ id: 'c1', parent_category: '농장/체험', category_name: '동물 먹이주기 체험농장' }] },
        deleteOk: false,
        deleteError: '이 노출 중분류를 참조하는 데이터가 12건 있어 삭제할 수 없습니다.',
      });
      vi.stubGlobal('fetch', fetchMock);
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      renderPanel();

      fireEvent.click(screen.getByText('📥 불러오기'));
      await waitFor(() => expect(screen.getAllByText('농장/체험 > 동물 먹이주기 체험농장').length).toBeGreaterThan(0));

      fireEvent.click(screen.getByLabelText('농장/체험 > 동물 먹이주기 체험농장 삭제'));

      expect(await screen.findByText('이 노출 중분류를 참조하는 데이터가 12건 있어 삭제할 수 없습니다.')).toBeInTheDocument();
      expect(screen.getAllByText('농장/체험 > 동물 먹이주기 체험농장').length).toBeGreaterThan(0);
    });
  });

  describe('노출 중분류 대량 매핑', () => {
    it('원본 중분류를 선택하지 않으면 미리보기를 눌러도 에러 문구를 보여준다', () => {
      vi.stubGlobal('fetch', mockFetchByUrl({}));
      renderPanel();

      const preview = screen.getByText('미리보기(대상 건수 확인)');
      expect(preview).toBeDisabled(); // 원본 중분류 미선택 시 버튼 자체가 비활성화
    });

    it('원본/노출 중분류를 고르고 미리보기를 누르면 대상 건수를 보여준다', async () => {
      vi.stubGlobal('fetch', mockFetchByUrl({ bulkPreview: { matching_count: 25531 } }));
      renderPanel();

      // RowPicker 섹션도 같은 라벨의 select를 항상 렌더링하므로(대량 매핑 select가
      // DOM상 먼저 온다), 배열 첫 번째로 정확히 대량 매핑 select만 짚는다.
      fireEvent.change(screen.getAllByDisplayValue('원본 중분류 선택')[0], { target: { value: '공원' } });
      fireEvent.click(screen.getByText('미리보기(대상 건수 확인)'));

      expect(await screen.findByText('대상 25,531건')).toBeInTheDocument();
    });

    it('일괄 매핑 적용을 누르면 확인창을 띄우고, 확인하면 API를 호출해 결과 건수를 보여준다', async () => {
      const fetchMock = mockFetchByUrl({
        categories: { items: [{ id: 'svc-1', parent_category: '자연/공원', category_name: '대형 근린공원 / 잔디광장' }] },
        bulkApply: { updated_count: 25531 },
      });
      vi.stubGlobal('fetch', fetchMock);
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
      renderPanel();

      fireEvent.click(screen.getByText('📥 불러오기'));
      await waitFor(() => expect(screen.getAllByText('자연/공원 > 대형 근린공원 / 잔디광장').length).toBeGreaterThan(0));

      // RowPicker 섹션도 같은 라벨의 select를 항상 렌더링하므로(대량 매핑 select가
      // DOM상 먼저 온다), 배열 첫 번째로 정확히 대량 매핑 select만 짚는다.
      fireEvent.change(screen.getAllByDisplayValue('원본 중분류 선택')[0], { target: { value: '공원' } });
      fireEvent.change(screen.getByDisplayValue('노출 중분류 선택'), { target: { value: 'svc-1' } });
      fireEvent.click(screen.getByText('일괄 매핑 적용'));

      expect(confirmSpy).toHaveBeenCalled();
      expect(await screen.findByText('25531건에 노출 중분류를 반영했습니다.')).toBeInTheDocument();

      const applyCall = fetchMock.mock.calls.find(
        (c) => (c[0] as string).includes('/api/admin/open-spaces/bulk-category-mapping') && c[1]
      );
      expect(applyCall).toBeDefined();
      expect(JSON.parse((applyCall![1] as RequestInit).body as string)).toEqual({
        category_min: '공원',
        service_category_id: 'svc-1',
        only_unmapped: true,
      });
    });

    it('확인창에서 취소하면 API를 호출하지 않는다', async () => {
      const fetchMock = mockFetchByUrl({
        categories: { items: [{ id: 'svc-1', parent_category: '자연/공원', category_name: '대형 근린공원 / 잔디광장' }] },
      });
      vi.stubGlobal('fetch', fetchMock);
      vi.spyOn(window, 'confirm').mockReturnValue(false);
      renderPanel();

      fireEvent.click(screen.getByText('📥 불러오기'));
      await waitFor(() => expect(screen.getAllByText('자연/공원 > 대형 근린공원 / 잔디광장').length).toBeGreaterThan(0));

      // RowPicker 섹션도 같은 라벨의 select를 항상 렌더링하므로(대량 매핑 select가
      // DOM상 먼저 온다), 배열 첫 번째로 정확히 대량 매핑 select만 짚는다.
      fireEvent.change(screen.getAllByDisplayValue('원본 중분류 선택')[0], { target: { value: '공원' } });
      fireEvent.change(screen.getByDisplayValue('노출 중분류 선택'), { target: { value: 'svc-1' } });
      fetchMock.mockClear();
      fireEvent.click(screen.getByText('일괄 매핑 적용'));

      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  // [row-level 다건 매핑](2026-09-05 사용자 지시): "현재 중분류 그냥 노출중분류로 전체
  // 선택하는거만 있는데.. 원본 중분류의 데이터들의 다건에 대하여 노출중분류로 다수
  // 이동과 관련된 기능도 있으면 좋겠다."
  describe('선택 항목 노출 중분류 매핑 (RowPicker)', () => {
    it('원본 중분류를 고르고 조회하면 행 목록을 체크박스로 보여준다', async () => {
      vi.stubGlobal(
        'fetch',
        mockFetchByUrl({
          dataGridRows: {
            table: 'open_spaces',
            rows: [
              { id: 'row-1', name: '행복놀이터', address: '경기도 성남시', category_min: '공원' },
              { id: 'row-2', name: '동네공원', address: '경기도 용인시', category_min: '공원' },
            ],
            total: 2,
            page: 1,
            pageSize: 50,
          },
        })
      );
      renderPanel();

      const selects = screen.getAllByText('원본 중분류 선택').map((el) => el.closest('select'));
      // 대량 매핑 select(첫 번째)와 RowPicker select(두 번째)가 라벨이 같아 순서로 구분한다.
      const rowPickerSelect = selects[1]!;
      fireEvent.change(rowPickerSelect, { target: { value: '공원' } });
      fireEvent.click(screen.getByText('조회'));

      expect(await screen.findByText('행복놀이터')).toBeInTheDocument();
      expect(screen.getByText('동네공원')).toBeInTheDocument();
    });

    it('행을 선택하고 노출 중분류를 골라 적용하면 확인 후 ids로 API를 호출한다', async () => {
      const fetchMock = mockFetchByUrl({
        categories: { items: [{ id: 'svc-1', parent_category: '자연/공원', category_name: '대형 근린공원 / 잔디광장' }] },
        dataGridRows: {
          rows: [
            { id: 'row-1', name: '행복놀이터', address: '경기도 성남시', category_min: '공원' },
            { id: 'row-2', name: '동네공원', address: '경기도 용인시', category_min: '공원' },
          ],
          total: 2,
          page: 1,
          pageSize: 50,
        },
        rowsApply: { updated_count: 1 },
      });
      vi.stubGlobal('fetch', fetchMock);
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
      renderPanel();

      fireEvent.click(screen.getByText('📥 불러오기'));
      await waitFor(() => expect(screen.getAllByText('자연/공원 > 대형 근린공원 / 잔디광장').length).toBeGreaterThan(0));

      const selects = screen.getAllByText('원본 중분류 선택').map((el) => el.closest('select'));
      fireEvent.change(selects[1]!, { target: { value: '공원' } });
      fireEvent.click(screen.getByText('조회'));
      await screen.findByText('행복놀이터');

      fireEvent.click(screen.getByLabelText('행복놀이터 선택'));

      const svcSelects = screen.getAllByText('노출 중분류 선택').map((el) => el.closest('select'));
      fireEvent.change(svcSelects[svcSelects.length - 1]!, { target: { value: 'svc-1' } });
      fireEvent.click(screen.getByText('선택 1건 적용'));

      expect(confirmSpy).toHaveBeenCalled();
      expect(await screen.findByText('1건에 노출 중분류를 반영했습니다.')).toBeInTheDocument();

      const applyCall = fetchMock.mock.calls.find((c) => {
        if (!(c[0] as string).includes('/api/admin/open-spaces/bulk-category-mapping') || !c[1]) return false;
        const body = JSON.parse((c[1] as RequestInit).body as string);
        return Array.isArray(body.ids);
      });
      expect(applyCall).toBeDefined();
      expect(JSON.parse((applyCall![1] as RequestInit).body as string)).toEqual({
        ids: ['row-1'],
        service_category_id: 'svc-1',
      });
    });

    it('선택 없이 적용 버튼을 누를 수 없다(비활성화)', async () => {
      vi.stubGlobal(
        'fetch',
        mockFetchByUrl({
          dataGridRows: {
            rows: [{ id: 'row-1', name: '행복놀이터', address: null, category_min: '공원' }],
            total: 1,
            page: 1,
            pageSize: 50,
          },
        })
      );
      renderPanel();

      const selects = screen.getAllByText('원본 중분류 선택').map((el) => el.closest('select'));
      fireEvent.change(selects[1]!, { target: { value: '공원' } });
      fireEvent.click(screen.getByText('조회'));
      await screen.findByText('행복놀이터');

      expect(screen.getByText('선택 0건 적용')).toBeDisabled();
    });
  });

  // [All-in-One 모바일 큐레이션 워크벤치](2026-09-05 사용자 지시): "리스트에 렌더링된
  // 특정 장소 카드/아이템을 클릭하면.. 워크벤치 화면으로 부드럽게 진입함." 워크벤치
  // 내부 동작 자체는 mobile-curation-workbench.test.tsx가 담당하고, 여기서는 진입
  // 연결만 확인한다.
  describe('워크벤치 진입 (All-in-One 모바일 큐레이션 워크벤치)', () => {
    function mockFetchWithWorkbenchDeps() {
      return vi.fn((url: string) => {
        if (url.includes('/api/admin/data-grid')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                rows: [
                  { id: 'row-1', name: '행복놀이터', address: '경기도 성남시', category_min: '공원', service_category_id: null },
                ],
                total: 1,
                page: 1,
                pageSize: 50,
              }),
          } as Response);
        }
        if (url.includes('/api/admin/spot-dedup/nearby')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) } as Response);
        }
        if (url.includes('/api/admin/spot-curations/blog-search')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [], hasRecentReview: false, hasNoResults: true }) } as Response);
        }
        if (url.includes('/api/admin/spot-curations')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ item: null }) } as Response);
        }
        return Promise.reject(new Error(`unexpected fetch: ${url}`));
      });
    }

    it('행 이름을 클릭하면 큐레이션 워크벤치가 열린다', async () => {
      vi.stubGlobal('fetch', mockFetchWithWorkbenchDeps());
      renderPanel();

      const selects = screen.getAllByText('원본 중분류 선택').map((el) => el.closest('select'));
      fireEvent.change(selects[1]!, { target: { value: '공원' } });
      fireEvent.click(screen.getByText('조회'));
      await screen.findByText('행복놀이터');

      fireEvent.click(screen.getByText('행복놀이터'));

      expect(await screen.findByText('🧰 큐레이션 워크벤치')).toBeInTheDocument();
    });

    it('워크벤치를 닫으면 목록 화면으로 돌아온다', async () => {
      vi.stubGlobal('fetch', mockFetchWithWorkbenchDeps());
      renderPanel();

      const selects = screen.getAllByText('원본 중분류 선택').map((el) => el.closest('select'));
      fireEvent.change(selects[1]!, { target: { value: '공원' } });
      fireEvent.click(screen.getByText('조회'));
      await screen.findByText('행복놀이터');
      fireEvent.click(screen.getByText('행복놀이터'));
      await screen.findByText('🧰 큐레이션 워크벤치');

      fireEvent.click(screen.getByLabelText('닫기'));

      await waitFor(() => expect(screen.queryByText('🧰 큐레이션 워크벤치')).not.toBeInTheDocument());
    });
  });
});
