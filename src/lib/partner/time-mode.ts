// [상품별 시간 세팅 방식](2026-09-25 사용자 지시): pricing-unit.ts/booking-status.ts와
// 동일한 이유로 순수 값/타입을 별도 파일로 분리했다 — 'use server' 파일은 async 함수만
// export해야 클라이언트에서 값이 서버 액션 참조로 깨지지 않는다.
export const TIME_MODES = ['free', 'session'] as const;
export type TimeMode = (typeof TIME_MODES)[number];
