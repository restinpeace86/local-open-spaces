import { afterEach, describe, expect, it, vi } from 'vitest';

// [프로필 캐싱 — N+1 왕복 제거](2026-10-09 사용자 질문: "위치설정이라던가
// 온보딩때의 애 나이같은거는 바로바로 세션으로 가지고 있는거야?") getMyProfile()
// 내부에 모듈 레벨 캐시(TTL + 진행 중 요청 공유)를 추가했다 — culture-club-
// store-coordinates-cache.test.ts와 동일하게, 매 테스트마다 vi.resetModules()로
// 모듈을 새로 import해 캐시 상태가 테스트 간에 새어나가지 않게 한다.
function mockSupabaseClient({
  getUserMock = vi.fn(),
  fromMock = vi.fn(),
  onAuthStateChangeMock = vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
}: {
  getUserMock?: ReturnType<typeof vi.fn>;
  fromMock?: ReturnType<typeof vi.fn>;
  onAuthStateChangeMock?: ReturnType<typeof vi.fn>;
} = {}) {
  vi.doMock('@/lib/supabase/client', () => ({
    createClient: () => ({ auth: { getUser: getUserMock, onAuthStateChange: onAuthStateChangeMock }, from: fromMock }),
  }));
  return { getUserMock, fromMock, onAuthStateChangeMock };
}

function mockProfileRow(overrides: Partial<{ id: string; birth_years: number[]; created_at: string; updated_at: string }> = {}) {
  const row = { id: 'user-1', birth_years: [2020], created_at: 't1', updated_at: 't1', ...overrides };
  const singleMock = vi.fn(() => Promise.resolve({ data: row, error: null }));
  const eqMock = vi.fn(() => ({ single: singleMock }));
  const selectMock = vi.fn(() => ({ eq: eqMock }));
  return { row, singleMock, eqMock, selectMock };
}

