// [순수 어린이박물관 표준 중분류 신규 생성 및 이관 + 노출중분류 매핑](2026-09-30
// 사용자 지시): "표준중분류로 '어린이박물관' 하나 생성하고 하기 파일에 있는
// '역사박물관' 표준중분류의 데이터들에 대하여 '어린이박물관'으로 이관시켜줘.
// 그리고 노출중분류는 어린이 박물관으로 매핑시켜주고." — 2026-09-29
// 어린이과학관 분리와 동일한 패턴.
//
// [실측 확인] 사용자가 준 역사박물관.csv(CP949로 재인코딩, UTF-8 변환 후 확인,
// 44개 고유 항목)를 category_min='역사박물관' 대표 행 325건과 이름+주소로
// 대조했다. 31개는 단일 후보로 명확히 매칭됐고, 13개는 정확히 같은 주소를
// 공유하는 미병합 중복 후보가 있었다(예: "전쟁기념관" 3건, "대한민국역사박물관"
// 은 주소 표기가 두 가지 변형("세종대로 198"와 "세종대로 198 (세종로)")으로
// 갈려 있어 각각 2건씩 총 4건). 전부 실제로 같은 물리적 장소로 보여(주소가
// 정확히 같거나, 동 이름 접미사 유무만 다름) 이관 대상에 포함했다(중복 자체의
// 병합은 이번 지시 범위 밖 — 어린이과학관 때와 마찬가지로 사용자가 "중복 스팟
// 검수 및 매핑"에서 직접 병합할 예정).
//
// [제외 판단] "독립기념관" 주소에 후보가 3개 나왔는데, 그중
// "독립기념관단풍나무숲길(단풍나무숲길독립기념관)"은 이름 자체가 독립기념관
// 경내의 산책로(단풍나무숲길)를 가리키는 별도 포인트라 CSV가 실제로 의도한
// "독립기념관"(박물관 건물)과 같은 시설인지 확신할 근거가 없다 — 추측으로
// 포함하지 않고, 이름이 정확히 "독립기념관"인 2건만 이관 대상에 넣었다
// (제3장 제5조 추측 금지).
//
// [노출중분류] service_categories에 이미 '어린이 박물관'(bc3b83df-b478-4620-
// 9495-6499870bebdc)이 존재했다 — 기존 '어린이 과학관 / 박물관'(bf9c5c83-...)
// 과는 별개의 값이라 정확한 id로 매핑한다.
import { pathToFileURL } from 'url';
import { loadEnv } from '../lib/load-env.mjs';
import { createAdminClient } from '../ingest/lib/supabase-admin.mjs';

loadEnv();

const CHILDREN_MUSEUM_SERVICE_CATEGORY_ID = 'bc3b83df-b478-4620-9495-6499870bebdc'; // 어린이 박물관

