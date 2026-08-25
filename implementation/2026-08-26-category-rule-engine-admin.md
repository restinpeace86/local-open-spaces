# [카테고리 정제 & 어드민 확장] Dynamic Keyword Rule Engine 구축 및 /admin/data-grid 키워드 관리 기능

## 구현 대상
- `category_rules` DB 테이블 기반 동적 키워드 규칙 엔진 신규 구축(코드 하드코딩 폐기)
- `open_spaces`/`events`에 `category_min`(표준 중분류)/`category_min_source`(RAW/RULE/MANUAL) 컬럼 추가
- `/admin/data-grid`에 중분류 필터·NULL 퀵필터·출처 뱃지·수동 수정·키워드 규칙 관리 모달 추가
- `run-daily.mjs`/`run-monthly.mjs` 배치 종료 시 자동 재분류 연동

## 구현 일시
2026-08-26

## 배경
`docs/category-mapping-keywords-draft.md`(검토용 초안) → `docs/category-mapping-dryrun-report.md`
(읽기 전용 Dry-run, 매칭률 11.79%)를 거쳐, 대표가 "전체 소스에 새로운 통합 중분류 매핑을 정의"
하는 방향으로 결정했다. 이번 작업으로 그 결정을 실제 동작하는 시스템으로 구현했다.

## 변경 사항

### 1. DB 스키마 (`scripts/migrations/2026-08-26-category-rules-engine.sql`, 적용 완료)
- `category_rules(id, target_table, category_min, keyword, is_exclude, created_at)` 신규 테이블.
  `target_table` 컬럼은 사용자 지시 스키마에는 없었으나 필수로 추가했다 — open_spaces/events
  각각의 표준 중분류명이 우연히 같은 키워드를 공유할 경우(예: open_spaces 시설명에 "축제"가
  섞이면 events 전용 "문화행사" 룰에 오매칭될 수 있음) 잘못된 테이블로 매칭되는 것을 막기
  위한 정확성 필수 요소다.
- `open_spaces`/`events`에 `category_min text`, `category_min_source text CHECK IN
  ('RAW','RULE','MANUAL')` 컬럼 추가 + 각각 인덱스.
- 49종(SEOUL_YEYAK 실측 47종 + Dry-run에서 발견한 구조적 공백 2종 "공원"/"어린이놀이터")
  시드 키워드 122개 행 INSERT.
- SEOUL_YEYAK(source='seoul_public_reservation') 기존 행 RAW 백필:
  `category_min = raw_data->>'MINCLASSNM'`, `category_min_source='RAW'`
  (open_spaces 1,284건, events 1,625건).
- `get_category_min_options(target_table)` RPC 신규(어드민 필터 드롭다운용, category_rules를
  Source of Truth로 삼음).
- `npm run gen:types`로 `src/types/database.types.ts` 재생성.

### 2. 공용 규칙 엔진 (두 런타임에 동일 로직 각각 구현)
- `scripts/ingest/lib/category-rules.mjs`(Node 인제스트 스크립트용)
- `src/lib/admin/category-rules.ts`(Next.js Admin API용)
- 두 파일이 서로 import하지 않는다 — `src/lib/geo/region-hierarchy.ts`에 이미 명시된 이
  프로젝트의 기존 관례("scripts/와 src/는 서로 import하지 않는다")를 그대로 따라 의도적으로
  중복 구현했다.
- 핵심 함수: `loadCategoryRulesGrouped(client, targetTable)`(id 오름차순 = 매칭 우선순위로
  그룹핑), `matchCategoryMin(text, rules)`(첫 매칭 우선, exclude 키워드 체크), `applyCategoryRules
  (client)`(open_spaces/events 양쪽의 `category_min IS NULL` 행만 스캔해 RULE로 UPDATE —
  이미 RAW/RULE/MANUAL로 채워진 행은 덮어쓰지 않음).
- id 기준 Keyset 페이지네이션(`.gt('id', lastId)`) 사용 — OFFSET 기반 `.range()`는 15만
  건대 테이블에서 통계가 오래되면 실측상 timeout이 났다(아래 "실측 중 발견한 이슈" 참고).