describe('getMyProfile', () => {
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/client');
    vi.resetModules();
    vi.useRealTimers();
  });

  it('로그인하지 않은 상태면 null을 반환한다(에러 아님)', async () => {
    const getUserMock = vi.fn(() => Promise.resolve({ data: { user: null } }));
    const fromMock = vi.fn();
    mockSupabaseClient({ getUserMock, fromMock });
    const { getMyProfile } = await import('./profile');

    const result = await getMyProfile();
    expect(result).toBeNull();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('로그인 상태면 본인 id로 profiles를 조회해 반환한다', async () => {
    const getUserMock = vi.fn(() => Promise.resolve({ data: { user: { id: 'user-1' } } }));
    const { selectMock, eqMock, row } = mockProfileRow();
    const fromMock = vi.fn().mockReturnValue({ select: selectMock });
    mockSupabaseClient({ getUserMock, fromMock });
    const { getMyProfile } = await import('./profile');

    const result = await getMyProfile();

    expect(fromMock).toHaveBeenCalledWith('profiles');
    expect(selectMock).toHaveBeenCalledWith('*');
    expect(eqMock).toHaveBeenCalledWith('id', 'user-1');
    expect(result).toEqual(row);
  });

  it('조회 중 에러가 나면 명확한 메시지로 던진다', async () => {
    const getUserMock = vi.fn(() => Promise.resolve({ data: { user: { id: 'user-1' } } }));
    const fromMock = vi.fn().mockReturnValue({
      select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: { message: 'DB 오류' } }) }) }),
    });
    mockSupabaseClient({ getUserMock, fromMock });
    const { getMyProfile } = await import('./profile');

    await expect(getMyProfile()).rejects.toThrow('프로필 조회 실패: DB 오류');
  });

  it('에러가 난 조회는 캐시하지 않아 다음 호출에서 다시 시도한다', async () => {
    const getUserMock = vi.fn(() => Promise.resolve({ data: { user: { id: 'user-1' } } }));
    const { selectMock, row } = mockProfileRow();
    let callCount = 0;
    const fromMock = vi.fn(() => {
      callCount += 1;
      if (callCount === 1) {
        return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: { message: '일시 오류' } }) }) }) };
      }
      return { select: selectMock };
    });
    mockSupabaseClient({ getUserMock, fromMock });
    const { getMyProfile } = await import('./profile');

    await expect(getMyProfile()).rejects.toThrow('프로필 조회 실패: 일시 오류');
    const result = await getMyProfile();
    expect(result).toEqual(row);
    expect(fromMock).toHaveBeenCalledTimes(2);
  });

  // [캐싱 — 중복 왕복 제거] 짧은 시간 안에 반복 호출하면(예: 카드 리스트에
  // BookmarkButton 여러 개가 동시에 마운트되는 경우) 실제 네트워크 조회는
  // 한 번만 나가야 한다.
  it('TTL 내 반복 호출은 조회를 한 번만 하고 캐시를 재사용한다', async () => {
    const getUserMock = vi.fn(() => Promise.resolve({ data: { user: { id: 'user-1' } } }));
    const { selectMock } = mockProfileRow();
    const fromMock = vi.fn().mockReturnValue({ select: selectMock });
    mockSupabaseClient({ getUserMock, fromMock });
    const { getMyProfile } = await import('./profile');

    await getMyProfile();
    await getMyProfile();
    await getMyProfile();

    expect(getUserMock).toHaveBeenCalledTimes(1);
    expect(fromMock).toHaveBeenCalledTimes(1);
  });

  // [동시 호출 — 진행 중인 요청을 공유] 여러 컴포넌트가 응답이 오기도 전에
  // 동시에 호출해도(캐시가 아직 비어있는 시점) 실제 요청은 한 번만 나가야
  // 한다 — 단순 "캐시 확인 후 없으면 요청" 방식은 이 경우를 못 막는다.
  it('아직 캐시가 없을 때 동시에 여러 번 호출해도 실제 조회는 한 번만 나간다', async () => {
    const getUserMock = vi.fn(() => Promise.resolve({ data: { user: { id: 'user-1' } } }));
    const { selectMock } = mockProfileRow();
    const fromMock = vi.fn().mockReturnValue({ select: selectMock });
    mockSupabaseClient({ getUserMock, fromMock });
    const { getMyProfile } = await import('./profile');

    const [a, b, c] = await Promise.all([getMyProfile(), getMyProfile(), getMyProfile()]);

    expect(getUserMock).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
    expect(b).toEqual(c);
  });

  it('TTL이 지나면 다시 조회한다', async () => {
    vi.useFakeTimers();
    const getUserMock = vi.fn(() => Promise.resolve({ data: { user: { id: 'user-1' } } }));
    const { selectMock } = mockProfileRow();
    const fromMock = vi.fn().mockReturnValue({ select: selectMock });
    mockSupabaseClient({ getUserMock, fromMock });
    const { getMyProfile } = await import('./profile');

    await getMyProfile();
    vi.advanceTimersByTime(31 * 1000);
    await getMyProfile();

    expect(fromMock).toHaveBeenCalledTimes(2);
  });

  it('invalidateMyProfileCache()를 부르면 TTL과 무관하게 다음 호출에서 다시 조회한다', async () => {
    const getUserMock = vi.fn(() => Promise.resolve({ data: { user: { id: 'user-1' } } }));
    const { selectMock } = mockProfileRow();
    const fromMock = vi.fn().mockReturnValue({ select: selectMock });
    mockSupabaseClient({ getUserMock, fromMock });
    const { getMyProfile, invalidateMyProfileCache } = await import('./profile');

    await getMyProfile();
    invalidateMyProfileCache();
    await getMyProfile();

    expect(fromMock).toHaveBeenCalledTimes(2);
  });

  // [로그인/로그아웃(계정 전환) 시 캐시 무효화] onAuthStateChange 구독으로
  // 처리한다 — 안 그러면 다른 계정으로 전환해도 이전 사용자의 캐시된
  // 프로필을 잠깐 돌려주는 사고가 날 수 있다.
  it('onAuthStateChange 이벤트가 오면 캐시를 무효화한다(계정 전환 시 이전 사용자 프로필이 새어나가지 않게)', async () => {
    const getUserMock = vi.fn(() => Promise.resolve({ data: { user: { id: 'user-1' } } }));
    const { selectMock } = mockProfileRow();
    const fromMock = vi.fn().mockReturnValue({ select: selectMock });
    let authChangeHandler: (() => void) | undefined;
    const onAuthStateChangeMock = vi.fn((cb: () => void) => {
      authChangeHandler = cb;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
    mockSupabaseClient({ getUserMock, fromMock, onAuthStateChangeMock });
    const { getMyProfile } = await import('./profile');

    await getMyProfile();
    authChangeHandler?.();
    await getMyProfile();

    expect(fromMock).toHaveBeenCalledTimes(2);
  });
});

