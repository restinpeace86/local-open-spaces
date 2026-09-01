# [개발 요청] 스팟별 날씨 및 대기질(미세먼지) 캐시 테이블 스키마 생성

## 구현 일시
2026-09-01

## 요구사항
스팟픽 스팟별로 기상청 단기예보/에어코리아 대기질 데이터를 캐시할 테이블 스키마와
마이그레이션 SQL 작성(이번 지시서 범위는 스키마 생성까지 — 실제 수집 어댑터/API
라우트는 포함하지 않음).

## 조치

### `scripts/migrations/2026-09-01-create-spot-weather-caches-table.sql`
지시서 그대로 `spot_weather_caches` 테이블을 만들었다.

- **FK 대상 정정**: 지시서는 "`spots` 테이블 참조"라고 썼으나, 이 프로젝트의 실제
  공간 테이블명은 `open_spaces`다(project/database_schema.md 3.1, `spot_curations`도
  동일하게 참조 중) — "프로젝트 컨벤션에 맞는 이름"이라는 지시서 문구에 따라 그대로
  대응했다.
- **컬럼**: `temperature`(TMP, numeric), `precipitation_prob`(POP, integer, 0~100
  CHECK), `sky_status`(SKY, text), `humidity`(REH, integer, 0~100 CHECK), `pm10`/
  `pm25`(numeric), `pm10_grade`/`pm25_grade`(text), `updated_at`(timestamptz,
  기본값 now()). 퍼센트 컬럼의 CHECK 제약은 특정 API 응답 포맷을 추측한 게 아니라
  "퍼센트"라는 값 정의 자체에서 나오는 구조적 제약이다.
- **1:1 관계**: `spot_curations`과 동일한 모델링(별도 `id` PK + `spot_id` UNIQUE NOT
  NULL FK) — 기존 구조 우선. `spot_id`가 이미 UNIQUE라 그 자체로 조회 인덱스를
  겸한다. "캐시" 테이블 특유의 조회 패턴(오래된 캐시 판별)을 위해 `updated_at`에도
  별도 인덱스를 추가했다.
- **RLS**: 지시서는 예시로 "인증된 유저는 읽기 가능"을 들었으나, 이 앱에는 로그인/
  세션 인증이 전혀 없어(known gap) "인증된 유저" 역할이 실질적으로 존재하지 않는다
  — curated_items/spot_curations/deals와 동일한 프로젝트 전역 패턴(RLS 켜고 정책
  없음, service_role 전용)을 그대로 따랐다. 공개 조회가 필요해지면 spot_curations
  처럼 별도 서버 API 라우트로 노출하면 된다(이번 범위 밖).

### 타입 갱신
`npm run gen:types`로 `src/types/database.types.ts`에 새 테이블 타입을 반영했다.

## 검증

### 코드 검증
- `npx tsc --noEmit`/`npm run test`(75파일 769건, 변경 없음 — 순수 스키마 추가라
  기존 코드에 영향 없음)/`npm run build` 통과.

### 실측 검증(로컬 개발 서버, 프로덕션 DB — 테스트 데이터는 검증 직후 삭제)
실제 `open_spaces` 행 하나를 대상으로:
- `service_role`로 정상 INSERT 성공.
- 같은 `spot_id`로 재INSERT 시도 → UNIQUE 제약 위반 에러 확인.
- `humidity=150`으로 UPDATE 시도 → CHECK 제약 위반 에러 확인.
- `upsert(onConflict: 'spot_id')`로 기존 행 갱신 성공(temperature 값이 실제로
  바뀜을 확인).
- `anon` 키로 SELECT → 빈 배열(RLS가 조용히 필터링, 기존 테이블들과 동일한 패턴).
- `anon` 키로 INSERT → 명시적 RLS 위반 에러("new row violates row-level security
  policy") 확인.
- `on delete cascade`는 실제 `open_spaces` 행 삭제라는 부작용을 감수하지 않기 위해
  라이브 삭제로는 검증하지 않았다 — 표준 Postgres FK 동작이라 SQL 자체로 신뢰 가능.

## 특이 사항
이번 지시서는 "스키마 생성"까지가 범위라, 실제 기상청/에어코리아 수집 어댑터와
이 테이블을 채우는 배치/API 라우트는 구현하지 않았다 — 필요시 별도 지시로 진행 가능.
