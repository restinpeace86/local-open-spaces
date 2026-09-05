import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RawDataModal } from './raw-data-modal';
import { AdminOpenSpaceRow } from './data-grid-client';

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
