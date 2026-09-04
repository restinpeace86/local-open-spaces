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
function mockFetchByUrl(handlers: {
  categories?: unknown;
  groupsPages?: Record<string, unknown>; // key: 'initial' | after 커서 값
  apply?: unknown;
}) {
  return vi.fn((url: string) => {
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
    proximity_cluster_id: 1,
    ...overrides,
  };
}

describe('SpotDedupPanel', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('진입 시 자동으로 조회하지 않고, "불러오기"를 눌러야 각 영역이 조회된다', () => {
    vi.stubGlobal('fetch', mockFetchByUrl({}));
    render(<SpotDedupPanel />);

    expect(screen.getAllByText('📥 불러오기')).toHaveLength(2); // 중분류 영역 + 그룹 영역
    expect(screen.queryByText('현재 중복 의심 그룹이 없습니다.')).not.toBeInTheDocument();
  });

  it('중분류 불러오기를 누르면 목록을 보여준다', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchByUrl({ categories: { items: [{ id: 'c1', parent_category: '문화시설', category_name: '어린이 도서관' }] } })
    );
    render(<SpotDedupPanel />);

    fireEvent.click(screen.getAllByText('📥 불러오기')[0]);

    expect(await screen.findByText('문화시설 > 어린이 도서관')).toBeInTheDocument();
  });

  it('새 중분류를 추가하면 목록에 즉시 반영된다', async () => {
    const fetchMock = mockFetchByUrl({
      categories: { items: [] },
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<SpotDedupPanel />);
    fireEvent.click(screen.getAllByText('📥 불러오기')[0]);
    await waitFor(() => expect(screen.queryByText('문화시설 > 어린이 도서관')).not.toBeInTheDocument());

    fetchMock.mockImplementationOnce(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ item: { id: 'new-1', parent_category: '자연/공원', category_name: '야외 물놀이터' } }) } as Response)
    );
    fireEvent.change(screen.getByPlaceholderText('새 중분류명 (예: 야외 물놀이터)'), { target: { value: '야외 물놀이터' } });
    fireEvent.click(screen.getByText('+ 추가'));

    expect(await screen.findByText('자연/공원 > 야외 물놀이터')).toBeInTheDocument();
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
    render(<SpotDedupPanel />);

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
          initial: { candidates: [candidateRow({ id: 'a', normalized_address: 'addr-1', proximity_cluster_id: null })], next_cursor: 'a', has_more: true },
          a: {
            candidates: [candidateRow({ id: 'b', name: '행복놀이터(구)', normalized_address: 'addr-1', proximity_cluster_id: null })],
            next_cursor: 'b',
            has_more: false,
          },
        },
      })
    );
    render(<SpotDedupPanel />);

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
    render(<SpotDedupPanel />);
    fireEvent.click(screen.getAllByText('📥 불러오기')[1]);
    fireEvent.click(await screen.findByText(/행복놀이터 외 1건/));

    const nameInput = screen.getByPlaceholderText('원본 이름을 참고해 깔끔하게 입력');
    fireEvent.change(nameInput, { target: { value: '행복동네놀이터' } });
    fireEvent.click(screen.getByText(/저장 및 일괄 적용/));

    await waitFor(() => expect(screen.queryByText('중복 의심 그룹 검수 (2건)')).not.toBeInTheDocument());
    expect(screen.queryByText(/행복놀이터 외 1건/)).not.toBeInTheDocument();
  });
});
