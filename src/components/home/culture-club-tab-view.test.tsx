// [카드/레이아웃 재설계](2026-10-03 사용자 지시, 이마트 컬처클럽 실제 화면 캡처 참고):
// 카드에 지점이 안 보이고 접수기간/일정이 보이는지, 재료비가 가격 옆에 작게 붙는지,
// 필터가 있을 때만 초기화 버튼이 보이는지 검증한다.
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CultureClubTabView } from './culture-club-tab-view';

// [찜 아이콘 연결](2026-10-03): 각 카드가 이제 실제 BookmarkButton(useUser() 사용)을
// 렌더링한다 — 기본은 비로그인으로 고정해 Supabase 클라이언트 생성까지 가지 않게
// 한다(home-view.test.tsx와 동일한 이유의 동일 패턴). 찜 버튼의 stopPropagation을
// 검증하는 테스트에서만 mockUser.current를 채워 실제로 버튼이 렌더링되게 한다.
const mockUser = { current: null as { id: string } | null };
vi.mock('@/hooks/use-user', () => ({
  useUser: () => ({ user: mockUser.current, isLoading: false }),
}));
const getMyProfileMock = vi.fn();
vi.mock('@/lib/auth/profile', () => ({
  getMyProfile: () => getMyProfileMock(),
}));
vi.mock('@/lib/community/bookmarks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/community/bookmarks')>();
  return {
    ...actual,
    getMyBookmarkedIds: () => Promise.resolve({ spotIds: new Set(), eventIds: new Set(), emartClassIds: new Set() }),
  };
});

type ClassFixture = {
  class_id: string;
  class_title: string;
  class_day: string[];
  start_time: string;
  end_time: string;
  sub_category_name: string;
  class_fee: number | null;
  class_material_fee: number | null;
  class_capacity: number | null;
  filter_status: '접수대기' | '접수중' | '정원마감';
  register_start_date: string;
  register_end_date: string;
  main_image_key: string | null;
  collected_at: string;
  store_name: string | null;
  class_detail_title: string | null;
  class_detail_content: string | null;
};

function makeClass(overrides: Partial<ClassFixture> = {}): ClassFixture {
  return {
    class_id: 'class-1',
    class_title: '10/3(토) 11:00 두근두근 무지개 레이저쇼',
    class_day: ['토'],
    start_time: '1100',
    end_time: '1140',
    sub_category_name: 'Kids & Children',
    class_fee: 12000,
    class_material_fee: 9000,
    class_capacity: 10,
    filter_status: '접수중',
    register_start_date: '202607231000',
    register_end_date: '20261013',
    main_image_key: 'classImages/6450c059-7f36-47e0-8c2e-670eeb1aed31',
    collected_at: '2026-10-03T04:12:00+00:00',
    store_name: '울산점',
    class_detail_title: '햇살아이 오감나무',
    class_detail_content: '중국 여행을 떠나 짜장면을 만들어요\n\n*준비물: 쪽쪽이, 물티슈',
    ...overrides,
  };
}

