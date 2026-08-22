import { NextResponse } from 'next/server';
import { getProvinceWideEvents } from '@/lib/home/get-home-feed';

// Task 9-6-2(2026-08-23, Decision 009): "🗺️ 경기도권 기타" 섹션 전용 지연 페칭 API.
// 위치 정보가 전혀 없는(location_precision='UNKNOWN') 행사는 특정 지역과 무관하므로
// sigungu/lat/lng 파라미터를 받지 않는다(다른 홈 피드 라우트와 달리 지역 재조회가 필요 없음).
export async function GET() {
  try {
    const provinceWideEvents = await getProvinceWideEvents(12);
    return NextResponse.json({ provinceWideEvents });
  } catch (err) {
    const message = err instanceof Error ? err.message : '경기도권 기타 피드 조회 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
