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

  // [실사용 버그 재제보](2026-09-02) "검색결과를 눌렀을 때 입력칸에 그 데이터가 들어가야
  // 하는데 안 들어간다": 입력란은 그대로 유지하고 그 값 자체가 선택한 이름으로 채워져야
  // 한다(이전에는 입력란이 통째로 다른 카드로 바뀌었음). 클릭 핸들러도 스크롤 가능한
  // 목록에서 click 대신 mousedown으로 반응하도록 바뀌어 mousedown으로 재현한다.
  it('검색 결과를 클릭하면 입력란의 값 자체가 선택한 이름으로 채워지고 검색 목록이 사라진다', async () => {
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
    const input = screen.getByPlaceholderText('장소명 2글자 이상 입력(예: 키즈)');
    fireEvent.change(input, { target: { value: '플레이버디' } });

    const result = await screen.findByText('플레이버디 키즈카페');
    fireEvent.mouseDown(result);

    await waitFor(() => expect(screen.getByText('변경')).toBeInTheDocument());
    expect(input).toHaveValue('플레이버디 키즈카페');
    expect(screen.queryByText('경기도 의정부시 가금로 29 (가능동)')).not.toBeInTheDocument(); // 목록이 사라짐
  });

  it('"변경"을 누르면 선택이 풀리고 다시 검색할 수 있는 빈 입력란으로 돌아간다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ items: [{ id: 'spot-1', name: '플레이버디 키즈카페', address: null }] }),
        } as Response)
      )
    );

    openCreateModal();
    const input = screen.getByPlaceholderText('장소명 2글자 이상 입력(예: 키즈)');
    fireEvent.change(input, { target: { value: '플레이버디' } });
    const result = await screen.findByText('플레이버디 키즈카페');
    fireEvent.mouseDown(result);
    await waitFor(() => expect(screen.getByText('변경')).toBeInTheDocument());

    fireEvent.click(screen.getByText('변경'));

    expect(input).toHaveValue('');
    expect(screen.queryByText('변경')).not.toBeInTheDocument();
  });
});
