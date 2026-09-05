// [블로그 큐레이션 전체 본문 보기](2026-09-05 사용자 지시): "가져온 내용자체도 짧게하고
// 잘려서.." — 네이버 블로그 검색 API의 description은 애초에 ~200자 요약 스니펫만
// 제공한다(Decision 021 6항). 이번에 사용자 지시로 실측 재확인한 결과, "실제 블로그
// 페이지 전체 본문은 iframe 안에 렌더링돼 있어 안정적으로 크롤링할 수 없다"고
// Decision 021에 남겼던 판단은 **PC 버전(blog.naver.com)에 한정된 추측이었고 실제로는
// 틀렸다** — 모바일 버전(m.blog.naver.com)은 본문(.se-main-container)이 서버 렌더링된
// HTML에 그대로 들어있어 안정적으로 추출 가능함을 직접 확인했다(2026-09-05, 실제
// blog.naver.com URL을 m.blog.naver.com으로 바꿔 fetch → 본문 45,000자 이상 확인).
//
// [정정 기록] 이 파일은 그 정정을 반영한 신규 구현이다 — project/decision-log.md
// Decision 021에도 이 정정을 남긴다. 저장/폐기 정책은 그대로 유지: 이 본문은 절대
// DB에 저장하지 않고, 관리자가 보는 동안만 메모리에 있다가 모달/워크벤치가 닫히면
// 폐기된다.
//
// 이 파일은 jsdom(무거운 Node 전용 파서)을 가져오므로 서버 전용 코드(API 라우트)에서만
// import한다 — 'use client' 컴포넌트에서 절대 import하지 않는다(admin.ts의 서비스
// 롤 키 파일과 동일한 관례).
import { JSDOM } from 'jsdom';

// 실제 응답에서 문단 사이에 반복적으로 섞여 있던 제로폭 공백(스마트에디터가 자동
// 삽입) — 정리하지 않으면 highlightKeywords의 문자열 비교가 어색해질 수 있어 제거한다.
const ZERO_WIDTH_SPACE = /​/g;
// 실측(스팸성 블로그 45,000자+)에서 본 것처럼 과도하게 긴 본문은 하이라이팅/렌더링
// 비용을 방어하기 위해 적당한 길이로 자른다 — 어차피 "원문 보기" 링크로 전체를 볼 수
// 있으니 참고용 미리보기 목적에는 충분한 길이다.
export const MAX_BLOG_BODY_LENGTH = 8000;

// blog.naver.com(본문이 iframe에 있는 PC 버전) URL을 본문이 직접 렌더링되는
// m.blog.naver.com(모바일 버전)으로 바꾼다. 네이버 블로그가 아닌 출처(티스토리 등)는
// 이 함수가 다루는 범위가 아니므로 null을 반환한다(추측으로 다른 사이트 구조까지
// 처리하려 하지 않음 — 제3장 제5조).
export function toMobileNaverBlogUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === 'm.blog.naver.com') return parsed.toString();
    if (parsed.hostname === 'blog.naver.com') {
      parsed.hostname = 'm.blog.naver.com';
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

// m.blog.naver.com 페이지의 원문 HTML에서 본문 텍스트만 뽑아낸다. 스마트에디터
// 버전에 따라 컨테이너 클래스/id가 달라 두 가지를 순서대로 시도한다 — 둘 다 없으면
// (비공개 글, 삭제된 글, 알 수 없는 새 형식 등) 추측하지 않고 null을 반환해 호출부가
// 기존 요약 스니펫으로 자연스럽게 폴백하게 한다.
export function extractBlogBodyText(html: string): string | null {
  let dom: JSDOM;
  try {
    dom = new JSDOM(html);
  } catch {
    return null;
  }

  const doc = dom.window.document;
  const container = doc.querySelector('.se-main-container') ?? doc.querySelector('#postViewArea');
  if (!container) return null;

  container.querySelectorAll('script, style').forEach((node) => node.remove());

  const text = (container.textContent ?? '').replace(ZERO_WIDTH_SPACE, '').replace(/\s+/g, ' ').trim();
  if (!text) return null;

  return text.length > MAX_BLOG_BODY_LENGTH ? `${text.slice(0, MAX_BLOG_BODY_LENGTH)}...` : text;
}
