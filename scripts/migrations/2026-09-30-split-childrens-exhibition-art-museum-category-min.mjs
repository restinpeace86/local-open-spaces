// [순수 어린이전시미술관 표준 중분류 분리](2026-09-30 사용자 지시): "D:\workspace
// \local-open-spaces\전시_미술관.csv 해당 파일은 문화시설 > 전시실 (표준중분류)
// 및 문화시설 > 미술관 (표준중분류)에 있는 데이터중 키즈친화적인 스팟만
// 추린거야. 이에 대하여 표준 중분류를 '어린이전시미술관' 하나 만들고 여기로
// 다 이관해줘. 그리고 노출중분류는 '어린이 전시/미술관' 으로 매핑해줘"
//
// [실측 확인] `전시_미술관.csv`(CP949, UTF-8 변환 후 확인, 83개 행)를
// category_min IN ('전시실','미술관') 대표 행 1,048건과 이름+주소로
// 대조했다. 63개는 단일 후보로 명확히 매칭됐다. 20개는 같은 주소에 후보가
// 여러 개였다 — 어린이과학관/어린이박물관 분리와 동일한 원칙으로 두 경우를
// 구분했다(제3장 제5조 추측 금지):
//   (a) 표기 차이만 있는 진짜 중복(같은 이름, 주소 형식만 다르거나 완전
//       동일한 중복 입력) → 전부 포함(예: "K현대미술관", "양평군립미술관",
//       "돌하르방미술관", "임립미술관", "한향림도자미술관", "우양미술관",
//       "진주익룡발자국전시관", "소다미술관"(주소 공백 유무)).
//   (b) 의미 있게 다른 별개의 시설/기관 → CSV가 실제로 적어낸 그 이름과
//       정확히 일치하는 후보만 포함. "북서울꿈의숲 상상톡톡미술관"과
//       "북서울꿈의숲아트센터 드림갤러리"는 같은 부지의 서로 다른 두
//       시설이고 CSV에 각각 별도 행으로 있어 둘 다 포함(각자 정확한 이름으로
//       매칭). "유리섬미술관"(CSV) vs "맥아트미술관"(후보, CSV에 없음)은
//       유리섬미술관만 포함. "또봇정크아트뮤지엄"(CSV) vs "경주솔거미술관"
//       (후보, CSV에 없음)은 또봇정크아트뮤지엄만 포함. "조선해양문화관
//       (어촌민손전시관+조선해양전시관 전시실)"(CSV, 동일 이름 중복 2건)과
//       "거제어촌민속전시관"(후보 2건, CSV에 없는 다른 이름)은 전자 2건만
//       포함.
// 최종 고유 ID 기준 총 85건(안전 매칭 63건 + 검토 후 포함한 모호 후보 22건).
//
// [노출중분류] 기존 서비스 카테고리 '어린이 전시/미술관'
// (2901e5e0-55d5-4799-b18f-6ebe886e40ec, 신규 생성 아님 — 이미 존재하는
// service_categories 행으로 직접 확인)로 매핑.
import { pathToFileURL } from 'url';
import { loadEnv } from '../lib/load-env.mjs';
import { createAdminClient } from '../ingest/lib/supabase-admin.mjs';

loadEnv();

const CHILDREN_EXHIBITION_ART_MUSEUM_SERVICE_CATEGORY_ID = '2901e5e0-55d5-4799-b18f-6ebe886e40ec'; // 어린이 전시/미술관

