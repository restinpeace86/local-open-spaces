# 현대백화점/신세계 아카데미 문화센터 화면 미노출 버그 수정

## 구현 대상
사용자 지적(2026-10-08): "지금 문화센터 화면... 이 탭에서 아직 신세계
문화센터꺼는 안보이는데?"

## 구현 일시
2026-10-08

## 근본 원인(실측 확인)
`culture_club_classes`는 좌표를 직접 갖지 않고 `store_code`로
`open_spaces`(브랜드별 `{BRAND}_STORE_{code}` external_id)를 참조해
위치 기준 검색(Branch-First)의 지점 후보를 구한다(`get_culture_club_
store_coordinates` RPC). 실측 확인 결과 **현대백화점/신세계 아카데미
지점은 open_spaces에 전혀 등록돼 있지 않았다**(이마트/롯데마트만
2026-10-03/04에 지오코딩 등록됨) — 두 신규 브랜드(둘 다 2026-10-08
추가)가 추가되면서 이 등록 단계 자체를 빠뜨렸다. 결과적으로 지점
후보 목록에 두 브랜드가 아예 들어갈 수 없어, 어떤 브랜드 필터를
고르든(심지어 "전체"에서도) 위치 기반 조회의 base pool 자체에 두
브랜드의 강좌가 포함되지 못했다.

부수적으로 `src/app/api/culture-club/search/route.ts`의
`VALID_BRANDS = new Set(['emart', 'lottemart'])`도 두 브랜드 추가 때
갱신되지 않아, `brand=hyundai`/`brand=shinsegae` 쿼리 파라미터를 보내도
조용히 걸러져(빈 배열) "필터 없음"으로 오동작하고 있었다(현재 프론트엔드
캐싱 구조상 서버에 brand를 보내지 않아 직접적인 영향은 없었지만, 명백한
불일치라 함께 고쳤다).

## 변경 사항
- `scripts/migrations/2026-10-08-department-store-culture-center-category.sql`
  (적용 완료): 새 `service_categories`/`category_rules` 항목
  `백화점문화센터`(대형마트와 의미가 달라 기존 `대형마트문화센터`를
  재사용하지 않음) 추가. `get_culture_club_store_coordinates()` RPC가
  `category_min in ('대형마트문화센터', '백화점문화센터')`를 함께
  보도록 확장.
- `scripts/ingest/shinsegae-culture-club-stores.mjs`(신규):
  `emart-culture-club-stores.mjs`와 동일한 설계 — 카카오 로컬 키워드
  검색으로 12개 지점 전부 지오코딩. 실측으로 발견한 쿼리 함정 2가지를
  회피: ① 지점명이 이미 "점"으로 끝나면 중복으로 더 붙이지 않음("강남점
  점"으로 검색하면 엉뚱한 "뉴코아아울렛강남점"이 매칭됨), ② 지점명에
  이미 "신세계"가 있으면 "신세계백화점"을 중복으로 앞에 붙이지 않음.
- `scripts/ingest/hyundai-culture-club-stores.mjs`(신규): 동일 설계,
  전용 지점 목록 API가 없어(Decision 029) 이미 수집된
  `culture_club_classes` 데이터에서 실제 등장한 store_code/store_name
  10개를 그대로 사용(emart의 `fetchDistinctStores`와 동일 방식).
- `src/app/api/culture-club/search/route.ts`: `VALID_BRANDS`에
  `hyundai`/`shinsegae` 추가.

## 검증
- `npx tsc --noEmit` / `npm run test`(292개 파일 2,998개, 신규 지오코딩
  쿼리 테스트 9개 포함) / `npm run build` 전부 통과.
- `--dry-run`으로 신세계 12개/현대백화점 10개 전부 지오코딩 성공 확인
  (주소가 각 지점의 실제 위치와 일치함을 육안 확인), 실제 upsert로
  `open_spaces`에 22건 등록.
- 실제 dev 서버 + 실데이터로 `/api/culture-club/search?lat=37.5665&
  lng=126.978&radius_km=20&page_size=5000` 호출 → 브랜드별 건수:
  emart 1,526 / lottemart 1,950 / **hyundai 1,363 / shinsegae 148**
  (수정 전엔 두 브랜드 모두 0건이었음 — 버그 재현 및 수정 확인 완료).

## 특이 사항
- 지오코딩 결과 중 일부(사우스시티/대구신세계/대전신세계)는 카카오
  검색이 department store 건물 자체가 아니라 그 건물에 입점한 개별
  매장(브랜드 부티크)을 1순위로 매칭했다 — 주소/좌표는 같은 건물이라
  정확하지만, `open_spaces.name`(디버그/원본 장소명)에는 그 부티크
  이름이 그대로 남는다. `display_name`(실제 화면 표시용)은 이 필드와
  무관하게 하드코딩된 깔끔한 이름을 쓰므로 사용자에게 노출되는 텍스트에는
  영향이 없다 — 좌표 정확성만 중요한 이번 용도에선 문제가 안 돼 추가
  수동 보정을 하지 않았다.
