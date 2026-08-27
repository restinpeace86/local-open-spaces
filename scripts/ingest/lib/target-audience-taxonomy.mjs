// [10대 타겟 분류 체계 실제 적용](2026-08-27): docs/target-audience-10tier-dryrun-report.md에서
// 시뮬레이션 검증한 10대 분류 체계(INFANT/KIDS_PRE/KIDS_SCHOOL/FAMILY/TEEN/YOUTH/ADULT/SENIOR/
// ALL/FACILITY)를 실제 반영한다. 대상은 is_active=true인 유효 이벤트에 한정한다.
//
// 대표 승인 범위(implementation/todo.md "대표 승인 완료 사항 잠정 규칙 5건", 2026-08-27):
// 1. FACILITY 재배정(스포츠 시설 대여 16종 + 캠핑장/영화촬영/회의실/강의실/강당/주민공유공간/
//    녹화장소 = 23종)
// 2. ADULT 키워드("성인")
// 3. TEEN 룰: "중고등" + 문맥 제한된 "학생"(대학생/수강생 등은 제외)
// 4. KIDS_SCHOOL 룰: "키즈" 키워드 + 초등 관련 키워드
// 5. raw_data 원천 필드 우선 탐색(0순위)
// 승인 범위 밖이라 이번에 적용하지 않는 것(docs/target-audience-10tier-dryrun-report.md 5절):
// 숫자 나이 임계값 파싱(예: "8세 이상"), 여성/장애인/국가유공자 등 비-연령 인구 속성 처리,
// TOUR_API_/SEOUL_YEYAK_ 소스=null 45건 스코프 외 백필.
//
// [행사 데이터 수집/정제 파이프라인 및 홈 피드 필터링 개선](2026-08-27) 사용자 지시 2번 추가
// 반영: 원천 데이터의 타겟 연령(USETGTINFO 등)이 NULL인 경우는 데이터가 없어서가 아니라
// 여러 대상이 혼재돼 특정하지 못했기 때문이라는 지적에 따라 0순위(resolveViaRawField)를
// 아래 2개 규칙으로 보강했다:
// 1. 예외/블랙리스트 선제 필터링: 난임/임산부/임신/출산지원/전문 자격 키워드가 있으면
//    가족/어린이 대상(kidFamily 태그)에서 원천 제외(NEGATIVE_OVERRIDE_KEYWORDS 확장).
// 2. 최연소 연령 대표값 매핑: 1을 통과한 뒤에도 순수 연령 태그가 여러 개 섞여 있으면
//    (예: 어린이/청소년/성인) NULL로 미루지 않고 가장 젊은 연령대를 대표값으로 채택
//    (AGE_ORDER, resolveViaRawField의 CONFLICTING_TOKENS 분기 참고).

// 0단계: 역방향 소거(implementation/todo.md 원 지시문 그대로, 8대 체계 때부터 승인된 문구를
// 10대 체계에도 재사용) — 아래 키워드가 있으면 INFANT/KIDS_PRE/KIDS_SCHOOL/FAMILY 매핑에서만
// 제외한다(TEEN/YOUTH/ADULT/SENIOR/ALL/FACILITY 판정에는 영향 없음). '시민'/'주민'/단독 '부모'는
// 지시문에 따라 소거 대상에서 명시적으로 제외한다.
// 연령/대상 라벨 그룹은 별도로 뽑아둔다 — 자유 텍스트(제목/설명)에서는 "성인 발레 클래스"처럼
// 이 단어들이 "이 프로그램 전체가 성인 전용"이라는 신호라 소거 게이트로 그대로 쓰지만,
// resolveViaRawField가 다루는 쉼표 나열 원천 필드(예: "어린이, 청소년, 성인")에서는 이 단어들
// 자체가 "혼재된 여러 대상 중 하나"를 가리키는 정상 토큰이므로 게이트에서 제외해야 한다
// (RAW_FIELD_NEGATIVE_OVERRIDE_KEYWORDS 참고, 2026-08-27 실측으로 발견 — 이 그룹을 그대로
// 게이트에 쓰면 "성인"이 섞인 모든 혼재값이 UNRESOLVED_TOKEN으로 막혀 아래 최연소 대표값
// 매핑 규칙이 지시받은 예시("어린이, 청소년, 성인")에서조차 전혀 동작하지 않았다).
const AGE_LABEL_KEYWORDS = ['성인', '어르신', '시니어', '실버', '은퇴', '청년'];

