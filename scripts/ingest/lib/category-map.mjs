// spec/data/ai-rule.md 3.2 표준 이벤트 유형 매핑
// 명확히 매핑되는 값은 규칙 기반으로 분류하고, 매핑표에 없는 애매한 값은 Gemini AI로 보조 분류한다.
// AI도 명확히 판별하지 못하면 임의로 생성하지 않고 기본값(ETC)으로 분류한 뒤 경고 로그를 남긴다 (ai-rule.md 4.1 준수).
import { classifyEventTypeWithAI } from './ai-tagging.mjs';

// Task 9-1-4(2026-08-22): spec/data/ai-rule.md 3.3(Decision 008)의 공식 매핑표를 그대로 적용한다
// — "제안됨(코드 미반영)" 상태였던 문서를 실제 코드에 반영. 레거시 원본값(FESTIVAL/EXHIBITION/
// PERFORMANCE/POPUP 등)을 더 이상 만들지 않고, 처음부터 5대 UI 카테고리로 직접 태깅한다.
// 매핑표: 🏛️ 전시·박물관←CULTURE,EXHIBITION / 🎪 공연·축제←FESTIVAL,PERFORMANCE /
// 🎡 키즈·액티비티←SPORTS,POPUP,RESERVATION / 🌳 야외·자연←PARK
const SEOUL_CODENAME_MAP = {
  '축제-문화/예술': 'PERFORMANCE_FESTIVAL',
  '축제-전통/역사': 'PERFORMANCE_FESTIVAL',
  '축제-시민화합': 'PERFORMANCE_FESTIVAL',
  '전시/미술': 'EXHIBITION_MUSEUM',
  콘서트: 'PERFORMANCE_FESTIVAL',
  클래식: 'PERFORMANCE_FESTIVAL',
  국악: 'PERFORMANCE_FESTIVAL',
  무용: 'PERFORMANCE_FESTIVAL',
  연극: 'PERFORMANCE_FESTIVAL',
  '독주/독창회': 'PERFORMANCE_FESTIVAL',
  오페라: 'PERFORMANCE_FESTIVAL',
  뮤지컬: 'PERFORMANCE_FESTIVAL',
  '교육/체험': 'KIDS_ACTIVITY',
};

export async function classifySeoulCultureEvent(codename, { title, apiKey } = {}) {
  const mapped = SEOUL_CODENAME_MAP[codename?.trim()];
  if (mapped) return mapped;

  return classifyEventTypeWithAI({ title, rawLabel: codename, apiKey });
}

// TourAPI contenttypeid=15(축제공연행사)는 서비스 전체가 축제/행사 카테고리로 고정되어 있어
// 별도 세부 분류 코드 없이도 매핑 가능 (spec/data/data_sources.md #06). Task 9-1-4: ai-rule.md
// 3.3 매핑표에 따라 레거시 FESTIVAL 대신 5대 UI 카테고리 PERFORMANCE_FESTIVAL로 직접 태깅.
export function classifyTourApiFestival() {
  return 'PERFORMANCE_FESTIVAL';
}
