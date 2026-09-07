# open_spaces Upsert Guard(노출 중분류/뱃지/놀이방식당 보호) — 기존 구현 실측 검증

## 구현 대상
`implementation/todo.md` [개선사항2] — 공공데이터 배치 upsert 시 관리자가 이미
검수한 노출 중분류/뱃지/놀이방식당 데이터가 절대 덮어써지지 않도록 보호.

## 구현 일시
2026-09-07

## 결론
코드를 실측 조사한 결과, 요청된 보호 장치는 **이미 기존 아키텍처로 전부
충족돼 있음**을 확인했다. 새로 만든 코드는 없다(제5장 제4조 기존 구조 우선 —
불필요한 중복 방지).

## 실측 근거

### 1. 노출 중분류(service_category_id) — 컬럼 자체를 언급하는 ingest 코드가 없음
`grep -rn "service_category_id" scripts/ingest/`(모든 어댑터/라이브러리 포함)
결과 **0건**. Supabase의 `.upsert()`는 전달된 JS 객체에 포함된 컬럼만 `SET`하고
포함되지 않은 컬럼은 그대로 둔다 — 애초에 이 컬럼을 다루는 코드 경로 자체가
없으므로 구조적으로 절대 덮어써질 수 없다. (`service_category_id`는 별도의
관리자 전용 API/화면(`/api/admin/open-spaces/bulk-category-mapping` 등)에서만
쓰인다.)

### 2. 뱃지(curation_badges) — 완전히 다른 테이블(spot_curations)에 저장됨
뱃지는 `open_spaces`가 아니라 별도 테이블 `spot_curations.curation_badges`
컬럼에 저장된다(`src/lib/admin/use-spot-curation-form.ts`). ingest 파이프라인은
`open_spaces`/`events`/`raw_ingest_data` 세 테이블만 쓰고 `spot_curations`를
전혀 참조하지 않는다(`grep -rn "badges" scripts/ingest/` 결과 0건) — 테이블
분리 자체가 보호 장치다.

### 3. category_min(놀이방식당 포함 — 이미 값이 있는 모든 행) — 두 겹 보호
1. **NULL 전용 스코프**: `category-rules.mjs`(RULE 키워드 매칭),
   `detailed-category-fallback.mjs`('기타' 채움),
   `legacy-source-category-mapping.mjs`(레거시 4종 source_type 매핑) 세
   후처리 스크립트 전부 `.is('category_min', null)` 조건으로 스코프가
   제한돼 있다(각 파일에서 실측 확인, 2곳씩 총 6곳) — 이미 값이 채워진 행
   (놀이방식당 포함 어떤 값이든)은 애초에 대상이 아니다.
2. **`upsertRowsSafeMerge()`의 COALESCE 병합**: 어댑터가 신규 수집 시
   category_min을 직접 매기는 경우(예: `playground-adapter.mjs`의 instlPlaceCd
   기반 매핑)에도, 이 함수는 병합 시 **기존 행의 컬럼값이 non-null이면 무조건
   기존 값을 유지**한다(`supabase-admin.mjs:179-190`) — 재수집이 반복돼도
   한 번 채워진 category_min은 절대 되돌아가지 않는다.
   (참고: `localdata-playground-install-place-mapping.mjs`은 신뢰도가 검증된
   8개 특정 instlPlaceCd 코드에 한해 "대표 승인 하에" 의도적으로 기존 값도
   덮어쓰도록 예외 설계돼 있다 — 그 범위가 오늘 수동 재분류한
   instlPlaceCdNm(학교/주택단지/목욕장업소/학원/어린이집/유치원) 값들과 겹치지
   않음을 코드로 확인해, 오늘 작업한 재분류가 다음 Monthly 배치에서 되돌아갈
   위험이 없음을 검증했다.)

### 4. 원천 소스별 고유 분류 매핑 — 이미 category_min/category_maj/
   category_min_source로 구현돼 있음
todo.md는 "표준 대분류(standard_major_category)/표준 중분류
(standard_middle_category)"라는 새 컬럼명을 예시로 들었지만, 실제로 이
프로젝트에는 정확히 같은 역할을 하는 `category_maj`/`category_min`
컬럼과, 그 값이 어디서 왔는지 추적하는 `category_min_source`(RAW/RULE/
MANUAL) 컬럼이 이미 존재하고 여러 소스(서울시 예약 MAXCLASSNM/MINCLASSNM,
행안부 놀이시설 instlPlaceCd/instlPlaceCdNm 등)에서 각자의 방식으로 이
컬럼들을 채우고 있다(Decision 017, category-rules 엔진, 오늘 작업한 수동
재분류 전부 이 체계를 그대로 재사용). 새 컬럼을 추가로 만들지 않았다 —
같은 목적의 구조가 이미 있는데 새로 만들면 중복이자 혼란이다(제5장 제4조).

### 5. 관리자 화면 필터가 새 표준 중분류를 반영하는지
`get_category_min_options()`는 2026-08-27 수정 이후 `category_rules`가
아니라 실제 `open_spaces.category_min`/`events.category_min` 컬럼에서 직접
DISTINCT를 뽑는다 — 오늘 세션에서 새로 만든 `'식당'`/`'학교'`/`'어린이집'`/
`'유치원'` 등 새 값이 필터 옵션에 즉시 반영된 것으로 이미 실측 확인됐다
(각 항목의 개별 implementation 기록 참고). 추가 조치 불필요.

## 검증
코드 변경 없음(순수 조사/검증) — 검증 대상은 기존 코드이므로
`npx tsc --noEmit`/`npm run test`/`npm run build`는 직전 커밋 상태 그대로
유지된다.

## 특이 사항
todo.md의 "속성 태그(Attribute Tags)" 요구사항(민간/공공 여부 등 소스마다
다른 부가 정보를 별도 필드로 분리)은 이번 조사에서 실제 사용 현황까지는
확인하지 못했다 — 각 어댑터가 이런 속성을 이미 어떤 컬럼(`is_free`,
`facility_type` 등 기존 속성 컬럼)에 매핑하고 있는지는 향후 별도로 조사가
필요할 수 있으나, 이번 요청의 핵심(노출 중분류/뱃지 절대 보호)과는 무관해
이번 검증 범위에 포함하지 않았다.
