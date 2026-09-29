// [순수 어린이과학관 표준 중분류 신규 생성 및 이관 + 노출중분류 매핑](2026-09-29
// 사용자 지시): "표준중분류 관련하여 문화시설 대분류쪽에 '어린이과학관'을
// 생성해줘. 그리고 현재 '과학관' 표준중분류에 있는것중에
// D:\workspace\local-open-spaces\과학관.csv 여기에 있는 과학관들은 표준중분류
// '어린이과학관'으로 데이터 옮겨줘. 그리고 노출중분류가 문화시설 > 어린이
// 과학관으로 매핑도 시켜주고" — 2026-09-28 어린이도서관 분리와 동일한 패턴.
//
// [실측 확인] 사용자가 준 과학관.csv(원래 내가 138건으로 내보낸 것과 달리,
// 사용자가 직접 62개 고유 시설로 재선별한 목록 — "OO어린이천문대" 프랜차이즈
// 제외뿐 아니라 실제로 어린이 과학관/자연사박물관으로 적합한 곳만 추가로 고른
// 것으로 보인다)을 category_min='과학관' 대표 행 156건과 이름+주소로 대조했다.
// 62개 중 54개는 단일 후보로 명확히 매칭됐고, 8개는 정확히 같은 주소를 공유하는
// 미병합 중복 후보가 있었다(예: "한국자연사박물관" 2건, "서대문자연사박물관" 3건,
// "지질박물관"/"한국지질자원연구원 지질박물관"은 같은 주소의 서로 다른 표기
// 2건). 전부 실제로 같은 물리적 장소로 보여(제3장 제5조 추측 금지 — 주소가
// 정확히 같은 것만 그렇게 판단, 다른 장소를 임의로 묶지 않음) 두 후보 모두
// 이관 대상에 포함했다(중복 자체의 병합은 이번 지시 범위 밖이라 손대지 않음).
// 고유 ID 기준 총 69건.
//
// [노출중분류] service_categories에 이미 '어린이 과학관'(34c758dd-e55c-4dea-
// bece-e5ab91f6138f)이 존재했다 — 기존 '어린이 과학관 / 박물관'(bf9c5c83-...)
// 과는 별개의 값이라 헷갈리지 않도록 정확한 id로 매핑한다.
import { pathToFileURL } from 'url';
import { loadEnv } from '../lib/load-env.mjs';
import { createAdminClient } from '../ingest/lib/supabase-admin.mjs';

loadEnv();

const CHILDREN_SCIENCE_MUSEUM_SERVICE_CATEGORY_ID = '34c758dd-e55c-4dea-bece-e5ab91f6138f'; // 어린이 과학관

