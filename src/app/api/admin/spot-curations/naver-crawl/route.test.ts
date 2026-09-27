import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

// [네이버 429 오진단 방지](2026-09-27 사용자 지시): "똑같이 막혀.. 네이버 플레이스
// 페이지를 가져오지 못했습니다(네트워크 오류 또는 존재하지 않는 장소)" — 실측
// 확인 결과 이 실패는 URL/장소 문제가 아니라 네이버 서버의 429(레이트리밋)였다.
// 상태 코드를 구분해 정확한 안내문을 주는지 검증한다.

function makeRequest(naverUrl: string) {
  return new Request('http://localhost/api/admin/spot-curations/naver-crawl', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ naverUrl }),
  });
}

describe('POST /api/admin/spot-curations/naver-crawl', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('홈/메뉴 페이지가 모두 429면 레이트리밋 안내문을 반환한다(URL이 틀렸다고 오해시키지 않음)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: false, status: 429, text: () => Promise.resolve('') } as Response))
    );

    const res = await POST(makeRequest('https://pcmap.place.naver.com/place/2000513092/review/visitor') as never);
    const data = await res.json();

    expect(res.status).toBe(502);
    expect(data.error).toContain('429');
    expect(data.error).not.toContain('존재하지 않는 장소');
  });

  it('429가 아닌 일반 실패(예: 404)는 기존 일반 안내문을 그대로 반환한다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: false, status: 404, text: () => Promise.resolve('') } as Response))
    );

    const res = await POST(makeRequest('https://pcmap.place.naver.com/restaurant/1107293125/home') as never);
    const data = await res.json();

    expect(res.status).toBe(502);
    expect(data.error).toContain('존재하지 않는 장소');
    expect(data.error).not.toContain('429');
  });

  it('네트워크 예외(fetch reject)로 둘 다 실패하면 기존 일반 안내문을 반환한다', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('network down'))));

    const res = await POST(makeRequest('https://pcmap.place.naver.com/restaurant/1107293125/home') as never);
    const data = await res.json();

    expect(res.status).toBe(502);
    expect(data.error).toContain('존재하지 않는 장소');
  });

  it('URL에서 장소 ID를 못 찾으면 429 여부와 무관하게 400을 반환한다', async () => {
    vi.stubGlobal('fetch', vi.fn());

    const res = await POST(makeRequest('https://example.com/no-place-id-here') as never);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain('장소 ID');
  });
});
