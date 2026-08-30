import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// [관리자 화면(/admin/data-grid) 기능 고도화 및 범용 제휴 상품 테이블 개편](2026-08-30
// 사용자 지시): curated_items(범용 큐레이션/제휴 상품) 관리 전용 API. 이 앱은 아직
// 로그인/세션 인증이 없어(known gap, category-rules/reservations API와 동일한 상황)
// 서비스 롤 클라이언트를 서버에서만 쓴다 — curated_items는 RLS가 켜져 있고 정책이 없어
// anon 키로는 조회/쓰기 모두 불가능하다.
const DEFAULT_PAGE_SIZE = 50;
const VALID_CATEGORIES = ['ticket', 'coupang'] as const;

function isValidDateString(value: unknown): value is string {
  if (typeof value !== 'string' || value === '') return false;
  return !Number.isNaN(new Date(`${value}T00:00:00`).getTime());
}

// 요구사항 2: 상품명 키워드 검색(title), 등록일(created_at) 범위, 운영/예약 가능 기간
// (operation_start_date~operation_end_date) 범위 필터를 모두 지원한다. 기존
// /api/admin/data-grid(open_spaces/events/raw_ingest_data 전용, 복잡한 표준 중분류/
// 타겟 연령 체계에 강하게 결합됨)와는 완전히 다른 도메인이라 별도 라우트로 분리했다
// (제5장 제4조 기존 구조 우선의 취지는 "동일 목적 중복 방지"이지 "다른 목적을 억지로
// 통합"이 아니라고 판단 — deals-collector.mjs를 BaseCollectorAdapter와 분리했던 것과
// 동일한 판단 근거).
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q')?.trim();
    const createdFrom = searchParams.get('created_from');
    const createdTo = searchParams.get('created_to');
    const operationFrom = searchParams.get('operation_from');
    const operationTo = searchParams.get('operation_to');
    const category = searchParams.get('category');
    const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);
    const pageSize = Number(searchParams.get('page_size')) || DEFAULT_PAGE_SIZE;
    const from = (page - 1) * pageSize;

    const admin = createAdminClient();
    let query = admin.from('curated_items').select('*', { count: 'exact' }).order('created_at', { ascending: false });

    if (q) query = query.ilike('title', `%${q}%`);
    if (category) query = query.eq('category', category);
    if (createdFrom) query = query.gte('created_at', `${createdFrom}T00:00:00`);
    if (createdTo) query = query.lte('created_at', `${createdTo}T23:59:59`);
    // 요구사항 2 "신규 필터 추가(기간 필터)": 운영 기간이 조회 범위와 조금이라도 겹치면
    // 노출한다(완전 포함이 아니라 구간 겹침 판정) — operation_end_date >= from AND
    // operation_start_date <= to. 두 컬럼 다 NULL 허용이라(상시 노출 상품) NULL인 쪽은
    // "그 경계가 없다"는 뜻으로 조건에서 제외한다.
    if (operationFrom) query = query.or(`operation_end_date.is.null,operation_end_date.gte.${operationFrom}`);
    if (operationTo) query = query.or(`operation_start_date.is.null,operation_start_date.lte.${operationTo}`);

    const { data, error, count } = await query.range(from, from + pageSize - 1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ items: data ?? [], total: count ?? 0, page, pageSize });
  } catch (err) {
    const message = err instanceof Error ? err.message : '큐레이션 상품 목록 조회 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function validatePayload(body: Record<string, unknown>): string | null {
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const bookingUrl = typeof body.booking_url === 'string' ? body.booking_url.trim() : '';
  const category = typeof body.category === 'string' ? body.category : '';

  if (!title) return '상품명을 입력해 주세요.';
  if (!bookingUrl) return '제휴 링크(booking_url)를 입력해 주세요.';
  if (!VALID_CATEGORIES.includes(category as (typeof VALID_CATEGORIES)[number])) {
    return `category는 ${VALID_CATEGORIES.join(' 또는 ')} 중 하나여야 합니다.`;
  }
  if (body.operation_start_date != null && body.operation_start_date !== '' && !isValidDateString(body.operation_start_date)) {
    return '운영 시작일이 올바르지 않습니다.';
  }
  if (body.operation_end_date != null && body.operation_end_date !== '' && !isValidDateString(body.operation_end_date)) {
    return '운영 종료일이 올바르지 않습니다.';
  }
  return null;
}

// 요구사항 2 "[+ 신규 상품 등록]": title/image_url/booking_url/category/is_active/
// operation_start_date/operation_end_date를 받아 바로 DB에 추가한다.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validationError = validatePayload(body);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('curated_items')
      .insert({
        title: (body.title as string).trim(),
        image_url: typeof body.image_url === 'string' && body.image_url.trim() ? body.image_url.trim() : null,
        booking_url: (body.booking_url as string).trim(),
        category: body.category,
        is_active: body.is_active !== false,
        operation_start_date: body.operation_start_date || null,
        operation_end_date: body.operation_end_date || null,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ item: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : '큐레이션 상품 등록 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// 요구사항 2 "[수정]" + "원클릭 노출 토글": 둘 다 동일하게 id로 특정 행의 일부 컬럼만
// 바꾸는 동작이라 PATCH 하나로 함께 처리한다(토글은 body에 { id, is_active }만 실려온다).
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const id = typeof body.id === 'string' ? body.id.trim() : '';
    if (!id) {
      return NextResponse.json({ error: 'id는 필수입니다.' }, { status: 400 });
    }

    const updates: Partial<{
      title: string;
      image_url: string | null;
      booking_url: string;
      category: string;
      is_active: boolean;
      operation_start_date: string | null;
      operation_end_date: string | null;
    }> = {};
    if (typeof body.title === 'string') {
      if (!body.title.trim()) return NextResponse.json({ error: '상품명을 입력해 주세요.' }, { status: 400 });
      updates.title = body.title.trim();
    }
    if ('image_url' in body) updates.image_url = typeof body.image_url === 'string' && body.image_url.trim() ? body.image_url.trim() : null;
    if (typeof body.booking_url === 'string') {
      if (!body.booking_url.trim()) return NextResponse.json({ error: '제휴 링크를 입력해 주세요.' }, { status: 400 });
      updates.booking_url = body.booking_url.trim();
    }
    if (typeof body.category === 'string') {
      if (!VALID_CATEGORIES.includes(body.category as (typeof VALID_CATEGORIES)[number])) {
        return NextResponse.json({ error: `category는 ${VALID_CATEGORIES.join(' 또는 ')} 중 하나여야 합니다.` }, { status: 400 });
      }
      updates.category = body.category;
    }
    if (typeof body.is_active === 'boolean') updates.is_active = body.is_active;
    if ('operation_start_date' in body) {
      if (body.operation_start_date && !isValidDateString(body.operation_start_date)) {
        return NextResponse.json({ error: '운영 시작일이 올바르지 않습니다.' }, { status: 400 });
      }
      updates.operation_start_date = body.operation_start_date || null;
    }
    if ('operation_end_date' in body) {
      if (body.operation_end_date && !isValidDateString(body.operation_end_date)) {
        return NextResponse.json({ error: '운영 종료일이 올바르지 않습니다.' }, { status: 400 });
      }
      updates.operation_end_date = body.operation_end_date || null;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: '수정할 필드가 없습니다.' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin.from('curated_items').update(updates).eq('id', id).select().single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: '해당 상품을 찾을 수 없습니다.' }, { status: 404 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ item: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : '큐레이션 상품 수정 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
