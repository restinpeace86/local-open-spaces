// spec/common/feature-flags.md 구현 — 미승인/미오픈 확장 기능을 빌드타임 환경변수로 제어한다.
// Decision 003: 찜(즐겨찾기)은 아직 비노출 상태. 마이페이지는 인증 시스템이 없어 별도 플래그로 제어한다.
export const FEATURE_FLAGS = {
  ENABLE_USER_BOOKMARK: process.env.NEXT_PUBLIC_ENABLE_USER_BOOKMARK === 'true',
  ENABLE_MY_PAGE: process.env.NEXT_PUBLIC_ENABLE_MY_PAGE === 'true',
};
