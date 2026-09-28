// [미병합 어린이도서관 중복 4쌍 직접 병합](2026-09-29 사용자 지시): "일단 이 4쌍만
// 바로 병합해줘" — 노원어린이도서관/국립어린이청소년도서관/아리랑어린이도서관/
// 지혜샘어린이도서관 4쌍은 실제로 같은 물리적 장소인데도 자동 중복 스캔
// (find_spot_dedup_candidates)에 안 걸렸다. 실측 확인: 주소 정규화 결과가
// "특별시"/동 이름/시설명 표기 차이로 서로 달라 문자열이 안 겹치고, 실제 좌표
// 거리도 30m 판정 임계값(spot-dedup-grouping.ts PROXIMITY_THRESHOLD_METERS)을
// 전부 초과했다(노원 36.3m, 국립 55.3m, 아리랑 118.2m, 지혜샘 136.8m — Haversine
// 실측). 그래서 관리자 화면의 자동 스캔으로는 후보로도 안 뜬다. 임계값을
// 전역으로 넓히는 건 다른 카테고리의 오탐(진짜 다른 장소를 잘못 묶음) 위험이
// 있어 사용자 확인 없이 임의로 바꾸지 않고(제3장 제5조), 이미 같은 장소임이
// 확인된 이 4쌍만 `/api/admin/spot-dedup/apply` 라우트와 정확히 동일한 로직으로
// 직접 병합한다(대표 선정: created_at 오름차순 — 동일 로직 재사용, 제5장 제4조).
import { pathToFileURL } from 'url';
import { loadEnv } from '../lib/load-env.mjs';
import { createAdminClient } from '../ingest/lib/supabase-admin.mjs';

loadEnv();

const CHILDREN_LIBRARY_SERVICE_CATEGORY_ID = '22286b2a-b386-4bb6-a853-31b62b3f62c7'; // 어린이 도서관

// [스팟 ID 목록, 표준 시설명] — apply/route.ts의 body.spot_ids/body.standard_name과
// 동일한 입력 형태.
const GROUPS_TO_MERGE = [
  { spotIds: ['3c9d96fb-e734-4c40-84fa-c3feb04d8949', '61165c85-6228-40f3-803d-37c683445697'], standardName: '노원어린이도서관' },
  { spotIds: ['37419c19-a1a2-4d37-9630-1d61e1bd936f', '5fbaa562-4b70-4d73-ae54-dd0d0c48308f'], standardName: '국립어린이청소년도서관' },
  { spotIds: ['c2c5713b-ca9a-4455-bf4a-a734dfc3744f', '2f809b26-8d22-4015-b781-198c8a3fa76a'], standardName: '아리랑어린이도서관' },
  { spotIds: ['2f25c622-d2a9-4f06-9502-76564825388a', '08efc12d-d3ef-46d1-92be-cc2cc2531a03'], standardName: '지혜샘어린이도서관' },
];

// [apply/route.ts와 동일 로직] 그룹 내 이 필드의 non-null 값들이 전부 서로
// 같으면 그 값을, 하나도 없거나 서로 다르면(충돌) null을 반환한다.
function mergeGroupArrayField(memberRows, field) {
  const nonNullValues = memberRows.map((r) => r[field]).filter((v) => Array.isArray(v) && v.length > 0);
  if (nonNullValues.length === 0) return null;
  const serialized = nonNullValues.map((v) => JSON.stringify([...v].sort()));
  const allSame = serialized.every((s) => s === serialized[0]);
  return allSame ? nonNullValues[0] : null;
}

