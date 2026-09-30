// [종합/기타박물관 → 어린이놀이터 표준중분류 이관](2026-09-30 사용자 지시):
// "박물관_기타.csv 여기있는건 박물관이 아닌거 같아 일단 키즈/놀이시설>>
// 어린이놀이터 표준 중분류로 이관해줘"
//
// [실측 확인] `박물관_기타.csv`(CP949, UTF-8 변환 후 확인, 25개 행)를 DB에서
// 이름 완전일치로 조회한 결과 25건 전부 단일 후보로 명확히 매칭됐다(모호
// 그룹 없음). 전부 현재 category_min='종합/기타박물관'이며, 지역 공원/
// 체험장/테마파크 등에 부속된 놀이시설(예: "한탄강 지질공원 실외놀이시설",
// "유교랜드 2층 소망나무놀이터", "원더파크 볼풀게임")로 박물관이 아니라
// '키즈/놀이시설' 대분류의 '어린이놀이터' 표준중분류(이미 존재하는 기존
// 표준중분류, 신규 생성 아님 — src/lib/admin/category-min-groups.ts 등
// 분류체계 파일 변경 불필요)에 해당한다.
//
// [노출중분류] 이번 지시에는 노출중분류(service_category_id) 매핑 요청이
// 없어 표준중분류만 변경하고 노출중분류는 그대로 둔다(제3장 제5조 추측
// 금지 — 지시에 없는 필드는 임의로 바꾸지 않음).
import { pathToFileURL } from 'url';
import { loadEnv } from '../lib/load-env.mjs';
import { createAdminClient } from '../ingest/lib/supabase-admin.mjs';

loadEnv();

export const TARGET_SPOT_IDS = [
  '5cbefc45-0a97-4e39-a170-4dad62cd790a', 'e50874d2-7873-4c2d-a8b2-80579d891f9f', 'f0091bd2-d1dd-45a8-8d6a-bf8f896bed73',
  '0e4fad93-02e9-482f-9a63-d67edb04e0f8', '0c25029b-b52d-4cdb-9c9c-3c37f892229c', '6e4cc651-34e8-49b4-a52a-9f101aedc6c2',
  'cf1f9552-6d88-4e5d-b255-a74c2aa58f94', '7149a9a7-cbc7-41a8-ae30-e6edf0346dc9', '8d4b241c-02fd-4b9e-9e2b-dfc39105e4f5',
  'a777ec6e-efbf-4f9b-80cf-81b13e9dc137', 'e033722e-a2d2-4d01-a230-cc8a9a4fafcb', 'ad487242-551f-46d9-9f8c-365f62182c15',
  '9dacb683-3a62-4155-94f1-de148fa37bd9', 'bf6514e2-025b-4dc7-81dc-f588cb5a81b7', 'ae118854-5d99-4f7b-9e3e-b2091d8b6e5f',
  '87ab12e6-1908-49ab-9b1e-16b13e5cb9a9', 'b8e235ac-48f1-4220-ad52-29786832e185', 'dfd060bc-56c2-4eb8-af77-e79c0d55c37f',
  '3e75d890-1644-411d-ba21-cad5a04cb0be', '4ebf3860-288e-4319-b2ef-ca207291109a', '82e6a872-4888-4efb-b6b2-5349fd7f4838',
  'a377273a-7b46-4c1a-96f7-fdbaadf24505', '33c5ef9f-3b12-437b-8358-cd87be8cf012', '38d0eb9d-5e51-44ea-84ea-24d472e4a602',
  'b16d0fbf-d9f9-464c-b88a-447ad80590b9',
];

export async function run() {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('open_spaces')
    .update({
      category_min: '어린이놀이터',
      category_min_source: 'MANUAL',
    })
    .in('id', TARGET_SPOT_IDS)
    .select('id');
  if (error) throw new Error(`open_spaces 갱신 실패: ${error.message}`);

  console.log(`[MOVE_MUSEUM_ETC_TO_CHILDREN_PLAYGROUND] 완료 — ${data.length}건 이관(대상 ${TARGET_SPOT_IDS.length}건 중)`);
  return { updatedCount: data.length, targetCount: TARGET_SPOT_IDS.length };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  run()
    .then(({ updatedCount, targetCount }) => {
      console.log(`▶▶▶ [MOVE_MUSEUM_ETC_TO_CHILDREN_PLAYGROUND] 종료: ${updatedCount}/${targetCount}건`);
      process.exitCode = 0;
    })
    .catch((err) => {
      console.error(`❌ [MOVE_MUSEUM_ETC_TO_CHILDREN_PLAYGROUND] 실행 실패: ${err.message}`);
      process.exitCode = 1;
    });
}
