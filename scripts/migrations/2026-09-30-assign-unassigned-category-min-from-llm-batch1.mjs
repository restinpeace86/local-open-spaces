// [표준중분류 미지정 → LLM 분류 결과 검토 후 실제 이관(1차)](2026-09-30
// 사용자 지시): "미지정_분류결과.csv 여기있는데이터는 표준중분류가 미지정인
// 데이터들이야.. C열의 표준중분류가 체험휴양마을, 교육농장, 놀이방찜질방/
// 스파, 어린이도서관, 공공키즈카페, 전시실, 어린이박물관, 테마파크 이렇게
// 된 것들에 대하여 각각.. 이관해줘. 다 이관하고나면 CSV파일에서 해당
// row들에 대하여 삭제해."
//
// [실측 확인] 사용자가 LLM 1차 분류 결과 CSV를 직접 검토/일부 수정한 상태(원본
// 1,920행 → 검토 후 1,852행, 일부 항목 삭제/재분류됨)에서 지정한 8개
// 표준중분류에 해당하는 행 33건을 뽑아 category_min IS NULL 대표 행
// 2,164건과 이름+주소로 대조했다. 32건은 단일 후보로 안전 매칭됐고, 1건
// ("농협경제지주(주) 안성팜랜드")은 같은 주소에 후보가 2개("농협경제지주(주)
// 안성팜랜드", "제이에스 산업개발(주)")였는데 CSV가 적어낸 이름과 정확히
// 일치하는 전자만 포함했다(제3장 제5조 추측 금지 — 후자는 같은 부지의 다른
// 사업자로 보여 제외).
//
// [카테고리 확인 및 사용자 판단](2026-09-30 AskUserQuestion): '공공키즈카페'
// (2건: 꿈틀어울림센터, 연제구 아이사랑뜰)와 '테마파크'(1건: 놀자숲)는
// open_spaces 표준중분류 체계에 아직 존재하지 않는 값으로 확인됐다(공공키즈
// 카페는 events 테이블 전용 분류, 테마파크는 어디에도 없음 — DB에 0건,
// category_rules 미등록으로 직접 확인). 신규 표준중분류 생성은 이번 지시
// 범위가 아니라고 판단해 사용자에게 확인한 결과: 공공키즈카페 → 기존
// '키즈카페'로, 테마파크 → 기존 '관광명소'로 대체 이관하기로 확정했다.
//
// 최종 33건을 8개 표준중분류(6개는 CSV 원래 분류 그대로, 2개는 위 대체값)로
// 나눠 이관한다. 노출중분류(service_category_id) 매핑은 이번 지시에 없어
// 건드리지 않는다(박물관_기타 배치와 동일한 원칙, 추측 금지).
import { pathToFileURL } from 'url';
import { loadEnv } from '../lib/load-env.mjs';
import { createAdminClient } from '../ingest/lib/supabase-admin.mjs';

loadEnv();

export const TARGET_SPOT_IDS_BY_CATEGORY = {
  체험휴양마을: [
    '705a19c0-a8bc-4773-bacf-46eec5c48daf', '72865356-c157-4ee5-9804-c2ce524b8e2e', '2f73c794-6a68-46af-8388-9e8cf06932e4',
    '7d31e734-fb50-44f9-8d43-2a58e2afd90c', '5311f8eb-f22b-4778-a046-82b1b41340f0', '288bfe9f-c483-41fa-8d15-d59340e1a243',
    '6b174298-7a86-446c-b147-5b7d870fa7d2', '9c492f01-4833-490e-9eea-4847b0e65b18', '615547a5-b778-4388-b300-65fe1417103a',
    '3e954e96-04e3-4038-8483-eed48cb60f3d',
  ],
  '놀이방찜질방/스파': [
    '3500b4f8-fa52-4bee-ae0f-a4ce5b34044a', '7fe70808-9afe-4add-ac9a-2e2a9a391927', '689f864e-dbdd-4117-a101-1b6363864a21',
    'd42bc53c-9a7b-49cc-83b0-78b34df879b9', '765d2b8b-178b-4e36-aad0-b9837c2c4de5', 'f4b5df38-b5e8-448a-8bc2-7a494f3eb50f',
  ],
  어린이도서관: ['650b0f66-6be0-41e5-aa93-ad5179c4faf8'],
  교육농장: [
    '75fef67e-9910-4a8f-ac84-ae30bbbd556a', '978ed389-0397-4504-9a94-22b4b5fef4ec', 'bd8d1ef0-764c-4bbe-9b27-bedc1a9688fe',
    'aa420c75-07a9-4bca-baa2-06cc678b22f4', '762e1fbf-e4be-4c97-9a84-b0282ddb1da3', '735c6043-a0f0-4d39-a9d0-d24f784238b0',
    '440e1869-0228-4896-b826-4a85f32f5951', 'a43c8645-adf0-4857-8def-b6c405406997', '406f8e36-5a0a-4087-b387-c90719e50300',
    '87136e15-5e9a-42b2-8329-025246dc0290', '40441f14-4145-4aed-b93c-0f44a5ec79c8',
  ],
  // 공공키즈카페 → 키즈카페(기존 카테고리로 대체, 위 사용자 판단 참고)
  키즈카페: ['286bfb2a-f486-43a8-b9d8-52aee36c1674', '3e311c33-4950-4390-8e1a-4cdd32c4d847'],
  전시실: ['b495e947-0d1a-4bbb-baed-b673dcfbbaa7'],
  어린이박물관: ['3b6910e2-6916-42e7-b114-b99ef80bbff6'],
  // 테마파크 → 관광명소(기존 카테고리로 대체, 위 사용자 판단 참고)
  관광명소: ['fb9352f7-b555-49e6-bdb7-6e0157e737aa'],
};

export const TARGET_SPOT_IDS = Object.values(TARGET_SPOT_IDS_BY_CATEGORY).flat();

export async function run() {
  const admin = createAdminClient();
  let updatedCount = 0;

  for (const [categoryMin, ids] of Object.entries(TARGET_SPOT_IDS_BY_CATEGORY)) {
    const { data, error } = await admin
      .from('open_spaces')
      .update({ category_min: categoryMin, category_min_source: 'MANUAL' })
      .in('id', ids)
      .select('id');
    if (error) throw new Error(`open_spaces 갱신 실패(${categoryMin}): ${error.message}`);
    console.log(`  [${categoryMin}] ${data.length}/${ids.length}건 이관`);
    updatedCount += data.length;
  }

  console.log(`[ASSIGN_UNASSIGNED_FROM_LLM_BATCH1] 완료 — ${updatedCount}건 이관(대상 ${TARGET_SPOT_IDS.length}건 중)`);
  return { updatedCount, targetCount: TARGET_SPOT_IDS.length };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  run()
    .then(({ updatedCount, targetCount }) => {
      console.log(`▶▶▶ [ASSIGN_UNASSIGNED_FROM_LLM_BATCH1] 종료: ${updatedCount}/${targetCount}건`);
      process.exitCode = 0;
    })
    .catch((err) => {
      console.error(`❌ [ASSIGN_UNASSIGNED_FROM_LLM_BATCH1] 실행 실패: ${err.message}`);
      process.exitCode = 1;
    });
}
