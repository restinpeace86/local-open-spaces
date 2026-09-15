'use client';

import { useEffect, useState } from 'react';
import { PriceCandidate, PriceCandidateSource } from '@/lib/admin/event-price-candidates';

// [이벤트/체험 스팟 다중 소스 가격 수집 및 관리자 검증 UI](2026-09-15 사용자 지시,
// implementation/todo.md [개선사항 6]): "블로그 큐레이션 버튼과 동일 레벨로 가격
// 큐레이션 버튼이 존재하여야 함" — raw-data-modal.tsx의 events 상세 팝업에서
// EventBlogCurationModal과 나란히 여는 신규 모달. 소스1(블로그)은 이미 존재하는
// EventBlogCurationModal이 curated_blog_urls/price_text를 채워두므로, 여기서는 그
// 결과를 카드로 보여주기만 하고 블로그 검색 UI 자체를 다시 만들지 않는다(제5장
// 제4조 기존 구조 우선).
const SOURCE_LABELS: Record<PriceCandidateSource, string> = {
  blog: '1️⃣ 블로그 큐레이션 소스',
  description: '2️⃣ 원천 소스 상세 설명 파싱',
  official_site: '3️⃣ 공식 홈페이지 크롤링',
  raw_field: '4️⃣ 정형 요금 필드',
};

const STATUS_LABELS: Record<PriceCandidate['status'], string> = {
  found: '🟢 가격/연령 감지됨',
  not_found: '⚪ 데이터 없음',
  error: '🔴 수집 실패',
};

const PRICE_TYPE_OPTIONS: Array<{ value: 'free' | 'paid' | 'variable'; label: string }> = [
  { value: 'free', label: '무료' },
  { value: 'paid', label: '유료' },
  { value: 'variable', label: '변동' },
];

