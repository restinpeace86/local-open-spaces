import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminDataGridClient, AdminOpenSpaceRow, AdminEventRow } from './data-grid-client';

function buildOpenSpaceRow(overrides: Partial<AdminOpenSpaceRow> = {}): AdminOpenSpaceRow {
  return {
    id: 'row-1',
    external_id: 'ext-1',
    source_type: 'TEST_SOURCE',
    source: 'test',
    name: '테스트 공간',
    category: 'CULTURE',
    category_min: null,
    category_min_source: null,
    service_category_id: null,
    address: '서울시 종로구',
    location: null,
    location_precision: 'EXACT',
    is_free: true,
    operating_hours: null,
    info_url: null,
    is_kids_friendly: false,
    has_parking: false,
    stroller_accessible: false,
    facility_type: 'ETC',
    target_age_group: null,
    raw_data: {},
    sigungu_name: null,
    created_at: null,
    updated_at: null,
    ...overrides,
  };
}

function buildEventRow(overrides: Partial<AdminEventRow> = {}): AdminEventRow {
  return {
    id: 'ev-1',
    external_id: 'ev-ext-1',
    source: 'test',
    title: '테스트 행사',
    event_type: 'PERFORMANCE_FESTIVAL',
    category_maj: null,
    category_min: null,
    category_min_source: null,
    target_audience: null,
    target_audience_source: null,
    venue_name: '테스트 장소',
    sigungu_name: '서울시 종로구',
    start_date: '2026-01-01',
    end_date: '2026-01-02',
    location: null,
    location_precision: 'EXACT',
    is_reservation_required: false,
    reservation_url: null,
    reservation_start_date: null,
    reservation_end_date: null,
    is_free: true,
    thumbnail_url: null,
    is_kids_friendly: false,
    has_parking: false,
    stroller_accessible: false,
    facility_type: 'ETC',
    target_age_group: null,
    booking_status: null,
    is_active: true,
    raw_data: {},
    created_at: null,
    ...overrides,
  };
}

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
}));

// [관리자 화면(/admin/data-grid) 기능 고도화 및 범용 제휴 상품 테이블 개편](2026-08-30
// 사용자 지시): 이 컴포넌트에는 기존에 전용 테스트가 없었다(known gap) — 이번에 새
// 탭(curated_items)을 추가하면서 기존 3개 탭(open_spaces/events/raw_ingest_data)의 공유
// 필터/테이블 렌더링 경로를 전혀 건드리지 않았는지, 그리고 새 탭으로 전환하면
// CuratedItemsPanel이 정상적으로 대체 렌더링되는지를 최소 스모크 테스트로 검증한다
// (이 파일 전체에 대한 포괄적 회귀 테스트는 이번 작업 범위 밖).
const EMPTY_FILTER_OPTIONS = {
  open_spaces: {
    sourceTypes: [],
    sources: [],
    categories: [],
    minClassNames: [],
    svcStatNms: [],
    categoryMins: [],
  },
  events: {
    sources: [],
    categories: [],
    minClassNames: [],
    svcStatNms: [],
    categoryMins: [],
  },
  raw_ingest_data: { sources: [] },
  curated_items: {},
  spot_curations: {},
  mom_pick_posts: {},
  spot_dedup: {},
  category_mapping: {},
};

