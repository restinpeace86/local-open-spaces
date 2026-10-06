'use client';

import { useState } from 'react';
import { updateBirthYearsAndMonths } from '@/lib/auth/profile';

const CURRENT_YEAR = new Date().getFullYear();
const CURRENT_MONTH = new Date().getMonth() + 1;
const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => i + 1);

// spec/common/auth-user-profile.md: "birth_years(자녀 출생년도 배열) 필드 포함"만 명시돼
// 있고 입력 UI 형태는 정의돼 있지 않다 — 자녀 수만큼 연도를 추가/삭제할 수 있는 가장
// 단순한 폼으로 구현한다(제3장 제4조 추측 금지: 더 복잡한 UI가 필요하면 별도 Spec으로
// 확정 후 확장).
//
// [개선사항4 - 출생 연+월 수집](2026-10-06 todo.md): complete-profile-view.tsx(최초
// 온보딩)와 동일하게 월도 함께 받는다 — 두 화면이 같은 birth_years/birth_months를
// 공유해 한쪽만 월을 안 받으면 다자녀 추가/삭제 시 두 배열의 인덱스가 어긋난다.
export function BirthYearsEditor({
  initialBirthYears,
  initialBirthMonths,
}: {
  initialBirthYears: number[];
  initialBirthMonths: number[];
}) {
  const [years, setYears] = useState<number[]>(initialBirthYears);
  // [레거시 데이터 방어] birth_months를 모르던 시절 저장된 프로필은 비어있거나
  // birth_years보다 짧을 수 있다 — 모자란 자리는 CURRENT_MONTH로 채운다.
  const [months, setMonths] = useState<number[]>(initialBirthYears.map((_, i) => initialBirthMonths[i] ?? CURRENT_MONTH));
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function handleChangeYear(index: number, value: string) {
    const year = Number(value);
    setYears((prev) => prev.map((y, i) => (i === index ? year : y)));
  }

  function handleChangeMonth(index: number, value: string) {
    const month = Number(value);
    setMonths((prev) => prev.map((m, i) => (i === index ? month : m)));
  }

  function handleAddYear() {
    setYears((prev) => [...prev, CURRENT_YEAR]);
    setMonths((prev) => [...prev, CURRENT_MONTH]);
  }

  function handleRemoveYear(index: number) {
    setYears((prev) => prev.filter((_, i) => i !== index));
    setMonths((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSave() {
    setIsSaving(true);
    setMessage(null);
    try {
      const validPairs = years
        .map((year, i) => ({ year, month: months[i] }))
        .filter(
          ({ year, month }) =>
            Number.isFinite(year) && year >= 1900 && year <= CURRENT_YEAR && Number.isInteger(month) && month >= 1 && month <= 12
        );
      const validYears = validPairs.map((p) => p.year);
      const validMonths = validPairs.map((p) => p.month);
      await updateBirthYearsAndMonths(validYears, validMonths);
      setYears(validYears);
      setMonths(validMonths);
      setMessage('저장했어요.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '저장에 실패했습니다.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-gray-700">자녀 출생년월</span>
      {years.length === 0 && <p className="text-xs text-gray-400">아직 등록된 자녀 출생년월이 없어요.</p>}
      {years.map((year, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            type="number"
            value={year}
            onChange={(e) => handleChangeYear(i, e.target.value)}
            min={1900}
            max={CURRENT_YEAR}
            aria-label={`아이 ${i + 1} 출생년도`}
            className="w-24 rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
          />
          <select
            value={months[i] ?? CURRENT_MONTH}
            onChange={(e) => handleChangeMonth(i, e.target.value)}
            aria-label={`아이 ${i + 1} 출생월`}
            className="w-20 rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
          >
            {MONTH_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {m}월
              </option>
            ))}
          </select>
          <button type="button" onClick={() => handleRemoveYear(i)} className="text-xs text-gray-400 hover:text-red-500">
            삭제
          </button>
        </div>
      ))}
      <button type="button" onClick={handleAddYear} className="self-start text-xs text-blue-600 hover:underline">
        + 자녀 출생년월 추가
      </button>
      <button
        type="button"
        onClick={handleSave}
        disabled={isSaving}
        className="mt-1 self-start rounded-full bg-gray-900 px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
      >
        {isSaving ? '저장 중...' : '저장'}
      </button>
      {message && <p className="text-xs text-gray-500">{message}</p>}
    </div>
  );
}