export async function mergeOneGroup(admin, { spotIds, standardName }) {
  const { data: memberRows, error: memberError } = await admin
    .from('open_spaces')
    .select('id, created_at, naver_place_id, excluded_weekdays, excluded_nth_weekdays')
    .in('id', spotIds);
  if (memberError) throw new Error(`멤버 조회 실패: ${memberError.message}`);
  if (!memberRows || memberRows.length !== spotIds.length) {
    throw new Error(`존재하지 않는 스팟이 포함돼 있습니다(${standardName}).`);
  }

  const representativeId = memberRows.reduce((earliest, r) => {
    const rTime = new Date(r.created_at).getTime();
    const earliestTime = new Date(earliest.created_at).getTime();
    if (rTime !== earliestTime) return rTime < earliestTime ? r : earliest;
    return r.id < earliest.id ? r : earliest;
  }).id;

  const representativeRow = memberRows.find((r) => r.id === representativeId);
  const distinctNaverPlaceIds = Array.from(
    new Set(memberRows.map((r) => r.naver_place_id).filter((v) => typeof v === 'string' && v.length > 0))
  );
  const naverPlaceIdToMigrate =
    !representativeRow?.naver_place_id && distinctNaverPlaceIds.length === 1 ? distinctNaverPlaceIds[0] : null;

  const mergedExcludedWeekdays = mergeGroupArrayField(memberRows, 'excluded_weekdays');
  const mergedExcludedNthWeekdays = mergeGroupArrayField(memberRows, 'excluded_nth_weekdays');

  const { data: groupRow, error: groupError } = await admin
    .from('spot_dedup_groups')
    .insert({ member_spot_ids: spotIds, standard_name: standardName, service_category_id: CHILDREN_LIBRARY_SERVICE_CATEGORY_ID })
    .select('id')
    .single();
  if (groupError) throw new Error(`spot_dedup_groups insert 실패: ${groupError.message}`);

  const { error: updateError } = await admin
    .from('open_spaces')
    .update({
      standard_name: standardName,
      service_category_id: CHILDREN_LIBRARY_SERVICE_CATEGORY_ID,
      group_id: groupRow.id,
      is_dedup_representative: false,
      ...(mergedExcludedWeekdays ? { excluded_weekdays: mergedExcludedWeekdays } : {}),
      ...(mergedExcludedNthWeekdays ? { excluded_nth_weekdays: mergedExcludedNthWeekdays } : {}),
    })
    .in('id', spotIds);
  if (updateError) throw new Error(`open_spaces 갱신 실패: ${updateError.message}`);

  const { error: representativeError } = await admin
    .from('open_spaces')
    .update({ is_dedup_representative: true })
    .eq('id', representativeId);
  if (representativeError) throw new Error(`대표 지정 실패: ${representativeError.message}`);

  if (naverPlaceIdToMigrate) {
    const sourceId = memberRows.find((r) => r.naver_place_id === naverPlaceIdToMigrate).id;
    const { error: clearError } = await admin.from('open_spaces').update({ naver_place_id: null }).eq('id', sourceId);
    if (clearError) throw new Error(`naver_place_id 비우기 실패: ${clearError.message}`);
    const { error: migrateError } = await admin.from('open_spaces').update({ naver_place_id: naverPlaceIdToMigrate }).eq('id', representativeId);
    if (migrateError) throw new Error(`naver_place_id 이전 실패: ${migrateError.message}`);
  }

  return { groupId: groupRow.id, representativeId };
}

export async function run() {
  const admin = createAdminClient();
  const results = [];
  for (const group of GROUPS_TO_MERGE) {
    const result = await mergeOneGroup(admin, group);
    results.push({ standardName: group.standardName, ...result });
    console.log(`[MERGE_LIBRARY_DUPES] ${group.standardName}: group_id=${result.groupId}, representative=${result.representativeId}`);
  }
  console.log(`[MERGE_LIBRARY_DUPES] 완료 — ${results.length}개 그룹 병합`);
  return results;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  run()
    .then((results) => {
      console.log(`▶▶▶ [MERGE_LIBRARY_DUPES] 종료: ${results.length}개 그룹`);
      process.exitCode = 0;
    })
    .catch((err) => {
      console.error(`❌ [MERGE_LIBRARY_DUPES] 실행 실패: ${err.message}`);
      process.exitCode = 1;
    });
}
