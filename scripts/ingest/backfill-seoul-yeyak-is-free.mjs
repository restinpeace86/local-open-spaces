// [개선사항4 - 무료/유료 분류 데이터 점검](2026-09-04 사용자 지시): "무료인데 유료로
// 표기되거나, 반대로 유료인데 무료로 잘못 분류된 케이스가 없는지 점검·보완" — 실측으로
// 확인한 결과 SEOUL_YEYAK(source='seoul_public_reservation') 소스에서 943건(그중
// is_active=true 186건)이 raw_data.PAYATNM(원본 요금 상태 필드)이 정확히 '무료'인데도
// events.is_free가 true가 아니었다(false 또는 null). seoul-yeyak-adapter.mjs의 현재
// 로직(`isFree: item.PAYATNM === '무료'`)은 올바르다 — 이 불일치는 그 로직이 추가/수정되기
// 이전에 이미 적재됐던 행들이 이후 재수집 대상에서 빠져(특히 예약이 이미 마감된 과거
// 행사는 재수집 API 응답에 더 이상 나타나지 않아 upsert로 갱신될 기회가 없음) 남은
// 잔존 데이터로 판단된다. 반대 방향(PAYATNM이 '무료'가 아닌데 is_free=true)은 실측
// 결과 0건이라 이 방향만 교정한다 — 정보가 없는 행(PAYATNM 자체가 없음)은 손대지
// 않는다(추측 금지, 실제로 '무료'라고 확인된 근거가 있는 행만 고친다).
//
// backfill-seoul-yeyak-description.mjs와 동일한 패턴(id 커서 페이지네이션, dry-run,
// Safe Merge — 이미 is_free=true인 행은 건드리지 않음)을 그대로 따른다.
import { pathToFileURL } from 'url';
import { loadEnv } from '../lib/load-env.mjs';
import { createAdminClient } from './lib/supabase-admin.mjs';

loadEnv();

const SOURCE = 'seoul_public_reservation';
// [실측 확인] raw_data(JSONB, 원본 페이로드 전체)를 select하면서 500건씩 읽으면
// statement timeout에 걸렸다(description 백필 스크립트와 동일한 500건 단위 패턴인데도
// 실제로 타임아웃 재현됨) — 페이지 크기를 줄여 안전하게 통과시킨다.
const PAGE_SIZE = 100;

export async function backfillSeoulYeyakIsFree({ dryRun = false } = {}) {
  const client = createAdminClient();

  if (dryRun) {
    const { count } = await client
      .from('events')
      .select('*', { count: 'exact', head: true })
      .eq('source', SOURCE)
      .not('is_free', 'is', true);
    return { candidateCount: count };
  }

  let lastId = null;
  let scanned = 0;
  let fixed = 0;
  let skippedNotFree = 0;

  for (;;) {
    let query = client
      .from('events')
      .select('id, raw_data, is_free')
      .eq('source', SOURCE)
      .not('is_free', 'is', true)
      .order('id', { ascending: true })
      .limit(PAGE_SIZE);
    if (lastId) query = query.gt('id', lastId);

    // eslint-disable-next-line no-await-in-loop
    const { data, error } = await query;
    if (error) throw new Error(`events(${SOURCE}) 스캔 실패: ${error.message}`);
    if (!data || data.length === 0) break;

    scanned += data.length;

    for (const row of data) {
      const payatnm = row.raw_data?.PAYATNM;
      if (payatnm !== '무료') {
        skippedNotFree += 1;
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      const { error: updateError } = await client
        .from('events')
        .update({ is_free: true })
        .eq('id', row.id)
        .not('is_free', 'is', true); // Safe Merge: 그 사이 다른 프로세스가 이미 true로 고쳤으면 재확인 없이 덮어쓰지 않음
      if (updateError) throw new Error(`events(${row.id}) 업데이트 실패: ${updateError.message}`);
      fixed += 1;
    }

    lastId = data[data.length - 1].id;
    if (data.length < PAGE_SIZE) break;
  }

  return { scanned, fixed, skippedNotFree };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dryRun = process.argv.includes('--dry-run');
  backfillSeoulYeyakIsFree({ dryRun })
    .then((result) => {
      console.log(dryRun ? 'dry-run: 실제 UPDATE 없이 대상 건수만 집계합니다.' : '실제 UPDATE 완료.');
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((err) => {
      console.error('❌', err.message);
      process.exitCode = 1;
    });
}
