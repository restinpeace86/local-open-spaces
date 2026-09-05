import { NextRequest, NextResponse } from 'next/server';
import { cleanNaverText, isWithinRecentWindow, resolveBlogSort } from '@/lib/admin/naver-blog-search';

// [관리자용 블로그 큐레이션 모달](2026-09-05 사용자 지시, Decision 021) — "관리자가
// 장소 상세 페이지에서 버튼을 누르면, 네이버 블로그 검색 API를 정확도순(sort=sim)으로
// 호출하여 상위 최신 글 3개를 가져옴." 서버에서만 호출한다 — NAVER_CLIENT_ID/SECRET을
// 클라이언트에 절대 노출하지 않기 위한 프록시 라우트다.
//
// [NAVER API HUB 이관](2026-09-05 사용자 제공 공지 + 실측 확인): 네이버가 2026-06-25
// 부터 검색 API를 기존 개발자센터(openapi.naver.com)에서 NAVER Cloud Platform의
// "NAVER API HUB"로 이관했다 — 신규 애플리케이션은 이제 이 새 콘솔에서만 발급받을
// 수 있다. 처음엔 기존 엔드포인트/헤더로 호출해 401이 나서 "키/앱 설정 문제"로
// 오판했었는데, 사용자가 이 이관 공지를 제공해줘서 실제로는 엔드포인트와 인증
// 헤더 이름 자체가 바뀐 것이었음을 확인했다(같은 .env.local 키로 아래 새 엔드포인트
// 호출 시 200 응답 + 실제 검색 결과 확인 완료). 응답 JSON 필드(title/link/
// description/bloggername/postdate)는 기존과 동일해 파싱 로직은 그대로 둔다.
const NAVER_BLOG_SEARCH_URL = 'https://naverapihub.apigw.ntruss.com/search/v1/blog';
const DISPLAY_COUNT = 3;

// [정렬 기준 sim → date 교체 + 화면에서 전환 가능](2026-09-06 사용자 지시): 사용자
// 지시 원문은 "정확도순(sort=sim)"이었으나, "호박터숯불촌" 실제 사례로 재현 테스트한
// 결과 지금 NAVER API HUB의 sort=sim 랭킹이 스팸성 블로그를 상위로 올리는 것을
// 확인했다. 같은 요청에서 sort 값만 date로 바꿔보니 실제로 그 식당을 다룬 최근
// 글들이 정확히 상위에 나왔다 — sim만 유독 품질이 나쁘고 date는 정상 동작함을
// 직접 비교 확인했다(project/decision-log.md Decision 021 8항 참고). 이 기능
// 자체가 "최근 1년 이내 후기가 있는지" 확인하는 것이 목적이라 date(최신순)가
// 오히려 기능 취지에도 더 맞아 기본값으로 삼는다. 다만 사용자가 "나중에는 sim
// 기준으로도 변경할 수 있게.. 화면에서 sim/date 전환"을 요청해, 클라이언트가
// ?sort= 로 넘긴 값을 그대로 네이버에 전달한다 — 검증/기본값 로직은
// naver-blog-search.ts의 resolveBlogSort()로 뺐다(순수 함수로 단위 테스트하기
// 위함 — 이 프로젝트는 route.ts를 직접 테스트하지 않는 관례).

// [실측 확인 — "본문 텍스트" 범위](2026-09-05): 네이버 블로그 검색 API는 전체 본문이
// 아니라 description(약 200자 요약 스니펫, 매칭 키워드에 <b> 태그 포함)만 제공한다.
// 실제 블로그 페이지는 대부분 iframe 안에 본문이 렌더링돼 있어 안정적으로 크롤링할
// 수 없다(추측 금지) — 이번 구현은 검색 API가 실제로 제공하는 이 스니펫을 정제해
// 보여준다(전체 본문 스크래핑은 범위 밖, Decision 021 참고).

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
    const sort = resolveBlogSort(searchParams.get('sort'));

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
      sort,
    }).toString()}`;

    // [NAVER API HUB 이관] 인증 헤더 이름이 X-Naver-Client-Id/Secret →
    // X-NCP-APIGW-API-KEY-ID/X-NCP-APIGW-API-KEY로 바뀌었다(위 주석 참고).
    const res = await fetch(url, {
      headers: { 'X-NCP-APIGW-API-KEY-ID': clientId, 'X-NCP-APIGW-API-KEY': clientSecret },
    });

    if (!res.ok) {
      const text = await res.text();
      // 401은 이제 "블로그 API 미활성화"보다 NAVER API HUB 콘솔에서 이 Application에
      // 검색 API가 연결돼 있지 않거나 키가 잘못됐을 가능성을 먼저 안내한다.
      const hint =
        res.status === 401
          ? ' (NAVER API HUB 콘솔에서 이 Application에 검색 API가 연결돼 있는지, Client ID/Secret이 정확한지 확인해주세요.)'
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
