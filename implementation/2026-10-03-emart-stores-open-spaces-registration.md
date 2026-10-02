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

## 특이 사항
- `name` 필드는 카카오가 실제로 반환한 등록 장소명을 그대로 쓰고(예: "트레이더스
  홀세일 클럽 김포점"), `display_name`은 일관된 브랜드 접두사 형식으로 정리한
  버전이다 — 화면에는 보통 `display_name`을 우선 쓰는 기존 관례(`coalesce(display_
  name, standard_name, name)`)를 따른다.
- 카카오 키워드 검색 결과는 POI 데이터 특성상 시점에 따라 바뀔 수 있다 —
  재실행 시 다른 매칭이 나올 가능성은 낮지만 0은 아니다(경산처럼 브랜드
  전환이 계속 진행 중인 지점이 더 있을 수 있음, MVP 범위에서는 재현 안 되는
  한 추가 조치 없음).
