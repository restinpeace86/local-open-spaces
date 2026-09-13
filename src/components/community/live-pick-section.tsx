import Link from 'next/link';
import { DashboardPost } from '@/lib/community/mom-pick-dashboard';
import { LivePickCard } from './live-pick-card';

// [실시간 라이브 영역 리디자인](2026-09-13 사용자 지시) 헤더: "🔴 실시간 라이브
// 현장 + 전체보기 ›". "타임라인형 가로 카드"라는 지시에 "스크롤" 언급이 없어
// 인기 우수글 섹션과 달리 세로 목록을 유지한다(제3장 제5조 추측 금지).
export function LivePickSection({ posts }: { posts: DashboardPost[] }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-gray-900">🔴 실시간 라이브 현장</h2>
        <Link href="/mom-pick/live" className="text-xs font-medium text-red-600 hover:underline">
          전체보기 ›
        </Link>
      </div>
      {posts.length === 0 ? (
        <p className="text-xs text-gray-400">아직 등록된 글이 없어요.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {posts.map((post) => (
            <LivePickCard key={post.id} post={post} />
          ))}
        </div>
      )}
    </section>
  );
}
