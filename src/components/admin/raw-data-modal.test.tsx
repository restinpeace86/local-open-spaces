import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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
