import Link from 'next/link';
import { DashboardPost } from '@/lib/community/mom-pick-dashboard';
import { ExpertPickCard } from './expert-pick-card';

// [파워맘·우수맘 추천 영역 리디자인](2026-09-13 사용자 지시) 헤더: "👑 이번 주 파워맘
// 추천 픽 + 전체보기 ›". 카드가 "가로 카드"(내부는 가로 배치)일 뿐 섹션 자체가
// 가로 스크롤은 아니므로(사용자 지시 원문에 "스크롤" 언급 없음 — 인기 우수글
// 섹션과 달리 세로 목록 유지, 제3장 제5조 추측 금지) 기존과 동일하게 세로로
// 쌓는다.
// [영역 3분할 고정](2026-09-13 사용자 지시): "글이 없어도 세 영역이 화면에 대하여
// 상단 중단 하단으로 영역 분리되어서 고정으로 되었으면 좋겠음" — 글이 하나도
// 없을 때 빈 문구만 남아 3개 섹션이 화면 위쪽으로 몰려 붙던 문제.
// [높이 계산을 vh가 아닌 실제 남은 영역 기준으로](2026-09-13 사용자 지시): "하단
// 버튼(맘스픽/스팟픽/이벤트픽/마이) 영역을 고려 안했어" — min-h-[28vh](뷰포트
// 전체 기준)는 하단 탭바가 이미 떼어간 공간을 반영하지 못한다(data-grid-
// client.tsx에 이미 기록된 동일한 vh 문제와 같은 원인). flex-1로 바꿔 부모
// (mom-pick-view.tsx)가 실제로 남겨준 높이만큼만 3등분한다.
// [영역 구분](2026-09-13 사용자 지시): "각 영역별 좀 구분이 되도록.. 색깔로
// 구분하던가" — 골드/퍼플 톤 배경 패널로 감싸 섹션 경계 자체가 시각적으로
// 구분되게 한다(테두리가 자연스럽게 구분선 역할도 한다).
export function ExpertPickSection({ posts }: { posts: DashboardPost[] }) {
  return (
    <section className="flex flex-1 flex-col gap-2 rounded-2xl border border-amber-200/60 bg-gradient-to-br from-amber-50/70 to-purple-50/70 p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-gray-900">👑 이번 주 파워맘 추천 픽</h2>
        <Link href="/mom-pick/expert" className="text-xs font-medium text-purple-600 hover:underline">
          전체보기 ›
        </Link>
      </div>
      {posts.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-xs text-gray-400">아직 파워맘/우수맘 추천 글이 없어요.</p>
        </div>
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
