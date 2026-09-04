# [개선사항10] 관리자 '중복 스팟 그룹핑 및 매핑' 탭 신규 구현

## 구현 대상
`implementation/todo.md` [개선사항10]: open_spaces 원본 데이터 정제를 위한 관리자
전용 탭. 데이터 삭제/마스터 구조 없이, 그룹에 속한 원천 데이터 각 행에 표준 정보를
동일하게 업데이트하는 방식.
1. DB/스키마: `service_categories` 신규 테이블(관리자 CRUD) + `open_spaces` 정제용
   nullable 컬럼(standard_name/service_category_id/blog_url/age_group/feature_tag/
   group_id).
2. 백엔드: 주소 정규화 + 좌표 근접 기반 "중복 의심 그룹" 탐지 API, 그룹 일괄 저장
   (Bulk Save) API + 처리 이력 적재.
3. 관리자 UI: 신규 탭(노출 중분류 관리 / 그룹 리스트 / 그룹 상세·매핑 폼).

## 구현 일시
2026-09-04

## 변경 사항

### 1. DB 스키마 (라이브 적용 완료, SQL로 직접 확인)
- `scripts/migrations/2026-09-04-spot-dedup-grouping-schema.sql`:
  - `service_categories`(parent_category/category_name, unique 조합) 신규 테이블 +
    지시서가 준 4개 대분류·13개 중분류를 시드 데이터로 삽입(라이브 DB에서 13건
    확인).
  - `open_spaces`에 nullable 컬럼 6개 추가(standard_name/service_category_id/
    blog_url/age_group/feature_tag/group_id) — 기존 행에 영향 없음. `age_group`은
    관리자 UI 선택지와 정확히 일치하는 CHECK 제약(미취학/취학/성인/기타/NULL)을 건다.
  - `spot_dedup_groups`(처리 이력 — member_spot_ids/표준 정보/처리 시각) 신규 테이블.
  - RLS는 이 프로젝트 전역 관례(curated_items/spot_curations 등과 동일 — 정책 없이
    enable만, service_role 전용) 그대로 따랐다.
- `scripts/migrations/2026-09-04-find-spot-dedup-candidates-rpc.sql`:
  `find_spot_dedup_candidates` RPC 신규 생성. 실측 확인한 open_spaces 전체 142,113건을
  애플리케이션에서 O(n²)로 좌표 비교하는 것은 명백히 불가능해, PostGIS 내장
  `ST_ClusterDBSCAN` 윈도우 함수로 "좌표 반경 이내 밀집 스팟"을 DB 안에서 한 번에
  계산한다(eps=0.00027도 ≈ 위도 37도 부근 약 30m — 장표의 "반경 20~30m" 요구를
  실용적으로 근사). id 순으로 최대 3000건만 후보로 삼는 점진적 큐 방식이다(아래
  "특이 사항" 참고). 라이브 RPC 실행으로 후보 112건/근접 클러스터 31개를 실제
  확인했다.

### 2. 백엔드 로직
- `src/lib/admin/spot-dedup-grouping.ts`(순수 함수, 신규): RPC가 돌려주는 후보 행에는
  "정규화 주소 일치"와 "좌표 근접 클러스터"라는 서로 다른 두 중복 근거가 함께 실려
  있어, 하나라도 겹치면 같은 그룹으로 합쳐야 한다(예: A-B가 주소로, B-C가 좌표로
  연결되면 A-B-C 전체가 한 그룹) — 이 "연결된 요소" 병합을 유니온-파인드(Union-Find)로
  구현했다. 최종적으로 2건 이상인 그룹만 반환한다.
- `GET /api/admin/spot-dedup/groups`: RPC 호출 → `groupDedupCandidates`로 병합해 반환.
- `POST /api/admin/spot-dedup/apply`: 요구사항 그대로 원본 행을 병합/삭제하지 않고,
  ① `spot_dedup_groups`에 먼저 이력을 적재해 group_id를 발급받은 뒤 ② 그 그룹에
  속한 모든 `open_spaces` 행에 표준 정보(standard_name/service_category_id/
  blog_url/age_group/feature_tag)와 group_id를 동일하게 업데이트한다.
- `GET/POST /api/admin/service-categories`: 노출 중분류 CRUD.

