# 관리자 대시보드 모바일 레이아웃/스크롤 긴급 수정 + All-in-One 모바일 큐레이션 워크벤치

## 구현 대상
사용자 지시: "현재 개발 중인 관리자 대시보드에서 [Open Spaces 중분류 조회 리스트]와
새롭게 기획한 [All-in-One 모바일 큐레이션 워크벤치]를 자연스럽게 연결하고, 모바일
환경에서 리스트 영역이 짤리고 스크롤이 안 내려가는 레이아웃 버그를 긴급 수정해줘."
— (1) 모바일 레이아웃/스크롤 버그 긴급 수정, (2) 리스트 클릭 → 워크벤치 진입 흐름,
(3) 워크벤치 내부 4단(중복 검수 배너/중분류·뱃지 폼/블로그 참고·하이라이팅/저장 및
다음 이동) 상세 스펙 그대로.

## 구현 일시
2026-09-05

## 사전 확인(제0조)
`implementation/todo.md`와 `project/decision-log.md`를 확인했다 — 이 작업(모바일
레이아웃 버그 수정, 기존 리스트에 워크벤치 진입점 추가)과 상충하는 홀드/Decision은
없었다. 블로그 검색/1년 룰/하이라이팅/뱃지 폼은 이미 Decision 021(2026-09-05,
관리자용 블로그 큐레이션 모달)로 승인·구현된 로직을 그대로 재사용하는 것이라 별도
Decision이 추가로 필요하지 않다고 판단했다.

## 1. 모바일 레이아웃/스크롤 버그 — 근본 원인과 수정

### 근본 원인(실측 확인)
`src/app/layout.tsx`의 `body`는 `h-dvh flex flex-col overflow-hidden`로, 앱 전체가
"고정 뷰포트 + 내부 스크롤"을 쓰는 의도된 설계다(바텀 탭 고정 등). 문제는 그 아래
`AdminDataGridClient`의 루트 div와 각 탭 콘텐츠 영역이 `flex-1`이면서 `min-h-0`가
빠져 있었던 것 — flex 아이템의 기본 `min-height`는 `auto`라, 내용이 뷰포트보다
길어져도 이 div들이 줄어들지 않고 내용 높이만큼 계속 커진다. 그 초과분을 `body`의
`overflow-hidden`이 그냥 잘라버리니(스크롤 자체가 불가능) "리스트가 거의 안 보이고
스크롤도 안 되는" 증상으로 나타났다 — `body`의 `overflow-hidden`을 걷어내는 것이
아니라(다른 화면들이 이 고정 뷰포트 설계에 의존한다), 그 아래 flex 체인에
`min-h-0`를 추가해 실제로 스크롤 경계가 성립하도록 고쳤다.

### 수정한 파일 (모두 `flex-1 ...` 요소에 `min-h-0` 추가)
- `src/components/admin/data-grid-client.tsx`: 루트 div, 테이블 스크롤 영역 div.
- `src/components/admin/category-mapping-panel.tsx`: 루트 div(Open Spaces 중분류
  조회 리스트가 포함된 바로 그 패널).
- `src/components/admin/spot-curations-panel.tsx`: 루트 div, 콘텐츠 영역 div.
- `src/components/admin/curated-items-panel.tsx`: 루트 div, 콘텐츠 영역 div.
- `src/components/admin/spot-dedup-panel.tsx`: 루트 div.
- `src/components/admin/mom-pick-posts-panel.tsx`: 이 패널만 애초에 자체 스크롤
  컨테이너가 없어(다른 자기완결 패널과 다름) `flex-1 min-h-0 overflow-y-auto`를
  새로 부여했다.

### 터치 관성 스크롤
`src/app/globals.css`에 `.overflow-y-auto/.overflow-auto/.overflow-x-auto`
유틸리티 클래스 전역에 `-webkit-overflow-scrolling: touch`를 적용했다(Tailwind에는
대응 유틸리티가 없어 전역 CSS로 보강 — 다른 화면에도 부작용 없이 스크롤 매끄러움만
더해주는 안전한 확장).

