import Link from 'next/link';
import { DashboardPost } from '@/lib/community/mom-pick-dashboard';
import { TrendingPickCard } from './trending-pick-card';

// [인기 우수글 영역 리디자인](2026-09-13 사용자 지시) 헤더: "🔥 지금 가장 뜨거운
// 인기 우수글 + 전체보기 ›". "직사각형 컴팩트 가로 스크롤 카드"라는 지시대로
// 이 섹션만 가로 스크롤 컨테이너로 만든다(다른 두 섹션과 다름).
export function TrendingPickSection({ posts }: { posts: DashboardPost[] }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-gray-900">🔥 지금 가장 뜨거운 인기 우수글</h2>
        <Link href="/mom-pick/trending" className="text-xs font-medium text-orange-600 hover:underline">
          전체보기 ›
        </Link>
      </div>
      {posts.length === 0 ? (
        <p className="text-xs text-gray-400">아직 인기글이 없어요.</p>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-1">
          {posts.map((post) => (
            <TrendingPickCard key={post.id} post={post} />
          ))}
        </div>
      )}
    </section>
  );
}