### 3. 관리자 UI (`/admin/data-grid`에 6번째 탭으로 통합)
`src/components/admin/spot-dedup-panel.tsx`(자기완결적 패널, 신규) — 기존
CuratedItemsPanel/SpotCurationsPanel/MomPickPostsPanel과 동일한 관례(제5장 제4조):
- 노출 중분류 관리(생성 폼 + 목록).
- 중복 의심 그룹 리스트("○○ 등 △△ 외 N건" 라벨).
- 그룹 클릭 → 원천 데이터 나란히 비교 표(상호명/원본 중분류/주소) + 매핑 입력 폼
  (표준 시설명/중분류 셀렉트/블로그 URL/연령대/특징) + "저장 및 일괄 적용" 버튼.
- 저장 성공 시 처리된 그룹을 목록에서 즉시 제거(다음 조회부터는 애초에 후보에서도
  빠짐 — service_category_id가 채워졌으므로).
- 관리자 페이지 성능 최적화 관례(2026-08-30 사용자 지시) 그대로, 탭 진입 시 자동
  조회하지 않고 "📥 불러오기"를 눌러야 조회한다.
- `data-grid-client.tsx`의 `AdminTable` 유니온에 `'spot_dedup'` 추가, 기존 3개
  자기완결 패널과 동일한 조기 분기 패턴으로 렌더링.

### 4. 부수 변경 — DB 타입 재생성
새 테이블/RPC를 TypeScript에서 타입 안전하게 쓰려면 `src/types/database.types.ts`
(Supabase 자동 생성 타입)를 최신 스키마로 재생성해야 했다 — `npx supabase gen types
typescript --linked`로 재생성했다(순수 추가분 148줄, 기존 타입 변경 없음 — git diff로
확인).

## 검증
- `find_spot_dedup_candidates` RPC를 라이브 DB에 직접 실행해 후보 112건/근접
  클러스터 31개를 확인(읽기 전용 조회라 실제 데이터 변경 없음).
- 단위 테스트(신규 12개): `spot-dedup-grouping.test.ts`(7개 — 주소/좌표 병합,
  연결된 요소 병합, 빈 값 방어, 1건 제외) + `spot-dedup-panel.test.tsx`(5개 —
  지연 로딩, 중분류 생성, 그룹 목록/상세, 일괄 저장 후 목록 제거).
- `npx tsc --noEmit` 통과, `npm run test`(102개 파일/1079개 테스트, 기존 1067개 +
  신규 12개) 전체 통과, `npm run build` 프로덕션 빌드 통과(신규 라우트
  `/api/admin/service-categories`, `/api/admin/spot-dedup/apply`,
  `/api/admin/spot-dedup/groups` 정상 등록 확인).

## 특이 사항 (정직하게 기록)
- **점진적 처리 큐 설계, 완벽한 전수 그룹핑 아님**: `find_spot_dedup_candidates`는
  전체 142,113건 중 미정제(service_category_id NULL) 행을 id 순으로 최대 3000건만
  후보로 삼는다. 한 번의 호출로 전체 데이터베이스를 완벽하게 그룹핑하는 것이
  아니라, 관리자가 그룹을 하나씩 처리(표준 정보 반영)할 때마다 그 행들이
  service_category_id로 채워져 다음 조회에서 자동으로 제외되는 방식의 "점진적
  검수 큐"로 설계했다 — 실측 확인한 규모(14만 건)에서 결정론적 순서로 안전하게
  동작하도록 하기 위한 의도된 트레이드오프이며, 임의로 축소한 것이 아니라 명시적
  설계 결정임을 기록한다.
- **live API 라우트(route.ts) 자체의 자동 테스트는 작성하지 않았다** — 이 프로젝트의
  기존 관례(curated-items/spot-curations 등 모든 기존 admin route.ts에 테스트
  파일이 없음)를 그대로 따라, RPC/DB 로직은 라이브로 직접 실행해 검증하고 라우트를
  감싸는 UI(SpotDedupPanel)는 fetch를 모킹한 컴포넌트 테스트로 검증했다.
- **"저장 및 일괄 적용"의 실제 라이브 실행은 하지 않았다** — RPC 조회(읽기 전용)는
  라이브로 직접 확인했지만, 실제 그룹 저장은 진짜 운영 데이터를 되돌릴 수 없이
  변경하는 행위라 관리자가 직접 판단해 실행할 몫으로 남겼다(테스트 목적으로 임의
  실행하지 않음).
