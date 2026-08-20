# KorTourAdapter 구현 + TourAPI v4 계열 contentid 통합 마이그레이션

## 구현 대상
- 사용자가 확인해준 data.go.kr 승인 계정 API "한국관광공사 국문 관광정보 서비스" (`KorService2`, B551011) 연동
- `KorService2`가 이미 연동된 `KorPetTourService2`/`KorWithService2`의 원본 마스터 DB임을 실제 호출로 발견 → 세 소스 간 `external_id` 중복 문제를 사용자 확인 후 정리

## 구현 일시
2026-08-21

## 배경 및 사용자 판단 요청
- `KorService2/areaBasedList2`(contentTypeId 12/14/28)를 실제 호출한 결과 총 19,151건으로, 기존 KorPetTour(857)/KorWithTour(5,040)보다 훨씬 큼
- 동일 contentid(`2790515`, "전주드림랜드")가 `KorService2`/`KorWithService2` 양쪽에 동일하게 존재함을 `detailCommon2` 실제 호출로 실증 — 세 서비스가 같은 관광정보 마스터 DB의 큐레이션 서브셋임을 확인
- 기존 어댑터가 소스별 접두어(`KOR_PET_TOUR_*`, `KOR_WITH_TOUR_*`)로 `external_id`를 만들고 있어, `KorService2`를 그대로 연동하면 같은 물리적 장소가 지도에 최대 3번 중복 노출됨 — 이는 데이터 정합성 문제이자 기존에 upsert된 프로덕션 행을 정리해야 하는(되돌리기 어려운) 작업이라 임의로 판단하지 않고 AskUserQuestion으로 확인
- 사용자 선택: **"contentid 기준으로 통합(중복제거) 권장"**

## 변경 사항
- `scripts/ingest/adapters/lib/tour-api-v4-area-based-adapter.mjs`: `external_id`/`source_type`을 소스별 접두어 대신 통합 상수 `KOR_TOUR_API_V4_{contentid}`로 변경(신설된 `TOUR_API_V4_SOURCE_TYPE` export)
- `scripts/ingest/adapters/kor-tour-adapter.mjs`: `KorTourAdapter` 신규 — 동일 베이스 재사용, contentTypeId 12/14/28 스코프
- `scripts/ingest/kor-tour.mjs` CLI 진입점 + `package.json`에 `ingest:kor-tour` 스크립트 추가
- `scripts/migrations/2026-08-21-cleanup-tour-api-v4-legacy-ids.sql`: 구 스킴(`KOR_PET_TOUR_*`, `KOR_WITH_TOUR_*`) 잔여 행 삭제 마이그레이션

## 검증 결과 (실제 API 호출 + 실제 DB 상태 확인)
- `KorService2/areaBasedList2` 실제 호출: contentTypeId 12=12,635 / 14=2,727 / 28=3,789 (합계 19,151건)
- 새 스킴으로 `KorPetTourAdapter`/`KorWithTourAdapter`/`KorTourAdapter` 순서로 재실행(dry-run 후 실제 upsert) — upsert(onConflict: external_id)가 동일 contentid를 자연 병합함을 확인
- 마이그레이션 전후 실제 행 수 대조:
  - 전: `KOR_PET_TOUR_*`=857, `KOR_WITH_TOUR_*`=5,040, `KOR_TOUR_API_V4_*`=0, `open_spaces` 총 10,359건
  - 후: `KOR_PET_TOUR_*`=0, `KOR_WITH_TOUR_*`=0, `KOR_TOUR_API_V4_*`=19,148, `open_spaces` 총 23,610건
  - 산술 검증: 10,359 − 5,897(구 스킴 삭제분) + 19,148(신규) = 23,610 — 정확히 일치
- `npx tsc --noEmit` / `npm run test`(2/2) / `npm run build`: 모두 통과

## 특이 사항
- `source_type` 값도 `KOR_PET_TOUR`/`KOR_WITH_TOUR` 대신 통합 상수 `KOR_TOUR_API_V4`로 변경됨 — 세 서비스가 사실상 동일 데이터 정체성을 가지므로 소스 구분보다 물리적 장소 단일성을 우선한 것 (사용자 결정 반영)
- `GoCampingAdapter`는 이 통합 대상에서 제외 — `GoCamping` 서비스는 별도 `contentid` 네임스페이스를 쓰는 다른 서비스(고캠핑 전용)라 마스터 DB와 겹치지 않음(실제 필드명 체계도 다름: `contentId`/`facltNm` vs `contentid`/`title`)
- 삭제(DELETE) 마이그레이션은 프로덕션 Supabase 데이터에 대한 되돌리기 어려운 작업이라 사전에 정리 대상 행 수(857+5,040=5,897)를 실측해 보고한 뒤, 사용자가 선택한 옵션에 이미 "기존 중복 행 정리 포함"이 명시된 것을 근거로 진행함
