import { FullListView } from '@/components/community/full-list-view';

// [맘스픽 메인 화면 기획](2026-09-02 사용자 지시) 섹션 ② 전체보기.
export default function MomPickTrendingPage() {
  return <FullListView title="🔥 인기 · 우수글" apiPath="/api/mom-pick/trending" />;
}
