// [유아숲체험원 네이버 플레이스 매칭용 CSV 추출](2026-10-16 사용자 지시): "자연/공원 >
// 유아숲체험원에 대하여 이전에 식당들에 대하여 csv파일로 추출한것처럼 추출해줘.. 이것들도
// 식당과 마찬가지로 네이버 플레이스 id 추출해봐." export-restaurants.mjs와 완전히 동일한
// 패턴(이 디렉토리의 다른 export-*.mjs 스크립트들처럼 카테고리별로 작은 전용 스크립트를
// 하나씩 두는 이 프로젝트의 기존 관례 — scripts/export-museum-name-address.mjs 등과
// 동일, 제5장 제4조)을 category_min='유아숲체험원'에 그대로 재사용한다. 네이버 검색/
// 매칭(search-and-match.mjs)과 속성추출(scrape-kids-attributes.mjs)은 이미 임의의
// csv 경로를 받을 수 있게 일반화돼 있어(2026-10-16) 새 스크립트가 필요 없다 — 이
// 디렉토리 이름이 "restaurant-agent"지만 실제 매칭 로직(이름+주소로 네이버 플레이스
// 검색/검증)은 식당에 한정된 게 전혀 없어 그대로 재사용 가능하다.
import path from 'path';
import { pathToFileURL } from 'url';
import { loadEnv } from '../lib/load-env.mjs';

loadEnv();

const { createAdminClient } = await import('../ingest/lib/supabase-admin.mjs');
const { writeCsvUtf8 } = await import('./lib/csv.mjs');

const CATEGORY_MIN = '유아숲체험원';
const OUTPUT_PATH = path.resolve(process.cwd(), 'metadata', '유아숲체험원.csv');
const CSV_HEADER = ['명칭', '주소', '위도', '경도'];

// [PostgREST 1,000행 truncation 방어](export-restaurants.mjs와 동일한 이유 —
// 374건이라 이번엔 1,000 미만이지만, 카테고리가 더 커질 가능성에 대비해 동일하게
// 페이지네이션한다).
const PAGE_SIZE = 1000;
const SAFETY_MAX_PAGES = 50;

async function fetchAllRows(client) {
  const allRows = [];
  for (let page = 0; page < SAFETY_MAX_PAGES; page++) {
    const from = page * PAGE_SIZE;
    const { data, error } = await client
      .rpc('get_open_spaces_by_category_min', { p_category_min: CATEGORY_MIN })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`get_open_spaces_by_category_min 호출 실패: ${error.message}`);

    const rows = data ?? [];
    allRows.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return allRows;
}

export async function run({ outputPath = OUTPUT_PATH } = {}) {
  const client = createAdminClient();
  const data = await fetchAllRows(client);

  const rows = data.map((row) => ({
    명칭: row.name ?? '',
    주소: row.address ?? '',
    위도: row.lat ?? '',
    경도: row.lng ?? '',
  }));

  writeCsvUtf8(outputPath, CSV_HEADER, rows);
  return { count: rows.length, outputPath };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  run()
    .then(({ count, outputPath }) => {
      console.log(`✅ ${count}건을 ${outputPath}에 저장했습니다.`);
    })
    .catch((err) => {
      console.error('❌ 유아숲체험원 CSV 추출 실패:', err.message);
      process.exit(1);
    });
}
