# 이벤트 요약 카드 스펙 (speceventevent-card.md)

## 1. 개요
본 문서는 지도 상의 이벤트 마커를 클릭하거나, 좌측 패널(리스트 뷰)에서 노출되는 시한성 이벤트 요약 카드(Event Card)의 UIUX 구성 규칙을 정의한다.

---

## 2. 카드 UI 구성 요소

- 썸네일 이미지 (Thumbnail) 
  - 공공 API로 수집된 대표 이미지(`thumbnail_url`)를 좌측 또는 상단에 카드 형태로 노출 (이미지가 없는 경우 카테고리별 기본 일러스트아이콘 대체)
- 이벤트 유형 및 D-day 뱃지 
  - `FESTIVAL`(축제), `POPUP`(팝업), `EXHIBITION`(전시) 등의 유형 칩과 함께 현재 진행 상태를 나타내는 뱃지 노출 (예 `D-3`, `오늘 마감`, `진행 중`)
- 행사 명칭 (Title) 
  - 행사 또는 팝업 명칭 (최대 2줄 말줄임표 처리)
- 일정 및 장소 
  - 행사 기간 (`start_date ~ end_date`) 및 개최 장소 (또는 연계된 공간명)
- 예약 마감 임박 강조 (Reservation Alert) 
  - 사전 예약이 필요한 행사(`is_reservation_required = true`)의 경우, 예약 마감일(`reservation_end_date`)이 임박했거나 오늘까지인 경우 붉은색 경고 뱃지(예 `🚨 오늘 예약 마감`)를 최우선으로 노출

---

## 3. 인터랙션 규칙

- 카드 클릭 시 
  - 지도 중심이 해당 행사 장소 좌표로 이동하며, 화면 하단 또는 패널에 이벤트 상세 모달(`event-detail.md`)이 활성화됨.
- 마커 연동 
  - 리스트에서 카드를 호버하거나 터치할 경우, 지도 위의 해당 이벤트 마커가 강조됨.

## Parental Checkpoint Badges (AI Tagging & Schedule 연동)

행사 카드 정면에 AI 정제 파이프라인(`ai-rule.md`)에서 추출된 핵심 체크포인트 뱃지 및 예약/접수 상태 뱃지를 최우선 노출한다.

### 1. Badge Display Rules
- **예약/접수 상태**: `booking_status` ("⚡ 오늘방문", "⏳ D-1 마감임박", "📅 주말예약", "접수중")
- **무료/유료**: `is_free` (true: "🎁 무료", false: "유료")
- **키즈/연령대**: `is_kids_friendly` / `target_age_group` ("👶 키즈/어린이", "👶 유아전용")
- **실내/야외**: `facility_type` ("실내" | "야외")

### 2. Layout Requirements
- 카드 정면에 예약 상태 뱃지 및 핵심 체크포인트 뱃지를 최대 3~4개 칩(Chip) 형태로 노출.
- 'D-1 마감임박' 및 '오늘방문' 뱃지는 시인성을 위해 강조 컬러 적용.
