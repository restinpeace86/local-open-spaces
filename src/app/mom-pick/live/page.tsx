import { FullListView } from '@/components/community/full-list-view';

// [맘스픽 메인 화면 기획](2026-09-02 사용자 지시) 섹션 ③ 전체보기.
export default function MomPickLivePage() {
  return <FullListView title="🕐 실시간 라이브" apiPath="/api/mom-pick/live" />;
}
