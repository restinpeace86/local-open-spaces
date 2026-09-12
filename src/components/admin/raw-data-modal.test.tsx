import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RawDataModal } from './raw-data-modal';
import { AdminEventRow, AdminOpenSpaceRow } from './data-grid-client';

// [상세 모달 URL/이미지 UX 개선](2026-08-29): "전체 컬럼" 목록의 http(s) URL 값이 클릭 시
// 새 창으로 열리는 링크로, 그중 이미지 URL은 실제 미리보기 이미지로 렌더링되는지 검증한다.
function buildRow(overrides: Partial<AdminOpenSpaceRow> = {}): AdminOpenSpaceRow {
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
    group_id: null,
    address: '서울시 종로구',
    location: null,
    location_precision: 'EXACT',
    is_free: true,
    operating_hours: null,
    info_url: 'https://example.com/detail',
    is_kids_friendly: false,
    has_parking: false,
    stroller_accessible: false,
    facility_type: 'ETC',
    target_age_group: null,
    raw_data: { ok: true },
    sigungu_name: null,
    created_at: null,
    updated_at: null,
    ...overrides,
  };
}

describe('RawDataModal URL/이미지 렌더링', () => {
  it('http(s) URL 값은 새 창으로 열리는 링크로 렌더링된다', () => {
    const row = buildRow();
    render(<RawDataModal table="open_spaces" row={row} categoryMinOptions={[]} onClose={vi.fn()} />);

    const link = screen.getByRole('link', { name: 'https://example.com/detail' });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('info_url이 이미지 확장자(.png 등)면 텍스트 대신 미리보기 img로 렌더링된다', () => {
    const row = buildRow({ info_url: 'https://example.com/photo.png' });
    render(<RawDataModal table="open_spaces" row={row} categoryMinOptions={[]} onClose={vi.fn()} />);

    const img = screen.getByAltText('info_url');
    expect(img).toHaveAttribute('src', 'https://example.com/photo.png');
    // 이미지 필드는 URL 텍스트 자체를 텍스트 링크로 중복 노출하지 않는다.
    expect(screen.queryByRole('link', { name: 'https://example.com/photo.png' })).not.toBeInTheDocument();
  });

  it('URL이 아닌 값은 일반 텍스트로 렌더링된다', () => {
    const row = buildRow();
    render(<RawDataModal table="open_spaces" row={row} categoryMinOptions={[]} onClose={vi.fn()} />);

    expect(screen.getAllByText('테스트 공간').length).toBeGreaterThan(0);
    expect(screen.getByText('서울시 종로구')).toBeInTheDocument();
  });
});

// [노출 중분류 개별 행 수정](2026-09-05 사용자 지시): "노출 중분류 변경할 수 있도록
// 해줘 open_spaces쪽에서" — 상세 모달에서 개별 행의 service_category_id를 직접
// 수정할 수 있는지 검증한다.
describe('RawDataModal — 노출 중분류(ServiceCategoryEditor)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const SERVICE_CATEGORIES = [
    { id: 'svc-1', parent_category: '자연/공원', category_name: '대형 근린공원 / 잔디광장' },
    { id: 'svc-2', parent_category: '키즈/놀이시설', category_name: '키즈카페 / 실내놀이터' },
  ];

  it('open_spaces 탭에서만 노출되고, events 탭에는 노출되지 않는다', () => {
    const row = buildRow();
    const { rerender } = render(
      <RawDataModal
        table="open_spaces"
        row={row}
        categoryMinOptions={[]}
        serviceCategories={SERVICE_CATEGORIES}
        onServiceCategoryUpdated={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText('노출 중분류(service_category_id) 수동 수정')).toBeInTheDocument();

    rerender(
      <RawDataModal
        table="events"
        row={row as unknown as AdminOpenSpaceRow}
        categoryMinOptions={[]}
        serviceCategories={SERVICE_CATEGORIES}
        onServiceCategoryUpdated={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.queryByText('노출 중분류(service_category_id) 수동 수정')).not.toBeInTheDocument();
  });

  it('현재 매핑된 노출 중분류가 있으면 배지로 보여준다', () => {
    const row = buildRow({ service_category_id: 'svc-2' });
    render(
      <RawDataModal
        table="open_spaces"
        row={row}
        categoryMinOptions={[]}
        serviceCategories={SERVICE_CATEGORIES}
        onServiceCategoryUpdated={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText('현재: 키즈/놀이시설 > 키즈카페 / 실내놀이터')).toBeInTheDocument();
  });

  it('값을 바꿔 저장하면 ids:[row.id]로 bulk-category-mapping을 호출하고 onServiceCategoryUpdated를 부른다', async () => {
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ updated_count: 1 }) } as Response)
    );
    vi.stubGlobal('fetch', fetchMock);
    const onServiceCategoryUpdated = vi.fn();
    const row = buildRow({ service_category_id: null });
    render(
      <RawDataModal
        table="open_spaces"
        row={row}
        categoryMinOptions={[]}
        serviceCategories={SERVICE_CATEGORIES}
        onServiceCategoryUpdated={onServiceCategoryUpdated}
        onClose={vi.fn()}
      />
    );

    fireEvent.change(screen.getByDisplayValue('(선택 안 함)'), { target: { value: 'svc-1' } });
    fireEvent.click(screen.getByText('저장'));

    await waitFor(() => expect(onServiceCategoryUpdated).toHaveBeenCalledWith('row-1', 'svc-1'));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/open-spaces/bulk-category-mapping',
      expect.objectContaining({ method: 'POST' })
    );
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toEqual({ ids: ['row-1'], service_category_id: 'svc-1' });
  });

  it('"(선택 안 함)"으로 되돌려 저장하면 service_category_id: null로 호출한다(선택 해제)', async () => {
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ updated_count: 1 }) } as Response)
    );
    vi.stubGlobal('fetch', fetchMock);
    const row = buildRow({ service_category_id: 'svc-1' });
    render(
      <RawDataModal
        table="open_spaces"
        row={row}
        categoryMinOptions={[]}
        serviceCategories={SERVICE_CATEGORIES}
        onServiceCategoryUpdated={vi.fn()}
        onClose={vi.fn()}
      />
    );

    fireEvent.change(screen.getByDisplayValue('자연/공원 > 대형 근린공원 / 잔디광장'), { target: { value: '' } });
    fireEvent.click(screen.getByText('저장'));

    await waitFor(() => {
      const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
      expect(body).toEqual({ ids: ['row-1'], service_category_id: null });
    });
  });
});

