// [카드/레이아웃 재설계](2026-10-03 사용자 지시, 이마트 컬처클럽 실제 화면 캡처 참고):
// 카드에 지점이 안 보이고 접수기간/일정이 보이는지, 재료비가 가격 옆에 작게 붙는지,
// 필터가 있을 때만 초기화 버튼이 보이는지 검증한다.
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CultureClubTabView } from './culture-club-tab-view';

// [찜 아이콘 연결](2026-10-03): 각 카드가 이제 실제 BookmarkButton(useUser() 사용)을
// 렌더링한다 — 비로그인으로 고정해 Supabase 클라이언트 생성까지 가지 않게 한다
// (home-view.test.tsx와 동일한 이유의 동일 패턴).
vi.mock('@/hooks/use-user', () => ({
  useUser: () => ({ user: null, isLoading: false }),
}));

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
  it('카드에 지점은 보이지 않고 접수기간/일정이 보인다', async () => {
    stubFetch([makeClass()]);
    render(<CultureClubTabView />);

    const title = await screen.findByText(/두근두근 무지개 레이저쇼/);
    const card = title.closest('.rounded-xl') as HTMLElement;
    expect(within(card).getByText(/접수기간 2026\.07\.23 10:00 ~ 2026\.10\.13/)).toBeInTheDocument();
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
});
