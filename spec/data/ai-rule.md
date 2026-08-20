# AI 데이터 정제 및 자동 태깅 규칙 (spec/data/ai-rule.md)

## 1. 개요

본 문서는 `local-open-spaces` 서비스의 7대 공공 API 수집 파이프라인에서 가져오는 비정형 텍스트(장소 설명, 행사 개요 등)를 정제하고, 서비스 표준 카테고리 및 태그로 자동 분류하기 위한 AI 파이프라인 규칙을 정의한다.

모든 AI 활용은 **데이터 수집 및 정제 보조 용도로만 한정(Decision 005)**하며, 생성형 대화나 가짜 정보 생성을 방지하기 위해 엄격한 파싱 규칙을 따른다.

---

## 2. AI 파이프라인 역할 및 처리 범위

1. **비정형 텍스트 정제 (Text Cleaning):**
   - 공공 API 응답에 포함된 불필요한 HTML 태그, 특수문자, 중복 공백 제거
   - 요약된 설명 텍스트에서 핵심 키워드 추출
2. **표준 카테고리 자동 태깅 (Category Tagging):**
   - 수집된 원본 텍스트를 분석하여 서비스 정의 표준 카테고리 중 하나로 매핑
3. **예약 마감일 파싱 (Reservation Date Parsing):**
   - "매월 1일부터 선착순 마감", "행사 전일 18시까지" 등 비정형 텍스트로 된 예약 마감 일정을 표준 ISO 시각(`reservation_end_date`) 데이터로 변환

---

## 3. 표준 카테고리 분류 규칙

### 3.1. 열린 공간 (`public.open_spaces`) 표준 카테고리
- `PARK`: 근린공원, 어린이공원, 수변공원 등
- `SPORTS`: 공공체육시설, 축구장, 테니스장, 다목적 체육관 등
- `CULTURE`: 도서관, 미술관, 박물관, 문화회관 등

### 3.2. 시한성 이벤트/행사 (`public.events`) 표준 유형 (`event_type`)
- `FESTIVAL`: 지역 축제, 문화 제전
- `EXHIBITION`: 미술 전시, 박람회, 역사 전시
- `PERFORMANCE`: 야외 공연, 음악회, 연극
- `POPUP`: 단기 팝업스토어, 체험 행사
- `RESERVATION`: 지자체 공공서비스예약 시설/프로그램

---

## 4. 예외 처리 및 가이드라인

1. **분류 불확실성 대응:**
   - AI가 카테고리를 명확히 판별하기 어려운 경우, 임의로 생성하지 않고 기본값(`ETC` 또는 `GENERAL`)으로 분류한 뒤 수집 로그에 경고를 남긴다.
2. **면책 조항 및 신뢰성 확보:**
   - AI는 데이터 파싱 및 태깅 도구로만 작동하며, 사용자를 상대로 한 실시간 챗봇이나 직접적인 답변 생성 기능은 배제한다 (Decision 005 준수).

## 5. Parental Checkpoint & Feature Tagging Rules (AI 정제 파이프라인)

### 5.1. Extraction Sources
- Primary Source: 원본 공공 API의 `description`(상세설명), `use_target`(이용대상), `fee_info`(요금안내) 텍스트

### 5.2. Tagging Logic & Fallback Rules
1. `is_kids_friendly` (boolean)
   - `true`: `use_target` 또는 `description`에 '어린이', '유아', '키즈', '아이', '가족', '영유아' 키워드 포함
   - `false`: 위 키워드가 없거나 연령 제한(예: 성인 전용)이 명시된 경우

2. `has_parking` (boolean)
   - `true`: `description`에 '주차', '주차장', '파킹' 포함 및 '주차 불가'가 아닌 경우
   - `false`: 언급이 없거나 '주차 불가'가 명시된 경우

3. `stroller_accessible` (boolean)
   - `true`: `description`에 '유모차', '휠체어', '베리어프리', '엘리베이터' 언급 시
   - `false`: 언급이 없는 경우

4. `facility_type` (text)
   - '실내': '실내', '체육관', '박물관', '미술관', '전시관' 키워드 판단
   - '야외': '야외', '실외', '공원', '광장', '체험장' 키워드 판단
   - '복합' (Default): 두 특성이 모두 포함되거나 판별이 불분명한 경우 기본값 적용

5. `target_age_group` (text)
   - 명시된 대상 연령대 추출 ('영유아', '초등', '전연령' 등)
   - 불분명한 경우 `null` 처리

6. `booking_status` (text, events 전용)
   - 행사 일정 및 접수 정보 기반 ('오늘방문', 'D-1 마감임박', '주말예약', '접수중') 판단
   - 불분명한 경우 `null` 처리

### 5.3. Decision 005 Guardrail Compliance
- 텍스트 내 객관적 근거가 불명확할 경우 임의 추측을 금지하며 무조건 기본값(`false`, `'복합'`, 또는 `null`)을 부여한다.