function stubFetch(classes: ClassFixture[]) {
  const fetchMock = vi.fn((url: string) => {
    if (url.startsWith('/api/culture-club/stores')) {
      return Promise.resolve({
        json: () => Promise.resolve({ stores: [{ storeCode: '180', label: '이마트 춘천점' }] }),
      } as Response);
    }
    if (url.startsWith('/api/culture-club/classes')) {
      return Promise.resolve({ json: () => Promise.resolve({ items: classes, total: classes.length }) } as Response);
    }
    return Promise.resolve({ json: () => Promise.resolve({}) } as Response);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('CultureClubTabView', () => {
  // [접수기간 비노출](2026-10-03 사용자 지시: "접수 기간은 우리도 숨기도록 하자") —
  // 이마트 실제 사이트도 상세 화면에 접수기간을 노출하지 않아, 카드/상세 양쪽에서
  // 숨겼다(접수대기 상태에서 우수맘에게만 보이는 안내는 별도 describe 참고).
  it('카드에 지점/접수기간은 보이지 않고 일정만 보인다', async () => {
    stubFetch([makeClass()]);
    render(<CultureClubTabView />);

    const title = await screen.findByText(/두근두근 무지개 레이저쇼/);
    const card = title.closest('.rounded-xl') as HTMLElement;
    expect(within(card).queryByText(/접수기간/)).not.toBeInTheDocument();
    expect(within(card).getByText(/일정 토 11:00 ~ 11:40/)).toBeInTheDocument();
    expect(within(card).queryByText(/이마트 춘천점/)).not.toBeInTheDocument();
  });

  it('가격 옆에 재료비가 작게 표시된다', async () => {
    stubFetch([makeClass({ class_fee: 12000, class_material_fee: 9000 })]);
    render(<CultureClubTabView />);

    expect(await screen.findByText(/12,000원/)).toBeInTheDocument();
    expect(screen.getByText(/재료비 9,000원 포함/)).toBeInTheDocument();
  });

  it('재료비가 없으면 괄호 문구를 보여주지 않는다', async () => {
    stubFetch([makeClass({ class_material_fee: null })]);
    render(<CultureClubTabView />);

    await screen.findByText(/두근두근/);
    expect(screen.queryByText(/재료비/)).not.toBeInTheDocument();
  });

  it('main_image_key가 있으면 CDN 썸네일 URL로 이미지를 렌더링한다', async () => {
    stubFetch([makeClass({ main_image_key: 'classImages/abc-123' })]);
    const { container } = render(<CultureClubTabView />);

    await screen.findByText(/두근두근/);
    const img = container.querySelector('img');
    expect(img).toHaveAttribute('src', 'https://d24y2yfxh2iebm.cloudfront.net/resized/thumbnail/classImages/abc-123');
  });

  it('main_image_key가 없으면 플레이스홀더를 보여준다(이미지 태그 없음)', async () => {
    stubFetch([makeClass({ main_image_key: null })]);
    const { container } = render(<CultureClubTabView />);

    await screen.findByText(/두근두근/);
    expect(container.querySelector('img')).toBeNull();
  });

  it('하루 1회 갱신이라는 안내와 함께 마지막 업데이트 시각을 보여준다', async () => {
    stubFetch([makeClass({ collected_at: '2026-10-03T04:12:00+00:00' })]);
    render(<CultureClubTabView />);

    expect(await screen.findByText(/마지막 업데이트/)).toBeInTheDocument();
    expect(screen.getByText(/하루 1회 갱신돼요/)).toBeInTheDocument();
  });

  it('정원마감이면 "대기접수 가능"으로 표시한다', async () => {
    stubFetch([makeClass({ filter_status: '정원마감' })]);
    render(<CultureClubTabView />);

    expect(await screen.findByText('대기접수 가능')).toBeInTheDocument();
  });

  it('요일/카테고리 필터가 선택되지 않으면 초기화 버튼이 보이지 않는다', async () => {
    stubFetch([makeClass()]);
    render(<CultureClubTabView />);

    await screen.findByText(/두근두근/);
    expect(screen.queryByText('↻ 초기화')).not.toBeInTheDocument();
  });

  it('요일 필터를 선택하면 초기화 버튼이 보이고, 누르면 선택이 풀린다', async () => {
    stubFetch([makeClass()]);
    render(<CultureClubTabView />);
    await screen.findByText(/두근두근/);

    fireEvent.click(screen.getByText('토'));
    expect(screen.getByText('↻ 초기화')).toBeInTheDocument();
    expect(screen.getByText('토')).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByText('↻ 초기화'));
    await waitFor(() => expect(screen.getByText('토')).toHaveAttribute('aria-pressed', 'false'));
    expect(screen.queryByText('↻ 초기화')).not.toBeInTheDocument();
  });

  // [클래스 상세 바텀시트](2026-10-03 사용자 지적): "왜 눌렀을때 반응이 없어? 누르면
  // 상세페이지가 바텀시트로 나와야 하는거 아니야?" — 카드 클릭 시 상세 시트가 열리고,
  // 참고 화면(reference/emart culture club detail.png)의 핵심 요소(지점/찜/신청하기/
  // 클래스소개)가 보이는지 검증한다.
  describe('클래스 상세 바텀시트', () => {
    it('카드를 클릭하면 상세 시트가 열리고 지점/신청 버튼/클래스소개가 보인다', async () => {
      stubFetch([makeClass()]);
      render(<CultureClubTabView />);
      await screen.findByText(/두근두근/);

      fireEvent.click(screen.getAllByText(/두근두근/)[0]);

      expect(await screen.findByText('클래스 상세')).toBeInTheDocument();
      expect(screen.getByText('접수가능지점 울산점')).toBeInTheDocument();
      expect(screen.getByText('클래스 신청하러 가기 ↗')).toBeInTheDocument();
      expect(screen.getByText('중국 여행을 떠나 짜장면을 만들어요', { exact: false })).toBeInTheDocument();
    });

    // [딥링크 확인됨](2026-10-03 사용자 제공 URL로 실측 확인): 강좌별 상세 페이지는
    // /class/{classId} 형태로 바로 연결된다(이전엔 패턴을 몰라 검색 화면으로만 보냈음).
    it('신청하러 가기 버튼은 class_id가 포함된 강좌별 상세 페이지로 새 탭 연결된다', async () => {
      stubFetch([makeClass({ class_id: '403oo9Mze2026S3760' })]);
      render(<CultureClubTabView />);
      await screen.findByText(/두근두근/);
      fireEvent.click(screen.getAllByText(/두근두근/)[0]);

      const link = await screen.findByText('클래스 신청하러 가기 ↗');
      expect(link.closest('a')).toHaveAttribute('href', 'https://www.cultureclub.emart.com/class/403oo9Mze2026S3760');
      expect(link.closest('a')).toHaveAttribute('target', '_blank');
    });

    it('클래스소개는 기본 펼쳐진 상태이고, 다시 누르면 접힌다', async () => {
      stubFetch([makeClass()]);
      render(<CultureClubTabView />);
      await screen.findByText(/두근두근/);
      fireEvent.click(screen.getAllByText(/두근두근/)[0]);

      expect(await screen.findByText('중국 여행을 떠나 짜장면을 만들어요', { exact: false })).toBeInTheDocument();

      fireEvent.click(screen.getByText('클래스소개'));
      expect(screen.queryByText('중국 여행을 떠나 짜장면을 만들어요', { exact: false })).not.toBeInTheDocument();
    });

    it('찜 버튼을 눌러도 상세 시트가 열리지 않는다(이벤트 버블링 차단)', async () => {
      mockUser.current = { id: 'user-1' };
      getMyProfileMock.mockResolvedValue({ grade: 'active' });
      stubFetch([makeClass()]);
      render(<CultureClubTabView />);
      await screen.findByText(/두근두근/);

      const bookmarkButton = await screen.findByLabelText('찜하기');
      fireEvent.click(bookmarkButton);

      expect(screen.queryByText('클래스 상세')).not.toBeInTheDocument();
      mockUser.current = null;
    });

    it('✕를 누르면 상세 시트가 닫힌다', async () => {
      stubFetch([makeClass()]);
      render(<CultureClubTabView />);
      await screen.findByText(/두근두근/);
      fireEvent.click(screen.getAllByText(/두근두근/)[0]);
      await screen.findByText('클래스 상세');

      fireEvent.click(screen.getByLabelText('닫기'));

      expect(screen.queryByText('클래스 상세')).not.toBeInTheDocument();
    });
  });

  // [접수 시작 안내 — 우수맘 전용](2026-10-03 사용자 지시: "접수대기인 것들에
  // 대하여 찜할때.. 우수맘등급? 그 알람받는 등급한테는 몇시에 접수예정이라.. 몇일
  // 몇시에 열립니다.라는 인폼주는데 사용하자") — 접수기간은 숨기되 접수대기 상태
  // 강좌는 우수맘 이상에게만 별도 안내를 보여준다.
  describe('접수 시작 안내(우수맘 전용)', () => {
    const FAR_FUTURE_REGISTER_START = '209901011000'; // 2099.01.01 10:00 — 실제 시간 흐름과 무관하게 항상 미래

    it('우수맘이고 접수대기 상태면 접수 시작 안내가 보인다', async () => {
      mockUser.current = { id: 'user-1' };
      getMyProfileMock.mockResolvedValue({ grade: 'excellent' });
      stubFetch([makeClass({ filter_status: '접수대기', register_start_date: FAR_FUTURE_REGISTER_START })]);
      render(<CultureClubTabView />);
      await screen.findByText(/두근두근/);
      fireEvent.click(screen.getAllByText(/두근두근/)[0]);

      expect(await screen.findByText('🔔 접수 시작 안내')).toBeInTheDocument();
      expect(screen.getByText(/2099\.01\.01 10:00에 접수가 시작돼요/)).toBeInTheDocument();
      mockUser.current = null;
    });

    it('열심맘(우수맘 미만)이면 접수대기여도 안내가 보이지 않는다', async () => {
      mockUser.current = { id: 'user-1' };
      getMyProfileMock.mockResolvedValue({ grade: 'active' });
      stubFetch([makeClass({ filter_status: '접수대기', register_start_date: FAR_FUTURE_REGISTER_START })]);
      render(<CultureClubTabView />);
      await screen.findByText(/두근두근/);
      fireEvent.click(screen.getAllByText(/두근두근/)[0]);
      await screen.findByText('클래스 상세');

      expect(screen.queryByText('🔔 접수 시작 안내')).not.toBeInTheDocument();
      mockUser.current = null;
    });

    it('우수맘이어도 이미 접수중 상태면 안내가 보이지 않는다', async () => {
      mockUser.current = { id: 'user-1' };
      getMyProfileMock.mockResolvedValue({ grade: 'excellent' });
      stubFetch([makeClass({ filter_status: '접수중', register_start_date: FAR_FUTURE_REGISTER_START })]);
      render(<CultureClubTabView />);
      await screen.findByText(/두근두근/);
      fireEvent.click(screen.getAllByText(/두근두근/)[0]);
      await screen.findByText('클래스 상세');

      expect(screen.queryByText('🔔 접수 시작 안내')).not.toBeInTheDocument();
      mockUser.current = null;
    });
  });
});
