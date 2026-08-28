// [open_spaces 세부 중분류 매핑](2026-08-28): docs/open-spaces-detailed-category-mapping-
// dryrun-report.md에서 시뮬레이션 검증을 마친 키워드 규칙을 실제 category_rules 테이블에
// 반영한다. 기존 49종 시드(2026-08-26-category-rules-engine.sql)와 마찬가지로 순서 =
// 매칭 우선순위(먼저 삽입된 규칙이 먼저 평가됨) — 배열 순서를 그대로 유지해야 한다
// (예: "지질박물관"이 "과학관"으로 먼저 걸려야 "종합/기타박물관"으로 잘못 빠지지 않음).
//
// 이미 존재하는 category_min(공연장/전시실/캠핑장)에는 키워드만 추가한다 — 새 category_min
// 값을 만들지 않는다(기존 구조 우선). 나머지 14종은 신규 category_min이다.
import { pathToFileURL } from 'url';
import { loadEnv } from '../lib/load-env.mjs';
import { createAdminClient } from '../ingest/lib/supabase-admin.mjs';

loadEnv();

// { category_min, keyword, is_exclude }[] — target_table은 전부 'open_spaces'.
export const NEW_RULES = [
  // 기존 카테고리 키워드 보강(신규 category_min 아님)
  { category_min: '캠핑장', keyword: '글램핑', is_exclude: false },
  { category_min: '전시실', keyword: '전시장', is_exclude: false },
  { category_min: '전시실', keyword: '전시홀', is_exclude: false },
  { category_min: '공연장', keyword: '씨어터', is_exclude: false },
  { category_min: '공연장', keyword: '극장', is_exclude: false },
  { category_min: '공연장', keyword: '공연예술센터', is_exclude: false },

  // 신규 세부 중분류(우선순위 = 배열 순서)
  { category_min: '도서관', keyword: '도서관', is_exclude: false },
  { category_min: '도서관', keyword: '독서실', is_exclude: true },
  { category_min: '미술관', keyword: '미술관', is_exclude: false },
  { category_min: '미술관', keyword: '아트뮤지엄', is_exclude: false },
  { category_min: '미술관', keyword: '화랑', is_exclude: false },
  { category_min: '미술관', keyword: '갤러리', is_exclude: false },
  { category_min: '과학관', keyword: '과학관', is_exclude: false },
  { category_min: '과학관', keyword: '천문대', is_exclude: false },
  { category_min: '과학관', keyword: '플라네타리움', is_exclude: false },
  { category_min: '과학관', keyword: '지질박물관', is_exclude: false },
  { category_min: '과학관', keyword: '자연사박물관', is_exclude: false },
  { category_min: '역사박물관', keyword: '역사박물관', is_exclude: false },
  { category_min: '역사박물관', keyword: '민속박물관', is_exclude: false },
  { category_min: '역사박물관', keyword: '기념관', is_exclude: false },
  { category_min: '역사박물관', keyword: '전쟁기념관', is_exclude: false },
  { category_min: '역사박물관', keyword: '독립기념관', is_exclude: false },
  { category_min: '종합/기타박물관', keyword: '박물관', is_exclude: false },
  { category_min: '종합/기타박물관', keyword: '뮤지엄', is_exclude: false },
  { category_min: '문화원', keyword: '문화원', is_exclude: false },
  { category_min: '문화의집', keyword: '문화의집', is_exclude: false },
  { category_min: '문화의집', keyword: '문화의 집', is_exclude: false },
  { category_min: '문화의집', keyword: '생활문화센터', is_exclude: false },
  { category_min: '문화의집', keyword: '주민문화센터', is_exclude: false },
  { category_min: '시민교육센터', keyword: '평생학습관', is_exclude: false },
  { category_min: '시민교육센터', keyword: '평생교육원', is_exclude: false },
  { category_min: '시민교육센터', keyword: '시민대학', is_exclude: false },
  { category_min: '시민교육센터', keyword: '인재개발원', is_exclude: false },
  { category_min: '시민교육센터', keyword: '50플러스', is_exclude: false },
  { category_min: '체험학습장', keyword: '체험학습장', is_exclude: false },
  { category_min: '체험학습장', keyword: '농촌체험', is_exclude: false },
  { category_min: '체험학습장', keyword: '농어촌체험', is_exclude: false },
  { category_min: '체험학습장', keyword: '팜스테이', is_exclude: false },
  { category_min: '체험학습장', keyword: '관광농원', is_exclude: false },
  { category_min: '체험학습장', keyword: '체험농장', is_exclude: false },
  { category_min: '역사유적지', keyword: '유적지', is_exclude: false },
  { category_min: '역사유적지', keyword: '고궁', is_exclude: false },
  { category_min: '역사유적지', keyword: '궁궐', is_exclude: false },
  { category_min: '역사유적지', keyword: '서원', is_exclude: false },
  { category_min: '역사유적지', keyword: '향교', is_exclude: false },
  { category_min: '역사유적지', keyword: '산성', is_exclude: false },
  { category_min: '역사유적지', keyword: '읍성', is_exclude: false },
  { category_min: '역사유적지', keyword: '사지', is_exclude: false },
  { category_min: '관광명소', keyword: '관광명소', is_exclude: false },
  { category_min: '관광명소', keyword: '테마파크', is_exclude: false },
  { category_min: '관광명소', keyword: '전망대', is_exclude: false },
  { category_min: '관광명소', keyword: '랜드마크', is_exclude: false },
  { category_min: '생태공원', keyword: '생태공원', is_exclude: false },
  { category_min: '생태공원', keyword: '습지', is_exclude: false },
  { category_min: '생태공원', keyword: '철새도래지', is_exclude: false },
  { category_min: '생태공원', keyword: '자연생태', is_exclude: false },
  { category_min: '수목원', keyword: '수목원', is_exclude: false },
  { category_min: '수목원', keyword: '식물원', is_exclude: false },
  { category_min: '자연휴양림', keyword: '자연휴양림', is_exclude: false },
  { category_min: '자연휴양림', keyword: '휴양림', is_exclude: false },
  { category_min: '자연휴양림', keyword: '산림욕장', is_exclude: false },
  { category_min: '자연휴양림', keyword: '치유의숲', is_exclude: false },
  { category_min: '자연휴양림', keyword: '치유의 숲', is_exclude: false },
];

export async function seedDetailedCategoryRules(client) {
  const rows = NEW_RULES.map((r) => ({ target_table: 'open_spaces', ...r }));
  const { data, error } = await client.from('category_rules').insert(rows).select('id');
  if (error) throw new Error(`category_rules 시드 실패: ${error.message}`);
  return { inserted: data.length };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const client = createAdminClient();
  seedDetailedCategoryRules(client)
    .then((result) => {
      console.log('category_rules 시드 완료.');
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((err) => {
      console.error('❌', err.message);
      process.exitCode = 1;
    });
}
