import Link from 'next/link';
import { DashboardPost } from '@/lib/community/mom-pick-dashboard';
import { DashboardPostCard } from './dashboard-post-card';

// [맘스픽 메인 화면 기획](2026-09-02 사용자 지시): 3개 섹션 공통 레이아웃 — "제목 +
// [전체보기 ➔]" 헤더와 미리보기 카드 목록.
export function PreviewSection({
  title,
  href,
  posts,
  emptyText,
}: {
  title: string;
  href: string;
  posts: DashboardPost[];
  emptyText: string;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-gray-900">{title}</h2>
        <Link href={href} className="text-xs font-medium text-indigo-600 hover:underline">
          전체보기 ➔
        </Link>
      </div>
      {posts.length === 0 ? (
        <p className="text-xs text-gray-400">{emptyText}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {posts.map((post) => (
            <DashboardPostCard key={post.id} post={post} />
          ))}
        </div>
      )}
    </section>
  );
}
