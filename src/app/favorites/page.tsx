import { FavoritesView } from '@/components/favorites/favorites-view';

// [Decision 019](2026-09-02): Decision 003이 비노출로 지정했던 "찜" 탭(/favorites)의 실제
// 화면. 열심맘 이상만 이용 가능(spec/community/mom-pick-grades.md 1절).
export default function FavoritesPage() {
  return <FavoritesView />;
}
