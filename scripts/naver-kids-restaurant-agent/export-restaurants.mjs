// [네이버 플레이스 키즈친화 스크래핑 에이전트 1단계](todo.md 개선사항4, 2026-10-15
// 사용자 지시): "표준 중분류가 기타 >> 식당인 것에 대하여 csv파일로 추출해줘.. 제목/
// 명칭, 주소, 위도/경도 3개 컬럼 추출해서 metadata/식당.csv로" — "기타 >> 식당"의
// 실제 의미는 scripts/migrations/2026-10-15-get-open-spaces-by-category-min-rpc.sql
// 주석 참고(open_spaces.category='ETC'가 아니라 category_min='식당' 전체, 실측 1,612건).
//
// 이 에이전트의 나머지 단계(검색/매칭/크롤링/LLM 분석)는 나드리픽 앱 로직과 완전히
// 독립적으로 돌아가야 한다는 사용자 지시에 따라(todo.md 개선사항4 원문 "나드리픽
// 로직과 별도로 독립적으로 돌아갈 수 있도록") 이 디렉토리 전체가 src/ 어떤 코드도
// import하지 않는다 — DB 조회(이 1단계만)는 scripts/ingest의 기존 어댑터들과 동일하게
// service_role 직접 연결로 수행한다(이미 "독립 스크립트" 컨벤션).
import path from 'path';
import { pathToFileURL } from 'url';
import { loadEnv } from '../lib/load-env.mjs';

loadEnv();

const { createAdminClient } = await import('../ingest/lib/supabase-admin.mjs');
const { writeCsvUtf8 } = await import('./lib/csv.mjs');

const CATEGORY_MIN = '식당';
const OUTPUT_PATH = path.resolve(process.cwd(), 'metadata', '식당.csv');
const CSV_HEADER = ['명칭', '주소', '위도', '경도'];

// [PostgREST 1,000행 truncation 방어](get-nearby.ts의 getSpotsByServiceCategory와
// 동일한 이유/패턴 — 2026-09-25 실측 버그, 제5장 제4조 기존 구조 우선): RPC 호출도
// 일반 select처럼 PostgREST 기본 max-rows(1,000)에 그대로 걸린다. 실측 확인:
// 이 함수를 .range() 없이 그대로 호출하면 1,612건 중 정확히 1,000건만 조용히 잘렸다.
const PAGE_SIZE = 1000;
const SAFETY_MAX_PAGES = 50;

async function fetchAllRestaurantRows(client) {
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
  const data = await fetchAllRestaurantRows(client);

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
      console.error('❌ 식당 CSV 추출 실패:', err.message);
      process.exit(1);
    });
}
