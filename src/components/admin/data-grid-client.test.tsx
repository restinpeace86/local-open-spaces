import { fireEvent, render, screen } from '@testing-library/react';
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
