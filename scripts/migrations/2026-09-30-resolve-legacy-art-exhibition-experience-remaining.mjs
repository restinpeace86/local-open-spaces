// [구 노출중분류 '미술관 / 전시체험관' 잔여 7건 정리 — 2차: 나머지 2건]
// (2026-09-30 사용자 지시): 3/4번에 대한 제안 후 "그래 3은그렇게 해 4도
// 그렇게 해"로 확정.
//
// [3. 서울시립 미술아카이브] is_kids_friendly=false, 설명("미술의 역사를
// 보존하고 연구하는 미술관.. 기록과 자료를 수집 선별하여 보존하고 연구")이
// 어린이 체험 전시가 아닌 연구/아카이브 목적임을 명시 — 표준중분류를 일반
// '미술관'으로 재분류. 일반 '미술관' 대표 행 548건이 전부 service_category_id
// NULL임을 실측 확인해 노출중분류도 null로 맞춘다.
//
// [4. 서울시어울림플라자] raw_data.SUBJCODE="기타", 설명이 장애인/비장애인
// 복지문화복합공간(수영장·도서관·다목적강당·체육단련실·공연장·장애인
// 치과병원 등)임을 명시 — 전시/미술 시설이 아니므로 표준중분류는 기존
// '기타' 그대로 유지하고, 잘못 매핑된 구 노출중분류만 해제(null).
import { pathToFileURL } from 'url';
import { loadEnv } from '../lib/load-env.mjs';
import { createAdminClient } from '../ingest/lib/supabase-admin.mjs';

loadEnv();

const ART_MUSEUM_ARCHIVE_ID = 'a59dc0ab-6b13-4080-a00f-351ffc1ab068'; // 서울시립 미술아카이브
const EOULLIM_PLAZA_ID = '88a74aa9-7076-4bab-91cc-02ae67215efe'; // 서울시어울림플라자

export async function run() {
  const admin = createAdminClient();

  const { data: artMuseumData, error: artMuseumError } = await admin
    .from('open_spaces')
    .update({ category_min: '미술관', category_min_source: 'MANUAL', service_category_id: null })
    .eq('id', ART_MUSEUM_ARCHIVE_ID)
    .select('id');
  if (artMuseumError) throw new Error(`서울시립 미술아카이브 갱신 실패: ${artMuseumError.message}`);

  const { data: plazaData, error: plazaError } = await admin
    .from('open_spaces')
    .update({ service_category_id: null })
    .eq('id', EOULLIM_PLAZA_ID)
    .select('id');
  if (plazaError) throw new Error(`서울시어울림플라자 갱신 실패: ${plazaError.message}`);

  const updatedCount = artMuseumData.length + plazaData.length;
  console.log(`[RESOLVE_LEGACY_ART_EXHIBITION_REMAINING] 완료 — ${updatedCount}건 이관(대상 2건 중)`);
  return { updatedCount, targetCount: 2 };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  run()
    .then(({ updatedCount, targetCount }) => {
      console.log(`▶▶▶ [RESOLVE_LEGACY_ART_EXHIBITION_REMAINING] 종료: ${updatedCount}/${targetCount}건`);
      process.exitCode = 0;
    })
    .catch((err) => {
      console.error(`❌ [RESOLVE_LEGACY_ART_EXHIBITION_REMAINING] 실행 실패: ${err.message}`);
      process.exitCode = 1;
    });
}
