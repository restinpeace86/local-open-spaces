import { NextRequest, NextResponse } from 'next/server';
import { checkAndFetchSpotNotices } from '@/lib/admin/spot-notice-radar';

// [네이버 플레이스 공지 온디맨드 레이더](2026-09-19 사용자 지시): 스팟/이벤트/제휴상품
// 상세 페이지 어디서 열리든 이 라우트 하나를 그대로 호출한다(제5장 제4조). 새로
// 감지된 공지는 관리자 스테이징함에만 쌓이고 유저 화면엔 곧바로 안 보이므로, 클라이언트는
// 이 응답을 기다릴 필요가 없다(fire-and-forget) — 그래서 매우 단순하게 항상 200을
// 반환한다(checkAndFetchSpotNotices 자체가 내부에서 예외를 삼키므로 여기서 실패
// 분기를 따로 만들 필요가 없다).
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { spot_id?: string };
  const spotId = body.spot_id?.trim();
  if (!spotId) {
    return NextResponse.json({ error: 'spot_id는 필수입니다.' }, { status: 400 });
  }

  await checkAndFetchSpotNotices(spotId);
  return NextResponse.json({ ok: true });
}
