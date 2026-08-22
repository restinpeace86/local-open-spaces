// Task 9-2-1(2026-08-22): open_spaces에 좌표(location)는 있으나 sigungu_name이 NULL인
// 레코드를 브이월드 역지오코딩(좌표→주소)으로 백필한다.
// 2026-08-22-backfill-open-spaces-sigungu-name.sql이 주소 "텍스트"를 정규식으로 파싱하는
// 방식이라 원본 주소 문자열 자체에 구(區)가 누락된 경우(예: "인천광역시 도요지로 54")는
// 채우지 못했다 — 이런 레코드는 이미 저장된 좌표를 VWorld에 역질의해 실제 행정구역을
// 복원한다(추측 좌표 생성이 아니라 이미 확정된 좌표를 재질의하는 것뿐임).
// 세종/제주 등 정말로 시군구 단위가 없는 주소는 VWorld도 동일하게 NULL을 반환하므로
// 그대로 NULL 유지(정답이 없는데 억지로 채우지 않음).
import { loadEnv } from '../lib/load-env.mjs';
import { createAdminClient } from '../ingest/lib/supabase-admin.mjs';
import { reverseGeocodeSigunguAddress, hasVworldApiKey } from '../ingest/adapters/lib/vworld-geocoder.mjs';
import { extractSigunguName } from '../ingest/adapters/lib/schema-mapper.mjs';

loadEnv();

if (!hasVworldApiKey()) {
  console.error('❌ VWORLD_API_KEY 환경변수가 설정되지 않았습니다.');
  process.exit(1);
}

const dryRun = process.argv.includes('--dry-run');
const PAGE_SIZE = 500;
// Task 9-2-1(2026-08-22) 실측: CONCURRENCY=5로 1500여 건을 연속 호출하니 VWorld가 도중에
// 키 자체를 일시 차단(INVALID_KEY 오응답 — 이후 다른 요청도 전부 실패)했다. 공공 API의
// 초당 호출량 제한을 넘기지 않도록 동시성을 낮추고 매 요청 사이 지연을 둔다.
const CONCURRENCY = 1;
const REQUEST_DELAY_MS = 300;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function updateOne(client, row, sigunguName) {
  const { error } = await client
    .from('open_spaces')
    .update({ sigungu_name: sigunguName })
    .eq('external_id', row.external_id);

  if (error) throw new Error(`${row.external_id} 업데이트 실패: ${error.message}`);
}

async function processRow(client, row) {
  const coordinates = row.location?.coordinates;
  if (!coordinates || coordinates.length !== 2) return null;
  const [lng, lat] = coordinates;

  const address = await reverseGeocodeSigunguAddress(lng, lat);
  if (!address) return null;

  const sigunguName = extractSigunguName(address);
  if (!sigunguName) return null;

  if (!dryRun) await updateOne(client, row, sigunguName);
  return sigunguName;
}

async function main() {
  const client = createAdminClient();
  let from = 0;
  let totalScanned = 0;
  let totalFilled = 0;

  while (true) {
    const { data, error } = await client
      .from('open_spaces')
      .select('external_id, location')
      .is('sigungu_name', null)
      .not('location', 'is', null)
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(`open_spaces 조회 실패: ${error.message}`);
    if (data.length === 0) break;

    totalScanned += data.length;

    for (let i = 0; i < data.length; i += CONCURRENCY) {
      const batch = data.slice(i, i + CONCURRENCY);
      const results = await Promise.all(
        batch.map(async (row) => {
          try {
            return await processRow(client, row);
          } catch (err) {
            console.warn(`⚠️ ${row.external_id} 역지오코딩 실패: ${err.message}`);
            return null;
          }
        })
      );
      totalFilled += results.filter(Boolean).length;
      await sleep(REQUEST_DELAY_MS);
    }

    console.log(`  ${from}~${from + data.length - 1} 스캔 완료 (누적 채움 ${totalFilled}건)`);
    from += PAGE_SIZE;
    if (data.length < PAGE_SIZE) break;
  }

  console.log(
    `✅ sigungu_name 브이월드 백필 완료: 전체 스캔 ${totalScanned}건 / 채움 ${totalFilled}건${dryRun ? ' (dry-run, 실제 반영 안 됨)' : ''}`
  );
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exitCode = 1;
});
