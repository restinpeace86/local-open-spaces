import { NearbyItem } from '@/lib/spaces/get-nearby';
import { SpaceGridCard } from '@/components/region/space-grid-card';
import { EventCard } from '@/components/cards/event-card';

// docs/spec.md 2.2: 메인 홈 레이아웃 스택 — Hero Carousel → 5대 카테고리 Quick 그리드 → 큐레이션 카드 피드
// [바텀시트 구조 복구 및 재적용](2026-09-04 사용자 지시): 원래 home-view.tsx 안의 로컬
// 함수였으나, 중분류 선택 결과를 major-category-grid.tsx의 바텀시트 안에도 그려야 해서
// 두 파일이 공유할 수 있게 별도 파일로 뺐다(제5장 제4조 기존 구조 우선 — 로직 변경 없이
// 위치만 옮김).
export function FeedCard({ item, onSelect }: { item: NearbyItem; onSelect: (item: NearbyItem) => void }) {
  return item.item_type === 'EVENT' ? (
    <EventCard item={item} onSelect={onSelect} />
  ) : (
    <SpaceGridCard item={item} onSelect={onSelect} />
  );
}
