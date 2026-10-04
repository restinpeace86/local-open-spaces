import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { StoreMultiSelect } from './store-multiselect';

// [지점별 다중선택 필터](2026-10-04 사용자 지시): "지점별로도 보는거 가능하게
// 좀 필터조건 추가해줘.. 전체도 다볼수 있지만 지점별(복수선택 가능)으로도
// 볼수있는 조건 추가" — 선택/해제, 검색, 초기화 동작을 검증한다.
const STORES = [
  { storeCode: '103', label: 'MAXX영등포점' },
  { storeCode: '322', label: '송파점' },
  { storeCode: '328', label: '양평점' },
];

describe('StoreMultiSelect', () => {
  it('선택이 없으면 "전체 지점"으로 표시된다', () => {
    render(<StoreMultiSelect stores={STORES} selected={new Set()} onChange={vi.fn()} />);
    expect(screen.getByText('전체 지점 ▾')).toBeTruthy();
  });

  it('선택 개수를 버튼 라벨에 반영한다', () => {
    render(<StoreMultiSelect stores={STORES} selected={new Set(['103', '322'])} onChange={vi.fn()} />);
    expect(screen.getByText('지점 2개 선택 ▾')).toBeTruthy();
  });

  it('체크박스를 누르면 onChange로 토글된 선택 집합을 넘긴다', () => {
    const onChange = vi.fn();
    render(<StoreMultiSelect stores={STORES} selected={new Set()} onChange={onChange} />);

    fireEvent.click(screen.getByText('전체 지점 ▾'));
    fireEvent.click(screen.getByLabelText('MAXX영등포점'));

    expect(onChange).toHaveBeenCalledWith(new Set(['103']));
  });

  it('이미 선택된 지점을 다시 누르면 선택에서 빠진다', () => {
    const onChange = vi.fn();
    render(<StoreMultiSelect stores={STORES} selected={new Set(['103'])} onChange={onChange} />);

    fireEvent.click(screen.getByText('지점 1개 선택 ▾'));
    fireEvent.click(screen.getByLabelText('MAXX영등포점'));

    expect(onChange).toHaveBeenCalledWith(new Set());
  });

  it('검색어로 지점명을 필터링한다', () => {
    render(<StoreMultiSelect stores={STORES} selected={new Set()} onChange={vi.fn()} />);
    fireEvent.click(screen.getByText('전체 지점 ▾'));

    fireEvent.change(screen.getByPlaceholderText('지점명 검색'), { target: { value: '송파' } });

    expect(screen.getByLabelText('송파점')).toBeTruthy();
    expect(screen.queryByLabelText('MAXX영등포점')).toBeNull();
  });

  it('선택 초기화 버튼을 누르면 빈 Set으로 onChange를 호출한다', () => {
    const onChange = vi.fn();
    render(<StoreMultiSelect stores={STORES} selected={new Set(['103', '322'])} onChange={onChange} />);

    fireEvent.click(screen.getByText('지점 2개 선택 ▾'));
    fireEvent.click(screen.getByText('↻ 선택 초기화'));

    expect(onChange).toHaveBeenCalledWith(new Set());
  });
});
