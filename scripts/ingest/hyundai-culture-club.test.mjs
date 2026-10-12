import { describe, expect, it, vi } from 'vitest';

vi.mock('./lib/fetch-with-timeout.mjs', () => ({
  fetchWithTimeout: vi.fn(),
}));

const { looksLikeSuspiciousEmptyResponse } = await import('./hyundai-culture-club.mjs');

describe('looksLikeSuspiciousEmptyResponse', () => {
  it('실측으로 확인된 진짜 "검색결과 없음" 응답(no_result 마커 포함)은 의심하지 않는다', () => {
    const realEmptyResponse = '<div class="no_result"><p>입력하신 단어로 검색된 강좌가 없습니다.</p></div>';
    expect(looksLikeSuspiciousEmptyResponse(realEmptyResponse, 0)).toBe(false);
  });

  it('강좌가 1건 이상 있으면(정상 데이터) 의심하지 않는다', () => {
    const html = '<li><a href="CT010100_V.do?crsSqNo=1">정상 데이터</a></li>';
    expect(looksLikeSuspiciousEmptyResponse(html, 1)).toBe(false);
  });

  it('강좌가 0건인데 no_result 마커가 없으면(차단/공지 페이지 등) 의심한다', () => {
    const blockLikeHtml = '<html><body>일시적으로 접속이 원활하지 않습니다.</body></html>';
    expect(looksLikeSuspiciousEmptyResponse(blockLikeHtml, 0)).toBe(true);
  });
});
