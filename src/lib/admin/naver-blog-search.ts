// [관리자용 블로그 큐레이션 모달](2026-09-05 사용자 지시, Decision 021) — 네이버
// 블로그 검색 API 응답 가공 순수 함수들. route.ts(서버 전용, API 키를 다룸)에서
// 분리해 이 파일만 단위 테스트한다(이 프로젝트는 API 라우트 자체를 직접 테스트하는
// 관례가 없다 — 로직은 순수 함수로 빼서 테스트하고, 라우트는 그 함수를 그대로 쓴다).
export const RECENT_WINDOW_DAYS = 365;

// 네이버 검색 API는 매칭 키워드에 자체 <b>/</b> 태그를 씌우고 HTML 엔티티로
// 이스케이프해 돌려준다 — 이 프로젝트가 직접 하이라이팅을 다시 입히므로 네이버 쪽
// <b> 태그는 제거하고, 일반 텍스트로 되돌린다.
export function cleanNaverText(value: string): string {
  return value
    .replace(/<\/?b>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'");
}

// "YYYYMMDD" 형식만 유효하게 파싱한다(그 외 형식은 추측하지 않고 null).
export function parsePostdate(postdate: string): Date | null {
  if (!/^\d{8}$/.test(postdate)) return null;
  const year = Number(postdate.slice(0, 4));
  const month = Number(postdate.slice(4, 6));
  const day = Number(postdate.slice(6, 8));
  return new Date(year, month - 1, day);
}

// [최신성 검증(1년 룰)](사용자 지시 원문): "최근 1년 이내 작성된 글이 하나라도
// 있는지 체크함." now를 인자로 받아(고정 가능) 테스트에서 "현재 시각"에 좌우되지
// 않고 결정적으로 검증할 수 있게 한다.
export function isWithinRecentWindow(postdate: string, now: Date = new Date(), windowDays: number = RECENT_WINDOW_DAYS): boolean {
  const parsed = parsePostdate(postdate);
  if (!parsed) return false;
  const ageDays = (now.getTime() - parsed.getTime()) / (1000 * 60 * 60 * 24);
  return ageDays <= windowDays;
}
