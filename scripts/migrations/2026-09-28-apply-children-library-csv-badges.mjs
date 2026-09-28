// [사용자 제공 CSV 기반 어린이도서관 뱃지 일괄 반영](2026-09-28 사용자 지시):
// "children_libraries_analysis.csv 여기에 도서관 관련 뱃지 부여한것들 있어 C열..
// 도서관 명칭과 지역으로 '어린이도서관'중분류에 있는 데이터중 어떤 데이터인지
// 확인하고 부여된 뱃지에 대하여 체크해서 db에 저장해" — 사용자가 직접 분석한
// 66개 도서관×뱃지 매핑을 제공했다. 이름만으로는 동명이인(같은 이름, 다른 실제
// 장소) 위험이 있어(예: "화전어린이도서관"이 경기 고양시 것과 전혀 다른
// 경남 남해군 소재 동명 시설로 DB에 있음 — 사용자가 이전에 "화정하고 화전은
// 주소부터 다르다"고 직접 확인해준 사례), 이름 매칭 후 반드시 CSV의 "지역"
// 열과 DB 주소의 시/도가 일치하는지까지 확인했다(scripts/_tmp-match-lib-badges2.mjs로
// 사전 검증, 이 파일은 그 검증을 통과한 결과만 담는다).
//
// 결과: 66건 중 52건은 이름+지역이 명확히 일치(안전), 4건은 같은 실제 장소를
// 가리키는 미병합 중복 대표 행이 2개씩 있어(예: 국립어린이청소년도서관 —
// 5fbaa562/37419c19 둘 다 같은 주소의 대표 행으로 남아있음, 별도 중복 검수
// 필요 — 이번 작업 범위 밖) 둘 다에 반영(같은 실제 장소라 둘 다 반영해도
// 안전), 1건(글마루한옥어린이도서관)은 후보 2개 중 실제 원문 소개글로 이미
// 확인된 쪽(aac0f845, "우리구 개봉동에 조성한 '구로구립 글마루 한옥어린이도서관'")
// 하나만 반영했다. 나머지 9건(지역 불일치 8건 + 카테고리 불일치 1건)은 추측으로
// 반영하지 않고 별도 보고한다(제3장 제5조 추측 금지).
import { pathToFileURL } from 'url';
import { loadEnv } from '../lib/load-env.mjs';
import { createAdminClient } from '../ingest/lib/supabase-admin.mjs';

loadEnv();