describe('AdminDataGridClient — curated_items 탭 통합', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('네 번째 탭("🏷️ 큐레이션/제휴 상품")이 노출되고, 기본 탭(open_spaces)은 기존처럼 데이터 그리드를 보여준다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ rows: [], total: 0 }),
        } as Response)
      )
    );

    render(<AdminDataGridClient filterOptions={EMPTY_FILTER_OPTIONS} />);

    expect(screen.getByText('open_spaces (공간·시설)')).toBeInTheDocument();
    expect(screen.getByText('🏷️ 큐레이션/제휴 상품')).toBeInTheDocument();

    // [관리자 페이지 성능 최적화](2026-08-30 사용자 지시): 탭 진입 시 자동 조회하지
    // 않으므로 먼저 빈 뼈대(불러오기 버튼)가 보이고, 클릭해야 데이터 조회가 나간다.
    expect(screen.getByText('필터를 설정한 뒤 불러오기를 눌러주세요.')).toBeInTheDocument();
    fireEvent.click(screen.getByText('📥 불러오기'));
    expect(await screen.findByText('조건에 맞는 데이터가 없습니다.')).toBeInTheDocument();
  });

  it('"🏷️ 큐레이션/제휴 상품" 탭을 누르면 기존 공유 필터/테이블 대신 CuratedItemsPanel이 렌더링된다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.startsWith('/api/admin/curated-items')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [], total: 0 }) } as Response);
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ rows: [], total: 0 }) } as Response);
      })
    );

    render(<AdminDataGridClient filterOptions={EMPTY_FILTER_OPTIONS} />);

    fireEvent.click(screen.getByText('🏷️ 큐레이션/제휴 상품'));

    // CuratedItemsPanel 전용 UI(검색 placeholder/등록 버튼)가 보이고, open_spaces 탭
    // 전용 필터(제목/시설명 검색 placeholder)는 더 이상 보이지 않아야 한다.
    expect(await screen.findByPlaceholderText('상품명 키워드 검색')).toBeInTheDocument();
    expect(screen.getByText('+ 신규 상품 등록')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('제목/시설명, 주소 키워드 검색')).not.toBeInTheDocument();
  });
});

// [관리자 대시보드 모바일 레이아웃/스크롤 버그 긴급 수정](2026-09-05 사용자 지시):
// "모바일 환경에서 리스트 영역이 짤리고 스크롤이 안 내려가는 레이아웃 버그" — 실제
// 원인은 body의 overflow-hidden(의도된 고정 뷰포트 설계) 자체가 아니라, 그 아래
// flex-1 컨테이너들에 min-h-0가 빠져 있어 overflow-y-auto가 작동하지 않던 것이었다
// (min-height:auto 기본값 때문에 flex 아이템이 내용 높이만큼 계속 커져 부모의
// overflow-hidden에 그냥 잘렸다). 이 클래스가 되돌아가지 않도록 고정한다.
describe('AdminDataGridClient — 모바일 레이아웃/스크롤 회귀 방지', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('루트 컨테이너와 테이블 영역 모두 flex-1과 함께 min-h-0를 갖는다(스크롤이 실제로 작동하기 위한 전제조건)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ rows: [], total: 0 }) } as Response)));

    const { container } = render(<AdminDataGridClient filterOptions={EMPTY_FILTER_OPTIONS} />);

    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('flex-1');
    expect(root.className).toContain('min-h-0');
    expect(root.className).toContain('overflow-hidden');

    fireEvent.click(screen.getByText('📥 불러오기'));
    const emptyMessage = await screen.findByText('조건에 맞는 데이터가 없습니다.');
    const tableScrollArea = emptyMessage.parentElement as HTMLElement;
    expect(tableScrollArea.className).toContain('flex-1');
    expect(tableScrollArea.className).toContain('min-h-0');
    expect(tableScrollArea.className).toContain('overflow-y-auto');
  });

  // [관리자 화면 모바일 필터 영역 축소](2026-09-06 사용자 지시, 2차 수정): "중분류나
  // 등록일등의 조건이 화면영역의 90%를 차지하고 있어... 조회하기 누르면 하단에
  // 검색된 데이터 나오는데 이 영역이 너무 작아서 목록 리스트 한건정도 밖에
  // 안보여" — 1차로 max-h-[45vh]를 넣었지만 "여전히 90%"라는 재확인을 받았다.
  // vh는 전역 하단 탭바(BottomTabs)가 이미 떼어간 공간을 반영 못해 실제보다
  // 크게 계산되므로, 부모(flex-1로 실제 남은 높이를 갖는 요소) 기준 %로 바꿨다.
  it('필터 바(검색/중분류/등록일 등)에 최대 높이 제한(부모 기준 %)과 자체 스크롤이 있어 결과 목록 영역을 밀어내지 않는다', () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ rows: [], total: 0 }) } as Response)));

    render(<AdminDataGridClient filterOptions={EMPTY_FILTER_OPTIONS} />);

    const searchInput = screen.getByPlaceholderText('제목/시설명, 주소 키워드 검색');
    const filterBar = searchInput.parentElement as HTMLElement;
    expect(filterBar.className).toContain('max-h-[42%]');
    expect(filterBar.className).toContain('overflow-y-auto');
    expect(filterBar.className).toContain('shrink-0');
  });

  // [관리자 화면 모바일 필터 영역 재수정](2026-09-06 사용자 지시) 후속: 필터 바
  // 위 헤더의 "오늘 반영 현황"/"재수집 도구"도 캡이 없어 필터 바와 합치면 여전히
  // 화면 대부분을 차지했다 — 검수 작업의 핵심이 아닌 보조 도구라 기본은 접어
  // 두고, 토글을 누르면 펼쳐지게 한다.
  it('"오늘 반영 현황"/"재수집 도구"는 기본적으로 접혀 있고, 토글을 누르면 펼쳐진다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('/api/admin/data-grid/summary')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ open_spaces_created_today: 1, events_created_today: 2 }) } as Response);
        }
        if (url.includes('/api/admin/ingest/rerun')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ daily: [], monthly: [] }) } as Response);
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ rows: [], total: 0 }) } as Response);
      })
    );

    render(<AdminDataGridClient filterOptions={EMPTY_FILTER_OPTIONS} />);

    expect(screen.queryByText(/오늘 신규 반영/)).not.toBeInTheDocument();
    expect(screen.queryByText('🔁 개별 소스 수동 재수집')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('▾ 오늘 반영 현황 / 재수집 도구 보기'));

    expect(await screen.findByText(/오늘 신규 반영/)).toBeInTheDocument();
    expect(screen.getByText('🔁 개별 소스 수동 재수집')).toBeInTheDocument();
  });
});

