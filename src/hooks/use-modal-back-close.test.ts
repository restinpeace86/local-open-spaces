import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useModalBackClose } from './use-modal-back-close';

// Task 9-6-17: 모바일 물리/제스처 뒤로가기가 모달만 닫고 페이지 이탈을 막는지 검증.
describe('useModalBackClose', () => {
  it('마운트 시 히스토리에 더미 state를 쌓고, popstate 발생 시 onClose를 호출한다', () => {
    const onClose = vi.fn();
    const startLength = window.history.length;

    renderHook(() => useModalBackClose(onClose));

    expect(window.history.length).toBe(startLength + 1);
    expect(onClose).not.toHaveBeenCalled();

    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('popstate 없이(X/배경 클릭 등으로) 언마운트되면 쌓아둔 더미 state를 history.back()으로 회수한다', () => {
    const onClose = vi.fn();
    const backSpy = vi.spyOn(window.history, 'back');

    const { unmount } = renderHook(() => useModalBackClose(onClose));

    unmount();

    expect(backSpy).toHaveBeenCalledTimes(1);
    backSpy.mockRestore();
  });
});
