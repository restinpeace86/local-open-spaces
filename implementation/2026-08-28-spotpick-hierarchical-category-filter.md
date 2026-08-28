# [스팟픽(/nearby) 대분류/중분류 계층적 탐색 + 뱃지 제거]

## 요구사항
1. 스팟픽 카드/컴포넌트의 키즈/무료/오늘·주말 뱃지 완전 제거.
2. 대분류→중분류 계층적 탐색 UI 도입(한 번에 모든 중분류가 노출되지 않도록).
3. 중분류 최대 5개 멀티선택 제한 + 6번째 시도 시 토스트 안내.
4. API 연동 검증(선택된 중분류가 정확히 반영되어 스팟 데이터 필터링).
5. 검증 후 커밋/푸시.

## 구현 일시
2026-08-28

## 0. 사전 확인 — 사용자 확인 필요했던 설계 분기점
스팟픽(`/nearby`)은 원래 `category_min`이 아니라 별도의 "목적별 테마"(`theme-spots.ts`,
`classifyThemeSpot`, 7개 테마)를 쓰고 있었고, 이는 이미 여러 화면(`/region` 등)이 공유하며
성능까지 튜닝된(source_type 우선 판별 → 대형 혼합 소스만 키워드 ILIKE) 기존 구조였다.
반면 `category_min`은 `get_nearby_spaces_and_events` RPC가 애초에 조회해서 돌려주지도
않았다(실측 확인). 기존의 잘 튜닝된 구조를 유지한 채 "대분류"를 테마 그룹으로 재해석할지,
아니면 이번 요구사항의 "대분류/중분류" 용어 그대로 `category_min` 기반으로 전면 교체할지
대표 확인을 받았다 — **`category_min` 기반 전면 교체(RPC 수정 포함)**로 확정.

## 1. 백엔드 — `get_nearby_spaces_and_events` RPC에 `category_min` 추가

`scripts/migrations/2026-08-28-nearby-rpc-category-min.sql`: `RETURNS TABLE`에
`category_min text`를 추가했다. 이 함수의 이전 변경 이력이 여러 마이그레이션 파일에
흩어져 있어(`p_item_type` 파라미터, `source_type` 반환, `location_precision='EXACT'`
필터 등) 마이그레이션 파일만으로는 현재 반영 상태를 확신할 수 없었다 — **실측(라이브 RPC
직접 호출)으로 현재 시그니처를 먼저 확인**한 뒤, 그 상태를 전부 보존하면서 `category_min`만
추가했다.

**적용 경로**: 이 세션에서 지금까지 써온 service-role 키(REST API 경유)로는 `CREATE
FUNCTION` 같은 DDL을 실행할 수 없다 — 이번에 이 환경에 **Supabase CLI(`npx supabase`)가
이미 인증되어 있고 프로젝트에 직접 연결 가능**하다는 걸 발견해, 대표 확인 후
`supabase link --project-ref <ref>` → `supabase db query --linked --file <sql>`로 이
마이그레이션 하나만 정확히 적용했다(`supabase/migrations/`의 오래된 보류 마이그레이션들은
건드리지 않음 — `db push`는 사용하지 않았다).

**실측 검증**: 적용 후 RPC를 직접 호출해 201건 중 200건이 `category_min`을 정상 반환함을
확인(나머지 1건은 아직 미분류(NULL) 잔여 데이터로 예상된 결과).

## 2. 공개 화면 전용 대분류 taxonomy

`src/lib/spaces/spot-category-groups.ts`(신규): 4개 대분류(체육시설/문화시설/자연·공원/
키즈·놀이시설). 어드민 `category-min-groups.ts`(6개, 강당/회의실 등 시설 대관·행정류 포함)
를 재사용하지 않고 새로 정의했다 — 일반 유저가 나들이 스팟을 고를 때 의미 없는 항목을
제외해야 하기 때문이다(이벤트픽 홈 화면의 `category-maj-meta.ts`와 동일한 원칙).

## 3. UI 구현

