// [7대 대분류 실제 적용](2026-08-26): docs/category-taxonomy-7major-dryrun-report.md에서
// 시뮬레이션 검증한 7대 대분류(category_maj)/36종 중분류(category_min) 체계를 실제 반영한다.
// 대상은 is_active=true인 유효 이벤트에 한정한다(대표 지시).
//
// 기존 category_min_source별로 처리 방식을 다르게 한다(단순 재-키워드매칭이 아님):
// - MANUAL: 관리자가 직접 확정한 값이므로 절대 건드리지 않는다(보존).
// - RAW: SEOUL_YEYAK 원본 MINCLASSNM 값 자체가 ground truth라, 제목 키워드로 다시 추측하지
//   않고 "구 카테고리명 → 신 카테고리명" 매핑 테이블로 직접 치환한다(정확도가 키워드 매칭보다
//   높음 — 원본이 이미 정답을 알려주고 있는데 텍스트로 재추측하면 오히려 정밀도가 떨어짐).
//   새 36종 목록에 대응하는 이름이 없으면(예: "기타"/"청년정보"/"단체봉사"/"전문/자격증"/
//   "정보통신") NULL로 정리한다(신규 taxonomy 제외 대상).
// - RULE 또는 NULL(미분류): 새 36종 키워드 규칙으로 제목을 다시 스캔한다(RULE은 애초에
//   "추측"이었으므로 개선된 규칙으로 다시 추측하는 것이 맞고, NULL은 처음 시도하는 것).

// docs/category-taxonomy-7major-dryrun-report.md 1절 그대로 — 7대 대분류 → 36종 매핑.
export const CATEGORY_MAJ_OF = {
  캠핑장: '자연 / 캠핑',
  산림여가: '자연 / 캠핑',
  공원탐방: '자연 / 캠핑',
  공공키즈카페: '공공 키즈카페',
  어린이실내놀이터: '공공 키즈카페',
  농장체험: '체험 / 농장',
  도시농업: '체험 / 농장',
  '자연/과학': '체험 / 농장',
  // [todo.md 개선사항 4](2026-09-03): open_spaces 전용 중분류(체험휴양마을/교육농장/
  // 체험학습장) — 이 이벤트 수집 파이프라인에서 실제로 분류되는 값은 아니지만
  // (open_spaces 어댑터가 직접 세팅), src/lib/spaces/category-maj-meta.ts와 "반드시
  // 동일하게 유지"하라는 상단 지침에 따라 대분류 매핑을 동일하게 맞춰둔다.
  체험휴양마을: '체험 / 농장',
  교육농장: '체험 / 농장',
  체험학습장: '체험 / 농장',
  '지역축제/페스티벌': '축제 / 이벤트',
  문화행사: '축제 / 이벤트',
  광장: '축제 / 이벤트',
  공연장: '문화 / 전시',
  전시실: '문화 / 전시',
  '전시/관람': '문화 / 전시',
  미술제작: '문화 / 전시',
  '공예/취미': '문화 / 전시',
  역사: '문화 / 전시',
  교육체험: '배움 / 클래스',
  '교양/어학': '배움 / 클래스',
  교육시설: '배움 / 클래스',
  테니스장: '스포츠 대여',
  풋살장: '스포츠 대여',
  축구장: '스포츠 대여',
  체육관: '스포츠 대여',
  골프장: '스포츠 대여',
  농구장: '스포츠 대여',
  족구장: '스포츠 대여',
  야구장: '스포츠 대여',
  다목적경기장: '스포츠 대여',
  배드민턴장: '스포츠 대여',
  탁구장: '스포츠 대여',
  배구장: '스포츠 대여',
  수영장: '스포츠 대여',
  운동장: '스포츠 대여',
  피클볼장: '스포츠 대여',
  스포츠: '스포츠 대여',
};

// 기존 SEOUL_YEYAK RAW MINCLASSNM(19종, 실측 추출값) → 신규 36종 이름. 이름이 그대로인
// 항목도 "신규 목록에 남아있음을 명시"하기 위해 전부 나열한다(누락 방지). 신규 목록에 없는
// 5종(기타/청년정보/단체봉사/전문/자격증/정보통신)은 null로 매핑해 제외한다.
export const RAW_TO_NEW_CATEGORY_MIN = {
  교육체험: '교육체험',
  산림여가: '산림여가',
  공원탐방: '공원탐방',
  서울형키즈카페: '공공키즈카페', // 개명
  '자연/과학': '자연/과학',
  문화행사: '문화행사',
  기타: null, // 제외 대상
  청년정보: null, // 제외 대상
  '전시/관람': '전시/관람',
  도시농업: '도시농업',
  스포츠: '스포츠',
  역사: '역사',
  '공예/취미': '공예/취미',
  농장체험: '농장체험',
  미술제작: '미술제작',
  '교양/어학': '교양/어학',
  '전문/자격증': null, // 신규 36종 목록에 없음(제외)
  정보통신: null, // 신규 36종 목록에 없음(제외)
  단체봉사: null, // 제외 대상
};

