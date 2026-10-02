import '@testing-library/jest-dom';

// [펼침 스크롤 포커스 버그 수정](2026-10-02): jsdom은 Element.prototype.scrollIntoView를
// 구현하지 않아(실제 브라우저에만 존재) 이를 호출하는 컴포넌트(nearby-amenities-section.tsx
// 등)의 테스트가 "scrollIntoView is not a function"으로 깨진다 — 전역 no-op으로 메워둔다.
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
