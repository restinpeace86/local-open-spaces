# [행사 데이터 수집/정제 파이프라인 및 홈 피드 필터링 개선]

## 구현 대상
1. 만료 데이터(`is_active`) D+1 즉시 비활성화
2. `USETGTINFO` 등 원천 타겟 연령 필드의 NULL/혼재 데이터 정제 규칙 2건(블랙리스트, 최연소
   대표값 매핑)
3. 특정 중분류 4종(`단체봉사`/`청년정보`/`정보통신`/`전문/자격증`)의 사용자 노출 쿼리 강제 배제
4. `/admin/data-grid` 필터 UI 개편(다중 선택 체크박스 + NULL 옵션 + 명시적 조회 버튼) 및
   기본 정렬 변경(`start_date ASC`)

## 구현 일시
2026-08-27

## 1. D+1 즉시 비활성화

`scripts/ingest/lib/deactivate-expired-events.mjs`의 `EXPIRY_GRACE_DAYS`를 기존 2일에서 0일로
변경 — `end_date < CURRENT_DATE`(유예 없음) 조건으로 종료일 다음 날(D+1) 첫 배치부터 즉시
`is_active=false`로 전환한다. 기존 배치(`run-daily.mjs`)/스크립트 구조는 그대로 재사용(로직
자체가 컷오프 계산 함수 하나만 수정하면 되는 구조라 별도 배선 변경 불필요).

**실행 결과(실제 UPDATE, 2026-08-27)**: 실행 전 `is_active=true` 3,560건 → 신규 비활성화
97건 → 실행 후 3,463건. 재실행 시 0건(멱등성 확인).

## 2. 원천 타겟 연령 혼재 데이터 정제 규칙 (`scripts/ingest/lib/target-audience-taxonomy.mjs`)

`resolveViaRawField`(0순위, `USE_TRGT`/`target_age_group`/`USETGTINFO` 원천 필드 파싱)에
2개 규칙을 추가했다.

### 2.1. 블랙리스트 선제 필터링
`난임`/`임산부`/`임신`/`출산지원`/`전문 자격` 키워드가 있으면(괄호 안팎 포함, 원본 문자열
전체를 검사하는 기존 `hasNegativeOverride` 메커니즘을 그대로 재사용) 가족/어린이 대상
(kidFamily 태그: INFANT/KIDS_PRE/KIDS_SCHOOL/FAMILY)에서 원천 제외한다. 완전 판단 불가로
처리하는 게 아니라 kidFamily만 막는 것이므로 "성인(난임)"처럼 다른 유효 태그(ADULT)는 그대로
정상 매칭된다.

### 2.2. 최연소 연령 대표값 매핑
1을 통과한 뒤에도 순수 연령 태그(INFANT/KIDS_PRE/KIDS_SCHOOL/TEEN/YOUTH/ADULT/SENIOR)가 여러
개 섞여 있으면(예: "어린이, 청소년, 성인") `AGE_ORDER`(젊은순) 기준 가장 어린 태그를 대표값으로
채택한다. FAMILY/ALL/FACILITY처럼 나이가 선형이 아닌 태그가 섞이면(예: "어린이, 가족") 지시받은
범위 밖이라 추측하지 않고 기존처럼 다음 단계(1단계/2단계)로 넘긴다.

