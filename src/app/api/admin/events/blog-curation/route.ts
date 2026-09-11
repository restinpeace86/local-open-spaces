import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// [이벤트픽 관리자 블로그 큐레이션](2026-09-11 사용자 지시, implementation/todo.md
// 개선사항7-2/8): open_spaces의 spot_curations(Decision 021)와 달리 events는 별도
// 큐레이션 테이블이 없어(가격/영업시간 등 스팟 전용 개념이 없음) events 테이블의
// curated_blog_urls 컬럼을 직접 CRUD한다(2026-09-11-events-curated-blog-urls.sql).
// events는 RLS로 보호돼 있어(다른 관리자 라우트와 동일 패턴) service_role
// (createAdminClient())로만 갱신한다.
//
// [블로그 검수 결과를 바로 반영](2026-09-11 사용자 지시): "기껏 블로그에서 가격
// 찾았는데.. 어디다 반영을 못하네.. 타겟 연령도 체크할 수 있도록 해줘" — 블로그를
// 읽으며 확인한 가격(price_text)/타겟 연령(target_audience)을 같은 모달의 "저장 및
// 완료" 한 번으로 함께 저장한다(admin이 여러 화면을 오가지 않도록, 손이 덜 가게).
// target_audience는 이 모달에서 다루는 범위를 이벤트픽 노출 4대 조건
// (EVENT_PICK_TARGET_AUDIENCES, get-home-feed.ts와 동일 목록)으로만 좁힌다 —
// 일반 관리자 화면의 11종 전체 분류(TEEN/ADULT/OTHER 등)는 기존
// /api/admin/data-grid/target-audience가 계속 전담한다(제5장 제4조, 서로 다른
// 검증 범위라 중복이 아니다).
const MAX_URLS = 3;
const EVENT_PICK_TARGET_AUDIENCES = ['INFANT', 'KIDS_PRE', 'KIDS_SCHOOL', 'FAMILY'];

function normalizeUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .map((v) => v.trim())
    .slice(0, MAX_URLS);
}

function normalizeText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get('event_id');
    if (!eventId) {
      return NextResponse.json({ error: 'event_id가 필요합니다.' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('events')
      .select('curated_blog_urls, price_text, target_audience')
      .eq('id', eventId)
      .single();

    if (error) throw new Error(error.message);

    return NextResponse.json({
      urls: normalizeUrls(data?.curated_blog_urls),
      price_text: data?.price_text ?? null,
      // 이 모달은 4종만 다루므로, 현재 값이 그 밖의(TEEN/ADULT 등) 분류면 "미선택"으로
      // 보여준다 — 모달을 열었다 그냥 닫아도 기존 값을 다른 값으로 착각해 덮어쓰지 않도록.
      target_audience: EVENT_PICK_TARGET_AUDIENCES.includes(data?.target_audience ?? '') ? data!.target_audience : null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '이벤트 큐레이션 조회 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      event_id?: string;
      urls?: unknown;
      price_text?: unknown;
      target_audience?: unknown;
    };
    if (!body.event_id) {
      return NextResponse.json({ error: 'event_id가 필요합니다.' }, { status: 400 });
    }

    const urls = normalizeUrls(body.urls);
    const updates: {
      curated_blog_urls: string[];
      price_text?: string | null;
      target_audience?: string | null;
      target_audience_source?: string | null;
    } = { curated_blog_urls: urls };

    // [건드리지 않은 필드는 그대로 둔다] price_text/target_audience는 JSON body에
    // 그 키가 아예 없을 때만(클라이언트가 "변경 없음"으로 판단한 경우) 갱신을
    // 건너뛴다 — 안 그러면 관리자가 블로그 URL만 바꾸려고 열었다가 실수로 기존
    // target_audience(예: 다른 화면에서 이미 'OTHER'로 검수해 둔 값)를 null로
    // 덮어써버릴 수 있다.
    if ('price_text' in body) {
      updates.price_text = normalizeText(body.price_text);
    }
    if ('target_audience' in body) {
      const targetAudience = normalizeText(body.target_audience);
      if (targetAudience !== null && !EVENT_PICK_TARGET_AUDIENCES.includes(targetAudience)) {
        return NextResponse.json(
          { error: `target_audience는 ${EVENT_PICK_TARGET_AUDIENCES.join(', ')} 중 하나이거나 비어 있어야 합니다.` },
          { status: 400 }
        );
      }
      updates.target_audience = targetAudience;
      // [10대 타겟 분류 체계 실제 적용](2026-08-27 관례 재사용): 관리자가 직접
      // 선택하면 target_audience_source를 'MANUAL'로 남긴다 — /api/admin/data-grid/
      // target-audience와 동일 규약(제5장 제4조).
      updates.target_audience_source = targetAudience ? 'MANUAL' : null;
    }

    const admin = createAdminClient();
    const { error } = await admin.from('events').update(updates).eq('id', body.event_id);

    if (error) throw new Error(error.message);

    return NextResponse.json({ urls, price_text: updates.price_text, target_audience: updates.target_audience });
  } catch (err) {
    const message = err instanceof Error ? err.message : '이벤트 큐레이션 저장 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
