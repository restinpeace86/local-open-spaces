'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useUser } from '@/hooks/use-user';
import { getMyProfile } from '@/lib/auth/profile';
import { getMyLikedPostIds, toggleLike } from '@/lib/community/posts';
import { canSeeLikeReactions, GRADE_LABEL, MomPickGrade } from '@/lib/community/grades';
import { DashboardPost } from '@/lib/community/mom-pick-dashboard';
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
import { PostPhotoModal } from './post-photo-modal';

// [맘스픽 프리뷰/상세 카드 분리](2026-09-13 사용자 지시): "프리뷰 카드 누르면
// 상세카드가 보이게 되는 구조면 되지 않을까?.. 일자도.. 굳이 프리뷰에서 볼일은
// 없지 않나?" — 프리뷰 카드(DashboardPostCard)에서 뺀 날짜/전체 내용/전체
// 태그(날씨·인프라·동반형태 포함)/사진/좋아요를 여기서 전부 보여준다. 필드
// 렌더링 방식은 마이페이지의 기존 상세 모달(my-reviews-section.tsx의
// ReviewDetailModal)과 동일한 관례를 따른다(제5장 제4조 기존 구조 우선) —
// 다만 그건 "내가 쓴 글"이라 작성자/좋아요가 필요 없고, 여기는 다른 사람 글도
// 보여줘야 해서 작성자 닉네임/등급과 좋아요 버튼을 추가한 별도 컴포넌트로 둔다.
function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

export function PostDetailModal({ post, onClose }: { post: DashboardPost; onClose: () => void }) {
  const { user } = useUser();
  const [myGrade, setMyGrade] = useState<MomPickGrade | null>(null);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(post.like_count);
  const [photoModalIndex, setPhotoModalIndex] = useState<number | null>(null);
  const photoUrls = post.photo_urls ?? [];

  // [찜(좋아요)은 상세 카드에서만](2026-09-13 사용자 지시): "찜기능은 상세
  // 카드쪽에서 찜 줄 수 있도록" — Decision 019(열심맘 이상만 좋아요 UI 노출,
  // mom-pick-feed.tsx의 기존 규칙과 동일)를 그대로 지킨다. 내 등급/이미 눌렀는지
  // 여부는 이 모달을 열 때만 조용히 조회한다(비로그인/새싹맘이면 user 또는
  // myGrade가 없어 자연히 숨겨짐).
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getMyProfile()
      .then((p) => {
        if (!cancelled && p) setMyGrade(p.grade);
      })
      .catch(() => {
        // 조회 실패해도 좋아요 버튼만 안 보일 뿐 상세 내용은 그대로 볼 수 있다.
      });
    getMyLikedPostIds([post.id])
      .then((ids) => {
        if (!cancelled) setLiked(ids.has(post.id));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user, post.id]);

  const showLikes = canSeeLikeReactions(myGrade);

  async function handleToggleLike() {
    const wasLiked = liked;
    setLiked(!wasLiked);
    setLikeCount((c) => c + (wasLiked ? -1 : 1));
    try {
      await toggleLike(post.id, wasLiked);
    } catch {
      // 실패하면 되돌린다(mom-pick-feed.tsx의 기존 낙관적 갱신 관례와 동일).
      setLiked(wasLiked);
      setLikeCount((c) => c + (wasLiked ? 1 : -1));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 md:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-label="게시글 상세"
        className="max-h-[85vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl md:w-[480px] md:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-bold text-gray-900">
              {post.is_adopted && <span className="mr-1">✨</span>}
              {post.spotName ?? '알 수 없는 스팟'}
            </h2>
            <p className="mt-0.5 text-xs text-gray-400">
              {post.author.nickname ?? '이름 없는 맘'} · {GRADE_LABEL[post.author.grade]} · {formatDate(post.created_at)}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기" className="shrink-0 text-gray-400 hover:text-gray-600">
            ✕
          </button>
        </div>

        {/* [맘스픽 상세 → 스팟픽 이동](2026-09-13 사용자 지시): "어쨌든 맘스픽으로
            부터 스팟픽의 해당 장소로 갈수 있어야해.. 상세카드내에 그게 있어야해" —
            지도 화면(detail-modal.tsx)의 기존 "📍 연결된 장소: ... ›" 행 버튼
            관례를 그대로 재사용한다(제5장 제4조). 헤더에 스팟명이 이미 보이므로
            이름을 반복하지 않고 "스팟픽에서 보기"로만 안내한다. spot_id가 없는
            글(이벤트를 가리키거나 과거 데이터로 둘 다 비어있는 글)은 이동할 곳이
            없어 행 자체를 숨긴다.
            [형식 선택] "궁금하신가요?" 안내 블록 대신 이 컴팩트한 행을 골랐다 —
            스크롤 없이 항상 바로 보이고, 이미 있는 태그/사진/좋아요 영역과 부딪히지
            않으며, 앱에 이미 있는 "장소 옆에 가는 버튼" 관례와 톤이 일치한다. */}
        {post.spotId && (
          <Link
            href={`/nearby?spot=${post.spotId}`}
            className="mb-3 flex items-center justify-between gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            <span>📍 스팟픽에서 이 장소 보기</span>
            <span aria-hidden>›</span>
          </Link>
        )}

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
          </div>
        ) : post.post_type === 'micro_review' ? (
          <div className="flex flex-col gap-2 text-sm">
            <p className="text-yellow-400">
              {'★'.repeat(post.rating ?? 0)}
              {'☆'.repeat(5 - (post.rating ?? 0))}
            </p>
            {post.content && <p className="whitespace-pre-wrap text-gray-700">{post.content}</p>}
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

        {photoUrls.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {photoUrls.map((url, i) => (
              <button key={url} type="button" onClick={() => setPhotoModalIndex(i)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="후기 사진" className="h-24 w-24 rounded-lg object-cover" />
              </button>
            ))}
          </div>
        )}

        {showLikes && (
          <button
            type="button"
            onClick={handleToggleLike}
            className={`mt-4 flex items-center gap-1 text-sm ${liked ? 'text-rose-500' : 'text-gray-400'}`}
          >
            {liked ? '❤️' : '🤍'} {likeCount}
          </button>
        )}
      </div>

      {photoModalIndex !== null && (
        <PostPhotoModal photoUrls={photoUrls} initialIndex={photoModalIndex} onClose={() => setPhotoModalIndex(null)} />
      )}
    </div>
  );
}
