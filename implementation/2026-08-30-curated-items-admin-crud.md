# [개발 요청] 관리자 화면(/admin/data-grid) 기능 고도화 및 범용 제휴 상품 테이블 개편

## 요구사항
1. `event_tickets`의 제한적 구조에서 벗어난 범용 큐레이션 테이블(`curated_items`) 신설
   — id/title/image_url/booking_url/category/is_active/operation_start_date/
   operation_end_date/created_at.
2. `/admin/data-grid`에 상품명 검색·등록일 필터(기존 유지) + 운영기간 필터(신규) +
   원클릭 노출 토글(즉시 홈 화면 반영) + 등록/수정 모달.

## 구현 일시
2026-08-30

## 사전 조사 — "/admin/data-grid의 기존 상품명 검색/등록일 필터"의 실체

지시서는 "/admin/data-grid에 기존에 잘 작동하던 상품명 키워드 검색창과 등록일 필터가
있으니 유지하라"고 했다. 실제 코드를 확인한 결과, 이 페이지(`AdminDataGridClient`)는
`open_spaces`/`events`/`raw_ingest_data` 3개 탭을 다루는 기존 관리자 그리드이며, 정확히
그 설명대로 상품명(제목/시설명) 키워드 검색 입력창과 등록일(`created_at`) Date Range
필터(단축 버튼 + 달력)를 이미 갖추고 있었다 — 다만 대상 데이터가 "큐레이션 상품"이
아니라 위치 기반 시설/행사 데이터였다. 즉 지시서가 가리키는 "기존 UX 패턴"은 정확히
이 페이지의 것이었고, 이번 신규 요구사항(운영기간 필터/토글/등록·수정 모달)은 그
패턴을 큐레이션 상품에도 적용해 달라는 뜻으로 해석했다.

`AdminDataGridClient`는 표준 중분류(category_min)/타겟 연령 체계와 3개 탭 공유
테이블(1000행+)에 깊게 결합돼 있고, curated_items는 데이터 모양이 근본적으로 다르며
(제휴 상품 vs 위치 기반 시설/행사) create/edit/toggle처럼 그 3개 탭에는 없는 동작까지
필요하다 — 이 공유 테이블 렌더링 로직에 억지로 끼워넣는 대신, `curated_items`를
네 번째 탭으로 추가하되 탭 전환 시 자기완결적인 `CuratedItemsPanel`로 통째로 대체
렌더링하는 방식을 택했다(기존 3개 탭의 필터/테이블 코드는 한 줄도 건드리지 않음).
이 패널 안에서 상품명 검색/등록일 필터는 기존과 동일한 UX(디바운스 검색, 단축 버튼 +
달력 Date Range)를 재구현해 "기존 기능 유지" 요구를 충족했다.

## 1. DB (`scripts/migrations/2026-08-30-create-curated-items-table.sql`)

지시서 컬럼 구성 그대로: `id`/`title`/`image_url`/`booking_url`/`category`/`is_active`/
`operation_start_date`/`operation_end_date`/`created_at`. `deals`/`event_tickets`와
동일하게 RLS 활성화 + 정책 없음(service_role 전용). **`event_tickets` 테이블은
그대로 남겨뒀다** — 다른 소비처가 생길 가능성을 배제할 수 없어 DB 스키마/데이터
삭제는 이번 지시서 범위 밖으로 판단했다(제3장 제3조 데이터 구조 변경을 구현 AI가
임의로 결정하지 않음). 프런트엔드 연결만 새 테이블로 옮겼다.

## 2. API

- **`src/app/api/admin/curated-items/route.ts`**: GET(상품명 검색 `q`, 등록일
  `created_from`/`created_to`, 운영기간 `operation_from`/`operation_to` — 구간 겹침
  판정, 카테고리, 페이지네이션) / POST(신규 등록) / PATCH(id로 부분 수정 — 원클릭
  토글도 `{id, is_active}`만 보내는 동일 PATCH).
- **`src/app/api/curated-items/route.ts`**: 홈 화면 공개 조회 — `is_active=true`이면서
  운영기간이 설정돼 있으면 그 기간 안에 있는 상품만 노출(컬럼 자체가 "예약 가능
  기간"을 표현하므로, 기간이 지났거나 아직 시작 전인 상품을 큐레이션으로 추천하지
  않기 위함). 기존 `/api/event-tickets`를 대체.

## 3. 홈 화면 연동 (`best-pick-slider.tsx`, `home-view.tsx`)

