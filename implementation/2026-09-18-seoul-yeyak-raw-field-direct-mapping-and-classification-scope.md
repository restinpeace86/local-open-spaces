# [SEOUL_YEYAK 원천 필드 직접 반영 3건 + 실내/야외 분류 배치 대상 축소]

## 구현 대상
사용자 지시(2026-09-18): "seoul_public_reservation 이 원천소스에 PAYATNM: 무료로 되어있는데
이건 가격이 무료로 되어있는거 아니야? 해당 항목들에 대하여서는 가격 무료로 박아줘. 그리고
실내/실외 자동으로 배치로 수행하는 거 관련하여 events에서 원천대분류가 체육시설, 배움/교육,
공공청사/행정인건 제외시켜줘 ... 그리고 USETGTINFO: 성인으로 되어있는거는 연령 ADULT로
자동으로 박아줘. 내가 딱 지정한것만하고 추후에도 확인해보고 추가할 사항 있으면 확장시키도록하자"

## 구현 일시
2026-09-18

## 변경 사항

### 1. PAYATNM=무료 → price_text 자동 반영
`scripts/ingest/adapters/seoul-yeyak-adapter.mjs`: PAYATNM은 유료/무료만 구분하는 구조화된
필드인데, 지금까지 price_text는 DTLCONT(상세 안내문) 텍스트에서 "이용료: 무료"처럼 라벨과
함께 나오는 경우만 `parsePriceFromText`로 잡았다 — PAYATNM이 무료여도 DTLCONT에 그런 문구가
없으면 price_text가 계속 null로 남는 문제가 있었다. `PAYATNM === '무료'`면 구조화된 신호를
우선해 price_text를 곧바로 '무료'로 채우도록 수정(그 외에는 기존 텍스트 파싱 그대로).

기존 적재분(코드 수정만으로는 갱신되지 않음)은 `scripts/migrations/2026-09-18-seoul-yeyak-
payatnm-free-price-backfill.mjs`(신규, `--dry-run` 지원)로 1회성 백필 — 실행 결과
**2,489건** 반영(이미 price_text가 채워져 있던 213건은 건드리지 않음).

### 2. 실내/야외 LLM 분류 배치 대상 축소
파크골프장 대관, 회의실/녹화장소 대관처럼 "나들이/체험" 성격이 아닌 시설 대관·행정 슬롯
데이터는 실내/야외 판단 자체가 무의미해 토큰만 낭비된다. `src/lib/admin/category-min-
groups.ts`의 기존 `EVENTS_GROUPS_STATIC`(어드민 대분류/중분류 정의)에서 사용자가 명시한
3개 대분류(체육시설/배움·교육/공공청사·행정)의 minors만 뽑아 새 export
`EVENTS_EXCLUDED_FACILITY_CLASSIFICATION_MINS`를 추가(계산해서 도출 — 하드코딩 이중 관리
아님). scripts/는 TS를 직접 import하지 않는 기존 관례에 따라 `scripts/ingest/lib/category-
min-groups.mjs`에 동일 목록을 이식(두 파일 동시 수정 필요, 각각 테스트로 드리프트 방지).

`scripts/classify-events-facility-type.mjs`(백필)와 `scripts/ingest/classify-new-events-
facility-type.mjs`(일일 신규분) 양쪽 모두 조회 후 이 목록에 속하는 category_min을 클라이언트
측에서 필터링해 제외한다 — SQL `NOT IN`은 category_min이 NULL인 행까지 결과에서 빠지는
3값 논리 함정이 있어 서버 사이드가 아니라 클라이언트 측에서 필터링했다(NULL/미분류 행은
계속 분류 대상으로 남음). 사용자가 지정하지 않은 '기타' 대분류는 제외 목록에 넣지 않았다
(제3장 제5조 추측 금지).

