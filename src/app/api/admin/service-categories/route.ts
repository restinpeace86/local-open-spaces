import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// [개선사항10 - 중복 스팟 그룹핑 및 매핑 탭](2026-09-04 todo.md) 1항: "서비스 노출
// 중분류 테이블 — 관리자가 관리자 화면에서 직접 생성/수정할 수 있어야 함." 이 앱은
// 아직 로그인/세션 인증이 없어(known gap, 다른 관리자 API 라우트와 동일한 상황)
// service_role 클라이언트를 서버에서만 쓴다 — service_categories는 RLS가 켜져 있고
// 정책이 없어 anon 키로는 조회/쓰기 모두 불가능하다.
export async function GET() {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('service_categories')
      .select('*')
      .order('parent_category', { ascending: true })
      .order('category_name', { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ items: data ?? [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : '서비스 중분류 조회 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// [노출 중분류 삭제](2026-09-05 사용자 지시): "노출 중분류 기존거 삭제도 가능하도록
// 해줘.. 동물 먹이주기 체험농장하고 자연 체험장 분류하기 어렵네" — 시드 데이터로 들어간
// "동물 먹이주기 체험농장"/"흙/자연 체험장"처럼 구분이 애매한 중분류를 관리자가 직접
// 정리할 수 있어야 한다는 지적. open_spaces.service_category_id와 spot_dedup_groups.
// service_category_id 둘 다 이 테이블을 FK로 참조하는데 ON DELETE 절이 없어(기본값
// NO ACTION) 참조 중인 행이 있으면 그냥 DELETE는 실패한다 — 실패 자체를 안전장치로
// 삼되(추측으로 참조를 임의로 NULL 처리하지 않음), 몇 건이 참조 중인지 먼저 조회해
// 관리자에게 명확한 이유와 함께 안내한다(왜 삭제가 막혔는지 모른 채 원인불명 에러만
// 보는 것을 방지).
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 });
    }

    const admin = createAdminClient();

    const [openSpacesCount, dedupGroupsCount] = await Promise.all([
      admin.from('open_spaces').select('id', { count: 'exact', head: true }).eq('service_category_id', id),
      admin.from('spot_dedup_groups').select('id', { count: 'exact', head: true }).eq('service_category_id', id),
    ]);
    if (openSpacesCount.error) return NextResponse.json({ error: openSpacesCount.error.message }, { status: 500 });
    if (dedupGroupsCount.error) return NextResponse.json({ error: dedupGroupsCount.error.message }, { status: 500 });

    const referencedCount = (openSpacesCount.count ?? 0) + (dedupGroupsCount.count ?? 0);
    if (referencedCount > 0) {
      return NextResponse.json(
        {
          error: `이 노출 중분류를 참조하는 데이터가 ${referencedCount.toLocaleString()}건 있어 삭제할 수 없습니다(open_spaces ${openSpacesCount.count ?? 0}건, 중복 그룹 이력 ${dedupGroupsCount.count ?? 0}건). 먼저 해당 데이터를 다른 노출 중분류로 옮기거나 매핑을 해제해주세요.`,
        },
        { status: 409 }
      );
    }

    const { error } = await admin.from('service_categories').delete().eq('id', id);
    if (error) {
      // 위 사전 확인 이후에도(경합 등으로) FK 위반이 나면 마지막 안전망으로 명확한 문구를 준다.
      const message = error.code === '23503' ? '이 노출 중분류를 참조하는 데이터가 있어 삭제할 수 없습니다.' : error.message;
      return NextResponse.json({ error: message }, { status: 409 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : '서비스 중분류 삭제 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parentCategory = typeof body.parent_category === 'string' ? body.parent_category.trim() : '';
    const categoryName = typeof body.category_name === 'string' ? body.category_name.trim() : '';

    if (!parentCategory || !categoryName) {
      return NextResponse.json({ error: '대분류(parent_category)와 중분류명(category_name)을 모두 입력해주세요.' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('service_categories')
      .insert({ parent_category: parentCategory, category_name: categoryName })
      .select()
      .single();

    if (error) {
      // unique(parent_category, category_name) 위반을 사용자가 이해할 수 있는 문구로.
      const message = error.code === '23505' ? '이미 존재하는 대분류/중분류 조합입니다.' : error.message;
      return NextResponse.json({ error: message }, { status: 400 });
    }

    return NextResponse.json({ item: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : '서비스 중분류 생성 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
