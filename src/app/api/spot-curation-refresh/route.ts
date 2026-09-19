import { NextRequest, NextResponse } from 'next/server';
import { checkAndRefreshSpotCuration } from '@/lib/admin/spot-curation-refresh';

// [스팟 큐레이션 온디맨드 재크롤링](2026-09-20 사용자 지시): 스팟/이벤트 상세 페이지
// 어디서 열리든 이 라우트 하나를 그대로 호출한다(제5장 제4조, spot-notice-radar 라우트와
// 동일한 모양). checkAndRefreshSpotCuration 자체가 내부에서 예외를 삼키므로 여기서
// 실패 분기를 따로 만들 필요가 없고, 클라이언트는 이 응답을 기다리지 않는다
// (fire-and-forget) — 최소 7일에 한 번만 실제로 크롤링이 도는 매우 드문 트리거라,
// 갱신된 값은 다음 방문부터 보여도 충분하다.
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { spot_id?: string };
  const spotId = body.spot_id?.trim();
  if (!spotId) {
    return NextResponse.json({ error: 'spot_id는 필수입니다.' }, { status: 400 });
  }

  await checkAndRefreshSpotCuration(spotId);
  return NextResponse.json({ ok: true });
}
