# [개선사항2] 관리자 화면 단독/병합 스팟 단일 레코드 노출 + 큐레이션 대상 고정

## 구현 대상
todo.md [개선사항2]: "중복이 없는 '단독 스팟'은 원본 1개가 그대로.. 노출되어야
합니다. 중복이 있는 스팟들은.. 병합을 수행하면 대표 레코드 1개만 남고 나머지
중복 원천 데이터들은 그 아래로 흡수(소속)되어야 합니다. 결과적으로 관리자
검수/큐레이션 화면에서는 단독 스팟이든 병합된 스팟이든 무조건 하나의 깔끔한
레코드로 동일하게 노출되어야 합니다. 다만 어떻게 병합되었는지 원본에 대한
정보는 어떤 방식이든 확인할 수 있어야합니다. 또한, 그룹핑된 데이터중에
예약일자 서비스일자가 있는 데이터들은.. 스팟픽>>마커 클릭>>표준상호명과 정보
그 하위에 예약 가능한 리스트형태로 단계별 진입을 통하여 예약하기까지 들어갈
수 있어야 합니다. 후속 큐레이션(스팟 정보, 블로그 뱃지 등)이 대표 레코드
기준으로 딱 한 번씩만 수행될 수 있도록 데이터 구조가 연결돼야 합니다."

## 구현 일시
2026-09-09

## 배경 조사 및 설계 결정
- [[2026-09-09-group-representative-exposure]](Step 78)는 이미 소비자
  RPC(get_nearby_spaces_and_events/get_spots_by_service_category)가 그룹당
  대표 1건만 반환하도록 구현했었다 — 다만 대표를 **매 호출마다 즉석 계산**했고
  (반경 조회는 "가장 가까운 멤버", 전국 조회는 "가장 먼저 적재된 멤버"), 관리자
  그리드(`/api/admin/data-grid`)는 이 개념 자체를 몰라 그룹 멤버 전원이 그대로
  노출되고 있었다(실측: `group_id`가 있는 592건 전부 각자 별도 행으로 보임).
- **문제 진단**: 반경 조회가 "가장 가까운 멤버"를 대표로 뽑는 방식은 사용자
  위치에 따라 매번 다른 물리적 행을 가리킬 수 있다 — 관리자가 정성껏
  큐레이션(블로그/가격 등)한 행이 하필 그 순간 대표로 뽑히지 않은 다른 멤버면,
  그 큐레이션이 소비자에게 전혀 전달되지 않는 경우가 생길 수 있었다.
  "큐레이션은 대표 레코드 기준 한 번만"이라는 이번 요구사항이 이 잠재적
  불일치를 정면으로 드러냈다.

## 변경 사항
### 1. `open_spaces.is_dedup_representative` 컬럼 신설(핵심 설계 변경)
`scripts/migrations/2026-09-09-dedup-representative-flag.sql` — 그룹의 대표가
어느 물리적 행인지를 **그룹이 확정되는 시점에 딱 한 번 결정해 컬럼에 고정**한다.
이후 모든 조회(소비자 RPC든 관리자 그리드든)는 이 컬럼 하나만 보고 판단하므로
항상 동일한 물리적 행을 가리킨다.
- 기본값 `true`(그룹 미소속 행에는 의미 없음 — `group_id is null`로 항상
  먼저 걸러짐).
- 기존 264개 그룹(592건)은 "가장 먼저 적재된(created_at, id 순) 멤버"를
  대표로 백필했다.
- `get_nearby_spaces_and_events`/`get_spots_by_service_category`: 기존
  `distinct on` 즉석 계산을 제거하고 `and (group_id is null or is_dedup_
  representative = true)` 단순 필터로 교체 — 더 정확하고(대표가 안정적) 더
  빠르다(distinct on 오버헤드 제거).
- 대표 행의 `name`은 원본(raw) 이름 대신 `coalesce(standard_name, name)`으로
  바꿔, "표준상호명과 정보 그 하위에 예약 가능한 리스트"라는 요구사항의
  상위 계층을 만족시킨다(실측: "8월 일반캠핑존 D형(4인용, 자갈형).." 대신
  "하늘구름길캠핑장" 같은 관리자 입력 표준명이 실제로 노출됨을 확인).
  `get_spot_group_members`(하위 예약 옵션 목록)는 각 옵션 고유의 원본 name을
  그대로 유지한다 — 이미 원하는 계층 구조와 정확히 일치.
- `auto_assign_open_spaces_to_existing_groups`: 기존 그룹에 새로 편입되는
  행은 항상 `is_dedup_representative = false`(그 그룹의 대표는 확정 시점에
  이미 고정돼 있어 다시 바뀌지 않음).