export const NEGATIVE_OVERRIDE_KEYWORDS = [
  // 학술/행정
  '학술대회', '세미나', '학술', '포럼', '심포지엄', '간담회', '설명회', '공청회', '봉사활동', '민원',
  // 전시/전람회
  '개인전', '정기전', '회원전', '초대전', '교류전', '학위청구전', '졸업전시', '동문전', '동호회전',
  // 음악/공연
  '독주회', '독창회', '리사이틀', '귀국 연주회', '정기 연주회', '동문 음악회',
  // 부모/학부모
  '학부모', '부모교육', '부모교실', '부모특강', '양육', '성교육', '지도자', '지도법', '자녀교육', '아동학대예방',
  // 자격증/직무
  '자격증', '강사', '전문가', '재테크', '부동산', '창업', '취업', '역량강화', '실무', '직무교육', '마케팅',
  // 연령/대상
  ...AGE_LABEL_KEYWORDS,
  // [행사 데이터 수집/정제 파이프라인 및 홈 피드 필터링 개선](2026-08-27) 사용자 지시: 의료/
  // 행정 지원 성격의 성인 대상 키워드. "가족(난임)"/"성인(난임)"/"여성(난임부부)"처럼 괄호
  // 안팎에 섞여 있어도(hasNegativeOverride가 원본 문자열 전체를 검사하므로 자동 대응) 가족/
  // 어린이 대상으로 오분류되지 않도록 차단한다 — 순수 나들이/여가와 무관한 성인 의료/행정
  // 지원이기 때문이지, 완전히 판단 불가라서가 아니다(예: "성인(난임)"은 여전히 ADULT로는
  // 정상 매칭된다, kidFamily 태그에서만 배제).
  '난임', '임산부', '임신', '출산지원', '전문 자격',
];

// resolveViaRawField 전용: 위 설명대로 AGE_LABEL_KEYWORDS를 게이트에서 제외한 변형.
const RAW_FIELD_NEGATIVE_OVERRIDE_KEYWORDS = NEGATIVE_OVERRIDE_KEYWORDS.filter(
  (kw) => !AGE_LABEL_KEYWORDS.includes(kw)
);

// [혼재 데이터 정제 규칙](2026-08-27) 사용자 지시 2번: resolveViaRawField에서 토큰이 여러
// 순수 연령 태그로 갈리면(예: "어린이, 청소년, 성인") 가장 젊은 연령대를 대표값으로 채택한다
// (임의로 매핑 불가 처리해 다음 단계로 미루지 않음). FAMILY/ALL/FACILITY는 나이가 선형으로
// 정렬되지 않는 개념이라(가족=그룹, 전연령/시설=나이 무관) 이 목록에 포함하지 않는다 — 이
// 태그들이 섞여 있으면(예: "어린이, 가족") 지시받은 범위 밖이라 추측하지 않고 기존처럼
// CONFLICTING_TOKENS로 다음 단계에 넘긴다(제3장 제5조 추측 금지).
const AGE_ORDER = ['INFANT', 'KIDS_PRE', 'KIDS_SCHOOL', 'TEEN', 'YOUTH', 'ADULT', 'SENIOR'];

// 2.1절 공용 키워드 표(0순위+2단계) + 승인된 KIDS_SCHOOL("키즈") 확장. 순서 = 매칭 우선순위
// (앞 태그부터 검사, 첫 매칭 채택) — "초등학생"이 KIDS_SCHOOL에서 먼저 잡혀야 TEEN의 "학생"
// 문맥 매칭으로 잘못 새지 않는다.
export const KEYWORD_TAGS = [
  { tag: 'INFANT', include: ['영아', '영유아', '신생아', '젖먹이'], kidFamily: true },
  { tag: 'KIDS_PRE', include: ['유아', '미취학', '유치원'], kidFamily: true },
  { tag: 'KIDS_SCHOOL', include: ['어린이', '초등학생', '초등', '아동', '키즈'], kidFamily: true },
  { tag: 'FAMILY', include: ['가족'], kidFamily: true },
  { tag: 'TEEN', include: ['청소년', '중학생', '고등학생', '중고생', '중고등'], kidFamily: false },
  { tag: 'YOUTH', include: ['청년'], kidFamily: false },
  { tag: 'ADULT', include: ['성인'], kidFamily: false },
  { tag: 'SENIOR', include: ['어르신', '시니어', '실버', '노인'], kidFamily: false },
  { tag: 'ALL', include: ['전연령', '전 연령', '남녀노소', '누구나', '제한없음'], kidFamily: false },
];

