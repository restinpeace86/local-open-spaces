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
//
// [노출 중분류 매핑/중복 스팟 검수 탭 분리](2026-09-05 사용자 지시): "중분류 매핑과
// 중복 스팟 검수 탭을 분리해라" — "노출 중분류 관리"/"노출 중분류 대량 매핑" 테스트는
// category-mapping-panel.test.tsx로 옮겼다. 이 파일은 이제 중복 의심 그룹 검수/병합만
// 다룬다. 그룹 병합 모달(GroupDetailModal)이 여전히 "노출 중분류" 선택 드롭다운을 쓰므로
// serviceCategories 조회(GET /api/admin/service-categories)는 계속 이 패널 안에서도
// 필요하다 — 다만 눈에 보이는 "관리" UI 없이, 그룹을 불러올 때 조용히 함께 조회된다.
function renderPanel() {
  return render(<SpotDedupPanel />);
}

function mockFetchByUrl(handlers: {
  categories?: unknown;
  groupsPages?: Record<string, unknown>; // key: 'initial' | after 커서 값
  apply?: unknown;
  pendingGroups?: unknown; // GET /pending-groups 응답
}) {
  return vi.fn((url: string, init?: RequestInit) => {
    if (url.includes('/api/admin/service-categories')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(handlers.categories ?? { items: [] }) } as Response);
    }
    if (url.includes('/api/admin/spot-dedup/pending-groups')) {
      // [중복 스팟 검수 — 진행 상태 임시 저장](2026-09-05 사용자 지시) POST(그룹 열기/무시)와
      // DELETE(삭제)는 화면 흐름을 막지 않는 부수 효과라 단순 성공 응답만 흉내 낸다 —
      // 실제 저장 여부/바디는 각 테스트가 fetchMock.mock.calls로 직접 검증한다.
      if (init?.method === 'POST') {
        const body = JSON.parse((init.body as string) ?? '{}');
        const groupKey = [...(body.member_spot_ids ?? [])].sort().join(',');
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ group_key: groupKey }) } as Response);
      }
      if (init?.method === 'DELETE') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(handlers.pendingGroups ?? { items: [] }) } as Response);
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

    expect(screen.getAllByText('📥 불러오기')).toHaveLength(2); // 그룹 영역 + 진행 중 저장된 그룹 영역
    expect(screen.queryByText('현재 중복 의심 그룹이 없습니다.')).not.toBeInTheDocument();
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

    fireEvent.click(screen.getAllByText('📥 불러오기')[0]);

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

    fireEvent.click(screen.getAllByText('📥 불러오기')[0]);
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
    fireEvent.click(screen.getAllByText('📥 불러오기')[0]);
    fireEvent.click(await screen.findByText(/행복놀이터 외 1건/));

    const nameInput = screen.getByPlaceholderText('원본 이름을 참고해 깔끔하게 입력');
    fireEvent.change(nameInput, { target: { value: '행복동네놀이터' } });
    fireEvent.click(screen.getByText(/저장 및 일괄 적용/));

    await waitFor(() => expect(screen.queryByText('중복 의심 그룹 검수 (2건)')).not.toBeInTheDocument());
    expect(screen.queryByText(/행복놀이터 외 1건/)).not.toBeInTheDocument();
  });

  it('그룹을 불러오면 그룹 병합 모달용 노출 중분류 목록도 함께(조용히) 조회한다', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchByUrl({
        categories: { items: [{ id: 'svc-1', parent_category: '자연/공원', category_name: '대형 근린공원 / 잔디광장' }] },
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
    fireEvent.click(screen.getAllByText('📥 불러오기')[0]);
    fireEvent.click(await screen.findByText(/행복놀이터 외 1건/));

    expect(await screen.findByText('자연/공원 > 대형 근린공원 / 잔디광장')).toBeInTheDocument();
  });

  // [중복 스팟 검수 — 진행 상태 임시 저장](2026-09-05 사용자 지시): "따로 저장해주는
  // 테이블 신규 생성하던가.. 상태 변경중이라던가 status 구분자로 진행중해놓던가..."
  describe('진행 상태 임시 저장 (pending groups)', () => {
    function groupsPagesWithOneGroup() {
      return {
        initial: {
          candidates: [candidateRow({ id: 'a' }), candidateRow({ id: 'b', name: '행복놀이터(구)', address: '경기도 성남시 분당구 1-1' })],
          next_cursor: 'b',
          has_more: false,
        },
      };
    }

    it('그룹을 열면 in_progress로 임시 저장한다', async () => {
      const fetchMock = mockFetchByUrl({ groupsPages: groupsPagesWithOneGroup() });
      vi.stubGlobal('fetch', fetchMock);
      renderPanel();

      fireEvent.click(screen.getAllByText('📥 불러오기')[0]);
      fireEvent.click(await screen.findByText(/행복놀이터 외 1건/));

      expect(screen.getByText('중복 의심 그룹 검수 (2건)')).toBeInTheDocument();
      await waitFor(() => {
        const call = fetchMock.mock.calls.find((c) => (c[0] as string).includes('/pending-groups') && c[1]?.method === 'POST');
        expect(call).toBeDefined();
        expect(JSON.parse((call![1] as RequestInit).body as string)).toEqual({
          member_spot_ids: ['a', 'b'],
          status: 'in_progress',
        });
      });
    });

    it('"중복 아님"을 누르면 ignored로 저장하고 목록에서 즉시 사라진다', async () => {
      const fetchMock = mockFetchByUrl({ groupsPages: groupsPagesWithOneGroup() });
      vi.stubGlobal('fetch', fetchMock);
      renderPanel();

      fireEvent.click(screen.getAllByText('📥 불러오기')[0]);
      await screen.findByText(/행복놀이터 외 1건/);
      fireEvent.click(screen.getByText('🙈 중복 아님'));

      await waitFor(() => {
        const call = fetchMock.mock.calls.find((c) => (c[0] as string).includes('/pending-groups') && c[1]?.method === 'POST');
        expect(JSON.parse((call![1] as RequestInit).body as string)).toEqual({
          member_spot_ids: ['a', 'b'],
          status: 'ignored',
        });
      });
      expect(screen.queryByText(/행복놀이터 외 1건/)).not.toBeInTheDocument();
    });

    it('진행 중 저장된 그룹 불러오기를 누르면 서버 목록을 보여주고, "이어서 검수"를 누르면 모달이 열린다', async () => {
      const fetchMock = mockFetchByUrl({
        pendingGroups: {
          items: [
            {
              id: 'p-1',
              group_key: 'a,b',
              status: 'in_progress',
              updated_at: '2026-09-05T00:00:00Z',
              members: [
                { id: 'a', name: '행복놀이터', category: 'PARK', category_min: '공원', address: '경기도 성남시 분당구 1' },
                { id: 'b', name: '행복놀이터(구)', category: 'PARK', category_min: '공원', address: '경기도 성남시 분당구 1-1' },
              ],
            },
          ],
        },
      });
      vi.stubGlobal('fetch', fetchMock);
      renderPanel();

      fireEvent.click(screen.getAllByText('📥 불러오기')[1]);
      expect(await screen.findByText('행복놀이터 외 1건')).toBeInTheDocument();
      expect(screen.getByText('진행중')).toBeInTheDocument();

      fireEvent.click(screen.getByText('이어서 검수'));
      expect(screen.getByText('중복 의심 그룹 검수 (2건)')).toBeInTheDocument();
    });

    it('삭제를 누르면 DELETE를 호출하고 목록에서 제거한다', async () => {
      const fetchMock = mockFetchByUrl({
        pendingGroups: {
          items: [
            {
              id: 'p-1',
              group_key: 'a,b',
              status: 'ignored',
              updated_at: '2026-09-05T00:00:00Z',
              members: [{ id: 'a', name: '행복놀이터', category: 'PARK', category_min: '공원', address: null }],
            },
          ],
        },
      });
      vi.stubGlobal('fetch', fetchMock);
      renderPanel();

      fireEvent.click(screen.getAllByText('📥 불러오기')[1]);
      await screen.findByText('무시됨');
      fireEvent.click(screen.getByText('삭제'));

      expect(screen.queryByText('무시됨')).not.toBeInTheDocument();
      await waitFor(() => {
        const call = fetchMock.mock.calls.find((c) => (c[0] as string).includes('group_key=a%2Cb') && c[1]?.method === 'DELETE');
        expect(call).toBeDefined();
      });
    });
  });
});
