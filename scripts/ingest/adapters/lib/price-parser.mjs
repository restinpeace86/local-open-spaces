// [가격 정보 파싱 고도화](2026-09-11 사용자 지시, implementation/todo.md 개선사항7-1):
// "이벤트 원천 데이터의 텍스트(Description) 설명에서 가격 정보를 우선적으로 파싱".
//
// [어댑터별 실측 조사 결과] 4개 이벤트 생산 소스 중 2곳(SEOUL_CULTURE_EVENTS의
// USE_FEE, GG_CULTURE_EVENTS의 PARTCPT_EXPN_INFO)은 이미 원본 API가 가격을 사람이
// 쓴 자유 텍스트로 별도 필드에 제공하고 있어(실측 확인, 예: "전석 10,000원 / 단체10인
// 이상 할인 20%") 이 함수 없이 그 필드를 그대로 쓰는 것이 더 정확하다(문맥 손실 없음).
// 나머지 2곳(SEOUL_YEYAK/seoul_public_reservation, TOUR_API_FESTIVAL)은 구조화된
// 가격 필드가 없어 이 함수로 설명/원문 텍스트(DTLCONT/overview)에서 "라벨 키워드 +
// 숫자원" 패턴을 찾는다.
//
// [URL 크롤링 Fallback 실측 조사 결과] 요구사항 원문은 "설명에 가격이 없고 원천
// URL(source_url)이 있으면 그 URL에 접근해 가격을 크롤링"이었다. SEOUL_YEYAK의
// 실제 원천 URL(SVCURL, 예: yeyak.seoul.go.kr 예약 상세 페이지) 2건을 직접 fetch해
// 정적 HTML을 확인했는데, 시설 대관료가 정적 HTML에 전혀 나타나지 않았다(날짜/
// 시간대 선택 후 별도 API 호출로 동적 로딩되는 구조로 추정 — 단순 fetch로는 확인
// 불가). 이를 크롤링하려면 헤드리스 브라우저(Puppeteer 등, 이 프로젝트에 아직 없는
// 무거운 신규 의존성)가 필요해 이번 범위에서는 구현하지 않는다(제3장 제5조 추측
// 금지 — 안 되는 걸 되는 척 구현하지 않는다). 대신 SVCURL은 events.source_url로
// 저장해 최소한 유저/관리자가 원본 페이지로 바로 이동할 수 있게 하고, 가격은 위
// 텍스트 파싱으로 찾지 못하면 정직하게 null로 남긴다(요구사항 원문 "없으면
// null로 비워둘 것").
export function parsePriceFromText(text) {
  if (!text || typeof text !== 'string') return null;
  // HTML 태그가 섞여 있으면(예: DTLCONT) 우선 벗겨낸다 — 태그 안에 숫자가 있어도
  // 오매칭하지 않도록.
  const plain = text.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&amp;|&middot;/g, ' ');

  // 1순위: "이용료/요금/참가비/입장료/사용료/수강료" 등 명시적 라벨 근처의 금액만
  // 신뢰한다 — 라벨 없이 "[0-9,]+원"만 찾으면 전화번호/규정 조항 번호 등과 혼동될
  // 위험이 있어(제3장 제5조 추측 금지) 라벨을 요구한다.
  const labeled = plain.match(/(이용료|요금|참가비|입장료|사용료|수강료|관람료)\s*[:：]?\s*([0-9][0-9,]{2,}\s*원)/);
  if (labeled) return `${labeled[1]} ${labeled[2]}`;

  // 2순위: 라벨은 없지만 "전석 10,000원", "성인 15,000원 어린이 10,000원"처럼
  // 대상어 + 금액 조합이 뚜렷한 경우 — 최대 2개까지만(복수 요금 지원, 요구사항 원문
  // "성인 15000원 어린이 10000원 이런식으로 되어있을 수도 있음") 이어붙인다.
  const targeted = [...plain.matchAll(/[가-힣]{1,6}\s*[0-9][0-9,]{2,}\s*원/g)].map((m) => m[0].trim());
  if (targeted.length > 0) return targeted.slice(0, 2).join(' ');

  return null;
}
