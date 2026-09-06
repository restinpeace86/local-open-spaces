import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminDataGridClient } from './data-grid-client';

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

  // [관리자 화면 모바일 필터 영역 축소](2026-09-06 사용자 지시): "중분류나
  // 등록일등의 조건이 화면영역의 90%를 차지하고 있어... 조회하기 누르면 하단에
  // 검색된 데이터 나오는데 이 영역이 너무 작아서 목록 리스트 한건정도 밖에
  // 안보여" — 필터 바(shrink-0)에 높이 상한이 없어 좁은 화면에서 체크박스/버튼이
  // 여러 줄로 줄바꿈될수록 이 블록이 한없이 커지고 그만큼 결과 목록(flex-1)이
  // 줄어들던 문제. 필터 바에 max-h-[45vh]+overflow-y-auto를 고정해 결과 목록이
  // 항상 최소한의 공간을 확보하게 한다.
  it('필터 바(검색/중분류/등록일 등)에 최대 높이 제한과 자체 스크롤이 있어 결과 목록 영역을 밀어내지 않는다', () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ rows: [], total: 0 }) } as Response)));

    render(<AdminDataGridClient filterOptions={EMPTY_FILTER_OPTIONS} />);

    const searchInput = screen.getByPlaceholderText('제목/시설명, 주소 키워드 검색');
    const filterBar = searchInput.parentElement as HTMLElement;
    expect(filterBar.className).toContain('max-h-[45vh]');
    expect(filterBar.className).toContain('overflow-y-auto');
    expect(filterBar.className).toContain('shrink-0');
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
