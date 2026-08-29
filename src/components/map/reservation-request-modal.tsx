'use client';

import { useEffect, useState } from 'react';

const TODAY_STR = new Date().toISOString().slice(0, 10);

// [스팟 자체 간편 예약/신청 시스템 MVP](2026-08-29 사용자 지시): 공식 홈페이지가 없는
// 스팟(DetailModal에서 info_url이 없을 때)을 위한 자체 신청 폼 — 날짜/인원수/연락처
// 3개 항목만 받는 최소 구성이다(MVP, 제3장 제3조). 배경 클릭/X 버튼으로 닫히는 기존
// 바텀시트 관례(map-preview-modal.tsx 등)를 그대로 따르되, DetailModal 위에 또 뜨는
// 모달이라 z-index를 한 단계 더 높게 둔다(DetailModal은 z-50).
//
// [예약 신청 폼 UI/UX 고도화](2026-08-29 사용자 지시 후속): 필드별로 구체적인 안내
// 메시지를 주도록 검증을 정교화하고, 이중 제출을 확실히 막고, 접수 성공 시 브라우저
// alert() 대신 모달 안에서 완료 화면을 잠깐 보여준 뒤 부드럽게 닫히도록 다듬었다.
const SUCCESS_CLOSE_DELAY_MS = 1800;

type SubmitStatus = 'idle' | 'submitting' | 'success';

function validate(visitDate: string, headcountInput: string, contact: string): string | null {
  if (!visitDate) return '방문 날짜를 선택해 주세요.';
  const headcount = Number(headcountInput);
  if (!headcountInput.trim() || !Number.isFinite(headcount) || headcount < 1) {
    return '신청 인원은 1명 이상의 숫자로 입력해 주세요.';
  }
  if (!contact.trim()) return '연락처를 입력해 주세요.';
  return null;
}

export function ReservationRequestModal({
  spotId,
  spotName,
  onClose,
}: {
  spotId: string;
  spotName: string;
  onClose: () => void;
}) {
  const [visitDate, setVisitDate] = useState('');
  // 인원 수를 number로 곧바로 들고 있으면 0/빈 값을 입력하는 순간 자동으로 1로 되돌아가
  // 버려(이전 구현) "0명 이하 입력 시 안내 문구"를 실제로 보여줄 방법이 없었다 — 문자열로
  // 그대로 받아두고 제출 시점에 한 번에 검증한다.
  const [headcountInput, setHeadcountInput] = useState('1');
  const [contact, setContact] = useState('');
  const [submitStatus, setSubmitStatus] = useState<SubmitStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isSubmitting = submitStatus === 'submitting';

  // 접수 성공 화면을 잠깐 보여준 뒤 부드럽게 닫는다(요구사항: "곧바로 닫히기보다 깔끔한
  // 완료 메시지나 부드러운 피드백을 주고 닫히도록").
  useEffect(() => {
    if (submitStatus !== 'success') return undefined;
    const timer = setTimeout(onClose, SUCCESS_CLOSE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [submitStatus, onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // 버튼 disabled 속성과 별개로, 네트워크 응답을 기다리는 동안 재제출 자체를 막는
    // 이중 방어선이다(요구사항: "네트워크 통신 중 중복 제출을 완벽히 차단").
    if (isSubmitting) return;

    const validationError = validate(visitDate, headcountInput, contact);
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setSubmitStatus('submitting');
    setErrorMessage(null);
    try {
      const res = await fetch('/api/reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spot_id: spotId,
          visit_date: visitDate,
          headcount: Number(headcountInput),
          contact: contact.trim(),
        }),
      });
      const data: { error?: string } = await res.json();
      if (!res.ok) throw new Error(data.error ?? '신청 접수에 실패했습니다.');

      setSubmitStatus('success');
    } catch (err) {
      setSubmitStatus('idle');
      setErrorMessage(err instanceof Error ? err.message : '신청 접수에 실패했습니다.');
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 z-[60] flex items-end md:items-center justify-center"
      onClick={onClose}
    >
      <div
        className="w-full md:w-[420px] max-h-[85vh] overflow-y-auto bg-white rounded-t-2xl md:rounded-2xl shadow-xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-bold text-gray-900">📝 간편 예약/신청</h2>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 text-gray-400 hover:text-gray-600"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        {submitStatus === 'success' ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
            <span className="text-4xl" aria-hidden>
              ✅
            </span>
            <p className="text-base font-semibold text-gray-900">신청이 접수되었습니다!</p>
            <p className="text-sm text-gray-500">담당자 확인 후 입력하신 연락처로 연락드릴게요.</p>
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-500 mb-1 line-clamp-1">{spotName}</p>
            {/* [UX 고도화](2026-08-29 사용자 지시): 왜 이 폼을 채워야 하는지, 이후 어떻게
                되는지 미리 안내해 유저가 안심하고 입력할 수 있게 한다. */}
            <p className="text-xs text-gray-400 mb-4">
              전화나 방문 없이 간편하게 무료 예약 신청을 남겨보세요. 담당자 확인 후 연락드립니다.
            </p>

            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-gray-700">방문 날짜</span>
                <input
                  type="date"
                  value={visitDate}
                  min={TODAY_STR}
                  onChange={(e) => setVisitDate(e.target.value)}
                  required
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>

              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-gray-700">인원 수</span>
                <input
                  type="number"
                  min={1}
                  value={headcountInput}
                  onChange={(e) => setHeadcountInput(e.target.value)}
                  required
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>

              {/* [UX 고도화] 힌트 문구(<span>)를 <label> 밖에 형제로 둔 이유: label 안에
                  텍스트를 더 넣으면 testing-library 등 접근성 트리 계산상 label의 "이름"이
                  "연락처"가 아니라 힌트 문구까지 합쳐진 문자열이 돼 버려(실측 확인),
                  <label for>/id 없는 래핑 라벨 패턴에서 라벨 텍스트가 흐려진다. */}
              <div className="flex flex-col gap-1 text-sm">
                <label className="flex flex-col gap-1">
                  <span className="font-medium text-gray-700">연락처</span>
                  <input
                    type="tel"
                    value={contact}
                    onChange={(e) => setContact(e.target.value)}
                    placeholder="010-0000-0000"
                    required
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </label>
                <span className="text-xs text-gray-400">예: 010-1234-5678 형식으로 입력해 주세요.</span>
              </div>

              {errorMessage && <p className="text-xs text-red-600">{errorMessage}</p>}

              <button
                type="submit"
                disabled={isSubmitting}
                className="mt-2 rounded-lg bg-blue-600 text-white text-sm font-semibold py-2.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? '접수 중...' : '신청 접수하기'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