// [관리자용 블로그 큐레이션 모달](2026-09-05 사용자 지시, Decision 021): "관리자가
// 장소 상세 페이지에서 버튼을 누르면.." — 이 버튼이 open_spaces 탭에서만 노출되고
// 누르면 BlogCurationModal이 열리는지 확인한다(모달 내부 동작은
// blog-curation-modal.test.tsx가 별도로 검증).
describe('RawDataModal — 블로그 큐레이션 트리거', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('open_spaces 탭에서 버튼을 누르면 BlogCurationModal이 열린다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [], hasRecentReview: false, hasNoResults: true }) } as Response))
    );
    const row = buildRow();
    render(
      <RawDataModal
        table="open_spaces"
        row={row}
        categoryMinOptions={[]}
        serviceCategories={[]}
        onServiceCategoryUpdated={vi.fn()}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText('🔍 블로그로 큐레이션 (뱃지/노출 중분류 빠르게 채우기)'));

    expect(await screen.findByText('🔍 블로그로 큐레이션')).toBeInTheDocument();
  });

  it('events 탭에는 이 버튼이 없다', () => {
    const row = buildRow();
    render(<RawDataModal table="events" row={row as unknown as AdminOpenSpaceRow} categoryMinOptions={[]} onClose={vi.fn()} />);

    expect(screen.queryByText('🔍 블로그로 큐레이션 (뱃지/노출 중분류 빠르게 채우기)')).not.toBeInTheDocument();
  });
});

// [이벤트픽 관리자 블로그 큐레이션](2026-09-11 사용자 지시, todo.md 개선사항7-2):
// "Events 탭 상세 팝업에 블로그 큐레이션 버튼 추가" — events 탭에서만 노출되고
// 누르면 EventBlogCurationModal이 열리는지 확인한다(모달 내부 동작은
// event-blog-curation-modal.test.tsx가 별도로 검증).
describe('RawDataModal — 이벤트 블로그 큐레이션 트리거 (2026-09-11)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('events 탭에서 버튼을 누르면 EventBlogCurationModal이 열린다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ items: [], hasRecentReview: false, hasNoResults: true, urls: [] }),
        } as Response)
      )
    );
    const row = { ...buildRow(), title: '가을 단풍 축제' };
    render(<RawDataModal table="events" row={row as unknown as AdminEventRow} categoryMinOptions={[]} onClose={vi.fn()} />);

    fireEvent.click(screen.getByText('🔍 블로그 큐레이션 (방문 후기/추천 블로그 등록)'));

    expect(await screen.findByText('🔍 블로그 큐레이션')).toBeInTheDocument();
  });

  it('open_spaces 탭에는 이 버튼이 없다', () => {
    const row = buildRow();
    render(
      <RawDataModal
        table="open_spaces"
        row={row}
        categoryMinOptions={[]}
        serviceCategories={[]}
        onServiceCategoryUpdated={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.queryByText('🔍 블로그 큐레이션 (방문 후기/추천 블로그 등록)')).not.toBeInTheDocument();
  });
});

