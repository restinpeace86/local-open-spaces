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
