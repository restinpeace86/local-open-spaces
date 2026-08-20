# KorPetTourAdapter 구현 + KorPetTourService2 활성화 지연 원인 규명

## 구현 대상
- `SERVICE_KEY_IS_NOT_REGISTERED_ERROR`로 막혀있던 한국관광공사_반려동물 동반여행 서비스(`KorPetTourService2`, B551011) 원인 규명
- 사용자 확인 후 `KorPetTourAdapter` 구현

## 구현 일시
2026-08-20

## 변경 사항
- 원인 규명: `.docx`는 내부적으로 ZIP 아카이브이므로 `unzip -p`로 `word/document.xml`을 추출한 뒤 XML 태그를 제거해 평문으로 변환, 공식 매뉴얼(`한국관광공사_개방데이터_활용신청방법_매뉴얼_v3.3.docx`) 58행에서 "개발계정은 자동승인으로 활용 신청 후, 약 10분~30분 이후에 사용이 가능합니다"를 확인. 추측이 아니라 공식 문서 근거로 원인 확정
- 시간 경과 후 재호출로 `areaCode2`/`areaBasedList2` 정상 응답(`resultCode: 0000`) 확인
- `scripts/ingest/adapters/kor-pet-tour-adapter.mjs`: `KorPetTourAdapter` (`BaseCollectorAdapter` 구현체) — `areaBasedList2` 오퍼레이션 호출, `open_spaces` 테이블에 매핑
- `scripts/ingest/kor-pet-tour.mjs` CLI 진입점 + `package.json`에 `ingest:kor-pet-tour` 스크립트 추가

## 검증 결과 (실제 API 호출)
- `contentTypeId` 12(관광지)/14(문화시설)/28(레포츠) 각각 페이지네이션 호출, 총 857건 실제 수신
- `npm run ingest:kor-pet-tour -- --dry-run`으로 표준 스키마 변환 확인 후, `npm run ingest:kor-pet-tour`로 실제 upsert 실행 → Supabase `open_spaces` 857건 upsert 완료 확인
- `npx tsc --noEmit` / `npm run test`(2/2) / `npm run build`: 모두 통과

## 특이 사항
- **스코프 결정**: `areaBasedList2`는 관광지(12)/문화시설(14)/축제공연행사(15)/레포츠(28)/숙박(32)/쇼핑(38)/음식점(39) 전체를 포괄하는데, `docs/spec.md`의 가성비 아이·가족 놀거리 스코프와 정확히 일치하지 않아 임의 판단하지 않고 사용자에게 확인(AskUserQuestion) — "관광지·문화시설·레포츠(12, 14, 28)"만 수집하기로 확정, 숙박/음식점/쇼핑/축제공연행사는 제외
- contentTypeId → UI 카테고리 매핑(12→OUTDOOR_NATURE, 14→EXHIBITION_MUSEUM, 28→KIDS_ACTIVITY)은 `spec/data/ai-rule.md` 3.3의 기존 DB 원본 카테고리 매핑표와 동일한 대응 원칙(관광지=야외형, 문화시설=전시형, 레포츠=액티비티형)을 적용한 것으로 신규 비즈니스 규칙 발명이 아님
- `isFree`는 원본 응답에 요금 필드가 없어 `null`(임의 추정하지 않음) — 기존 `NationalParkEcotourAdapter`와 동일 원칙
- 원본 응답의 `firstimage`(대표 이미지 URL)는 `open_spaces` 테이블에 `thumbnail_url` 컬럼이 없어(스키마 문서 3.1 확인) `raw_data`에만 보존하고 별도 컬럼 매핑은 하지 않음
- 사용자가 함께 발견한 "한국관광공사_무장애여행 서비스" 참고 매뉴얼(`reference/개방데이터_활용매뉴얼(무장애여행)/`)은 이번 세션에 새로 나타났으나 인증키/서비스ID가 아직 전달되지 않아 착수하지 않음 — `project/data_sources.md` 2.4에 보류 상태로 기록