// [open_spaces 상세에서 스팟 큐레이션 바로 열기](2026-09-08 사용자 지시): "스팟큐레이션
// (가격, 메뉴 등 입력)도 블로그 큐레이션처럼.. 같은 레벨로 해당 버튼 아래에 스팟
// 큐레이션 버튼 만들어서.. 누르면 스팟큐레이션 팝업가서 입력하도록 해줘" — 이 버튼이
// open_spaces 탭에서만 노출되고 누르면 SpotCurationQuickModal(내부적으로
// CurationFormModal 재사용)이 열리는지 확인한다.
describe('RawDataModal — 스팟 큐레이션 트리거', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('open_spaces 탭에서 버튼을 누르면 스팟 큐레이션 팝업이 열린다(기존 큐레이션 없음 → 신규 등록 모드)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ item: null }) } as Response))
    );
    const row = buildRow({ name: '행복키즈카페', address: '경기도 성남시 분당구' });
    render(
      <RawDataModal
        table="open_spaces"
        row={row}
        categoryMinOptions={[]}
        serviceCategories={[]}
        onServiceCategoryUpdated={vi.fn()}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText('🏷️ 스팟 큐레이션 (대표 이미지/영업시간/가격/메뉴 입력)'));

    expect(await screen.findByText('+ 스팟 큐레이션 등록')).toBeInTheDocument();
    // 리스트 검색 없이 이미 정해진 스팟 이름이 곧바로 보인다(요약 카드).
    expect(screen.getAllByText('행복키즈카페').length).toBeGreaterThan(0);
  });

  it('이미 큐레이션이 있는 스팟이면 기존 값이 채워진 수정 모드로 연다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              item: {
                id: 'curation-1',
                spot_id: 'row-1',
                is_active: true,
                image_url: null,
                operating_hours_raw: null,
                open_time: null,
                close_time: null,
                break_start: null,
                break_end: null,
                last_order: null,
                menu_items: [{ name: '짜장면', price: 7000 }],
                child_fee: null,
                guardian_fee: null,
                naver_booking_url: null,
                curation_note: null,
                created_at: 't',
                updated_at: 't',
                open_spaces: { name: '행복키즈카페', address: '경기도 성남시 분당구', category: 'CULTURE' },
              },
            }),
        } as Response)
      )
    );
    const row = buildRow({ name: '행복키즈카페', address: '경기도 성남시 분당구' });
    render(
      <RawDataModal
        table="open_spaces"
        row={row}
        categoryMinOptions={[]}
        serviceCategories={[]}
        onServiceCategoryUpdated={vi.fn()}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText('🏷️ 스팟 큐레이션 (대표 이미지/영업시간/가격/메뉴 입력)'));

    expect(await screen.findByText('스팟 큐레이션 수정')).toBeInTheDocument();
    expect(screen.getByText(/짜장면/)).toBeInTheDocument();
  });

  it('events 탭에는 이 버튼이 없다', () => {
    const row = buildRow();
    render(<RawDataModal table="events" row={row as unknown as AdminOpenSpaceRow} categoryMinOptions={[]} onClose={vi.fn()} />);

    expect(screen.queryByText('🏷️ 스팟 큐레이션 (대표 이미지/영업시간/가격/메뉴 입력)')).not.toBeInTheDocument();
  });
});

// [open_spaces 상세에서 중복 스팟 검토](2026-09-09 사용자 지시): "8월 일반캠핑존
// C형.. 장소기준으로는 난지캠핑장 하나 아니야?" → "해당 스팟 상세에 대하여 버튼
// 만들어서 중복 스팟 검색이라던가 검수라던가.." — 이 버튼이 open_spaces 탭에서만
// 노출되고 누르면 SpotDedupQuickModal이 열리는지 확인한다(모달 내부 동작은
// spot-dedup-quick-modal.test.tsx가 별도로 검증).
describe('RawDataModal — 중복 스팟 검토 트리거', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('open_spaces 탭에서 버튼을 누르면 중복 스팟 검토 팝업이 열린다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) } as Response))
    );
    const row = buildRow();
    render(
      <RawDataModal
        table="open_spaces"
        row={row}
        categoryMinOptions={[]}
        serviceCategories={[]}
        onServiceCategoryUpdated={vi.fn()}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText('🔗 중복 스팟 검토 (같은 장소 병합)'));

    expect(await screen.findByText('🔗 중복 스팟 검토')).toBeInTheDocument();
  });

  it('events 탭에는 이 버튼이 없다', () => {
    const row = buildRow();
    render(<RawDataModal table="events" row={row as unknown as AdminOpenSpaceRow} categoryMinOptions={[]} onClose={vi.fn()} />);

    expect(screen.queryByText('🔗 중복 스팟 검토 (같은 장소 병합)')).not.toBeInTheDocument();
  });
});

