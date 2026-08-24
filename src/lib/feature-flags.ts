// spec/common/feature-flags.md 구현 — 미승인/미오픈 확장 기능을 빌드타임 환경변수로 제어한다.
// Decision 003: 찜(즐겨찾기)은 아직 비노출 상태. 마이페이지는 인증 시스템이 없어 별도 플래그로 제어한다.
export const FEATURE_FLAGS = {
  ENABLE_USER_BOOKMARK: process.env.NEXT_PUBLIC_ENABLE_USER_BOOKMARK === 'true',
  ENABLE_MY_PAGE: process.env.NEXT_PUBLIC_ENABLE_MY_PAGE === 'true',
  // Task 9-6-10(2026-08-23): 하단 5대 탭 "추천픽"(카테고리+가격+거리 3조건 DB 필터 + AI TOP3
  // 추천) — 사용자 지시에 따라 이번에는 탭 구조/라벨만 정립하고 실제 화면은 아직 만들지 않는다
  // ("1번 추천픽은 일단 냅두고" — 재개편은 별도 스펙으로 확정 후 진행). 기존 찜/마이와 동일한
  // 관례대로 탭 자체는 숨기지 않고 비활성화 상태로만 노출한다(spec/common/feature-flags.md 원칙).
  ENABLE_RECOMMEND_TAB: process.env.NEXT_PUBLIC_ENABLE_RECOMMEND_TAB === 'true',
};
