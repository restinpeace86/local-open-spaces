# Events & Popups Specification (`spec/event/`)

본 디렉토리는 `local-open-spaces` 서비스에서 다루는 **시한성 행사, 축제, 팝업스토어, 예약형 프로그램 등 이벤트 데이터(`events`)**의 UI 표현 방식, 카드 컴포넌트, 그리고 상세 정보 모달의 명세를 관리한다.

상시 시설과 달리 **기간 한정성(D-day)**과 **예약 마감일(Reservation Due Date)**이 핵심 시각 정보로 제공된다.

---

## 하위 스펙 문서 목록

- **`event-card.md`**: 지도 마커 및 리스트 뷰에서 노출되는 이벤트 요약 카드 (D-day 및 마감 임박 뱃지) 스펙
- **`event-detail.md`**: 이벤트 상세 모달 스펙 (예약 링크 연동, 운영 기간, 장소 연계 등)
