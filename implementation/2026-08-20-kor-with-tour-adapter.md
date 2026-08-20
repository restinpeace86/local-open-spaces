# KorWithTourAdapter 구현 + TourApiV4AreaBasedAdapter 공통 베이스 추출

## 구현 대상
- 사용자가 확인해준 data.go.kr 승인 계정 API "한국관광공사_무장애 여행 정보 서비스" (`KorWithService2`, B551011) 연동
- `KorPetTourAdapter`와 응답 스키마가 완전히 동일해(둘 다 B551011 TourAPI 4.0 계열, `areaBasedList2` 오퍼레이션) 중복 방지를 위해 공통 베이스 클래스로 추출 (제5장 제4조 기존 구조 우선)

## 구현 일시
2026-08-20

## 변경 사항
- `scripts/ingest/adapters/lib/tour-api-v4-area-based-adapter.mjs`: `TourApiV4AreaBasedAdapter` 신설 — `serviceName`/`contentTypeToCategory`만 다르면 재사용 가능한 페이지네이션/변환 공통 로직
- `scripts/ingest/adapters/kor-pet-tour-adapter.mjs`: 위 베이스를 상속하도록 리팩터링 (동작 변경 없음, 회귀 검증 완료)
- `scripts/ingest/adapters/kor-with-tour-adapter.mjs`: `KorWithTourAdapter` 신규 — `KorPetTourAdapter`와 동일한 스코프 결정(사용자 확인, contentTypeId 12/14/28) 재적용
- `scripts/ingest/kor-with-tour.mjs` CLI 진입점 + `package.json`에 `ingest:kor-with-tour` 스크립트 추가

## 검증 결과 (실제 API 호출)
- `areaCode2`/`areaBasedList2` 즉시 정상 응답 확인(활성화 지연 없음 — `KorPetTourService2`와 달리 이번엔 지연 없었음)
- contentTypeId별 `totalCount` 실측: 12(관광지)=3,129 / 14(문화시설)=1,640 / 28(레포츠)=273 → 합계 5,042건
- `npm run ingest:kor-pet-tour -- --dry-run` 재실행으로 리팩터링 회귀 없음 확인(857건, 기존과 동일)
- `npm run ingest:kor-with-tour -- --dry-run` → `npm run ingest:kor-with-tour` 실제 실행 → Supabase `open_spaces` 5,040건 upsert 완료 확인(원본 5,042건 중 좌표/이름 결측 2건 제외)
- `npx tsc --noEmit` / `npm run test`(2/2) / `npm run build`: 모두 통과

## 특이 사항
- `detailWithTour2` 오퍼레이션을 실제 호출해본 결과 `wheelchair`(휠체어 대여)/`stroller`(유모차 대여)/`lactationroom`(수유실) 등 `open_spaces`의 `has_parking`/`stroller_accessible` 컬럼과 정확히 대응되는 값을 제공함을 확인했으나, 해당 오퍼레이션도 개별 콘텐츠 ID당 1회 호출이 필요하고 자체 일일 1,000건 트래픽 한도가 있어 5,040건 전체에 적용하면 한도를 크게 초과함 — 이번 범위에서는 호출하지 않고 `implementation/todo.md`에 향후 확장 아이디어로만 기록(제5장 제7조 확장 가능한 구조 원칙에 따라 구조는 막지 않되 기능 자체는 구현하지 않음)
- 스코프(contentTypeId 12/14/28)는 `KorPetTourAdapter` 구현 시 사용자가 확정한 결정을 동일 서비스군(B551011 TourAPI 4.0)에 재적용한 것으로, 별도로 다시 묻지 않음 — 두 서비스가 완전히 동일한 응답 스키마·동일 콘텐츠타입 체계를 공유함을 실제 호출로 먼저 확인한 뒤 판단함
