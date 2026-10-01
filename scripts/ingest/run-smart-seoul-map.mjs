// [스마트서울맵 신규 수집 파이프라인](2026-10-01 사용자 지시): "데이터 수집
// 파이프라인 만들자.. 다만 배치 수집기는 기존꺼랑 완전 별도로하고" — 기존
// run-daily.mjs/run-monthly.mjs 소스 목록엔 등록하지 않는 독립 러너다. 사용자
// 합의 사항: "주 1회" 정도의 저빈도 재동기화면 충분하다(물리적 시설 목록이라
// 변동이 적음 — 키즈카페머니 사용처만 가맹점 변동 가능성이 있지만 전체 1,238건
// 규모라 비용 부담이 없어 그래도 한 번에 전부 돈다).
//
// [중복 처리 방침](2026-10-01 사용자 지시): "일단 키즈카페 이름으로 알수없으면
// 신규생성해주고 거기에 뱃지달아줘.. 나중에 위치기반으로 중복스팟 검수및
// 병합하면될거같아" — 이 러너는 기존 소스들과 동일하게 external_id 기반
// upsert만 수행하고, 중복 매칭/병합은 하지 않는다(이번 세션 기존 관례인 관리자
// 수동 dedup 도구에 위임). 병합 시 뱃지가 사라지지 않도록 하는 건 이미
// 존재하는 consolidateBadgesToRepresentative 패턴(2026-09-29)을 그대로 쓰면 된다.
//
// [실행 방법] node scripts/ingest/run-smart-seoul-map.mjs [--only=SOURCE_KEY] [--dry-run]
import { pathToFileURL } from 'url';
import { loadEnv } from '../lib/load-env.mjs';
import { createAdminClient } from './lib/supabase-admin.mjs';
import { applyCurationBadgeToExternalIds } from './lib/apply-curation-badge.mjs';
import { SmartSeoulKidsCafeAdapter } from './adapters/smart-seoul-kids-cafe-adapter.mjs';
import { SmartSeoulKidsCafeVoucherAdapter } from './adapters/smart-seoul-kids-cafe-voucher-adapter.mjs';
import { SmartSeoulCampingAdapter } from './adapters/smart-seoul-camping-adapter.mjs';
import { SmartSeoulOkZoneAdapter } from './adapters/smart-seoul-ok-zone-adapter.mjs';
import { SmartSeoulToddlerForestAdapter } from './adapters/smart-seoul-toddler-forest-adapter.mjs';

loadEnv();

// 지연 생성 팩토리로 둔다 — SMART_SEOUL_MAP_THEME_API_KEY 환경변수 검증(생성자
// 내부)이 import 시점이 아니라 실제 실행 시점에 일어나게 해서, --only로 특정
// 소스만 돌릴 때도 나머지 어댑터의 생성자가 먼저 평가돼 불필요하게 실패하지 않는다.
export const SMART_SEOUL_MAP_ADAPTER_FACTORIES = [
  () => new SmartSeoulKidsCafeAdapter(),
  () => new SmartSeoulKidsCafeVoucherAdapter(),
  () => new SmartSeoulCampingAdapter(),
  () => new SmartSeoulOkZoneAdapter(),
  () => new SmartSeoulToddlerForestAdapter(),
];

export async function run({ only, dryRun = false } = {}) {
  const admin = createAdminClient();
  const results = [];

  for (const createAdapter of SMART_SEOUL_MAP_ADAPTER_FACTORIES) {
    const adapter = createAdapter();
    if (only && adapter.sourceKey !== only) continue;

    // eslint-disable-next-line no-await-in-loop
    const result = await adapter.run({ dryRun });

    let taggedCount = 0;
    if (!dryRun && adapter.badgeKey && adapter.lastExternalIds.length > 0) {
      // eslint-disable-next-line no-await-in-loop
      ({ taggedCount } = await applyCurationBadgeToExternalIds(admin, adapter.lastExternalIds, adapter.badgeKey));
      console.log(`  🏷️  [${adapter.sourceKey}] "${adapter.badgeKey}" 뱃지 ${taggedCount}건 부여`);
    }

    results.push({ sourceKey: adapter.sourceKey, ...result, taggedCount });
  }

  return results;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const onlyArg = process.argv.find((arg) => arg.startsWith('--only='));
  const only = onlyArg?.slice('--only='.length);
  const dryRun = process.argv.includes('--dry-run');

  run({ only, dryRun })
    .then((results) => {
      console.log('\n📊 스마트서울맵 수집 결과');
      for (const r of results) {
        console.log(`  [${r.sourceKey}] ${r.count}건 수집, 뱃지 ${r.taggedCount}건`);
      }
      process.exitCode = 0;
    })
    .catch((err) => {
      console.error(`❌ 스마트서울맵 수집 실행 실패: ${err.message}`);
      process.exitCode = 1;
    });
}
