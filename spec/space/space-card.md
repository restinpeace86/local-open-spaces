# 공간 요약 카드 스펙 (spec/space/space-card.md)

## 1. 개요
본 문서는 지도 상의 마커를 클릭하거나, 좌측 패널(리스트 뷰)에서 노출되는 **열린 공간 요약 카드(Space Card)**의 UI/UX 구성 규칙을 정의한다.

---

## 2. 카드 UI 구성 요소

- **카테고리 칩 (Category Chip):** 
  - `PARK`(공원), `SPORTS`(체육시설), `CULTURE`(문화시설) 등의 표준 카테고리를 색상별 칩으로 상단에 노출
- **공간 명칭 (Name):** 
  - 시설명 또는 공원명 (최대 2줄 텍스트, 말줄임표 처리)
- **거리 및 위치 (Distance & Address):** 
  - 사용자 현재 위치(또는 지도 중심) 기준 직선거리(예: `현재 위치에서 1.2km`) 및 간단한 동/읍/면 주소
- **핵심 상태 정보:** 
  - 무료 이용 여부 (`무료` 뱃지 고정 노출) 및 운영 중 여부

---

## 3. 인터랙션 규칙

- **카드 클릭 시:** 
  - 지도 중심이 해당 공간의 좌표로 부드럽게 이동(`panTo`)하며, 화면 하단 또는 패널에 **공간 상세 모달(`space-detail.md`)**이 활성화됨.
- **마커 연동:** 
  - 리스트에서 카드를 호버(Hover)하거나 터치할 경우, 지도 위 해당 마커가 강조(Active/Pulse 효과)됨.

## Parental Checkpoint Badges (AI Tagging 연동)

공간 카드 정면 하단/상단에 AI 정제 파이프라인(`ai-rule.md`)에서 추출된 핵심 체크포인트 뱃지를 최우선 노출한다.

### 1. Badge Display Rules
- **무료/유료**: `is_free` (true: "🎁 무료", false: "유료")
- **주차 여부**: `has_parking` (true: "🅿️ 주차가능")
- **키즈 친화**: `is_kids_friendly` (true: "👶 키즈")
- **유모차 접근성**: `stroller_accessible` (true: "🛺 유모차가능")
- **실내/야외**: `facility_type` ("실내" | "야외" | "복합")

### 2. Layout Requirements
- 카드 정면에 최대 3~4개의 핵심 뱃지를 우선순위에 따라 칩(Chip) 형태로 컴팩트하게 노출.
- 뱃지 클릭 시 관련 Quick Filter 또는 상세 검색과 연동 가능.