// TEEN 룰 3번: "학생" 단독 키워드는 "대학생"/"수강생"처럼 청소년이 아닌 문맥과 겹칠 위험이
// 커(docs/target-audience-8tier-dryrun-report.md 4.2절), 이 두 단어가 포함되면 TEEN으로
// 보지 않는다.
const TEEN_STUDENT_EXCLUDE = ['대학생', '수강생'];

// 2.2절: FACILITY 재배정 23종(스포츠 시설 대여 16종 + 캠핑장/영화촬영 계열 + 회의실/강의실/
// 강당/주민공유공간/녹화장소). 순수 공간·장비 대관이라 나이 제한 개념 자체가 없는 성격.
export const FACILITY_CATEGORY_MIN = new Set([
  '테니스장', '풋살장', '축구장', '체육관', '골프장', '농구장', '족구장', '야구장',
  '다목적경기장', '배드민턴장', '탁구장', '배구장', '수영장', '운동장', '피클볼장', '스포츠',
  '캠핑장', '영화촬영', '회의실', '강의실', '강당', '주민공유공간', '녹화장소',
]);

// 서울형키즈카페(구 이름)도 함께 인식한다 — category_maj 적용 이전 원본 raw_data.MINCLASSNM에는
// 여전히 구 이름이 남아 있을 수 있다.
export const KIDS_PRE_CATEGORY_MIN = new Set(['공공키즈카페', '어린이실내놀이터', '서울형키즈카페']);

export const YOUTH_CATEGORY_MIN = new Set(['청년공간']);

function hasNegativeOverride(text, keywords = NEGATIVE_OVERRIDE_KEYWORDS) {
  return keywords.some((kw) => text.includes(kw));
}

// 하나의 텍스트(원천 필드 토큰 또는 title+description)에서 우선순위 표 그대로 첫 매칭 태그를
// 찾는다. allowKidFamily=false면 INFANT/KIDS_PRE/KIDS_SCHOOL/FAMILY는 건너뛴다(0단계 소거).
export function matchTag(text, { allowKidFamily = true } = {}) {
  if (!text) return null;
  for (const rule of KEYWORD_TAGS) {
    if (rule.kidFamily && !allowKidFamily) continue;
    if (rule.include.some((kw) => text.includes(kw))) return rule.tag;
  }
  if (text.includes('학생') && !TEEN_STUDENT_EXCLUDE.some((kw) => text.includes(kw))) return 'TEEN';
  return null;
}