export const TARGET_SPOT_IDS = [
  '44c96383-46e5-4e76-b878-3267a7bf292d', '868d527f-9a22-422b-9cef-1a76b3895e82', '3d6a975e-ab06-46a4-8d5f-049ad7d74ec3',
  '17c31f95-edce-4503-b553-9866a649130c', '9d11ab4b-58d2-40ab-9b69-b148351cf5ee', '46b3b80f-fde2-4ea9-be99-afcf1000c031',
  '07794ecd-d25c-4024-8423-999d69761936', '4932da17-484f-4779-800c-4a7a748912b1', '18923fba-5079-418c-9eba-e2e240d2d146',
  'e8b7a912-a09f-476c-8f86-3e8868d5fa6a', '4d1317ed-af03-4579-ae77-980f2faa135a', 'dd16005d-f497-4ea0-bbc5-b19d394669f8',
  '7bea6260-a462-4d26-b864-b4532eefc2e5', 'a91a23c4-d799-4641-ae27-39f23f835b16', '7ba36a57-4ffe-4121-af38-6064992927a5',
  '3b9dcf73-db41-4825-bbf2-6d8b665337ae', 'f0083509-1ebe-4f11-8cb9-29c6e7da83bc', '4f081aea-02db-42b3-9185-2837503adf87',
  'c8f81a38-01d6-4a59-a5e2-1ce1022affb5', 'b5b93279-1e93-45d2-962d-249151d686bc', '7109f852-b005-47f3-8de9-7b2256a1262b',
  'babf44ea-9208-409d-832f-d483497d399e', '3d05ded1-7cc2-4870-9dfd-32e81c036dab', '44781321-142f-4763-9113-e2b6d8fb3e97',
  '53409270-0e67-4ab0-bd6b-f6fe0fc3008f', '895d9521-65e2-4d4c-893f-c6b8a2c9ca3c', '83b68299-7fc9-4a6c-806a-e76cc0b48288',
  '770e334c-5745-4f7b-922b-52d2911379b6', 'c12278ce-9e2a-43c0-b177-f09e81aedbe5', '9fa230bf-176f-419f-b918-1ea9a1e256eb',
  'ba7ff40f-bd6c-4958-9133-34c4316e6699', 'd0ca1a0e-c362-446a-a2c9-e2341b58d040', 'b65ca74d-f432-4b3d-9ce0-494400b362c2',
  'a16d3b63-d0a1-447b-a9cb-65d925b11b54', '2c2074c3-384e-4a53-9878-38817b9904e4', '8dd0db7d-16a0-4ee8-b388-ecbf614cd633',
  'df5ad5b6-8a9b-4132-a8ef-5952fb3e04bb', 'e72386ef-0250-4ae3-b99c-6fe77d816904', '9bbadb89-5363-4400-a2a4-17ee7059d335',
  'b495e947-0d1a-4bbb-baed-b673dcfbbaa7', '14be97f2-b791-4866-bb22-b8f3b3aa76fe', '184d4477-675a-421d-a57f-025dab087ce2',
  'ae19b878-115a-4dea-b737-4213a5f81c49', 'f760dd0b-1839-4dc1-ba5a-3423538ef1ff', '00a8c670-1864-448a-8a6c-537603a3cf5b',
  '1b0a8b06-8150-4cae-9e26-337f0bea6d21', '1a163287-4670-436b-8683-45aa2306ad75', 'e73f549b-4bf8-46b9-84b3-c758776724fb',
  '9456a1f5-6bb5-408e-9772-14984bb0c52b', '549b6bab-2f1c-46dd-8a10-dc9b59fc6eab', '6b8e9f39-2bf2-47ba-9aff-cbb9c506e69a',
  '57d98b16-2c12-439b-8376-0a0ef3a55a30', '9fd63b36-68d5-4561-bb01-56de6f9a619c', 'b71b42b2-5399-4177-b5b3-60528b49637f',
  'bd669b72-2473-4d0b-ae2d-48a9a1864700', '7a6c09db-ec00-476c-ab2a-8850ac53f79d', 'e90b8a6f-edbd-443e-aff0-edb04a93a5fc',
  'e4bd1209-3ac5-4a8a-8767-f8d5d2923636', 'eca1f518-d9ed-4123-9041-1422cdc95996', '73c52fd5-01ca-4b5a-8918-c2248585e53c',
  '7fadf315-74f8-426a-a6d4-9f359407326a', 'be69a912-212a-483f-9b1d-514332172741', 'f1691392-5fdb-4ae9-af29-72247a21085c',
  '66987fdc-4d84-49db-8fb4-4a874cb4456c', '17319c30-1391-42e1-8b28-964f0e7b2510', '551f6cfc-d12d-4fbe-a06c-9fdd5496cabb',
  '68fdaae3-4785-4830-b056-6d4a76db445d', 'c7ba8405-9ea8-4cdb-aeb6-b6fbe2ab06fc', '9813077b-f6d5-474a-ad3f-2e8c430916cc',
  '67353371-d039-48e9-aed0-e162f7ad1bf2', '43678bf8-657b-4fb9-bda6-3ccb5e693176', '1ede9a21-e899-4273-8e27-ec39b09cffc9',
  '697af239-b643-4983-9939-ffe64654b052', 'bc4e1971-ef5c-4965-8875-3a10585c0827', '5c268a7f-4a12-4c57-a388-082517e9175c',
  '6bf8f6aa-83a5-44df-83c9-bdd30c1cdeb0', '4d3ed3c9-2ee1-41a6-814c-7cc0d5cf5fd3', '7eb4caca-c3e1-447b-b326-d6c25f75715d',
  '1e3a0d9f-0561-4bdd-87b9-49b34ec7458e', '43cfdb0b-9747-4649-a0d3-5d4b949de48c', '0558d2ab-0da5-4792-aa44-411e764632fd',
  'd864af6b-939a-4ec0-b848-94481190c859', '0af9e9d6-c62e-458b-b258-dc950f01623a', '5919d285-8646-4421-bca9-ae2e4f4b4614',
  '62dd9b8f-1a3d-437d-9817-27af723c7de4',
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

  console.log(`[SPLIT_CHILDRENS_EXHIBITION_ART_MUSEUM] 완료 — ${data.length}건 이관(대상 ${TARGET_SPOT_IDS.length}건 중)`);
  return { updatedCount: data.length, targetCount: TARGET_SPOT_IDS.length };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  run()
    .then(({ updatedCount, targetCount }) => {
      console.log(`▶▶▶ [SPLIT_CHILDRENS_EXHIBITION_ART_MUSEUM] 종료: ${updatedCount}/${targetCount}건`);
      process.exitCode = 0;
    })
    .catch((err) => {
      console.error(`❌ [SPLIT_CHILDRENS_EXHIBITION_ART_MUSEUM] 실행 실패: ${err.message}`);
      process.exitCode = 1;
    });
}
