import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SpotDedupPanel } from './spot-dedup-panel';

// [개선사항10 - 관리자 '중복 스팟 그룹핑 및 매핑' 탭](2026-09-04 todo.md): 다른
// 자기완결적 관리자 패널(SpotCurationsPanel 등)과 동일하게 탭 진입 시 자동 조회하지
// 않고, "📥 불러오기"를 눌러야 조회한다(관리자 페이지 성능 최적화 관례).
//
// [2026-09-05 페이지네이션 도입] "/api/admin/spot-dedup/groups"는 더 이상 미리 합친
// groups를 돌려주지 않고, 원시 후보 행(candidates) + next_cursor/has_more를
// 돌려준다 — 그룹 병합(Union-Find)은 클라이언트가 누적된 candidates로 계산한다.
const CATEGORY_MIN_OPTIONS = ['공원', '어린이놀이터'];

function renderPanel() {
  return render(<SpotDedupPanel categoryMinOptions={CATEGORY_MIN_OPTIONS} />);
}

function mockFetchByUrl(handlers: {
  categories?: unknown;
  groupsPages?: Record<string, unknown>; // key: 'initial' | after 커서 값
  apply?: unknown;
  bulkPreview?: unknown;
  bulkApply?: unknown;
}) {
  return vi.fn((url: string, init?: RequestInit) => {
    if (url.includes('/api/admin/service-categories')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(handlers.categories ?? { items: [] }) } as Response);
    }
    if (url.includes('/api/admin/spot-dedup/groups')) {
      const afterMatch = url.match(/after=([^&]+)/);
      const key = afterMatch ? decodeURIComponent(afterMatch[1]) : 'initial';
      const page = handlers.groupsPages?.[key] ?? { candidates: [], next_cursor: null, has_more: false };
      return Promise.resolve({ ok: true, json: () => Promise.resolve(page) } as Response);
    }
    if (url.includes('/api/admin/spot-dedup/apply')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(handlers.apply ?? { group_id: 'g-1', updated_count: 2 }) } as Response);
    }
    if (url.includes('/api/admin/open-spaces/bulk-category-mapping')) {
      if (!init || init.method === undefined) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(handlers.bulkPreview ?? { matching_count: 0 }) } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(handlers.bulkApply ?? { updated_count: 0 }) } as Response);
    }
    return Promise.reject(new Error(`unexpected fetch: ${url}`));
  });
}

function candidateRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'a',
    name: '행복놀이터',
    category: 'PARK',
    category_min: '공원',
    address: '경기도 성남시 분당구 1',
    normalized_address: 'x',
    lat: 37.3,
    lng: 127.1,
    ...overrides,
  };
}