// [개선사항2](todo.md, 2026-09-09) "다만 어떻게 병합되었는지 원본에 대한 정보는
// 어떤 방식이든 확인할 수 있어야합니다" — group_id가 있는(=목록에서 이미 대표로
// 걸러진) 행에서만 "병합된 원본 데이터 보기" 버튼이 뜨고, 누르면 같은 group_id의
// 전체 멤버를 보여주는지 확인한다.
describe('RawDataModal — 병합된 원본 데이터 보기(2026-09-09)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('group_id가 없으면 버튼이 보이지 않는다', () => {
    const row = buildRow({ group_id: null });
    render(
      <RawDataModal
        table="open_spaces"
        row={row}
        categoryMinOptions={[]}
        serviceCategories={[]}
        onServiceCategoryUpdated={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.queryByText('🔗 병합된 원본 데이터 보기')).not.toBeInTheDocument();
  });

  it('group_id가 있으면 버튼이 보이고, 누르면 같은 그룹의 전체 멤버를 불러와 보여준다', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('/api/admin/spot-dedup/group-members')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              items: [
                { id: 'a', name: '난지캠핑장 A', category: 'ETC', category_min: '캠핑장', source: 'seoul_public_reservation', source_type: 'SEOUL_YEYAK', is_dedup_representative: true, created_at: '2026-08-01T00:00:00Z' },
                { id: 'b', name: '난지캠핑장 B', category: 'ETC', category_min: '캠핑장', source: 'seoul_public_reservation', source_type: 'SEOUL_YEYAK', is_dedup_representative: false, created_at: '2026-08-02T00:00:00Z' },
              ],
            }),
        } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) } as Response);
    });
    vi.stubGlobal('fetch', fetchMock);
    const row = buildRow({ group_id: 'group-1' });
    render(
      <RawDataModal
        table="open_spaces"
        row={row}
        categoryMinOptions={[]}
        serviceCategories={[]}
        onServiceCategoryUpdated={vi.fn()}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText('🔗 병합된 원본 데이터 보기'));

    expect(await screen.findByText('🔗 병합된 원본 데이터 (2건)')).toBeInTheDocument();
    expect(screen.getByText('난지캠핑장 A')).toBeInTheDocument();
    expect(screen.getByText('난지캠핑장 B')).toBeInTheDocument();
    expect(screen.getByText('대표')).toBeInTheDocument();
    expect(fetchMock.mock.calls.some((c) => (c[0] as string).includes('group_id=group-1'))).toBe(true);
  });

  it('events 탭에는 이 버튼이 없다', () => {
    const row = buildRow({ group_id: 'group-1' });
    render(<RawDataModal table="events" row={row as unknown as AdminOpenSpaceRow} categoryMinOptions={[]} onClose={vi.fn()} />);

    expect(screen.queryByText('🔗 병합된 원본 데이터 보기')).not.toBeInTheDocument();
  });
});

