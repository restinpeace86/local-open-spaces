import { afterEach, describe, expect, it, vi } from 'vitest';
import { addBookmark, BookmarkCapExceededError, removeBookmark } from './bookmarks';

const getUserMock = vi.fn();
const fromMock = vi.fn();
const getMyProfileMock = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getUser: getUserMock }, from: fromMock }),
}));

vi.mock('@/lib/auth/profile', () => ({
  getMyProfile: () => getMyProfileMock(),
}));

function makeCountBuilder(count: number) {
  return {
    select: () => ({
      eq: () => ({
        or: () => Promise.resolve({ count, error: null }),
      }),
    }),
  };
}

function makeInsertBuilder() {
  const insertMock = vi.fn(() => Promise.resolve({ error: null }));
  return { insert: insertMock };
}

// [찜 FK 통합](2026-10-06): emart_class/lottemart_class 찜은 addBookmark 내부에서
// culture_club_classes(brand, source_class_id)로 surrogate id를 먼저 조회한다.
function makeResolveClassIdBuilder(resolvedId: number) {
  return {
    select: () => ({
      eq: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: { id: resolvedId }, error: null }),
        }),
      }),
    }),
  };
}

// [우수맘 전용 예약-알람 슬롯 캡](2026-10-03 사용자 지시): "알림 리마인더 슬롯 최대 20개
// 제한을 두어 무분별한 등록 방지." 스팟 찜은 캡 대상이 아니고, 이벤트 찜은 호출자가
// 우수맘(excellent) 이상일 때만 캡을 적용한다(열심맘은 알람 자체를 못 받으니 캡도
// 무의미 — canReceivePushNotifications 기준과 동일).
// [20 → 10으로 하향](2026-10-04 사용자 지시): "찜한도를 일단 20개에서 10개로
// 줄이는게 좋을꺼같아" — 아래 테스트의 경계값도 10으로 맞춘다.
describe('addBookmark', () => {
  afterEach(() => {
    getUserMock.mockReset();
    fromMock.mockReset();
    getMyProfileMock.mockReset();
    delete process.env.NEXT_PUBLIC_EVENT_BOOKMARK_CAP;
  });

  it('스팟 찜은 등급/개수와 무관하게 캡 체크 없이 바로 insert한다', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    fromMock.mockReturnValue(makeInsertBuilder());

    await addBookmark({ kind: 'spot', spotId: 'spot-1' });

    expect(getMyProfileMock).not.toHaveBeenCalled();
    expect(fromMock).toHaveBeenCalledTimes(1);
  });

  it('이벤트 찜인데 열심맘(우수맘 미달)이면 캡 체크 없이 바로 insert한다', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    getMyProfileMock.mockResolvedValue({ grade: 'active' });
    fromMock.mockReturnValue(makeInsertBuilder());

    await addBookmark({ kind: 'event', eventId: 'event-1' });

    expect(fromMock).toHaveBeenCalledTimes(1);
  });

  it('우수맘이고 기존 이벤트 찜이 캡 미만이면 insert를 허용한다', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    getMyProfileMock.mockResolvedValue({ grade: 'excellent' });
    fromMock.mockReturnValueOnce(makeCountBuilder(9)).mockReturnValueOnce(makeInsertBuilder());

    await expect(addBookmark({ kind: 'event', eventId: 'event-1' })).resolves.toBeUndefined();
    expect(fromMock).toHaveBeenCalledTimes(2);
  });

  it('우수맘이고 기존 이벤트 찜이 캡(10)에 도달하면 BookmarkCapExceededError를 던지고 insert하지 않는다', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    getMyProfileMock.mockResolvedValue({ grade: 'excellent' });
    fromMock.mockReturnValueOnce(makeCountBuilder(10));

    await expect(addBookmark({ kind: 'event', eventId: 'event-1' })).rejects.toThrow(BookmarkCapExceededError);
    expect(fromMock).toHaveBeenCalledTimes(1);
  });

  it('파워맘도 동일한 캡 기준을 적용받는다', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    getMyProfileMock.mockResolvedValue({ grade: 'power' });
    fromMock.mockReturnValueOnce(makeCountBuilder(10));

    await expect(addBookmark({ kind: 'event', eventId: 'event-1' })).rejects.toThrow(BookmarkCapExceededError);
  });

  it('NEXT_PUBLIC_EVENT_BOOKMARK_CAP로 캡 값을 재정의할 수 있다', async () => {
    process.env.NEXT_PUBLIC_EVENT_BOOKMARK_CAP = '5';
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    getMyProfileMock.mockResolvedValue({ grade: 'excellent' });
    fromMock.mockReturnValueOnce(makeCountBuilder(5));

    await expect(addBookmark({ kind: 'event', eventId: 'event-1' })).rejects.toThrow('최대 5개');
  });

  // [이마트 문화센터 클래스 찜 추가](2026-10-03 사용자 지시): "찜/알람은 같은 기능이니깐
  // 두 테이블 데이터 전부 참조할 수 있도록 확장" — emart_class 찜도 이벤트 찜과 동일한
  // 캡 로직(우수맘 이상만 체크)을 탄다.
  it('문화센터 클래스 찜도 우수맘 이상이면 캡 체크를 거친다', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    getMyProfileMock.mockResolvedValue({ grade: 'excellent' });
    fromMock.mockReturnValueOnce(makeCountBuilder(10));

    await expect(addBookmark({ kind: 'emart_class', emartClassId: 'class-1' })).rejects.toThrow(BookmarkCapExceededError);
  });

  it('문화센터 클래스 찜인데 열심맘(우수맘 미달)이면 캡 체크 없이 바로 insert한다(surrogate id 조회 후)', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    getMyProfileMock.mockResolvedValue({ grade: 'active' });
    fromMock.mockReturnValueOnce(makeResolveClassIdBuilder(42)).mockReturnValueOnce(makeInsertBuilder());

    await addBookmark({ kind: 'emart_class', emartClassId: 'class-1' });

    expect(fromMock).toHaveBeenCalledTimes(2);
  });

  it('캡 카운트는 event_id/culture_club_class_id를 합산한다(같은 알람 슬롯이므로)', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    getMyProfileMock.mockResolvedValue({ grade: 'excellent' });
    let capturedOrFilter: string | undefined;
    const countBuilder = {
      select: () => ({
        eq: () => ({
          or: (filter: string) => {
            capturedOrFilter = filter;
            return Promise.resolve({ count: 0, error: null });
          },
        }),
      }),
    };
    fromMock.mockReturnValueOnce(countBuilder).mockReturnValueOnce(makeInsertBuilder());

    await addBookmark({ kind: 'event', eventId: 'event-1' });

    expect(capturedOrFilter).toBe('event_id.not.is.null,culture_club_class_id.not.is.null');
  });

  // [롯데마트 상태 변화 알림 추가](2026-10-04 사용자 지시): "찜한거에 대하여서는
  // 동일하게 알람해야하는거 아니야?" — lottemart-culture-club-status-watch.mjs
  // 추가로 롯데마트 찜도 알람 대상이 됐으니 이벤트/이마트와 동일하게 캡을 탄다.
  it('롯데마트 문화센터 클래스 찜도 우수맘 이상이면 캡 체크를 거친다', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    getMyProfileMock.mockResolvedValue({ grade: 'excellent' });
    fromMock.mockReturnValueOnce(makeCountBuilder(10));

    await expect(addBookmark({ kind: 'lottemart_class', lottemartClassId: 'class-1' })).rejects.toThrow(BookmarkCapExceededError);
  });

  it('롯데마트 문화센터 클래스 찜인데 열심맘(우수맘 미달)이면 캡 체크 없이 바로 insert한다(surrogate id 조회 후)', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    getMyProfileMock.mockResolvedValue({ grade: 'active' });
    fromMock.mockReturnValueOnce(makeResolveClassIdBuilder(43)).mockReturnValueOnce(makeInsertBuilder());

    await addBookmark({ kind: 'lottemart_class', lottemartClassId: 'class-1' });

    expect(fromMock).toHaveBeenCalledTimes(2);
  });
});

