// [종합/기타박물관 → 어린이박물관 추가 이관(batch2) + 노출중분류 매핑](2026-09-30
// 사용자 지시): "문화시설 >> 종합/기타박물관 표준중분류에서 하기 파일에 있는
// 데이터들에 대하여 표준중분류 '어린이박물관'으로 이관해줘. 그리고 노출 중분류
// '어린이 박물관' 매핑해주고. 박물관2.csv" — 2026-09-30 batch1과 동일한 패턴,
// 두 번째 CSV 배치.
//
// [실측 확인] `박물관2.csv`(CP949, UTF-8 변환 후 확인, 110개 행)를
// category_min='종합/기타박물관' 남은 대표 행 1,265건(batch1 이관 후 갱신된
// 수치)과 이름+주소로 대조했다. 60개는 단일 후보로 명확히 매칭됐고, 4개는
// 이미 batch1에서 이관 완료된 항목이라 매칭 실패로 나왔다(정상 — 이미
// '어린이박물관'으로 옮겨져 이 카테고리 풀에서 빠짐: 태백석탄박물관/국립해양
// 박물관/전곡선사박물관/국립김해박물관).
//
// 37개는 같은 주소에 후보가 여러 개였다 — batch1과 동일한 원칙으로 두 경우를
// 구분했다(제3장 제5조 추측 금지):
//   (a) 표기 차이만 있는 진짜 중복 → 두 후보 모두 포함(예: "농협 농업박물관"/
//       "농업박물관", "안면도쥬라기박물관"/"안면도 쥬라기박물관").
//   (b) 의미 있게 다른 별개의 하위 시설/기관 → CSV가 실제로 적어낸 그 이름과
//       정확히 일치하는 후보만 포함. 특히 이번 배치는 "OO어린이박물관 실내
//       놀이터"/"실외놀이터(기타놀이시설)"처럼 하위 시설별로 각각 별도 CSV
//       행이 있는 사례가 많아(예: 경기북부어린이박물관 관련 4개 행이 정확히
//       4개의 서로 다른 후보에 하나씩 대응), CSV의 각 행을 정확한 이름으로
//       개별 대조했다. "국립중앙박물관 어린이박물관"/"국립청주박물관
//       어린이박물관"처럼 일반 박물관과 그 안의 어린이 전용 코너가 별도 행인
//       경우도 어린이 전용 코너만 포함(일반 박물관은 어린이박물관이 아니므로
//       제외).
// 최종 고유 ID 기준 총 117건(안전 매칭 60건 + 검토 후 포함한 중복 후보 58건).
//
// [노출중분류] batch1과 동일한 '어린이 박물관'(bc3b83df-b478-4620-9495-
// 6499870bebdc)으로 매핑.
import { pathToFileURL } from 'url';
import { loadEnv } from '../lib/load-env.mjs';
import { createAdminClient } from '../ingest/lib/supabase-admin.mjs';

loadEnv();

const CHILDREN_MUSEUM_SERVICE_CATEGORY_ID = 'bc3b83df-b478-4620-9495-6499870bebdc'; // 어린이 박물관

