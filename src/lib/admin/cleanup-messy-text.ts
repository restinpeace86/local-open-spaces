// [원문 JSON 필드 정돈해서 보기](2026-09-12 사용자 지시): "DTLCONT 해당 컬럼에 대하여
// html로 안되어있는것들에 \r\n&nbsp;&nbsp; - 4회차 - ... 이런식으로 되어있으면
// \r \n같은거 적용해서 정돈된 글로 볼수있게해줘" — HTML 태그는 없지만(그래서
// looksLikeHtml에는 안 걸림) 이스케이프된 개행(\r\n)과 HTML 엔티티(&nbsp; 등)만
// 섞여 있어 원문 JSON 그대로(JSON.stringify) 보면 알아보기 힘든 필드를 감지하고,
// 실제 줄바꿈 + 디코딩된 텍스트로 정돈한다.

// looksLikeHtml과 상호 배타적으로 쓰인다(raw-data-modal.tsx에서 호출 순서로 보장) —
// 진짜 태그가 있으면 "HTML로 보기" 버튼이, 없으면 이 "정돈해서 보기" 버튼이 뜬다.
// 오탐이 있어도 무해하다(관리자가 버튼을 눌러야만 정돈을 시도한다).
export function looksLikeMessyText(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  return /\r\n|\r|\n/.test(value) || /&[a-zA-Z][a-zA-Z0-9]*;|&#\d+;/.test(value);
}

// [HTML 엔티티 디코딩] &nbsp;/&rarr;/&ldquo; 등 표준 엔티티를 전부 손수 매핑표로
// 관리하는 대신, 브라우저(jsdom 포함)의 실제 HTML 파서가 하는 디코딩을 그대로
// 빌려 쓴다 — <textarea>는 내용을 태그로 해석하지 않고 텍스트(RCDATA)로만 다루므로
// DOM에 붙이지 않은 채로도 안전하다(XSS 위험 없음, 실행되는 마크업이 아님).
function decodeHtmlEntities(text: string): string {
  const textarea = document.createElement('textarea');
  textarea.innerHTML = text;
  return textarea.value;
}

// [줄바꿈 정리] naver-blog-body.ts의 extractBlogBodyText(2026-09-11)와 동일한 관례 —
// 개행은 보존하되 그 외 연속 공백/탭은 하나로 뭉치고, 3개 이상 이어진 개행은
// 빈 줄 하나로 줄인다.
export function cleanupMessyText(value: string): string {
  const withRealNewlines = value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const decoded = decodeHtmlEntities(withRealNewlines);
  return decoded
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