// docs/category-taxonomy-7major-dryrun-report.md 1절의 우선순위 그대로 — 구체적인 키워드를
// 일반적인 키워드보다 먼저 검사한다(예: "전시관"이 "전시"를 포함하므로 "전시실"을
// "전시/관람"보다 먼저).
export const CATEGORY_MIN_RULES = [
  { category: '풋살장', include: ['풋살장', '풋살구장'] },
  { category: '축구장', include: ['축구장'] },
  { category: '테니스장', include: ['테니스장', '테니스코트'] },
  { category: '골프장', include: ['골프장', '골프연습장', '스크린골프'] },
  { category: '농구장', include: ['농구장'] },
  { category: '족구장', include: ['족구장'] },
  { category: '체육관', include: ['체육관', '종합체육관', '실내체육관'] },
  { category: '야구장', include: ['야구장', '야구연습장'] },
  { category: '배드민턴장', include: ['배드민턴장', '배드민턴코트'] },
  { category: '탁구장', include: ['탁구장'] },
  { category: '배구장', include: ['배구장'] },
  { category: '수영장', include: ['수영장', '물놀이장'] },
  { category: '피클볼장', include: ['피클볼장', '피클볼코트'] },
  { category: '다목적경기장', include: ['다목적경기장', '다목적구장'] },
  { category: '운동장', include: ['운동장', '종합운동장'] },
  { category: '스포츠', include: ['스포츠교실', '생활체육', '운동교실'] },
  { category: '공공키즈카페', include: ['서울형키즈카페', '경기아이사랑놀이터', '키즈카페'] },
  { category: '어린이실내놀이터', include: ['어린이놀이터', '실내놀이터', '놀이터', '놀이시설', '키즈존'] },
  { category: '캠핑장', include: ['캠핑장', '야영장', '오토캠핑장', '카라반'] },
  { category: '산림여가', include: ['숲체험', '자연휴양림', '산림욕', '트레킹'] },
  { category: '공원탐방', include: ['공원탐방', '공원투어', '둘레길 걷기'] },
  { category: '농장체험', include: ['농장체험', '체험농장', '과일따기'] },
  { category: '도시농업', include: ['도시농업', '텃밭', '주말농장', '가족텃밭', '주말농부'] },
  { category: '자연/과학', include: ['자연관찰', '과학교실', '천체관측'] },
  { category: '지역축제/페스티벌', include: ['축제', '페스티벌'] },
  { category: '공연장', include: ['공연장', '아트홀', '콘서트홀'] },
  { category: '전시실', include: ['전시실', '전시관', '갤러리'] },
  { category: '문화행사', include: ['공연', '문화행사'] },
  { category: '전시/관람', include: ['전시', '전시회', '관람'] },
  { category: '광장', include: ['광장'] },
  { category: '미술제작', include: ['미술', '그리기', '도자기', '공작'], exclude: ['미술관'] },
  { category: '공예/취미', include: ['공예', 'DIY', '취미반', '원데이클래스'] },
  // 실측 중 발견(2026-08-26): "OO문화재단"(문화재단은 기관명 — 서울문화재단/마포문화재단 등)이
  // "문화재" 키워드에 걸려 역사 카테고리로 대량 오매칭됐다(is_active=true 대상 실행 결과 검수
  // 중 85건 중 58건이 이 패턴으로 확인됨). "문화재단"을 제외 키워드로 추가해 바로잡는다.
  { category: '역사', include: ['역사', '유적', '문화재', '고궁'], exclude: ['문화재단'] },
  { category: '교육체험', include: ['교육체험', '체험교실', '아이와 함께'] },
  { category: '교양/어학', include: ['어학', '외국어', '교양강좌', '인문학'] },
  { category: '교육시설', include: ['교육시설', '교육관'] },
];

export function matchCategoryMinByKeyword(text) {
  if (!text) return null;
  for (const rule of CATEGORY_MIN_RULES) {
    const hit = rule.include.some((kw) => text.includes(kw));
    if (!hit) continue;
    const blocked = (rule.exclude ?? []).some((kw) => text.includes(kw));
    if (blocked) continue;
    return rule.category;
  }
  return null;
}

