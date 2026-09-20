import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// [실사용 버그 제보](2026-09-20 사용자 지시, 마포구 망원한강공원 서울형키즈카페 사례):
// "이게 서울형키즈카페인데.. 그냥 장소로 들어왔네.. 이게 제목으로 보이면 안되는데" —
// 원인 조사 결과 title은 원본 API 필드(SVCNM)를 그대로 옮겨 담을 뿐이라, 이 건은
// 원천 데이터 자체의 품질 문제였다(우리 코드에 폴백 로직이 있던 게 아님). 코드로 고칠
// 방법이 없어 관리자가 직접 바로잡을 수 있는 최소한의 수단을 추가한다 — category-min/
// facility-type 등 기존 개별 필드 수동 수정 라우트와 동일한 패턴(제5장 제4조).
//
// events.title은 재수집 시 안전 병합(upsertRowsSafeMerge)이 이미 채워진 값을 덮어쓰지
// 않도록 보호하므로(ALWAYS_REFRESH_FIELDS에 title이 없음 — scripts/ingest/lib/
// supabase-admin.mjs 확인), 여기서 한 번 수정해두면 다음 재수집에도 안전하게 유지된다.
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, title } = body as { id?: unknown; title?: unknown };

    if (typeof id !== 'string' || !id) {
      return NextResponse.json({ error: 'id는 필수입니다.' }, { status: 400 });
    }
    const nextTitle = typeof title === 'string' ? title.trim() : '';
    if (!nextTitle) {
      return NextResponse.json({ error: '제목은 비울 수 없습니다.' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin.from('events').update({ title: nextTitle }).eq('id', id).select('id, title').single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ row: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : '제목 수동 수정 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