// 괄호 부연설명 제거 후 쉼표/슬래시로 분리한 토큰 목록(2.1절: "쉼표 다중 나열 + 괄호 부연설명이
// 섞인 자유 텍스트").
function tokenize(value) {
  return value
    .replace(/\([^)]*\)/g, ' ')
    .split(/[,/]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

// 0순위: raw_data 원천 필드(USE_TRGT/target_age_group/USETGTINFO, API 소스별 상이) 우선 탐색.
// 토큰 전부가 하나의 태그로 완전히 합의될 때만 매핑 성공으로 인정한다(2.1절) — 일부만 맞거나
// 서로 다른 태그로 갈리면(CONFLICTING_TOKENS) null을 반환해 다음 단계로 넘긴다.
const RAW_AGE_FIELDS = ['USE_TRGT', 'target_age_group', 'USETGTINFO'];

export function resolveViaRawField(rawData) {
  if (!rawData) return null;
  for (const field of RAW_AGE_FIELDS) {
    const value = rawData[field];
    if (typeof value !== 'string' || !value.trim()) continue;

    const allowKidFamily = !hasNegativeOverride(value, RAW_FIELD_NEGATIVE_OVERRIDE_KEYWORDS);
    const tokens = tokenize(value);
    if (tokens.length === 0) continue;

    const resolvedTags = tokens.map((token) => matchTag(token, { allowKidFamily }));
    if (resolvedTags.some((tag) => tag === null)) continue; // UNRESOLVED_TOKEN
    const distinctTags = new Set(resolvedTags);
    if (distinctTags.size === 1) {
      return { tag: resolvedTags[0], viaField: field };
    }

    // [혼재 데이터 정제 규칙](2026-08-27) 사용자 지시 2번: 순수 연령 태그끼리만 섞여 있으면
    // NULL로 방치하지 않고 가장 젊은 연령대를 대표값으로 채택한다.
    if ([...distinctTags].every((tag) => AGE_ORDER.includes(tag))) {
      const youngest = AGE_ORDER.find((tag) => distinctTags.has(tag));
      return { tag: youngest, viaField: field };
    }

    continue; // CONFLICTING_TOKENS(연령 외 비-선형 태그 혼재)
  }
  return null;
}

// 1단계: 카테고리/FACILITY 판정. category_min(이미 category_maj 적용으로 신규 이름일 수 있음)을
// 우선 쓰고, 없으면 raw_data.MINCLASSNM(원본, 불변)을 본다.
export function resolveViaCategory(categoryMin, rawMinClassNm) {
  const value = categoryMin ?? rawMinClassNm ?? null;
  if (!value) return null;
  if (FACILITY_CATEGORY_MIN.has(value)) return { tag: 'FACILITY', via: value };
  if (KIDS_PRE_CATEGORY_MIN.has(value)) return { tag: 'KIDS_PRE', via: value };
  if (YOUTH_CATEGORY_MIN.has(value)) return { tag: 'YOUTH', via: value };
  return null;
}

// 2단계: 명확 텍스트 파싱(title+description).
export function resolveViaText(title, description) {
  const text = description ? `${title ?? ''} ${description}` : (title ?? '');
  if (!text.trim()) return null;
  const allowKidFamily = !hasNegativeOverride(text);
  const tag = matchTag(text, { allowKidFamily });
  return tag ? { tag } : null;
}

// 한 행에 대해 (target_audience, target_audience_source) 최종값을 계산한다. null 반환은
// "값을 바꾸지 않고 그대로 둔다"(MANUAL 보존, category-maj-taxonomy.mjs와 동일 관례)를 뜻한다.
export function resolveTargetAudienceForRow(row) {
  if (row.target_audience_source === 'MANUAL') {
    return null;
  }

  const rawField = resolveViaRawField(row.raw_data);
  if (rawField) return { target_audience: rawField.tag, target_audience_source: 'RAW_FIELD' };

  const category = resolveViaCategory(row.category_min, row.raw_data?.MINCLASSNM ?? null);
  if (category) return { target_audience: category.tag, target_audience_source: 'CATEGORY' };

  const text = resolveViaText(row.title, row.description);
  if (text) return { target_audience: text.tag, target_audience_source: 'TEXT' };

  return { target_audience: null, target_audience_source: null };
}

const PAGE_SIZE = 500;
const UPDATE_BATCH_SIZE = 200;

// is_active=true인 events 전체를 대상으로 위 3단계 퍼널을 적용해 실제 UPDATE한다.
export async function applyTargetAudienceTaxonomy(client) {
  let lastId = null;
  let scanned = 0;
  let updatedToValue = 0;
  let preservedManual = 0;
  let clearedToNull = 0;
  const tagCounts = new Map();
  const sourceCounts = new Map();

  for (;;) {
    let query = client
      .from('events')
      .select('id, title, description, category_min, target_audience_source, raw_data')
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
      const resolved = resolveTargetAudienceForRow(row);
      if (resolved === null) {
        preservedManual += 1;
        continue;
      }
      if (resolved.target_audience) {
        updatedToValue += 1;
        tagCounts.set(resolved.target_audience, (tagCounts.get(resolved.target_audience) ?? 0) + 1);
        sourceCounts.set(resolved.target_audience_source, (sourceCounts.get(resolved.target_audience_source) ?? 0) + 1);
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
              target_audience: u.target_audience,
              target_audience_source: u.target_audience_source,
            })
            .eq('id', u.id)
        )
      );
    }

    lastId = data[data.length - 1].id;
    if (data.length < PAGE_SIZE) break;
  }

  return { scanned, updatedToValue, clearedToNull, preservedManual, tagCounts, sourceCounts };
}

