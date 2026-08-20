# GoCampingAdapter 구현

## 구현 대상
- 사용자가 확인해준 data.go.kr 승인 계정 API "한국관광공사_고캠핑 정보 서비스" (`GoCamping`, B551011) 연동

## 구현 일시
2026-08-21

## 변경 사항
- `scripts/ingest/adapters/go-camping-adapter.mjs`: `GoCampingAdapter` (`BaseCollectorAdapter` 구현체) — `basedList` 오퍼레이션 페이지네이션 호출, `open_spaces` 테이블에 매핑
- `scripts/ingest/go-camping.mjs` CLI 진입점 + `package.json`에 `ingest:go-camping` 스크립트 추가

## 검증 결과 (실제 API 호출)
- `basedList` 즉시 정상 응답 확인(`resultCode: 0000`, 총 3,097건, 활성화 지연 없음)
- `npm run ingest:go-camping -- --dry-run` → 3,097건 수신, 좌표/이름 유효 3,087건 변환 확인
- `npm run ingest:go-camping` 실제 실행 → Supabase `open_spaces` 3,087건 upsert 완료 확인
- `npx tsc --noEmit` / `npm run test`(2/2) / `npm run build`: 모두 통과

## 특이 사항
- TourAPI 4.0 계열(`KorPetTourService2`, `KorWithService2`)과 달리 응답 필드명이 카멜케이스(`contentId`/`facltNm`/`mapX`/`mapY`)이고 오퍼레이션명도 `areaBasedList2`가 아닌 `basedList`라 `TourApiV4AreaBasedAdapter` 공통 베이스를 재사용하지 않고 별도 어댑터로 구현함(억지로 공통화하면 오히려 필드 매핑 분기가 늘어나 복잡도만 증가)
- 캠핑장은 카테고리 분기가 필요 없음 — GoCamping 서비스 자체가 캠핑장 전용이라 이전 두 소스(KorPetTour/KorWithTour)처럼 `contentTypeId`별 스코프를 사용자에게 다시 확인할 필요가 없었음(전체가 이미 OUTDOOR_NATURE 범위)
- `isFree`는 원본에 요금 필드가 없어 `null`(임의 추정하지 않음), `facilityType`은 캠핑장이 정의상 야외 시설이라는 사실에 근거해 `'야외'`로 설정 — 이는 비즈니스 판단이 아니라 캠핑장이라는 카테고리 자체의 물리적 특성
- 원본에 `sbrsCl`(편의시설)/`posblFcltyCl`(가능시설)/`animalCmgCl`(반려동물 동반가능) 등 풍부한 정형 필드가 있어 `is_kids_friendly`/`has_parking` 등을 규칙 기반으로 채울 여지가 있음을 확인했으나, 값 종류가 다양해 정확한 매핑표 없이 임의로 규칙을 만들지 않고 `raw_data`에만 원본 그대로 보존 — `implementation/todo.md`에 향후 확장 아이디어로 기록