### 3. USETGTINFO=성인 → target_audience=ADULT 자동 반영
**실측 발견**: target_audience는 어떤 어댑터도 수집 시점에 직접 채우지 않고, 2026-08-27에
한 번 실행된 1회성 마이그레이션(`scripts/migrations/2026-08-27-apply-target-audience-
10tier.mjs`)만 채웠다 — 이후 신규 수집분은 이 마이그레이션이 재실행되지 않는 한 계속
target_audience가 NULL로 남는 구조였다(정기 배치로 연결돼 있지 않음, 이번 지시 범위 밖이라
별도로 고치지 않고 사실만 기록).

`scripts/ingest/adapters/lib/schema-mapper.mjs`의 `buildEventRow`에 `targetAudience`/
`targetAudienceSource` 파라미터를 신규 추가(→ `target_audience`/`target_audience_source`
컬럼) — categoryMin/categoryMinSource와 동일한 "원천 필드 직접 태깅" 규약. SEOUL_YEYAK은
`upsertRowsSafeMerge()`를 쓰므로(컬럼 단위로 기존 값이 있으면 보존) 이미 값이 채워진 행은
재수집으로 덮어써지지 않는다 — NULL이었던 행만 새로 채워진다.

`seoul-yeyak-adapter.mjs`: `item.USETGTINFO === '성인'`(정확히 일치, 다른 대상과 혼재된 값은
제외 — 지시받은 범위만 반영)이면 `targetAudience: 'ADULT', targetAudienceSource: 'RAW_FIELD'`.

기존 적재분 백필: `scripts/migrations/2026-09-18-seoul-yeyak-usetgtinfo-adult-backfill.mjs`
(신규, `--dry-run` 지원) — 실행 결과 **9건** 반영(2026-08-27 마이그레이션이 이미 대부분을
ADULT로 채워둔 상태였고, 그 이후 새로 수집된 9건만 NULL로 남아있었음).

## 실측 장애와 대응
두 백필 스크립트 모두 처음에는 `.order('id').gt('id', lastId)` 커서 페이지네이션을 썼는데,
id(UUID)가 source/조건과 물리적으로 무관한 순서라 뒤 페이지로 갈수록 테이블 전체(28,948건)를
훑어야 해 `statement timeout`이 났다(이 프로젝트에서 SEOUL_YEYAK upsert 시 같은 증상을 이미
한 번 진단한 이력 있음, `scripts/ingest/lib/supabase-admin.mjs` 참고). 커서 없이 "조건에 맞는
첫 PAGE_SIZE건 조회 → 즉시 UPDATE → 재조회"로 바꿨다 — UPDATE가 매번 대상 집합을 줄여주므로
커서 없이도 자연히 수렴한다(실측: 커서 버전 8초+ 타임아웃 → 이 버전 페이지당 1초 내외).

추가로 `--dry-run`의 count 조회에서 `count:'exact'/head:true` 옵션을 필터가 이미 걸린 쿼리
빌더에 `.select()`로 재호출해 넘겼더니 조용히 0건으로 나오는 버그를 발견 — count용/목록용
쿼리를 매번 `client.from('events').select(...)`부터 새로 만들도록 수정해 해결했다.

## 검증
- `npx tsc --noEmit` 통과.
- `npm run test`(전체 164개 파일 1903개 테스트 — PAYATNM/USETGTINFO 신규 케이스, category-min-
  groups exclusion 신규 케이스, schema-mapper targetAudience 신규 케이스 포함) 통과.
- `npm run build` 통과.
- 두 백필 스크립트를 `--dry-run`으로 먼저 실행해 대상 건수(2,489건/9건)를 확인한 뒤 실제
  반영 — 반영 후 로그로 정확히 2,489건/9건이 처리됐음을 확인.

## 특이 사항
- target_audience가 정기적으로 재계산되지 않는 구조적 공백(2026-08-27 이후 신규 SEOUL_YEYAK
  행 중 ADULT 외 다른 태그 후보들도 동일하게 방치되고 있을 가능성)을 발견했으나, 사용자가
  "내가 딱 지정한 것만" 하라고 명시해 이번에는 USETGTINFO=성인 케이스만 좁게 반영했다. 다른
  케이스 확장 여부는 후속 확인 후 별도로 지시받기로 함.