describe('updateBirthYearsAndMonths', () => {
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/client');
    vi.resetModules();
  });

  it('로그인하지 않은 상태면 에러를 던진다', async () => {
    const getUserMock = vi.fn(() => Promise.resolve({ data: { user: null } }));
    const fromMock = vi.fn();
    mockSupabaseClient({ getUserMock, fromMock });
    const { updateBirthYearsAndMonths } = await import('./profile');

    await expect(updateBirthYearsAndMonths([2020], [5])).rejects.toThrow('로그인이 필요합니다.');
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('로그인 상태면 본인 id 행의 birth_years/birth_months를 함께 갱신한다', async () => {
    const getUserMock = vi.fn(() => Promise.resolve({ data: { user: { id: 'user-1' } } }));
    const singleMock = vi.fn(() =>
      Promise.resolve({
        data: { id: 'user-1', birth_years: [2020, 2022], birth_months: [3, 7], created_at: 't1', updated_at: 't2' },
        error: null,
      })
    );
    const selectMock = vi.fn(() => ({ single: singleMock }));
    const eqMock = vi.fn(() => ({ select: selectMock }));
    const updateMock = vi.fn(() => ({ eq: eqMock }));
    const fromMock = vi.fn().mockReturnValue({ update: updateMock });
    mockSupabaseClient({ getUserMock, fromMock });
    const { updateBirthYearsAndMonths } = await import('./profile');

    const result = await updateBirthYearsAndMonths([2020, 2022], [3, 7]);

    expect(fromMock).toHaveBeenCalledWith('profiles');
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ birth_years: [2020, 2022], birth_months: [3, 7] }));
    expect(eqMock).toHaveBeenCalledWith('id', 'user-1');
    expect(result.birth_years).toEqual([2020, 2022]);
    expect(result.birth_months).toEqual([3, 7]);
  });

  it('저장 중 에러가 나면 명확한 메시지로 던진다', async () => {
    const getUserMock = vi.fn(() => Promise.resolve({ data: { user: { id: 'user-1' } } }));
    const fromMock = vi.fn().mockReturnValue({
      update: () => ({ eq: () => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: { message: '저장 오류' } }) }) }) }),
    });
    mockSupabaseClient({ getUserMock, fromMock });
    const { updateBirthYearsAndMonths } = await import('./profile');

    await expect(updateBirthYearsAndMonths([2020], [3])).rejects.toThrow('프로필 저장 실패: 저장 오류');
  });

  // [캐시 무효화 — 저장 직후 최신값 보장](2026-10-09 getMyProfile() 캐싱 도입)
  // 온보딩/마이페이지에서 아이 출생년월을 저장한 뒤, 다른 화면으로 이동해
  // getMyProfile()을 다시 불러도 TTL이 안 지났다는 이유로 저장 전 값을
  // 돌려주면 안 된다.
  it('저장에 성공하면 캐시를 무효화해 다음 getMyProfile() 호출이 최신값을 다시 조회한다', async () => {
    const getUserMock = vi.fn(() => Promise.resolve({ data: { user: { id: 'user-1' } } }));
    let readCount = 0;
    const readSingleMock = vi.fn(() => {
      readCount += 1;
      const birthYears = readCount === 1 ? [2020] : [2022];
      return Promise.resolve({ data: { id: 'user-1', birth_years: birthYears, created_at: 't1', updated_at: 't1' }, error: null });
    });
    const readSelectMock = vi.fn(() => ({ eq: () => ({ single: readSingleMock }) }));
    const writeSingleMock = vi.fn(() =>
      Promise.resolve({ data: { id: 'user-1', birth_years: [2022], birth_months: [7], created_at: 't1', updated_at: 't2' }, error: null })
    );
    const writeSelectMock = vi.fn(() => ({ single: writeSingleMock }));
    const eqMock = vi.fn(() => ({ select: writeSelectMock }));
    const updateMock = vi.fn(() => ({ eq: eqMock }));
    let callCount = 0;
    const fromMock = vi.fn(() => {
      callCount += 1;
      if (callCount === 2) return { update: updateMock }; // updateBirthYearsAndMonths()
      return { select: readSelectMock }; // getMyProfile() 조회(최초 캐시 채움 + 무효화 후 재조회)
    });
    mockSupabaseClient({ getUserMock, fromMock });
    const { getMyProfile, updateBirthYearsAndMonths } = await import('./profile');

    const first = await getMyProfile(); // 캐시에 2020년생으로 채워짐
    expect(first?.birth_years).toEqual([2020]);
    await updateBirthYearsAndMonths([2022], [7]); // 저장 성공 → 캐시 무효화돼야 함
    const refreshed = await getMyProfile();

    expect(refreshed?.birth_years).toEqual([2022]); // 캐시가 안 무효화됐다면 여기서도 [2020]이 나왔을 것
    expect(fromMock).toHaveBeenCalledTimes(3); // 조회 1 + 저장 1 + 재조회 1
  });
});