기존 모달들(RawDataModal/BlogCurationModal/GroupDetailModal/CategoryRulesModal 등)은
`max-h-[85vh] overflow-y-auto` 같은 고정 상한 방식이라 이 flex 체인 문제와 무관하게
이미 정상 동작해 수정 대상에서 제외했다(직접 확인).

## 2. 진입 흐름 — 리스트 → 워크벤치

`CategoryMappingPanel`의 `RowPicker`(원본 중분류를 선택해 필터링된 장소 목록을
보여주는 기존 컴포넌트 — 사용자가 말한 "[Open Spaces 중분류 조회 리스트]"가 바로
이것)의 각 행에 이름을 클릭하면 `MobileCurationWorkbench`가 전체화면으로 열리도록
연결했다. 기존 체크박스(대량 매핑용)는 그대로 두고, 이름 텍스트를 별도 버튼으로
감싸 클릭 영역을 분리했다 — 기존 대량 매핑 흐름을 전혀 건드리지 않는다.

`AdminOpenSpaceRowLite` 타입에 `service_category_id`를 추가했다(이미
`/api/admin/data-grid` 응답에 포함돼 있던 값 — 새 조회 없이 타입만 넓혔다).

## 3. All-in-One 모바일 큐레이션 워크벤치 (`mobile-curation-workbench.tsx`, 신규)

전체화면(`fixed inset-0`) 오버레이로 열리며, 내부는 단일 스크롤 컨테이너(위 레이아웃
수정과 동일한 `flex-1 min-h-0 overflow-y-auto` 패턴)에 4단이 세로로 이어진다.

1. **중복 장소 검수 배너**: 마운트 시 `GET /api/admin/spot-dedup/nearby?spot_id=`를
   호출해 반경 내 유사 장소를 보여준다. `[합치기]`는 기존 `SpotDedupPanel`의
   `GroupDetailModal`(그룹 병합 폼 + `/api/admin/spot-dedup/apply` 호출)을 그대로
   재사용한다(현재 스팟 + 유사 스팟 2건짜리 임시 `DedupGroup`을 즉석에서 구성해
   넘김 — 제5장 제4조, 병합 폼을 새로 만들지 않음). `[유지(다른 장소임)]`는 기존
   `spot_dedup_pending_groups` 임시 저장 API를 `status: 'ignored'`로 재사용해
   판단 이력을 남긴다.
2. **중분류 선택 & 뱃지 태깅 폼**: `CurationBadgeForm`(신규 프레젠테이션 컴포넌트,
   아래 참고)으로 렌더링.
3. **블로그 참고 & 형광펜 뷰어**: `BlogReferenceViewer`(신규 프레젠테이션 컴포넌트,
   아래 참고)로 렌더링 — Decision 021에서 이미 구현한 정확도순 검색/1년 룰/하이라이팅
   로직을 그대로 재사용한다.
4. **저장 및 다음 미처리 스팟으로 이동**: 저장(노출 중분류 + 뱃지 + 블로그 URL 3개,
   본문 텍스트는 저장하지 않음) 후, `queue`(RowPicker가 이미 조회해둔 페이지)에서
   현재 스팟 다음 순번부터 `GET /api/admin/spot-curations?spot_id=`로 순회하며
   "큐레이션 뱃지가 비어있는" 첫 스팟을 찾아 그 스팟으로 전환한다. 없으면 완료
   메시지를 보여주고 워크벤치를 닫는다.

