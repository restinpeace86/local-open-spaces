// [API 데이터 중복 표시 수정](2026-08-28): 사용자 제보 — "API 데이터에 타이틀이 거의
// 똑같은 것들이 중복해서 있다". 실측 확인 결과 근본 원인은 2026-08-27
// backfill-legacy-seoul-reservation-raw-data.mjs가 이미 문서화한 그대로다:
//
// Decision 017 재작성 이전 구버전 어댑터가 만든 SEOUL_RESERVATION_* 행(전체 2,544건, 이
// external_id 접두는 현재 어댑터가 더 이상 만들지 않는 폐기된 스킴이다)이, 신버전
// 어댑터(seoul-yeyak-adapter.mjs)가 쓰는 SEOUL_YEYAK_* 행과 물리적 upsert 충돌을 피하려고
// external_id를 바꾸지 않은 채 그대로 남아있다. 그 결과 같은 실제 행사(raw_data.SVCID가
// 완전히 동일)가 구버전(venue_name/sigungu_name이 채워진 적 없음 — 신버전 이후로는 갱신
// 대상이 아니므로)과 신버전(정상적으로 채워짐) 두 행으로 동시에 is_active=true라, 사용자
// 화면에 완전히 같은 제목의 카드가 두 번 나타난다.
//
// 실측 확인(2026-08-28): is_active=true인 SEOUL_RESERVATION_* 1,677건 중 708건은 대응하는
// 활성 SEOUL_YEYAK_* 행이 실제로 존재한다(진짜 중복). 나머지 958건은 대응하는 활성
// SEOUL_YEYAK_* 행이 없다 — 라이브 피드에서 이미 사라졌거나 다른 사유로 신버전에 없는
// 것일 수 있어(추측 금지) 이 958건은 절대 손대지 않는다.
//
// 조치: 대응 행이 확인된 708건만 is_active=false로 전환한다(삭제 아님 — 되돌릴 수 있다).
// SEOUL_YEYAK_* 쪽 행은 이 스크립트가 전혀 건드리지 않는다.
import { pathToFileURL } from 'url';
import { loadEnv } from '../lib/load-env.mjs';
import { createAdminClient } from '../ingest/lib/supabase-admin.mjs';

loadEnv();

const LEGACY_PREFIX = 'SEOUL_RESERVATION_';
const PAGE_SIZE = 1000;

export async function deactivateDuplicateSeoulReservationLegacy({ dryRun = false } = {}, client = createAdminClient()) {
  const legacyRows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await client
      .from('events')
      .select('id, raw_data')
      .like('external_id', `${LEGACY_PREFIX}%`)
      .eq('is_active', true)
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`legacy 행 조회 실패: ${error.message}`);
    legacyRows.push(...data);
    if (data.length < PAGE_SIZE) break;
  }

  // N+1 방지: 활성 SEOUL_YEYAK_* external_id를 한 번에 모두 가져와 Set으로 대조한다(행마다
  // 개별 조회하지 않음 — legacy 행이 1,000건대라 N+1이면 수 분씩 걸린다).
  const activeYeyakExternalIds = new Set();
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await client
      .from('events')
      .select('external_id')
      .like('external_id', 'SEOUL_YEYAK_%')
      .eq('is_active', true)
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`SEOUL_YEYAK_* 조회 실패: ${error.message}`);
    for (const row of data) activeYeyakExternalIds.add(row.external_id);
    if (data.length < PAGE_SIZE) break;
  }

  let scanned = 0;
  let noSvcid = 0;
  let noActiveMatch = 0;
  const toDeactivate = [];

  for (const row of legacyRows) {
    scanned += 1;
    const svcid = row.raw_data?.SVCID;
    if (!svcid) {
      noSvcid += 1;
      continue;
    }
    if (!activeYeyakExternalIds.has(`SEOUL_YEYAK_${svcid}`)) {
      noActiveMatch += 1;
      continue;
    }
    toDeactivate.push(row.id);
  }

  if (dryRun) {
    return { scanned, toDeactivateCount: toDeactivate.length, noSvcid, noActiveMatch };
  }

  let deactivated = 0;
  const UPDATE_BATCH_SIZE = 200;
  for (let i = 0; i < toDeactivate.length; i += UPDATE_BATCH_SIZE) {
    const batch = toDeactivate.slice(i, i + UPDATE_BATCH_SIZE);
    const { data, error } = await client
      .from('events')
      .update({ is_active: false })
      .in('id', batch)
      .eq('is_active', true)
      .select('id');
    if (error) throw new Error(`비활성화 실패: ${error.message}`);
    deactivated += (data ?? []).length;
  }

  return { scanned, deactivated, noSvcid, noActiveMatch };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dryRun = process.argv.includes('--dry-run');
  deactivateDuplicateSeoulReservationLegacy({ dryRun })
    .then((result) => {
      console.log(dryRun ? 'dry-run: 실제 UPDATE 없이 대상 건수만 집계합니다.' : '실제 UPDATE 완료.');
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((err) => {
      console.error('❌', err.message);
      process.exitCode = 1;
    });
}
