// [찜 상태감시 브랜드별 재확인 로직] parseLottemartDetailPageStatus() 단위
// 테스트. 실측 표본 그대로(기존 lottemart-culture-club-status-watch.test.mjs
// 에서 이전).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { chunkArray, fetchEmartStatusesBatch, parseLottemartDetailPageStatus } from './culture-club-status-fetchers.mjs';

function wrapHtml(buttonHtml) {
  return `<html><body><div class="btn-area">
    <a href="#none" onclick="fn_addWish('X', 'Y', 'Z');" class="btn btn-w">찜하기</a>
    <a href="#none" onclick="fn_courseCart('X', 'T');" class="btn btn-w bd-r">강좌바구니</a>
    ${buttonHtml}
  </div></body></html>`;
}

describe('parseLottemartDetailPageStatus', () => {
  it('바로신청(fn_courseApp)을 인식한다', () => {
    const html = wrapHtml(`<a href="#none" onclick="fn_courseApp('X', 'Z', 'T');" class="btn btn-status-red">바로신청</a>`);
    expect(parseLottemartDetailPageStatus(html)).toBe('바로신청');
  });

  it('대기자신청(fn_waitAppPopOpen)을 인식한다', () => {
    const html = wrapHtml(
      `<a href="#none" onclick="fn_waitAppPopOpen('고양점', 'X', '제목', '2026.10.08 ~ 2026.11.26', '문화센터')" class="btn  btn-status-red">대기자 신청</a>`
    );
    expect(parseLottemartDetailPageStatus(html)).toBe('대기자신청');
  });

  it('접수마감(fn_fieldCnsl(close), finish 접미사)을 인식한다', () => {
    const html = wrapHtml(`<a href="#none" onclick="fn_fieldCnsl('close');" class="btn btn-status-red finish">접수마감</a>`);
    expect(parseLottemartDetailPageStatus(html)).toBe('접수마감');
  });

  it('전화문의(fn_fieldCnsl(빈 문자열))를 인식한다', () => {
    const html = wrapHtml(`<a href="#none" onclick="fn_fieldCnsl('');" class="btn btn-status-red">전화문의</a>`);
    expect(parseLottemartDetailPageStatus(html)).toBe('전화문의');
  });

  it('현장접수(onclick 없음, 텍스트만)를 인식한다', () => {
    const html = wrapHtml(`<a href="#none" class="btn btn-status-red">현장접수</a>`);
    expect(parseLottemartDetailPageStatus(html)).toBe('현장접수');
  });

  it('상태 버튼이 아예 없으면 접수마감으로 처리한다(안전한 기본값)', () => {
    const html = wrapHtml('');
    expect(parseLottemartDetailPageStatus(html)).toBe('접수마감');
  });
});

describe('chunkArray', () => {
  it('지정한 크기로 배열을 나눈다', () => {
    expect(chunkArray([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('크기가 배열보다 크면 청크 1개로 둔다', () => {
    expect(chunkArray([1, 2], 10)).toEqual([[1, 2]]);
  });
});

// [이마트 상태 배치 조회 — 실측 확인](2026-10-08) classId 필터에 여러 개를
// 배열로 넣으면 한 요청으로 여러 class_id의 소속 버킷을 동시에 알 수 있다.
describe('fetchEmartStatusesBatch', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function jsonResponse(matchedClassIds) {
    return {
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ data: { getClassByFiltering: { total: matchedClassIds.length, data: matchedClassIds.map((classId) => ({ classId })) } } })),
    };
  }

  it('버킷별로 매칭된 class_id를 그 버킷의 상태로, 매칭 안 된 건 기본값(접수마감)으로 채운다', async () => {
    // 요청 순서는 EMART_STATUS_CHECK_ORDER(접수중→정원마감→접수대기) 고정.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(['A'])) // 접수중
      .mockResolvedValueOnce(jsonResponse(['B'])) // 정원마감
      .mockResolvedValueOnce(jsonResponse([])); // 접수대기
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchEmartStatusesBatch({ apiKey: 'key', classIds: ['A', 'B', 'C'], pacingDelayMs: () => 0 });

    expect(result.get('A')).toBe('접수중');
    expect(result.get('B')).toBe('정원마감');
    expect(result.get('C')).toBe('접수마감');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('classIds가 chunkSize를 넘으면 여러 청크로 나눠 요청한다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]));
    vi.stubGlobal('fetch', fetchMock);

    const classIds = Array.from({ length: 5 }, (_, i) => `id${i}`);
    await fetchEmartStatusesBatch({ apiKey: 'key', classIds, pacingDelayMs: () => 0, chunkSize: 2 });

    // 5개를 chunkSize=2로 나누면 3청크(2+2+1) × 상태 3개 = 9회 요청.
    expect(fetchMock).toHaveBeenCalledTimes(9);
  });

  it('apiKey가 없으면 바로 에러를 던진다', async () => {
    await expect(fetchEmartStatusesBatch({ apiKey: undefined, classIds: ['A'] })).rejects.toThrow(
      /EMART_CULTURE_CLUB_API_KEY/
    );
  });
});