### 2.3. 실측으로 발견한 숨은 버그 (구현 중 수정)
기존 `NEGATIVE_OVERRIDE_KEYWORDS`의 "연령/대상" 그룹에 이미 `'성인'`이 포함돼 있었는데,
`resolveViaRawField`가 이 전체 목록으로 `hasNegativeOverride`를 게이트하고 있어서 "어린이,
성인"처럼 정상적인 혼재 열거값조차 `'성인'` 때문에 `allowKidFamily=false`가 되어 `'어린이'`
토큰이 UNRESOLVED_TOKEN으로 막히고 있었다 — 즉 지시받은 예시("어린이, 청소년, 성인")가 위 2.2
규칙을 구현한 그대로는 전혀 동작하지 않는 상태였다(테스트로 실측 발견). `'성인'`/`'어르신'`/
`'시니어'`/`'실버'`/`'은퇴'`/`'청년'`(연령 라벨 그룹)은 자유 텍스트(제목/설명, 2단계)에서는
여전히 소거 게이트로 쓰되, `resolveViaRawField`(쉼표 나열 원천 필드 전용)에서만 이 그룹을
제외한 `RAW_FIELD_NEGATIVE_OVERRIDE_KEYWORDS`를 도입해 분리했다 — 연령 라벨은 원천 필드
맥락에서 "혼재된 여러 대상 중 하나"를 가리키는 정상 토큰이지, 프로그램 전체를 성인 전용으로
만드는 신호가 아니기 때문이다.

**재적용 실행 결과(실제 UPDATE, is_active=true 3,463건 대상)**:

| 항목 | 이전(2026-08-27 오전 10대 체계 적용) | 이후(신규 규칙 반영) |
| :--- | ---: | ---: |
| 스캔 대상 | 3,560건 | 3,463건(D+1 배치로 97건 감소) |
| 값이 채워진 행 | 2,968건(83.37%) | 3,091건(89.26%) |
| NULL 잔여 | 592건(16.63%) | 347건(10.02%) |
| MANUAL 보존 | 0건 | 25건(그사이 어드민 수동 지정분) |

태그별 분포(신규): ALL 1,433 · KIDS_PRE 426 · ADULT 427 · KIDS_SCHOOL 320 · FAMILY 179 ·
TEEN 131 · YOUTH 123 · FACILITY 31 · SENIOR 20 · INFANT 1. 판정 근거: RAW_FIELD 2,931 ·
TEXT 122 · CATEGORY 38.

## 3. 특정 중분류 4종 강제 배제 (`src/lib/home/get-home-feed.ts`)

`단체봉사`/`청년정보`/`정보통신`/`전문/자격증`은 데이터 수집·표준 분류(`category_min`) 자체는
그대로 유지하되(백엔드 taxonomy 변경 없음), 사용자 노출 쿼리에서만 배제한다. 기존에 이미
모든 이벤트픽 쿼리(getTodayEvents/getReservationOpenEvents 2개 하위쿼리/searchEvents/
getProvinceWideEvents/getFreeFeed(events)/getThemeSpotFeed(events)/getCategoryFeed, 총 8곳)에
걸려 있던 `.not('category_min', 'is', null)` 바로 옆에 `.not('category_min', 'in',
EXCLUDED_CATEGORY_MIN_FILTER)`를 추가했다 — "홈 피드/이벤트픽/전체 탭 등 노출되는 모든 메인
쿼리"가 이 8곳으로 이미 통합돼 있어 별도 라우트 추가 없이 전부 커버된다.

**실측 확인(2026-08-27, 구현 착수 전)**: `is_active=true` 3,560건 중에도 이 4개 값이 43건
남아 있었다(청년정보 33/정보통신 6/전문·자격증 3/단체봉사 1) — 이미 대분류 재정리 때 대부분
NULL로 정리됐을 것이라는 가정과 달리 실제로 걸러야 할 대상이 존재함을 확인한 뒤 필터를
추가했다(추측 없이 실측 먼저 확인).

## 4. `/admin/data-grid` 필터 UI 개편

### 4.1. API (`src/app/api/admin/data-grid/route.ts`)
`category_min`/`target_audience` 필터를 단일값 `.eq()` + 별도 `missing_*` 불리언 조합에서,
콤마 구분 다중값 + NULL 예약 토큰(`__NULL__`) 조합 하나로 통합했다(`applyMultiValueOrNullFilter`
신설).가능한 조합:
- 값만 여러 개: `.in()`
- `__NULL__`만: `.is(null)`
- 값 + `__NULL__` 함께: `` .or(`column.in.(...),column.is.null`) `` (PostgREST 문법 직접 구성,
  get-home-feed.ts의 `regionOrFilter`와 동일한 이유로 값마다 큰따옴표로 감싸 안전하게 구성)

