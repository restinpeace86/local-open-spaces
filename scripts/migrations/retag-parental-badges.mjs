// implementation/todo.md 3절: TourAPI 4.0 신규 소스(KOR_TOUR_API_V4/GO_CAMPING) 도입 시
// deriveParentalTags()가 어댑터 transform()에 연결되지 않아 has_parking/stroller_accessible/
// is_kids_friendly가 전량 기본값(false)으로 적재된 것을 사후 보정하는 1회성 마이그레이션.
// 추가 API 호출 없이 이미 DB에 적재된 raw_data 텍스트만 재파싱한다(기존 어댑터 코드는 변경하지 않음
// — 2026-08-21 세션 스킵 로그의 "어댑터 로직 변경 별도 승인 필요" 홀드와 무관한 독립 스크립트).
import { loadEnv } from '../lib/load-env.mjs';
import { createAdminClient } from '../ingest/lib/supabase-admin.mjs';
import { deriveParentalTags } from '../ingest/lib/ai-tagging.mjs';

loadEnv();

const dryRun = process.argv.includes('--dry-run');
const PAGE_SIZE = 1000;
const CONCURRENCY = 20;
// 대상은 신규 4개 TourAPI 4.0 어댑터가 적재한 소스로 한정한다(기존 PARK_API/CULTURE_FACILITY는
// city-parks.mjs/cultural-spaces.mjs가 수집 시점에 이미 deriveParentalTags를 적용해 대상이 아님).
const TARGET_SOURCE_TYPES = ['KOR_TOUR_API_V4', 'GO_CAMPING'];

async function updateOne(client, row, tags) {
  const { error } = await client
    .from('open_spaces')
    .update({
      has_parking: tags.has_parking,
      stroller_accessible: tags.stroller_accessible,
      is_kids_friendly: tags.is_kids_friendly,
    })
    .eq('external_id', row.external_id);

  if (error) throw new Error(`${row.external_id} 업데이트 실패: ${error.message}`);
}

async function main() {
  const client = createAdminClient();
  let from = 0;
  let totalScanned = 0;
  let totalChanged = 0;

  while (true) {
    const { data, error } = await client
      .from('open_spaces')
      .select('external_id, raw_data, has_parking, stroller_accessible, is_kids_friendly')
      .in('source_type', TARGET_SOURCE_TYPES)
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(`open_spaces 조회 실패: ${error.message}`);
    if (data.length === 0) break;

    totalScanned += data.length;

    const toUpdate = data
      .map((row) => {
        const tags = deriveParentalTags(JSON.stringify(row.raw_data));
        const changed =
          tags.has_parking !== row.has_parking ||
          tags.stroller_accessible !== row.stroller_accessible ||
          tags.is_kids_friendly !== row.is_kids_friendly;
        return changed ? { row, tags } : null;
      })
      .filter(Boolean);

    if (!dryRun) {
      for (let i = 0; i < toUpdate.length; i += CONCURRENCY) {
        const batch = toUpdate.slice(i, i + CONCURRENCY);
        await Promise.all(batch.map(({ row, tags }) => updateOne(client, row, tags)));
      }
    }
    totalChanged += toUpdate.length;

    console.log(
      `  ${from}~${from + data.length - 1} 스캔 (변경 대상 ${toUpdate.length}건)${dryRun ? ' [dry-run]' : ''}`
    );
    from += PAGE_SIZE;
    if (data.length < PAGE_SIZE) break;
  }

  console.log(
    `✅ 재태깅 완료: 전체 스캔 ${totalScanned}건 / 변경 ${totalChanged}건${dryRun ? ' (dry-run, 실제 반영 안 됨)' : ''}`
  );
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exitCode = 1;
});
