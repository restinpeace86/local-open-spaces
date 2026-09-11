# 이벤트픽 블로그 큐레이션 (관리자 → DB → 유저) — Step 113

## 구현 대상
`implementation/todo.md` 개선사항7-2 + 개선사항8: 관리자 Events 탭 상세 팝업에
"블로그 큐레이션" 버튼을 추가해 블로그 후보를 검색·체크·저장하고, 저장된 URL을
유저 이벤트 상세 화면에 "방문 후기 / 추천 블로그" 카드로 조건부 노출한다.

## 구현 일시
2026-09-11

## 설계 원칙 (제5장 제4조 기존 구조 우선)
- open_spaces의 `spot_curations`(Decision 021, 블로그 큐레이션 모달)와 검색/본문
  API(`/api/admin/spot-curations/blog-search`, `/blog-body`)는 이미 구현돼 있고
  스팟 전용 텍스트가 아니라 순수 "쿼리 문자열 → 네이버 블로그 결과" 프록시라 완전히
  재사용했다 — 새 API를 만들지 않았다.
- 다만 `useSpotCurationForm`(뱃지/노출 중분류/영업시간/메뉴까지 포함한 큰 훅)은
  이벤트에 필요 없는 개념이 대부분이라 그대로 재사용하지 않고, "검색 → 체크박스로
  선택 → URL 배열만 저장"이라는 훨씬 단순한 전용 훅(`useEventBlogCurationForm`)을
  새로 만들었다 — 검색/본문 뷰어(`BlogReferenceViewer`)는 그대로 재사용.
- 저장 모델도 스팟과 다르게 뒀다: spot_curations는 blog_url_1/2/3 세 컬럼(정해진
  위치)이지만, todo.md가 이벤트는 "블로그 후보 3개 중 체크"라고 명시해 더 유연한
  `events.curated_blog_urls text[]`(체크된 순서대로 최대 3개) 배열 컬럼으로 뒀다.

## 사전 확인 (제0조)
`project/decision-log.md` Decision 021은 open_spaces 전용 블로그 큐레이션 기능
승인 기록이라 이벤트로 확장하는 것과 충돌하지 않는다(같은 메커니즘을 다른 테이블에
적용하는 것으로, 저장/폐기 원칙 — 본문 텍스트는 저장하지 않고 URL만 저장 — 도
그대로 계승했다).

## 변경 사항
### `scripts/migrations/2026-09-11-events-curated-blog-urls.sql` (적용 완료)
- `events.curated_blog_urls text[] not null default '{}'`, 최대 3개 CHECK 제약.
  프로덕션 DB에 직접 적용 후 컬럼 존재 확인, `npm run gen:types`로 타입 갱신.

### `src/app/api/admin/events/blog-curation/route.ts` (신규)
- `GET ?event_id=` → 현재 저장된 URL 배열. `PUT { event_id, urls }` → 최대 3개로
  정규화(공백/중복 아닌 값만, 3개 초과분은 자름) 후 저장. `createAdminClient()`
  (service_role)로 접근 — 다른 관리자 CRUD 라우트와 동일 패턴.

### `src/lib/admin/use-event-blog-curation-form.ts` (신규)
- 검색(마운트 시 자동, 스마트 쿼리 + 결과 없으면 폴백 쿼리 재검색 — 스팟 훅과 동일
  로직 재사용), 활성 탭 본문 지연 로딩, 기존 저장값 프리필, 체크박스 토글(최대
  3개), 저장(PUT) 기능을 제공한다.

### `src/components/admin/event-blog-curation-modal.tsx` (신규)
- `BlogReferenceViewer`로 검색/본문 뷰어를 그대로 그리고, 그 아래 체크박스 목록
  (검색 결과당 1개, 최대 3개 선택)을 추가했다 — 뱃지/노출 중분류 폼은 없다(이벤트엔
  해당 개념이 없음).

### `src/components/admin/raw-data-modal.tsx`
- `table === 'events'`일 때 "🔍 블로그 큐레이션 (방문 후기/추천 블로그 등록)" 버튼을
  추가(open_spaces 탭의 블로그 큐레이션 버튼과 같은 톤/위치 관례) — 누르면
  `EventBlogCurationModal`이 연다.

### `src/app/api/events/curated-blog-urls/route.ts` (신규, 공개 조회)
- `GET ?event_id=` → `{ urls: string[] }`. NearbyItem/RPC에 필드를 얹지 않고
  스팟픽 상세 카드의 `blogUrls` 조회(`/api/spot-blog-reviews`)와 동일하게 DetailModal이
  이벤트일 때만 별도로 조회한다(제5장 제4조 — 기존에 검증된 패턴 재사용).

### `src/components/map/detail-modal.tsx`
- `curatedBlogUrls` state + 이벤트 전용 조회 effect 추가.
- 이벤트 8단 구조(Step 112)의 6단(설명) 아래·7단(미니맵) 위에 "📝 방문 후기 / 추천
  블로그" 카드 리스트를 조건부 렌더링 — 0건이면 섹션 전체를 숨긴다(요구사항 원문).
  탭하면 새 창(외부 브라우저)으로 연결된다.

## 검증
- `npx tsc --noEmit` 통과.
- `npm run test`: 130 파일 1500건 통과 — 신규 12건(EventBlogCurationModal 4건,
  RawDataModal 트리거 2건, DetailModal 방문후기 섹션 2건, 그 외 사전 정합성 확인용
  기존 테스트 무회귀 확인).
- `npm run build`: Compiled successfully. 신규 라우트
  `/api/admin/events/blog-curation`, `/api/events/curated-blog-urls` 정상 등록 확인.
- 프로덕션 DB에 마이그레이션 직접 적용 + 컬럼 존재 실측 확인.

## 특이 사항
- 개선사항7-1(가격 크롤링 Fallback, `source_url` 기반)은 실측 결과 `events` 테이블에
  `source_url` 컬럼 자체가 존재하지 않고(직접 프로덕션 DB information_schema 조회로
  확인), 어떤 수집 어댑터도 이를 정규 컬럼으로 채우지 않는다 — 원문 URL은 소스마다
  제각각인 `raw_data` JSONB 안에 다른 필드명으로 흩어져 있을 가능성이 높다. 이는
  "코드를 어떻게 짤지"가 아니라 "각 어댑터의 raw_data에서 실제 URL 필드가 무엇인지"
  먼저 조사해야 하는 별도 범위의 작업이라 이번 스텝에서 착수하지 않았다(제3장 제5조
  추측 금지 — 확인되지 않은 채로 만들지 않는다). 다음 스텝에서 어댑터별 조사부터
  진행할 예정이다.
- 개선사항9(수집 라우팅 이분법 정리)·10(FK 양방향 링킹)은 아직 착수 전.
