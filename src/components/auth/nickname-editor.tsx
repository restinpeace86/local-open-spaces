'use client';

import { useState } from 'react';
import { updateNickname } from '@/lib/auth/profile';

const MAX_NICKNAME_LENGTH = 20;

// [맘스픽 메인 화면 기획](2026-09-02 사용자 지시): 파워맘/우수맘 추천 카드에 "작성자의
// 닉네임" 표시가 필수라 실명/이메일 대신 쓸 공개 식별자가 필요했다(profiles.nickname
// 신규 컬럼). BirthYearsEditor와 동일한 최소 폼 패턴.
export function NicknameEditor({ initialNickname }: { initialNickname: string | null }) {
  const [nickname, setNickname] = useState(initialNickname ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSave() {
    setIsSaving(true);
    setMessage(null);
    try {
      await updateNickname(nickname);
      setMessage('저장했어요.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '저장에 실패했습니다.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-gray-700">닉네임</span>
      <p className="text-xs text-gray-400">맘스픽 커뮤니티에 이 이름으로 표시돼요. 설정하지 않으면 "이름 없는 맘"으로 보여요.</p>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={nickname}
          onChange={(e) => setNickname(e.target.value.slice(0, MAX_NICKNAME_LENGTH))}
          placeholder="예: 민지맘"
          className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="shrink-0 rounded-full bg-gray-900 px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          {isSaving ? '저장 중...' : '저장'}
        </button>
      </div>
      {message && <p className="text-xs text-gray-500">{message}</p>}
    </div>
  );
}
