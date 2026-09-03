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
  // [todo.md 개선사항 7](2026-09-03): 맨 왼쪽 슬롯을 미구현 "추천픽"에서 실제 라이브
  // 기능인 "맘스픽"(/mom-pick)으로 교체.
  // [하단 탭에서 "찜" 제거](2026-09-03 사용자 지시): "찜된 데이터는 마이페이지 안에서
  // 보도록 할 것"이라는 명시적 지시로 4개 탭(맘스픽/스팟픽/이벤트픽/마이)만 남는다.
  it('4개 탭(맘스픽/스팟픽/이벤트픽/마이)을 모두 노출하고, 찜 탭은 더 이상 노출하지 않는다', () => {
    render(<BottomTabs />);
    expect(screen.getByText('맘스픽')).toBeInTheDocument();
    expect(screen.getByText('스팟픽')).toBeInTheDocument();
    expect(screen.getByText('이벤트픽')).toBeInTheDocument();
    expect(screen.getByText('마이')).toBeInTheDocument();
    expect(screen.queryByText('찜')).not.toBeInTheDocument();
  });

  // [todo.md 개선사항 7](2026-09-03): 맘스픽은 라이브 기능이라 더 이상 비활성화 플래그가
  // 없다 — 다른 활성 탭(스팟픽)과 동일하게 클릭 시 바로 라우팅돼야 한다.
  it('맘스픽 탭은 비활성화되지 않고 클릭하면 /mom-pick으로 이동을 요청한다', () => {
    render(<BottomTabs />);
    expect(screen.getByText('맘스픽').closest('button')).toBeInTheDocument();
    fireEvent.click(screen.getByText('맘스픽'));
    expect(pushMock).toHaveBeenCalledWith('/mom-pick');
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
