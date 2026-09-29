// [사용자 제공 CSV(batch6) 기반 어린이도서관 뱃지 일괄 반영](2026-09-29 사용자
// 지시): "children_libraries_analysis_batch6.csv.. 주소랑 제목 비교해서..
// 노출중분류 '어린이도서관'에 적합한것들에 대하여 뱃지채워줘" —
// 2026-09-28-apply-children-library-csv-badges.mjs(batch1)와 동일한 방식:
// 이름만으로는 동명이인(같은 이름, 다른 실제 장소) 위험이 있어 CSV의 "지역"
// 열과 DB 주소의 시/도 일치까지 확인한 뒤 반영한다
// (scripts/_tmp-match-batch6.mjs로 사전 검증, 이 파일은 그 검증을 통과한
// 결과만 담는다).
//
// 결과: 59건 중 49건은 이름+지역이 명확히 일치(안전). 2건은 후보 판단:
// "서울특별시교육청어린이도서관" — 3개 후보 중 주소가 서로 정확히 일치하는
// f5759c7f/4ecb04fc 쌍(종로구 사직로9길 7)만 같은 실제 장소로 보고 반영,
// 주소가 다른 fc529917(사직로 89, 사직공원 인근)은 실제로 같은 기관인지
// 확인할 근거가 부족해 제외했다. "글마루한옥어린이도서관" — 후보 2개 중
// 원문 소개글로 이미 확인된 aac0f845만 반영(batch1과 동일한 판단, 이미
// 반영돼 있어 이번엔 멱등하게 재반영됨). 나머지 8건(지역 불일치 7건 +
// 판단 보류 1건인 인천 서구어린이도서관)은 추측으로 반영하지 않았다
// (제3장 제5조 추측 금지).
import { pathToFileURL } from 'url';
import { loadEnv } from '../lib/load-env.mjs';
import { createAdminClient } from '../ingest/lib/supabase-admin.mjs';

loadEnv();