export const TARGET_SPOT_IDS = [
  'e4803b5f-1e19-4327-9c30-60dde2e1d033', '4c26cf73-92e3-45ee-b352-3992c560846f', '0778322c-9f65-4c33-815c-4cd3bc041f02',
  '4f9eaa82-0632-454e-88da-1b6313928d78', 'ce24ad01-c7e3-48b9-ad6f-c010efe2cc95', 'cb8e1631-297d-4144-b6b2-42ca7de2d5d0',
  'b2c0c825-3857-4a78-8ff1-9b1cd3a241bb', 'd5a86b31-e700-477a-9c63-d21366db892f', 'f643b295-fd63-4e77-975d-c897d55b94cd',
  'd16df8ca-b3f7-4309-8c3c-20fe6a4427aa', '4c525d87-5869-4328-b186-7d2bbec5668d', 'e776f8b3-a013-427d-a45c-2c25b0332420',
  '23d0d22d-85ed-4001-9673-960dba84f617', 'f6ce281b-a6fc-494d-ab54-f1856795fea1', '1c3ec5a2-80fc-466a-b8ad-f7e385acfa0d',
  '47b9141e-240d-4fbc-a1e9-64a24ceeec23', '7746bdb7-193a-433f-82f0-5b6b7f08ba39', '0a6a26ac-cdde-4185-8998-54b6d8bb40fb',
  'c9aa3e95-e0ca-4524-b2d2-a78d08eb5a04', '780d1d13-a2cf-4d4a-9f8b-4a5cf2e26429', '4652cf0b-264c-463f-9887-ced9f862e84b',
  '3458bcf5-acc1-4152-986b-bce4e71084b6', 'c1d370a5-8c60-4b93-8e91-5d2201bdf163', 'dad25b14-d6f3-425a-9441-5f52cec830aa',
  '7e0e570e-83a4-4162-bf31-ad36970e707c', 'd0ce911f-97d7-4517-af52-bf0b48e27dba', 'df59dd9e-3866-4e08-977b-c3be0b66468b',
  '807124a4-fe1c-481b-b2f2-b522abf4905b', '49fe1283-b7d5-43e1-9592-1c103a86f534', '27df6024-1891-4e98-96e1-7bd1d61cf387',
  'ea120587-8c67-4042-8953-23a19ab16d45', '25c368fd-19af-443f-b3b3-f9d22b6a1de8', '18188709-ff98-4ab3-bbd7-44191aaee87b',
  '4272291f-ce2f-4174-8c4c-7a073554c10d', '50198f30-9390-49e2-b677-89f82731fe14', '1793a92f-21a3-4885-9ef0-30bbf938e4c6',
  'b4b4ada1-75e6-42eb-9c1c-fc2c05488bcc', '9b7208b0-3ef9-4766-a15a-f2c77e3d3137', '44996e91-22a1-4098-9a3d-bc1183c3ba60',
  'f9f31d0a-c894-4757-af1d-c9bd7ce0bda3', '14ce260f-c28f-475c-9989-68d4cacc90f6', '5111cbdf-77ae-4882-b8f0-f32aa4039369',
  '064f2caf-fe79-4753-bc39-247179f136a2', '8ba6f88d-04ed-406b-b88d-6d85163f1e05', '42ed2d4b-2531-4a76-b950-bc8c133ade37',
  '9a335d3e-faf4-47b9-84f9-f75616d9f551', '83af70da-cc6f-46dc-9ced-dd2bd43b8b65', '87fef81a-f217-4d69-be7f-63182d342ee9',
  '1ba3eec5-4a96-4ef8-959e-e75ed822d69c', '3e310371-5da1-4780-b348-2c4c61a11d07', 'b26fb432-af12-453c-9c14-5b056b7146ea',
  '00a78772-f963-4812-a664-d050d183b0d3', '3d088696-dfaa-4ec7-868a-07d8e5462a82', '31d7534c-2ffd-46ec-846c-97ef1af8037f',
  '0cc69e3b-2b15-43a4-b325-9676dde951f9', '44bedeee-8714-4143-a937-ea74d639e518', 'b2eea3c3-e78f-4a6d-8efe-732d5853d61f',
  '33a9fdde-e0b6-40b4-ac23-e9464972852a', '000a5968-f859-4877-8301-e1864aa9c434', '47673465-b071-4526-a5c7-621b38a722e9',
  'ed69e5ec-3d19-4eb2-973b-b92e6e8fd6d5', 'b380a3e5-1072-4783-891f-2868c9d6ca9b', '74ffb83f-9869-4371-acef-c1b6bfaea30d',
  'd0982685-ca87-4115-acc7-7192a07c4ee9', '55dc396b-5738-45d8-b38e-c4a91edeffc5', 'a65fd38d-f3e9-4c05-b1fc-7dddced127d0',
  'ba026220-d578-4f47-b22c-a0bf6a5158a3', '1939d9e3-0e94-432c-b8c3-f14fd4affae1', '891f57a1-d7cc-48bd-a4cd-c0b029424eb3',
  '05ec13b8-8a9b-456c-8d1f-a1d0bdd31d56', '1ece258f-edfa-4e34-aadf-7c6dd4404d34', 'eb8daedf-dab4-4d85-bc29-3c48a01f2eb1',
  'd3f9f04a-97ce-4f40-bfeb-c5455ad62ccf', '1592882f-7d71-4aee-b3f4-034cd87af3b8', '6c2aa291-91aa-4b54-bec5-78c9a2cb8694',
  '7de3097d-74b1-4e22-bcbc-798a99689957', '52b3450b-d3c2-42c2-8157-968bed04d6eb', '25326456-09c6-43a3-91f1-8a3375de69c8',
  'e6999e60-b27e-43a5-9ee3-93d563dc662e', 'a8dd9bb6-17bb-4f79-9aae-7a1805bc96d0', '0f96e696-2a5f-4fcb-8531-1efdb23c3564',
  '760750f5-7d0e-4940-b0b2-f73deb0d7560', '002d557b-7457-450d-98cd-092a8c654ddf', 'faffb32e-6d7c-4cbf-957d-967ffbc21978',
  '0ad6640d-fb36-4284-87e0-b22cfcc06e73', '9f768f79-c20d-4e29-b510-9c69a2363818', 'df09af86-3371-49c4-8e48-4ea328e5bc16',
  '13b5d895-0006-4fc9-bd0d-735df2923727', '9bb91f1c-351a-4a01-b89b-5df17bb7b604', 'bcc5406f-4a97-4959-9ac9-85326f731d32',
  'd13286ee-0e59-419d-bdd7-ed7e6449d135', '38fc630a-db8b-4985-8544-2b515ec381da', '09c98ab0-7e9b-47a3-918f-613741816146',
  'f20ab509-aa70-4116-a04d-b259133b3aab', 'e7b4bcde-cfe5-4dd6-bac0-37783a711572', 'c4e3c386-5635-44c5-8f48-126cd471a078',
  'e28eaf52-0b0e-4b33-a4b0-b5543df8b7e4', '7de9efd7-1683-40c6-aacc-faf53b17cdf4', '86279783-25c9-4357-bab8-c811fc85f048',
  '622b9813-56e0-4908-b0d3-66ede5102708', '667de95b-f907-4299-acdf-e92d25102f5c', '26292681-8a99-4c18-a122-bc382a178ab2',
  'afec9e61-1a33-41ec-8c94-5db208ce8100', '348eacca-f201-4ab4-8a85-47d8c04862ae', '6d5dd220-d2d2-4003-a240-25147a22d637',
  '6d8e9cc1-f281-4803-b87f-2137892caa94', '807154da-2449-4016-bb6d-dfc58929162e', 'cf63e864-047e-4e9b-8a1f-3624adf4ee1d',
  'f35d0e8b-777d-4be1-8607-c7a745b30456', 'd0d842f3-0b4e-4249-bf06-a0a3190831c4', '1b86a9e9-ce41-4329-8df9-351686ced65a',
  'e75ce1f4-eafd-4a79-b73f-b17221eec58c', '797ed2da-0956-478d-b8a2-e05f60b58fec', '4398771d-c577-4613-af2a-078379fad863',
  '1132363d-497c-4c3e-8ad9-3d1ae140ed18', 'adfc86f3-6f2a-4419-8c47-126a2acb857a', '6590c07a-47e1-4d31-98e2-68a5e438a1fc',
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

  console.log(`[SPLIT_GENERAL_MUSEUM_TO_CHILDREN_BATCH2] 완료 — ${data.length}건 이관(대상 ${TARGET_SPOT_IDS.length}건 중)`);
  return { updatedCount: data.length, targetCount: TARGET_SPOT_IDS.length };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  run()
    .then(({ updatedCount, targetCount }) => {
      console.log(`▶▶▶ [SPLIT_GENERAL_MUSEUM_TO_CHILDREN_BATCH2] 종료: ${updatedCount}/${targetCount}건`);
      process.exitCode = 0;
    })
    .catch((err) => {
      console.error(`❌ [SPLIT_GENERAL_MUSEUM_TO_CHILDREN_BATCH2] 실행 실패: ${err.message}`);
      process.exitCode = 1;
    });
}