`queryOpenSpacesViaSourceSubset`(SEOUL_YEYAK 전용 JS 필터 경로)도 동일한 다중값+NULL 판정을
내리는 `multiValueOrNullPredicate` 술어로 맞춰 두 경로(SQL/JS)가 같은 필터 의미를 갖도록
했다.

이벤트 탭 기본 정렬을 `created_at DESC`에서 `start_date ASC`로 변경했다.

### 4.2. 클라이언트 (`src/components/admin/data-grid-client.tsx`)
- 신규 `CheckboxMultiSelect` 컴포넌트(실제 `<input type="checkbox">` 목록, `includeNullOption`
  이면 맨 앞에 "미지정(NULL)" 체크박스 추가) — 기존 단일 `<select>` 2개(중분류/타겟 연령)를
  대체.
- 체크박스 선택을 "대기(pending)"/"적용(applied)" 두 단계로 분리 — 체크박스는 `pending*`만
  바꾸고, 실제 쿼리 파라미터·fetch effect 의존성 배열은 `applied*`만 본다. 다른 필터(검색어/
  칩/토글)는 기존처럼 즉시 반영을 유지한다(이번 지시가 체크박스 2종에 한정됐기 때문).
- `[🔍 조회하기]` 버튼 클릭 시에만 `pending → applied` 반영, 그 순간 단 한 번만 쿼리가
  실행된다. 대기 중인 변경사항이 있으면 버튼 색상과 안내 문구로 표시.

## 5. 검증

- 실측으로 발견해 함께 수정한 버그: `target-audience-taxonomy.mjs`의 기존 "연령/대상"
  소거 그룹이 `resolveViaRawField`의 혼재 매핑 규칙을 무력화하고 있던 것(2.3절).
- `npx tsc --noEmit`: clean.
- `npm run test`: 44 파일 473건 전체 통과(target-audience-taxonomy.test.mjs에 혼재 매핑/
  블랙리스트 신규 테스트 4건 추가, deactivate-expired-events.test.mjs D+1 케이스로 갱신).
- `npm run build`: 성공, 전체 라우트 정상 생성.
- 실제 DB 반영: 1절/2절 표 참고(D+1 배치 재실행, target_audience 재정제 재실행 — 두 작업
  모두 실제 UPDATE라 사전에 대표 승인 확인 후 실행).
- `npm run dev` 로컬 서버로 실측 확인:
  - `/api/home/feed` 200 정상 응답(총 40건, 신규 배제 필터 포함 상태로 정상 동작).
  - `/api/admin/data-grid?table=events&is_active=true` 정렬이 `start_date` 오름차순으로
    바뀐 것 확인(2021년대 오래된 항목부터 노출).
  - 다중 선택 + NULL 조합 검증: `category_min=단체봉사` 단독 3건, `category_min=__NULL__`
    단독 15,342건, `category_min=단체봉사,__NULL__` 조합 15,345건 — 정확히 3+15,342와
    일치해 OR 결합 로직이 의도대로 동작함을 확인.

## 6. 범위 밖 (임의 반영하지 않음)
- 4번 지시의 "다중 선택 체크박스" 변경은 `category_min`/`target_audience` 2개 필터에만
  적용했다 — 다른 필터(source/category 칩, tri-state 토글)는 지시 범위 밖이라 기존 즉시
  반영 방식을 그대로 유지했다.
- `docs/target-audience-10tier-dryrun-report.md` 5절에 명시된 기존 범위 밖 항목(숫자 나이
  임계값 파싱, 여성/장애인/국가유공자 등 비-연령 인구 속성 처리)은 이번에도 건드리지 않았다.