describe('updateNickname', () => {
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/client');
    vi.resetModules();
  });

  it('로그인하지 않은 상태면 에러를 던진다', async () => {
    const getUserMock = vi.fn(() => Promise.resolve({ data: { user: null } }));
    const fromMock = vi.fn();
    mockSupabaseClient({ getUserMock, fromMock });
    const { updateNickname } = await import('./profile');

    await expect(updateNickname('두근맘')).rejects.toThrow('로그인이 필요합니다.');
  });

  it('저장에 성공하면 캐시를 무효화해 다음 getMyProfile() 호출이 최신 닉네임을 다시 조회한다', async () => {
    const getUserMock = vi.fn(() => Promise.resolve({ data: { user: { id: 'user-1' } } }));
    let readCount = 0;
    const readSingleMock = vi.fn(() => {
      readCount += 1;
      const nickname = readCount === 1 ? null : '새닉네임';
      return Promise.resolve({ data: { id: 'user-1', birth_years: [2020], nickname, created_at: 't1', updated_at: 't1' }, error: null });
    });
    const readSelectMock = vi.fn(() => ({ eq: () => ({ single: readSingleMock }) }));
    const writeSingleMock = vi.fn(() =>
      Promise.resolve({ data: { id: 'user-1', birth_years: [2020], nickname: '새닉네임', created_at: 't1', updated_at: 't2' }, error: null })
    );
    const writeSelectMock = vi.fn(() => ({ single: writeSingleMock }));
    const eqMock = vi.fn(() => ({ select: writeSelectMock }));
    const updateMock = vi.fn(() => ({ eq: eqMock }));
    let callCount = 0;
    const fromMock = vi.fn(() => {
      callCount += 1;
      if (callCount === 2) return { update: updateMock };
      return { select: readSelectMock };
    });
    mockSupabaseClient({ getUserMock, fromMock });
    const { getMyProfile, updateNickname } = await import('./profile');

    const first = await getMyProfile();
    expect(first?.nickname).toBeNull();
    await updateNickname('새닉네임');
    const refreshed = await getMyProfile();

    expect(refreshed?.nickname).toBe('새닉네임');
    expect(fromMock).toHaveBeenCalledTimes(3);
  });
});
