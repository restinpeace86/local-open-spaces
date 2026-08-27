// [상세보기 설명 누락 수정](2026-08-27): SEOUL_YEYAK(source='seoul_public_reservation')은
// 이 세션 초반 본문 백필(backfill-contents.mjs) 대상에서 빠져 description이 전량 NULL이었다
// (실측 확인: is_active=true 2,760건 전부 NULL). 이 소스는 raw_data가 이미 전량 보존돼 있어
// (Decision 017) 외부 API 재호출 없이 raw_data.DTLCONT에서 바로 채울 수 있다 —
// scripts/ingest/lib/seoul-yeyak-description.mjs의 추출 로직을 그대로 재사용한다(수집
// 시점 로직과 백필 로직이 어긋나지 않도록 동일 함수 공유).
//
// Safe Merge 원칙: description이 이미 채워진 행은 건드리지 않는다(`.is('description', null)`
// 가드) — category_maj/category_min/target_audience 등 다른 컬럼은 이 스크립트가 전혀
// 다루지 않으므로 구조적으로 유실될 수 없다.
import { pathToFileURL } from 'url';
import { loadEnv } from '../lib/load-env.mjs';
import { createAdminClient } from './lib/supabase-admin.mjs';
import { extractYeyakDescription } from './lib/seoul-yeyak-description.mjs';

loadEnv();

const SOURCE = 'seoul_public_reservation';
const PAGE_SIZE = 500;

export async function backfillSeoulYeyakDescription({ dryRun = false } = {}) {
  const client = createAdminClient();

  if (dryRun) {
    const { count } = await client
      .from('events')
      .select('*', { count: 'exact', head: true })
      .eq('source', SOURCE)
      .is('description', null);
    return { pendingCount: count };
  }

  let lastId = null;
  let scanned = 0;
  let filled = 0;
  let noDtlcont = 0;

  for (;;) {
    let query = client
      .from('events')
      .select('id, raw_data')
      .eq('source', SOURCE)
      .is('description', null)
      .order('id', { ascending: true })
      .limit(PAGE_SIZE);
    if (lastId) query = query.gt('id', lastId);

    const { data, error } = await query;
    if (error) throw new Error(`events(${SOURCE}) 스캔 실패: ${error.message}`);
    if (!data || data.length === 0) break;

    scanned += data.length;

    for (const row of data) {
      const description = extractYeyakDescription(row.raw_data?.DTLCONT);
      if (!description) {
        noDtlcont += 1;
        continue;
      }
      const { error: updateError } = await client
        .from('events')
        .update({ description })
        .eq('id', row.id)
        .is('description', null);
      if (updateError) throw new Error(`events(${row.id}) 업데이트 실패: ${updateError.message}`);
      filled += 1;
    }

    lastId = data[data.length - 1].id;
    if (data.length < PAGE_SIZE) break;
  }

  return { scanned, filled, noDtlcont };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dryRun = process.argv.includes('--dry-run');
  backfillSeoulYeyakDescription({ dryRun })
    .then((result) => {
      console.log(dryRun ? 'dry-run: 실제 UPDATE 없이 대상 건수만 집계합니다.' : '실제 UPDATE 완료.');
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((err) => {
      console.error('❌', err.message);
      process.exitCode = 1;
    });
}
