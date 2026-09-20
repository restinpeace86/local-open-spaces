// [나드리픽 파트너 PMS — 클라우드플레어 인바운드 메일 연동](2026-09-21 사용자
// 지시): 메일이 HTML 본문만 갖고 있을 때(text 파트가 없는 경우) 정규식 파싱
// 전에 일반 텍스트로 변환한다. 완전한 HTML 파서가 아니라 줄바꿈을 만드는 태그를
// 개행으로 바꾼 뒤 나머지 태그를 전부 제거하는 최소 구현이다 — 이 용도(라벨:
// 값 형태의 짧은 알림 메일에서 텍스트만 뽑기)에는 그 이상이 필요 없다.
export function stripHtml(html: string): string {
  return html
    .replace(/<(br|\/p|\/div|\/tr|\/li)\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}