- `src/components/map/spot-category-filter.tsx`(신규): 대분류 탭 + 활성 대분류의 중분류
  칩만 노출(어드민 `HierarchicalCategoryMinFilter`, 홈 화면 `MajorCategoryGrid`와 동일한
  단일 포커스 탭 관례). 중분류는 `MAX_SPOT_CATEGORY_MIN_SELECTION`(5)개까지만 선택
  가능하고, 초과 시도 시 `onLimitExceeded` 콜백만 호출되고 선택은 무시된다.
- `src/components/map/map-explorer.tsx`: 기존 `CategoryFilter`(목적별 테마 단일 선택) +
  `QuickFilters`(키즈/무료/오늘·주말) 전면 제거, `SpotCategoryFilter`로 교체.
  `filteredItems`가 `item.category_min`으로 다중 선택 필터링한다. 6번째 선택 시도 시
  기존 반경 초과 안내와 같은 `Toast` 컴포넌트를 재사용해 2초간 안내 문구를 띄운다(반경
  초과 토스트와 달리 조건이 계속 참인 지속형이 아니라 "시도 순간"의 일회성 안내라
  타이머로 자동 소거).
- `src/components/map/item-list-panel.tsx`: `getParentalBadges` 렌더링 블록 제거 —
  카드에 더 이상 키즈/무료 등 뱃지가 표시되지 않는다.
- **`?filter=` URL 파라미터 초기값 반영 로직 제거**: 제거된 Quick 필터를 초기화하던
  코드라 함께 정리했다(주석에 이미 "현재 실제로 이걸 넘기는 진입점이 없다"고 기록돼
  있었음 — 죽은 코드 정리).
- **완전히 고아가 된 컴포넌트 파일 삭제**: `src/components/map/category-filter.tsx`,
  `src/components/map/quick-filters.tsx` — 전체 `src/`에서 더 이상 어디서도 import되지
  않음을 확인한 뒤 삭제했다(공유 로직 파일 `src/lib/spaces/quick-filters.ts`는
  `region-grid-view.tsx`가 여전히 쓰고 있어 그대로 유지했다 — 이번 작업은 스팟픽
  범위로만 한정).
- `src/lib/spaces/get-nearby.ts`: `NearbyItem.category_min` 주석을 실제 반영 상태에
  맞게 갱신(더 이상 SPACE에서 항상 undefined가 아님).

## 4. API 연동 검증 (요구사항 4)

`map-explorer.tsx`의 `filteredItems`는 클라이언트에서 이미 가져온 반경 내 전체 결과를
`item.category_min` 다중 선택으로 거른다(요청 파라미터 형태가 아니라 RPC가 반환한
category_min을 그대로 소비) — 이번 RPC 수정으로 데이터 자체가 정확히 채워지므로 별도의
API 파라미터 설계는 필요 없었다. 위 1절의 실측(200/201건 category_min 정상 반환)으로
필터링에 필요한 데이터가 누락 없이 공급됨을 확인했다.

## 검증
- `npx tsc --noEmit`: clean.
- `npm run test`: 56개 파일 562건 통과(신규 `spot-category-groups.test.ts` 5건,
  `spot-category-filter.test.tsx` 6건 포함, 기존 `map-explorer.test.tsx`/`nearby/
  page.test.tsx`의 구(舊) 테마 칩·Quick 필터 테스트를 새 동작에 맞게 갱신).
- `npm run build`: 성공, 라우트 변화 없음.
- 로컬 서버 실측: `/nearby` 200 정상 응답, 런타임 에러 없음(클라이언트 전용 지도/위치
  기능이라 실제 상호작용 검증은 컴포넌트 테스트로 대체).

## 특이 사항
- 이번 세션 중 Supabase CLI가 이 환경에 이미 인증돼 있어 프로젝트 DB에 직접 접근 가능함을
  처음 발견했다 — 지금까지 써온 service-role 키(REST API 한정)보다 강력한 경로라 사용
  전 대표 확인을 받았다. 이후 유사한 DDL(RPC/함수 변경)이 필요하면 같은 방식(`supabase
  db query --linked --file <파일>`, `db push`는 사용하지 않음)을 쓸 수 있다.
- `theme-spots.ts`(목적별 테마 분류)와 그 로직을 쓰는 `/region` 화면은 이번 작업과
  무관하게 완전히 그대로 유지했다 — 스팟픽에서만 교체했다.
