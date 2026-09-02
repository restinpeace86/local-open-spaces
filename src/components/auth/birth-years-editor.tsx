'use client';

import { useState } from 'react';
import { updateBirthYears } from '@/lib/auth/profile';

const CURRENT_YEAR = new Date().getFullYear();

// spec/common/auth-user-profile.md: "birth_years(자녀 출생년도 배열) 필드 포함"만 명시돼
// 있고 입력 UI 형태는 정의돼 있지 않다 — 자녀 수만큼 연도를 추가/삭제할 수 있는 가장
// 단순한 폼으로 구현한다(제3장 제4조 추측 금지: 더 복잡한 UI가 필요하면 별도 Spec으로
// 확정 후 확장).
export function BirthYearsEditor({ initialBirthYears }: { initialBirthYears: number[] }) {
  const [years, setYears] = useState<number[]>(initialBirthYears);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function handleChangeYear(index: number, value: string) {
    const year = Number(value);
    setYears((prev) => prev.map((y, i) => (i === index ? year : y)));
  }

  function handleAddYear() {
    setYears((prev) => [...prev, CURRENT_YEAR]);
  }

  function handleRemoveYear(index: number) {
    setYears((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSave() {
    setIsSaving(true);
    setMessage(null);
    try {
      const validYears = years.filter((y) => Number.isFinite(y) && y >= 1900 && y <= CURRENT_YEAR);
      await updateBirthYears(validYears);
      setYears(validYears);
      setMessage('저장했어요.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '저장에 실패했습니다.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-gray-700">자녀 출생년도</span>
      {years.length === 0 && <p className="text-xs text-gray-400">아직 등록된 자녀 출생년도가 없어요.</p>}
      {years.map((year, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            type="number"
            value={year}
            onChange={(e) => handleChangeYear(i, e.target.value)}
            min={1900}
            max={CURRENT_YEAR}
            className="w-28 rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
          />
          <button type="button" onClick={() => handleRemoveYear(i)} className="text-xs text-gray-400 hover:text-red-500">
            삭제
          </button>
        </div>
      ))}
      <button type="button" onClick={handleAddYear} className="self-start text-xs text-blue-600 hover:underline">
        + 자녀 출생년도 추가
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
