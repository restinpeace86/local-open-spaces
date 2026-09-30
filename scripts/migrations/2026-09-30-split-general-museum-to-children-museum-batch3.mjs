// [종합/기타박물관 → 어린이박물관 추가 이관(batch3) + 노출중분류 매핑](2026-09-30
// 사용자 지시): "D:\workspace\local-open-spaces\박물관3.csv 해당 파일에 있는것도
// 마찬가지로 '어린이박물관'으로 이관시켜줘." — 2026-09-30 batch1/batch2에 이어지는
// 세 번째 CSV 배치.
//
// [실측 확인] `박물관3.csv`(CP949, UTF-8 변환 후 확인, 109개 행)를
// category_min='종합/기타박물관' 남은 대표 행 1,148건(batch1+batch2 이관 후
// 갱신된 수치)과 이름+주소로 대조했다. 69개 행이 단일 후보로 안전 매칭됐으나
// 이 중 4개는 (주소 표기의 괄호 유무 차이, 또는 일반 명칭과 그 유일한 잔존
// 하위시설 행이 같은 db row를 가리키는 경우) 서로 다른 CSV 행이 동일한 db
// row로 수렴해 고유 ID는 65개다. 12개는 매칭 실패로 나왔는데, 전부 batch1/
// batch2에서 이미 '어린이박물관'으로 이관 완료된 항목으로 직접 확인했다(정상
// — 이 카테고리 풀에서 이미 빠짐: 테디베어뮤지엄 제주/보령석탄박물관/
// 국립산악박물관/조명박물관/국립춘천박물관/국립청주박물관/서울생활사박물관/
// 피규어뮤지엄더블유/삼성화재 모빌리티뮤지엄/춘천 애니메이션박물관·
// 토이로봇관/안면도 쥬라기박물관/부산영화체험박물관).
//
// 23개는 같은 주소에 후보가 여러 개였다 — batch1/batch2와 동일한 원칙으로
// 두 경우를 구분했다(제3장 제5조 추측 금지):
//   (a) 표기/접두어 차이만 있는 진짜 중복 → 두 후보 모두 포함(예:
//       "김천시립박물관"(2건 중복 입력), "한국잠사박물관"(공백 유무),
//       "사립강원종합박물관"/"강원종합박물관"(소속 접두어 차이),
//       "박물관은 살아있다"/"박물관은살아있다 제주"(동일 주소, 표기 차이)).
//   (b) 의미 있게 다른 별개의 하위 시설/기관 → CSV가 실제로 적어낸 정확한
//       이름과 일치하는 후보만 포함. 이번 배치도 "공룡화석지 어린이놀이시설
//       1/2/3"+"공룡사파리랜드 어린이놀이시설"처럼 번호가 매겨진 개별 놀이
//       시설, "독립기념관어린이실내/실외놀이터"·"국립광주과학관 어린이놀이터
//       1/2"처럼 실내외로 구분된 시설이 각각 별도 CSV 행으로 있어 정확히
//       하나씩 대응시켰다. "고래박물관 내 어린이놀이시설"(그 안의 특정 놀이
//       시설)과 "장생포 고래박물관"(박물관 본체)처럼 이름이 구조적으로 다른
//       경우, "예천곤충생태원 앞 놀이시설"과 "예천곤충생태원 실내놀이시설"
//       (실내/외 별개 시설)처럼 CSV가 명시하지 않은 후보는 제외했다.
//       특이사항: 이번 배치의 CSV는 "국립중앙박물관"(일반 본체 명칭)을 직접
//       3회 명시했다(batch2의 CSV는 그 어린이박물관 코너만 명시해 본체를
//       제외했던 것과 다름) — CSV의 리터럴 표기를 그대로 따라 본체 후보
//       (9b064db7, 5e368fed, ca5346af)와 "국립중앙박물관 전통염료식물원"
//       (796f1377)을 모두 포함했다. 서로 다른 CSV 파일이 내린 서로 다른
//       선별 결과이므로 batch2와 다른 결론이어도 일관성 위반이 아니다.
//
// 최종 고유 ID 기준 총 96건(안전 매칭 65건 고유 + 검토 후 포함한 모호 그룹
// 31건).
//
// [노출중분류] batch1/batch2와 동일한 '어린이 박물관'(bc3b83df-b478-4620-
// 9495-6499870bebdc)으로 매핑.
import { pathToFileURL } from 'url';
import { loadEnv } from '../lib/load-env.mjs';
import { createAdminClient } from '../ingest/lib/supabase-admin.mjs';