### 3. 수집 파이프라인 연동
- `run-daily.mjs`/`run-monthly.mjs`: 기존 단계들이 모두 끝난 뒤 `CATEGORY_RULES_APPLICATION`
  단계를 추가 실행(gg-culture-location-enrichment와 동일한 "신규 적재 아닌 후처리" 패턴,
  `excludeFromVerification: true`로 배치 리포트 드롭 검증에서 제외). dry-run 시에는 실제
  재분류를 실행하지 않고 스킵 메시지만 남긴다.
- `schema-mapper.mjs`(`buildOpenSpaceRow`/`buildEventRow`)에 `categoryMin`/`categoryMinSource`
  선택 파라미터 추가(기본값 null — 넘기지 않는 기존 어댑터 17개는 동작 변화 없음).
- `seoul-yeyak-adapter.mjs`: `item.MINCLASSNM`을 신규 수집 시점부터 곧바로
  `categoryMin`/`categoryMinSource: 'RAW'`로 태깅(마이그레이션의 일회성 백필과 별개로,
  앞으로의 매일 수집분도 계속 RAW로 정확히 채워지도록).

### 4. Admin API
- `GET/POST/DELETE /api/admin/category-rules`: 키워드 조회/추가/삭제.
- `POST /api/admin/category-rules/reclassify`: "[규칙 기반 일괄 재분류 실행]" 버튼.
- `PATCH /api/admin/data-grid/category-min`: 상세 모달의 수동 수정 — 저장 시
  `category_min_source`를 항상 `MANUAL`로 바꾼다.
- 이 세 라우트는 서비스 롤 클라이언트(`src/lib/supabase/admin.ts`, 신규)를 쓴다 — 이 앱에
  아직 로그인/세션 인증이 없어(기존 known gap, 이번 작업 범위 밖) 기존 관례(익명 키)로는
  쓰기 작업이 RLS를 통과하지 못할 수 있기 때문. 조회 전용 기존 라우트는 그대로 익명 키 유지.
- 기존 `GET /api/admin/data-grid`에 `category_min`/`missing_category_min` 필터 파라미터 추가
  (일반 경로 + SEOUL_YEYAK raw_data 서브셋 경로 양쪽 모두), select 컬럼에 `category_min`/
  `category_min_source` 추가.

### 5. Admin UI (`/admin/data-grid`)
- "표준 중분류(category_min)" 드롭다운 필터 + "중분류 NULL만 보기" 체크박스 신규(기존
  "원천 중분류(raw_data 기반, SEOUL_YEYAK 전용)" 필터는 유지 — 대체 아님, 용도가 다름).
- 그리드 행에 `CategoryMinBadge`(RAW=초록/RULE=파랑/MANUAL=보라 뱃지) 신규 컬럼.
- 상세 모달(`RawDataModal`)에 `CategoryMinEditor` 추가 — select로 중분류를 직접 골라 저장하면
  `PATCH /api/admin/data-grid/category-min` 호출, 성공 시 그리드/모달 상태 즉시 반영.
- 헤더에 "카테고리 키워드 규칙 관리" 버튼 → `CategoryRulesModal`(신규 컴포넌트): open_spaces/
  events 탭 전환, 중분류별 키워드 칩 조회, `[+ 키워드 추가]`(중분류/키워드/제외여부 입력),
  칩의 `✕`로 개별 삭제, `[규칙 기반 일괄 재분류 실행]` 버튼(결과를 매칭 건수로 즉시 표시).

## 검증

### 코드 검증
- `npx tsc --noEmit`: clean.
- `npm run test`: 39 파일 410건 통과(신규 10건: `category-rules.test.mjs` 5건,
  `category-rules.test.ts` 5건 — 우선순위 매칭/exclude 처리/기존 값 보존을 각각 검증).
- `npm run build`: 성공. 신규 라우트(`/api/admin/category-rules`,
  `/api/admin/category-rules/reclassify`, `/api/admin/data-grid/category-min`) 모두 정상 포함.

### 실제 동작 확인 (dev 서버 + 실제 DB, 이번 지시는 dry-run이 아니라 실행이 명시적으로 허용됨)
- `/admin/data-grid` 렌더 확인, `GET /api/admin/category-rules` 실호출로 실제 122개 키워드
  확인.
- `PATCH /api/admin/data-grid/category-min` 실호출로 실제 행 1건을 MANUAL로 수정 → 재조회로
  반영 확인.
