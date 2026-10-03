# 이마트 지점 open_spaces 등록("대형마트문화센터")

## 구현 대상
사용자 지시(2026-10-03): "현재 이마트 무슨지점 다 나와있는데.. 이거 위치 같은거
있어? 있으면 해당 이마트점에 대하여 open_spaces에 문화시설 대분류에
'대형마트문화센터'로 해당 스팟들 넣어줘."

## 사전 확인(실측) — 위치 데이터 없음
`emart_culture_club_classes`에는 `store_code`/`store_name`(예: "춘천", "트레이더스
킨텍스")/`store_center`만 있고 주소·좌표는 전혀 없다 — GraphQL 스키마 자체에
주소 필드가 없다. 지점명 기반 키워드 장소 검색으로 직접 지오코딩이 필요했다.

## 지오코딩 과정 — 실측으로 전략 확정
1차 시도("이마트 {지점명}점" 단순 템플릿 + 카카오 키워드 검색)는 64개 중 다수가
잘못 매칭됐다(실측 확인):
- 이마트24(편의점) 매칭: 월계, 포항인덕
- 전혀 무관한 매장 매칭: 천안쌍용("LG유플러스 이마트사거리점"), 광산("폴햄키즈
  이마트광주점")
- 검색 실패: 수원(TR)

`category_group_code=MT1`(대형마트) 필터를 추가하자 64개 중 63개가 정확히
해결됐다. 나머지 1개(경산)는 MT1 필터 시 **완전히 다른 도시(대구 반야월)**로
오매칭되는 걸 발견 — 실제로는 "스타필드마켓 경산점"(이마트에서 브랜드 전환된
지점)이 정답인데, 카카오 분류상 MT1이 아니라 "복합쇼핑몰"로 등록돼 있어 필터에
걸렸다. 이 1건만 실측으로 확정한 수동 오버라이드를 둔다(추측이 아니라 직접
확인한 값).

그 외 브랜드 처리:
- 트레이더스(100/160/170/970 등): "이마트"가 아닌 "트레이더스" 자체 브랜드.
- 스타필드/스타필드시티(982/996/998/999): 역시 별도 브랜드.
- 군산(460): "이마트"→"스타필드마켓"으로 브랜드 전환 확인(MT1 검색이 정확히 잡아냄).
- 괄호로 지역을 보조 표기한 지점(천안(쌍용), 포항(인덕), 광산(광주), 하남(경기),
  목동(양천), 묵동(중랑), 풍산(일산), 수원(TR))은 괄호를 제거하고 검색해야
  정확히 매칭됐다(괄호를 그대로 쓰거나 공백 분리하면 오매칭/실패가 잦았다).

## 변경 사항
### 1. 신규 표준중분류 "대형마트문화센터" 등록
유아숲체험원/키즈친화 식당(오케이존)(2026-10-01)과 동일한 패턴:
- `scripts/migrations/2026-10-03-emart-store-category-registration.sql`(적용
  완료): `category_rules`(키워드 "컬처클럽") + `service_categories`(parent_
  category='문화시설') 등록.
- `src/lib/admin/category-min-fallback.ts`: 안전망 목록에 추가(가나다순 위치).
- `src/lib/admin/category-min-groups.ts`: 문화시설 그룹 minors에 추가.
- `src/lib/admin/curation-badges.ts`: GENERIC_CATEGORY_NAMES에 추가(전용 뱃지
  없이 보편적 공통 뱃지만 연결 — 유아숲체험원과 동일 판단).
- `src/lib/spaces/spot-category-groups.ts`: 새 칩을 만들지 않고 기존
  `culture-center`("문화센터/문화의집") 칩에 편입(제5장 제4조 기존 구조 우선).

### 2. `scripts/ingest/emart-culture-club-stores.mjs` + 테스트(신규, 12개)
`emart_culture_club_classes`에서 고유 지점 64개를 뽑아 카카오 키워드 장소
검색(MT1 필터 우선, 실패 시 필터 없이 재시도, 경산만 수동 오버라이드)으로
지오코딩 후 `open_spaces`에 upsert(`external_id: EMART_STORE_{store_code}`,
`category_min: '대형마트문화센터'`, `is_free: true`, `location_precision:
'EXACT'`).

**실측으로 발견/수정한 버그**: 첫 실행 후 실제 저장된 행을 직접 조회해보니
`display_name`이 트레이더스/스타필드 지점에도 무조건 "이마트"를 붙이고 있었다
("이마트 트레이더스킨텍스점" 같은 이상한 이름). `buildDisplayName()`을
`buildSearchQuery()`와 동일한 브랜드 분기로 분리해 수정, 재실행으로 전부
올바른 브랜드명("트레이더스 킨텍스점", "스타필드 안성점", "스타필드마켓
경산점" 등)으로 정정했다.

## 검증
- `npx vitest run emart-culture-club-stores.test.mjs` 12개 통과.
- `npx vitest run spot-category-groups.test.ts` 18개 통과(대분류/중분류
  동기화 교차 검증 — 새 category_min이 양쪽 파일에 일치하게 등록됐는지 확인).
- 실제 API로 전체 64개 지오코딩 1차 검증(성공 64/실패 0) → display_name 버그
  발견/수정 → 재실행 → DB 직접 조회로 브랜드별 이름이 올바른지 재확인.
- `npx tsc --noEmit` / `npm run test`(256개 파일 2,695개) / `npm run build`
  전부 통과.

## 후속 수정 1 — 독립 칩으로 분리(2026-10-03)
사용자 지적: "거기에 기존에 있던 데이터들은? 문화센터/문화의집은? 거기에
데이터 섞이면 내가 작업하기가 어려운데.. 문화센터/문화의집 칩에 편입은
뭔말이야?" — `category_min` 값 자체는 처음부터 별개였지만(DB 레벨 혼동
아님), 소비자 화면 필터 칩('문화센터/문화의집')에 세 번째 minor로 편입한
탓에 유저가 그 칩을 누르면 기존 문화의집/문화원과 이마트 지점이 한 검색
결과에 섞여 나오는 문제가 있었다. `src/lib/spaces/spot-category-groups.ts`
에서 "대형마트문화센터"를 완전히 독립된 신규 칩(`mart-culture-center`)으로
분리했다 — `spot-category-groups.test.ts`의 대분류/중분류 교차 검증(18개)은
그대로 통과(문화시설 대분류 전체 합집합은 변함없음, 칩 배분만 재조정).

## 후속 수정 2 — 노출중분류(service_category_id) 누락 버그(2026-10-03)
사용자 지적: "계속 언급하지만 스팟픽에는 노출중분류가 있는것들만 보여줘야해..
현재 문화의집+문화원 이런 노출중분류는 없을텐데?" — 실제로 DB를 직접
조회해 확인한 결과, **첫 실행 때 넣은 64건 전부 `service_category_id`가
null**이었다(표준중분류만 있고 노출중분류 미지정 상태 — 스팟픽에 실제로는
전혀 노출되지 않는 상태였다). `service_categories`에는 미리 등록해뒀지만
`buildOpenSpaceRow()`가 그 ID를 실제 행에 채우는 걸 빠뜨린 버그였다.

### 수정
- `scripts/ingest/emart-culture-club-stores.mjs`: `fetchServiceCategoryId()`
  추가(`service_categories`에서 `문화시설/대형마트문화센터` 행의 id를 조회),
  `buildOpenSpaceRow()`에 `service_category_id` 파라미터 추가해 매 행에
  채우도록 수정.
- 회귀 테스트 추가(service_category_id가 null/undefined면 안 된다는 전용
  테스트) — 13개로 재구성.
- 재실행으로 기존 64건 전부 백필, DB 직접 조회로 `service_category_id` null
  0건 확인.

(참고: 기존 문화의집/문화원 레거시 데이터도 `service_category_id`가 null인
것으로 확인했다 — 이건 이번에 새로 생긴 문제가 아니라 원래 그랬던 상태이고,
이번 작업 범위(이마트 신규 등록) 밖이라 손대지 않았다.)

### 검증
- `npx vitest run emart-culture-club-stores.test.mjs` 13개 통과.
- 실제 DB 재조회로 64건 전부 `service_category_id` 정상 채워짐 확인(수정
  전/후 대조).
- `npx tsc --noEmit` / `npm run test`(256개 파일 2,696개) / `npm run build`
  전부 통과.

## 특이 사항
- `name` 필드는 카카오가 실제로 반환한 등록 장소명을 그대로 쓰고(예: "트레이더스
  홀세일 클럽 김포점"), `display_name`은 일관된 브랜드 접두사 형식으로 정리한
  버전이다 — 화면에는 보통 `display_name`을 우선 쓰는 기존 관례(`coalesce(display_
  name, standard_name, name)`)를 따른다.
- 카카오 키워드 검색 결과는 POI 데이터 특성상 시점에 따라 바뀔 수 있다 —
  재실행 시 다른 매칭이 나올 가능성은 낮지만 0은 아니다(경산처럼 브랜드
  전환이 계속 진행 중인 지점이 더 있을 수 있음, MVP 범위에서는 재현 안 되는
  한 추가 조치 없음).