// [노출 중분류 미지정만 보기](2026-09-06 사용자 지시): "노출중분류가 null 인거에
// 대하여 어디서 체크할수있도록 해놓은거야? open_spaces.에 안보이는데?"
describe('AdminDataGridClient — 노출 중분류 미지정만 보기', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('open_spaces 탭에 체크박스가 보이고, 체크하면 only_unmapped=true로 조회한다', async () => {
    const fetchMock = vi.fn((_url: string) => Promise.resolve({ ok: true, json: () => Promise.resolve({ rows: [], total: 0 }) } as Response));
    vi.stubGlobal('fetch', fetchMock);

    render(<AdminDataGridClient filterOptions={EMPTY_FILTER_OPTIONS} />);

    const checkbox = screen.getByLabelText('노출 중분류(service_category_id)가 아직 없는 행만 보기');
    expect(checkbox).not.toBeChecked();

    fireEvent.click(screen.getByText('📥 불러오기'));
    await screen.findByText('조건에 맞는 데이터가 없습니다.');
    fetchMock.mockClear();

    fireEvent.click(checkbox);

    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) => (c[0] as string).includes('/api/admin/data-grid'));
      expect(call).toBeDefined();
      expect(call![0] as string).toContain('only_unmapped=true');
    });
  });

  it('events 탭에는 이 체크박스가 없다(open_spaces 전용 컬럼)', () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ rows: [], total: 0 }) } as Response)));
    render(<AdminDataGridClient filterOptions={EMPTY_FILTER_OPTIONS} />);

    fireEvent.click(screen.getByText('events (행사·체험)'));

    expect(screen.queryByLabelText('노출 중분류(service_category_id)가 아직 없는 행만 보기')).not.toBeInTheDocument();
  });
});