데이터 소스를 `event_tickets`(→ `/api/event-tickets`)에서 `curated_items`(→
`/api/curated-items`)로 교체했다. `EventTicket` 타입을 새 스키마에 맞춘 `CuratedItem`
타입으로 교체하면서 `location_name`이 스키마에서 사라져 카드 하단은 이제 제목 한
줄(2줄 클램프)만 보여준다 — 직전 세션의 "카드 비율 고정" 이슈(옵셔널 필드 유무로
카드 높이가 들쭉날쭉하던 문제)의 원인 자체가 사라져 더 단순해졌다.

## 4. 관리자 UI

- **`src/components/admin/curated-items-panel.tsx`**: 자기완결적 패널 — 상품명
  검색(디바운스)/등록일 Date Range(기존 패턴 재사용)/운영기간 Date Range(신규)/
  테이블(썸네일·상품명·카테고리·운영기간·등록일·노출 토글·수정 버튼)/페이지네이션
  (`Pagination` 컴포넌트 재사용).
- **원클릭 토글**: `ToggleSwitch` — 누르면 즉시 PATCH, 성공 시 목록을 통째로 다시
  불러오지 않고 해당 행만 로컬 갱신(어드민 예약 대시보드 상태 변경과 동일한 관례,
  체감 속도 유지). 홈 화면은 이 값을 그대로 반영한 `GET /api/curated-items`를
  읽으므로 토글 즉시 노출 여부가 바뀐다(실측 검증 완료).
- **`src/components/admin/curated-item-form-modal.tsx`**: 등록/수정 겸용 폼 —
  `initial` 유무로 POST/PATCH 분기. `reservation-request-modal.tsx`와 동일한 바텀시트
  관례(배경 클릭/X로 닫힘, 제출 중 이중 클릭 방지).
- **`src/components/admin/data-grid-client.tsx`**: `AdminTable`에 `'curated_items'`
  추가, 탭바에 노출. 이 탭이 선택되면 기존 3개 탭 전용 필터바/테이블(1000행+ 공유
  로직)을 완전히 건너뛰고 `CuratedItemsPanel`을 그대로 렌더링한다 — 기존 로직은
  분기 밖이라 전혀 영향받지 않는다. `FilterOptions` 타입에 `curated_items: Record<string,
  never>`를 추가해 `currentOptions`/`categoryMinGroups` 계산이 안전하게 통과하도록
  했다(`page.tsx`에서 빈 객체 전달).

## 검증

### 코드 검증
- `npx tsc --noEmit` 통과.
- `npm run test`(69파일 699건 — `curated-items-panel.test.tsx` 5건,
  `data-grid-client.test.tsx` 2건, `home-view.test.tsx` 큐레이션 아이템 스키마 갱신
  신규 포함) 통과.
- `npm run build` 통과 — `/api/admin/curated-items`, `/api/curated-items` 라우트
  정상 포함.

### 실측 검증(로컬 개발 서버, 프로덕션 DB)
- anon 키로 curated_items select/insert 모두 RLS에 차단됨 확인.
- 관리자 API로 실제 상품 등록(POST) → 공개 GET에 즉시 노출 확인 → PATCH로
  `is_active=false` 토글 → 공개 GET에서 즉시 사라짐(홈 화면 반영 확인) → 어드민 GET
  에는 비활성이어도 계속 보임(관리 목적) 확인.
- 운영기간이 이미 지난 상품/아직 시작 안 한 상품 각각 생성 → 공개 GET에서 둘 다
  제외됨, 어드민 API의 운영기간 필터로는 겹치는 기간의 상품만 정상 조회됨 확인.
- `/admin/data-grid` SSR 응답에 새 탭 라벨이 포함됨을 확인. 테스트 데이터는 모두
  정리 삭제했다.

## 특이 사항
- `event_tickets` 테이블/`/api/event-tickets`/`scripts/seed-event-tickets.mjs`는
  삭제하지 않고 그대로 뒀다 — 프런트엔드 연결만 끊겼다.
- 이번 지시서는 관리 "도구"를 만드는 것이 목적이라, curated_items에 샘플 데이터를
  임의로 시딩하지 않았다 — 지금 테이블은 비어 있고, 홈 화면 "베스트 나들이 픽"
  섹션은 가변 노출 원칙에 따라 당분간 숨겨져 있다. 관리자가 새로 만든
  `/admin/data-grid`의 "🏷️ 큐레이션/제휴 상품" 탭에서 [+ 신규 상품 등록]으로 직접
  채워야 한다.
- `AdminDataGridClient`(1000행+)에는 이번 작업 전까지 전용 테스트가 전혀 없었다
  (known gap) — 이번 변경이 기존 3개 탭에 회귀를 일으키지 않았는지 확인할 최소
  스모크 테스트만 추가했고, 그 파일 전체에 대한 포괄적 테스트 보강은 범위 밖이다.
