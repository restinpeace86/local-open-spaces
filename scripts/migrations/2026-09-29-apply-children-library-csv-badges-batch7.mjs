// [사용자 제공 CSV(batch7) 기반 어린이도서관 뱃지 반영 — 정확한 주소로
// 재확인된 항목](2026-09-29 사용자 지시): "children_libraries_analysis_
// batch7.csv 여기 다시 넣어놨어 뱃지빈거.. 채워넣어줘" — batch1/batch6에서
// 이름+지역(시/도)만으로는 확신할 수 없어 반영을 보류했던 항목들을, 사용자가
// 이번엔 **정확한 전체 주소**로 직접 확인해 다시 제공했다. 그래서 이번엔
// province 수준이 아니라 주소 문자열 완전일치로 재대조했고(공백/괄호 제거
// 후 비교), 21건 전부 정확히 일치하는 DB 행을 찾았다(제3장 제5조 추측
// 금지 — 이번엔 추측이 아니라 실제 확인된 주소로 검증).
//
// [중요한 정정 3건]
// 1. "서울특별시교육청 어린이도서관" — 이전(batch6)엔 후보 3개 중 주소가
//    다른 fc529917(사직로 89)을 근거 부족으로 제외하고 f5759c7f/4ecb04fc
//    (사직로9길 7) 쌍만 반영했다. 이번에 사용자가 제공한 정확한 주소가
//    fc529917과 정확히 일치해, 실제로는 fc529917이 맞는 행이었다. f5759c7f/
//    4ecb04fc에 이미 반영된 뱃지는 그대로 두고(사용자가 지우라고 하지
//    않았음), fc529917에도 동일하게 반영한다 — 세 행 중 어느 게 진짜
//    대표인지는 별도 중복 검수가 필요하다(이번 지시 범위 밖, 특이사항에 기록).
// 2. "글마루한옥어린이도서관" — batch1/batch6에서는 원문 소개글로 확인된
//    aac0f845만 반영하고 4895720d(주소에 "개봉어린이도서관"이 섞여 있어
//    다른 시설일 가능성으로 제외)는 제외했다. 이번에 사용자가 제공한 정확한
//    주소가 4895720d와 정확히 일치해, 이 역시 반영 대상에 포함한다. aac0f845
//    쪽 뱃지도 그대로 둔다(두 행이 실제로 같은 곳인지는 별도 확인 필요).
// 3. "화전어린이도서관" — 이전엔 "경기 고양시"로 알려진 지역과 DB의 유일한
//    후보(경남 남해군)가 달라 반영을 보류했다. 이번에 사용자가 제공한 정확한
//    주소가 경남 남해군 쪽과 정확히 일치해, 이 DB 행이 맞는 것으로 확인됐다
//    (이전 지역 정보 "경기 고양시"가 부정확했던 것으로 보인다).
import { pathToFileURL } from 'url';
import { loadEnv } from '../lib/load-env.mjs';
import { createAdminClient } from '../ingest/lib/supabase-admin.mjs';

loadEnv();

export const BADGE_ASSIGNMENTS = {
  '8b955b85-c674-463f-a5d0-10d7dc2968a7': ['floor_seating', 'lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program'],
  'de32b75b-c574-4745-b258-a4fec33314fe': ['lib_infant_reading_room', 'lib_weekend_program', 'lib_english_picture_books'],
  'd2aaa67f-f2d0-43b3-b77c-26a4c48fcab6': ['lib_infant_reading_room', 'lib_weekend_program', 'lib_english_picture_books'],
  '9b7b1623-fb13-47ef-a8ad-759c89ace9fb': ['lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program'],
  '2f7775d9-2992-4408-ae7c-59ecd1f6b8c6': ['lib_infant_reading_room', 'lib_weekend_program', 'lib_english_picture_books'],
  '5e9638d9-2759-4638-9905-35c596d88ef4': ['floor_seating', 'lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program'],
  'bd9a6f70-c500-4417-ada6-5b0b0a48dc02': ['floor_seating', 'lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program'],
  '3265fe53-05cc-4c5e-9565-30b5917b671e': ['lib_weekend_program'],
  '274989ce-303e-4294-92df-be14e451bf74': ['floor_seating', 'lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program'],
  'f1fd5971-c610-407b-a661-11a347779d35': ['floor_seating', 'lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program'],
  '04328b69-b7f1-49a1-860d-969fef260b3b': ['lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program'],
  'cbd07c27-0519-41c4-8ae9-8526a0a3c78c': ['floor_seating', 'lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program'],
  '1e28507b-d1ee-4a3d-a143-b2b33fdfce3c': ['lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program'],
  '72d9c7cc-4086-472d-af90-3a6dd524f298': ['floor_seating', 'lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program'],
  'fc529917-5d25-4f1d-a259-63eec1efd41b': ['floor_seating', 'lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program'],
  '9f1ab612-4406-4bbe-9018-d89af948b671': ['floor_seating', 'lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program'],
  'd4a5075c-955f-4d11-9801-10a964e147af': ['lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program'],
  '4895720d-6451-4643-b9e6-56166e233c01': ['floor_seating', 'lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program'],
  '38782a96-f1ca-4af3-9bb9-5e136583bada': ['floor_seating', 'lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program'],
  'a11c8b4d-32d3-4328-bc77-32f63c97488f': ['floor_seating', 'lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program'],
};

export async function run() {
  const admin = createAdminClient();
  let updatedCount = 0;

  for (const [spotId, badgesToAdd] of Object.entries(BADGE_ASSIGNMENTS)) {
    const { data: existing, error: fetchError } = await admin
      .from('spot_curations')
      .select('curation_badges')
      .eq('spot_id', spotId)
      .maybeSingle();
    if (fetchError) throw new Error(`spot_curations 조회 실패(${spotId}): ${fetchError.message}`);

    const currentBadges = existing?.curation_badges ?? [];
    const merged = Array.from(new Set([...currentBadges, ...badgesToAdd]));

    const { error: upsertError } = await admin
      .from('spot_curations')
      .upsert({ spot_id: spotId, curation_badges: merged }, { onConflict: 'spot_id' });
    if (upsertError) throw new Error(`spot_curations upsert 실패(${spotId}): ${upsertError.message}`);

    updatedCount += 1;
    console.log(`[APPLY_CSV_LIBRARY_BADGES_BATCH7] ${spotId}: ${JSON.stringify(currentBadges)} -> ${JSON.stringify(merged)}`);
  }

  console.log(`[APPLY_CSV_LIBRARY_BADGES_BATCH7] 완료 — ${updatedCount}개 스팟 갱신`);
  return { updatedCount };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  run()
    .then(({ updatedCount }) => {
      console.log(`▶▶▶ [APPLY_CSV_LIBRARY_BADGES_BATCH7] 종료: ${updatedCount}건 갱신`);
      process.exitCode = 0;
    })
    .catch((err) => {
      console.error(`❌ [APPLY_CSV_LIBRARY_BADGES_BATCH7] 실행 실패: ${err.message}`);
      process.exitCode = 1;
    });
}
