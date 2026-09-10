import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getBadgeOptionsForCategory, resolveCurationCategoryId } from '@/lib/admin/curation-badges';

// [개발 종합 요청] 스팟픽 MVP 스마트 폴백, 관리자 큐레이션 및 배치 안정화 고도화(2026-09-01)
// 섹션 1 "View/Reservation Fallback"이 읽는 공개 조회 엔드포인트. `/api/admin/spot-curations`
// (어드민 전용, is_active 무관하게 전체 조회)와 분리한다 — /api/curated-items ↔
// /api/admin/curated-items와 동일한 패턴(spot_curations는 RLS가 켜져 있고 정책이 없어
// anon 키로는 직접 조회 불가능하므로 서비스 롤 클라이언트를 서버에서만 쓴다). 공개
// 조회는 is_active=true인 것만 내려준다 — 관리자가 비활성화한 큐레이션은 유저에게
// "풍성한 뷰"로 노출되면 안 되고 즉시 공공데이터 기본 뼈대로 되돌아가야 한다.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const spotId = searchParams.get('spot_id')?.trim();
    if (!spotId) {
      return NextResponse.json({ error: 'spot_id는 필수입니다.' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('spot_curations')
      .select(
        // [가격 및 메뉴 '준비 중' 플레이스홀더](2026-09-08 사용자 지시, todo.md
        // 개선사항3-5): 상세 모달에 입장료를 보여주려면 child_fee/guardian_fee가
        // 함께 내려와야 한다.
        // [마커 프리뷰 카드 핵심 뱃지](2026-09-08 개선사항3-4): 프리뷰 카드가
        // "핵심 뱃지"를 보여주려면 curation_badges(키 배열)와, 그 키를 사람이
        // 읽을 라벨로 바꾸는 데 필요한 노출 중분류 이름(service_categories.
        // category_name, open_spaces를 거쳐 조인)이 함께 필요하다.
        // [동적 연령 추천 시스템](2026-09-10 사용자 지시, todo.md 개선사항1):
        // min_age_recommended > 0이면 소비자 화면에서 "만 x세 이상" 뱃지로
        // 노출한다(0이면 미노출) — 값만 그대로 내려준다.
        'id, spot_id, image_url, operating_hours_raw, open_time, close_time, break_start, break_end, last_order, menu_items, child_fee, guardian_fee, naver_booking_url, curation_note, curation_badges, min_age_recommended, open_spaces(service_categories(category_name))'
      )
      .eq('spot_id', spotId)
      .eq('is_active', true)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ item: null });
    }

    // [마커 프리뷰 카드 핵심 뱃지](2026-09-08 개선사항3-4): 원본 뱃지 키(예:
    // 'kc_trampoline')는 카테고리마다 의미가 달라 클라이언트가 그대로 보여주면
    // 안 된다 — 여기서 사람이 읽을 라벨로 미리 바꿔서 내려준다. 매핑 안 되는
    // 노출 중분류/큐레이션 없음이면 기본(restaurant) 카테고리로 안전하게
    // 되돌아간다(resolveCurationCategoryId의 기존 규약과 동일).
    const openSpace = data.open_spaces as { service_categories: { category_name: string } | null } | null;
    const curationCategoryId = resolveCurationCategoryId(openSpace?.service_categories?.category_name ?? null);
    const badgeOptions = getBadgeOptionsForCategory(curationCategoryId);
    const badgeKeys = Array.isArray(data.curation_badges) ? data.curation_badges : [];
    const badgeLabels = badgeKeys
      .map((key) => badgeOptions.find((opt) => opt.key === key)?.label)
      .filter((label): label is string => Boolean(label));

    // open_spaces는 프론트가 필요로 하지 않는 내부 조인 결과라 응답에서 제외한다.
    const { open_spaces: _openSpaces, curation_badges: _curationBadges, ...rest } = data;
    return NextResponse.json({ item: { ...rest, badge_labels: badgeLabels } });
  } catch (err) {
    const message = err instanceof Error ? err.message : '스팟 큐레이션 조회 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