// [드래그 시 팝업 닫힘 버그 수정](2026-09-05 사용자 지시): "마우스로 살짝 드래그&드롭
// 하면 팝업창이 그냥 꺼져버려.." — RawDataModal의 배경 클릭 닫기가 useBackdropDismiss로
// 교체됐는지, 기존 "배경을 눌러 닫는" 정상 동작은 그대로 유지되는지 함께 검증한다.
describe('RawDataModal — 배경 클릭/드래그 닫힘 동작', () => {
  it('배경을 직접 클릭(mousedown+click)하면 닫힌다(기존 동작 유지)', () => {
    const onClose = vi.fn();
    const row = buildRow();
    const { container } = render(<RawDataModal table="open_spaces" row={row} categoryMinOptions={[]} onClose={onClose} />);
    const backdrop = container.firstElementChild as HTMLElement;

    fireEvent.mouseDown(backdrop, { target: backdrop });
    fireEvent.click(backdrop, { target: backdrop });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('콘텐츠 카드 안에서 드래그를 시작했다면(텍스트 선택 등) 배경으로 흘러나가도 닫히지 않는다', () => {
    const onClose = vi.fn();
    const row = buildRow();
    const { container } = render(<RawDataModal table="open_spaces" row={row} categoryMinOptions={[]} onClose={onClose} />);
    const backdrop = container.firstElementChild as HTMLElement;
    const card = backdrop.firstElementChild as HTMLElement;

    fireEvent.mouseDown(card); // 드래그 시작 지점: 카드 안
    fireEvent.click(backdrop, { target: backdrop }); // 드래그로 흘러나가 배경에서 mouseup

    expect(onClose).not.toHaveBeenCalled();
  });
});

// [open_spaces 삭제 기능](2026-09-06 사용자 지시): "내가 불필요하다고 생각하는건
// 관리자 화면에서 삭제하는게 더 좋을까?" → 개별 삭제(RawDataModal).
describe('RawDataModal — open_spaces 개별 삭제', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    // window.confirm은 vi.spyOn으로 매 테스트마다 새로 씌우는데, mockRestore 없이
    // 두면 같은 spy 객체가 테스트 전체에 걸쳐 호출을 계속 누적한다 — 그 상태로
    // .mock.calls[0]을 확인하면 이전 테스트의 호출을 잘못 읽게 된다(실측으로 확인한
    // 케이스). 매 테스트 후 원상복구해 다음 테스트가 깨끗한 상태에서 시작하게 한다.
    vi.restoreAllMocks();
  });

  function mockFetchByUrl(handlers: { impact?: Record<string, number>; deleteOk?: boolean; deleteError?: string }) {
    return vi.fn((url: string, init?: RequestInit) => {
      if (url.includes('/api/admin/open-spaces') && (!init || init.method === undefined)) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              impact: {
                events: 0,
                reservations: 0,
                spot_curations: 0,
                spot_weather_caches: 0,
                mom_pick_posts: 0,
                user_bookmarks: 0,
                ...handlers.impact,
              },
            }),
        } as Response);
      }
      if (url.includes('/api/admin/open-spaces') && init?.method === 'DELETE') {
        const ok = handlers.deleteOk !== false;
        return Promise.resolve({
          ok,
          json: () => Promise.resolve(ok ? { deleted_count: 1 } : { error: handlers.deleteError ?? '삭제 실패' }),
        } as Response);
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    });
  }

  it('삭제 버튼을 눌러 확인하면 영향 범위를 먼저 조회하고, 확인 후 DELETE를 호출해 onDeleted를 부른다', async () => {
    const fetchMock = mockFetchByUrl({});
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onDeleted = vi.fn();
    const row = buildRow();
    render(<RawDataModal table="open_spaces" row={row} categoryMinOptions={[]} onClose={vi.fn()} onDeleted={onDeleted} />);

    fireEvent.click(screen.getByText('🗑 이 스팟 삭제'));

    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith('row-1'));
    const previewCall = fetchMock.mock.calls.find((c) => (c[0] as string).includes('ids=row-1') && !(c[1] as RequestInit)?.method);
    expect(previewCall).toBeDefined();
    const deleteCall = fetchMock.mock.calls.find((c) => (c[1] as RequestInit)?.method === 'DELETE');
    expect(deleteCall).toBeDefined();
    expect(JSON.parse((deleteCall![1] as RequestInit).body as string)).toEqual({ ids: ['row-1'] });
  });

  it('예약/북마크가 있으면 확인창 문구에 경고로 포함한다', async () => {
    const fetchMock = mockFetchByUrl({ impact: { reservations: 2, user_bookmarks: 5 } });
    vi.stubGlobal('fetch', fetchMock);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const row = buildRow();
    render(<RawDataModal table="open_spaces" row={row} categoryMinOptions={[]} onClose={vi.fn()} onDeleted={vi.fn()} />);

    fireEvent.click(screen.getByText('🗑 이 스팟 삭제'));

    await waitFor(() => expect(confirmSpy).toHaveBeenCalled());
    const message = confirmSpy.mock.calls[0][0] as string;
    expect(message).toContain('실제 예약 2건');
    expect(message).toContain('사용자 북마크 5건');
  });

  it('확인창에서 취소하면 DELETE를 호출하지 않는다', async () => {
    const fetchMock = mockFetchByUrl({});
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const row = buildRow();
    render(<RawDataModal table="open_spaces" row={row} categoryMinOptions={[]} onClose={vi.fn()} onDeleted={vi.fn()} />);

    fireEvent.click(screen.getByText('🗑 이 스팟 삭제'));

    await waitFor(() => {
      const previewCall = fetchMock.mock.calls.find((c) => !(c[1] as RequestInit)?.method);
      expect(previewCall).toBeDefined();
    });
    expect(fetchMock.mock.calls.find((c) => (c[1] as RequestInit)?.method === 'DELETE')).toBeUndefined();
  });

  it('실제 예약이 있어 서버가 거부하면(409) 에러 문구를 보여준다', async () => {
    const fetchMock = mockFetchByUrl({
      impact: { reservations: 1 },
      deleteOk: false,
      deleteError: '실제 예약 1건이 걸려있어 삭제할 수 없습니다.',
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const row = buildRow();
    render(<RawDataModal table="open_spaces" row={row} categoryMinOptions={[]} onClose={vi.fn()} onDeleted={vi.fn()} />);

    fireEvent.click(screen.getByText('🗑 이 스팟 삭제'));

    expect(await screen.findByText('실제 예약 1건이 걸려있어 삭제할 수 없습니다.')).toBeInTheDocument();
  });

  it('events 탭에는 삭제 버튼이 없다', () => {
    const row = buildRow();
    render(<RawDataModal table="events" row={row as unknown as AdminOpenSpaceRow} categoryMinOptions={[]} onClose={vi.fn()} />);

    expect(screen.queryByText('🗑 이 스팟 삭제')).not.toBeInTheDocument();
  });
});