// [큐레이션 미완료만 보기](2026-09-07 사용자 지시): "노출 중분류가 아직 없는
// 행만보기 뿐만아니라 큐레이션이 아직 없는 행만보기도 추가해줘.. 1차적으로
// 여러건에 대하여 한번에 표준중분류 노출중분류 했으면 이제 큐레이션쪽
// 해야지.. 뱃지다는거"
describe('AdminDataGridClient — 큐레이션 미완료만 보기(2026-09-07)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('open_spaces 탭에 체크박스가 보이고, 체크하면 only_uncurated=true로 조회한다', async () => {
    const fetchMock = vi.fn((_url: string) => Promise.resolve({ ok: true, json: () => Promise.resolve({ rows: [], total: 0 }) } as Response));
    vi.stubGlobal('fetch', fetchMock);

    render(<AdminDataGridClient filterOptions={EMPTY_FILTER_OPTIONS} />);

    const checkbox = screen.getByLabelText('큐레이션(블로그/뱃지)이 아직 없는 행만 보기');
    expect(checkbox).not.toBeChecked();

    fireEvent.click(screen.getByText('📥 불러오기'));
    await screen.findByText('조건에 맞는 데이터가 없습니다.');
    fetchMock.mockClear();

    fireEvent.click(checkbox);

    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) => (c[0] as string).includes('/api/admin/data-grid'));
      expect(call).toBeDefined();
      expect(call![0] as string).toContain('only_uncurated=true');
    });
  });

  it('노출 중분류 미지정 필터와 함께 켤 수 있다(둘 다 파라미터에 실린다)', async () => {
    const fetchMock = vi.fn((_url: string) => Promise.resolve({ ok: true, json: () => Promise.resolve({ rows: [], total: 0 }) } as Response));
    vi.stubGlobal('fetch', fetchMock);
    render(<AdminDataGridClient filterOptions={EMPTY_FILTER_OPTIONS} />);

    fireEvent.click(screen.getByText('📥 불러오기'));
    await screen.findByText('조건에 맞는 데이터가 없습니다.');
    fetchMock.mockClear();

    fireEvent.click(screen.getByLabelText('노출 중분류(service_category_id)가 아직 없는 행만 보기'));
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(0));
    fetchMock.mockClear();

    fireEvent.click(screen.getByLabelText('큐레이션(블로그/뱃지)이 아직 없는 행만 보기'));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) => (c[0] as string).includes('/api/admin/data-grid'));
      expect(call).toBeDefined();
      expect(call![0] as string).toContain('only_unmapped=true');
      expect(call![0] as string).toContain('only_uncurated=true');
    });
  });

  it('events 탭에는 이 체크박스가 없다(open_spaces 전용)', () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ rows: [], total: 0 }) } as Response)));
    render(<AdminDataGridClient filterOptions={EMPTY_FILTER_OPTIONS} />);

    fireEvent.click(screen.getByText('events (행사·체험)'));

    expect(screen.queryByLabelText('큐레이션(블로그/뱃지)이 아직 없는 행만 보기')).not.toBeInTheDocument();
  });
});