// ---------- "타겟 연령 기타(OTHER)" 수동 검수 분리 ----------
// [행사 데이터 수집/정제 파이프라인 및 홈 피드 필터링 개선] 후속 지시(2026-08-27): is_active=true
// 대상으로 위 3단계 퍼널을 적용한 뒤에도 target_audience가 NULL이거나 ALL인 행 중, 지금까지
// 어느 단계에서도 스캔한 적 없는 필드(raw_data의 기타 필드)에까지 범위를 넓혀 유아/어린이/
// 가족 관련 키워드가 발견되면 'OTHER'로 표시해 별도로 모아 관리자가 수동으로 확인·수정하게
// 한다(docs/target-audience-null-all-rawdata-keyword-simulation.md에서 사전 시뮬레이션한
// 근거). 목적은 ALL 태그에 남는 행이 "가족/어린이와 진짜 무관한" 것만 남도록 정제하는 것
// — ALL 자체가 틀렸다고 단정하는 게 아니라, 사람이 한 번 더 봐야 할 애매한 신호가 있다는
// 뜻이라 새 태그로 분리한다(제3장 제5조 추측 금지 — 어떤 구체적 태그인지 임의로 추정하지
// 않음).
export const OTHER_REVIEW_KEYWORDS = ['어린이', '보호자', '유아', '초등', '가족', '동반', '키즈'];

// 0순위에서 이미 보는 원천 타겟 필드, description으로 이미 편입된 소스별 필드, title과
// 중복되는 필드는 "새로운 신호"가 아니므로 기타 필드 스캔에서 제외한다.
const ALREADY_SCANNED_RAW_FIELDS = new Set([
  ...RAW_AGE_FIELDS,
  'PROGRAM', 'ETC_DESC', 'DTCONT', 'overview',
  'TITLE', 'title',
]);

function otherRawFieldsText(rawData) {
  if (!rawData || typeof rawData !== 'object') return '';
  const parts = [];
  for (const [key, value] of Object.entries(rawData)) {
    if (ALREADY_SCANNED_RAW_FIELDS.has(key)) continue;
    if (typeof value === 'string' && value.trim()) parts.push(value);
  }
  return parts.join(' ');
}

// 한 행에 대해 OTHER 분리 여부를 판정한다. MANUAL 행이나 이미 실제 태그(NULL/ALL이 아닌
// 값)가 확정된 행은 절대 건드리지 않는다(null 반환 = 그대로 둠).
export function resolveOtherReviewTag(row) {
  if (row.target_audience_source === 'MANUAL') return null;
  if (row.target_audience !== null && row.target_audience !== 'ALL') return null;

  const text = `${row.title ?? ''} ${row.description ?? ''} ${otherRawFieldsText(row.raw_data)}`;
  if (OTHER_REVIEW_KEYWORDS.some((kw) => text.includes(kw))) {
    return { target_audience: 'OTHER', target_audience_source: 'OTHER' };
  }
  return null;
}

// is_active=true이면서 target_audience가 NULL 또는 ALL인 행만 대상으로 위 판정을 적용해
// 실제 UPDATE한다(applyTargetAudienceTaxonomy와 별개의 후속 배치 — 이미 확정된 다른 태그는
// 절대 재검토하지 않는다).
export async function applyOtherReviewFlag(client) {
  let lastId = null;
  let scanned = 0;
  let flaggedAsOther = 0;
  let preservedManual = 0;
  const fromCounts = new Map();

  for (;;) {
    let query = client
      .from('events')
      .select('id, title, description, target_audience, target_audience_source, raw_data')
      .eq('is_active', true)
      .or('target_audience.is.null,target_audience.eq.ALL')
      .order('id', { ascending: true })
      .limit(PAGE_SIZE);
    if (lastId) query = query.gt('id', lastId);

    const { data, error } = await query;
    if (error) throw new Error(`events 스캔 실패: ${error.message}`);
    if (!data || data.length === 0) break;

    const updates = [];
    for (const row of data) {
      scanned += 1;
      if (row.target_audience_source === 'MANUAL') {
        preservedManual += 1;
        continue;
      }
      const resolved = resolveOtherReviewTag(row);
      if (!resolved) continue;
      flaggedAsOther += 1;
      fromCounts.set(row.target_audience ?? '(NULL)', (fromCounts.get(row.target_audience ?? '(NULL)') ?? 0) + 1);
      updates.push({ id: row.id, ...resolved });
    }

    for (let i = 0; i < updates.length; i += UPDATE_BATCH_SIZE) {
      const batch = updates.slice(i, i + UPDATE_BATCH_SIZE);
      await Promise.all(
        batch.map((u) =>
          client
            .from('events')
            .update({ target_audience: u.target_audience, target_audience_source: u.target_audience_source })
            .eq('id', u.id)
        )
      );
    }

    lastId = data[data.length - 1].id;
    if (data.length < PAGE_SIZE) break;
  }

  return { scanned, flaggedAsOther, preservedManual, fromCounts };
}