### 2. `/api/admin/spot-dedup/apply/route.ts`
그룹을 확정하는 시점에 대표를 직접 판정한다 — 클라이언트가 보낸 `spot_ids`
순서는 화면상 스캔 순서(geohash 등)일 뿐 신뢰할 근거가 없어(제3장 제5조
추측 금지), 서버가 DB에서 실제 `created_at`을 조회해 "가장 먼저 적재된(동률
시 id 오름차순) 멤버"를 대표로 판정한다(실측: 같은 배치로 수집된 캠핑장 행은
created_at이 마이크로초까지 동일한 경우가 흔해 id 2차 기준이 필수였음). 전원
`is_dedup_representative=false`로 세팅한 뒤 대표 1건만 다시 `true`로 뒤집는
2단계 업데이트로 구현 — 이전에 다른 그룹의 대표였다가 재배정되는 경우까지
안전하게 보장한다.

### 3. `/api/admin/data-grid/route.ts`
`OPEN_SPACES_COLUMNS`에 `group_id`/`is_dedup_representative` 추가.
`queryOpenSpaces`(일반 PostgREST 경로)에 `.or('group_id.is.null,is_dedup_
representative.eq.true')` 필터 추가, `queryOpenSpacesViaSourceSubset`(SEOUL_
YEYAK 전용 JS 필터 경로 — 정확히 이번 캠핑장 사례가 지나가는 경로)에도 동일한
조건의 JS 술어를 추가했다. 이 라우트는 관리자 그리드(`/admin/data-grid`)와
노출 중분류 대량 매핑(`category-mapping-panel.tsx`의 RowPicker, 모바일
큐레이션 워크벤치의 큐)이 모두 공유하는 단일 진입점이라, 이 한 곳만 고쳐도
"관리자 검수/큐레이션 화면 전반"에 일관되게 적용된다(제5장 제4조 기존 구조
우선).

### 4. 관리자 화면 UI
- `data-grid-client.tsx`: `group_id`가 있는 open_spaces 행에 "🔗 그룹" 뱃지
  표시(목록 API가 이미 대표만 내려주므로, 이 뱃지가 보이면 곧 그 스팟이
  대표라는 뜻).
- `raw-data-modal.tsx`: "다만 어떻게 병합되었는지 원본에 대한 정보는.. 확인할
  수 있어야" 요구사항 대응 — group_id가 있는 행 상세에 "🔗 병합된 원본 데이터
  보기" 버튼 추가, 신규 `GroupMembersModal`(지역 컴포넌트)이 같은 group_id의
  전체 멤버(대표 포함)를 표/뱃지로 보여준다.
- 신규 `GET /api/admin/spot-dedup/group-members?group_id=` 라우트(위 모달이
  호출).

### 5. 소비자 화면 "예약 가능한 리스트 단계별 진입" — 이미 구현 완료
"스팟픽>>마커 클릭>>표준상호명과 정보 그 하위에 예약 가능한 리스트형태로
단계별 진입을 통하여 예약하기까지"는 [[2026-09-09-group-representative-
exposure]](Step 78)에서 이미 구현했다 — `DetailModal`의 "이 장소의 다른
예약 옵션 보기" 버튼 → `get_spot_group_members` → 기존 `MarkerGroupModal`
재사용. 이번 작업으로 그 대표 행의 표시 이름이 표준명으로 바뀐 것 외에는
추가 변경이 필요하지 않았다.

## 검증
- 실측(마이그레이션 적용 후): 그룹 264개 전부 대표 정확히 1건씩(`representative_
  count = distinct_groups = 264`), 캠핑장 중분류 조회 결과가 3,859건(전체
  매핑) - 592건(그룹 멤버) + 264건(대표) = 3,531건으로 정확히 산술 일치.
- 대표 행의 name이 표준명("하늘구름길캠핑장" 등)으로 정상 치환됨을 실측 확인.
- `data-grid-client.test.tsx`: 신규 2개(group_id 있으면 "🔗 그룹" 뱃지,
  없으면 미노출).
- `raw-data-modal.test.tsx`: 신규 3개(group_id 없으면 버튼 미노출, 있으면
  버튼→모달에서 전체 멤버 목록 표시, events 탭엔 버튼 없음).
- `npx tsc --noEmit` / `npm run test`(1362건, 기존 1357 + 신규 5) /
  `npm run build` 전체 통과.

## 특이 사항
- `auto_assign_open_spaces_to_existing_groups`/`apply` 두 곳 모두 대표 판정
  로직이 서로 다른 시점(그룹 최초 확정 vs 이후 신규 편입)에 실행되지만, 결과
  불변식("그룹당 정확히 하나의 is_dedup_representative=true")은 항상
  유지된다 — auto-assign은 대표 후보 자체를 건드리지 않고 새 멤버만
  `false`로 추가하기 때문.
- 이 컬럼/필터 도입으로 Step 78의 `distinct on` 기반 즉석 계산이 완전히
  대체됐다 — 코드가 더 단순해지고(불필요한 서브쿼리 제거) 조회도 더 빠르다.