describe('SpotDedupPanel', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('진입 시 자동으로 조회하지 않고, "불러오기"를 눌러야 각 영역이 조회된다', () => {
    vi.stubGlobal('fetch', mockFetchByUrl({}));
    renderPanel();

    expect(screen.getAllByText('📥 불러오기')).toHaveLength(2); // 중분류 영역 + 그룹 영역
    expect(screen.queryByText('현재 중복 의심 그룹이 없습니다.')).not.toBeInTheDocument();
  });

  it('중분류 불러오기를 누르면 목록을 보여준다', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchByUrl({ categories: { items: [{ id: 'c1', parent_category: '문화시설', category_name: '어린이 도서관' }] } })
    );
    renderPanel();

    fireEvent.click(screen.getAllByText('📥 불러오기')[0]);

    await waitFor(() => expect(screen.getAllByText('문화시설 > 어린이 도서관').length).toBeGreaterThan(0));
  });

  it('새 중분류를 추가하면 목록에 즉시 반영된다', async () => {
    const fetchMock = mockFetchByUrl({
      categories: { items: [] },
    });
    vi.stubGlobal('fetch', fetchMock);
    renderPanel();
    fireEvent.click(screen.getAllByText('📥 불러오기')[0]);
    await waitFor(() => expect(screen.queryByText('문화시설 > 어린이 도서관')).not.toBeInTheDocument());

    fetchMock.mockImplementationOnce(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ item: { id: 'new-1', parent_category: '자연/공원', category_name: '야외 물놀이터' } }) } as Response)
    );
    fireEvent.change(screen.getByPlaceholderText('새 중분류명 (예: 야외 물놀이터)'), { target: { value: '야외 물놀이터' } });
    fireEvent.click(screen.getByText('+ 추가'));

    await waitFor(() => expect(screen.getAllByText('자연/공원 > 야외 물놀이터').length).toBeGreaterThan(0));
  });

  it('그룹 불러오기를 누르면 첫 페이지 후보로 그룹을 계산해 라벨로 보여주고, 클릭하면 상세/매핑 모달이 열린다', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchByUrl({
        groupsPages: {
          initial: {
            candidates: [candidateRow({ id: 'a' }), candidateRow({ id: 'b', name: '행복놀이터(구)', address: '경기도 성남시 분당구 1-1' })],
            next_cursor: 'b',
            has_more: false,
          },
        },
      })
    );
    renderPanel();

    fireEvent.click(screen.getAllByText('📥 불러오기')[1]);

    const groupButton = await screen.findByText(/행복놀이터 외 1건/);
    fireEvent.click(groupButton);

    expect(screen.getByText('중복 의심 그룹 검수 (2건)')).toBeInTheDocument();
    expect(screen.getByText('행복놀이터')).toBeInTheDocument();
    expect(screen.getByText('행복놀이터(구)')).toBeInTheDocument();
  });

  it('has_more가 true면 "다음 50건 더 스캔하기" 버튼이 보이고, 누르면 다음 페이지 후보를 이어붙여 그룹을 다시 계산한다', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchByUrl({
        groupsPages: {
          // 좌표는 서로 멀리 떨어뜨려(lat 차이 약 1도 ≈ 111km) 이 테스트가 순수하게
          // "같은 normalized_address" 기준의 페이지 간 병합만 검증하도록 한다.
          initial: {
            candidates: [candidateRow({ id: 'a', normalized_address: 'addr-1', lat: 37.3, lng: 127.1 })],
            next_cursor: 'a',
            has_more: true,
          },
          a: {
            candidates: [candidateRow({ id: 'b', name: '행복놀이터(구)', normalized_address: 'addr-1', lat: 38.3, lng: 127.1 })],
            next_cursor: 'b',
            has_more: false,
          },
        },
      })
    );
    renderPanel();

    fireEvent.click(screen.getAllByText('📥 불러오기')[1]);
    expect(await screen.findByText('다음 50건 더 스캔하기')).toBeInTheDocument();
    // 페이지 1건만으로는 아직 "중복 의심"이 성립하지 않아(그룹 최소 2건) 목록에 없다.
    expect(screen.queryByText(/행복놀이터/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('다음 50건 더 스캔하기'));

    // 두 페이지 후보(같은 normalized_address)가 합쳐져 이제 그룹 하나로 보인다.
    expect(await screen.findByText(/행복놀이터 외 1건/)).toBeInTheDocument();
    expect(screen.queryByText('다음 50건 더 스캔하기')).not.toBeInTheDocument(); // has_more=false
  });

  it('그룹 상세에서 표준 정보를 입력하고 저장하면 apply API를 호출하고, 목록에서 제거된 뒤 모달이 닫힌다', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchByUrl({
        groupsPages: {
          initial: {
            candidates: [candidateRow({ id: 'a' }), candidateRow({ id: 'b', name: '행복놀이터(구)', address: '경기도 성남시 분당구 1-1' })],
            next_cursor: 'b',
            has_more: false,
          },
        },
      })
    );
    renderPanel();
    fireEvent.click(screen.getAllByText('📥 불러오기')[1]);
    fireEvent.click(await screen.findByText(/행복놀이터 외 1건/));

    const nameInput = screen.getByPlaceholderText('원본 이름을 참고해 깔끔하게 입력');
    fireEvent.change(nameInput, { target: { value: '행복동네놀이터' } });
    fireEvent.click(screen.getByText(/저장 및 일괄 적용/));

    await waitFor(() => expect(screen.queryByText('중복 의심 그룹 검수 (2건)')).not.toBeInTheDocument());
    expect(screen.queryByText(/행복놀이터 외 1건/)).not.toBeInTheDocument();
  });

  // [노출 중분류 대량 매핑](2026-09-05 사용자 지시): "현재 open_spaces에서 이 노출
  // 중분류 매핑할 수 있도록 개선해줘. 그리고 대량의 데이터도 한꺼번에..."
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

      fireEvent.change(screen.getByDisplayValue('원본 중분류 선택'), { target: { value: '공원' } });
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

      fireEvent.click(screen.getAllByText('📥 불러오기')[0]); // 노출 중분류 목록 로드
      await waitFor(() => expect(screen.getAllByText('자연/공원 > 대형 근린공원 / 잔디광장').length).toBeGreaterThan(0));

      fireEvent.change(screen.getByDisplayValue('원본 중분류 선택'), { target: { value: '공원' } });
      fireEvent.change(screen.getByDisplayValue('노출 중분류 선택'), { target: { value: 'svc-1' } });
      fireEvent.click(screen.getByText('일괄 매핑 적용'));

      expect(confirmSpy).toHaveBeenCalled();
      expect(await screen.findByText('25531건에 노출 중분류를 반영했습니다.')).toBeInTheDocument();

      const applyCall = fetchMock.mock.calls.find((c) => (c[0] as string).includes('/api/admin/open-spaces/bulk-category-mapping') && c[1]);
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

      fireEvent.click(screen.getAllByText('📥 불러오기')[0]);
      await waitFor(() => expect(screen.getAllByText('자연/공원 > 대형 근린공원 / 잔디광장').length).toBeGreaterThan(0));

      fireEvent.change(screen.getByDisplayValue('원본 중분류 선택'), { target: { value: '공원' } });
      fireEvent.change(screen.getByDisplayValue('노출 중분류 선택'), { target: { value: 'svc-1' } });
      fetchMock.mockClear();
      fireEvent.click(screen.getByText('일괄 매핑 적용'));

      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