export const TARGET_SPOT_IDS = [
  // 안전 매칭 54건
  '79bc186c-3fce-4e67-8490-c1604086c90f', 'a68c038b-908e-4f85-9bb2-d9f0e11d0979', 'c0239f16-9738-40f1-aab0-78edc8ced5a8',
  '8b0b2477-78f1-4342-8329-4eba8e6f0fa2', 'e7f82a4c-c11b-46b8-ae77-975521bd216f', '723e790c-4225-43c8-b1d5-299ce9053061',
  'e81f6fca-9975-496c-b118-137cdd27f369', '5503d9c9-9bff-43cc-a720-fd9ee336a240', '7cacaed7-5586-42b7-8018-4d0c63f7df94',
  'e20948af-4efe-46c6-8830-3499bf9d07e9', '63b227ee-12b0-42d3-b36e-1931b611b9b1', '5affaaf5-0e88-4922-954f-9f4f7a374db3',
  'c2ed8195-b32d-4d48-a2a2-fb7630acdc9b', '80a88af9-2ad8-4b59-984a-875442989ab6', 'dd9edfe9-b68a-4acc-8a40-9855060d0488',
  '943920d5-c87d-492b-a85a-54f17196fed0', '90793543-1179-4634-899d-b24e592091ff', '552af819-3317-45d5-b5e8-f3dc219d20d6',
  '0b6c72a9-b63d-41ec-8894-4fd29b7a6313', '2a7ba381-0d36-468d-aa93-07bc81cce2dc', 'b95cf634-7309-423b-9065-e3bda447eb24',
  'd7c4b1a4-76a0-47aa-8630-ec09306dcae9', '62359154-436e-4033-a853-39427a98bd92', 'f5d1f5ad-00e8-4f6a-a25e-76afc1c29674',
  '7af982d0-f32a-41f6-8624-5b8cf1c1c04c', 'a95bef29-f03f-4c64-a331-c0a6126c453a', '934ab0d2-d0fb-4591-b303-156ebc05e379',
  '11d1b5ff-8085-464e-9f5f-8400b0f72fe2', '2ad22571-cf7c-48ed-9de9-3bd80463d448', '6dc89975-6de4-480d-abb4-8f59af93fd51',
  '02c567b6-2350-443f-bca6-b2a9381818d2', '0128e1f0-d029-4627-98bb-ba00c1acdece', '564d092a-d0bd-4939-af0c-1d6cad66dc99',
  '32143811-38eb-40e3-819f-0f4bff70e63f', '975c41f1-21e1-490a-b0a3-b97835f609e3', '176a69d8-2f01-416b-85bf-9c35b6419217',
  'bee3304e-978f-4f56-aa29-34aec3cd378f', '53a2676d-36e6-4e9b-935a-3cd699616a98', 'cefd54fb-6009-48b4-8631-b0bbc6aa739a',
  '08587e60-86b7-411d-a3bb-59d7b38e219f', 'cbb3f152-7f62-4bbc-95eb-58d63834ff52', '0bab294b-b474-4d7b-ac06-b14ec6367b7a',
  '87140a27-a1cf-4615-9239-ec8ee6d65616', 'a035f6de-8652-4663-b64f-118bfb9c82ad', '95639f13-ef40-4303-975d-e694b7c0d04b',
  'a50378b9-b121-4e84-bf01-9875674bc7f8', '6a1cc4ac-848e-473a-8ae5-c116829c1d8b', '4cbe290a-b788-4c1f-982a-dac381370619',
  '58c6cca5-94cd-4f90-a162-0fc33c9fd394', '4b5c2bf7-6e10-4b02-859c-c9dc99851a9c', 'ffc69906-266b-41e7-a1a7-57cdf70b677d',
  '9de79696-0a6d-4b35-9767-ae3890e70ed2', 'd2c9e16d-c456-45a4-94e0-1ba610d5c46c', 'b52c5730-a8ef-4ae6-8048-9a0dbd83c461',
  // 모호(주소 완전일치 미병합 중복) — 둘 다 포함 15건
  '16df1d9a-5867-4cb2-b3f9-f988687b1854', 'adb8a92a-af4f-404f-8205-f97b91f8d5be', // 한국자연사박물관
  '0f266b3a-d345-4f11-a5e0-9d168b544024', '40e87dff-8b59-496a-bcb2-04c75d131a3b', 'b20cd182-d351-49da-8433-54cbb728280d', // 서대문자연사박물관
  'ddc71ea3-0846-4cce-aca1-1f3e4dd2bdae', '02152986-4712-4ca8-b52e-64567a399e8b', // 지질박물관/한국지질자원연구원 지질박물관
  '2069973b-04df-46cc-a983-3a06edbd9eae', '850c6f4c-c8ee-4234-8c99-b233388ea50a', // 강화자연사박물관
  '1eb6e8c0-a255-45c6-ba85-ad0bdfe2e281', '23586f39-f933-482f-875e-33b6b010c504', // 덕소자연사박물관
  '0b818eda-6830-46e1-9881-4dae3b82b466', 'b78588f8-ca60-494e-a142-3a774421f1dc', // 구미과학관
  '455a3e68-59e6-4bec-a0c7-205947c272ca', '131c24f1-3e44-43cc-a302-f114aea15a07', // 반디랜드 천문과학관
];

export async function run() {
  const admin = createAdminClient();

  // 표준 중분류 등록(category_rules)은 별도 SQL
  // (2026-09-29-add-children-science-museum-category-rule.sql)로 먼저 적용한다 —
  // apply-sql.mjs를 통해 실행하는 기존 관례를 그대로 따른다(제5장 제4조).
  // 대상 스팟 이관 + 노출중분류 매핑.
  const { data, error } = await admin
    .from('open_spaces')
    .update({
      category_min: '어린이과학관',
      category_min_source: 'MANUAL',
      service_category_id: CHILDREN_SCIENCE_MUSEUM_SERVICE_CATEGORY_ID,
    })
    .in('id', TARGET_SPOT_IDS)
    .select('id');
  if (error) throw new Error(`open_spaces 갱신 실패: ${error.message}`);

  console.log(`[SPLIT_CHILDREN_SCIENCE_MUSEUM] 완료 — ${data.length}건 이관(대상 ${TARGET_SPOT_IDS.length}건 중)`);
  return { updatedCount: data.length, targetCount: TARGET_SPOT_IDS.length };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  run()
    .then(({ updatedCount, targetCount }) => {
      console.log(`▶▶▶ [SPLIT_CHILDREN_SCIENCE_MUSEUM] 종료: ${updatedCount}/${targetCount}건`);
      process.exitCode = 0;
    })
    .catch((err) => {
      console.error(`❌ [SPLIT_CHILDREN_SCIENCE_MUSEUM] 실행 실패: ${err.message}`);
      process.exitCode = 1;
    });
}
