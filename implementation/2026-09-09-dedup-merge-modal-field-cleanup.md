# 중복 스팟 병합 모달 필드 정리 + 중분류 선택 초기화 버그 수정

## 구현 대상
사용자 지시: "중복 스팟 검수 및 매핑에서 중복에 대하여 합치려고 할때 표준
시설명말고 중분류나 블로그 URL(선택)? 이런건 왜있어? 그리고 URL 넣게
하려면 이건... 표준 시설명 들어있는거에 대하여 블로그 검색 api 달아서...
가져온거 중에 넣을 수 있게 해 우리 블로그 큐레이션처럼 동일하게 3개
가져오고... 3개중에 내가 선택한거 url 2개 혹은 3개다일수도 있고..
선택(다중선택가능)한 url들만... 저장되도록.. 연령대는 여기서 왜 필요하지?
특징도 잘 모르겠네... 아니면. .블로그 연령대 특징 같은건 나중에 블로그
큐레이션? 같은곳에서 넣는걸로 하고 여기서는 빼는게 낫지 않을까? 중분류는
이미 중분류 선택한거에 대하여 하는거라 선택안함 상태로 하면 중분류 한게
다시 선택안함으로 변하는거 아니야?"

## 구현 일시
2026-09-09

## 배경 조사
- 실측 확인(grep 전수 조사): `open_spaces.blog_url`/`age_group`/
  `feature_tag`(및 `spot_dedup_groups`의 동일 컬럼)는 `GroupDetailModal`과
  `/api/admin/spot-dedup/apply`에서만 write되고, 앱 어디에서도(소비자 화면,
  다른 관리자 화면 포함) read되지 않는 완전한 사문화 필드였다. 반면 블로그
  큐레이션(`spot_curations.blog_url_1/2/3` + `curation_badges`)은 실제로
  DetailModal에 노출되고, 연령대/특징에 해당하는 개념도 이미 훨씬 세분화된
  뱃지(`kc_age_infant`/`kc_age_preschool`/`kc_age_school`, 각종 특징
  키워드 뱃지)로 커버되고 있어 완전히 중복되는 기능이었다.
- `GroupDetailModal`의 `serviceCategoryId` 상태는 항상 `useState('')`로
  시작했고, `apply` route는 `service_category_id: serviceCategoryId ||
  null`을 그룹 멤버 전원에게 무조건 덮어썼다. [[2026-09-09-category-scoped-
  dedup-and-auto-expiry]]로 "노출 중분류 선택 → 그 안에서만 스캔" 흐름을
  만들면서 이 문제가 실제 사고로 이어질 조건(이미 매핑된 그룹을 열고 중분류
  select를 건드리지 않은 채 저장)이 훨씬 흔해졌다 — 사용자가 정확히 이
  시나리오를 지적했다.

## 변경 사항
### 1. `src/components/admin/spot-dedup-panel.tsx` — `GroupDetailModal`
- 블로그 URL/연령대/특징 입력 필드(및 `blogUrl`/`ageGroup`/`featureTag`
  상태, `AGE_GROUP_OPTIONS` 상수) 전부 제거. 대신 "블로그/연령대/특징
  정보는 병합 후 대표 스팟의 '🔍 블로그로 큐레이션'에서 입력해주세요"라는
  안내 문구로 대체 — 새로 블로그 검색 API 연동 UI를 만드는 대신(사용자가
  제시한 두 대안 중 두 번째, 기존 인프라 재사용) 이미 존재하고 실제로
  쓰이는 블로그 큐레이션 진입점으로 안내한다.
- 신규 `initialServiceCategoryId?: string` prop 추가 — `serviceCategoryId`
  상태의 초깃값으로 쓴다. 넘기지 않으면 기존처럼 빈 값(선택 안 함)에서
  시작한다(하위 호환).

### 2. `src/app/api/admin/spot-dedup/apply/route.ts`
`body.blog_url`/`age_group`/`feature_tag` 파싱 및 `ALLOWED_AGE_GROUPS`
검증을 제거하고, `spot_dedup_groups` insert / `open_spaces` update 양쪽의
갱신 대상을 `standard_name`/`service_category_id`(+`group_id`)로 좁혔다.
DB 컬럼 자체(`open_spaces.blog_url`/`age_group`/`feature_tag` 등)는
데이터 구조 변경(제5장 제3조)이라 이번에는 건드리지 않고, 쓰기 경로만
끊었다.

### 3. 세 진입점 모두 `initialServiceCategoryId` 연결 (버그 수정)
- `spot-dedup-panel.tsx`: `SpotDedupPanel`이 `<GroupDetailModal>`에
  `scanScope`(UNMAPPED_SCOPE가 아닐 때만, 즉 실제 노출 중분류로 스캔
  중일 때만)를 전달 — 그 스캔으로 찾은 그룹은 멤버 전원이 이미 그
  중분류이므로 100% 정확한 사전 값이다.
- `spot-dedup-quick-modal.tsx`(open_spaces 상세의 "🔗 중복 스팟 검토"):
  `spot.service_category_id`(신규로 `raw-data-modal.tsx`에서 전달)를
  넘긴다 — 30m 반경 후보들은 스캔 조건상 같은 중분류라는 보장이 없어
  "최선의 기본값"일 뿐이지만, 빈 값보다는 항상 낫다.
- `mobile-curation-workbench.tsx`("합치기" 배너): 이미 갖고 있던
  `spot.service_category_id`를 그대로 넘긴다.

## 검증
- `spot-dedup-panel.test.tsx`: 신규 3개(중분류 선택 안 하면 불러오기
  비활성화, 중분류 선택 시 쿼리 파라미터 전달, **노출 중분류로 찾은 그룹은
  상세 모달의 중분류가 미리 채워지고 그대로 저장해도 유지됨** — 버그
  재현 시나리오를 그대로 테스트로 고정).
- `spot-dedup-quick-modal.test.tsx`/`mobile-curation-workbench.test.tsx`:
  각각 신규 1개 — 스팟이 이미 노출 중분류로 매핑돼 있으면 병합 모달의
  중분류가 그 값으로 미리 채워짐을 확인.
- `npx tsc --noEmit` / `npm run test`(1357건, 기존 1354 + 신규 3) /
  `npm run build` 전체 통과.

## 특이 사항
- 블로그 URL 다중 선택 UI(사용자가 제시한 첫 번째 대안)는 구현하지 않았다
  — 실측 조사 결과 그 대상 컬럼(`blog_url`) 자체가 이미 앱에서 전혀 읽히지
  않는 사문화 필드라, 이 모달에 새 블로그 검색 UI를 추가해도 결과적으로
  아무 데도 노출되지 않는 죽은 데이터를 만드는 것과 같았다 — 사용자가
  스스로 제시한 두 번째 대안("여기서는 빼자")이 실질적으로 더 나은
  선택이라고 판단해 그쪽으로 구현했다.
