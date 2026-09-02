import { MomPickView } from '@/components/community/mom-pick-view';

// [Decision 019](2026-09-02) / spec/community/mom-pick-grades.md: 맘스픽 커뮤니티 피드.
// Decision 010이 하단 5대 탭(추천픽/스팟픽/이벤트픽/찜/마이)을 고정했고 맘스픽을 6번째
// 탭으로 추가하라는 별도 승인은 없어(제3장 제5조 추측 금지), 새 탭을 만들지 않고 "마이"
// 페이지에서 링크로 진입하는 독립 라우트로 둔다.
export default function MomPickPage() {
  return <MomPickView />;
}
