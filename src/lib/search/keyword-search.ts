// [검색창/지도 검색 키워드 유연성 대폭 개선](2026-08-30 사용자 지시): 여러 검색 엔드포인트
// (이벤트픽 GNB 검색, 어드민 데이터 그리드, 큐레이션 상품 검색)가 공유하는 순수 문자열
// 유틸리티. 유저가 "용인 어린이상상"처럼 띄어쓰기를 넣어 검색해도, 실제 데이터가
// "용인어린이상상"처럼 붙어 있으면 정상적으로 찾아지도록 공백 기준으로 토큰을 나눈다 —
// 각 토큰이 (부분 문자열로, 대소문자 무시) 검색 대상 필드 중 어딘가에 존재하기만 하면
// 매치되게 하려는 목적이다(요구사항 3). Supabase 쿼리 빌더 자체(제네릭 타입)는 얽히지
// 않는 순수 함수만 여기 둔다 — 실제 .ilike()/.or() 체이닝은 각 API 라우트에서 직접
// 조립한다(타입 추론이 쉽고, 라우트마다 검색 대상 필드가 달라 억지로 추상화하지 않음).
export function splitSearchTokens(query: string): string[] {
  return query.trim().split(/\s+/).filter(Boolean);
}

// ILIKE 패턴에서 특별한 의미를 갖는 %(임의 길이 와일드카드)/_(단일 문자 와일드카드)를
// 유저가 검색어에 그대로 입력했을 때 리터럴로 취급하도록 이스케이프한다(기존
// /api/admin/data-grid/route.ts의 escapeIlikePattern과 동일 로직 — 이번에 여러 라우트가
// 공유하도록 이 파일로 옮겼다).
export function escapeIlikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

// [성능 버그 수정 — 2026-09-14 사용자 리포트] "장소찾는것도 엄청느리고" —
// 실측(EXPLAIN ANALYZE)으로 원인을 찾았다: pg_trgm GIN 인덱스는 패턴에서
// 완전한 3글자 조합(trigram)을 뽑아낼 수 있어야 ILIKE '%...%'를 빠르게
// 걸러낼 수 있는데, 2글자 이하 토큰은 애초에 3글자 조합을 만들 수 없어
// 인덱스가 사실상 "테이블 전체가 후보"라고 답해버린다("행복"만 검색했을 때
// bitmap index scan이 140,689행 중 143,214행을 후보로 반환하는 것으로 실측
// 확인). "행복 어린이집"처럼 자연스러운 여러 단어 검색에서, 프런트엔드는
// 전체 문자열 길이(3자 이상)만 검사하고 토큰 단위로는 검사하지 않아, 짧은
// 토큰("행복", 2자)이 그대로 섞여 들어가 8초 넘게 걸리는 쿼리를 만들고
// 있었다. pg_bigm(2글자용 인덱스) 확장은 이 Supabase 프로젝트에 설치되어
// 있지 않아(pg_available_extensions로 확인) 짧은 토큰 자체를 인덱스로
// 빠르게 거를 방법이 없다 — 대신 3자 미만 토큰은 검색 조건에서 제외해
// 나머지(인덱스 효율이 있는) 토큰만으로 빠르게 찾도록 한다. 모든 토큰이
// 3자 미만이면(드문 경우) 결과가 아예 없는 것보다 느리더라도 원래 토큰
// 그대로 검색하는 쪽을 택한다.
const TRIGRAM_EFFECTIVE_MIN_LENGTH = 3;

export function selectTrigramFriendlyTokens(tokens: string[]): string[] {
  const longEnough = tokens.filter((t) => t.length >= TRIGRAM_EFFECTIVE_MIN_LENGTH);
  return longEnough.length > 0 ? longEnough : tokens;
}
