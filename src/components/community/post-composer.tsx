'use client';

import { useState } from 'react';
import { SpotPicker, SpotOption } from './spot-picker';
import { createChecklistPost, createMicroReview, MomPickPost } from '@/lib/community/posts';
import { CHECKLIST_ITEMS, ChecklistAnswers, emptyChecklistAnswers } from '@/lib/community/checklist-items';

// [Decision 019](2026-09-02) / spec/community/mom-pick-grades.md 3-4·3-5: 마이크로 리뷰
// (별점 1~5 + 선택적 한줄 텍스트) 또는 체크리스트(공통 5항목) 작성 폼.
type PostType = 'micro_review' | 'checklist';

const CONTENT_MAX_LENGTH = 80;

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-1" role="radiogroup" aria-label="별점">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          role="radio"
          aria-checked={value === star}
          onClick={() => onChange(star)}
          className={`text-2xl leading-none ${star <= value ? 'text-yellow-400' : 'text-gray-200'}`}
        >
          ★
        </button>
      ))}
    </div>
  );
}

export function PostComposer({ onPosted }: { onPosted: (post: MomPickPost) => void }) {
  const [postType, setPostType] = useState<PostType>('micro_review');
  const [spot, setSpot] = useState<SpotOption | null>(null);
  const [rating, setRating] = useState(0);
  const [content, setContent] = useState('');
  const [checklistAnswers, setChecklistAnswers] = useState<ChecklistAnswers>(emptyChecklistAnswers());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function resetForm() {
    setSpot(null);
    setRating(0);
    setContent('');
    setChecklistAnswers(emptyChecklistAnswers());
  }

  async function handleSubmit() {
    setErrorMessage(null);
    if (!spot) {
      setErrorMessage('먼저 스팟을 검색해서 선택해주세요.');
      return;
    }
    if (postType === 'micro_review' && rating === 0) {
      setErrorMessage('별점을 선택해주세요.');
      return;
    }

    setIsSubmitting(true);
    try {
      const post =
        postType === 'micro_review'
          ? await createMicroReview({ spotId: spot.id, rating, content })
          : await createChecklistPost({ spotId: spot.id, answers: checklistAnswers });
      resetForm();
      onPosted(post);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : '작성에 실패했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setPostType('micro_review')}
          className={`flex-1 rounded-full px-3 py-1.5 text-sm font-medium ${
            postType === 'micro_review' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-500'
          }`}
        >
          ⭐ 마이크로 리뷰
        </button>
        <button
          type="button"
          onClick={() => setPostType('checklist')}
          className={`flex-1 rounded-full px-3 py-1.5 text-sm font-medium ${
            postType === 'checklist' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-500'
          }`}
        >
          ✅ 체크리스트
        </button>
      </div>

      <SpotPicker selected={spot} onSelect={setSpot} />

      {postType === 'micro_review' ? (
        <div className="flex flex-col gap-2">
          <StarRating value={rating} onChange={setRating} />
          <input
            type="text"
            value={content}
            onChange={(e) => setContent(e.target.value.slice(0, CONTENT_MAX_LENGTH))}
            placeholder="한줄 후기 (선택, 3초 컷!)"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-400"
          />
          <p className="text-right text-[11px] text-gray-300">
            {content.length}/{CONTENT_MAX_LENGTH}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {CHECKLIST_ITEMS.map((item) => (
            <label key={item.key} className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={checklistAnswers[item.key]}
                onChange={(e) => setChecklistAnswers((prev) => ({ ...prev, [item.key]: e.target.checked }))}
                className="h-4 w-4 rounded border-gray-300"
              />
              {item.label}
            </label>
          ))}
        </div>
      )}

      {errorMessage && <p className="text-xs text-red-600">{errorMessage}</p>}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={isSubmitting}
        className="rounded-full bg-indigo-600 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {isSubmitting ? '등록 중...' : '등록하기'}
      </button>
    </div>
  );
}
