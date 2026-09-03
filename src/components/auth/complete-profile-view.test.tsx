import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CompleteProfileView } from './complete-profile-view';

const getUserMock = vi.fn();
const onAuthStateChangeMock = vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } }));
const fromMock = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getUser: getUserMock, onAuthStateChange: onAuthStateChangeMock }, from: fromMock }),
}));

const replaceMock = vi.fn();
let mockSearchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
  useRouter: () => ({ replace: replaceMock }),
}));

// select('*')/eq/single(초기 조회)와 update(patch)/eq/select/single(저장) 양쪽 체인을
// 모두 지원하는 최소 모의 — update가 호출될 때마다 currentProfile을 그대로 갱신해
// 다음 single() 조회에 반영한다(my-page-view.test.tsx와 동일한 관례).
function makeProfilesFrom(currentProfile: Record<string, unknown>) {
  const chain = {
    select: vi.fn(() => chain),
    update: vi.fn((patch: Record<string, unknown>) => {
      Object.assign(currentProfile, patch);
      return chain;
    }),
    eq: vi.fn(() => chain),
    single: vi.fn(() => Promise.resolve({ data: { ...currentProfile }, error: null })),
  };
  return chain;
}

// [구글/카카오 인증 후 필수 프로필 입력](2026-09-04 사용자 지시): "인증되면 바로
// 회원가입폼으로 가서 닉네임, 아이 연령을 기본으로 받게 해줘 — 나중에 마이페이지에서
// 입력하는 게 아니고." 닉네임 + 아이 출생년도(여러 명 가능)를 모두 채워야만 다음
// 화면으로 넘어갈 수 있는지 검증한다.
describe('CompleteProfileView', () => {
  afterEach(() => {
    getUserMock.mockReset();
    fromMock.mockReset();
    replaceMock.mockReset();
    mockSearchParams = new URLSearchParams();
  });

  it('로그인하지 않았으면 홈으로 되돌려보낸다', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    render(<CompleteProfileView />);

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/'));
  });

  it('기존에 부분적으로 입력된 값이 있으면(닉네임만 있음) 그 값을 미리 채워둔다', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    fromMock.mockReturnValue(makeProfilesFrom({ id: 'user-1', nickname: '민지맘', birth_years: [] }));

    render(<CompleteProfileView />);

    expect(await screen.findByDisplayValue('민지맘')).toBeInTheDocument();
  });

  it('닉네임을 비운 채 제출하면 저장하지 않고 에러 문구를 보여준다', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    fromMock.mockReturnValue(makeProfilesFrom({ id: 'user-1', nickname: null, birth_years: [] }));

    render(<CompleteProfileView />);
    await screen.findByLabelText('닉네임');

    fireEvent.click(screen.getByText('시작하기'));

    expect(await screen.findByText('닉네임을 입력해주세요.')).toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('아이 출생년도를 전부 지워 유효한 값이 없으면 에러 문구를 보여준다', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    fromMock.mockReturnValue(makeProfilesFrom({ id: 'user-1', nickname: null, birth_years: [] }));

    render(<CompleteProfileView />);
    const nicknameInput = await screen.findByLabelText('닉네임');
    fireEvent.change(nicknameInput, { target: { value: '민지맘' } });

    // 기본으로 올해 연도 한 칸이 있다 — 값을 비워 "유효한 연도 없음" 상태를 만든다.
    // (min/max를 벗어난 값을 넣으면 jsdom의 네이티브 HTML5 제약 검증이 폼 제출 자체를
    // 막아버려 onSubmit이 호출되지 않는다 — 빈 값은 그 제약에 걸리지 않아 실제로
    // onSubmit까지 도달해 커스텀 검증 문구를 확인할 수 있다.)
    const yearInput = screen.getByPlaceholderText('예: 2022');
    fireEvent.change(yearInput, { target: { value: '' } });
    fireEvent.click(screen.getByText('시작하기'));

    expect(await screen.findByText('아이 출생년도를 최소 1명 입력해주세요.')).toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('"+ 아이 추가"로 여러 명을 입력하고 제출하면 두 값 모두 저장한 뒤 next로 이동한다', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    fromMock.mockReturnValue(makeProfilesFrom({ id: 'user-1', nickname: null, birth_years: [] }));
    mockSearchParams = new URLSearchParams('next=%2Fmom-pick');

    render(<CompleteProfileView />);
    const nicknameInput = await screen.findByLabelText('닉네임');
    fireEvent.change(nicknameInput, { target: { value: '민지맘' } });
    fireEvent.change(screen.getByPlaceholderText('예: 2022'), { target: { value: '2022' } });

    fireEvent.click(screen.getByText('+ 아이 추가'));
    const yearInputs = screen.getAllByPlaceholderText('예: 2022');
    fireEvent.change(yearInputs[1], { target: { value: '2020' } });

    fireEvent.click(screen.getByText('시작하기'));

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/mom-pick'));
  });

  it('저장이 실패하면 에러 메시지를 보여주고 이동하지 않는다', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    const chain = makeProfilesFrom({ id: 'user-1', nickname: null, birth_years: [] });
    chain.update = vi.fn(() => {
      throw new Error('닉네임 저장 실패: 네트워크 오류');
    });
    fromMock.mockReturnValue(chain);

    render(<CompleteProfileView />);
    const nicknameInput = await screen.findByLabelText('닉네임');
    fireEvent.change(nicknameInput, { target: { value: '민지맘' } });
    fireEvent.change(screen.getByPlaceholderText('예: 2022'), { target: { value: '2022' } });
    fireEvent.click(screen.getByText('시작하기'));

    expect(await screen.findByText('닉네임 저장 실패: 네트워크 오류')).toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });
});
