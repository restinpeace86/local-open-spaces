// [종합/기타박물관 → 어린이박물관 추가 이관 + 노출중분류 매핑](2026-09-30
// 사용자 지시): "'종합/기타박물관' 표준중분류의 데이터들에 대하여 하기파일의
// 데이터들을 '어린이박물관'으로 이관시켜줘(97건). 그리고 노출중분류는 '어린이
// 박물관'으로 매핑시켜주고. 박물관1.csv" — 2026-09-30 역사박물관 분리와 동일한
// 패턴, 대상 표준중분류만 '종합/기타박물관'으로 다르다.
//
// [실측 확인] `박물관1.csv`(CP949 인코딩, UTF-8 변환 후 확인, 97개 행)를
// category_min='종합/기타박물관' 대표 행 1,388건과 이름+주소로 대조했다.
// 63개는 단일 후보로 명확히 매칭됐고, 33개는 같은 주소를 공유하는 후보가
// 여러 개였다 — 이번엔 전부 "미병합 중복"으로 단정하지 않고 두 가지 경우를
// 구분했다(제3장 제5조 추측 금지):
//   (a) 이름이 공백/로마자 표기/지역 접두사 차이만 있는 **진짜 중복**(예:
//       "양평곤충박물관" 완전 동일 2건, "피규어뮤지엄W"/"피규어뮤지엄더블유",
//       "괴산 한지체험박물관"/"한지체험박물관") → 두 후보 모두 포함.
//   (b) 이름이 **의미 있게 다른** 별개의 하위 시설/기관(예: "OO어린이놀이터
//       -2"/"-3"처럼 번호가 다른 개별 놀이시설, "실내놀이터"/"야외놀이터"처럼
//       서로 다른 부속 시설, "경기도어린이박물관"과 "경기도박물관"처럼 같은
//       부지의 별도 기관) → CSV가 실제로 적어낸 그 이름과 정확히 일치하는
//       후보만 포함하고 나머지는 제외했다. 예를 들어 CSV는 "부산과학관
//       어린이놀이터-1"과 "-3"만 골랐고(같은 복합시설의 "-2"는 의도적으로
//       빠져 있었다) 이 선택을 그대로 존중했다.
// 최종 고유 ID 기준 총 123건(안전 매칭 63건 + 검토 후 포함한 중복 후보 60건).
//
// [노출중분류] 2026-09-30 역사박물관 분리 때 확인한 '어린이 박물관'
// (bc3b83df-b478-4620-9495-6499870bebdc)을 그대로 재사용한다(같은 노출
// 중분류로 모인다 — 표준중분류 출처가 역사박물관이든 종합/기타박물관이든
// 소비자에게는 동일한 "어린이 박물관"으로 보여야 하므로).
import { pathToFileURL } from 'url';
import { loadEnv } from '../lib/load-env.mjs';
import { createAdminClient } from '../ingest/lib/supabase-admin.mjs';

loadEnv();

const CHILDREN_MUSEUM_SERVICE_CATEGORY_ID = 'bc3b83df-b478-4620-9495-6499870bebdc'; // 어린이 박물관

