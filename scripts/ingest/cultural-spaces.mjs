// Source 03: 서울시 문화공간 정보 (spec/data/data_sources.md #03 대체 — 사용자 확인 서비스명)
// 주의: 응답 필드명 X_COORD/Y_COORD가 실제로는 위도/경도가 뒤바뀌어 있음을 실제 응답으로 확인함
// (X_COORD ≈ 37.x = 위도, Y_COORD ≈ 127.x = 경도). 필드명을 그대로 믿지 않고 값 범위로 검증함.
import { pathToFileURL } from 'url';
import { loadEnv } from '../lib/load-env.mjs';
import { fetchWithTimeout } from './lib/fetch-with-timeout.mjs';
import { createAdminClient, upsertRawIngestData, upsertRowsSafeMerge } from './lib/supabase-admin.mjs';
import { toPointWKT } from './lib/geometry.mjs';
import { deriveParentalTags } from './lib/ai-tagging.mjs';

const env = loadEnv();

const BASE = 'http://openapi.seoul.go.kr:8088';
const SERVICE_NAME = 'culturalSpaceInfo';
const PAGE_SIZE = 100;
// [전체 파이프라인 일괄 가동](2026-08-25): 이 스크립트는 BaseCollectorAdapter를 쓰지 않는
// 레거시 구조라(schema-mapper.mjs도 거치지 않고 행을 직접 구성) RAW 레이어/source/Safe UPSERT를
// 여기 인라인으로 추가한다. 소스 식별자는 sourceKey('CULTURE_SPACE')와 별개로 관리자 화면
// 필터용 원천 식별자(source 컬럼)다.
const SOURCE_KEY = 'CULTURE_SPACE';
const SOURCE = 'seoul_public_culture';
const TARGET_TABLE = 'open_spaces';

async function fetchPage(startIdx, endIdx) {
  const url = `${BASE}/${env.SEOUL_OPEN_DATA_KEY}/json/${SERVICE_NAME}/${startIdx}/${endIdx}/`;
  const res = await fetchWithTimeout(url);
  const text = await res.text();

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`${SERVICE_NAME} 응답이 JSON이 아닙니다: ${text.slice(0, 300)}`);
  }

  const body = json[SERVICE_NAME];
  if (body?.RESULT?.CODE !== 'INFO-000') {
    throw new Error(`${SERVICE_NAME} 오류: ${body?.RESULT?.CODE} ${body?.RESULT?.MESSAGE}`);
  }

  return { items: body.row ?? [], totalCount: body.list_total_count ?? 0 };
}

function mapToOpenSpaceRow(item) {
  // 필드명과 실제 값이 뒤바뀌어 있어 값 범위로 위도/경도를 판별한다 (한국 위도 33~39, 경도 124~132).
  const a = Number(item.X_COORD);
  const b = Number(item.Y_COORD);
  const lat = a >= 30 && a <= 40 ? a : b;
  const lng = a >= 30 && a <= 40 ? b : a;

  if (!lng || !lat || !item.FAC_NAME || !item.NUM) return null;

  // ai-rule.md 5.1: 원본 API 응답의 실제 텍스트(이용요금/운영시간/소개 등)를 근거로만 태깅한다.
  const tags = deriveParentalTags(JSON.stringify(item));

  return {
    external_id: `CULTURE_SPACE_${item.NUM}`,
    source_type: 'CULTURE_FACILITY',
    source: SOURCE,
    name: item.FAC_NAME,
    // Task 9-1-4: ai-rule.md 3.3(Decision 008) 공식 매핑표에 따라 레거시 'CULTURE' 대신
    // 5대 UI 카테고리 EXHIBITION_MUSEUM(전시·박물관)으로 직접 태깅한다.
    category: 'EXHIBITION_MUSEUM',
    address: item.ADDR || '',
    location: toPointWKT(lng, lat),
    is_free: item.ENTRFREE === '무료',
    operating_hours: item.OPENHOUR || null,
    info_url: item.HOMEPAGE || null,
    raw_data: item,
    ...tags,
  };
}

