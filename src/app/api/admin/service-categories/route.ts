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