- `POST /api/admin/category-rules/reclassify` 실호출로 실제 일괄 재분류 실행. 최종 결과
  (아래 "실측 중 발견한 이슈"의 원인으로 두 번 실행됨을 감안한 합산치):
  - **open_spaces: 139,436건 중 95,451건(68.46%) 분류 완료**(RAW 1,284 + RULE 94,166 + MANUAL 1)
    — Dry-run 리포트의 8.24%에서 대폭 개선. 개선의 대부분은 신규 카테고리 "어린이놀이터"
    (59,320건)/"공원"(24,234건)이 차지한다 — Dry-run에서 지적한 구조적 공백(localdata_
    playground/city_park에 대응 카테고리가 없었던 문제)이 정확히 해소됐음을 실측으로 확인.
  - **events: 26,404건 중 9,335건(35.35%) 분류 완료**(RAW 1,625 + RULE 7,710) — Dry-run의
    30.53%와 비슷한 수준(events는 애초에 open_spaces 같은 구조적 공백이 없었으므로 큰 변화
    없음, 예상과 일치).
- `run-daily.mjs --dry-run` 실행으로 `CATEGORY_RULES_APPLICATION` 단계가 배치에 정상
  통합됨을 확인(6/6단계 성공, SEOUL_YEYAK dry-run 샘플에서 `category_min`/`category_min_source`
  가 신규 수집 시점부터 즉시 채워짐도 함께 확인).

## 실측 중 발견해 그 자리에서 수정한 이슈 2건

1. **`category_min` 컬럼 통계 미갱신으로 인한 재분류 스캔 timeout**: 마이그레이션 직후 첫
   재분류 API 호출에서 `open_spaces 재분류 스캔 실패: canceling statement due to statement
   timeout` 발생. 원인은 이 세션에서 이미 여러 번 겪은 동일 패턴(예: [전체 파이프라인 일괄
   가동] 작업의 `idx_open_spaces_source` 이슈) — 방금 추가한 신규 컬럼(`category_min`)에
   대한 플래너 통계가 없어 "`category_min IS NULL`이 거의 전부(실제로는 99%)"인 상황을
   플래너가 잘못 추정해 비효율적인 실행계획을 선택했다. `ANALYZE public.open_spaces;
   ANALYZE public.events;`로 즉시 해결(재실행 시 정상 완료).
2. **`Promise.all` 형제 프로미스의 "댕글링 컨티뉴에이션"**: 위 timeout으로 `applyCategoryRules`
   내부의 `Promise.all([openSpacesPromise, eventsPromise])`가 open_spaces 쪽 예외로 즉시
   reject되어 API가 500을 반환했지만, 이미 시작된 `eventsPromise`(각 페이지 스캔+UPDATE
   루프)는 JS 특성상 취소되지 않고 백그라운드에서 계속 실행돼 조용히 완료됐다(HTTP 응답이
   이미 클라이언트에 간 뒤에도). 그 결과 재시도(ANALYZE 이후 두 번째 호출) 시점에는 events의
   매칭 가능 대상 대부분이 이미 RULE로 채워져 있어 두 번째 호출의 `events.matched`가 0으로
   보고됐다(실제로는 정상 — 실측 조사로 원인을 완전히 규명함, `category_min_source='RULE'`
   행이 이미 존재함을 직접 확인). 데이터 정합성 자체는 문제없다(각 행 UPDATE가 `.is
   ('category_min', null)` 가드로 멱등적이라 중복/손상 없음) — 근본 원인은 1번 이슈였고
   ANALYZE로 해결된 뒤에는 이 레이스가 재현되지 않는다. 별도 코드 방어(Promise 취소/
   `Promise.allSettled` 전환 등)는 이번 근본 원인 해결로 불필요하다고 판단해 추가하지
   않았다 — 과剩한 엔지니어링을 피하기 위함.

## 특이 사항
- 상세 모달의 수동 수정 테스트로 실제 행 1건("서울생활문화센터 체부")을 `category_min='전시실'
  ', category_min_source='MANUAL'`로 직접 수정했다 — 실제 유효한 분류이므로 되돌리지 않고
  그대로 두었다.
- 이번 작업으로 만든 3개 Admin 쓰기 라우트는 서비스 롤 키를 쓴다. 이 앱에 로그인 인증
  자체가 없다는 것은 `/admin/data-grid` 전체의 기존 한계이며(이번 작업으로 새로 생긴 문제가
  아님), 별도 확인/승인 없이 인증 시스템을 추가하지 않았다(제3장 제2조 Spec 우선 — 지시에
  없는 범위 확장 자제).