// [원문 JSON 필드를 HTML로 보기](2026-09-06 사용자 지시): "DTLCONT 같은 컬럼에는
// 글이 쫙 있긴한데.. html로 되어있는거 같아.. 해당 컬럼만 좀 눌러서 다시
// 팝업띄워서 html로 보고 닫을수 있는 기능달던가해줘"
describe('RawDataModal — 원문 JSON 필드를 HTML로 보기', () => {
  it('HTML 태그가 들어있는 필드에 "HTML로 보기" 버튼이 뜨고, 누르면 렌더링된 팝업이 뜬다', () => {
    const row = buildRow({ raw_data: { DTLCONT: '<p>공공시설 <b>예약</b> 안내</p>', PLAINFIELD: '그냥 텍스트' } });
    render(<RawDataModal table="open_spaces" row={row} categoryMinOptions={[]} onClose={vi.fn()} />);

    const openButton = screen.getByText('🔍 DTLCONT HTML로 보기');
    expect(openButton).toBeInTheDocument();
    // 태그가 없는 필드는 버튼이 생기지 않는다.
    expect(screen.queryByText('🔍 PLAINFIELD HTML로 보기')).not.toBeInTheDocument();

    fireEvent.click(openButton);

    expect(screen.getByText('DTLCONT (HTML 미리보기)')).toBeInTheDocument();
    // dangerouslySetInnerHTML로 렌더링돼 <b> 태그는 실제 요소가 되고 텍스트만 보인다.
    expect(screen.getByText('예약').tagName).toBe('B');
  });

  it('닫기 버튼을 누르면 팝업이 사라진다', () => {
    const row = buildRow({ raw_data: { DTLCONT: '<p>본문</p>' } });
    render(<RawDataModal table="open_spaces" row={row} categoryMinOptions={[]} onClose={vi.fn()} />);

    fireEvent.click(screen.getByText('🔍 DTLCONT HTML로 보기'));
    expect(screen.getByText('DTLCONT (HTML 미리보기)')).toBeInTheDocument();

    // 메인 모달과 HTML 미리보기 팝업 둘 다 "닫기" 버튼이 있어(aria-label 동일),
    // 나중에 렌더링된(문서 순서상 뒤에 오는) 팝업 쪽 버튼을 정확히 짚는다.
    const closeButtons = screen.getAllByLabelText('닫기');
    fireEvent.click(closeButtons[closeButtons.length - 1]);

    expect(screen.queryByText('DTLCONT (HTML 미리보기)')).not.toBeInTheDocument();
  });

  it('HTML처럼 보이는 필드가 없으면 버튼 자체를 보여주지 않는다', () => {
    const row = buildRow({ raw_data: { NAME: '그냥 이름', COUNT: 3 } });
    render(<RawDataModal table="open_spaces" row={row} categoryMinOptions={[]} onClose={vi.fn()} />);

    expect(screen.queryByText(/HTML로 보기/)).not.toBeInTheDocument();
  });
});