// { spotId: string[] } — 이미 검증된(안전 매칭 52건 + 중복쌍 4건×2 + 글마루 1건) 반영 대상.
export const BADGE_ASSIGNMENTS = {
  '68406997-3397-4ca5-8de6-954a4607c6d5': ['floor_seating', 'lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program'],
  'a9d785ab-3125-4214-b85c-595916739bcb': ['lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program'],
  '4407d20e-2e56-4752-a165-7e46a3ca5197': ['floor_seating', 'lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program'],
  'ca3acbfc-f8c2-4dee-9d8e-7d5043416dc3': ['lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program'],
  'b17599fb-79be-4c39-bf0e-c07f92e391ab': ['lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program'],
  '7a0eef92-9a6c-44ce-8595-635da8f0a450': ['lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program', 'lib_english_picture_books'],
  '856a9b20-bafa-41ab-a2a4-b82e4fe18818': ['lib_infant_reading_room', 'lib_weekend_program', 'lib_english_picture_books'],
  '3527e276-b536-46f7-a1f4-babc3ac50a6a': ['lib_infant_reading_room', 'lib_weekend_program'],
  'eb615a33-9057-440f-9df5-9b3f0156464c': ['lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program'],
  '15db764f-d6f7-402f-9347-c8b69aca9428': ['lib_infant_reading_room', 'lib_weekend_program', 'lib_english_picture_books'],
  'f1c31f37-df3d-4104-93fa-8f29a6749273': ['lib_infant_reading_room', 'lib_weekend_program', 'lib_english_picture_books'],
  '62a665ef-4dad-4b8f-a40b-be4adb9f5929': ['lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program'],
  'f6543b4c-7633-4a9d-b334-2048cd2f5085': ['lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program'],
  'b5dc2061-a6a9-437b-aced-4c9e9479a09a': ['floor_seating', 'lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program', 'lib_parking_convenient'],
  'f1d8486d-b0d0-4461-a6c9-f41d62d88e09': ['floor_seating', 'lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program'],
  '25683386-88f3-4b39-87ea-339920ef6bc1': ['floor_seating', 'lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program'],
  'dab9faf4-09cf-4e0c-9aed-6f795986376a': ['lib_infant_reading_room', 'lib_weekend_program', 'lib_english_picture_books'],
  'a2b064ea-5107-4742-9943-70b7bc473e29': ['floor_seating', 'lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program'],
  'ce389be2-0273-4b7f-8c8d-4a6279ec9c75': ['lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program'],
  '96aa8a8a-7c81-4a4d-9e34-5d2108c93ffd': ['floor_seating', 'lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program'],
  'c33fcde7-a6de-4d76-9581-9051b84cc177': ['lib_comics_webtoon', 'lib_weekend_program'],
  '7630fbd2-d1ce-47e9-b9fd-7f62e3055553': ['floor_seating', 'lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program'],
  'cb3b6e23-84b2-4058-b1f4-a560d286854c': ['lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program'],
  '61bd0082-0d6c-4cf5-ace0-efe63141c142': ['lib_infant_reading_room', 'lib_weekend_program', 'lib_english_picture_books'],
  'f53c2890-51ad-45e0-89ff-c48e88e7b732': ['floor_seating', 'lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program'],
  'e04c35c3-3de7-4ecb-87db-140a58e2d31c': ['lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program'],
  '10fc1acc-9242-4ad3-ae83-abc3ca247619': ['lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program', 'lib_parking_convenient'],
  '0d81dffa-9132-472f-9648-3b2e92680835': ['lib_infant_reading_room', 'lib_weekend_program', 'lib_english_picture_books'],
  'aecab449-75b3-4ff0-a3f2-0efa0db31a77': ['lib_infant_reading_room', 'lib_weekend_program', 'lib_english_picture_books'],
  'a188cf4f-bf3d-465d-81a1-d96787e37061': ['floor_seating', 'lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program'],
  '1b992afa-2960-4db4-9fa8-b69664d088e4': ['floor_seating', 'lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program'],
  '04329ca7-7948-4117-893e-cd942a4b4fd0': ['lib_weekend_program', 'lib_parking_convenient'],
  '5ecefcde-d309-4193-b43b-d3bffcea8465': ['floor_seating', 'lib_weekend_program', 'lib_parking_convenient'],
  '80d162fa-c7cf-484d-90d9-4ecf966d9ebe': ['floor_seating', 'lib_infant_reading_room', 'lib_weekend_program'],
  '601f99af-e0db-4cb2-9db5-b7ed1ae2bb6f': ['lib_weekend_program', 'lib_parking_convenient'],
  '52f46f8c-5873-4c9a-af7e-992745e8dceb': ['floor_seating', 'lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program'],
  'bc4e1aae-0612-429e-b94e-b6e90045321b': ['lib_infant_reading_room', 'lib_weekend_program', 'lib_parking_convenient'],
  'b39a2e7e-a747-4970-8506-5ea9e41c6e7b': ['lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program'],
  '17089701-5bb2-47b5-becc-f5a7282f113d': ['lib_infant_reading_room', 'lib_weekend_program', 'lib_parking_convenient'],
  '344bb70c-5884-4afc-a513-a61192ee4352': ['lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program'],
  '96a2c5ad-5d51-47e2-a030-dbe404ce64a8': ['floor_seating', 'lib_quiet_talk_allowed', 'lib_weekend_program'],
  '41f22930-9dea-4157-927c-e45554f20050': ['lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program'],
  '2cbd1941-d6dc-41aa-ad78-ceb6cae0b8e3': ['floor_seating', 'lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program', 'lib_parking_convenient'],
  '243d3d6d-4a0d-4aea-aeb4-1b71869a9ac6': ['floor_seating', 'lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program'],
  '96450a99-356c-4723-b7c9-9d66c4e18a7a': ['lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program'],
  '4d3f163d-c717-4608-87c4-8845a71c6319': ['lib_infant_reading_room', 'lib_weekend_program', 'lib_parking_convenient'],
  '5056f9cc-4bf2-4590-8ffa-dbd8ed51e2e8': ['lib_comics_webtoon', 'lib_weekend_program', 'lib_parking_convenient'],
  '40a79245-9f86-4cc8-ab41-4a8862a25980': ['floor_seating', 'lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program'],
  '15fb8884-40e9-43b8-8a60-e6ea4c53d31f': ['floor_seating', 'lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program'],
  'fd1c7566-f680-4ed8-b31d-ca35869bc983': ['floor_seating', 'lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program'],
  'fe2cbd6f-ecab-47d4-9e73-b45951496f05': ['floor_seating', 'lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program'],
  '5e2d2411-3690-4935-8b49-3fff5cbf0900': ['floor_seating', 'lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program'],
  // 미병합 중복 대표 행 쌍(같은 실제 장소, 별도 중복 검수 필요 — 이번 범위 밖) — 둘 다 반영.
  '3c9d96fb-e734-4c40-84fa-c3feb04d8949': ['lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program'],
  '61165c85-6228-40f3-803d-37c683445697': ['lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program'],
  '5fbaa562-4b70-4d73-ae54-dd0d0c48308f': ['lib_infant_reading_room', 'lib_weekend_program', 'lib_parking_convenient'],
  '37419c19-a1a2-4d37-9630-1d61e1bd936f': ['lib_infant_reading_room', 'lib_weekend_program', 'lib_parking_convenient'],
  'c2c5713b-ca9a-4455-bf4a-a734dfc3744f': ['floor_seating', 'lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program'],
  '2f809b26-8d22-4015-b781-198c8a3fa76a': ['floor_seating', 'lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program'],
  '2f25c622-d2a9-4f06-9502-76564825388a': ['floor_seating', 'lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program'],
  '08efc12d-d3ef-46d1-92be-cc2cc2531a03': ['floor_seating', 'lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program'],
  // 글마루한옥어린이도서관 — 후보 2개 중 원문 소개글로 확인된 쪽만.
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
    console.log(`[APPLY_CSV_LIBRARY_BADGES] ${spotId}: ${JSON.stringify(currentBadges)} -> ${JSON.stringify(merged)}`);
  }

  console.log(`[APPLY_CSV_LIBRARY_BADGES] 완료 — ${updatedCount}개 스팟 갱신`);
  return { updatedCount };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  run()
    .then(({ updatedCount }) => {
      console.log(`▶▶▶ [APPLY_CSV_LIBRARY_BADGES] 종료: ${updatedCount}건 갱신`);
      process.exitCode = 0;
    })
    .catch((err) => {
      console.error(`❌ [APPLY_CSV_LIBRARY_BADGES] 실행 실패: ${err.message}`);
      process.exitCode = 1;
    });
}
