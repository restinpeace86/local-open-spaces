import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SaessakMomGuideModal } from './saessak-mom-guide-modal';

describe('SaessakMomGuideModal', () => {
  it('description을 생략하면 기존 맘스픽 문구를 그대로 보여준다(기존 호출부 회귀 방지)', () => {
    render(<SaessakMomGuideModal onWriteClick={() => {}} onClose={() => {}} />);
    expect(screen.getByText('동네 핫플이나 정보를 하나 공유하고 맘스픽의 모든 기능을 이용해보세요.')).toBeInTheDocument();
  });

  it('description을 넘기면 그 문구로 override된다(2026-10-08 문화센터 재사용)', () => {
    render(<SaessakMomGuideModal onWriteClick={() => {}} onClose={() => {}} description="첫 글을 쓰면 문화센터를 볼 수 있어요." />);
    expect(screen.getByText('첫 글을 쓰면 문화센터를 볼 수 있어요.')).toBeInTheDocument();
  });

  it('CTA 클릭 시 onWriteClick이 호출된다', () => {
    const onWriteClick = vi.fn();
    render(<SaessakMomGuideModal onWriteClick={onWriteClick} onClose={() => {}} />);
    fireEvent.click(screen.getByText('첫 글 쓰러 가기'));
    expect(onWriteClick).toHaveBeenCalledTimes(1);
  });
});
