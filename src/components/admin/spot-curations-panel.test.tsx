import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SpotCurationsPanel } from './spot-curations-panel';

// [스팟픽 UI/UX 개선 4종](2026-09-01 사용자 지시) 항목 3: 관리자 '스팟 큐레이션' 탭의
// 장소 검색 자동완성(디바운스, 2글자 이상, 키즈친화 식당 중분류로 한정, 동/읍/면 축약
// 주소 표시)을 검증한다.
describe('SpotCurationsPanel 신규 등록 — 장소 검색 자동완성 (2026-09-01)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  function openCreateModal() {
    render(<SpotCurationsPanel />);
    fireEvent.click(screen.getByText('+ 스팟 큐레이션 등록'));
  }

  it('1글자만 입력하면 검색 API를 호출하지 않는다', async () => {
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) } as Response));
    vi.stubGlobal('fetch', fetchMock);
    vi.useFakeTimers();

    openCreateModal();
    fireEvent.change(screen.getByPlaceholderText('장소명 2글자 이상 입력(예: 키즈)'), { target: { value: '키' } });
    await vi.advanceTimersByTimeAsync(500);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('2글자 이상 입력하면 category_min=놀이방식당으로 좁혀 검색한다', async () => {
    const fetchMock = vi.fn((_url: string) => Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) } as Response));
    vi.stubGlobal('fetch', fetchMock);
    vi.useFakeTimers();

    openCreateModal();
    fireEvent.change(screen.getByPlaceholderText('장소명 2글자 이상 입력(예: 키즈)'), { target: { value: '키즈' } });
    await vi.advanceTimersByTimeAsync(500);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrl = fetchMock.mock.calls[0][0];
    expect(calledUrl).toContain('/api/spots/search?');
    expect(decodeURIComponent(calledUrl)).toContain('q=키즈');
    expect(decodeURIComponent(calledUrl)).toContain('category_min=놀이방식당');
  });

  it('검색 결과에 "(가능동)" 표기가 있으면 동 이름만 짧게 보여준다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              items: [{ id: 'spot-1', name: '플레이버디 키즈카페', address: '경기도 의정부시 가금로 29 (가능동)' }],
            }),
        } as Response)
      )
    );

    openCreateModal();
    fireEvent.change(screen.getByPlaceholderText('장소명 2글자 이상 입력(예: 키즈)'), { target: { value: '플레이버디' } });

    await screen.findByText('플레이버디 키즈카페');
    expect(screen.getByText('가능동')).toBeInTheDocument();
    expect(screen.queryByText('경기도 의정부시 가금로 29 (가능동)')).not.toBeInTheDocument();
  });

  it('"(동/읍/면)" 표기가 없는 주소는 앞 3토큰만 간략히 보여준다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              items: [{ id: 'spot-1', name: '킹콩점프', address: '경기도 용인시 기흥구 흥덕중앙로 59 (영덕동, 흥덕노블레스)' }],
            }),
        } as Response)
      )
    );

    openCreateModal();
    fireEvent.change(screen.getByPlaceholderText('장소명 2글자 이상 입력(예: 키즈)'), { target: { value: '킹콩점프' } });

    await screen.findByText('킹콩점프');
    // 괄호 안이 "영덕동, 흥덕노블레스"처럼 동으로 끝나지 않으면 폴백 경로를 탄다.
    expect(screen.getByText('경기도 용인시 기흥구')).toBeInTheDocument();
  });

  it('검색 결과를 클릭하면 스팟이 선택되고 검색 목록이 사라진다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              items: [{ id: 'spot-1', name: '플레이버디 키즈카페', address: '경기도 의정부시 가금로 29 (가능동)' }],
            }),
        } as Response)
      )
    );

    openCreateModal();
    fireEvent.change(screen.getByPlaceholderText('장소명 2글자 이상 입력(예: 키즈)'), { target: { value: '플레이버디' } });

    const result = await screen.findByText('플레이버디 키즈카페');
    fireEvent.click(result);

    await waitFor(() => expect(screen.getByText('변경')).toBeInTheDocument());
    expect(screen.queryByPlaceholderText('장소명 2글자 이상 입력(예: 키즈)')).not.toBeInTheDocument();
  });
});
