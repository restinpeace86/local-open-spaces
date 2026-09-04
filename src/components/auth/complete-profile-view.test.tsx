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

  // [개선사항5 - 출생년도 드롭박스 개편](2026-09-04): 자유 타이핑(number input)을
  // 드롭박스(select)로 전환하면서, 값을 완전히 비워 "유효한 연도 없음" 상태를 만드는
  // 옛 테스트는 실제 UI로는 더 이상 재현 불가능해졌다(select는 항상 목록 중 하나가
  // 선택돼 있다) — 정직하게 제거하고, 새 UI 자체의 요구사항(연도 범위, 하한 학년
  // 라벨, 여러 명 선택)을 검증하는 테스트로 대체한다.
  it('출생년도 드롭박스는 올해부터 초등학교 6학년 기준 연도까지 13개 옵션을 제공하고, 가장 오래된 연도에는 학년 안내가 붙는다', async () => {
    const currentYear = new Date().getFullYear();
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    fromMock.mockReturnValue(makeProfilesFrom({ id: 'user-1', nickname: null, birth_years: [] }));

    render(<CompleteProfileView />);
    const yearSelect = await screen.findByLabelText('아이 1 출생년도');

    const optionLabels = Array.from(yearSelect.querySelectorAll('option')).map((o) => o.textContent);
    expect(optionLabels).toHaveLength(13);
    expect(optionLabels[0]).toBe(`${currentYear}년생`);
    expect(optionLabels[12]).toBe(`${currentYear - 12}년생 (초등 6학년)`);
  });

  it('"+ 아이 추가"로 여러 명을 입력하고 제출하면 두 값 모두 저장한 뒤 next로 이동한다', async () => {
    const currentYear = new Date().getFullYear();
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    fromMock.mockReturnValue(makeProfilesFrom({ id: 'user-1', nickname: null, birth_years: [] }));
    mockSearchParams = new URLSearchParams('next=%2Fmom-pick');

    render(<CompleteProfileView />);
    const nicknameInput = await screen.findByLabelText('닉네임');
    fireEvent.change(nicknameInput, { target: { value: '민지맘' } });
    fireEvent.change(screen.getByLabelText('아이 1 출생년도'), { target: { value: String(currentYear - 4) } });

    fireEvent.click(screen.getByText('+ 아이 추가'));
    fireEvent.change(screen.getByLabelText('아이 2 출생년도'), { target: { value: String(currentYear - 6) } });

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
    fireEvent.click(screen.getByText('시작하기'));

    expect(await screen.findByText('닉네임 저장 실패: 네트워크 오류')).toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('기존에 표준 범위를 벗어난 출생년도가 저장돼 있으면(과거 자유 입력 잔존 데이터) 값을 임의로 바꾸지 않고 그대로 보존한다', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    fromMock.mockReturnValue(makeProfilesFrom({ id: 'user-1', nickname: '민지맘', birth_years: [1999] }));

    render(<CompleteProfileView />);
    const yearSelect = await screen.findByLabelText('아이 1 출생년도');

    expect((yearSelect as HTMLSelectElement).value).toBe('1999');
    expect(screen.getByText('1999년생')).toBeInTheDocument();
  });
});