export const TARGET_SPOT_IDS = [
  '9fcb442b-fa53-4ba1-b0cb-0836c8423372', '36070e7c-5d39-4782-8a19-afa94d985d06', '6060d46f-918f-4048-845f-63874711bc95',
  '0db18ed0-f621-43bb-985d-1a3eb5a5920d', 'f40d9333-f9af-43f4-b3d1-a4590acf7df8', '9a785ea5-ec7f-4ed9-a424-acd7ffb8393c',
  'f2fdc431-231a-4306-8e46-824cc6373339', '8a17dee4-4018-4067-ae64-cdb68e0b4fba', '1591fe56-3216-450b-968f-dd4656b38242',
  '7c07ed59-9081-4978-85cf-8f1f795bdbee', '2ab19d93-e726-4900-9314-aec3a48ed9cf', '9fa5b4c4-54aa-4e45-b1ba-c6c23def3f6a',
  'bebfb813-b5d8-4bbd-8484-0f2bce54d96c', 'b7822412-eff5-4c95-81a6-c4bd971357e4', 'a5187797-56f9-4a34-b201-033e14ee4943',
  'e25e1477-6e6c-4f9f-bccc-409c89be82b1', '0de87710-6860-4530-b406-d6a3ac878209', 'c1c1768e-5b03-419b-830f-57548cb32f0b',
  '6b753636-5ce2-4fc1-b87e-3d8066021c3d', '4f81a3d7-4a59-4f3b-a964-965f3c86e8d6', '13131767-0959-4fe4-b0b6-1e46f286f2ad',
  '27ceb8c0-982d-4e35-9382-457cefd3f825', 'a5eb9350-4398-49cc-83d1-4df9964f584b', '5111a6b2-f542-4866-8e2e-e5563bda32a3',
  'd13b611d-87a7-4ea5-84e8-1e5b55db0315', '6f244d6e-12bb-4718-9021-5de3bd8725af', 'ca121dc3-0194-4956-84b1-353141740c9a',
  'db8f2172-f096-4bf8-a058-7cbf21043d4c', 'ad03c0c1-e114-48c0-9b27-ad62fee546d8', '213a7ed1-efb5-4850-9d65-13779152b5ce',
  '7de1ee40-7819-4c56-9510-3c05d3c1d0d7', '31c460a8-3595-4848-8bd0-08b577a671a8', '2cd677f4-cae6-41d5-899b-d65c624c0119',
  'af17a87c-f697-4759-a042-51174a1b648c', '4f0aa0eb-63e5-4bf1-a38a-33496a19f530', '44d9f967-ca2b-4448-bb04-73712d86a56a',
  '2979f93b-35f7-4eb4-8463-843c75e0e0f2', '3773bf36-74a0-47bc-94ea-1d7b0197d1a7', '7e1e41be-04d2-4972-a242-38ca92419471',
  '0dfb4a61-a6a1-4adf-89de-e603ceb60d43', 'a7020cb8-4f40-4965-b31c-f110049df2f1', 'd6fa3ff1-1463-4693-a449-a0071448a48e',
  '4d5806dc-e7d6-4cc4-98e9-e949fdf47300', '9bce3249-2407-4f3e-b05b-f587bd0a342f', '65459d4a-0e6d-4326-80fd-627f4446e775',
  '912dd592-dde6-4618-b72d-a03a4b390622', 'cd8767e7-1891-43db-9097-ac8400db0a27', 'c7824a84-7298-445f-871f-bf01ba83d24b',
  'c24c860c-e79e-40c2-bf88-0642800c7bee', 'd9c24666-6660-4714-9c2f-a93a65b776a6', '7d53c747-8e17-4485-8eea-ddb3cdb5f21b',
  '99182b9f-a94a-431f-a867-844b965d2b09', '85268c18-5f9d-4f90-ae9b-d4c7e385ea5c', '708b7ecf-f0f3-4e71-9774-22aa30a3ae78',
  '06d91e1b-8dd1-4f88-93ab-e49416ab805a', '8f654758-7328-4ab5-b981-ab4b075a9d3d', '1e4f625f-480f-4030-a41f-4e975d6439a5',
  '984eee18-dd5f-4ad8-8e67-5cb89af757fa', '9aa6cc68-bc40-4184-8bae-2888e1795ac1', '911263a0-84fe-46d4-8614-d040b46c1649',
  'ceabc585-c5bc-4f0a-830a-2a4c0892238d', '71320b15-ae7c-4c2e-acb3-e4a62c1176c0', 'b6df7d0a-0890-4d96-b459-245b1bdc7956',
  '4d260896-e31f-45da-9027-01a39a067f80', '21afd79a-a185-4a66-95a9-080e3dcb5b60', '46d163ae-b67c-4879-8498-e04350dd5dd3',
  '3989d14f-b4d1-4c0f-ac6d-5383d1795fed', 'c49d1faa-657e-4c16-9c2b-40227b986347', '49598676-74e0-4f50-84a0-6021e3d4c15e',
  '91959f23-2b8a-4cfa-8128-bf553d987eac', 'f07b1ef3-5160-4ae8-8627-a3305d689377', '96ef01a4-4c28-4db0-b37c-8f0469e6bf1a',
  '20a39247-8b90-40dd-a9b2-d5eed6ad14c3', '62e8b2f3-33f3-4881-9035-00f6a9dc6821', 'c878a54b-d460-4da4-ba84-b23ab7d8f03e',
  '6aa152a8-5058-4431-8f56-8631b2fa8e55', '38f5f987-9887-4286-a809-d614c42ed7d3', '1f5aa8e0-f454-46dc-b4dc-47a3a800b52b',
  'a41315d4-684b-465b-be87-023d470909a9', '6d2067d5-8676-47b9-845c-ed95346b39ef', '7e3e7f34-f0c6-410d-8981-f0493ad12cf1',
  'fb34e3e7-951c-4e96-b0b6-e6f69e3e62e5', '69f64387-d8af-4d8d-97ef-f084473fc89d', '3c2017f0-96aa-4233-bf18-8c015d8eee41',
  '66ada659-fec2-4bc7-aa0f-5fa7cc00abba', '9b70aa05-d121-43d2-bc72-00f4965eba75', '141e7e14-9412-45e8-8cab-979151e96c5d',
  'a8a5eb2d-ffa2-46f0-9db8-d3d43a0e22c1', '92ed9622-9c32-4965-b1b9-a0d7d7035971', '3e083606-ca98-43d3-9632-6437b5d750ce',
  'd205dbab-46d4-4453-aac7-16f725ed0f36', 'a06214c9-7de5-43aa-9909-89a1c4e24a2f', 'b7528b80-e03d-47bb-ace6-7f4bcca869da',
  '8da070dd-436a-4f01-84b2-f6b8bd0fa413', 'e5f969ba-7f16-4604-b343-338c35574729', '0b1dbefa-4566-4038-aa56-37d8829cb510',
  '83741c31-024b-4609-a96b-493cac85bf12', '0ab2f4e5-0e5f-408c-9f07-10a204671e9b', '08502bcd-18c7-494b-b92d-28f5a0eb889e',
  '042cfb18-a393-458b-96c9-f1f00b876174', '75e34744-7113-495a-a952-2aa75e71f8ee', '9376bf02-c605-492d-ad9c-1cab048acd1d',
  'e851fe6e-1f3d-4495-9c08-a3eac254d13d', 'b6de8324-3d28-48f1-afd1-68010ffd0ab8', '3e46bd65-951e-48b8-8f65-427876e8266e',
  'fb4dc46b-9377-4817-94ed-9bb04230d1a5', '74c6f4fa-d664-4b06-9c64-8eece0fe56a0', '1f469c03-53f0-4822-b7b0-454d2b360e52',
  'a10d7a1a-fb43-42c0-879d-8467882fdd6f', 'b82d25b3-acdb-4019-8cb4-9d778594b3f4', 'ed8ff8ca-dabf-4ae1-a5cf-375dca4822e2',
  'd2fcf61a-638c-483b-8d07-f0d11eb7716b', '82cc2274-3270-499b-b76a-16f2cb91976e', '19964c0e-1e35-497b-b3d8-2b48274acc0a',
  'c7537a7d-2a50-4f2c-bb26-10d5f2ebc414', 'c81b4b87-c0f7-4958-bc58-ed6b0ad97ef9', '3d6b3b62-b5c6-44b5-9a56-2b2b0514df2e',
  '3792ef3b-dcd1-47b2-a9b4-cb4cef36ffc2', '0491b59e-ecfa-4673-b9ab-4e2681550b79', 'c3d142ba-538a-4346-9268-904c7ec0eb3a',
  '51a265ca-9be3-464e-b015-fbbbd1b5c95f', 'c701fbb4-7fcf-47c9-8afd-11696acc8090', '07e70a17-b043-414d-9a99-9cae77bc5dbc',
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

  console.log(`[SPLIT_GENERAL_MUSEUM_TO_CHILDREN] 완료 — ${data.length}건 이관(대상 ${TARGET_SPOT_IDS.length}건 중)`);
  return { updatedCount: data.length, targetCount: TARGET_SPOT_IDS.length };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  run()
    .then(({ updatedCount, targetCount }) => {
      console.log(`▶▶▶ [SPLIT_GENERAL_MUSEUM_TO_CHILDREN] 종료: ${updatedCount}/${targetCount}건`);
      process.exitCode = 0;
    })
    .catch((err) => {
      console.error(`❌ [SPLIT_GENERAL_MUSEUM_TO_CHILDREN] 실행 실패: ${err.message}`);
      process.exitCode = 1;
    });
}
