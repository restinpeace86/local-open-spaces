import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { escapeIlikePattern, splitSearchTokens } from '@/lib/search/keyword-search';

// [개발 종합 요청] 스팟픽 MVP 스마트 폴백, 관리자 큐레이션 및 배치 안정화 고도화(2026-09-01)
// 섹션 2: 관리자 전용 "스팟 큐레이션" CRUD. spot_curations는 RLS가 켜져 있고 정책이 없어
// service_role(createAdminClient())만 접근 가능하다(curated_items/deals와 동일 패턴).
// open_spaces와 spot_id FK 관계가 있어 PostgREST의 임베디드 리소스 select(`open_spaces(...)`)로
// 조인해 이름/주소를 함께 내려준다 — 관리자 목록 화면에 스팟명이 그대로 보이게 하기 위함.
const DEFAULT_PAGE_SIZE = 30;

type SpotCurationRow = {
  id: string;
  spot_id: string;
  is_active: boolean;
  image_url: string | null;
  operating_hours_raw: string | null;
  open_time: string | null;
  close_time: string | null;
  break_start: string | null;
  break_end: string | null;
  last_order: string | null;
  menu_items: unknown;
  curation_note: string | null;
  created_at: string;
  updated_at: string;
  open_spaces: { name: string; address: string | null; category: string } | null;
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const spotId = searchParams.get('spot_id');
    const q = searchParams.get('q')?.trim();
    const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);
    const pageSize = Number(searchParams.get('page_size')) || DEFAULT_PAGE_SIZE;
    const from = (page - 1) * pageSize;

    const admin = createAdminClient();

    // spot_id로 단건 조회(View Fallback/편집 폼이 "이 스팟에 이미 큐레이션이 있는지"
    // 확인할 때 사용) — 없으면 null을 반환한다(에러 아님, 아직 큐레이션 안 된 게 정상).
    if (spotId) {
      const { data, error } = await admin
        .from('spot_curations')
        .select('*, open_spaces(name, address, category)')
        .eq('spot_id', spotId)
        .maybeSingle();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ item: (data as SpotCurationRow | null) ?? null });
    }

    let query = admin
      .from('spot_curations')
      .select('*, open_spaces!inner(name, address, category)', { count: 'exact' })
      .order('updated_at', { ascending: false });

    // 검색어는 조인된 open_spaces.name/address를 대상으로 한다 — 관리자가 스팟 이름으로
    // 찾는 게 자연스럽다. splitSearchTokens/escapeIlikePattern 재사용(기존 검색 유연성
    // 개선 작업과 동일한 관례).
    for (const token of splitSearchTokens(q ?? '')) {
      const escaped = escapeIlikePattern(token);
      query = query.or(`name.ilike.%${escaped}%,address.ilike.%${escaped}%`, { referencedTable: 'open_spaces' });
    }

    const { data, error, count } = await query.range(from, from + pageSize - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ items: (data ?? []) as SpotCurationRow[], total: count ?? 0, page, pageSize });
  } catch (err) {
    const message = err instanceof Error ? err.message : '스팟 큐레이션 목록 조회 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function isValidMenuItems(value: unknown): value is Array<{ name: string; price: number }> {
  if (!Array.isArray(value)) return false;
  return value.every(
    (item) =>
      item &&
      typeof item === 'object' &&
      typeof (item as Record<string, unknown>).name === 'string' &&
      typeof (item as Record<string, unknown>).price === 'number'
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const spotId = typeof body.spot_id === 'string' ? body.spot_id.trim() : '';
    if (!spotId) {
      return NextResponse.json({ error: 'spot_id는 필수입니다.' }, { status: 400 });
    }
    if ('menu_items' in body && body.menu_items != null && !isValidMenuItems(body.menu_items)) {
      return NextResponse.json({ error: 'menu_items는 { name, price } 배열이어야 합니다.' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('spot_curations')
      .insert({
        spot_id: spotId,
        is_active: body.is_active !== false,
        image_url: typeof body.image_url === 'string' && body.image_url.trim() ? body.image_url.trim() : null,
        operating_hours_raw: typeof body.operating_hours_raw === 'string' ? body.operating_hours_raw : null,
        open_time: body.open_time || null,
        close_time: body.close_time || null,
        break_start: body.break_start || null,
        break_end: body.break_end || null,
        last_order: body.last_order || null,
        menu_items: isValidMenuItems(body.menu_items) ? body.menu_items : [],
        curation_note: typeof body.curation_note === 'string' ? body.curation_note : null,
      })
      .select('*, open_spaces(name, address, category)')
      .single();

    if (error) {
      // spot_id unique 제약 위반(이미 큐레이션 존재) — PATCH를 쓰라고 명확히 안내한다.
      if (error.code === '23505') {
        return NextResponse.json({ error: '이 스팟은 이미 큐레이션이 등록되어 있습니다. 수정(PATCH)을 이용해 주세요.' }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ item: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : '스팟 큐레이션 등록 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const id = typeof body.id === 'string' ? body.id.trim() : '';
    if (!id) {
      return NextResponse.json({ error: 'id는 필수입니다.' }, { status: 400 });
    }
    if ('menu_items' in body && body.menu_items != null && !isValidMenuItems(body.menu_items)) {
      return NextResponse.json({ error: 'menu_items는 { name, price } 배열이어야 합니다.' }, { status: 400 });
    }

    const updates: Partial<{
      updated_at: string;
      is_active: boolean;
      image_url: string | null;
      operating_hours_raw: string | null;
      open_time: string | null;
      close_time: string | null;
      break_start: string | null;
      break_end: string | null;
      last_order: string | null;
      menu_items: Array<{ name: string; price: number }>;
      curation_note: string | null;
    }> = { updated_at: new Date().toISOString() };
    if (typeof body.is_active === 'boolean') updates.is_active = body.is_active;
    if ('image_url' in body) updates.image_url = typeof body.image_url === 'string' && body.image_url.trim() ? body.image_url.trim() : null;
    if ('operating_hours_raw' in body) updates.operating_hours_raw = typeof body.operating_hours_raw === 'string' ? body.operating_hours_raw : null;
    if ('open_time' in body) updates.open_time = body.open_time || null;
    if ('close_time' in body) updates.close_time = body.close_time || null;
    if ('break_start' in body) updates.break_start = body.break_start || null;
    if ('break_end' in body) updates.break_end = body.break_end || null;
    if ('last_order' in body) updates.last_order = body.last_order || null;
    if ('menu_items' in body) updates.menu_items = isValidMenuItems(body.menu_items) ? body.menu_items : [];
    if ('curation_note' in body) updates.curation_note = typeof body.curation_note === 'string' ? body.curation_note : null;

    if (Object.keys(updates).length === 1) {
      return NextResponse.json({ error: '수정할 필드가 없습니다.' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('spot_curations')
      .update(updates)
      .eq('id', id)
      .select('*, open_spaces(name, address, category)')
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: '해당 큐레이션을 찾을 수 없습니다.' }, { status: 404 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ item: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : '스팟 큐레이션 수정 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
