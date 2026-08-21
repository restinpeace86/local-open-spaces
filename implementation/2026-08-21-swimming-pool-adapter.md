# SwimmingPoolAdapter 구현 (Task 7-3)

## 구현 대상
- `implementation/todo.md` [Task 7-3]: 체육진흥공단(B551014, 공공) + 행정안전부(1741000, 민간 인허가) 2개 API를 통합한 전국 수영장 수집 어댑터

## 구현 일시
2026-08-21

## 변경 사항
- `scripts/ingest/adapters/swimming-pool-adapter.mjs`: `SwimmingPoolAdapter`(`BaseCollectorAdapter` 구현체) — 두 API를 병렬 페이지네이션 수집(`fetch()`가 `{ api1Items, api2Items }` 반환), `open_spaces`에 매핑
- `scripts/ingest/swimming-pool.mjs` CLI 진입점 + `package.json`에 `ingest:swimming-pool` 스크립트 추가
- `scripts/ingest/adapters/swimming-pool-adapter.test.mjs`: 14개 단위 테스트(응답 봉투/성공코드, 폐업 필터, 좌표 변환, facility_type/is_free 매핑, 중복 식별, external_id 안정성)

## 검증 결과 (실제 API 호출 + 실제 DB 반영)
- API1(B551014) 실제 호출: `resultCode: '00'`, 총 663건
- API2(1741000) 실제 호출: `resultCode: '0'`(API1과 다른 한 자리 코드 — 실측으로 확인, 사전에 가정하지 않음)
- `swimming-pool-adapter.test.mjs` 14/14 통과
- `npx tsc --noEmit` / `npm run test`(전체 60/60) / `npm run build`: 모두 통과
- `npm run ingest:swimming-pool -- --dry-run` → 1,537건 변환 확인 → `npm run ingest:swimming-pool` 실제 실행 → Supabase `open_spaces` 1,537건 upsert 완료(중복 external_id 0건 재확인)

## 특이 사항 (스펙 문구와 실제 구현이 다른 부분 — 임의 변경이 아니라 기존 스키마·실측 근거)
1. **`facility_type = '수영장'` 미채택**: Task 지시서 원문 그대로 대입하면 `schema-mapper.mjs`의 `normalizeFacilityType`이 인식하지 못하는 값이라 조용히 `'복합'`으로 치환되어 사실상 반영되지 않는다. `spec/space/space-card.md`의 실내/야외 뱃지도 `실내`/`야외`/`복합` 도메인만 렌더링한다. 대신 API1의 실측 필드 `inout_gbn_nm`(실내/실외/실내외/없음)을 `playground-adapter`(Task 7-1)와 동일한 패턴으로 정직하게 매핑했다. API2에는 실내/실외 필드가 없어 기본값(`복합`)을 유지했다(추측 금지).
2. **`is_kids_friendly` 미매핑**: 두 API 모두 개별 레코드가 "키즈 전용"인지 구분하는 필드가 없다. `playground-adapter`는 "전국어린이놀이시설정보"라는 소스 자체가 정의상 아동 전용이라 소스 레벨로 `true`를 고정할 근거가 있었지만, 수영장은 성인 강습/자유수영 등 일반 대상 시설이 대부분이라 그런 근거가 없다. 임의로 매핑하지 않고 기본값(`false`)을 유지했다.
3. **`is_free` 판별**: 요금 필드가 원본에 없으나 운영주체 필드가 레코드별로 실제 내려온다 — API1 `faci_gb_nm`('공공'/그 외), API2 `PBP_SE_NM`('공립'/'사립'). `ai-tagging.mjs`의 `deriveIsFreeFallback`(playground-adapter와 동일 함수)을 그대로 재사용해 공공/공립만 `true`, 나머지는 `null`로 판별했다.

## 실제 발견한 데이터 이슈 (구현 중 upsert 실패로 발견 → 자체 수정)
- API2 `MNG_NO`를 그대로 `external_id`로 사용했더니 실제 upsert가 `ON CONFLICT DO UPDATE command cannot affect row a second time`로 실패했다.
- 원인 조사 결과 `MNG_NO`는 전국 유일 키가 아니라 **발급 지자체별로 자체 채번되는 값**이었다 — 실측 확인: `CDFH3301012026000001`이라는 동일 `MNG_NO`가 인천 계양구 "스윔박스", 경기 김포시 "리풀리", 강원 정선군 "블루스카이풀" 등 37건의 전혀 다른 물리적 시설에 중복되어 있었다(같은 값이지만 발급 지자체가 다름).
- 이는 이전에 `LocalDataKidsAdapter`(포지션 인덱스 문제)/`NationalParkEcotourAdapter`(지역명 텍스트 자체는 유일 키가 아님)에서 이미 겪었던 "원본 소스 ID가 전역 유일하지 않음" 문제와 같은 유형이라, 동일한 해법(이름|주소 SHA1 해시로 external_id 결정)을 재사용해 해결했다. API1의 `faci_cd`는 실제 전수(663건)를 대조해 전역 유일함을 확인했으므로 그대로 사용했다.
- 회귀 테스트 추가: `swimming-pool-adapter.test.mjs`에 "API2 MNG_NO가 서로 다른 시설 간에 중복돼도 external_id는 충돌하지 않는다" 케이스를 명시적으로 추가해 이 문제가 재발하면 즉시 감지되도록 했다.

## 중복 식별 로직의 한계 (문서화)
- Task 지시서대로 "시설명+주소" 정규화(공백 제거) 일치만으로 중복을 판별한다. 두 기관이 완전히 동일한 표기로 등록한 경우만 잡아내며, 도로명/지번 표기가 다르거나 건물명 표기가 달라 겹치는 경우까지는 잡아내지 못하는 보수적 MVP 수준 로직이다. 더 정교한 매칭(예: 좌표 근접 거리 기반)은 이번 범위에서 구현하지 않았다(Task 지시서에 명시된 로직만 구현, 과잉 구현 지양).
