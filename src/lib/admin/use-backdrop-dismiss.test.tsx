import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useBackdropDismiss } from './use-backdrop-dismiss';

// [블로그 큐레이션 팝업 드래그 시 창 닫힘 버그 수정](2026-09-05 사용자 지시): "마우스로
// 살짝 드래그&드롭하면 팝업창이 그냥 꺼져버려.." — 실측 원인: 카드 안에서 텍스트를
// 드래그로 선택하다가 마우스가 카드 밖으로 살짝 나간 채 놓으면, click 이벤트의 target이
// 카드가 아니라 배경(둘의 공통 조상)이 되어 카드의 stopPropagation을 거치지 않고
// 배경의 onClose가 그대로 실행된다.
function TestModal({ onClose }: { onClose: () => void }) {
  const backdropDismiss = useBackdropDismiss(onClose);
  return (
    <div data-testid="backdrop" {...backdropDismiss}>
      <div data-testid="card" onClick={(e) => e.stopPropagation()}>
        <span data-testid="text">드래그로 선택할 텍스트</span>
      </div>
    </div>
  );
}

describe('useBackdropDismiss', () => {
  it('배경을 mousedown+click 모두로 직접 클릭하면 닫는다', () => {
    const onClose = vi.fn();
    render(<TestModal onClose={onClose} />);
    const backdrop = screen.getByTestId('backdrop');

    fireEvent.mouseDown(backdrop, { target: backdrop });
    fireEvent.click(backdrop, { target: backdrop });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('카드 안에서 시작해 카드 안에서 끝나는 일반 클릭은 닫지 않는다', () => {
    const onClose = vi.fn();
    render(<TestModal onClose={onClose} />);
    const card = screen.getByTestId('card');

    fireEvent.mouseDown(card);
    fireEvent.click(card);

    expect(onClose).not.toHaveBeenCalled();
  });

  // 핵심 회귀 테스트: mousedown은 카드 안(드래그 시작)에서 일어났지만, 텍스트 선택
  // 드래그로 마우스가 흘러나가 click 이벤트의 target이 배경이 되는 상황을 재현한다.
  it('카드 안에서 드래그를 시작했다면 click의 target이 배경이어도 닫지 않는다', () => {
    const onClose = vi.fn();
    render(<TestModal onClose={onClose} />);
    const backdrop = screen.getByTestId('backdrop');
    const card = screen.getByTestId('card');

    fireEvent.mouseDown(card); // 드래그 시작 지점: 카드 안
    fireEvent.click(backdrop, { target: backdrop }); // 드래그로 흘러나가 배경에서 mouseup

    expect(onClose).not.toHaveBeenCalled();
  });

  it('연속된 두 번의 상호작용에서 이전 mousedown 상태가 다음 클릭에 새지 않는다', () => {
    const onClose = vi.fn();
    render(<TestModal onClose={onClose} />);
    const backdrop = screen.getByTestId('backdrop');
    const card = screen.getByTestId('card');

    // 1) 카드 안에서 드래그 시작 → 배경에서 놓임(닫히지 않아야 함)
    fireEvent.mouseDown(card);
    fireEvent.click(backdrop, { target: backdrop });
    expect(onClose).not.toHaveBeenCalled();

    // 2) 이번엔 진짜로 배경을 눌러서 시작 → 배경에서 놓임(닫혀야 함)
    fireEvent.mouseDown(backdrop, { target: backdrop });
    fireEvent.click(backdrop, { target: backdrop });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
