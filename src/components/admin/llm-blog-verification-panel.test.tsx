import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LlmBlogVerificationPanel } from './llm-blog-verification-panel';

// [LLM 기반 블로그 큐레이션 매장 검증](2026-09-15 사용자 지시, implementation/todo.md
// [개선사항 8]) 단위 테스트.
afterEach(() => vi.unstubAllGlobals());

it('상호명 입력칸에 스팟명이 기본값으로 채워진다', () => {
  render(<LlmBlogVerificationPanel defaultStoreName="행복식당" storeAddress="분당구 정자동" onApply={() => {}} />);
  expect(screen.getByPlaceholderText(/상호명/)).toHaveValue('행복식당');
});

it('LLM 분석 버튼을 누르면 API를 호출하고 결과를 보여준다', async () => {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    expect(url).toBe('/api/admin/spot-curations/llm-verify');
    const body = JSON.parse((init!.body as string));
    expect(body).toEqual({ store_name: '행복식당', store_address: '분당구 정자동' });
    return Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          result: {
            store_name: '행복식당',
            is_valid_match: true,
            has_high_chair: true,
            has_baby_tableware: false,
            space_type: 'mixed',
            confidence: 'high',
            evidence_summary: '아기의자 언급 확인',
          },
        }),
    } as Response);
  });
  vi.stubGlobal('fetch', fetchMock);
  const onApply = vi.fn();
  render(<LlmBlogVerificationPanel defaultStoreName="행복식당" storeAddress="분당구 정자동" onApply={onApply} />);

  fireEvent.click(screen.getByText('🤖 LLM 분석'));

  expect(await screen.findByText('✅ 매장 일치 확인됨')).toBeInTheDocument();
  expect(screen.getByText('🪑 아기의자: 있음')).toBeInTheDocument();
  expect(screen.getByText('🍽️ 유아식기: 언급 없음')).toBeInTheDocument();
  expect(screen.getByText(/아기의자 언급 확인/)).toBeInTheDocument();
  expect(onApply).toHaveBeenCalledWith(
    expect.objectContaining({ is_valid_match: true, has_high_chair: true, space_type: 'mixed' })
  );
});

it('매장 불일치 결과는 경고 문구로 보여준다', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            result: {
              store_name: '행복식당',
              is_valid_match: false,
              has_high_chair: false,
              has_baby_tableware: false,
              space_type: 'indoor',
              confidence: 'low',
              evidence_summary: '강남점 후기만 발견됨',
            },
          }),
      } as Response)
    )
  );
  render(<LlmBlogVerificationPanel defaultStoreName="행복식당" storeAddress={null} onApply={() => {}} />);

  fireEvent.click(screen.getByText('🤖 LLM 분석'));

  expect(await screen.findByText('⚠️ 매장 불일치(다른 지점/지역으로 판단됨)')).toBeInTheDocument();
});

it('분석 실패 시 에러 메시지를 보여준다', async () => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, json: () => Promise.resolve({ error: 'GEMINI_API_KEY 없음' }) } as Response)));
  render(<LlmBlogVerificationPanel defaultStoreName="행복식당" storeAddress={null} onApply={() => {}} />);

  fireEvent.click(screen.getByText('🤖 LLM 분석'));

  expect(await screen.findByText('GEMINI_API_KEY 없음')).toBeInTheDocument();
});

it('상호명이 비어 있으면 분석 버튼이 비활성화된다', () => {
  render(<LlmBlogVerificationPanel defaultStoreName="" storeAddress={null} onApply={() => {}} />);
  expect(screen.getByText('🤖 LLM 분석')).toBeDisabled();
});
