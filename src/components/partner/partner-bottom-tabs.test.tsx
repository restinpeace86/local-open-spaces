import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PartnerBottomTabs } from './partner-bottom-tabs';

const pushMock = vi.fn();
let mockPathname = '/partner/today';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => mockPathname,
}));

// [나드리픽 파트너 PMS Phase 1](2026-09-20 사용자 지시, docs/partner_spec.md 5절):
// 4개 탭(오늘/주간/월간/더보기) 노출과 클릭 시 라우팅, 활성 탭 스타일을 검증한다
// (소비자용 bottom-tabs.test.tsx와 동일한 검증 관례).
describe('PartnerBottomTabs', () => {
  beforeEach(() => {
    pushMock.mockClear();
    mockPathname = '/partner/today';
  });

  it('4개 탭(오늘/주간/월간/더보기)을 모두 노출한다', () => {
    render(<PartnerBottomTabs />);
    expect(screen.getByText('오늘')).toBeInTheDocument();
    expect(screen.getByText('주간')).toBeInTheDocument();
    expect(screen.getByText('월간')).toBeInTheDocument();
    expect(screen.getByText('더보기')).toBeInTheDocument();
  });

  it('탭을 클릭하면 해당 경로로 라우터 이동을 요청한다', () => {
    render(<PartnerBottomTabs />);
    fireEvent.click(screen.getByText('주간'));
    expect(pushMock).toHaveBeenCalledWith('/partner/weekly');
  });

  it('현재 경로와 일치하는 탭은 활성 스타일(text-blue-600)을 적용한다', () => {
    mockPathname = '/partner/weekly';
    render(<PartnerBottomTabs />);
    expect(screen.getByText('주간').closest('button')).toHaveClass('text-blue-600');
    expect(screen.getByText('오늘').closest('button')).not.toHaveClass('text-blue-600');
  });
});
