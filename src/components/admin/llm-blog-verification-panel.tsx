'use client';

import { useState } from 'react';
import { LlmVerificationResult } from '@/lib/admin/llm-blog-verification';

// [LLM 기반 블로그 큐레이션 매장 검증](2026-09-15 사용자 지시, implementation/todo.md
// [개선사항 8]): "구현위치: '블로그로 큐레이션' 팝업, 뱃지들 바로 아래쪽... 관리자가
// 상호명을 건네주면, 받을 수 있는 입력칸과 LLM 분석 버튼... 결과 확인(사용자): 관리자는
// 그 복잡한 과정을 볼 필요 없이, AI가 분석해서 쏙쏙 채워준 최종 결과(자동완성된 폼)만
// 딱 받아보고 컨펌하면 끝입니다!" — 6개 블로그 검색 자체는 화면에 표시하지 않고
// (요청 원문 "화면현시는 하지 않음"), 최종 분석 결과만 확인용으로 보여준다.
//
// [적용 범위: open_spaces 전용] events는 curation_badges 개념 자체가 없어(스팟 전용,
// spot_curations 테이블) "뱃지들 바로 아래"라는 삽입 기준점이 없다 — 이 패널은
// BlogCurationModal(open_spaces)에만 연결한다. implementation 기록에 사유 명시.
export function LlmBlogVerificationPanel({
  defaultStoreName,
  storeAddress,
  onApply,
}: {
  defaultStoreName: string;
  storeAddress: string | null;
  onApply: (result: LlmVerificationResult) => void;
}) {
  const [storeName, setStoreName] = useState(defaultStoreName);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<LlmVerificationResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleAnalyze() {
    if (isAnalyzing || !storeName.trim()) return;
    setIsAnalyzing(true);
    setErrorMessage(null);
    setResult(null);
    try {
      const res = await fetch('/api/admin/spot-curations/llm-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_name: storeName.trim(), store_address: storeAddress }),
      });
      const data: { result?: LlmVerificationResult; error?: string } = await res.json();
      if (!res.ok || !data.result) throw new Error(data.error ?? 'LLM 분석에 실패했습니다.');
      setResult(data.result);
      onApply(data.result);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'LLM 분석에 실패했습니다.');
    } finally {
      setIsAnalyzing(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-purple-200 bg-purple-50/40 p-3">
      <p className="text-xs font-semibold text-purple-800">🤖 LLM 매장 검증 (블로그 6건 자동 분석)</p>
      <div className="flex gap-1.5">
        <input
          value={storeName}
          onChange={(e) => setStoreName(e.target.value)}
          placeholder="상호명(네이버 검색용, 필요 시 수정)"
          className="flex-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
        <button
          type="button"
          onClick={handleAnalyze}
          disabled={isAnalyzing || !storeName.trim()}
          className="rounded-lg bg-purple-600 text-white text-xs font-semibold px-3 py-1.5 disabled:opacity-50"
        >
          {isAnalyzing ? '분석 중...' : '🤖 LLM 분석'}
        </button>
      </div>

      {errorMessage && <p className="text-xs text-red-600">{errorMessage}</p>}

      {result && (
        <div className="rounded-lg bg-white border border-gray-200 p-2.5 text-xs text-gray-700 flex flex-col gap-1">
          <p className={`font-semibold ${result.is_valid_match ? 'text-emerald-700' : 'text-red-600'}`}>
            {result.is_valid_match ? '✅ 매장 일치 확인됨' : '⚠️ 매장 불일치(다른 지점/지역으로 판단됨)'}
            <span className="ml-1.5 text-gray-400 font-normal">신뢰도: {result.confidence}</span>
          </p>
          <p>🪑 아기의자: {result.has_high_chair ? '있음' : '언급 없음'}</p>
          <p>🍽️ 유아식기: {result.has_baby_tableware ? '있음' : '언급 없음'}</p>
          <p>🏠 공간 형태: {result.space_type === 'indoor' ? '실내' : result.space_type === 'outdoor' ? '야외' : '실내외 공존'}</p>
          {result.evidence_summary && <p className="text-gray-500">📝 {result.evidence_summary}</p>}
        </div>
      )}
    </div>
  );
}
