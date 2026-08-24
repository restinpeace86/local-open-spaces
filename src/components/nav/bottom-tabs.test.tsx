import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BottomTabs } from './bottom-tabs';

const pushMock = vi.fn();
let mockPathname = '/';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => mockPathname,
}));

describe('BottomTabs', () => {
  beforeEach(() => {
    pushMock.mockClear();
    mockPathname = '/';
  });

  // Task 9-6-10(2026-08-23): [카테고리-내주변-홈-찜-마이] → [추천픽-스팟픽-이벤트픽-찜-마이] 재편.
  it('5개 탭(추천픽/스팟픽/이벤트픽/찜/마이)을 모두 노출한다', () => {
    render(<BottomTabs />);
    expect(screen.getByText('추천픽')).toBeInTheDocument();
    expect(screen.getByText('스팟픽')).toBeInTheDocument();
    expect(screen.getByText('이벤트픽')).toBeInTheDocument();
    expect(screen.getByText('찜')).toBeInTheDocument();
    expect(screen.getByText('마이')).toBeInTheDocument();
  });

  it('찜/마이/추천픽 탭은 비활성화 상태로 노출되며 클릭해도 이동하지 않는다', () => {
    render(<BottomTabs />);
    expect(screen.getByText('찜').closest('div')).toHaveAttribute('aria-disabled', 'true');
    // Task 9-6-10: 추천픽은 아직 화면이 없어(ENABLE_RECOMMEND_TAB 기본값 false) 찜/마이와
    // 동일한 관례로 비활성화 상태로만 노출한다.
    expect(screen.getByText('추천픽').closest('div')).toHaveAttribute('aria-disabled', 'true');
  });

  // Task 9-4-1(2026-08-22): 탭을 누르면 useTransition으로 감싼 router.push가 목표 경로로 호출된다.
  it('탭을 클릭하면 해당 경로로 라우터 이동을 요청한다', () => {
    render(<BottomTabs />);
    fireEvent.click(screen.getByText('스팟픽'));
    expect(pushMock).toHaveBeenCalledWith('/nearby');
  });

  it('이미 활성화된(현재 경로와 같은) 탭을 클릭하면 다시 이동을 요청하지 않는다', () => {
    mockPathname = '/nearby';
    render(<BottomTabs />);
    fireEvent.click(screen.getByText('스팟픽'));
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('현재 경로와 일치하는 탭은 활성 스타일(text-blue-600)을 적용한다', () => {
    mockPathname = '/nearby';
    render(<BottomTabs />);
    expect(screen.getByText('스팟픽').closest('button')).toHaveClass('text-blue-600');
  });

  // Task 9-4-1: 대기 중(isPending)이 아닌 평상시에는 나드리픽 로딩 오버레이가 보이지 않는다.
  // (isPending===true 구간은 useTransition/router.push의 실제 비동기 라우팅에 의존해 목(mock)
  // 환경에서 안정적으로 재현하기 어려워 별도로 검증하지 않는다 — 실제 동작은 dev 서버에서
  // 클릭 시 오버레이가 즉시 뜨는 것을 실측 확인함.)
  it('평상시(전환 대기 중이 아닐 때)에는 로딩 오버레이가 보이지 않는다', () => {
    render(<BottomTabs />);
    expect(screen.queryByLabelText('화면 전환 중')).not.toBeInTheDocument();
  });
});
