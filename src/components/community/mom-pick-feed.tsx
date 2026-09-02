'use client';

import { useEffect, useState } from 'react';
import { getMyLikedPostIds, listCommunityFeed, MomPickPost, toggleLike } from '@/lib/community/posts';
import { canSeeLikeReactions, MomPickGrade } from '@/lib/community/grades';
import { CHECKLIST_ITEMS } from '@/lib/community/checklist-items';

// [Decision 019](2026-09-02) / spec/community/mom-pick-grades.md 1절: 좋아요 버튼/카운트는
// 열심맘(active) 이상에게만 노출한다 — "열심맘: 작성한 리뷰에 대한 일반 유저들의 반응(좋아요
// 등) 확인 가능"이 새싹맘 단계에는 아예 없는 권한이라, 좋아요 UI 자체를 숨긴다(추측 금지 —
// 원문에 없는 "새싹맘도 누르기만은 가능" 같은 절충안을 임의로 만들지 않음).
function PostCard({
  post,
  liked,
  showLikes,
  onToggleLike,
}: {
  post: MomPickPost;
  liked: boolean;
  showLikes: boolean;
  onToggleLike: (postId: string, liked: boolean) => void;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-800">{post.open_spaces?.name ?? '알 수 없는 스팟'}</p>
        {post.is_adopted && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">✨ 채택</span>
        )}
      </div>

      {post.post_type === 'micro_review' ? (
        <div className="mt-2">
          <p className="text-yellow-400">{'★'.repeat(post.rating ?? 0)}{'☆'.repeat(5 - (post.rating ?? 0))}</p>
          {post.content && <p className="mt-1 text-sm text-gray-600">{post.content}</p>}
        </div>
      ) : (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {CHECKLIST_ITEMS.filter((item) => post.checklist_answers?.[item.key]).map((item) => (
            <li key={item.key} className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700">
              ✓ {item.label}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex items-center justify-between text-xs text-gray-400">
        <span>{new Date(post.created_at).toLocaleDateString('ko-KR')}</span>
        {showLikes && (
          <button
            type="button"
            onClick={() => onToggleLike(post.id, liked)}
            className={`flex items-center gap-1 ${liked ? 'text-rose-500' : 'text-gray-400'}`}
          >
            {liked ? '❤️' : '🤍'} {post.like_count}
          </button>
        )}
      </div>
    </div>
  );
}

export function MomPickFeed({ myGrade }: { myGrade: MomPickGrade }) {
  const [posts, setPosts] = useState<MomPickPost[]>([]);
  const [likedPostIds, setLikedPostIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const showLikes = canSeeLikeReactions(myGrade);

  async function refresh() {
    setIsLoading(true);
    try {
      const feed = await listCommunityFeed();
      setPosts(feed);
      if (showLikes) {
        setLikedPostIds(await getMyLikedPostIds(feed.map((p) => p.id)));
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : '피드를 불러오지 못했습니다.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleToggleLike(postId: string, liked: boolean) {
    // 낙관적 갱신 — 실패하면 되돌린다.
    setLikedPostIds((prev) => {
      const next = new Set(prev);
      liked ? next.delete(postId) : next.add(postId);
      return next;
    });
    setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, like_count: p.like_count + (liked ? -1 : 1) } : p)));
    try {
      await toggleLike(postId, liked);
    } catch {
      refresh();
    }
  }

  if (isLoading) return <p className="text-sm text-gray-400">피드를 불러오는 중...</p>;
  if (errorMessage) return <p className="text-sm text-red-600">{errorMessage}</p>;
  if (posts.length === 0) return <p className="text-sm text-gray-400">아직 등록된 후기가 없어요. 첫 후기를 남겨보세요!</p>;

  return (
    <div className="flex flex-col gap-3">
      {posts.map((post) => (
        <PostCard key={post.id} post={post} liked={likedPostIds.has(post.id)} showLikes={showLikes} onToggleLike={handleToggleLike} />
      ))}
    </div>
  );
}