export const TARGET_SPOT_IDS = [
  // 안전 매칭 31건
  '17e83073-5654-4396-9685-e41c3af06645', '1598f6cc-8be8-4076-9713-325c4fbac60c', '1e450448-eed9-4f1e-8fe8-b355d7df2fc3',
  '3cb534ef-bf33-408e-8d91-e6a22ed2b13d', '51d0e959-b310-4935-bd49-12a8ebd0aa08', '7848f9a4-957f-43b0-88e4-6b61b60f1116',
  '6b3d14eb-6cdf-4a87-8988-7327455b1a87', '520a5d74-8611-46d1-8df4-2d3a94430943', '123b2d79-71eb-40fb-9c71-0feac05550e0',
  '8395c667-cfce-446e-975d-04e418be43f7', 'ab967575-334f-460b-8dfd-1224fb7e7e6e', '26891ea6-0d84-4860-8880-b1349ad92c4b',
  '052bd612-6519-4aa2-9fa9-364195b37863', '611cf4d2-f980-40a6-8967-9d0da30edb2b', 'ca95c196-37a2-48cb-987c-35ca157ddb42',
  '4a5dd0f4-1b42-4a17-a7b0-25926d6360c8', '2d457e2a-f217-4a5c-9b12-146985cf12e2', '0491eda7-e912-43e2-8d36-edb37e95bd0e',
  'a4951cd8-bb9a-4a32-9da1-9ae23dd447fd', 'df0569a9-488a-43b7-9dd8-54169f26343f', 'efee51b7-2af9-453c-82d1-53e61a310013',
  '53651754-d90b-4189-a7a3-ee90f6b24698', 'b587fd52-ef2e-403f-bf5e-cd2dc7e4cc2b', '17ad367d-c051-4296-8957-51d8ddfcdfcb',
  'ebb16cba-ff79-48bd-a358-1e12d2c47ad5', '99b9e7a1-313d-43a8-a4a6-6fa698d6ce8b', '6469ed77-10c0-40ec-8f72-d598fc7571b9',
  '6b0b1128-c931-467a-bab4-276d2d7fa0a4', '0538ae00-3fca-447c-a601-5ecca09261c5', '394cd40d-dcf0-4f44-9e7e-6ff235aefdb4',
  '5c3ed268-eba0-44da-bdaa-f6d9af52dafc',
  // 모호(주소 완전일치/동 접미사 차이만 있는 미병합 중복) — 전부 포함 25건
  '47607219-8fe4-4e28-9eb0-e64363c93588', 'a2cdd13c-65b9-496f-b42a-56374f0c2934', // 청강만화역사박물관
  '10d38b95-40d3-4160-b0a6-c69f03351e10', '6af1d136-281b-47f9-a649-ffb96a69f46c', // 대한민국역사박물관(세종로 suffix)/K-컬처 스크린
  '9a24df90-7006-42a2-822e-9f404f31e7b5', 'ab112d9b-6021-4445-abb1-0a131b657079', // 칠곡호국평화기념관
  '27bf9c02-ac80-43a9-b0c4-dc05e7df2114', '3c65a9eb-2458-4c80-a680-1b9af1748885', // 대한민국역사박물관(suffix 없음)
  '734d2d9c-e7f8-4c7b-a13f-96f47e6c0d8d', 'a77c7a9b-c8b1-46b3-a727-f8ed642a7a9c', // 서울역사박물관(suffix 없음)
  'e6a13215-fd28-4ee7-8b3e-2b267f5e18bb', '1d08d9a2-fe47-450b-80d2-de6527feaa15', // 합덕수리민속박물관
  '9ea17133-8ad3-42e2-872b-d2eaf0628c28', 'f8aecac3-25cd-4551-8fc2-af0e7c669232', // 유류피해(극복)기념관
  '0d940058-d3cb-4311-96ef-f0deba052daa', 'f5be26f2-c1b5-4681-8a62-10f2e61ed401', // 의림지 역사박물관
  '42d7a6dc-fa06-4fa5-9677-c9883b610056', '7e8b986c-cdf7-47d6-9de0-f720d0cd2307', // 부평역사박물관
  '928b8073-3528-41bc-82fc-5e45a85ace39', 'a7dcad5e-2073-47ac-884e-2062ff070df3', '6a16b4fb-2820-4223-b2ac-c0c4fa3d8bee', // 전쟁기념관
  '5a3a2284-c9a7-4e2b-a3c1-fe55de02cf60', 'bcad27a4-1584-4dc1-8431-97c2ae5e0dab', // 국립민속박물관
  '9f22bd24-57f7-4eaf-8e37-2909950a7d42', '37092778-a132-49de-a9a8-83822173c447', // 독립기념관(단풍나무숲길 제외)
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

  console.log(`[SPLIT_CHILDREN_MUSEUM] 완료 — ${data.length}건 이관(대상 ${TARGET_SPOT_IDS.length}건 중)`);
  return { updatedCount: data.length, targetCount: TARGET_SPOT_IDS.length };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  run()
    .then(({ updatedCount, targetCount }) => {
      console.log(`▶▶▶ [SPLIT_CHILDREN_MUSEUM] 종료: ${updatedCount}/${targetCount}건`);
      process.exitCode = 0;
    })
    .catch((err) => {
      console.error(`❌ [SPLIT_CHILDREN_MUSEUM] 실행 실패: ${err.message}`);
      process.exitCode = 1;
    });
}