// [원문 JSON 필드 정돈해서 보기](2026-09-12 사용자 지시): "DTLCONT 해당 컬럼에 대하여
// html로 안되어있는것들에 \r\n&nbsp;&nbsp; - 4회차 - ... 이런식으로 되어있으면
// \r \n같은거 적용해서 정돈된 글로 볼수있게해줘.. html이 아닌경우 이와 같이
// 되어있는지 확인하고 해당 컬럼 글만 정돈돼서 볼수있게".
describe('RawDataModal — 원문 JSON 필드 정돈해서 보기', () => {
  it('HTML 태그 없이 \\r\\n·엔티티만 섞인 필드에 "정돈해서 보기" 버튼이 뜨고, 누르면 정돈된 텍스트 팝업이 뜬다', () => {
    const row = buildRow({
      raw_data: {
        DTLCONT: '\r\n&nbsp;&nbsp; - 4회차 - 14:30~15:50 &nbsp;(60명)     \r\n&nbsp;&nbsp; - 5회차 - 16:00~17:40 &nbsp;(60명)',
        PLAINFIELD: '그냥 텍스트',
      },
    });
    render(<RawDataModal table="open_spaces" row={row} categoryMinOptions={[]} onClose={vi.fn()} />);

    const openButton = screen.getByText('📄 DTLCONT 정돈해서 보기');
    expect(openButton).toBeInTheDocument();
    // 개행/엔티티가 없는 필드는 버튼이 생기지 않는다.
    expect(screen.queryByText('📄 PLAINFIELD 정돈해서 보기')).not.toBeInTheDocument();

    fireEvent.click(openButton);

    expect(screen.getByText('DTLCONT (정돈된 텍스트)')).toBeInTheDocument();
    expect(screen.getByText(/4회차 - 14:30~15:50 \(60명\)/)).toBeInTheDocument();
    expect(screen.getByText(/5회차 - 16:00~17:40 \(60명\)/)).toBeInTheDocument();
  });

  it('진짜 HTML 태그가 있는 필드는 "정돈해서 보기"가 아니라 "HTML로 보기" 버튼만 뜬다(상호 배타)', () => {
    const row = buildRow({ raw_data: { DTLCONT: '<p>공공시설 예약 안내</p>\r\n&nbsp;추가 안내' } });
    render(<RawDataModal table="open_spaces" row={row} categoryMinOptions={[]} onClose={vi.fn()} />);

    expect(screen.getByText('🔍 DTLCONT HTML로 보기')).toBeInTheDocument();
    expect(screen.queryByText('📄 DTLCONT 정돈해서 보기')).not.toBeInTheDocument();
  });

  it('닫기 버튼을 누르면 팝업이 사라진다', () => {
    const row = buildRow({ raw_data: { DTLCONT: '본문\r\n둘째줄' } });
    render(<RawDataModal table="open_spaces" row={row} categoryMinOptions={[]} onClose={vi.fn()} />);

    fireEvent.click(screen.getByText('📄 DTLCONT 정돈해서 보기'));
    expect(screen.getByText('DTLCONT (정돈된 텍스트)')).toBeInTheDocument();

    const closeButtons = screen.getAllByLabelText('닫기');
    fireEvent.click(closeButtons[closeButtons.length - 1]);

    expect(screen.queryByText('DTLCONT (정돈된 텍스트)')).not.toBeInTheDocument();
  });

  it('정돈이 필요한(개행/엔티티가 있는) 필드가 없으면 버튼 자체를 보여주지 않는다', () => {
    const row = buildRow({ raw_data: { NAME: '그냥 한 줄 이름', COUNT: 3 } });
    render(<RawDataModal table="open_spaces" row={row} categoryMinOptions={[]} onClose={vi.fn()} />);

    expect(screen.queryByText(/정돈해서 보기/)).not.toBeInTheDocument();
  });
});