// [배치 자동화 및 로깅 체계 확정](2026-08-25): run-daily.mjs/run-monthly.mjs 배치 오케스트레이터가
// 직접 import해서 호출할 수 있도록 main()을 재사용 가능한 run() 함수로 분리하고, 반환값을
// BaseCollectorAdapter.run()과 동일한 형태({sourceKey, targetTable, source, count, upserted,
// rawCount, rawArchivedCount, safeMergeCount, errorCount})로 맞췄다 — 배치 리포트가 어댑터
// 기반이든 레거시 스크립트든 동일한 코드로 집계할 수 있게 하기 위함이다.
export async function run({ dryRun = false } = {}) {
  console.log(`▶ 서울시 문화공간 정보 수집 시작 (dry-run: ${dryRun})`);

  const client = dryRun ? null : createAdminClient();
  let startIdx = 1;
  let totalCount = Infinity;
  let totalUpserted = 0;
  let totalRawArchived = 0;
  let totalSafeMerge = 0;
  const sample = [];

  while (startIdx <= totalCount) {
    const endIdx = startIdx + PAGE_SIZE - 1;
    const { items, totalCount: tc } = await fetchPage(startIdx, endIdx);
    totalCount = tc;

    const rows = items.map(mapToOpenSpaceRow).filter(Boolean);

    if (dryRun) {
      sample.push(...rows.slice(0, 3 - sample.length));
    } else {
      if (items.length > 0) {
        const rawResult = await upsertRawIngestData(
          client,
          SOURCE_KEY,
          items.filter((item) => item.NUM).map((item) => ({ sourceId: String(item.NUM), payload: item }))
        );
        totalRawArchived += rawResult.count;
      }
      if (rows.length > 0) {
        const { count, duplicateWithinBatch = 0, mergedWithExisting = 0 } = await upsertRowsSafeMerge(
          client,
          TARGET_TABLE,
          rows
        );
        totalUpserted += count;
        totalSafeMerge += duplicateWithinBatch + mergedWithExisting;
      }
    }

    console.log(`  ${startIdx}~${endIdx}: ${items.length}건 수신 (전체 ${totalCount}건 중)`);
    startIdx += PAGE_SIZE;
  }

  const rawCount = Number.isFinite(totalCount) ? totalCount : null;

  if (dryRun) {
    console.log(JSON.stringify(sample, null, 2));
    console.log(`✅ dry-run 완료 (전체 ${totalCount}건 확인)`);
    return { sourceKey: SOURCE_KEY, targetTable: TARGET_TABLE, source: SOURCE, count: 0, upserted: false, rawCount, rawArchivedCount: undefined };
  }

  console.log(`✅ Supabase open_spaces 테이블 upsert 완료: 총 ${totalUpserted}건`);
  const errorCount = typeof rawCount === 'number' ? Math.max(0, rawCount - totalUpserted) : 0;
  return {
    sourceKey: SOURCE_KEY,
    targetTable: TARGET_TABLE,
    source: SOURCE,
    count: totalUpserted,
    upserted: true,
    rawCount,
    rawArchivedCount: totalRawArchived,
    safeMergeCount: totalSafeMerge,
    errorCount,
  };
}

// CLI 진입점 — `node scripts/ingest/cultural-spaces.mjs [--dry-run]`로 직접 실행할 때만 동작한다
// (run-daily.mjs/run-monthly.mjs가 run()을 직접 import할 때는 이 블록이 실행되지 않는다).
// Windows에서는 process.argv[1]이 백슬래시 경로("D:\...")라 import.meta.url(file:// URL,
// 슬래시)과 문자열로 직접 비교하면 항상 false가 된다(실측 확인) — pathToFileURL로 변환해 비교한다.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dryRun = process.argv.includes('--dry-run');
  run({ dryRun }).catch((err) => {
    console.error('❌', err.message);
    process.exitCode = 1;
  });
}
