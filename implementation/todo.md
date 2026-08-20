- [ ] [스펙 작성] spec/notification/notification-settings.md 및 user-notification.md 명세 작성
  - project/decision-log.md (Decision 003) 및 CLAUDE.md 제5장 제1조 기반 맞춤 알림 스펙 정의
  - LocalStorage 스키마 (`user_notification_settings`, `user_notifications`) 구조 정의
  - 광역 반경(10/20/30km/전체), 연령대/태그, 예약 마감 D-1 알림 조건 및 데이터 추출 규칙 명세화

- [ ] [기능 구현] 주말 나들이용 광역 범위 맞춤 알림 조건 설정 UI 및 알림함(LocalStorage) 구현
  - Header 알림 아이콘(🔔) 및 알림 설정 모달 UI 구축
  - LocalStorage 연동 및 설정된 광역 반경/연령대 기준 '예약 마감 임박' 및 '주말 가볼 만한 곳' 알림 데이터 추출 로직 작성
  - Playwright 실브라우저로 알림 설정 모달 동작, 조건 변경, 알림함 리스트 정상 노출 검증
