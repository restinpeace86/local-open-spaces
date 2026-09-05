import { NextRequest, NextResponse } from 'next/server';
import { extractBlogBodyText, toMobileNaverBlogUrl } from '@/lib/admin/naver-blog-body';

// [블로그 큐레이션 전체 본문 보기](2026-09-05 사용자 지시): "가져온 내용자체도
// 짧게하고 잘려서.." — 검색 API의 짧은 요약(description) 대신, 네이버 블로그
// URL이면 실제 글 페이지에서 본문 전체(적당한 길이로 제한)를 가져온다. 본문은
// 여기서도 DB에 저장하지 않는다 — 호출부(BlogReferenceViewer)가 화면에만 보여주고
// 모달/워크벤치가 닫히면 그대로 폐기한다(Decision 021 저장/폐기 정책 그대로).
//
// [실측 확인](2026-09-05): 네이버 블로그(m.blog.naver.com)만 본문이 서버 렌더링돼
// 안정적으로 추출 가능함을 확인했다 — 티스토리 등 다른 출처는 블로그마다 템플릿이
// 제각각이라 이번 범위에 포함하지 않는다(추측으로 범용 스크래퍼를 만들지 않음,
// 제3장 제5조). 네이버 블로그가 아니거나 추출에 실패하면 422를 반환하고, 호출부는
// 기존 요약 스니펫으로 조용히 폴백한다(제5장 제11조 오류 처리 원칙).
const FETCH_TIMEOUT_MS = 8000;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url');
    if (!url) {
      return NextResponse.json({ error: 'url이 필요합니다.' }, { status: 400 });
    }

    const mobileUrl = toMobileNaverBlogUrl(url);
    if (!mobileUrl) {
      return NextResponse.json(
        { error: '네이버 블로그 글이 아니라 전체 본문을 가져올 수 없습니다(요약만 제공됩니다).' },
        { status: 422 }
      );
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let html: string;
    try {
      const res = await fetch(mobileUrl, {
        // 일부 봇 차단 규칙을 피하기 위해 일반 브라우저 UA를 사용한다(실측상 UA 없이도
        // 200이 왔지만, 안정성을 위해 명시적으로 지정한다).
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        signal: controller.signal,
      });
      if (!res.ok) {
        return NextResponse.json({ error: `블로그 페이지를 불러오지 못했습니다 (HTTP ${res.status}).` }, { status: 502 });
      }
      html = await res.text();
    } finally {
      clearTimeout(timeoutId);
    }

    const text = extractBlogBodyText(html);
    if (!text) {
      return NextResponse.json(
        { error: '이 글에서 본문 영역을 찾지 못했습니다(비공개 글이거나 형식이 다른 글일 수 있음).' },
        { status: 422 }
      );
    }

    return NextResponse.json({ text });
  } catch (err) {
    const message = err instanceof Error ? err.message : '블로그 본문 조회 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
