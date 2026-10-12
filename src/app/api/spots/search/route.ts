import { NextRequest, NextResponse } from 'next/server';
import { searchSpacesNationwide } from '@/lib/home/get-home-feed';

// [스팟픽 전국구 서버사이드 검색](2026-08-30 사용자 지시): /nearby(스팟픽) 지도 검색을
// 지도 중심/반경 기반 클라이언트 필터에서 open_spaces 전체를 대상으로 한 서버사이드
// 검색으로 전환한다. src/app/api/home/search/route.ts(이벤트픽 GNB 검색, events 전용)와
// 명확히 분리된 별도 엔드포인트다(그 파일 주석에 이미 이 분리를 예고해 두었다).
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get('q') ?? '').trim();
    if (!q) return NextResponse.json({ items: [] });

    // [관리자 스팟 큐레이션 탭 자동완성](2026-09-01 사용자 지시): 관리자 화면이 특정
    // 중분류(예: '놀이방식당')로만 좁힌 검색을 요청할 때 쓴다. 넘기지 않으면(일반
    // /nearby 검색) 기존처럼 전국구 무제한 검색이다.
    const categoryMin = searchParams.get('category_min')?.trim() || undefined;
    // [스팟픽 지도 검색도 노출중분류 매핑된 것만](2026-10-10 사용자 지시: "스팟픽에서의
    // 검색이니깐 마찬가지로 노출중분류 매핑된데만 보이도록") — 이 엔드포인트는 글쓰기
    // 스팟 매핑(spot-picker.tsx)/관리자 큐레이션 자동완성과도 공유되는데, 그 두 곳은
    // 노출중분류 없는 스팟도 찾아서 매핑/관리할 수 있어야 해서(Decision 030 — 사용자가
    // 직접 확인한 의도된 예외) 무조건 거를 수 없다 — map-explorer.tsx(스팟픽 지도 검색)
    // 만 이 파라미터를 보내 선택적으로 거른다.
    const requireServiceCategory = searchParams.get('require_service_category') === 'true';
    const items = await searchSpacesNationwide(q, 201, categoryMin, requireServiceCategory);
    return NextResponse.json({ items });
  } catch (err) {
    const message = err instanceof Error ? err.message : '스팟 검색 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
