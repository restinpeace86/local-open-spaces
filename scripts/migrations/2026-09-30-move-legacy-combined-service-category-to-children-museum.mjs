// [구 통합 노출중분류 '어린이 과학관 / 박물관' → 어린이박물관 이관](2026-09-30
// 사용자 지시): "노출중분류 문화시설 > 어린이 과학관 / 박물관 여기에 몇 건이
// 매핑되었는지 확인해주고.. 이거 더이상 안쓰고 어린이 과학관과 어린이
// 박물관으로 나눈 노출중분류 쓸꺼라" → 실측 확인 결과 4건 전부 확인 후
// "12,3,4 표준중분류 '어린이박물관'으로 옮겨주고 노출중분류 매핑도 '어린이
// 박물관'으로 해줘"(4건 전체를 어린이박물관 쪽으로 이관하라는 지시).
//
// [실측 확인] 구 통합 노출중분류 '어린이 과학관 / 박물관'
// (bf9c5c83-01e4-41ea-9828-4415f4a926ab, service_categories.category_name
// 기준)에 매핑된 대표 행은 총 4건이었고, 전부 표준중분류가 여전히
// '종합/기타박물관' 또는 '기타'로 남아있어 이번 세션에서 진행한 어린이박물관
// 분리 이관(batch1~3)과는 무관하게 예전에 별도로 매핑된 것들이었다:
// G밸리산업박물관, 대전드림아레나, 서울우리소리박물관, 한성백제박물관.
// 이 4건 전부를 새 표준중분류 '어린이박물관'과 새 노출중분류 '어린이 박물관'
// (bc3b83df-b478-4620-9495-6499870bebdc)으로 이관한다 — 이제 구 통합
// 노출중분류는 이 4건 이관 후 매핑 0건이 되어 더 이상 쓰이지 않는다.
import { pathToFileURL } from 'url';
import { loadEnv } from '../lib/load-env.mjs';
import { createAdminClient } from '../ingest/lib/supabase-admin.mjs';

loadEnv();

const CHILDREN_MUSEUM_SERVICE_CATEGORY_ID = 'bc3b83df-b478-4620-9495-6499870bebdc'; // 어린이 박물관

export const TARGET_SPOT_IDS = [
  'f94a9b0a-5feb-478c-8f5c-bb3451977566', // G밸리산업박물관
  '68a5d0b2-d53e-4bcd-84ea-ab59f2c8e65f', // 대전드림아레나
  '57bb05a2-9b3e-4ebf-8444-7f20be0cfc1d', // 서울우리소리박물관
  '29179b83-eaea-4a04-bfee-047b93ca4e56', // 한성백제박물관
];

export async function run() {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('open_spaces')
    .update({
      category_min: '어린이박물관',
      category_min_source: 'MANUAL',
      service_category_id: CHILDREN_MUSEUM_SERVICE_CATEGORY_ID,
    })
    .in('id', TARGET_SPOT_IDS)
    .select('id');
  if (error) throw new Error(`open_spaces 갱신 실패: ${error.message}`);

  console.log(`[MOVE_LEGACY_COMBINED_SERVICE_CATEGORY_TO_CHILDREN_MUSEUM] 완료 — ${data.length}건 이관(대상 ${TARGET_SPOT_IDS.length}건 중)`);
  return { updatedCount: data.length, targetCount: TARGET_SPOT_IDS.length };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  run()
    .then(({ updatedCount, targetCount }) => {
      console.log(`▶▶▶ [MOVE_LEGACY_COMBINED_SERVICE_CATEGORY_TO_CHILDREN_MUSEUM] 종료: ${updatedCount}/${targetCount}건`);
      process.exitCode = 0;
    })
    .catch((err) => {
      console.error(`❌ [MOVE_LEGACY_COMBINED_SERVICE_CATEGORY_TO_CHILDREN_MUSEUM] 실행 실패: ${err.message}`);
      process.exitCode = 1;
    });
}
