// spec/data/ai-rule.md 3.2 표준 이벤트 유형 매핑
// 명확히 매핑되는 값은 규칙 기반으로 분류하고, 매핑표에 없는 값은 임의로 생성하지 않고
// 기본값(ETC)으로 분류한 뒤 경고 로그를 남긴다 (ai-rule.md 4.1 준수).

const SEOUL_CODENAME_MAP = {
  '축제-문화/예술': 'FESTIVAL',
  '축제-전통/역사': 'FESTIVAL',
  '축제-시민화합': 'FESTIVAL',
  '전시/미술': 'EXHIBITION',
  콘서트: 'PERFORMANCE',
  클래식: 'PERFORMANCE',
  국악: 'PERFORMANCE',
  무용: 'PERFORMANCE',
  연극: 'PERFORMANCE',
  '독주/독창회': 'PERFORMANCE',
  오페라: 'PERFORMANCE',
  뮤지컬: 'PERFORMANCE',
  '교육/체험': 'POPUP',
};

export function classifySeoulCultureEvent(codename) {
  const mapped = SEOUL_CODENAME_MAP[codename?.trim()];
  if (!mapped) {
    console.warn(`⚠️ 미분류 CODENAME "${codename}" → ETC로 분류`);
    return 'ETC';
  }
  return mapped;
}

// TourAPI contenttypeid=15(축제공연행사)는 서비스 전체가 축제/행사 카테고리로 고정되어 있어
// 별도 세부 분류 코드 없이도 FESTIVAL로 매핑 가능 (spec/data/data_sources.md #06)
export function classifyTourApiFestival() {
  return 'FESTIVAL';
}