function CandidateCard({ candidate, onOpenExcerpt }: { candidate: PriceCandidate; onOpenExcerpt: (text: string) => void }) {
  return (
    <div className="rounded-xl border border-gray-200 p-3 flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-900">{SOURCE_LABELS[candidate.source]}</span>
        <span className="text-xs">{STATUS_LABELS[candidate.status]}</span>
      </div>
      {candidate.priceText && (
        <p className="text-sm text-gray-800">
          💰 <span className="font-medium">{candidate.priceText}</span>
        </p>
      )}
      {/* [연령별 가격 구간 파싱](2026-09-15 사용자 보완 지시): "성인 15,000원 / 36개월
          미만 무료 / 아동 5,000원"처럼 가격이 연령별로 나뉘어 있으면, 유저 화면 노출
          목적이 아니라 최종 확정 시 "아동 5,000원이 몇 세부터 몇 세까지인지" 관리자가
          바로 알 수 있도록 라벨(연령/대상)과 금액을 짝지어 보여준다. */}
      {candidate.priceTiers && candidate.priceTiers.length > 0 && (
        <ul className="flex flex-col gap-0.5 pl-1">
          {candidate.priceTiers.map((tier, i) => (
            <li key={`${tier.label}-${i}`} className="text-xs text-gray-700">
              · {tier.label}: {tier.isFree ? '무료' : `${tier.priceWon.toLocaleString()}원`}
            </li>
          ))}
        </ul>
      )}
      {candidate.ageText && <p className="text-xs text-gray-500">👶 연령 힌트: {candidate.ageText}</p>}
      {candidate.errorMessage && <p className="text-xs text-red-500">오류: {candidate.errorMessage}</p>}
      {candidate.source === 'raw_field' && candidate.rawFieldName && (
        <p className="text-xs text-gray-400">원천 필드: raw_data.{candidate.rawFieldName}</p>
      )}
      <div className="flex gap-3 mt-0.5">
        {(candidate.source === 'blog' || candidate.source === 'official_site') && candidate.sourceUrl && (
          <a
            href={candidate.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-semibold text-blue-600 hover:underline"
          >
            {candidate.source === 'blog' ? '수집된 블로그 글 확인하기' : '공식 홈페이지 열기'} ↗
          </a>
        )}
        {candidate.excerpt && (
          <button type="button" onClick={() => onOpenExcerpt(candidate.excerpt!)} className="text-xs font-semibold text-gray-600 hover:underline">
            원문 전체 보기
          </button>
        )}
      </div>
    </div>
  );
}

export function EventPriceCurationModal({
  event,
  onClose,
  onSaved,
}: {
  event: { id: string; title: string };
  onClose: () => void;
  onSaved?: (eventId: string) => void;
}) {
  const [candidates, setCandidates] = useState<PriceCandidate[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [excerptModal, setExcerptModal] = useState<string | null>(null);

  const [finalPriceType, setFinalPriceType] = useState<'free' | 'paid' | 'variable' | null>(null);
  const [finalAgeText, setFinalAgeText] = useState('');
  const [finalPriceText, setFinalPriceText] = useState('');
  const [adminNote, setAdminNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/admin/events/price-candidates?event_id=${encodeURIComponent(event.id)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? '가격 후보 수집에 실패했습니다.');
        setCandidates(data.candidates ?? []);
        if (data.final) {
          setFinalPriceType(data.final.final_price_type ?? null);
          setFinalAgeText(data.final.final_age_text ?? '');
          setFinalPriceText(data.final.final_price_text ?? '');
          setAdminNote(data.final.admin_note ?? '');
        }
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : '가격 후보 수집에 실패했습니다.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.id]);

  async function handleSave() {
    if (isSaving) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      const res = await fetch('/api/admin/events/price-candidates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_id: event.id,
          candidates: candidates ?? [],
          final_price_type: finalPriceType,
          final_age_text: finalAgeText || null,
          final_price_text: finalPriceText || null,
          admin_note: adminNote || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '가격 정보 저장에 실패했습니다.');
      onSaved?.(event.id);
      onClose();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : '가격 정보 저장에 실패했습니다.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-[70] flex items-end md:items-center justify-center">
      <div className="w-full md:w-[560px] max-h-[90vh] overflow-y-auto bg-white rounded-t-2xl md:rounded-2xl shadow-xl p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-gray-900">💰 가격 및 이용요금 다중 소스 검증</h2>
            <p className="text-xs text-gray-500">{event.title}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기" className="text-gray-400 hover:text-gray-600">
            ✕
          </button>
        </div>

        <p className="text-xs text-gray-500">각 소스별로 자동 수집된 가격 후보입니다. 원문을 확인 후 최종 가격을 확정해 주세요.</p>

        {loadError && <p className="text-sm text-red-500">{loadError}</p>}
        {!candidates && !loadError && <p className="text-sm text-gray-400">수집 중...</p>}

        {candidates && (
          <div className="flex flex-col gap-2">
            {candidates.map((candidate) => (
              <CandidateCard key={candidate.source} candidate={candidate} onOpenExcerpt={setExcerptModal} />
            ))}
            {/* [소스5 검토 결과](요청 원문 "그 외 방법 제안, 없으면 없다고 하기"):
                코드베이스 전체를 조사한 결과 위 4개 소스 외에 이 서비스가 이미
                보유한 독립적인 가격 정보원은 없었다 — 정형 요금 필드(USE_FEE/
                PARTCPT_EXPN_INFO)가 없는 소스(TOUR_API_FESTIVAL 등)의 유일한
                대안은 이미 소스2/3(설명/공식 홈페이지)이 커버한다. */}
            <p className="text-[11px] text-gray-400">
              ℹ️ 소스 5(그 외 방법): 코드베이스 조사 결과 위 4개 소스 외에 별도로 존재하는 가격 정보원은
              없었습니다(정형 필드가 없는 원천은 설명/공식 홈페이지 파싱이 이미 대안입니다).
            </p>
          </div>
        )}

        <div className="border-t border-gray-200 pt-3 flex flex-col gap-2">
          <h3 className="text-sm font-bold text-gray-900">최종 확정</h3>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 w-20 shrink-0">유무료 여부</span>
            <div className="flex gap-1.5">
              {PRICE_TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setFinalPriceType((prev) => (prev === opt.value ? null : opt.value))}
                  className={`rounded-full px-3 py-1 text-xs font-semibold border ${
                    finalPriceType === opt.value ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-gray-500">최종 연령 기준</span>
            <input
              value={finalAgeText}
              onChange={(e) => setFinalAgeText(e.target.value)}
              placeholder="예: 36개월 이상, 초등학생 이하"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-gray-500">최종 가격 텍스트</span>
            <input
              value={finalPriceText}
              onChange={(e) => setFinalPriceText(e.target.value)}
              placeholder="예: 성인 12,000원 / 아동 8,000원"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-gray-500">추가 메모</span>
            <textarea
              value={adminNote}
              onChange={(e) => setAdminNote(e.target.value)}
              rows={2}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>
          {saveError && <p className="text-xs text-red-500">{saveError}</p>}
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="mt-1 rounded-xl bg-gray-900 text-white text-sm font-semibold py-2.5 disabled:opacity-50"
          >
            {isSaving ? '저장 중...' : '💾 가격 정보 최종 확정 및 저장'}
          </button>
        </div>
      </div>

      {excerptModal && (
        <div className="fixed inset-0 bg-black/60 z-[80] flex items-center justify-center p-4" onClick={() => setExcerptModal(null)}>
          <div
            className="w-full md:w-[480px] max-h-[80vh] overflow-y-auto bg-white rounded-2xl shadow-xl p-4 whitespace-pre-line text-sm text-gray-700"
            onClick={(e) => e.stopPropagation()}
          >
            {excerptModal}
          </div>
        </div>
      )}
    </div>
  );
}