// [개선사항10](2026-09-11 사용자 지시, implementation/todo.md): "매칭되는 스팟이 없는
// 경우 관리자가 수동으로 스팟을 지정.. 관리자 툴 플로우". events 탭에서만 노출되는
// "연결된 스팟" 편집기(SpaceLinkEditor, 내부적으로 기존 SpotPicker 재사용)를 검증한다.
describe('RawDataModal — 연결된 스팟(space_id) 편집기 (개선사항10, 2026-09-11)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('space_id가 없으면 "미연결" 배지와 검색창을 보여준다', () => {
    const row = { ...buildRow(), title: '가을 축제', space_id: null };
    render(
      <RawDataModal
        table="events"
        row={row as unknown as AdminEventRow}
        categoryMinOptions={[]}
        onClose={vi.fn()}
        onSpaceLinkUpdated={vi.fn()}
      />
    );

    expect(screen.getByText('미연결')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/어느 스팟인가요/)).toBeInTheDocument();
  });

  it('space_id가 있으면 "연결됨" 배지를 보여준다', () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ space: { id: 'space-1', name: '오름공원', standard_name: null, service_category_id: null } }),
      } as Response)
    );
    vi.stubGlobal('fetch', fetchMock);
    const row = { ...buildRow(), title: '가을 축제', space_id: 'space-1' };
    render(
      <RawDataModal
        table="events"
        row={row as unknown as AdminEventRow}
        categoryMinOptions={[]}
        onClose={vi.fn()}
        onSpaceLinkUpdated={vi.fn()}
      />
    );

    expect(screen.getByText('연결됨')).toBeInTheDocument();
  });

  it('스팟을 검색해 선택하면 space-link를 PATCH하고 onSpaceLinkUpdated를 호출한다', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url.includes('/api/spots/search')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ items: [{ id: 'space-9', name: '오름공원', address: '제주' }] }),
        } as Response);
      }
      if (url.includes('/api/admin/data-grid/space-link')) {
        void init;
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ row: { id: 'row-1', space_id: 'space-9' } }) } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
    });
    vi.stubGlobal('fetch', fetchMock);
    const onSpaceLinkUpdated = vi.fn();
    const row = { ...buildRow(), title: '가을 축제', space_id: null };
    render(
      <RawDataModal
        table="events"
        row={row as unknown as AdminEventRow}
        categoryMinOptions={[]}
        onClose={vi.fn()}
        onSpaceLinkUpdated={onSpaceLinkUpdated}
      />
    );

    fireEvent.change(screen.getByPlaceholderText(/어느 스팟인가요/), { target: { value: '오름공원' } });
    fireEvent.mouseDown(await screen.findByText('오름공원'));

    await waitFor(() => expect(onSpaceLinkUpdated).toHaveBeenCalledWith('row-1', 'space-9'));
    // [연결된 스팟의 노출 중분류 확인/입력](2026-09-12): 선택 직후 같은 URL로 노출
    // 중분류 조회(GET)도 함께 나가므로 method로 PATCH 호출만 콕 집어 검증한다.
    const patchCall = fetchMock.mock.calls.find(
      (c) => (c[0] as string).includes('/api/admin/data-grid/space-link') && (c[1] as RequestInit)?.method === 'PATCH'
    );
    expect(patchCall).toBeDefined();
    expect(JSON.parse((patchCall![1] as RequestInit).body as string)).toEqual({ id: 'row-1', space_id: 'space-9' });
  });

  // [연결된 스팟의 노출 중분류 확인/입력](2026-09-12 사용자 지시): "연결하면 연결됨이라고
  // 뜨는데.. 해당 장소가 노출 중분류가 있는지 확인하고 알려줘.. 없으면 입력하라고 하고
  // 저장 가능하도록 해줘".
  it('연결된 스팟에 노출 중분류가 있으면 초록 배지로 보여준다', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('/api/admin/data-grid/space-link')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({ space: { id: 'space-1', name: '오름공원', standard_name: null, service_category_id: 'cat-1' } }),
        } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
    });
    vi.stubGlobal('fetch', fetchMock);
    const row = { ...buildRow(), title: '가을 축제', space_id: 'space-1' };
    render(
      <RawDataModal
        table="events"
        row={row as unknown as AdminEventRow}
        categoryMinOptions={[]}
        serviceCategories={[{ id: 'cat-1', parent_category: '체험', category_name: '생태학습' }]}
        onClose={vi.fn()}
        onSpaceLinkUpdated={vi.fn()}
      />
    );

    expect(await screen.findByText(/노출 중분류: 체험 > 생태학습/)).toBeInTheDocument();
    expect(screen.queryByText(/노출 중분류가 없어요/)).not.toBeInTheDocument();
  });

  it('연결된 스팟에 노출 중분류가 없으면 경고와 선택·저장 UI를 보여주고, 저장하면 배지로 바뀐다', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url.includes('/api/admin/data-grid/space-link')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({ space: { id: 'space-1', name: '방이동생태학습관', standard_name: null, service_category_id: null } }),
        } as Response);
      }
      if (url.includes('/api/admin/open-spaces/bulk-category-mapping')) {
        void init;
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ updated: 1 }) } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
    });
    vi.stubGlobal('fetch', fetchMock);
    const row = { ...buildRow(), title: '가을 축제', space_id: 'space-1' };
    render(
      <RawDataModal
        table="events"
        row={row as unknown as AdminEventRow}
        categoryMinOptions={[]}
        serviceCategories={[{ id: 'cat-1', parent_category: '체험', category_name: '생태학습' }]}
        onClose={vi.fn()}
        onSpaceLinkUpdated={vi.fn()}
      />
    );

    expect(await screen.findByText(/노출 중분류가 없어요/)).toBeInTheDocument();

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'cat-1' } });
    fireEvent.click(screen.getByText('저장'));

    await waitFor(() => expect(screen.getByText(/노출 중분류: 체험 > 생태학습/)).toBeInTheDocument());
    expect(screen.queryByText(/노출 중분류가 없어요/)).not.toBeInTheDocument();

    const mappingCall = fetchMock.mock.calls.find((c) => (c[0] as string).includes('/api/admin/open-spaces/bulk-category-mapping'));
    expect(mappingCall).toBeDefined();
    expect(JSON.parse((mappingCall![1] as RequestInit).body as string)).toEqual({ ids: ['space-1'], service_category_id: 'cat-1' });
  });

  it('open_spaces 탭에는 이 편집기가 없다', () => {
    const row = buildRow();
    render(
      <RawDataModal
        table="open_spaces"
        row={row}
        categoryMinOptions={[]}
        serviceCategories={[]}
        onServiceCategoryUpdated={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.queryByText('연결된 스팟(open_spaces)')).not.toBeInTheDocument();
  });
});
