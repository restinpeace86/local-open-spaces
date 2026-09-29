// [문화시설 표준중분류별 명칭·주소 CSV 내보내기](2026-09-29 사용자 지시, todo.md
// 개선사항2): "Supabase DB의 open_spaces 테이블에서 특정 표준중분류 필터링을
// 거쳐, 각 카테고리별로 명칭(제목)과 주소 컬럼만 추출하여 개별 CSV 파일로
// 저장." 대상: 과학관/역사박물관/종합·기타박물관 3개 표준중분류(category_min —
// 요청 원문의 category_sub는 실제 스키마 컬럼명이 아니다, 이 프로젝트의 실제
// 컬럼명 category_min을 그대로 쓴다, 제5장 제4조 기존 구조 우선).
//
// [실행 방법]
//   node scripts/export-museum-name-address.mjs
// 별도 패키지 설치 없이 이 프로젝트에 이미 있는 @supabase/supabase-js와
// scripts/lib/load-env.mjs(.env.local 로더)만 쓴다.
//
// [중복 스팟 대표만 추출] group_id가 있는 중복 그룹은 대표 행만 뽑는다(원본
// 멤버 행까지 그대로 내보내면 같은 실제 장소가 여러 줄로 중복돼 명칭 목록의
// 의미가 없어진다) — 관리자 화면 목록 API(data-grid/route.ts)와 동일한
// "group_id.is.null,is_dedup_representative.eq.true" 필터를 재사용한다.
//
// [제외 조건 — 사설 교육기관](사용자 지시 원문): "정규 기수제 수강료를 내고
// 다니는 학원형/멤버십형 민간 시설(예: 어린이천문대 등 사설 교육기관)은
// is_target: false로 제외." 실측 확인 결과 '과학관' 표준중분류 안에
// "세종어린이천문대", "분당 어린이천문대", "파주어린이천문대", "안산 어린이
// 천문대" 등 이름이 "OO어린이천문대"(공백 유무 무관) 패턴인 시설이 실제로
// 여러 건 있다 — 이는 사용자가 제시한 예시와 정확히 일치하는, 실제 데이터로
// 확인 가능한 유일한 패턴이다. 그 밖의 "학원형/멤버십형 민간 시설"은 구조화된
// DB 필드(예: is_free)만으로는 유료 박물관(예: 국립대구과학관)과 신뢰성 있게
// 구분할 근거가 없어(제3장 제5조 추측 금지) 추가로 추측해 제외하지 않는다 —
// 이 이름 패턴에 걸리는 행만 제외하고, 실행 로그에 어떤 행이 왜 제외됐는지
// 전부 남긴다(관리자가 직접 검증할 수 있도록).
import { pathToFileURL } from 'url';
import { loadEnv } from './lib/load-env.mjs';
import { createAdminClient } from './ingest/lib/supabase-admin.mjs';
import fs from 'fs';

loadEnv();

const TARGET_CATEGORIES = [
  { categoryMin: '과학관', filename: '과학관.csv' },
  { categoryMin: '역사박물관', filename: '역사박물관.csv' },
  { categoryMin: '종합/기타박물관', filename: '종합기타박물관.csv' },
];

// [확장 가능한 제외 이름 패턴] 새로운 사설 교육기관 패턴이 실측으로 확인되면
// 이 배열에만 추가하면 된다.
const EXCLUDED_NAME_PATTERNS = [/어린이\s*천문대/];

function isExcluded(name) {
  return EXCLUDED_NAME_PATTERNS.some((pattern) => pattern.test(name));
}

// CSV 필드에 쉼표/줄바꿈/쌍따옴표가 있으면 쌍따옴표로 감싸고 내부 쌍따옴표는
// 두 번 반복해 이스케이프한다(RFC 4180).
function csvField(value) {
  const text = value ?? '';
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

const PAGE_SIZE = 1000; // Supabase 기본 조회 상한 — 종합/기타박물관(1,388건)은 여러 페이지로 나눠 받는다.

async function fetchAllRows(admin, categoryMin) {
  const rows = [];
  let from = 0;
  for (;;) {
    const { data, error } = await admin
      .from('open_spaces')
      .select('id, name, display_name, address')
      .eq('category_min', categoryMin)
      .or('group_id.is.null,is_dedup_representative.eq.true')
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`${categoryMin} 조회 실패: ${error.message}`);
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

export async function run() {
  const admin = createAdminClient();
  const summary = [];

  for (const { categoryMin, filename } of TARGET_CATEGORIES) {
    const rows = await fetchAllRows(admin, categoryMin);

    const included = [];
    const excluded = [];
    for (const row of rows) {
      const name = row.display_name ?? row.name ?? '';
      if (isExcluded(name)) {
        excluded.push(name);
      } else {
        included.push({ name, address: row.address ?? '' });
      }
    }

    const csvLines = ['명칭,주소', ...included.map((r) => `${csvField(r.name)},${csvField(r.address)}`)];
    fs.writeFileSync(filename, csvLines.join('\n') + '\n', 'utf8');

    console.log(`[EXPORT_MUSEUM_CSV] ${categoryMin} → ${filename}: ${included.length}건 저장, ${excluded.length}건 제외`);
    for (const name of excluded) console.log(`  - 제외: ${name}`);

    summary.push({ categoryMin, filename, includedCount: included.length, excludedCount: excluded.length });
  }

  console.log('[EXPORT_MUSEUM_CSV] 완료');
  return summary;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch((err) => {
    console.error(`❌ [EXPORT_MUSEUM_CSV] 실행 실패: ${err.message}`);
    process.exitCode = 1;
  });
}
