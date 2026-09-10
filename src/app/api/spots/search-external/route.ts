import { NextRequest, NextResponse } from 'next/server';
import { searchKakaoLocalKeyword } from '@/lib/kakao/local-keyword-search';

// [사용자 글쓰기 스팟 검색 2단계 — 외부 API Fallback](2026-09-10 사용자 지시,
// implementation/todo.md 개선사항5): 내부 DB(/api/spots/search)에 결과가 없거나
// 부족할 때 클라이언트가 이 엔드포인트를 호출해 카카오 로컬 장소를 함께 보여준다.
// REST API 키를 클라이언트에 노출하지 않기 위한 서버 프록시. 실패해도 글쓰기가
// 막히지 않도록 빈 배열을 조용히 반환한다(제5장 제11조).
export async function GET(request: NextRequest) {
  const q = (new URL(request.url).searchParams.get('q') ?? '').trim();
  if (q.length < 3) return NextResponse.json({ items: [] });

  const result = await searchKakaoLocalKeyword(q, 5);
  if (!result.ok) return NextResponse.json({ items: [] });
  return NextResponse.json({ items: result.items });
}