// [관리자 화면 목록 컬럼 정리](2026-09-07 사용자 지시): "1. ID와 출처는 비슷하니
// 출처 컬럼만 남겨 2. 원천 대/중분류 컬럼은 안보이게 해 3. 제목/명칭 컬럼과
// 장소/시설명 컬럼도 동일해.. 제목/명칭 컬럼만 남겨 4. 요금, 접수상태 컬럼은
// 안보이게 해" — open_spaces 전용(events는 그대로 유지).
describe('AdminDataGridClient — open_spaces 목록 컬럼 정리(2026-09-07)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('open_spaces 탭에는 ID/원천 대·중분류/장소·시설명(제목과 중복)/요금/접수상태 컬럼이 없다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ rows: [buildOpenSpaceRow({ raw_data: { MAXCLASSNM: '대', MINCLASSNM: '중', SVCSTATNM: '접수중' } })], total: 1 }),
        } as Response)
      )
    );
    render(<AdminDataGridClient filterOptions={EMPTY_FILTER_OPTIONS} />);
    fireEvent.click(screen.getByText('📥 불러오기'));

    await screen.findByText('테스트 공간');
    expect(screen.queryByText('ID')).not.toBeInTheDocument();
    expect(screen.queryByText('원천 대/중분류')).not.toBeInTheDocument();
    expect(screen.queryByText('장소/시설명')).not.toBeInTheDocument();
    expect(screen.queryByText('요금')).not.toBeInTheDocument();
    expect(screen.queryByText('접수상태')).not.toBeInTheDocument();
    // 제목/명칭(테스트 공간)은 한 번만 렌더링된다 — 장소/시설명 컬럼이 없어졌으므로.
    expect(screen.getAllByText('테스트 공간')).toHaveLength(1);
    expect(screen.getByText('출처')).toBeInTheDocument();
    expect(screen.getByText('제목/명칭')).toBeInTheDocument();
  });

  it('events 탭에는 컬럼 정리 영향 없이 ID/원천 대·중분류/장소·시설명/요금/접수상태가 그대로 보인다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ rows: [buildEventRow({ raw_data: { SVCSTATNM: '접수중' } })], total: 1 }),
        } as Response)
      )
    );
    render(<AdminDataGridClient filterOptions={EMPTY_FILTER_OPTIONS} />);
    fireEvent.click(screen.getByText('events (행사·체험)'));
    fireEvent.click(screen.getByText('📥 불러오기'));

    await screen.findByText('테스트 행사');
    expect(screen.getByText('ID')).toBeInTheDocument();
    expect(screen.getByText('원천 대/중분류')).toBeInTheDocument();
    expect(screen.getByText('장소/시설명')).toBeInTheDocument();
    expect(screen.getByText('요금')).toBeInTheDocument();
    expect(screen.getByText('접수상태')).toBeInTheDocument();
    expect(screen.getByText('테스트 장소')).toBeInTheDocument(); // venue_name, title과 다른 값
  });
});