export const BADGE_ASSIGNMENTS = {
  'e009e477-ca84-4ca3-90f4-ed9b785099f6': ['floor_seating', 'lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program'],
  '176fab5e-4239-495c-92c7-498e271c3e29': ['lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program'],
  'ad222401-09eb-4a6f-88cd-ee1ad8adbfa6': ['floor_seating', 'lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program'],
  '10955b5c-51d2-4f24-9331-84f04cdd7ad4': ['floor_seating', 'lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program'],
  'ec16462e-060e-42ac-8b4b-86ffa83e93b8': ['lib_infant_reading_room', 'lib_weekend_program', 'lib_english_picture_books'],
  'e1eb1280-6a75-489e-8ee5-50463f35f4d1': ['lib_infant_reading_room', 'lib_weekend_program', 'lib_english_picture_books'],
  'ad64b6ec-d3b2-4e17-a9f0-f902a8e38b05': ['lib_infant_reading_room', 'lib_weekend_program', 'lib_english_picture_books', 'lib_parking_convenient'],
  '0c00300c-8696-4177-930e-9f463782f365': ['lib_infant_reading_room', 'lib_weekend_program', 'lib_english_picture_books'],
  '6d59f3cd-0531-4c1b-96c8-1291b6b82bb7': ['floor_seating', 'lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program'],
  'beffb260-ec3e-4192-bd79-5b69260f5f21': ['floor_seating', 'lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program'],
  'a37f1246-a1fd-472f-a98b-05de16dcac6e': ['floor_seating', 'lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program'],
  '1baa4aa8-a943-46b7-9e82-0122b0e81d84': ['floor_seating', 'lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program'],
  '660bb082-2588-4ef4-9484-bcc2ed6d6675': ['lib_infant_reading_room', 'lib_weekend_program', 'lib_english_picture_books'],
  '0f275a8d-49a1-429f-906d-8f75716ad55b': ['floor_seating', 'lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program'],
  '64da6b10-eb91-493a-a0dd-63b675db14c2': ['floor_seating', 'lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program'],
  '6bcbfaab-895c-424e-ad38-5ff2ed713ebf': ['lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program'],
  '2187dd26-751f-4bc4-82bf-acfc64ab9c67': ['floor_seating', 'lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program'],
  '2d9f4d6a-30ab-42fe-aa5e-20ff096e81bb': ['floor_seating', 'lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program'],
  '9f98bf5d-189a-45ff-a712-92329cb63fd8': ['floor_seating', 'lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program'],
  '77554bc8-9215-445d-8f35-7d1b74b9f4fc': ['lib_infant_reading_room', 'lib_weekend_program', 'lib_english_picture_books'],
  'ee1b2622-4d94-4d94-b8fe-5ccea428c90d': ['floor_seating', 'lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program'],
  'b877d15d-5f58-465d-85a0-bc011f0f058c': ['lib_infant_reading_room', 'lib_weekend_program', 'lib_english_picture_books'],
  '4fccf574-e7eb-49a6-8ff2-8f5030a2bfdc': ['floor_seating', 'lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program'],
  'ec4e2ec7-9d22-4589-b68b-c3952995f5c8': ['floor_seating', 'lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program', 'lib_parking_convenient'],
  '706459a1-a9c2-44f3-b125-d0c1c3644baf': ['floor_seating', 'lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program'],
  '1683b199-6c8b-4751-858a-f059c531ac19': ['floor_seating', 'lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program', 'lib_parking_convenient'],
  'f38c05ad-2dda-4a7b-89fe-d13b6ed111ed': ['lib_infant_reading_room', 'lib_weekend_program', 'lib_parking_convenient'],
  '7f3786df-8149-431e-af80-2b33b86a8ed6': ['lib_comics_webtoon', 'lib_weekend_program'],
  'eb57ed93-f536-4ab8-ba72-dd3817fc83ef': ['lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program'],
  '43f338f9-0208-4d6b-bdd7-73372003d131': ['floor_seating', 'lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program'],
  '58ec856e-7e94-4fb0-b749-664b1207bdb9': ['floor_seating', 'lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program'],
  'ee821c03-042f-4b46-986e-19e408f5d644': ['floor_seating', 'lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program'],
  '216597d3-d1e8-4a3e-85d8-c8c74f0da30c': ['lib_infant_reading_room', 'lib_weekend_program', 'lib_english_picture_books'],
  'f2e8a953-90e8-4fae-86df-93c6f09b9da4': ['floor_seating', 'lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program', 'lib_parking_convenient'],
  'a78c5489-d2dc-442e-a194-b6e258963853': ['floor_seating', 'lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program'],
  'b19bf7b5-d612-4147-95bf-f33dfc86c0be': ['lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program'],
  'd7458fe3-aead-4964-83c2-e25440c5f4b8': ['lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program'],
  'ccb4f546-1ac5-4ae5-b06e-c9003e12a0ad': ['lib_infant_reading_room', 'lib_weekend_program', 'lib_english_picture_books'],
  'db91f8e2-300f-405e-949c-bd635dbbc81c': ['floor_seating', 'lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program'],
  '8861fca9-66c0-4da7-8fd4-4b2ac48270f7': ['floor_seating', 'lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program', 'lib_parking_convenient'],
  '756dcc05-dc44-4c01-9f61-936d1d52012e': ['floor_seating', 'lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program'],
  '57482147-840e-4f44-b59e-8daa029d9fdd': ['floor_seating', 'lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program', 'lib_parking_convenient'],
  '264f6e4b-9af9-43a3-9411-9fd654e78d7b': ['floor_seating', 'lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program'],
  'fd124ba3-e08e-4f9b-b055-015384157462': ['floor_seating', 'lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program'],
  'd8110b00-cd07-466d-916e-737579c2988e': ['floor_seating', 'lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program'],
  '36018288-e353-4ff9-a5db-a6b48fc7faf0': ['lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program'],
  '39d1fdcb-e003-405c-926e-44bab349e1cb': ['lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program'],
  '394cbe23-9ec1-4fb7-b511-27f6c01436ab': ['floor_seating', 'lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program', 'lib_parking_convenient'],
  'c159bccf-53bb-4071-979f-8e98766f25aa': ['lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program'],
  // 서울특별시교육청어린이도서관 — 주소가 정확히 일치하는 중복 대표 행 쌍만.
  'f5759c7f-31d2-4e63-81f6-bf2aa86edca7': ['floor_seating', 'lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program'],
  '4ecb04fc-dacb-4f90-9e73-0a1de4fe0a69': ['floor_seating', 'lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program'],
  // 글마루한옥어린이도서관 — batch1과 동일 판단(원문 소개글로 확인된 쪽만).
  'aac0f845-69b5-485a-9bf3-678fac724c5c': ['floor_seating', 'lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program'],
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
    console.log(`[APPLY_CSV_LIBRARY_BADGES_BATCH6] ${spotId}: ${JSON.stringify(currentBadges)} -> ${JSON.stringify(merged)}`);
  }

  console.log(`[APPLY_CSV_LIBRARY_BADGES_BATCH6] 완료 — ${updatedCount}개 스팟 갱신`);
  return { updatedCount };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  run()
    .then(({ updatedCount }) => {
      console.log(`▶▶▶ [APPLY_CSV_LIBRARY_BADGES_BATCH6] 종료: ${updatedCount}건 갱신`);
      process.exitCode = 0;
    })
    .catch((err) => {
      console.error(`❌ [APPLY_CSV_LIBRARY_BADGES_BATCH6] 실행 실패: ${err.message}`);
      process.exitCode = 1;
    });
}