loadEnv();

const CHILDREN_MUSEUM_SERVICE_CATEGORY_ID = 'bc3b83df-b478-4620-9495-6499870bebdc'; // 어린이 박물관

export const TARGET_SPOT_IDS = [
  'a73b83d0-a67f-4d74-9b51-89a5d8ba5572', '1b535e73-6a4d-4110-be56-22ce3c6d3485', 'eb7b6eb7-7b56-4512-adac-2f97bf3e9f6a',
  '825e5495-df8a-40bb-aab3-bdd03ca29f02', '37e4df79-7e89-4f13-8d92-dca30d61b91d', '30cc12b0-e394-43fc-b685-ad846e16bd72',
  '04cf675a-f0bf-4635-8a1a-602d8e8451cb', 'd950e926-a081-4599-9467-75538c9da7a2', '314be4b7-5cd8-43fc-a7e0-28da81480e84',
  'f1f5acde-c98b-463c-8bb5-6212c7a96b36', 'cd4b5e4e-cb11-4257-b309-8e63b0edcfd2', '29797560-1a4b-4fea-81d5-5f570cd8cfc3',
  '99b39d70-73df-497d-8fb8-6d3c59243c66', '81f57e7a-9d3f-4c82-99d1-a27aa5695e6e', 'ec66e211-ef8b-406b-b59d-30e3cb97fa09',
  '556c3b86-4496-4db0-bee5-e6eba3ec0739', '361a0eef-9ca4-4924-b259-915137ff553d', '3dca773f-9ff0-4f5b-a582-22ccd142d2aa',
  '5c4a51d6-17d4-4c68-ab9a-cdeb4bbdb46d', '951a8a88-d52f-4f60-b5e2-735e60611945', '6fd326c1-9ac7-48a0-a438-aa5ed4a8b88c',
  'bddd9f18-783c-4b97-940e-70f88ba7ca2d', 'c4a2dd46-d697-4db4-806d-02cda154c87a', '40be18cf-0b4a-44d7-9886-9d745a8cc40f',
  'a11bab0e-6d2f-4ab9-88cd-c3394a2b2bfd', '124c2553-fb41-4c38-9991-e63689ed25db', '2f02b9cc-0f69-4323-87b2-debec69ca051',
  'e85a8eb0-a380-4eee-8b42-d524ca33ff1d', '72298bcd-90a4-4c8a-b326-7d2833acc6fd', '74e1fe21-1e4a-47d6-9032-af221733d625',
  '9e675364-f86b-4be6-a1cb-69adc057db40', '5087f373-ca44-493e-94ef-6f854b3bfba3', '68b357fb-9b2d-48cb-88bd-79e0b1dcd477',
  '116f94e9-121a-4399-9ab3-26c0a69e19db', 'baf9b4c6-a4bf-458f-9fda-f0584f491cc7', '2e899471-4a33-45a7-a3a7-7c9a73ff10d3',
  '0c081aeb-345b-41db-a99a-46bcae95218d', '75002c79-9f4b-42ab-9d29-b14c91ee982c', 'd05a1120-147c-4d26-a75a-36a9dc22774b',
  '51a3f0e0-63d0-4633-b531-341dbb1d1ce9', '3d2bd3ef-0556-4f99-becd-53fd3f62906b', '41b82581-82d1-44d4-8e42-339edcd3cbd7',
  '3c9a90be-7f47-4eba-8878-d521f93cea40', 'a6d11926-77f2-4c9d-b5c0-3dffd788bfaf', '0aa22168-cd9f-44f4-afd9-6c09dffff1d6',
  'de789e6f-ea0b-4f88-81f1-8ee671a4e5c9', 'd713c70c-cd42-4571-bc7f-e784af30dd38', '54ec498c-3216-441f-b501-f01710ad9bd9',
  'd26feb33-fb94-4319-90d6-188588238622', '86542ada-aead-4d72-afbe-4938856583fb', '940db11e-691e-4e74-a272-0dd628a68c9b',
  'd8dcea04-8bd1-40d8-a747-d4d86984a73f', '6fb7d375-8539-4f86-a2f5-f267b15c0f2e', '8f307913-eeee-4fed-afef-56f6dfee9dbe',
  '7f90783c-103f-4708-bf2e-841e25af866e', '5b53f926-38ac-4903-9095-d3f033b93178', '38f38053-84fa-4729-ad30-604f461f47c5',
  '1c16f37a-0dc9-4b5a-aae4-a45539ebeb94', '31248b42-3189-4fca-888b-aa19d1a44ec7', '059eff0f-2034-4911-864d-762fa0461a84',
  '5c289296-3077-4750-92d2-cde5fe5bfc68', '3ed3af5a-4b2e-4a27-8969-19f97409aaa2', 'fac94080-caa5-4e14-9f91-9d51ff0836f7',
  '00eb9e66-6b51-41e2-a964-dcddcd39e934', '08d2350b-2592-4093-a851-311464cdaf2b', '8462bbad-7583-4f7c-8172-478e80e6572f',
  'cfebc548-f5ac-4c1f-bfdf-b1a043af4a2b', 'e5deebb9-b1bc-438d-827d-53707bd6c406', 'efeb94af-e39e-488b-9e9d-790bf225b2db',
  'f91075fb-3a91-48f8-84ab-f31b7f926e90', '9661daf0-ab0e-469a-acfc-edab1dd36361', '9ac0bba5-7f78-4c8b-853b-538c6f7ede1f',
  'f3367401-52df-42a7-8be3-9c6668b7f076', '86bd2ad3-9d2f-44f1-89db-1e23e882752c', '234365da-d333-4ff7-961a-e67b3c549552',
  '7e439544-6f2f-418c-b396-1d4ac3b9beda', '2fe15895-21a4-4681-9f44-4f232ec5d6e6', 'b74322fa-880a-457b-ad0f-91db7fa8facf',
  '334c45f6-f301-4ad7-b856-6b4ce03abd6b', '6d343dc6-f05f-40c3-b7bc-d927f21a9827', '9b064db7-e8f2-44d7-9be3-a96a96084bba',
  '5e368fed-7005-4730-ab81-a38b49fb3da2', 'dbd8ed48-1126-4ef0-bb36-763d40db7422', '11182153-df68-4682-9b66-91f109199526',
  'ca5346af-5bc6-49fd-b830-3346ca9aa5cf', '796f1377-25a4-4d78-968a-3c7c93e6c26b', '185a4f25-7c85-4fe0-8f46-f93dd036c1a9',
  '647c43e0-d84f-43df-976c-33e7f406c307', '387841e5-2114-4743-82b6-f92fdcfb89dd', '24651ef8-7881-4c53-b6b2-1fb267ad43fe',
  'ce41a725-27cb-49e0-ac54-d8bfcd906bbf', 'cabc6c5e-b4a0-423f-9daa-841368f64243', '30968e20-904c-4388-be10-a64ecc224ee2',
  '6821fb13-5e9d-4719-97b3-eef9ae68bba0', '78f83698-895b-4d3e-a2df-49cbc6b25b57', '855d7683-3e20-4998-a411-49cbad874aec',
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

  console.log(`[SPLIT_GENERAL_MUSEUM_TO_CHILDREN_BATCH3] 완료 — ${data.length}건 이관(대상 ${TARGET_SPOT_IDS.length}건 중)`);
  return { updatedCount: data.length, targetCount: TARGET_SPOT_IDS.length };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  run()
    .then(({ updatedCount, targetCount }) => {
      console.log(`▶▶▶ [SPLIT_GENERAL_MUSEUM_TO_CHILDREN_BATCH3] 종료: ${updatedCount}/${targetCount}건`);
      process.exitCode = 0;
    })
    .catch((err) => {
      console.error(`❌ [SPLIT_GENERAL_MUSEUM_TO_CHILDREN_BATCH3] 실행 실패: ${err.message}`);
      process.exitCode = 1;
    });
}
