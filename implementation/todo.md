
# 📋 [TODO] 데이터 수집·표준화 ETL 구축 및 작업 지시서

## 🚨 최상위 필수 준수 원칙 (Check & Skip Guardrail)
1. **사전 `git pull` 필수**: 작업 시작 전 반드시 `git pull`을 실행하여 최신 명세(`spec/space/space-card.md`)를 로컬에 반영한 후 착수할 것.
2. **기능명세서 충돌 시 즉시 스킵 (Absolute Override)**: 
   - 작업 진행 중 기존 기능명세서(`spec/`) 및 상위 문서 규칙과 충돌이 발생하거나 미흡한 사안을 발견할 경우, **해당 코드를 임의로 변경하거나 작업을 강행하지 말고 즉시 해당 항목을 스킵(Skip)** 처리할 것.
   - 스킵된 항목은 본 `todo.md` 하단 **[Claude 작업 진행 및 검토 결과 보고서]**의 `[기존 기능명세서 충돌 및 스킵 로그]` 구역에 사유와 함께 상세히 보고할 것.

> 🚨 **[클로드 전용 작업 지시]** 
> 본 문서의 **[선행 조사 결과]** 및 **[데이터 표준화 원칙]**을 바탕으로, 아래 **[🎯 신규 진행 Task 목록]**의 **Task 1번부터 순차적으로 코드를 구현**하고 결과를 본 문서 하단 보고서에 작성하세요.

---
- [~] **[Task 8-1] 서울열린데이터광장(data.seoul.go.kr) 실시간 행사/예약 수집 어댑터 구현** — **스킵(기존 구현과 충돌/중복 확인, 2026-08-21)**
  - **환경변수**: `SEOUL_DATA_API_KEY`
  - **API 1 (서울시 문화행사)**:
    - Base URL: `http://openAPI.seoul.go.kr:8088/{SEOUL_DATA_API_KEY}/json/SeoulCulturalEvents/{START_INDEX}/{END_INDEX}/`
  - **API 2 (서울시 공공서비스예약 문화체험)**:
    - Base URL: `http://openAPI.seoul.go.kr:8088/{SEOUL_DATA_API_KEY}/json/ListPublicReservationCulture/{START_INDEX}/{END_INDEX}/`
  - **작업 지시**:
    - 페이징 단위 1,000건 설정 (`1/1000/`, `1001/2000/` ...).
    - 서울시 고유 에러 코드(`INFO-000`, `INFO-200` 등) 예외 처리.
    - `open_events` 스키마 변환, 키워드 기반 `is_kids_friendly` 정밀 판단 및 `SHA1(이름|주소)` 기반 `external_id` 중복 방지.
    - `spec/ui/space-card.md` 뱃지 규약 적용 (`is_free` 오탐 방지).
  - **산출물**: `scripts/ingest/adapters/seoul-events-adapter.mjs` 및 `seoul-events-adapter.test.mjs`

## [Claude 작업 진행 및 검토 결과 보고서]

### [기존 기능명세서 충돌 및 스킵 로그]

#### Task 8-1 — 스킵 (2026-08-21)
착수 전 두 API를 실제 호출로 검증한 결과, 둘 다 신규 구현이 불필요하거나 불가능함을 확인해 코드를 작성하지 않고 스킵했다(가이드라인 제2조: 충돌 시 임의 강행 금지, 즉시 스킵).

- **환경변수 불일치**: `.env.local`에는 `SEOUL_DATA_API_KEY`가 존재하지 않고, 서울 열린데이터광장 키는 기존 어댑터들이 전부 써온 `SEOUL_OPEN_DATA_KEY` 하나뿐이다(같은 기관의 단일 발급 키). 검증 호출에는 이 기존 키를 사용했다.
- **API 1 (`SeoulCulturalEvents`) — 존재하지 않는 엔드포인트**: 실제로 `http://openapi.seoul.go.kr:8088/{key}/json/SeoulCulturalEvents/1/3/`을 2회 반복 호출한 결과 매번 `{"RESULT":{"CODE":"ERROR-500", ...}}`을 받았다(추측이 아닌 실측). 반면 같은 "서울시 문화행사" 데이터를 제공하는 **실제 동작하는 엔드포인트 `culturalEventInfo`**는 이미 `scripts/ingest/seoul-culture-events.mjs`(Source #05, `project/data_sources.md` 2.2 #05 "구현 완료")로 구현·운영 중이며 방금 재확인한 실제 응답도 `INFO-000` 정상, 19,508건이다. 즉 API 1이 요구하는 데이터는 이미 다른(정확한) 엔드포인트로 커버되고 있다.
- **API 2 (`ListPublicReservationCulture`) — 이미 수집 중인 데이터의 부분집합**: 이 엔드포인트 자체는 정상 동작한다(`INFO-000`, 1,063건). 그러나 실제 호출로 대조한 결과, 이 데이터는 **이미 구현된 `SeoulYeyakAdapter`(`tvYeyakCOllect` 통합 엔드포인트)가 매일 수집하는 문화행사(DIV="문화행사") 카테고리의 부분집합**이다 — `ListPublicReservationCulture`의 표본 레코드(`SVCID: S260722093915914461`)가 `tvYeyakCOllect` 응답에도 동일하게 존재함을 실측으로 확인했고, `tvYeyakCOllect` 전체 2,743건 중 문화행사 DIV만 필터링한 규모(1,063건)와도 정확히 일치한다. 이 상태에서 API 2를 별도 어댑터로 구현하면 같은 예약 레코드가 `SEOUL_YEYAK_{SVCID}`(기존)와 신규 SHA1 해시 키 두 가지 `external_id`로 중복 적재된다 — TourAPI 4.0 계열(KorPetTour/KorWithTour/KorService2)에서 이미 한 번 겪고 수정한 것과 동일한 유형의 데이터 중복 문제다.
- **결론**: Task 8-1이 요구하는 두 데이터 모두 이미 정확한 형태로 수집 중이라 신규 코드를 작성하지 않았다. 새로운 처리가 필요한 부분(예: `SeoulCulturalEvents`라는 이름의 실제로 다른 데이터셋이 존재하는지)은 사용자가 서울 열린데이터광장에서 직접 재확인 후 다른 정확한 서비스명으로 다시 지시해주면 즉시 재개 가능.
