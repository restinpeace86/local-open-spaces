import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MonthSummary } from './month-summary';

describe('MonthSummary', () => {
  it('총 예약 건수와 총 방문 인원을 보여준다', () => {
    render(<MonthSummary totalCount={12} totalHeadcount={48} />);
    expect(screen.getByText('12건')).toBeInTheDocument();
    expect(screen.getByText('48명')).toBeInTheDocument();
    expect(screen.getByText('이번 달 총 예약')).toBeInTheDocument();
    expect(screen.getByText('총 방문 인원')).toBeInTheDocument();
  });

  it('0건이어도 정상적으로 표시한다', () => {
    render(<MonthSummary totalCount={0} totalHeadcount={0} />);
    expect(screen.getByText('0건')).toBeInTheDocument();
    expect(screen.getByText('0명')).toBeInTheDocument();
  });
});
