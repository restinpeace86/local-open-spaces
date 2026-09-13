import Link from 'next/link';
import { DashboardPost } from '@/lib/community/mom-pick-dashboard';

// [인기 우수글 영역 리디자인](2026-09-13 사용자 지시): "비주얼 컨셉: 트렌디하고 활기찬
// 느낌(오렌지/레드 톤). 형태: 썸네일 이미지와 요약 텍스트가 조화로운 직사각형 컴팩트
// 가로 스크롤 카드(조회수나 좋아요 수 표시). 터치 시 이동: 인기글 전체 리스트로 이동."
// [정직한 데이터 한계] 조회수 컬럼은 이 앱에 없다(getTrendingPosts는 like_count만 집계 —
// mom-pick-dashboard.ts 주석 참고, "찜은 게시글에 없다"는 동일한 이유로 이미 한 차례
// 확인된 제약). "조회수나 좋아요 수" 중 실존하는 좋아요 수만 표시한다.
export function TrendingPickCard({ post }: { post: DashboardPost }) {
  const thumbnailUrl = post.photo_urls?.[0] ?? null;

  return (
    <Link
      href="/mom-pick/trending"
      className="flex w-40 shrink-0 flex-col overflow-hidden rounded-xl border border-orange-200 bg-white shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="relative h-24 w-full bg-gradient-to-br from-orange-100 to-red-100">
        {thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbnailUrl} alt={post.spotName ?? '후기 사진'} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-2xl">📷</div>
        )}
        <span className="absolute left-1.5 top-1.5 rounded-full bg-orange-500/90 px-1.5 py-0.5 text-[10px] font-bold text-white">
          🔥 HOT
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-2">
        <p className="truncate text-xs font-semibold text-gray-800">
          {post.is_adopted && <span className="mr-0.5">✨</span>}
          {post.spotName ?? '알 수 없는 스팟'}
        </p>
        {post.content && <p className="line-clamp-2 text-[11px] text-gray-500">{post.content}</p>}
        <div className="mt-auto flex items-center justify-between text-[10px] text-gray-400">
          <span className="truncate">{post.author.nickname ?? '이름 없는 맘'}</span>
          <span className="shrink-0 font-semibold text-red-500">❤️ {post.like_count}</span>
        </div>
      </div>
    </Link>
  );
}
