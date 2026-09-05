import { NextRequest, NextResponse } from 'next/server';
import { cleanNaverText, isWithinRecentWindow } from '@/lib/admin/naver-blog-search';

// [관리자용 블로그 큐레이션 모달](2026-09-05 사용자 지시, Decision 021) — "관리자가
// 장소 상세 페이지에서 버튼을 누르면, 네이버 블로그 검색 API를 정확도순(sort=sim)으로
// 호출하여 상위 최신 글 3개를 가져옴." 서버에서만 호출한다 — NAVER_CLIENT_ID/SECRET을
// 클라이언트에 절대 노출하지 않기 위한 프록시 라우트다.
//
// [실측 확인](2026-09-05): 이 라우트를 만들며 실제로 호출해본 결과 현재
// .env.local의 키로는 401 "NID AUTH Result Invalid"가 발생한다 — 네이버 개발자센터
// 애플리케이션에 "검색 > 블로그" API가 활성화돼 있지 않거나 키 자체가 유효하지 않은
// 것으로 보인다(코드 문제가 아니라 계정/키 설정 문제, project/decision-log.md
// Decision 021 참고). 아래 에러 핸들링이 이 케이스를 관리자가 이해할 수 있는
// 문구로 그대로 전달한다.
//
// [실측 확인 — "본문 텍스트" 범위](2026-09-05): 네이버 블로그 검색 API는 전체 본문이
// 아니라 description(약 200자 요약 스니펫, 매칭 키워드에 <b> 태그 포함)만 제공한다.
// 실제 블로그 페이지는 대부분 iframe 안에 본문이 렌더링돼 있어 안정적으로 크롤링할
// 수 없다(추측 금지) — 이번 구현은 검색 API가 실제로 제공하는 이 스니펫을 정제해
// 보여준다(전체 본문 스크래핑은 범위 밖, Decision 021 참고).
const NAVER_BLOG_SEARCH_URL = 'https://openapi.naver.com/v1/search/blog.json';
const DISPLAY_COUNT = 3;

type NaverBlogItem = {
  title: string;
  link: string;
  description: string;
  bloggername: string;
  postdate: string; // "YYYYMMDD"
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('query')?.trim();
    if (!query) {
      return NextResponse.json({ error: '검색어(query)가 필요합니다.' }, { status: 400 });
    }

    const clientId = process.env.NAVER_CLIENT_ID;
    const clientSecret = process.env.NAVER_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return NextResponse.json(
        { error: 'NAVER_CLIENT_ID/NAVER_CLIENT_SECRET 환경변수가 설정되지 않았습니다.' },
        { status: 500 }
      );
    }

    const url = `${NAVER_BLOG_SEARCH_URL}?${new URLSearchParams({
      query,
      display: String(DISPLAY_COUNT),
      sort: 'sim',
    }).toString()}`;

    const res = await fetch(url, {
      headers: { 'X-Naver-Client-Id': clientId, 'X-Naver-Client-Secret': clientSecret },
    });

    if (!res.ok) {
      const text = await res.text();
      // 실측으로 확인한 흔한 실패(401 NID AUTH Result Invalid)를 관리자가 바로
      // 이해할 수 있는 문구로 안내한다 — Decision 021 참고.
      const hint =
        res.status === 401
          ? ' (네이버 개발자센터에서 이 애플리케이션에 "검색 > 블로그" API가 활성화돼 있는지, 키가 유효한지 확인해주세요.)'
          : '';
      return NextResponse.json(
        { error: `네이버 블로그 검색 실패 (HTTP ${res.status})${hint}: ${text.slice(0, 300)}` },
        { status: 502 }
      );
    }

    const json = (await res.json()) as { items?: NaverBlogItem[] };
    const rawItems = json.items ?? [];

    const items = rawItems.slice(0, DISPLAY_COUNT).map((item) => ({
      title: cleanNaverText(item.title),
      link: item.link,
      description: cleanNaverText(item.description),
      bloggername: cleanNaverText(item.bloggername),
      postdate: item.postdate,
      isRecent: isWithinRecentWindow(item.postdate),
    }));

    // [최신성 검증(1년 룰)] 사용자 지시 원문: "3개 모두 1년 이상 지난 글이면.. 경고
    // 뱃지를 표시함." 글이 아예 0건이어도(검색 결과 없음) "최근 후기가 없다"는 같은
    // 결론이라 경고에 포함한다 — 다만 이 경우는 별도 안내 문구(hasNoResults)로
    // 구분해, "찾았는데 전부 오래됐다"와 "아예 못 찾았다"를 관리자가 헷갈리지 않게 한다.
    const hasRecentReview = items.some((item) => item.isRecent);

    return NextResponse.json({ items, hasRecentReview, hasNoResults: items.length === 0 });
  } catch (err) {
    const message = err instanceof Error ? err.message : '블로그 검색 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
