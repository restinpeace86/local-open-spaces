// [어린이도서관 표준 뱃지 태깅](2026-09-28 사용자 지시, todo.md 개선사항1):
// "전국 전문 어린이도서관 170곳 분석해 7개 표준 뱃지 태깅.. 원문이나 팩트 기반으로
// 판단할 수 있는 것만 정확히 태깅" — category_min='어린이도서관' 156건 중
// 원문 소개글(raw_data.FAC_DESC)이 있는 건 seoul_public_culture 소스 20건뿐이다
// (나머지 136건은 소개 텍스트 자체가 없어 태깅 근거가 없다). 그 20건을 전부 직접
// 읽어(scripts/lib/load-env.mjs로 실제 raw_data.FAC_DESC 덤프 후 육안 확인) 아래
// 3개 뱃지(src/lib/admin/curation-badges.ts의 CHILDREN_LIBRARY_CONFIG 참고)만
// 명확한 원문 근거를 찾았다. 나머지 4개 기준(소곤소곤 대화 가능/주말 독서·체험
// 프로그램/만화·웹툰 특화/주차 편리)은 20건 전체에서 근거를 하나도 못 찾아
// 뱃지 자체를 만들지 않았다(주차 편리는 기존 parking과 개념 중복이라 별도 불필요).
//
// 이 스크립트는 spot_curations.curation_badges(string[] 배열 컬럼)에 근거가 확인된
// 뱃지 키만 추가한다 — 기존에 이미 들어있는 값(예: parking, kids_chair)은 지우지
// 않고 유지한다(사용자 지시: "매핑된게 1건이라도 있는 뱃지는 없애지 말고 그대로").
import { pathToFileURL } from 'url';
import { loadEnv } from '../lib/load-env.mjs';
import { createAdminClient } from '../ingest/lib/supabase-admin.mjs';

loadEnv();

// spot_id → 추가할 뱃지 키 목록. 판단 근거는 각 줄에 원문 인용으로 남긴다.
const BADGE_ASSIGNMENTS = [
  // floor_seating(신발벗는 온돌·마루방)
  { spotId: 'a9d785ab-3125-4214-b85c-595916739bcb', badge: 'floor_seating', name: '강서길꽃어린이도서관', evidence: '"2층 45석 +온돌 / 3층 55석 + 온돌"' },
  { spotId: '4407d20e-2e56-4752-a165-7e46a3ca5197', badge: 'floor_seating', name: '송파어린이도서관', evidence: '"친환경적인 디자인과 맨발로 돌아다녀도 좋은 편안한 독서공간을 제공"' },
  // lib_infant_reading_room(영유아 전용 자료실 분리)
  { spotId: '61165c85-6228-40f3-803d-37c683445697', badge: 'lib_infant_reading_room', name: '(서울시 무명칭 도서관)', evidence: '"유아자료실, 어린이자료실, 디지털자료실"(별도 자료실로 명시)' },
  { spotId: 'eb615a33-9057-440f-9df5-9b3f0156464c', badge: 'lib_infant_reading_room', name: '장안어린이도서관', evidence: '"1층 유아 열람실.. / 2층 아동 열람실.."(층 자체가 분리)' },
  // lib_english_picture_books(영어 그림책 전문) — 송파어린이도서관(4407d20e)의
  // 자매관인 송파어린이영어도서관(7a0eef92, 별도 스팟)만 해당한다(이름이 비슷해
  // 혼동하지 않도록 주의).
  { spotId: '15db764f-d6f7-402f-9347-c8b69aca9428', badge: 'lib_english_picture_books', name: '용두어린이영어도서관', evidence: '명칭 자체가 "어린이영어도서관"' },
  { spotId: '7a0eef92-9a6c-44ce-8595-635da8f0a450', badge: 'lib_english_picture_books', name: '송파어린이영어도서관', evidence: '"송파구의 \'영어특화전문도서관\'"' },
  { spotId: '856a9b20-bafa-41ab-a2a4-b82e4fe18818', badge: 'lib_english_picture_books', name: '용암 어린이 영어도서관', evidence: '"어린이 영어도서관의 특성을 살린 우수 장서개발로 양질의 영어 주제별 장서"' },
  { spotId: 'f1c31f37-df3d-4104-93fa-8f29a6749273', badge: 'lib_english_picture_books', name: '동작영어마루도서관', evidence: '"English Young Children Book / English Children Book" 별도 서가 명시' },
];

export async function run() {
  const admin = createAdminClient();
  const bySpot = new Map();
  for (const { spotId, badge } of BADGE_ASSIGNMENTS) {
    if (!bySpot.has(spotId)) bySpot.set(spotId, new Set());
    bySpot.get(spotId).add(badge);
  }

  let updatedCount = 0;
  for (const [spotId, badgesToAdd] of bySpot) {
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
    console.log(`[TAG_CHILDREN_LIBRARY] ${spotId}: ${JSON.stringify(currentBadges)} -> ${JSON.stringify(merged)}`);
  }

  console.log(`[TAG_CHILDREN_LIBRARY] 완료 — ${updatedCount}개 스팟 갱신`);
  return { updatedCount };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  run()
    .then(({ updatedCount }) => {
      console.log(`▶▶▶ [TAG_CHILDREN_LIBRARY] 종료: ${updatedCount}건 갱신`);
      process.exitCode = 0;
    })
    .catch((err) => {
      console.error(`❌ [TAG_CHILDREN_LIBRARY] 실행 실패: ${err.message}`);
      process.exitCode = 1;
    });
}
