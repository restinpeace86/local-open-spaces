import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// [네이버 플레이스 공지 온디맨드 레이더 — 관리자 스테이징함](2026-09-19 사용자 지시):
// "관리자 대시보드의 '임시 보관함(Staging)' 테이블에 status: 'pending' 상태로 저장..
// 관리자는.. 검수하고, 자체 제작 썸네일과 요약 텍스트로 가공.. 발행하면
// status: 'published'" — spot_curations 관리자 CRUD(위 spot-curations/route.ts)와
// 동일한 패턴(service_role, open_spaces 조인으로 스팟명 표시).
const DEFAULT_PAGE_SIZE = 30;
const VALID_STATUSES = ['pending', 'published', 'archived'] as const;
type NoticeStatus = (typeof VALID_STATUSES)[number];

function isValidStatus(value: unknown): value is NoticeStatus {
  return typeof value === 'string' && (VALID_STATUSES as readonly string[]).includes(value);
}

function normalizeText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const statusParam = searchParams.get('status');
    const status = isValidStatus(statusParam) ? statusParam : 'pending';
    const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);
    const pageSize = Number(searchParams.get('page_size')) || DEFAULT_PAGE_SIZE;
    const from = (page - 1) * pageSize;

    const admin = createAdminClient();
    const { data, error, count } = await admin
      .from('spot_notices')
      .select('*, open_spaces(name, address)', { count: 'exact' })
      .eq('status', status)
      .order('created_at', { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ items: data ?? [], total: count ?? 0, page, pageSize });
  } catch (err) {
    const message = err instanceof Error ? err.message : '공지 스테이징 목록 조회 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, curated_title, curated_content, curated_image_url, status } = body as {
      id?: unknown;
      curated_title?: unknown;
      curated_content?: unknown;
      curated_image_url?: unknown;
      status?: unknown;
    };

    if (typeof id !== 'string' || !id) {
      return NextResponse.json({ error: 'id는 필수입니다.' }, { status: 400 });
    }
    if (status !== undefined && !isValidStatus(status)) {
      return NextResponse.json({ error: `status는 ${VALID_STATUSES.join('/')} 중 하나여야 합니다.` }, { status: 400 });
    }

    const admin = createAdminClient();
    // [발행 시각 기록](요청 원문 "published_at") — 발행 상태로 바뀔 때만 찍는다.
    // 스케줄링 용도가 아니라 감사(audit) 기록용이라, 노출 여부는 여전히 status만
    // 본다(archive했다가 다시 publish해도 published_at은 최신 발행 시각으로 갱신).
    const { data, error } = await admin
      .from('spot_notices')
      .update({
        updated_at: new Date().toISOString(),
        ...(curated_title !== undefined ? { curated_title: normalizeText(curated_title) } : {}),
        ...(curated_content !== undefined ? { curated_content: normalizeText(curated_content) } : {}),
        ...(curated_image_url !== undefined ? { curated_image_url: normalizeText(curated_image_url) } : {}),
        ...(status !== undefined ? { status } : {}),
        ...(status === 'published' ? { published_at: new Date().toISOString() } : {}),
      })
      .eq('id', id)
      .select('*, open_spaces(name, address)')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ item: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : '공지 수정 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
