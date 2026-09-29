// [서울특별시교육청어린이도서관 3행 + 글마루한옥어린이도서관 3행 병합](2026-09-29
// 사용자 지시): "어 병합하고. 실제로 일단 대표쪽에 뱃지 추가해" — 직전 대화(batch7
// CSV 재확인)에서 발견한 두 미병합 중복을 병합하고, 그룹 멤버 전원에 흩어져 있는
// spot_curations.curation_badges를 합쳐 대표 행 하나에 반영한다.
//
// [실측 확인] 글마루한옥어린이도서관은 기존에 이미 2건짜리 그룹(aac0f845 대표 +
// d687d65f 비대표, 2026-08-19 적재)이 있었고, 이번에 새로 발견한 4895720d까지
// 합치면 3건이 된다 — mergeOneGroup()이 spotIds 전체(3건)를 다시 넘겨받아
// created_at 기준으로 대표를 재계산하므로, 기존 그룹 정보를 잃지 않고 그대로
// 흡수된다. 서울특별시교육청어린이도서관은 기존에 그룹이 전혀 없던 3개 대표
// 행(f5759c7f/4ecb04fc/fc529917)을 처음으로 그룹핑한다.
//
// [뱃지 통합, 이어서] mergeOneGroup()(2026-09-29-merge-children-library-
// duplicate-pairs.mjs, 제5장 제4조 기존 구조 재사용)은 naver_place_id/
// excluded_weekdays만 다루고 spot_curations는 건드리지 않는다 — 이 스크립트가
// 그룹 병합 이후 멤버 전원의 curation_badges 합집합을 대표 행 하나에만
// 반영한다(비대표는 화면에 노출되지 않으므로 대표에 전부 모아야 실제로 보인다).
import { pathToFileURL } from 'url';
import { loadEnv } from '../lib/load-env.mjs';
import { createAdminClient } from '../ingest/lib/supabase-admin.mjs';
import { mergeOneGroup } from './2026-09-29-merge-children-library-duplicate-pairs.mjs';

loadEnv();

const GROUPS_TO_MERGE = [
  {
    spotIds: ['f5759c7f-31d2-4e63-81f6-bf2aa86edca7', '4ecb04fc-dacb-4f90-9e73-0a1de4fe0a69', 'fc529917-5d25-4f1d-a259-63eec1efd41b'],
    standardName: '서울특별시교육청 어린이도서관',
  },
  {
    spotIds: ['4895720d-6451-4643-b9e6-56166e233c01', 'aac0f845-69b5-485a-9bf3-678fac724c5c', 'd687d65f-d98d-42a0-ade1-fd5d2ba2f82a'],
    standardName: '글마루한옥어린이도서관',
  },
];

export async function consolidateBadgesToRepresentative(admin, spotIds, representativeId) {
  const { data: curations, error } = await admin.from('spot_curations').select('spot_id, curation_badges').in('spot_id', spotIds);
  if (error) throw new Error(`spot_curations 조회 실패: ${error.message}`);

  const unionBadges = new Set();
  for (const row of curations ?? []) {
    for (const badge of row.curation_badges ?? []) unionBadges.add(badge);
  }

  const { data: existing, error: fetchError } = await admin
    .from('spot_curations')
    .select('curation_badges')
    .eq('spot_id', representativeId)
    .maybeSingle();
  if (fetchError) throw new Error(`대표 행 spot_curations 조회 실패: ${fetchError.message}`);
  for (const badge of existing?.curation_badges ?? []) unionBadges.add(badge);

  const merged = Array.from(unionBadges);
  const { error: upsertError } = await admin
    .from('spot_curations')
    .upsert({ spot_id: representativeId, curation_badges: merged }, { onConflict: 'spot_id' });
  if (upsertError) throw new Error(`대표 행 spot_curations upsert 실패: ${upsertError.message}`);

  return merged;
}

export async function run() {
  const admin = createAdminClient();
  const results = [];

  for (const group of GROUPS_TO_MERGE) {
    const { groupId, representativeId } = await mergeOneGroup(admin, group);
    const mergedBadges = await consolidateBadgesToRepresentative(admin, group.spotIds, representativeId);
    results.push({ standardName: group.standardName, groupId, representativeId, mergedBadges });
    console.log(`[MERGE_AND_CONSOLIDATE_BADGES] ${group.standardName}: group_id=${groupId}, 대표=${representativeId}, 뱃지=${JSON.stringify(mergedBadges)}`);
  }

  console.log(`[MERGE_AND_CONSOLIDATE_BADGES] 완료 — ${results.length}개 그룹 병합`);
  return results;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  run()
    .then((results) => {
      console.log(`▶▶▶ [MERGE_AND_CONSOLIDATE_BADGES] 종료: ${results.length}개 그룹`);
      process.exitCode = 0;
    })
    .catch((err) => {
      console.error(`❌ [MERGE_AND_CONSOLIDATE_BADGES] 실행 실패: ${err.message}`);
      process.exitCode = 1;
    });
}
