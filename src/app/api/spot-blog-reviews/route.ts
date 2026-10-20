import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchBlogTitle } from '@/lib/spaces/blog-title';

// [자동 블로그 후기 기능 폐지](2026-10-16 사용자 지시): "유지하지마.. 일단 입력한것만
// 받는걸로 해.. 수동으로 체크한 블로그.. 외에는 다 없애" — 원래 이 라우트는 관리자
// 큐레이션이 없으면 네이버 블로그 검색 API로 자동 조회 → 신뢰도 검증(지역명/상호명
// 포함 여부) → 10일 캐싱까지 했다(todo.md 개선사항2-7, 2026-09-10). 그 신뢰도 검증이
// 상호명을 확인하지 않는 결함이 있어(Decision 039) 실제로 무관한 블로그가 노출되는
// 사고가 2건(위키/MOKA) 발생했고, 사용자가 "신뢰성이 바닥"이라고 판단해 자동 조회
// 전체를 폐지하고 관리자가 직접 확인한 큐레이션 URL만 노출하기로 했다(Decision 040).
// 캐싱/신뢰도 검증 전용이던 blog-review-cache.ts는 이제 아무도 쓰지 않아 삭제했다
// (관리자 큐레이션 화면의 별개 워닝 판정 hasRegionMismatch는 use-spot-curation-
// form.ts에 그대로 있다 — 이 삭제와 무관).
const BLOG_REVIEW_MAX = 3;

export async function GET(request: NextRequest) {
  try {
    const spotId = new URL(request.url).searchParams.get('spot_id')?.trim();
    if (!spotId) {
      return NextResponse.json({ error: 'spot_id는 필수입니다.' }, { status: 400 });
    }

    const admin = createAdminClient();

    const { data: curation, error: curationError } = await admin
      .from('spot_curations')
      .select('blog_url_1, blog_url_2, blog_url_3')
      .eq('spot_id', spotId)
      .eq('is_active', true)
      .maybeSingle();
    if (curationError) return NextResponse.json({ error: curationError.message }, { status: 500 });

    const curatedUrls = [curation?.blog_url_1, curation?.blog_url_2, curation?.blog_url_3]
      .filter((u): u is string => typeof u === 'string' && u.trim().length > 0)
      .slice(0, BLOG_REVIEW_MAX);

    if (curatedUrls.length > 0) {
      // [블로그 후기 제목 노출](2026-10-20 사용자 지시): URL만으로는 "블로그 후기 N"
      // 외엔 보여줄 게 없었다 — 각 URL을 fetch해 제목을 함께 내려준다. 실패해도
      // (느린 블로그/서버 오류) 전체 요청을 막지 않고 그 URL만 title: null로 폴백한다
      // (제5장 제11조 무중단 원칙).
      const urls = await Promise.all(
        curatedUrls.map(async (url) => ({ url, title: await fetchBlogTitle(url) }))
      );
      return NextResponse.json({ item: { urls, source: 'curation' } });
    }
    return NextResponse.json({ item: { urls: [], source: 'none' } });
  } catch (err) {
    const message = err instanceof Error ? err.message : '블로그 후기 조회 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
