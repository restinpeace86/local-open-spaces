'use client';

import { useState } from 'react';
import { DashboardPost } from '@/lib/community/mom-pick-dashboard';
import { GRADE_LABEL } from '@/lib/community/grades';
import { CHECKLIST_ITEMS } from '@/lib/community/checklist-items';
import {
  AGE_GROUP_LABELS,
  DURATION_TYPE_LABELS,
  SATISFACTION_POINT_LABELS,
  VISIT_ENVIRONMENT_LABELS,
} from '@/lib/community/survey-options';
import { PostPhotoModal } from './post-photo-modal';

// [맘스픽 메인 화면 기획](2026-09-02 사용자 지시): 3개 섹션(파워맘/우수맘 추천, 인기글,
// 실시간 피드) 전체보기 페이지와 메인 미리보기가 공유하는 카드. "작성자의 닉네임과...
// 등급 배지 필수 표시" 요구사항을 그대로 반영한다. 닉네임을 설정하지 않은 사용자는
// 실명/이메일을 노출하지 않고 "이름 없는 맘"으로 안전하게 대체한다.
//
// [맘스픽 게시글 카드 컴팩트화](2026-09-13 사용자 지시): "글 한개가 차지하는 공간이
// 너무 커.. 사진은 사진 보기 버튼으로 대체.. 제목 올렸으면 그 라인 우측에 닉네임과
// 등급이 보이던가.. tag들도 너무 많네" — (1) 스팟명(제목)과 작성자 닉네임/등급을
// 한 줄에 배치해 별도 줄 하나를 없애고, (2) 뱃지(태그)는 최대 3개만 보여주고
// 나머지는 "+N개"로 요약하며, (3) 사진은 인라인 썸네일 대신 "📷 사진 N장 보기"
// 버튼으로 대체해 눌렀을 때만 PostPhotoModal로 확인한다.
const MAX_VISIBLE_TAGS = 3;

function TagChips({ tags }: { tags: { key: string; label: string; className: string }[] }) {
  if (tags.length === 0) return null;
  const visible = tags.slice(0, MAX_VISIBLE_TAGS);
  const overflowCount = tags.length - visible.length;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {visible.map((tag) => (
        <li key={tag.key} className={`rounded-full px-2 py-0.5 text-[11px] ${tag.className}`}>
          {tag.label}
        </li>
      ))}
      {overflowCount > 0 && (
        <li className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-500">+{overflowCount}개</li>
      )}
    </ul>
  );
}

export function DashboardPostCard({ post, wide = false }: { post: DashboardPost; wide?: boolean }) {
  const [isPhotoModalOpen, setIsPhotoModalOpen] = useState(false);
  const photoUrls = post.photo_urls ?? [];

  const surveyTags =
    post.post_type === 'survey_review'
      ? [
          ...(post.age_groups ?? []).map((v) => ({ key: `age-${v}`, label: AGE_GROUP_LABELS[v] ?? v, className: 'bg-emerald-50 text-emerald-700' })),
          ...(post.visit_environment
            ? [{ key: 'env', label: VISIT_ENVIRONMENT_LABELS[post.visit_environment] ?? post.visit_environment, className: 'bg-sky-50 text-sky-700' }]
            : []),
          ...(post.duration_type
            ? [{ key: 'duration', label: DURATION_TYPE_LABELS[post.duration_type] ?? post.duration_type, className: 'bg-amber-50 text-amber-700' }]
            : []),
          ...(post.satisfaction_points ?? []).map((v) => ({
            key: `sat-${v}`,
            label: SATISFACTION_POINT_LABELS[v] ?? v,
            className: 'bg-indigo-50 text-indigo-700',
          })),
        ]
      : [];

  const checklistTags =
    post.post_type === 'checklist'
      ? CHECKLIST_ITEMS.filter((item) => post.checklist_answers?.[item.key]).map((item) => ({
          key: item.key,
          label: `✓ ${item.label}`,
          className: 'bg-emerald-50 text-emerald-700',
        }))
      : [];

  return (
    <div className={`rounded-xl border border-gray-200 bg-white p-3 ${wide ? 'flex flex-col gap-1.5' : ''}`}>
      {/* [제목 줄에 작성자/등급 함께 표시](2026-09-13 사용자 지시): 별도 줄을 없애
          카드 높이를 줄인다. */}
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-800">
          {post.is_adopted && <span className="mr-1">✨</span>}
          {post.spotName ?? '알 수 없는 스팟'}
        </p>
        <div className="flex shrink-0 items-center gap-1">
          <span className="text-xs text-gray-500">{post.author.nickname ?? '이름 없는 맘'}</span>
          <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-600">
            {GRADE_LABEL[post.author.grade]}
          </span>
        </div>
      </div>

      {post.post_type === 'micro_review' ? (
        <div className="mt-1 flex flex-col gap-1">
          <p className="text-yellow-400">
            {'★'.repeat(post.rating ?? 0)}
            {'☆'.repeat(5 - (post.rating ?? 0))}
          </p>
          {post.content && <p className="text-sm text-gray-600 line-clamp-2">{post.content}</p>}
        </div>
      ) : post.post_type === 'checklist' ? (
        <TagChips tags={checklistTags} />
      ) : (
        // [Decision 020](2026-09-04) survey_review: 설문 문항 뱃지는 최대 3개까지만
        // 보여주고 나머지는 "+N개"로 요약한다(카드가 과도하게 길어지지 않도록).
        <div className="mt-1 flex flex-col gap-1.5">
          <TagChips tags={surveyTags} />
          {post.content && <p className="text-sm text-gray-600 line-clamp-2">{post.content}</p>}
        </div>
      )}

      <div className="mt-1.5 flex items-center justify-between text-xs text-gray-400">
        <div className="flex items-center gap-2">
          <span>{new Date(post.created_at).toLocaleDateString('ko-KR')}</span>
          <span>❤️ {post.like_count}</span>
        </div>
        {photoUrls.length > 0 && (
          <button
            type="button"
            onClick={() => setIsPhotoModalOpen(true)}
            className="rounded-full bg-gray-100 px-2 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-200"
          >
            📷 사진 {photoUrls.length}장 보기
          </button>
        )}
      </div>

      {isPhotoModalOpen && <PostPhotoModal photoUrls={photoUrls} onClose={() => setIsPhotoModalOpen(false)} />}
    </div>
  );
}
