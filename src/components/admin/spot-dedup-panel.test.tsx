import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SpotDedupPanel } from './spot-dedup-panel';

// [노출 중분류별 중복 스팟 검수](2026-09-09 사용자 지시): "먼저 노출중분류
// 선택하고 거기 있는 데이터들끼리만 좌표 비교" — 스캔 범위를 고르기 전에는
// "불러오기"가 비활성화되므로, 기존 동작(미매핑 원본 전체)을 그대로 검증하던
// 테스트들은 이 헬퍼로 그 범위를 먼저 선택한 뒤 진행한다.
function selectScanScope(label: string) {
  const select = screen.getByRole('combobox');
  const option = within(select).getByRole('option', { name: label }) as HTMLOptionElement;
  fireEvent.change(select, { target: { value: option.value } });
}

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
  // [그룹이 페이지 경계에 끊겨 쪼개지는 문제 보강](2026-09-09 사용자 지시): 그룹을 열
  // 때마다 각 멤버 기준으로 find_nearby_open_spaces를 재조회한다 — 기본값은 "추가로
  // 찾은 멤버 없음"(빈 배열)이라 대부분의 기존 테스트는 신경 쓸 필요가 없다.
  nearby?: unknown;
}) {
  return vi.fn((url: string, init?: RequestInit) => {
    if (url.includes('/api/admin/service-categories')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(handlers.categories ?? { items: [] }) } as Response);
    }
    if (url.includes('/api/admin/spot-dedup/nearby')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(handlers.nearby ?? { items: [] }) } as Response);
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

  it('진입 시 자동으로 조회하지 않고, "불러오기"를 눌러야 각 영역이 조회된다(단, 스캔 범위 선택지 목록만 예외적으로 조용히 미리 조회한다)', async () => {
    const fetchMock = mockFetchByUrl({});
    vi.stubGlobal('fetch', fetchMock);
    renderPanel();

    expect(screen.getAllByText('📥 불러오기')).toHaveLength(2); // 그룹 영역 + 진행 중 저장된 그룹 영역
    expect(screen.queryByText('현재 중복 의심 그룹이 없습니다.')).not.toBeInTheDocument();
    // 스캔 범위를 고르지 않은 초기 상태에서는 그룹 영역의 "불러오기"가 비활성화돼 있다.
    expect(screen.getAllByText('📥 불러오기')[0]).toBeDisabled();
    await waitFor(() => {
      expect(fetchMock.mock.calls.some((c) => (c[0] as string).includes('/api/admin/service-categories'))).toBe(true);
    });
  });

  it('스캔 범위를 선택해야만 그룹 "불러오기"가 활성화된다', () => {
    vi.stubGlobal('fetch', mockFetchByUrl({}));
    renderPanel();

    const loadButton = screen.getAllByText('📥 불러오기')[0];
    expect(loadButton).toBeDisabled();

    selectScanScope('미매핑 원본 전체 (기존 방식)');
    expect(loadButton).not.toBeDisabled();
  });

  it('실제 노출 중분류를 선택해 불러오면 그 중분류 id를 쿼리 파라미터로 넘긴다', async () => {
    const fetchMock = mockFetchByUrl({
      categories: { items: [{ id: 'svc-9', parent_category: '자연/공원', category_name: '캠핑장 / 피크닉장' }] },
      groupsPages: { initial: { candidates: [], next_cursor: null, has_more: false } },
    });
    vi.stubGlobal('fetch', fetchMock);
    renderPanel();

    await screen.findByRole('option', { name: '자연/공원 > 캠핑장 / 피크닉장' });
    selectScanScope('자연/공원 > 캠핑장 / 피크닉장');
    fireEvent.click(screen.getAllByText('📥 불러오기')[0]);

    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) => (c[0] as string).includes('/api/admin/spot-dedup/groups'));
      expect(call).toBeDefined();
      expect(call![0] as string).toContain('service_category_id=svc-9');
    });
  });

  it('미매핑 원본 전체를 선택해 불러오면 기존과 동일하게 service_category_id 파라미터 없이 조회한다', async () => {
    const fetchMock = mockFetchByUrl({ groupsPages: { initial: { candidates: [], next_cursor: null, has_more: false } } });
    vi.stubGlobal('fetch', fetchMock);
    renderPanel();

    selectScanScope('미매핑 원본 전체 (기존 방식)');
    fireEvent.click(screen.getAllByText('📥 불러오기')[0]);

    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) => (c[0] as string).includes('/api/admin/spot-dedup/groups'));
      expect(call).toBeDefined();
      expect(call![0] as string).not.toContain('service_category_id');
    });
  });

  // [중분류 선택 초기화 버그 수정](2026-09-09 사용자 지시): "중분류는 이미 중분류
  // 선택한거에 대하여 하는거라 선택안함 상태로 하면 중분류 한게 다시 선택안함으로
  // 변하는거 아니야?" — 특정 중분류로 스캔해 찾은 그룹은 멤버 전원이 이미 그
  // 중분류이므로, 상세 모달의 "중분류" select가 그 값으로 미리 채워져 있어야
  // 하고, 아무 것도 바꾸지 않고 저장해도 그 값 그대로 보존돼야 한다(빈 값으로
  // 덮어써 기존 매핑을 지우면 안 됨).
  it('노출 중분류를 선택해 찾은 그룹은 상세 모달의 중분류가 그 값으로 미리 채워지고, 그대로 저장해도 유지된다', async () => {
    const fetchMock = mockFetchByUrl({
      categories: { items: [{ id: 'svc-9', parent_category: '자연/공원', category_name: '캠핑장 / 피크닉장' }] },
      groupsPages: {
        initial: {
          candidates: [
            candidateRow({ id: 'a', name: '난지캠핑장 A' }),
            candidateRow({ id: 'b', name: '난지캠핑장 B', address: '서울 마포구 상암동 1-1' }),
          ],
          next_cursor: 'b',
          has_more: false,
        },
      },
    });
    vi.stubGlobal('fetch', fetchMock);
    renderPanel();

    await screen.findByRole('option', { name: '자연/공원 > 캠핑장 / 피크닉장' });
    selectScanScope('자연/공원 > 캠핑장 / 피크닉장');
    fireEvent.click(screen.getAllByText('📥 불러오기')[0]);
    fireEvent.click(await screen.findByText(/난지캠핑장 A 외 1건/));

    // 스캔 범위 select + 모달의 중분류 select 둘 다 svc-9로 채워져 있다.
    const selects = screen.getAllByRole('combobox') as HTMLSelectElement[];
    const categorySelect = selects.find((s) => s.value === 'svc-9');
    expect(categorySelect).toBeDefined();

    fireEvent.click(screen.getByText(/저장 및 일괄 적용/));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) => (c[0] as string).includes('/api/admin/spot-dedup/apply'));
      expect(call).toBeDefined();
      const body = JSON.parse((call![1] as RequestInit).body as string);
      expect(body.service_category_id).toBe('svc-9');
    });
  });

  // [그룹이 페이지 경계에 끊겨 쪼개지는 문제 보강](2026-09-09 사용자 지시): "한강
  // 난지공원.. 많이 묶여야하는데 50건씩하다보니 끊겨서 두개그룹으로 됐네" — 그룹을
  // 열 때 스캔에서 놓친 실제 근접 멤버를 find_nearby_open_spaces로 보강해 합친다.
  describe('그룹이 페이지 경계에 끊겨 쪼개지는 문제 보강(2026-09-09)', () => {
    it('그룹을 열면 각 멤버 기준으로 실제 반경을 재조회해, 스캔에서 놓친 멤버를 자동으로 합친다', async () => {
      const fetchMock = mockFetchByUrl({
        groupsPages: {
          initial: {
            candidates: [candidateRow({ id: 'a' }), candidateRow({ id: 'b', name: '행복놀이터(구)', address: '경기도 성남시 분당구 1-1' })],
            next_cursor: 'b',
            has_more: false,
          },
        },
        // 스캔 페이지에는 a/b만 실렸지만, 실제로는 c도 같은 위치에 있다(다른
        // 페이지로 흩어진 것을 재현) — a/b 기준 30m 재조회에서 c가 발견된다.
        // 미매핑 스캔(scanScope=UNMAPPED_SCOPE) 중이므로 service_category_id는
        // null이어야 채택된다(아래 "다른 노출 중분류는 채택하지 않는다" 참고).
        nearby: {
          items: [{ id: 'c', name: '행복놀이터(신관)', category: 'PARK', category_min: '공원', address: '경기도 성남시 분당구 1-2', distance_m: 5, service_category_id: null }],
        },
      });
      vi.stubGlobal('fetch', fetchMock);
      renderPanel();

      selectScanScope('미매핑 원본 전체 (기존 방식)');
      fireEvent.click(screen.getAllByText('📥 불러오기')[0]);
      fireEvent.click(await screen.findByText(/행복놀이터 외 1건/));

      expect(screen.getByText('중복 의심 그룹 검수 (2건)')).toBeInTheDocument();
      // 보강 조회가 끝나면 놓쳤던 멤버(c)가 자동으로 합쳐져 3건이 된다.
      expect(await screen.findByText('중복 의심 그룹 검수 (3건)')).toBeInTheDocument();
      expect(screen.getByText('행복놀이터(신관)')).toBeInTheDocument();
    });

    // [노출 중분류 경계 넘는 오묶음 방지](2026-09-09 사용자 지시): "이부분에서 같은
    // 노출중분류에 대하여서만 하는거 맞아?" — find_nearby_open_spaces는 좌표만
    // 보고 노출 중분류를 모르므로, 응답에 다른(또는 다르게 매핑된) service_
    // category_id가 섞여 있으면 패널이 직접 걸러내야 한다.
    it('30m 이내라도 노출 중분류가 다른 스팟은 보강 대상에서 제외한다', async () => {
      const fetchMock = mockFetchByUrl({
        categories: { items: [{ id: 'svc-9', parent_category: '자연/공원', category_name: '캠핑장 / 피크닉장' }] },
        groupsPages: {
          initial: {
            candidates: [candidateRow({ id: 'a' }), candidateRow({ id: 'b', name: '난지캠핑장 B', address: '서울 마포구 상암동 1-1' })],
            next_cursor: 'b',
            has_more: false,
          },
        },
        // c는 30m 이내지만 노출 중분류가 svc-9(캠핑장)가 아니라 완전히 다른 값이다
        // — 무관한 스팟이 잘못 합쳐지면 병합 시 그 스팟의 노출 중분류까지 덮어써버린다.
        nearby: {
          items: [{ id: 'c', name: '근처 편의점', category: 'ETC', category_min: null, address: '서울 마포구 상암동 1-2', distance_m: 10, service_category_id: 'svc-other' }],
        },
      });
      vi.stubGlobal('fetch', fetchMock);
      renderPanel();

      await screen.findByRole('option', { name: '자연/공원 > 캠핑장 / 피크닉장' });
      selectScanScope('자연/공원 > 캠핑장 / 피크닉장');
      fireEvent.click(screen.getAllByText('📥 불러오기')[0]);
      fireEvent.click(await screen.findByText(/행복놀이터 외 1건/));

      // 잠시 뒤에도(보강 조회가 끝난 뒤에도) 2건 그대로 유지되고, 무관한 스팟은
      // 목록에 나타나지 않는다.
      await waitFor(() => expect(fetchMock.mock.calls.some((c) => (c[0] as string).includes('/api/admin/spot-dedup/nearby'))).toBe(true));
      expect(screen.getByText('중복 의심 그룹 검수 (2건)')).toBeInTheDocument();
      expect(screen.queryByText('근처 편의점')).not.toBeInTheDocument();
    });

    it('보강 조회가 실패해도 기존 스캔 결과 그대로 검수를 계속할 수 있다', async () => {
      const base = mockFetchByUrl({
        groupsPages: {
          initial: {
            candidates: [candidateRow({ id: 'a' }), candidateRow({ id: 'b', name: '행복놀이터(구)', address: '경기도 성남시 분당구 1-1' })],
            next_cursor: 'b',
            has_more: false,
          },
        },
      });
      const fetchMock = vi.fn((url: string, init?: RequestInit) =>
        url.includes('/api/admin/spot-dedup/nearby') ? Promise.reject(new Error('network error')) : base(url, init)
      );
      vi.stubGlobal('fetch', fetchMock);
      renderPanel();

      selectScanScope('미매핑 원본 전체 (기존 방식)');
      fireEvent.click(screen.getAllByText('📥 불러오기')[0]);
      fireEvent.click(await screen.findByText(/행복놀이터 외 1건/));

      expect(await screen.findByText('중복 의심 그룹 검수 (2건)')).toBeInTheDocument();
    });
  });

  // [그룹 오묶음 부분 제외](2026-09-09 사용자 지시): "무심골 캠핑장 / 무주 구천동
  // 캠핑장 / 무주구천동캠핑장 이거는 1번째꺼는 다른거고 2,3번째는 같은건데 3개가
  // 묶여서 대표로 묶을 수가 없네" — 근접 판정이 전이적(A~B, B~C면 A~C가 아니어도
  // 셋이 한 그룹)이라 실제로는 다른 장소가 섞여 들어올 수 있다. 체크박스로 뺄 수
  // 있어야 한다.
  describe('그룹 오묶음 부분 제외(2026-09-09)', () => {
    // A-B 약 17.7m, B-C 약 17.7m, A-C 약 35.4m(30m 임계값 초과) — A와 C는 서로
    // 직접 연결되지 않지만 B를 거쳐 전이적으로 한 그룹이 된다(실제 신고 사례 재현).
    function makeChainedCandidates() {
      return [
        candidateRow({ id: 'a', name: '무심골 캠핑장', address: '전북특별자치도 무주군 설천면 원심곡1길 1', normalized_address: 'addr-a', lat: 37.3, lng: 127.1 }),
        candidateRow({ id: 'b', name: '무주 구천동 캠핑장', address: '전북특별자치도 무주군 설천면 원심곡1길 11', normalized_address: 'addr-b', lat: 37.3, lng: 127.1002 }),
        candidateRow({ id: 'c', name: '무주구천동캠핑장', address: '전북특별자치도 무주군 설천면 원심곡1길 11', normalized_address: 'addr-b', lat: 37.3, lng: 127.1004 }),
      ];
    }

    it('체크를 해제해서 뺀 항목은 병합 대상에서 제외되고, 나머지만 apply로 전송된다', async () => {
      const fetchMock = mockFetchByUrl({
        groupsPages: { initial: { candidates: makeChainedCandidates(), next_cursor: 'c', has_more: false } },
      });
      vi.stubGlobal('fetch', fetchMock);
      renderPanel();

      selectScanScope('미매핑 원본 전체 (기존 방식)');
      fireEvent.click(screen.getAllByText('📥 불러오기')[0]);
      fireEvent.click(await screen.findByText(/무심골 캠핑장 외 2건/));

      expect(screen.getByText('중복 의심 그룹 검수 (3건)')).toBeInTheDocument();
      fireEvent.click(screen.getByLabelText('무심골 캠핑장 포함')); // 체크 해제 — 다른 장소

      expect(screen.getByText(/저장 및 일괄 적용 \(2건\)/)).toBeInTheDocument();
      fireEvent.click(screen.getByText(/저장 및 일괄 적용/));

      await waitFor(() => {
        const call = fetchMock.mock.calls.find((c) => (c[0] as string).includes('/api/admin/spot-dedup/apply'));
        expect(call).toBeDefined();
        const body = JSON.parse((call![1] as RequestInit).body as string);
        expect(body.spot_ids.sort()).toEqual(['b', 'c']);
      });

      // 뺀 멤버(a)는 후보 목록에 그대로 남아 있어야 한다(사라지지 않음).
      expect(screen.queryByText('무심골 캠핑장')).not.toBeInTheDocument(); // 모달은 닫혔음
    });

    it('일부만 병합해도 원본 전체 그룹의 진행 중 임시 저장 기록이 함께 정리된다(유령 항목 방지)', async () => {
      const fetchMock = mockFetchByUrl({
        groupsPages: { initial: { candidates: makeChainedCandidates(), next_cursor: 'c', has_more: false } },
      });
      vi.stubGlobal('fetch', fetchMock);
      renderPanel();

      selectScanScope('미매핑 원본 전체 (기존 방식)');
      fireEvent.click(screen.getAllByText('📥 불러오기')[0]);
      fireEvent.click(await screen.findByText(/무심골 캠핑장 외 2건/)); // handleOpenGroup이 [a,b,c] 전체를 in_progress로 저장

      fireEvent.click(screen.getByLabelText('무심골 캠핑장 포함')); // a 제외
      fireEvent.click(screen.getByText(/저장 및 일괄 적용/)); // b,c만 저장

      await waitFor(() => {
        // 실제 병합 키(b,c)뿐 아니라 원본 전체 키(a,b,c)도 DELETE 돼야 한다.
        const deleteCalls = fetchMock.mock.calls.filter(
          (c) => (c[0] as string).includes('/api/admin/spot-dedup/pending-groups') && c[1]?.method === 'DELETE'
        );
        expect(deleteCalls.some((c) => (c[0] as string).includes('group_key=a%2Cb%2Cc'))).toBe(true);
      });
    });

    it('2건 미만으로 줄이면 저장 버튼이 비활성화된다', async () => {
      const fetchMock = mockFetchByUrl({
        groupsPages: { initial: { candidates: makeChainedCandidates(), next_cursor: 'c', has_more: false } },
      });
      vi.stubGlobal('fetch', fetchMock);
      renderPanel();

      selectScanScope('미매핑 원본 전체 (기존 방식)');
      fireEvent.click(screen.getAllByText('📥 불러오기')[0]);
      fireEvent.click(await screen.findByText(/무심골 캠핑장 외 2건/));

      fireEvent.click(screen.getByLabelText('무심골 캠핑장 포함'));
      fireEvent.click(screen.getByLabelText('무주 구천동 캠핑장 포함'));

      expect(screen.getByRole('button', { name: /저장 및 일괄 적용/ })).toBeDisabled();
    });
  });

  // [원본 중분류가 다른 멤버 경고](2026-09-09 사용자 지시): "화성에코팜테마파크
  // 오토캠핑장(캠핑장)/화성에코팜 테마파크 어린이체험관(키즈카페).. 이거 원본
  // 중분류가 다른데?" — 근접/주소 매칭만으로는 "같은 성격의 시설"임을 보장하지
  // 않으므로, 병합 예정 멤버들의 원본 중분류가 섞여 있으면 경고를 보여준다(막지는
  // 않음 — 서로 다른 출처가 같은 개념을 다르게 표기하는 정상 케이스도 있음).
  describe('원본 중분류가 다른 멤버 경고(2026-09-09)', () => {
    it('병합 예정 멤버들의 원본 중분류가 다르면 경고 문구를 보여준다', async () => {
      const fetchMock = mockFetchByUrl({
        groupsPages: {
          initial: {
            candidates: [
              candidateRow({ id: 'a', name: '화성에코팜테마파크 오토캠핑장', category_min: '캠핑장', normalized_address: 'addr-x' }),
              candidateRow({ id: 'b', name: '화성에코팜 테마파크 어린이체험관', category_min: '키즈카페', normalized_address: 'addr-x' }),
            ],
            next_cursor: 'b',
            has_more: false,
          },
        },
      });
      vi.stubGlobal('fetch', fetchMock);
      renderPanel();

      selectScanScope('미매핑 원본 전체 (기존 방식)');
      fireEvent.click(screen.getAllByText('📥 불러오기')[0]);
      fireEvent.click(await screen.findByText(/화성에코팜테마파크 오토캠핑장 외 1건/));

      expect(screen.getByText(/원본 중분류가 서로 다릅니다/)).toBeInTheDocument();
      expect(screen.getByText(/캠핑장 \/ 키즈카페/)).toBeInTheDocument();
    });

    it('체크 해제로 원본 중분류가 다른 멤버를 빼면 경고가 사라진다', async () => {
      const fetchMock = mockFetchByUrl({
        groupsPages: {
          initial: {
            candidates: [
              candidateRow({ id: 'a', name: '화성에코팜테마파크 오토캠핑장', category_min: '캠핑장', normalized_address: 'addr-x' }),
              candidateRow({ id: 'b', name: '화성에코팜 테마파크 어린이체험관', category_min: '키즈카페', normalized_address: 'addr-x' }),
            ],
            next_cursor: 'b',
            has_more: false,
          },
        },
      });
      vi.stubGlobal('fetch', fetchMock);
      renderPanel();

      selectScanScope('미매핑 원본 전체 (기존 방식)');
      fireEvent.click(screen.getAllByText('📥 불러오기')[0]);
      fireEvent.click(await screen.findByText(/화성에코팜테마파크 오토캠핑장 외 1건/));
      fireEvent.click(screen.getByLabelText('화성에코팜 테마파크 어린이체험관 포함'));

      expect(screen.queryByText(/원본 중분류가 서로 다릅니다/)).not.toBeInTheDocument();
    });

    it('병합 예정 멤버들의 원본 중분류가 같으면 경고가 없다', async () => {
      const fetchMock = mockFetchByUrl({
        groupsPages: {
          initial: {
            candidates: [candidateRow({ id: 'a' }), candidateRow({ id: 'b', name: '행복놀이터(구)', address: '경기도 성남시 분당구 1-1' })],
            next_cursor: 'b',
            has_more: false,
          },
        },
      });
      vi.stubGlobal('fetch', fetchMock);
      renderPanel();

      selectScanScope('미매핑 원본 전체 (기존 방식)');
      fireEvent.click(screen.getAllByText('📥 불러오기')[0]);
      fireEvent.click(await screen.findByText(/행복놀이터 외 1건/));

      expect(screen.queryByText(/원본 중분류가 서로 다릅니다/)).not.toBeInTheDocument();
    });
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

    selectScanScope('미매핑 원본 전체 (기존 방식)');
    fireEvent.click(screen.getAllByText('📥 불러오기')[0]);

    const groupButton = await screen.findByText(/행복놀이터 외 1건/);
    fireEvent.click(groupButton);

    expect(screen.getByText('중복 의심 그룹 검수 (2건)')).toBeInTheDocument();
    expect(screen.getByText('행복놀이터')).toBeInTheDocument();
    expect(screen.getByText('행복놀이터(구)')).toBeInTheDocument();
  });

  it('has_more가 true면 "다음 100건 더 스캔하기" 버튼이 보이고, 누르면 다음 페이지 후보를 이어붙여 그룹을 다시 계산한다', async () => {
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

    selectScanScope('미매핑 원본 전체 (기존 방식)');
    fireEvent.click(screen.getAllByText('📥 불러오기')[0]);
    expect(await screen.findByText('다음 100건 더 스캔하기')).toBeInTheDocument();
    // 페이지 1건만으로는 아직 "중복 의심"이 성립하지 않아(그룹 최소 2건) 목록에 없다.
    expect(screen.queryByText(/행복놀이터/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('다음 100건 더 스캔하기'));

    // 두 페이지 후보(같은 normalized_address)가 합쳐져 이제 그룹 하나로 보인다.
    expect(await screen.findByText(/행복놀이터 외 1건/)).toBeInTheDocument();
    expect(screen.queryByText('다음 100건 더 스캔하기')).not.toBeInTheDocument(); // has_more=false
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
    selectScanScope('미매핑 원본 전체 (기존 방식)');
    fireEvent.click(screen.getAllByText('📥 불러오기')[0]);
    fireEvent.click(await screen.findByText(/행복놀이터 외 1건/));

    const nameInput = screen.getByPlaceholderText('원본 이름을 참고해 깔끔하게 입력');
    fireEvent.change(nameInput, { target: { value: '행복동네놀이터' } });
    fireEvent.click(screen.getByText(/저장 및 일괄 적용/));

    await waitFor(() => expect(screen.queryByText('중복 의심 그룹 검수 (2건)')).not.toBeInTheDocument());
    expect(screen.queryByText(/행복놀이터 외 1건/)).not.toBeInTheDocument();
  });

  // [노출 중분류별 중복 스팟 검수](2026-09-09 사용자 지시) 이후: 스캔 범위 선택
  // 자체가 이 목록에 의존하므로("그룹을 불러올 때" 조용히 가져오던 기존 방식으로는
  // 애초에 무엇을 스캔할지도 고를 수 없다) 이제 마운트 시점에 미리 조회한다.
  // 그룹 병합 모달(GroupDetailModal)의 "중분류" select도 여전히 같은 목록을 쓴다.
  it('마운트 시 노출 중분류 목록을 미리 조회하고, 그룹 병합 모달의 중분류 select에도 그대로 쓰인다', async () => {
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
    await screen.findByRole('option', { name: '자연/공원 > 대형 근린공원 / 잔디광장' });

    selectScanScope('미매핑 원본 전체 (기존 방식)');
    fireEvent.click(screen.getAllByText('📥 불러오기')[0]);
    fireEvent.click(await screen.findByText(/행복놀이터 외 1건/));

    // 스캔 범위 select와 그룹 병합 모달의 "중분류" select 양쪽에 같은 목록이 쓰여
    // 옵션 텍스트가 두 번 나타난다.
    expect(screen.getAllByText('자연/공원 > 대형 근린공원 / 잔디광장')).toHaveLength(2);
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

      selectScanScope('미매핑 원본 전체 (기존 방식)');
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

      selectScanScope('미매핑 원본 전체 (기존 방식)');
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