### 재사용을 위한 리팩터링(제5장 제4조)
`BlogCurationModal`(기존 작은 팝업)과 이 워크벤치가 완전히 동일한 "블로그 검색 +
뱃지/노출 중분류 폼 + 저장" 로직을 필요로 해, 다음과 같이 뽑아냈다 — 새로 만든 게
아니라 기존 검증된 로직을 재사용한 것이라 `BlogCurationModal`의 렌더링 결과는
바뀌지 않았고 기존 테스트 8개가 리팩터링 후에도 수정 없이 그대로 통과했다.
- `src/lib/admin/use-spot-curation-form.ts`(신규 훅): 상태 + fetch/저장 로직.
- `src/components/admin/blog-reference-viewer.tsx`(신규): 탭/원문 링크/하이라이팅
  뷰어/1년 룰 경고 렌더링.
- `src/components/admin/curation-badge-form.tsx`(신규): 노출 중분류 select + 뱃지
  체크박스 그룹.
- `src/lib/admin/curation-badges.ts`: `CURATION_BADGE_GROUPS` 상수 추가(그룹 순서
  중복 정의 방지).
- `src/components/admin/spot-dedup-panel.tsx`: `GroupDetailModal`을 export로 변경.

### 신규 DB/API
- `scripts/migrations/2026-09-05-find-nearby-open-spaces-rpc.sql`(적용 완료):
  `find_nearby_open_spaces(p_spot_id, p_radius_meters=30, p_limit=5)` — 스팟 하나의
  좌표 기준 `ST_DWithin` 반경 조회(기존 중복 탐지가 쓰는 `PROXIMITY_THRESHOLD_METERS`
  30m와 동일 임계값). 기존 `find_spot_dedup_candidates`는 전체 테이블을 geohash
  순으로 배치 스캔하는 무거운 도구라 "지금 연 스팟 하나"에 즉시 답해야 하는 이
  화면에는 맞지 않아 가벼운 단건 RPC를 새로 추가했다(`location` 컬럼에 이미 GIST
  인덱스가 있어 단건 반경 조회는 가볍다).
- `src/app/api/admin/spot-dedup/nearby/route.ts`(신규): 위 RPC를 감싸는 GET 라우트.

## 검증
- `npx tsc --noEmit` 통과(신규 RPC 반영 위해 `node scripts/gen-types.mjs` 재생성 포함).
- `npm run test`: 113개 파일 / 1185개 테스트(기존 1175 + 신규 10: 모바일 레이아웃
  회귀 방지 1, 워크벤치 진입 연결 2, MobileCurationWorkbench 자체 7) 전체 통과.
- `npm run build` 통과, `/api/admin/spot-dedup/nearby` 라우트 정상 등록.
- 리팩터링 후 기존 `blog-curation-modal.test.tsx`(8개) 무수정 통과로 재사용이
  기존 동작을 깨지 않았음을 확인.

## 특이 사항 / 스코프 판단
- **"미처리 스팟"의 정의**: 사용자 지시에 정확한 기준이 없어(추측 금지, 제3장 제5조)
  DB로 명확히 확인 가능한 유일한 기준 — "해당 스팟의 `spot_curations.curation_badges`가
  비어있거나 레코드 자체가 없음" — 을 채택했다. 대량 "다음 큐" 엔드포인트를 새로
  만들지 않고, 이미 존재하는 단건 조회(`GET ?spot_id=`)를 큐 순서대로 순회하는
  방식을 택했다(큐가 RowPicker 페이지 단위 최대 50건이라 실사용 범위에서 충분히
  가볍다).
- **"반경 내 유사 장소"의 판정 반경**: 스펙에 정확한 수치가 없어, 기존 중복 탐지
  기능(`spot-dedup-grouping.ts`)이 이미 "동일 스팟으로 볼 실제 거리"로 확정해 쓰고
  있는 30m를 그대로 재사용했다(추측 대신 기존 기준 재사용).
- **RowPicker 목록의 이름 클릭 vs 체크박스**: 기존 체크박스(대량 매핑) 동작을
  깨지 않기 위해, 이름을 누르면 워크벤치가 열리고 체크박스는 기존처럼 다건 선택에
  쓰이도록 클릭 영역을 분리했다 — 카드 전체를 누르면 워크벤치가 열리는 방식보다
  두 기능이 공존하기에 더 안전하다고 판단했다.
