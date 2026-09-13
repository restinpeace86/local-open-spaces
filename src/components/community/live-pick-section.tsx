import Link from 'next/link';
import { DashboardPost } from '@/lib/community/mom-pick-dashboard';
import { LivePickCard } from './live-pick-card';

// [실시간 라이브 영역 리디자인](2026-09-13 사용자 지시) 헤더: "🔴 실시간 라이브
// 현장 + 전체보기 ›". "타임라인형 가로 카드"라는 지시에 "스크롤" 언급이 없어
// 인기 우수글 섹션과 달리 세로 목록을 유지한다(제3장 제5조 추측 금지).
// [영역 3분할 고정](2026-09-13 사용자 지시): "글이 없어도 세 영역이.. 상단 중단
// 하단으로 영역 분리되어서 고정으로" — 다른 두 섹션과 동일하게 실제 남은 화면
// 높이를 3등분한다.
// [높이 계산을 vh가 아닌 실제 남은 영역 기준으로](2026-09-13 사용자 지시): "하단
// 버튼 영역을 고려 안했어" — min-h-[28vh] 대신 flex-1로 부모가 넘겨주는 실제
// 남은 높이를 3등분한다(ExpertPickSection 주석 참고).
// [영역 구분](2026-09-13 사용자 지시): "색깔로 구분하던가" — 레드 톤 배경 패널로
// 감싼다.
export function LivePickSection({ posts }: { posts: DashboardPost[] }) {
  return (
    <section className="flex flex-1 flex-col gap-2 rounded-2xl border border-red-200/60 bg-red-50/50 p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-gray-900">🔴 실시간 라이브 현장</h2>
        <Link href="/mom-pick/live" className="text-xs font-medium text-red-600 hover:underline">
          전체보기 ›
        </Link>
      </div>
      {posts.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-xs text-gray-400">아직 등록된 글이 없어요.</p>
        </div>
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
