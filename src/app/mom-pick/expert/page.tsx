import { FullListView } from '@/components/community/full-list-view';

// [맘스픽 메인 화면 기획](2026-09-02 사용자 지시) 섹션 ① 전체보기.
export default function MomPickExpertPage() {
  return <FullListView title="✨ 파워맘 · 우수맘 추천" apiPath="/api/mom-pick/expert" />;
}