// [찜 FK 통합](2026-10-06): removeBookmark도 emart_class/lottemart_class는
// culture_club_classes에서 surrogate id를 먼저 조회한 뒤 그 id로 삭제한다.
describe('removeBookmark', () => {
  afterEach(() => {
    getUserMock.mockReset();
    fromMock.mockReset();
  });

  function makeDeleteBuilder() {
    const eqCalls: unknown[][] = [];
    const builder = {
      delete: () => builder,
      eq: (...args: unknown[]) => {
        eqCalls.push(args);
        return eqCalls.length < 2 ? builder : Promise.resolve({ error: null });
      },
    };
    return { builder, eqCalls };
  }

  it('이마트 문화센터 클래스 찜 삭제는 surrogate id를 조회한 뒤 그 id로 삭제한다', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    const { builder, eqCalls } = makeDeleteBuilder();
    // 실제 호출 순서: delete 쿼리 빌더 생성(from #1) → resolveCultureClubClassId(from #2).
    fromMock.mockReturnValueOnce(builder).mockReturnValueOnce(makeResolveClassIdBuilder(99));

    await removeBookmark({ kind: 'emart_class', emartClassId: 'class-1' });

    expect(fromMock).toHaveBeenCalledTimes(2);
    expect(eqCalls[1]).toEqual(['culture_club_class_id', 99]);
  });

  it('롯데마트 문화센터 클래스 찜 삭제도 동일하게 동작한다', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    const { builder, eqCalls } = makeDeleteBuilder();
    fromMock.mockReturnValueOnce(builder).mockReturnValueOnce(makeResolveClassIdBuilder(100));

    await removeBookmark({ kind: 'lottemart_class', lottemartClassId: 'class-1' });

    expect(eqCalls[1]).toEqual(['culture_club_class_id', 100]);
  });
});
