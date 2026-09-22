import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildSmartBlogQuery, extractAllSigunguCoreNames } from '@/lib/admin/naver-blog-search';
import { fetchNaverBlogItems } from '@/lib/naver/blog-search-server';
import {
  BLOG_REVIEW_MAX,
  isBlogCacheFresh,
  selectTrustedBlogUrls,
} from '@/lib/spaces/blog-review-cache';

// [스팟픽 상세 카드 네이버 블로그 후기 + 10일 캐싱(TTL)](2026-09-10 사용자 지시,
// implementation/todo.md 개선사항2-7). Cache-Aside:
//  1) 관리자가 블로그 큐레이션(spot_curations.blog_url_1..3)을 이미 해뒀으면 그걸
//     그대로 쓴다 — 사람이 검증한 URL이라 가장 신뢰도가 높고, 외부 API도 안 쓴다.
//  2) 아니면 open_spaces.blog_review_urls 캐시가 10일 이내면 그대로 내려준다.
//  3) 둘 다 아니면 네이버 블로그 검색 API를 호출 → 신뢰도 검증(주소/지역명이
//     제목·본문에 포함) 통과 URL만 최대 3개 → open_spaces에 캐시 upsert 후 반환.
//     결과가 0건이어도 blog_review_updated_at을 갱신해 10일간 재호출을 막는다.
//  - 네이버 호출이 실패하면 상세 카드가 죽지 않도록(제5장 제11조) 있는 캐시(있으면)
//    혹은 빈 배열을 조용히 반환한다.
//  - 검색 결과가 0건이면 클라이언트가 영역을 숨긴다(urls: []).
export async function GET(request: NextRequest) {
  try {
    const spotId = new URL(request.url).searchParams.get('spot_id')?.trim();
    if (!spotId) {
      return NextResponse.json({ error: 'spot_id는 필수입니다.' }, { status: 400 });
    }

    const admin = createAdminClient();

    const { data: spot, error: spotError } = await admin
      .from('open_spaces')
      .select('id, name, display_name, address, sigungu_name, blog_review_urls, blog_review_updated_at')
      .eq('id', spotId)
      .maybeSingle();
    if (spotError) return NextResponse.json({ error: spotError.message }, { status: 500 });
    if (!spot) return NextResponse.json({ item: { urls: [], source: 'none' } });

    // 1) 관리자 블로그 큐레이션 우선.
    const { data: curation } = await admin
      .from('spot_curations')
      .select('blog_url_1, blog_url_2, blog_url_3')
      .eq('spot_id', spotId)
      .eq('is_active', true)
      .maybeSingle();
    const curatedUrls = [curation?.blog_url_1, curation?.blog_url_2, curation?.blog_url_3]
      .filter((u): u is string => typeof u === 'string' && u.trim().length > 0)
      .slice(0, BLOG_REVIEW_MAX);
    if (curatedUrls.length > 0) {
      return NextResponse.json({ item: { urls: curatedUrls, source: 'curation' } });
    }

    // 2) 신선한 캐시.
    const cachedUrls = Array.isArray(spot.blog_review_urls) ? spot.blog_review_urls : [];
    if (cachedUrls.length > 0 && isBlogCacheFresh(spot.blog_review_updated_at)) {
      return NextResponse.json({ item: { urls: cachedUrls, source: 'cache' } });
    }

    // 3) 재조회.
    // [개선사항 1 버그 수정](2026-09-22 사용자 지시, todo.md): "스팟 노출 이름
    // 변경 시 블로그 검색어 연동 버그" — 이 화면도 관리자가 "노출 이름 수동
    // 수정"으로 바꿨거나 네이버 플레이스에서 가져온 더 정확한 이름
    // (display_name)이 있으면 원본 name 대신 그 이름으로 검색하고 신뢰도
    // 검증도 그 이름 기준으로 한다 — 이전엔 name만 읽어 이름을 바꿔도 이
    // 사용자 화면(블로그 후기 링크)에는 예전 이름 기준 검색 결과가 계속
    // 캐시됐다. (이 화면은 "블로그로 큐레이션" 관리자 화면과 달리 시군구
    // 접미사 로직 제거 요청 대상이 아니라 그대로 유지한다.)
    const effectiveName = spot.display_name ?? spot.name;
    const query = buildSmartBlogQuery(effectiveName, spot.sigungu_name);
    const regionCoreNames = extractAllSigunguCoreNames(spot.sigungu_name);
    const result = await fetchNaverBlogItems(query, { sort: 'date', display: 10 });

    if (!result.ok) {
      // 외부 API 실패 — 상세 카드를 막지 않는다. 오래됐어도 있는 캐시를 준다.
      return NextResponse.json({ item: { urls: cachedUrls, source: cachedUrls.length > 0 ? 'stale' : 'none' } });
    }

    const trustedUrls = selectTrustedBlogUrls(result.items, regionCoreNames, effectiveName);

    // 결과가 0건이어도 updated_at을 갱신해 10일간 재호출을 막는다.
    const { error: updateError } = await admin
      .from('open_spaces')
      .update({ blog_review_urls: trustedUrls, blog_review_updated_at: new Date().toISOString() })
      .eq('id', spotId);
    if (updateError) {
      // 캐시 저장 실패해도 이번 조회 결과는 그대로 내려준다.
      return NextResponse.json({ item: { urls: trustedUrls, source: 'fresh' } });
    }

    return NextResponse.json({ item: { urls: trustedUrls, source: 'fresh' } });
  } catch (err) {
    const message = err instanceof Error ? err.message : '블로그 후기 조회 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
