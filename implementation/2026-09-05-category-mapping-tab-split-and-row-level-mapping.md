# 노출 중분류 매핑/중복 스팟 검수 탭 분리 + 선택 항목(행 단위) 다건 매핑 기능

## 구현 대상
사용자 지시(질의응답 중 세 번째 답변): "먼저 관리자 화면에서 주요 중분류들 일괄 매핑
실행하겠다.. 다만 현재 중분류 그냥 노출중분류로 전체 선택하는거만 있는데 이 기능도
좋지만 원본 중분류의 데이터들의 다건에 대하여 노출중분류로 다수 이동과 관련된 기능도
있으면 좋겠다.. 그걸 위해서 중분류 매핑과 중복 스팟 검수 탭을 분리해라."

## 구현 일시
2026-09-05

## 사전 확인 — 팔도 기준 확장 검색의 전제 조건 실측
스팟픽 체험휴양마을 등이 0건으로 나오는 이유를 확인하는 과정에서, "노출 중분류 기준
데이터 축소"가 전제하는 `service_category_id` 매핑 현황을 실측했다:
- 전체 open_spaces 142,113건 중 노출 중분류가 매핑된 건: **0건**(어제 만든 관리자
  일괄매핑 도구를 아직 아무도 실행하지 않음).
- 사용자가 이 사실을 확인한 뒤 "먼저 관리자 화면에서 주요 중분류들 일괄 매핑을
  실행하겠다"고 답하면서, 그 작업을 더 수월하게 하려면 기존 "카테고리 전체 일괄"
  방식 외에 "행 단위로 골라서" 매핑하는 기능이 필요하다고 지적했다 — 이번 구현은
  그 도구를 만드는 것이다(팔도 기준 확장 검색 자체는 이후 별도 작업).

## 변경 사항

### 1. 탭 분리
기존 `SpotDedupPanel` 하나에 있던 "🏷️ 노출 중분류 관리"/"🗂️ 노출 중분류 대량 매핑"
섹션을 새 탭으로 분리했다:
- `src/lib/admin/service-category.ts`(신규): 두 탭이 공유하는 `ServiceCategory` 타입 +
  `NULL_CATEGORY_MIN_TOKEN` 상수(제5장 제4조 기존 구조 우선 — 타입 복제 방지).
- `src/components/admin/category-mapping-panel.tsx`(신규): 위 두 섹션 이전 + 아래
  신규 기능(RowPicker) 추가.
- `src/components/admin/spot-dedup-panel.tsx`: 두 섹션과 관련 state/핸들러
  (`bulkCategoryMin` 등, `handleCreateCategory`, `handlePreviewBulk`,
  `handleApplyBulk`)를 제거하고 `categoryMinOptions` prop도 제거했다(더 이상 쓸 곳이
  없어짐). 다만 그룹 병합 모달(`GroupDetailModal`)이 여전히 "노출 중분류" 선택
  드롭다운을 쓰므로, `serviceCategories` 조회 자체는 남기되 눈에 보이는 "관리" UI 없이
  그룹을 처음 불러올 때(`loadGroups`) 조용히 함께 가져온다.
- `src/components/admin/data-grid-client.tsx`/`src/app/admin/data-grid/page.tsx`:
  `AdminTable`에 `'category_mapping'` 추가(일곱 번째 탭, "🗂️ 노출 중분류 매핑"),
  `<CategoryMappingPanel categoryMinOptions={filterOptions.open_spaces.categoryMins} />`로
  렌더링 — 이미 서버에서 조회해둔 categoryMins를 그대로 재사용(추가 조회 없음).

### 2. 선택 항목(행 단위) 다건 매핑 — RowPicker
`category-mapping-panel.tsx`의 `RowPicker` 컴포넌트가 신규 요구사항을 담당한다:
- 원본 중분류를 고르고 [조회]를 누르면 그 중분류에 속한 open_spaces 행을 페이지
  단위(50건)로 보여준다 — 새 목록 API를 만들지 않고 이미 `/admin/data-grid` 페이지가
  쓰는 기존 `GET /api/admin/data-grid?table=open_spaces&category_min=...&page=...`를
  그대로 재사용했다(제5장 제4조 기존 구조 우선).
- 각 행에 체크박스를 두고, 관리자가 원하는 행만 골라(카테고리 전체가 아니라 그중
  일부) 노출 중분류를 선택해 적용한다.
- `src/app/api/admin/open-spaces/bulk-category-mapping/route.ts`: 기존
  "category_min 전체" 경로는 그대로 두고, body에 `ids: string[]`가 오면 그 특정
  id 목록만 `.in('id', ids)`로 UPDATE하는 경로를 추가했다(응답 모양은 동일하게
  `updated_count`).

## 검증
- `npx tsc --noEmit` 통과.
- `npm run test`: 109개 파일 / 1140개 테스트(기존 1135개 + 신규 10개: RowPicker
  3개 + 이전된 대량 매핑 테스트 재배치분 포함, spot-dedup-panel.test.tsx는 이전된
  테스트 제거 후 재검증) 전체 통과.
- `npm run build` 통과, `/api/admin/data-grid` 재사용 확인(새 라우트 생성 없음).

## 특이 사항
- **RowPicker는 "미매핑만" 안전장치를 두지 않았다** — 기존 카테고리 전체 일괄
  매핑(수만 건 단위, 실수 시 되돌리기 어려움)과 달리, 이 기능은 관리자가 화면에서
  이름/주소를 직접 보고 체크박스로 고르는 소규모(페이지당 최대 50건) 작업이라
  위험도가 훨씬 낮다고 판단해 생략했다 — 필요하면 추후 추가할 수 있다.
- **행 목록에는 현재 노출 중분류 매핑 여부를 표시하지 않는다** — 재사용한
  `/api/admin/data-grid` 응답의 select 컬럼 목록에 `service_category_id`가 없어서다
  (이미 많은 테스트가 의존하는 큰 라우트라 이번 작업 범위에서는 건드리지 않았다).
  필요하면 그 라우트의 select 목록에 이 컬럼을 추가하는 별도 작업으로 진행해야 한다.
- **팔도 기준 확장 검색 자체는 이번 작업 범위가 아니다** — 사용자가 먼저 이 도구로
  주요 중분류들을 일괄 매핑한 뒤 진행하기로 했다. 질의응답에서 확인된 설계 방향
  (중분류별 수동 지정, 경기+서울 등 인접 시/도 묶음, 노출 중분류 매핑 완료를 전제)은
  다음 작업을 위해 기록해둔다.
