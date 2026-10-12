import { afterEach, describe, expect, it, vi } from 'vitest';

// [스팟픽 지도 검색도 노출중분류 매핑된 것만](2026-10-10 사용자 지시,
// Decision 030 연장) — require_service_category=true일 때만
// searchSpacesNationwide에 그 플래그를 그대로 넘기는지 검증한다. 이
// 라우트는 글쓰기 스팟 매핑(spot-picker.tsx)/관리자 큐레이션 자동완성과
// 공유되므로, 파라미터가 없으면(기본값) 거르지 않아야 한다(의도된 예외).
const searchSpacesNationwideMock = vi.fn((_q: string, _limit?: number, _categoryMin?: string, _requireServiceCategory?: boolean) =>
  Promise.resolve([])
);
vi.mock('@/lib/home/get-home-feed', () => ({
  searchSpacesNationwide: (q: string, limit?: number, categoryMin?: string, requireServiceCategory?: boolean) =>
    searchSpacesNationwideMock(q, limit, categoryMin, requireServiceCategory),
}));

describe('GET /api/spots/search', () => {
  afterEach(() => {
    searchSpacesNationwideMock.mockClear();
  });

  it('require_service_category 파라미터가 없으면 false를 넘긴다(글쓰기 스팟 매핑/관리자 자동완성이 의존하는 기본 동작)', async () => {
    const { GET } = await import('./route');
    await GET(new Request('http://localhost/api/spots/search?q=놀이터') as never);

    expect(searchSpacesNationwideMock).toHaveBeenCalledWith('놀이터', 201, undefined, false);
  });

  it('require_service_category=true면 searchSpacesNationwide에 true를 그대로 넘긴다(스팟픽 지도 검색)', async () => {
    const { GET } = await import('./route');
    await GET(new Request('http://localhost/api/spots/search?q=놀이터&require_service_category=true') as never);

    expect(searchSpacesNationwideMock).toHaveBeenCalledWith('놀이터', 201, undefined, true);
  });

  it('category_min과 require_service_category를 함께 넘길 수 있다', async () => {
    const { GET } = await import('./route');
    await GET(new Request('http://localhost/api/spots/search?q=식당&category_min=놀이방식당&require_service_category=true') as never);

    expect(searchSpacesNationwideMock).toHaveBeenCalledWith('식당', 201, '놀이방식당', true);
  });

  it('검색어가 없으면 조회 자체를 하지 않는다', async () => {
    const { GET } = await import('./route');
    const res = await GET(new Request('http://localhost/api/spots/search') as never);
    const data = await res.json();

    expect(data.items).toEqual([]);
    expect(searchSpacesNationwideMock).not.toHaveBeenCalled();
  });
});
