// ['use server' 파일 export 제약 버그 재발](2026-09-23, 실제 브라우저 검증 중 발견):
// booking-status.ts와 정확히 동일한 원인 — src/actions/partner/products.ts('use
// server')가 순수 값(PRICING_UNITS 배열)을 함께 export하고 있었다. Next.js는
// 'use server' 파일이 async 함수가 아닌 값을 export하면 그 값을 서버 액션 참조로
// 치환해버려, 실제 프로덕션에서 상품 등록 제출 시 500 에러(React 미니파이드 에러
// #441)로 크래시했다(tsc/vitest는 둘 다 못 잡음 — 실제 Playwright 브라우저
// 실행에서만 재현됨). booking-status.ts와 동일하게 순수 값/타입을 별도 파일로
// 완전히 분리해 액션 파일이 async 함수만 export하게 만든다.
export const PRICING_UNITS = ['flat', 'per_person'] as const;
export type PricingUnit = (typeof PRICING_UNITS)[number];
