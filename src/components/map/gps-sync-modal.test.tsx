import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GpsSyncModal } from './gps-sync-modal';

// [실시간 위치 싱크(GPS Sync 팝업)](2026-09-08 사용자 지시, todo.md 개선사항3-3):
// "'현재 위치({동네 이름})로 위치를 변경할까요?' 형태의 팝업"
describe('GpsSyncModal', () => {
  it('지시받은 문구 형태 그대로 동네 이름을 보여준다', () => {
    render(<GpsSyncModal neighborhoodName="성남시 분당구" onConfirm={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.getByText('현재 위치(성남시 분당구)로 위치를 변경할까요?')).toBeInTheDocument();
  });

  it('"변경하기"를 누르면 onConfirm이, "아니요"를 누르면 onDismiss가 호출된다', () => {
    const onConfirm = vi.fn();
    const onDismiss = vi.fn();
    render(<GpsSyncModal neighborhoodName="성남시 분당구" onConfirm={onConfirm} onDismiss={onDismiss} />);

    fireEvent.click(screen.getByText('변경하기'));
    expect(onConfirm).toHaveBeenCalled();
    expect(onDismiss).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('아니요'));
    expect(onDismiss).toHaveBeenCalled();
  });
});
