import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// [노출 중분류 스팟픽 연동 준비](2026-09-05 사용자 지시): "현재 open_spaces에서 이
// 노출 중분류 매핑할 수 있도록 개선해줘. 그리고 대량의 데이터도 한꺼번에 노출
// 중분류로 할 수 있는 것도." 기존 "중복 스팟 그룹핑" 탭(개선사항10)의 매핑
// 흐름은 2건 이상 중복 의심 그룹에만 적용 가능해, 중복이 없는 대다수 단일 행이나
// 애초에 대량(예: category_min='공원' 25,531건, '어린이놀이터' 57,692건, 실측
// 확인)을 매핑할 방법이 없었다. 이 라우트는 "원본 중분류(category_min) 값 하나
// 전체"를 기준으로 노출 중분류(service_category_id)를 일괄 반영한다 — 개별 id
// 목록을 주고받지 않고 서버에서 조건절 그대로 UPDATE해 몇만 건 단위도 안전하게
// 처리한다(제5장 제4조 기존 구조 우선 — spot_dedup 그룹 매핑과 다른 대상 규모라
// 별도 엔드포인트로 분리했다. group_id/history는 개별 그룹 단위 이력이 목적이라
// 이 대량 경로에는 적용하지 않는다 — 원본 category_min 자체가 "무엇을 기준으로
// 매핑했는지"에 대한 충분한 이력이다).
// data-grid-client.tsx의 NULL_FILTER_TOKEN과 동일한 예약값 — "category_min이 아예
// 없는(NULL) 행들"을 가리키는 별도 선택지로 쓴다. 빈 문자열은 "아직 아무것도
// 선택 안 함"으로 남겨 둬 실수로 전체 미분류 행에 적용되는 사고를 방지한다.
const NULL_CATEGORY_MIN_TOKEN = '__NULL__';

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function parseCategoryMinParam(value: string): string | null {
  return value === NULL_CATEGORY_MIN_TOKEN ? null : value;
}

// 미리보기(조회수 확인)와 실제 적용이 정확히 같은 대상 집합을 봐야 하므로 조건절
// 구성을 한 곳에서 공유한다.
function applyScope<Q extends { eq: (c: string, v: string) => Q; is: (c: string, v: null) => Q }>(
  query: Q,
  categoryMin: string | null,
  onlyUnmapped: boolean
): Q {
  let next = categoryMin === null ? query.is('category_min', null) : query.eq('category_min', categoryMin);
  if (onlyUnmapped) next = next.is('service_category_id', null);
  return next;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const categoryMinParam = searchParams.get('category_min');
    if (!isNonEmptyString(categoryMinParam)) {
      return NextResponse.json({ error: 'category_min이 필요합니다.' }, { status: 400 });
    }
    const categoryMin = parseCategoryMinParam(categoryMinParam);
    const onlyUnmapped = searchParams.get('only_unmapped') !== 'false';

    const admin = createAdminClient();
    const { count, error } = await applyScope(
      admin.from('open_spaces').select('*', { count: 'exact', head: true }),
      categoryMin,
      onlyUnmapped
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ matching_count: count ?? 0 });
  } catch (err) {
    const message = err instanceof Error ? err.message : '대상 건수 조회 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const categoryMinRaw = body.category_min;
    if (!isNonEmptyString(categoryMinRaw)) {
      return NextResponse.json({ error: 'category_min이 필요합니다.' }, { status: 400 });
    }
    const categoryMin = parseCategoryMinParam(categoryMinRaw);

    const serviceCategoryId = body.service_category_id;
    if (!isNonEmptyString(serviceCategoryId)) {
      return NextResponse.json({ error: '노출 중분류(service_category_id)를 선택해주세요.' }, { status: 400 });
    }
    const onlyUnmapped = body.only_unmapped !== false;

    // count: 'exact'만 요청하고 .select()는 쓰지 않는다 — 몇만 건이 매칭될 수 있어
    // (실측: category_min='어린이놀이터' 57,692건) 갱신된 행 전체를 응답 페이로드로
    // 돌려받으면 불필요하게 무겁다. 건수만 필요하다.
    const admin = createAdminClient();
    const { error, count } = await applyScope(
      admin.from('open_spaces').update({ service_category_id: serviceCategoryId }, { count: 'exact' }),
      categoryMin,
      onlyUnmapped
    );

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ updated_count: count ?? 0 });
  } catch (err) {
    const message = err instanceof Error ? err.message : '일괄 매핑 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