// [open_spaces 목록 일괄 편집](2026-09-07 사용자 지시): "5. 리스트 앞에 체크박스
// 하나 만들고 체크 박스 선택된 것들에 대하여 표준 중분류랑 노출 중분류
// 일괄적으로 수정 가능하도록도 기능만들어줘"
describe('AdminDataGridClient — open_spaces 목록 일괄 편집(2026-09-07)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function mockFetch(rows: AdminOpenSpaceRow[]) {
    return vi.fn((url: string, _init?: RequestInit) => {
      if (url.includes('/api/admin/data-grid')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ rows, total: rows.length }) } as Response);
      }
      if (url.includes('/api/admin/service-categories')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ items: [{ id: 'svc-1', parent_category: '키즈/놀이시설', category_name: '키즈카페 / 실내놀이터' }] }),
        } as Response);
      }
      if (url.includes('/api/admin/data-grid/category-min')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ updated_count: 2 }) } as Response);
      }
      if (url.includes('/api/admin/open-spaces/bulk-category-mapping')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ updated_count: 2 }) } as Response);
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    });
  }

  it('events 탭에는 체크박스 컬럼이 없다', async () => {
    vi.stubGlobal('fetch', mockFetch([buildOpenSpaceRow()]));
    render(<AdminDataGridClient filterOptions={EMPTY_FILTER_OPTIONS} />);
    fireEvent.click(screen.getByText('events (행사·체험)'));
    fireEvent.click(screen.getByText('📥 불러오기'));

    await waitFor(() => expect(screen.queryByText('불러오는 중...')).not.toBeInTheDocument());
    expect(screen.queryByLabelText('이 페이지 전체 선택')).not.toBeInTheDocument();
  });

  it('open_spaces 탭에서 행 체크박스를 선택하면 일괄 편집 바가 나타난다', async () => {
    vi.stubGlobal('fetch', mockFetch([buildOpenSpaceRow({ id: 'row-1', name: '스팟A' })]));
    render(<AdminDataGridClient filterOptions={EMPTY_FILTER_OPTIONS} />);
    fireEvent.click(screen.getByText('📥 불러오기'));

    await screen.findByText('스팟A');
    expect(screen.queryByText('1건 선택됨')).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('스팟A 선택'));

    expect(await screen.findByText('1건 선택됨')).toBeInTheDocument();
  });

  it('전체 선택 체크박스로 현재 페이지의 모든 행을 한 번에 선택/해제한다', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch([buildOpenSpaceRow({ id: 'row-1', name: '스팟A' }), buildOpenSpaceRow({ id: 'row-2', name: '스팟B' })])
    );
    render(<AdminDataGridClient filterOptions={EMPTY_FILTER_OPTIONS} />);
    fireEvent.click(screen.getByText('📥 불러오기'));

    await screen.findByText('스팟A');
    fireEvent.click(screen.getByLabelText('이 페이지 전체 선택'));
    expect(await screen.findByText('2건 선택됨')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('이 페이지 전체 선택'));
    expect(screen.queryByText('2건 선택됨')).not.toBeInTheDocument();
  });

  it('표준 중분류와 노출 중분류를 골라 일괄 적용하면 두 API를 선택된 id 목록으로 호출한다', async () => {
    const fetchMock = mockFetch([
      buildOpenSpaceRow({ id: 'row-1', name: '스팟A' }),
      buildOpenSpaceRow({ id: 'row-2', name: '스팟B' }),
    ]);
    vi.stubGlobal('fetch', fetchMock);
    render(<AdminDataGridClient filterOptions={{ ...EMPTY_FILTER_OPTIONS, open_spaces: { ...EMPTY_FILTER_OPTIONS.open_spaces, categoryMins: ['키즈카페'] } }} />);
    fireEvent.click(screen.getByText('📥 불러오기'));

    await screen.findByText('스팟A');
    fireEvent.click(screen.getByLabelText('이 페이지 전체 선택'));
    await screen.findByText('2건 선택됨');
    // 체크 시 지연 로딩되는 서비스 카테고리 옵션이 실제로 채워질 때까지 기다린다 —
    // 옵션이 없는 상태에서 change를 쏘면 값이 반영되지 않는다.
    await waitFor(() => {
      const select = screen.getByDisplayValue('노출 중분류 선택...') as HTMLSelectElement;
      expect(select.options.length).toBeGreaterThan(1);
    });

    fireEvent.change(screen.getByDisplayValue('표준 중분류 선택...'), { target: { value: '키즈카페' } });
    fireEvent.change(screen.getByDisplayValue('노출 중분류 선택...'), { target: { value: 'svc-1' } });
    fireEvent.click(screen.getByText('일괄 적용'));

    await waitFor(() => {
      const categoryMinCall = fetchMock.mock.calls.find((c) => (c[0] as string).includes('/api/admin/data-grid/category-min'));
      expect(categoryMinCall).toBeDefined();
      expect(JSON.parse((categoryMinCall![1] as RequestInit).body as string)).toEqual({
        table: 'open_spaces',
        ids: ['row-1', 'row-2'],
        category_min: '키즈카페',
      });
      const mappingCall = fetchMock.mock.calls.find((c) => (c[0] as string).includes('/bulk-category-mapping'));
      expect(mappingCall).toBeDefined();
      expect(JSON.parse((mappingCall![1] as RequestInit).body as string)).toEqual({
        ids: ['row-1', 'row-2'],
        service_category_id: 'svc-1',
      });
    });
    expect(await screen.findByText(/적용했습니다/)).toBeInTheDocument();
  });
});
