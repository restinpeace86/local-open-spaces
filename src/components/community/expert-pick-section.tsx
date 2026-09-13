import Link from 'next/link';
import { DashboardPost } from '@/lib/community/mom-pick-dashboard';
import { ExpertPickCard } from './expert-pick-card';

// [파워맘·우수맘 추천 영역 리디자인](2026-09-13 사용자 지시) 헤더: "👑 이번 주 파워맘
// 추천 픽 + 전체보기 ›". 카드가 "가로 카드"(내부는 가로 배치)일 뿐 섹션 자체가
// 가로 스크롤은 아니므로(사용자 지시 원문에 "스크롤" 언급 없음 — 인기 우수글
// 섹션과 달리 세로 목록 유지, 제3장 제5조 추측 금지) 기존과 동일하게 세로로
// 쌓는다.
export function ExpertPickSection({ posts }: { posts: DashboardPost[] }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-gray-900">👑 이번 주 파워맘 추천 픽</h2>
        <Link href="/mom-pick/expert" className="text-xs font-medium text-purple-600 hover:underline">
          전체보기 ›
        </Link>
      </div>
      {posts.length === 0 ? (
        <p className="text-xs text-gray-400">아직 파워맘/우수맘 추천 글이 없어요.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {posts.map((post) => (
            <ExpertPickCard key={post.id} post={post} />
          ))}
        </div>
      )}
    </section>
  );
}
