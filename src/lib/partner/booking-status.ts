// [실제 브라우저 UI 검증 중 발견한 버그 수정](2026-09-21 사용자 지시 "ui쪽까지 버그
// 없는지 확인해본거야?" — Playwright로 실제 세션을 주입해 /partner/today를 열어보고서야
// 드러남): Next.js는 'use server' 파일이 async 함수가 아닌 값(상수 배열 등)을 export하면,
// 클라이언트 컴포넌트에서 그 값을 import했을 때 실제 배열이 아니라 서버 액션 참조로
// 치환해버린다 — 그 결과 booking-card.tsx가 `BOOKING_STATUSES.map(...)`을 호출하는 순간
// "BOOKING_STATUSES.map is not a function"으로 런타임에 크래시하고, /partner/today
// 화면 전체가 렌더링되지 않는다(실측: 크래시로 예약 목록이 통째로 안 보임). tsc/vitest는
// 둘 다 이 버그를 못 잡는다 — tsc는 타입만 보고(런타임 값 치환은 타입에 안 나타남), vitest는
// Next.js의 서버 액션 번들러 변환 자체를 거치지 않는 순수 Node 환경이라 재현되지 않는다.
// 해결: 'use server' 파일(src/actions/partner/bookings.ts)에서 순수 값(상수/타입)을
// 완전히 분리해, 그 파일이 async 함수만 export하게 만든다.
export const BOOKING_STATUSES = ['confirmed', 'completed', 'noshow', 'cancelled'] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];
