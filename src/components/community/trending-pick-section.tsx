import Link from 'next/link';
import { DashboardPost } from '@/lib/community/mom-pick-dashboard';
import { TrendingPickCard } from './trending-pick-card';

// [인기 우수글 영역 리디자인](2026-09-13 사용자 지시) 헤더: "🔥 지금 가장 뜨거운
// 인기 우수글 + 전체보기 ›". "직사각형 컴팩트 가로 스크롤 카드"라는 지시대로
// 이 섹션만 가로 스크롤 컨테이너로 만든다(다른 두 섹션과 다름).
// [영역 3분할 고정](2026-09-13 사용자 지시): "글이 없어도 세 영역이.. 상단 중단
// 하단으로 영역 분리되어서 고정으로" — 다른 두 섹션과 동일하게 실제 남은
// 화면 높이를 3등분한다.
// [높이 계산을 vh가 아닌 실제 남은 영역 기준으로](2026-09-13 사용자 지시): "하단
// 버튼 영역을 고려 안했어" — min-h-[28vh] 대신 flex-1로 부모가 넘겨주는 실제
// 남은 높이를 3등분한다(ExpertPickSection 주석 참고).
// [영역 구분](2026-09-13 사용자 지시): "색깔로 구분하던가" — 오렌지/레드 톤 배경
// 패널로 감싼다.
export function TrendingPickSection({ posts }: { posts: DashboardPost[] }) {
  return (
    <section className="flex flex-1 flex-col gap-2 rounded-2xl border border-orange-200/60 bg-orange-50/50 p-3">
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
