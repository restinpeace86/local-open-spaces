import Link from 'next/link';
import { DashboardPost } from '@/lib/community/mom-pick-dashboard';
import { TrendingPickCard } from './trending-pick-card';

// [인기 우수글 영역 리디자인](2026-09-13 사용자 지시) 헤더: "🔥 지금 가장 뜨거운
// 인기 우수글 + 전체보기 ›". "직사각형 컴팩트 가로 스크롤 카드"라는 지시대로
// 이 섹션만 가로 스크롤 컨테이너로 만든다(다른 두 섹션과 다름).
// [영역 3분할 고정](2026-09-13 사용자 지시): "글이 없어도 세 영역이.. 상단 중단
// 하단으로 영역 분리되어서 고정으로" — 다른 두 섹션과 동일하게 화면 높이의
// 1/3 가량을 항상 확보한다.
export function TrendingPickSection({ posts }: { posts: DashboardPost[] }) {
  return (
    <section className="flex min-h-[28vh] flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-gray-900">🔥 지금 가장 뜨거운 인기 우수글</h2>
        <Link href="/mom-pick/trending" className="text-xs font-medium text-orange-600 hover:underline">
          전체보기 ›
        </Link>
      </div>
      {posts.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-xs text-gray-400">아직 인기글이 없어요.</p>
        </div>
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
