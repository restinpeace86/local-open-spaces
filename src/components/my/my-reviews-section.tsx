'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { listMyPosts, MomPickPost } from '@/lib/community/posts';
import { CHECKLIST_ITEMS } from '@/lib/community/checklist-items';
import {
  AGE_GROUP_LABELS,
  COMPANION_TYPE_LABELS,
  DURATION_TYPE_LABELS,
  INFRA_TAG_LABELS,
  SATISFACTION_POINT_LABELS,
  VISIT_ENVIRONMENT_LABELS,
  WEATHER_TAG_LABELS,
} from '@/lib/community/survey-options';

// [todo.md 개선사항7 - 맘스픽 마이페이지 C영역] "내가 쓴 후기" 리스트: 컴팩트 리스트로
// 세로 정렬하고, 클릭 시 상세 모달에서 "전체 설문 결과와 사진"을 보여준다(Decision 020 —
// survey_review 전용 컬럼). 기존 마이크로 리뷰/체크리스트 과거 데이터도 함께 섞여
// 나올 수 있어(post_type 무관하게 listMyPosts가 본인 글 전체를 가져옴) 그 타입도
// 상세 모달에서 읽을 수 있게 렌더링한다 — 과거 데이터라고 숨기지 않는다.
const CONTENT_PREVIEW_LENGTH = 28;

function spotOrEventName(post: MomPickPost): string {
  return post.open_spaces?.name ?? post.events?.name ?? '알 수 없는 장소';
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

function ReviewDetailModal({ post, onClose }: { post: MomPickPost; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 md:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-label="후기 상세"
        className="max-h-[85vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl md:w-[480px] md:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-gray-900">{spotOrEventName(post)}</h2>
            <p className="text-xs text-gray-400">{formatDate(post.created_at)}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기" className="shrink-0 text-gray-400 hover:text-gray-600">
            ✕
          </button>
        </div>

        {post.post_type === 'survey_review' ? (
          <div className="flex flex-col gap-3 text-sm">
            {(post.age_groups?.length ?? 0) > 0 && (
              <p>
                <span className="font-medium text-gray-700">몇 세 아이와 좋았나요: </span>
                {post.age_groups!.map((v) => AGE_GROUP_LABELS[v] ?? v).join(', ')}
              </p>
            )}
            {post.visit_environment && (
              <p>
                <span className="font-medium text-gray-700">방문 환경: </span>
                {VISIT_ENVIRONMENT_LABELS[post.visit_environment] ?? post.visit_environment}
              </p>
            )}
            {(post.satisfaction_points?.length ?? 0) > 0 && (
              <p>
                <span className="font-medium text-gray-700">만족 포인트: </span>
                {post.satisfaction_points!.map((v) => SATISFACTION_POINT_LABELS[v] ?? v).join(', ')}
              </p>
            )}
            {post.duration_type && (
              <p>
                <span className="font-medium text-gray-700">체류 시간: </span>
                {DURATION_TYPE_LABELS[post.duration_type] ?? post.duration_type}
              </p>
            )}
            {(post.weather_tags?.length ?? 0) > 0 && (
              <p>
                <span className="font-medium text-gray-700">날씨 추천: </span>
                {post.weather_tags!.map((v) => WEATHER_TAG_LABELS[v] ?? v).join(', ')}
              </p>
            )}
            {(post.infra_tags?.length ?? 0) > 0 && (
              <p>
                <span className="font-medium text-gray-700">인프라: </span>
                {post.infra_tags!.map((v) => INFRA_TAG_LABELS[v] ?? v).join(', ')}
              </p>
            )}
            {post.companion_type && (
              <p>
                <span className="font-medium text-gray-700">동반 형태: </span>
                {COMPANION_TYPE_LABELS[post.companion_type] ?? post.companion_type}
              </p>
            )}
            {post.content && <p className="whitespace-pre-wrap text-gray-700">{post.content}</p>}
            {post.photo_urls && post.photo_urls.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {post.photo_urls.map((url) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={url} src={url} alt="후기 사진" className="h-24 w-24 rounded-lg object-cover" />
                ))}
              </div>
            )}
          </div>
        ) : post.post_type === 'micro_review' ? (
          <div className="flex flex-col gap-2 text-sm">
            <p className="text-yellow-400">
              {'★'.repeat(post.rating ?? 0)}
              {'☆'.repeat(5 - (post.rating ?? 0))}
            </p>
            {post.content && <p className="text-gray-700">{post.content}</p>}
          </div>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {CHECKLIST_ITEMS.filter((item) => post.checklist_answers?.[item.key]).map((item) => (
              <li key={item.key} className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700">
                ✓ {item.label}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function MyReviewsSection({ userId }: { userId: string }) {
  const [posts, setPosts] = useState<MomPickPost[] | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedPost, setSelectedPost] = useState<MomPickPost | null>(null);

  useEffect(() => {
    let cancelled = false;
    listMyPosts(userId)
      .then((data) => {
        if (!cancelled) setPosts(data);
      })
      .catch((err) => {
        if (!cancelled) setErrorMessage(err instanceof Error ? err.message : '후기 목록을 불러오지 못했습니다.');
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-bold text-gray-900">내가 쓴 후기{posts ? ` (총 ${posts.length}건)` : ''}</h2>

      {errorMessage && <p className="text-xs text-red-600">{errorMessage}</p>}

      {!errorMessage && posts === null && <p className="text-xs text-gray-400">불러오는 중...</p>}

      {posts && posts.length === 0 && (
        <div className="flex flex-col items-start gap-2 rounded-xl border border-dashed border-gray-300 p-4">
          <p className="text-sm text-gray-500">아직 작성한 후기가 없어요. 첫 후기를 남기고 챗봇을 무제한으로 이용해 보세요!</p>
          <Link href="/mom-pick" className="rounded-full bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700">
            첫 후기 쓰러 가기
          </Link>
        </div>
      )}

      {posts && posts.length > 0 && (
        <ul className="flex flex-col divide-y divide-gray-100 rounded-xl border border-gray-100">
          {posts.map((post) => (
            <li key={post.id}>
              <button
                type="button"
                onClick={() => setSelectedPost(post)}
                className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left hover:bg-gray-50"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-gray-800">{spotOrEventName(post)}</span>
                  <span className="block text-xs text-gray-400">{formatDate(post.created_at)}</span>
                  {post.content && (
                    <span className="mt-0.5 block truncate text-xs text-gray-500">
                      {post.content.length > CONTENT_PREVIEW_LENGTH
                        ? `${post.content.slice(0, CONTENT_PREVIEW_LENGTH)}...`
                        : post.content}
                    </span>
                  )}
                </span>
                {post.photo_urls && post.photo_urls.length > 0 && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={post.photo_urls[0]} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {selectedPost && <ReviewDetailModal post={selectedPost} onClose={() => setSelectedPost(null)} />}
    </div>
  );
}
