# 맞춤 알림 UI + LocalStorage 알림함 구현

## 구현 대상
- `spec/notification/notification-settings.md` 기준 Header 🔔 알림 아이콘 + 설정/알림함 팝오버 구현
- `LocalStorage`(`user_notification_settings`, `user_notifications`) 연동 및 조건별 알림 추출 로직 구현

## 구현 일시
2026-08-20

## 변경 사항
- `src/lib/notifications/notification-storage.ts`: 설정/알림함 LocalStorage 스키마 및 get/set 유틸리티
- `src/lib/notifications/generate-notifications.ts`: 반경(radius) + 예약 마감 D-1(`d_minus_one_alert`) 조건으로 `get_nearby_spaces_and_events` RPC 결과에서 알림 추출
- `src/components/notification/notification-bell.tsx`, `notification-list.tsx`, `notification-settings-form.tsx`: 팝오버 UI(알림함 리스트 ↔ 설정 폼 토글), 설정 변경 즉시 저장
- `src/components/nav/top-tabs.tsx`: 전역 헤더(TopTabs) 우측에 알림 벨 배치 (모든 화면에서 공통 노출)

## 스펙 대비 알려진 제약 사항 (임의 판단 회피)
- `target_ages`는 스펙(`spec/notification/notification-settings.md` 3.1)에 `['infant', 'child']` 예시만 있고 전체 태그 목록이 정의되어 있지 않아, 명시된 두 값만 선택지로 제공한다. 추가 연령대 태그는 임의로 만들지 않았다.
- `open_spaces`/`events` 테이블(`project/database_schema.md` 3.1, 3.2)에 연령대 데이터 컬럼이 없어, `target_ages`는 설정값으로 저장·표시만 하고 알림 추출(매칭) 조건에는 사용하지 않는다. 실제 추출 로직은 스펙에 근거가 있는 반경(`radius`)과 예약 마감 D-1(`d_minus_one_alert`)만 사용한다.
- 알림 항목 `link`는 개별 장소/행사 상세 페이지 라우트가 없어(상세는 지도 화면의 모달로만 노출) 지도 홈(`/`)으로 연결한다.
- radius `all`은 별도 광역 그리드 API가 없어 기존 반경 기반 RPC에 실용적 상한값(300km, 국내 전역 커버)을 사용한다.

## 검증 결과
- `npx tsc --noEmit`: 통과
- `npm run test`: 통과 (2 test files)
- `npm run build`: 통과
- Playwright 실브라우저로 검증: 알림 벨 클릭 → 팝오버 노출, 설정(⚙️) 토글 → 알림 반경/연령대/D-1 알림 변경 시 `user_notification_settings`에 즉시 저장 확인, 알림 없음 시 빈 상태 문구 노출, 375px 모바일 뷰포트에서도 벨 아이콘 정상 노출 확인
