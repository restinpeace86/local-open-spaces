// [Decision 019](2026-09-02) / spec/community/mom-pick-grades.md 3-5: 전 스팟 공통 체크리스트
// 5항목. 스팟마다 다른 항목을 두지 않는다(하드코딩이 아니라 — 이 5항목 자체가 사용자가
// 확정한 고정 스펙이다. 제5장 제6조가 금지하는 건 "서비스 데이터"의 하드코딩이지, 승인된
// 불변 구조 정의가 아니다).
export const CHECKLIST_ITEMS = [
  { key: 'parking', label: '주차 편의' },
  { key: 'nursing_room', label: '수유실 유무' },
  { key: 'kids_chair', label: '유아 의자 유무' },
  { key: 'kids_menu', label: '키즈메뉴 유무' },
  { key: 'diaper_table', label: '기저귀교환대 유무' },
] as const;

export type ChecklistKey = (typeof CHECKLIST_ITEMS)[number]['key'];
export type ChecklistAnswers = Record<ChecklistKey, boolean>;

export function emptyChecklistAnswers(): ChecklistAnswers {
  return {
    parking: false,
    nursing_room: false,
    kids_chair: false,
    kids_menu: false,
    diaper_table: false,
  };
}