// 한 행에 대해 (신규 category_min, category_maj, category_min_source) 최종값을 계산한다.
// null 반환은 "값을 바꾸지 않고 그대로 둔다"(MANUAL 보존)를 뜻한다.
//
// 실측 중 발견한 버그(2026-08-26): RAW 행의 구→신 매핑을 row.category_min(이미 이전 실행이
// 새 이름으로 덮어썼을 수 있는 가변 컬럼)으로 조회하면, 이 함수를 두 번째 실행할 때
// "공공키즈카페"(이미 신규 이름)로는 매핑 테이블에 키가 없어 조회가 실패해 값이 통째로
// NULL로 지워지는 멱등성 버그가 생긴다(실측: 재실행 후 132건 소실 확인). 그래서 RAW 행은
// 절대 변하지 않는 원본(raw_data.MINCLASSNM)을 조회 키로 쓴다 — 몇 번을 다시 실행해도
// 항상 같은 결과가 나온다(멱등적).
export function resolveCategoryForRow(row) {
  if (row.category_min_source === 'MANUAL') {
    return null; // 보존 — 업데이트하지 않음
  }

  if (row.category_min_source === 'RAW') {
    const originalMinClass = row.raw_data?.MINCLASSNM ?? null;
    const mapped = RAW_TO_NEW_CATEGORY_MIN[originalMinClass] ?? null;
    return {
      category_min: mapped,
      category_maj: mapped ? (CATEGORY_MAJ_OF[mapped] ?? null) : null,
      category_min_source: mapped ? 'RAW' : null,
    };
  }

  // RULE 또는 NULL: 새 규칙으로 제목+본문(description)을 다시 스캔한다.
  // [2026-08-27, 본문 백필 반영] 기존에는 title만 스캔했으나, description 백필 파이프라인
  // 완료 후 Dry-run 재검증(implementation/2026-08-27-category-maj-description-dryrun-recheck.md)에서
  // title+description 스캔 시 매칭률이 55.96%→59.02%(+109건)로 개선됨을 확인해 실제 반영한다.
  const scanText = row.description ? `${row.title ?? ''} ${row.description}` : row.title;
  const matched = matchCategoryMinByKeyword(scanText);
  return {
    category_min: matched,
    category_maj: matched ? (CATEGORY_MAJ_OF[matched] ?? null) : null,
    category_min_source: matched ? 'RULE' : null,
  };
}

const PAGE_SIZE = 500;
const UPDATE_BATCH_SIZE = 200;

// is_active=true인 events 전체를 대상으로 위 3분기 로직을 적용해 실제 UPDATE한다.
export async function applyCategoryMajTaxonomy(client) {
  let lastId = null;
  let scanned = 0;
  let updatedToValue = 0;
  let preservedManual = 0;
  let clearedToNull = 0;
  const categoryMajCounts = new Map();
  const categoryMinCounts = new Map();

  for (;;) {
    let query = client
      .from('events')
      .select('id, title, description, category_min, category_min_source, raw_data')
      .eq('is_active', true)
      .order('id', { ascending: true })
      .limit(PAGE_SIZE);
    if (lastId) query = query.gt('id', lastId);

    const { data, error } = await query;
    if (error) throw new Error(`events 스캔 실패: ${error.message}`);
    if (!data || data.length === 0) break;

    const updates = [];
    for (const row of data) {
      scanned += 1;
      const resolved = resolveCategoryForRow(row);
      if (resolved === null) {
        preservedManual += 1;
        continue;
      }
      if (resolved.category_min) {
        updatedToValue += 1;
        categoryMinCounts.set(resolved.category_min, (categoryMinCounts.get(resolved.category_min) ?? 0) + 1);
        categoryMajCounts.set(resolved.category_maj, (categoryMajCounts.get(resolved.category_maj) ?? 0) + 1);
      } else {
        clearedToNull += 1;
      }
      updates.push({ id: row.id, ...resolved });
    }

    for (let i = 0; i < updates.length; i += UPDATE_BATCH_SIZE) {
      const batch = updates.slice(i, i + UPDATE_BATCH_SIZE);
      await Promise.all(
        batch.map((u) =>
          client
            .from('events')
            .update({
              category_min: u.category_min,
              category_maj: u.category_maj,
              category_min_source: u.category_min_source,
            })
            .eq('id', u.id)
        )
      );
    }

    lastId = data[data.length - 1].id;
    if (data.length < PAGE_SIZE) break;
  }

  return { scanned, updatedToValue, clearedToNull, preservedManual, categoryMajCounts, categoryMinCounts };
}
