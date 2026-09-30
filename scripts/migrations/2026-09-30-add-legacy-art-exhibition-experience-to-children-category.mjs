// [구 노출중분류 '미술관 / 전시체험관' 잔여 7건 정리 — 1차: 3건 이관]
// (2026-09-30 사용자 지시): 사용자에게 구 통합 노출중분류 '미술관 / 전시체험관'
// (7fa6dc35-4d7a-483b-bcad-9a35dd04f3cc)에 매핑된 7건의 명칭을 보고한 뒤
// "3,4,5,6,7 일단 5,6,7은 어린이전시미술관으로 이관하자 노출중분류도
// 어린이전시/미술관으로 변경하고.. 3, 4는 어떻게 하는게 좋을지 먼저
// 제안해봐" — 5/6/7 3건만 이번에 이관하고, 3/4는 별도 제안 후 처리한다.
//
// 대상 3건: 순환도시 친환경세상 순환자원홍보관(전시실), 판교환경생태학습원
// (전시실), 한국전통문화전당(기타) — 새 표준중분류 '어린이전시미술관' +
// 노출중분류 '어린이 전시/미술관'(2901e5e0-55d5-4799-b18f-6ebe886e40ec)로
// 이관.
import { pathToFileURL } from 'url';
import { loadEnv } from '../lib/load-env.mjs';
import { createAdminClient } from '../ingest/lib/supabase-admin.mjs';

loadEnv();

const CHILDREN_EXHIBITION_ART_MUSEUM_SERVICE_CATEGORY_ID = '2901e5e0-55d5-4799-b18f-6ebe886e40ec'; // 어린이 전시/미술관

export const TARGET_SPOT_IDS = [
  'dc6aed8e-0e82-4c5e-95a6-91ad8e841f24', // 순환도시 친환경세상 순환자원홍보관
  '9bbadb89-5363-4400-a2a4-17ee7059d335', // 판교환경생태학습원
  '015a094c-209e-49d2-8c0e-1dfae6d41231', // 한국전통문화전당
];

export async function run() {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('open_spaces')
    .update({
      category_min: '어린이전시미술관',
      category_min_source: 'MANUAL',
      service_category_id: CHILDREN_EXHIBITION_ART_MUSEUM_SERVICE_CATEGORY_ID,
    })
    .in('id', TARGET_SPOT_IDS)
    .select('id');
  if (error) throw new Error(`open_spaces 갱신 실패: ${error.message}`);

  console.log(`[ADD_LEGACY_ART_EXHIBITION_TO_CHILDREN_CATEGORY] 완료 — ${data.length}건 이관(대상 ${TARGET_SPOT_IDS.length}건 중)`);
  return { updatedCount: data.length, targetCount: TARGET_SPOT_IDS.length };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  run()
    .then(({ updatedCount, targetCount }) => {
      console.log(`▶▶▶ [ADD_LEGACY_ART_EXHIBITION_TO_CHILDREN_CATEGORY] 종료: ${updatedCount}/${targetCount}건`);
      process.exitCode = 0;
    })
    .catch((err) => {
      console.error(`❌ [ADD_LEGACY_ART_EXHIBITION_TO_CHILDREN_CATEGORY] 실행 실패: ${err.message}`);
      process.exitCode = 1;
    });
}
