import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildPendingGroupKey } from '@/lib/admin/spot-dedup-pending-key';

// [중복 스팟 검수 및 매핑 모달 필드 정리](2026-09-09 사용자 지시): "블로그
// URL(선택)/연령대/특징 이런건 왜있어?.. 블로그 연령대 특징 같은건 나중에
// 블로그 큐레이션 같은곳에서 넣는걸로 하고 여기서는 빼는게 낫지 않을까?" —
// 실측 확인 결과 이 세 필드는 이 라우트에서만 write되고 앱 어디에서도
// read되지 않는 사문화 필드였다(블로그 큐레이션의 blog_url_1/2/3 +
// curation_badges가 이미 같은 역할을 더 풍부하게 대신함). age_group/
// feature_tag/blog_url을 요청 바디에서 받는 것 자체를 그만두고, open_spaces/
// spot_dedup_groups의 표준화 갱신 대상을 standard_name/service_category_id
// 두 가지로 좁혔다 — 컬럼 자체(데이터 구조 변경)는 이번에 건드리지 않았다.

// [개선사항10 - 중복 스팟 그룹핑 및 매핑 탭](2026-09-04 todo.md) 2-2항: "그룹 일괄
// 저장(Bulk Save) — 그룹에 속한 각각의 모든 원천 데이터 행에 표준 정보가 동일하게
// 저장(업데이트)되도록. 동시에 이 그룹핑 정보와 처리 완료 상태가 DB에 이력으로
// 적재되어야 함." 요구사항 그대로 "데이터 삭제나 복잡한 마스터 구조 대신, 그룹에
// 속한 원천 데이터들에 표준 정보를 각각 업데이트" — open_spaces 원본 행은 그대로
// 두고 nullable 컬럼만 채운다(행 병합/삭제 없음).
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const spotIds = Array.isArray(body.spot_ids) ? body.spot_ids.filter((id: unknown) => typeof id === 'string') : [];
    if (spotIds.length < 2) {
      return NextResponse.json({ error: '그룹은 최소 2개 이상의 스팟으로 구성돼야 합니다.' }, { status: 400 });
    }

    const standardName = typeof body.standard_name === 'string' ? body.standard_name.trim() : '';
    if (!standardName) {
      return NextResponse.json({ error: '표준 시설명을 입력해주세요.' }, { status: 400 });
    }

    const serviceCategoryId = typeof body.service_category_id === 'string' && body.service_category_id ? body.service_category_id : null;

    const admin = createAdminClient();

    // [개선사항2](todo.md, 2026-09-09): "관리자 검수/큐레이션 화면에서는 무조건
    // 하나의 깔끔한 레코드로 노출.. 후속 큐레이션이 대표 레코드 기준 딱 한 번씩만
    // 수행되도록" — 그룹을 확정하는 이 시점에 대표를 딱 한 번 결정해 고정한다
    // (get_nearby_spaces_and_events 등 소비자 RPC가 이후 매번 즉석 계산하지 않고
    // 이 컬럼만 본다 — 관리자가 큐레이션한 행이 곧 소비자에게 노출되는 행임을
    // 보장하기 위함). 기준: 가장 먼저 적재된(created_at 오름차순) 멤버. 클라이언트가
    // 보낸 spot_ids의 순서는 화면상 스캔 순서(geohash 등)일 뿐 신뢰할 근거가 없어
    // (제3장 제5조 추측 금지), 서버가 직접 DB에서 실제 created_at을 조회해 판정한다.
    const { data: memberRows, error: memberError } = await admin
      .from('open_spaces')
      .select('id, created_at')
      .in('id', spotIds);
    if (memberError) return NextResponse.json({ error: memberError.message }, { status: 500 });
    if (!memberRows || memberRows.length !== spotIds.length) {
      return NextResponse.json({ error: '존재하지 않는 스팟이 포함돼 있습니다.' }, { status: 400 });
    }
    // 실측 확인: 같은 배치로 수집된 행들은 created_at이 마이크로초까지 완전히
    // 동일한 경우가 흔하다(예: seoul_public_reservation) — id를 2차 기준으로 더해
    // 매 호출마다 같은 입력이면 같은 대표가 나오도록 완전히 결정적으로 만든다
    // (백필 마이그레이션의 `order by created_at asc, id asc`와 동일한 관례).
    const representativeId = memberRows.reduce((earliest, r) => {
      const rTime = new Date(r.created_at as string).getTime();
      const earliestTime = new Date(earliest.created_at as string).getTime();
      if (rTime !== earliestTime) return rTime < earliestTime ? r : earliest;
      return r.id < earliest.id ? r : earliest;
    }).id;

    // 1. 이력 테이블에 먼저 기록해 group_id를 발급받는다(요구사항: "그룹핑 정보와
    // 처리 완료 상태가 DB에 이력으로 적재").
    const { data: groupRow, error: groupError } = await admin
      .from('spot_dedup_groups')
      .insert({
        member_spot_ids: spotIds,
        standard_name: standardName,
        service_category_id: serviceCategoryId,
      })
      .select('id')
      .single();

    if (groupError) return NextResponse.json({ error: groupError.message }, { status: 500 });

    // 2. 그룹에 속한 모든 원천 행에 동일한 표준 정보를 각각 반영한다(마스터 행으로
    // 병합하지 않고, 원본 행 각각을 그대로 유지한 채 업데이트) — 우선 전원을
    // 비대표(false)로 채운 뒤, 대표 1건만 다시 true로 뒤집는다(이전에 다른 그룹의
    // 대표였다가 이번에 재배정되는 것 같은 경우까지 안전하게 보장).
    const { data: updatedRows, error: updateError } = await admin
      .from('open_spaces')
      .update({
        standard_name: standardName,
        service_category_id: serviceCategoryId,
        group_id: groupRow.id,
        is_dedup_representative: false,
      })
      .in('id', spotIds)
      .select('id');

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

    const { error: representativeError } = await admin
      .from('open_spaces')
      .update({ is_dedup_representative: true })
      .eq('id', representativeId);
    if (representativeError) return NextResponse.json({ error: representativeError.message }, { status: 500 });

    // [중복 스팟 검수 — 진행 상태 임시 저장](2026-09-05 사용자 지시): "수정 다하고
    // 등록하면 임시테이블에서.. 진짜 테이블로 옮겨가고 임시테이블에서는 해당 row들
    // 삭제된다거나?" 위 두 단계(spot_dedup_groups 이력 기록 + open_spaces 반영)로
    // "진짜 테이블로 옮기는" 절차는 이미 끝났으니, 같은 구성원 집합으로 임시 저장돼
    // 있었을 행을 정리한다. 애초에 임시 저장을 거치지 않고(예: 처음 열자마자 바로
    // 저장) 등록된 경우 삭제 대상이 없을 수 있는데, 그 자체는 정상 상황이라 에러로
    // 취급하지 않는다 — 이 정리가 실패해도 이미 반영된 실제 결과(위 두 단계)는
    // 되돌리지 않는다(부수적인 정리 실패로 핵심 작업 성공 응답을 막지 않음).
    await admin
      .from('spot_dedup_pending_groups')
      .delete()
      .eq('group_key', buildPendingGroupKey(spotIds))
      .then(({ error: cleanupError }) => {
        if (cleanupError) console.warn(`⚠️ 임시 저장 그룹 정리 실패(무시하고 계속): ${cleanupError.message}`);
      });

    return NextResponse.json({ group_id: groupRow.id, updated_count: updatedRows?.length ?? 0 });
  } catch (err) {
    const message = err instanceof Error ? err.message : '그룹 일괄 저장 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
