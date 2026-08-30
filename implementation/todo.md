## 🚨 자율 실행 및 작업 진행 지침 (Strict Execution Rules)

1. **GitHub `todo.md` 기반 작업 수행**: 본 문서에 명시된 Task 목록과 세부 작업 지시를 최우선 가이드라인으로 삼아 순차적으로 작업을 진행한다.
2. **충돌 발생 시 즉시 스킵 (Skip on Conflict)**:
   - 기존 Spec 문서 (`spec/`), Decision Log (`project/decision-log.md`), 또는 기존 모듈과 구조적/논리적 충돌이 발생하는 경우, 절대로 무리하게 코드를 수정하지 말고 즉시 **[스킵 (보류)]** 처리한다.
3. **스킵 처리 시 필수 기록 사항**:
   - 충돌로 인해 작업을 스킵할 경우, 해당 Task 하단에 **① 상세 스킵 사유**를 명확히 기록한다.
   - 해당 Task를 재개하기 위해 **② 선행되어야 할 작업**(예: 신규 Decision 기록 필요, Spec 문서 선행 수정 필요 등)을 구체적인 가이드로 명시한다.
4. **원격 문서 갱신 반영 및 동기화**:
   - 원격 저장소의 `project/decision-log.md` (Decision 010) 및 `spec/map/spatial-search.md` (2.2 레이어 분리) 변경 내역을 확인하고, 충돌이 해소된 상태에서 안전하게 다음 Task를 진행한다.
5. **결과 업데이트 및 정합성 유지**:
   - 작업 완료 시 관련 테스트/빌드를 검증하고 `todo.md` 내 체크박스(`[x]`) 및 진행 상태를 최신화한다.

---
# To-Do List
- [x] 프로덕션 DB 통계 갱신 완료 (`ANALYZE public.open_spaces;` 실행 완료 - `Success. No rows returned`)
- [x] **크론 스케줄 시간대 한국 시간(KST) 새벽 3시 기준으로 재조정** (2026-08-28 완료)
  - `ingest-daily.yml`: `7 18 * * *` (KST 새벽 03:07, 기존 그대로 — 정각 회피 조건 이미 충족)
  - `ingest-monthly.yml`: `7 17 28-31 * *`(KST 02:07) → `13 18 28-31 * *`(KST 03:13)로 이동해 daily와 동일한 "새벽 3시대 + 비정규 분" 기준으로 통일. "내일이 1일인지" 말일 감지는 UTC 날짜 단위 판정이라 시각 변경의 영향 없음을 확인.
  - 두 파일 모두 `KST 기준 새벽 3시 XX분 (UTC 18:XX)` 형식의 주석 명시 완료.
- [x] **수집 파이프라인 자동 재시도(Retry) 메커니즘 도입** (2026-08-28 완료)
  - 코드 레벨: `scripts/ingest/lib/retry.mjs` 신규 — timeout/network 계열 에러만 판별해 짧은 지수 백오프(2s→6s→18s, 최대 3회)로 재시도하는 `withRetry()` 도입. `supabase-admin.mjs`의 모든 DB 호출(upsert/select/raw 조회)과 `BaseCollectorAdapter.run()`의 `fetch()` 호출에 적용. 인증 실패 등 영구적 에러는 즉시 던져 불필요한 대기 방지. 단위 테스트(`retry.test.mjs`) 추가.
  - 워크플로 레벨: `ingest-daily.yml`/`ingest-monthly.yml`의 메인 배치 스텝에 "1차 실패 시 15분 대기 후 1회 전체 재시도" bash 로직 추가 (upsert가 external_id 기준 멱등 연산이라 재실행 안전).
- [x] **`open_spaces` 테이블 성능 최적화 및 타임아웃 재발 방지 검증** (2026-08-28 완료 — 실측 재검증까지 완료)
  - 근본 원인: 대량 배치(예: playground 82,373건) 직후 플래너 통계가 stale해지면 다음 open_spaces upsert가 statement timeout으로 실패하는 패턴이 반복 확인됨(수동 `ANALYZE`로 그때그때 대응해왔음 — 재발 방지 아님).
  - 조치: `scripts/migrations/2026-08-28-open-spaces-auto-analyze-rpc.sql`로 `public.analyze_open_spaces()` RPC 신설(SECURITY DEFINER, service_role 전용) 후 프로덕션에 적용 완료. `run-daily.mjs`/`run-monthly.mjs` 배치 종료 시점에 자동 호출하도록 `ANALYZE_OPEN_SPACES` 후처리 단계 추가 — 매번 수동 개입 없이 통계가 항상 최신으로 유지됨.
  - 실측 이슈 발견 및 수정: 최초 배포한 RPC를 실행하자 ANALYZE 자체가 PostgREST 기본 statement_timeout에 걸려 실패함을 실측 확인 → 함수에 `SET statement_timeout = '300000'`(5분)을 지정해 해결, 재적용 후 RPC 성공 확인.
  - 최종 실측 재검증: RPC 성공 직후 `SeoulYeyakAdapter`를 실제로 재실행해 이전에 0/1290건(타임아웃 실패)이던 `open_spaces` upsert가 **1290/1290건 정상 적재**됨을 프로덕션에서 직접 확인(`docs/pipeline-log.md` 기록됨). 인덱스(`external_id` UNIQUE, `idx_open_spaces_location` GIST)는 기존에 이미 적정하게 구성돼 있어 추가 조치 불필요, 블로트 징후 없음.
  - 청크 단위 업서트 구조 검토: `supabase-admin.mjs`는 이미 `UPSERT_BATCH_SIZE=500`건 단위로 청크 분할돼 있었음을 확인. 원인은 배치 크기가 아닌 통계 staleness였으므로 청크 크기는 그대로 유지하고 ANALYZE 자동화로 근본 대응(상세: `implementation/2026-08-28-ingest-pipeline-reliability.md`).

- [x] **[open_spaces 세부 중분류 매핑 시뮬레이션 및 자동 매핑 로직 구축]** (2026-08-28 완료)
  - **0단계**: 원본 카테고리(`category`)/이름(`name`) 분포 분석 완료 — NULL 43,445건(31.3%) 중 4개 소스(LOCALDATA_PLAYGROUND/LOCALDATA_AMUSEMENT/SWIMMING_POOL/GG_EVENTS)는 name이 호스트 건물명이라 taxonomy 대상 아님을 발견, 8개 소스로 범위 한정.
  - **1~3단계**: 키워드 규칙 초안 작성 → 시뮬레이션(`scripts/simulations/open-spaces-detailed-category-dryrun.mjs`) → 검토·보완 → 확정. 21종 요청 중 5종은 기존 category_min 재사용(공연장/전시실/체육관/운동장/공원), 14종 신규 추가. 상세: `docs/open-spaces-detailed-category-mapping-dryrun-report.md`.
  - **적용**: `category_rules`에 63건 신규 시드 + 캠핑장에 "글램핑" 키워드 보강. '기타' 폴백은 범용 엔진 오염을 피하기 위해 전용 함수(`scripts/ingest/lib/detailed-category-fallback.mjs`, 8개 대상 source_type 한정)로 구현, run-daily.mjs/run-monthly.mjs에 재발 방지 단계로 연결.
  - **실측 결과**: 신규 분류 6,982건 + 기타 폴백 20,119건, 최종 NULL 16,344건(전량 대상 외 4개 소스). 기타 오염(대상 외 소스) 0건 확인.
  - **검증**: `npx tsc --noEmit`/`npm run test`(51파일 536건)/`npm run build` 통과. 상세: `implementation/2026-08-28-open-spaces-detailed-category-mapping.md`.

- [x] **[스팟픽(/nearby) 중분류 선택 시 지도 마커 미출현 버그 긴급 디버깅]** (2026-08-29 완료)
  - 근본 원인: `get_nearby_spaces_and_events` RPC가 `location::geography` 캐스팅으로
    반경 검색하는데 기존 GIST 인덱스는 `geometry_ops`라 인덱스를 못 쓰고 13만 건 전체를
    Seq Scan(7.4초, 만성 타임아웃) — `EXPLAIN ANALYZE`로 실측 확인. 표현식 GIST 인덱스
    `(location::geography)` 신설로 해결(웜 상태 163~489ms).
  - 부수 발견: 동일 RPC에 3-인자/4-인자 오버로드가 공존해 `p_item_type` 생략 호출
    (`generate-notifications.ts` D-1 알림)이 2026-08-25 이후 `PGRST203`으로 계속 실패해온
    것을 발견, 3-인자 오버로드 제거로 함께 해결.
  - 프론트 갭 수정: 모바일 바텀시트가 `errorMessage`를 표시하지 않아 에러와 "진짜 0건"을
    구분 못 하던 문제를 데스크톱과 동일하게 맞춤(`map-explorer.tsx`).
  - "0건" 테스트 케이스(서울시청 인근 체육시설 5종)는 데이터 희소성에 의한 정상 결과로
    확인(버그 아님).
  - **검증**: `npx tsc --noEmit`/`npm run test`/`npm run build` 통과, 프로덕션 실측 재검증
    완료. 상세: `implementation/2026-08-29-spotpick-nearby-rpc-performance-fix.md`.

- [x] **[스팟픽(/nearby) 겹친 마커(동일 좌표 다건) 클릭 시 목록 표시]** (2026-08-29 완료)
  - 사용자 제보("판교원마을 5단지 504동 앞 — 3건인데 1건만 보임") 조사 결과 데이터 중복이
    아니라 원본(LOCALDATA_PLAYGROUND) 좌표 정밀도 한계로 동일 단지 내 여러 놀이터가
    완전히 같은 좌표를 공유해 마커가 겹치는 현상으로 확인.
  - 대표 확인 하에 "마커 클릭 시 겹친 항목 목록 먼저 표시" 방식으로 확정,
    `kakao-map-view.tsx`에 동일 좌표 그룹핑 + `onSelectGroup` 콜백 추가,
    신규 `marker-group-modal.tsx`로 목록 표시 후 기존 상세 모달로 연결.
  - **검증**: `npx tsc --noEmit`/`npm run test`/`npm run build` 통과. 상세:
    `implementation/2026-08-29-nearby-overlapping-marker-picker.md`.

- [x] **[스팟픽 대분류 순서 조정 + 지도 중심 불일치 버그 + 카테고리 필터 반응 속도 개선]**
  (2026-08-29 완료)
  - 대분류 탭 순서를 키즈/놀이시설 → 자연/공원 → 문화시설 → 체육시설로 변경
    (`spot-category-groups.ts`).
  - "위치는 분당구인데 지도는 서울시청" 버그의 실제 원인: `kakao-map-view.tsx`의 최초
    지도 생성 effect(deps=[])가 비동기 SDK 로드 콜백에서 마운트 당시 값을 클로저로 가둬,
    위치가 그보다 먼저 갱신돼도 지도는 옛 기본값(서울시청)으로 생성되는 race condition.
    `centerRef`/`radiusRef`로 항상 최신 값을 읽도록 수정.
  - "카테고리 필터 선택 시 지도 반응이 느리다" — 실측(Playwright) 결과 API 호출은 없고
    전량 클라이언트 마커 재생성 비용임을 확인, id 기준 diff 방식으로 변경해 유지되는
    항목은 재생성하지 않도록 개선(실측으로 개선 확인).
  - **검증**: `npx tsc --noEmit`/`npm run test`(56파일 562건, 대분류 기본값 변경에 따른
    3개 테스트 수정 포함)/`npm run build` 통과. 상세:
    `implementation/2026-08-29-nearby-category-order-map-center-and-filter-perf.md`.

- [x] **[스팟픽 카테고리 필터 토글 시 지도 클러스터 숫자 누적 버그 긴급 수정]**
  (2026-08-29 완료 — 직전 Step 55의 회귀)
  - 사용자 제보: "필터 껐다 켰다 반복하면 숫자가 계속 누적된다".
  - 원인: Step 55에서 도입한 "마커 id 기준 diff(재사용/추가/제거)" 최적화가
    `MarkerClusterer.removeMarker`로 제거 표시한 마커를 실제로는 완전히 제거하지 못해,
    같은 항목이 필터 재선택마다 중복 등록되는 리크였다. Playwright 실측으로 재현
    (선택→해제 반복 시 클러스터 합계가 62→95→124→153으로 계속 증가) 및 수정 후 재검증
    (동일 반복에서 [10,7,6]↔[62,31,33,16,23,9,12,12,2]로 정확히 왕복, 누적 없음) 완료.
  - 조치: Step 54 시점의 "매번 전체 마커 파괴 후 재생성" 방식으로 되돌림(데이터 정합성 >
    성능). 겹친 마커 클릭 시 목록 표시 기능(Step 54)은 그대로 유지.
  - **검증**: `npx tsc --noEmit`/`npm run test`(56파일 562건)/`npm run build` 통과,
    실측 재현/재검증 완료. 상세:
    `implementation/2026-08-29-nearby-marker-cluster-count-leak-fix.md`.

- [x] **[배치 수집 로그 검증, Admin 상세 모달 링크/이미지 개선, 기본 조회일자 오늘로 설정]**
  (2026-08-29 완료)
  - **배치 로그 검증**: "주말 수집 0건"은 공공데이터 포털 미업데이트가 아니라, GitHub
    Actions 저장소 시크릿(`GG_DATA_API_KEY`/`SEOUL_OPEN_DATA_KEY`/
    `NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` 누락, `PUBLIC_DATA_API_KEY`
    무효)이 원인으로 확인됨. GitHub Actions API로 2026-08-20 이후 전체 스케줄 실행이
    100% failure임을 확인, 로컬 재현은 동일 스크립트가 완전히 성공함을 확인, 대표 승인 하에
    실제 잡 원문 로그(PAT 1회성 사용)로 정확한 에러 메시지 확보. **코드 수정 아님 — 대표의
    GitHub 저장소 시크릿 재설정 필요**(운영 조치).
  - Admin 상세 모달(`raw-data-modal.tsx`): http(s) URL을 새 창 링크로, 이미지 URL
    (thumbnail_url 또는 이미지 확장자)은 실제 미리보기 `<img>`로 렌더링.
  - `/admin/data-grid` 진입 시 기본 조회 조건을 `createdFrom`/`createdTo` 오늘 날짜로
    고정(`data-grid-client.tsx`).
  - **검증**: `npx tsc --noEmit`/`npm run test`(57파일 565건, 신규 `raw-data-modal.test.tsx`
    포함)/`npm run build` 통과. 상세:
    `implementation/2026-08-29-batch-log-verification-admin-modal-and-default-filter.md`.

- [x] **[스팟픽 AI 추천 칩 + 나들이 전용 핵심 중분류 1단 필터 개편]** (2026-08-29 완료)
  - 사용자 확인 결과 하단 탭 이름은 그대로 유지, "AI 추천"은 스팟픽 화면 안의 중분류
    칩으로 신규 추가되어 페이지 이동 없이 바텀시트로 추천 나들이 장소를 보여주는 기능으로
    범위 확정(2회 AskUserQuestion으로 확인).
  - 대분류→중분류 2단 구조를 철회, 실제 DB category_min 분포 실측 기반 핵심 중분류
    6종(공원/문화센터·문화의집/박물관/도서관/키즈카페/놀이터) 1단 칩으로 개편, 체육시설
    등 비나들이성 항목 제외.
  - AI 추천: LLM 미사용, 거리/나들이 편의성/무료 여부 기반 규칙 점수 + 카테고리 라운드로빈
    스마트 정렬(`ai-recommend.ts`)로 즉시 응답. `ai-recommend-sheet.tsx` 신규.
  - **중대 기존 버그 발견 및 수정**: 실측 디버깅 중 `useModalBackClose`(history.pushState
    호출)가 React onClick 경로로 여는 모달(DetailModal 등)을 무력화시키는 버그를 발견
    (`git stash`로 확인한 결과 이번 작업 이전부터 존재 — 홈피드/이벤트픽/캘린더/지역별
    그리드 등 앱 전역 영향 가능성). DetailModal에서 해당 훅 호출 제거로 수정, 개발 서버 +
    프로덕션 빌드 서버 양쪽에서 전체 플로우 재검증 완료.
  - **검증**: `npx tsc --noEmit`/`npm run test`(58파일 571건, 신규 `ai-recommend.test.ts`
    포함)/`npm run build` 통과, Playwright 실측(개발+프로덕션 서버) 전체 플로우 확인. 상세:
    `implementation/2026-08-29-spotpick-ai-recommend-and-core-category-filter.md`.

- [x] **[행안부 어린이놀이시설 설치장소코드 매핑 + 박물관/미술관 분리 + 스팟픽 단일 선택]**
  (2026-08-29 완료)
  - 사용자가 지정한 URL(exfc5/getExfc5)을 실측 호출한 결과 설명한 필터링 로직(설치장소코드)과
    맞지 않는 별개 API(우수어린이놀이시설 183건)임을 확인, 대표 확인 하에 이미 구현된
    pfc3(LOCALDATA_PLAYGROUND) 어댑터를 instlPlaceCd 기준으로 개선하는 것으로 범위 확정.
  - A003/A013/A022/A030/A032/A033/A092/A093 8개 설치장소코드를 실측 기반으로
    category_min에 매핑(RAW), 박물관/미술관은 별개 유지, 자연휴양림/육아종합지원센터/
    유아교육진흥원 신설.
  - **중대 발견**: upsertRowsSafeMerge의 COALESCE 안전 병합이 이미 RULE로 분류된 기존 행에는
    새 매핑을 반영하지 못함(A092/A093 143/49건 전량 0건 반영 확인) — 대표 승인 하에 8개
    코드 한정 명시적 덮어쓰기 백필 스크립트 추가, run-monthly.mjs에 상시 단계로 연결.
  - 스팟픽 핵심 중분류 필터를 복수 선택(최대 5개)에서 단일 선택(라디오 버튼 방식)으로 변경.
  - **실측 검증**: 로컬에서 실제 어댑터 실행(85,298건 수신, 82,381건 적재) + 백필 실행
    (3,841건 UPDATE, 육아종합지원센터 142/유아교육진흥원 48건 포함) 완료, DB 직접 조회로
    데이터 무결성 확인, Playwright로 /nearby 단일 선택 동작 및 category_min 필터-API 연동
    확인.
  - **검증**: `npx tsc --noEmit`/`npm run test`(59파일 585건)/`npm run build` 통과. 상세:
    `implementation/2026-08-29-localdata-playground-install-place-category-and-single-select.md`.

- [x] **[경기도 키즈카페 및 놀이시설 포함 휴게음식점 데이터 수집 어댑터 구축]**
  (2026-08-29 완료)
  - 경기데이터드림 Kidscafe(264건)/Resrestrtkidscafe(2,654건) 실측 확인 — 응답 봉투는
    gg-events-adapter.mjs와 동일, 대부분 좌표 직접 제공(결측 시에만 VWorld 보정).
  - Resrestrtkidscafe는 API 이름과 달리 한식/커피숍/편의점 등 34종 다양한 업종이
    섞여 있음을 실측 확인, 업종 세분화 없이 소스 전체를 '놀이방식당' 신규 category_min
    으로 매핑(Kidscafe는 기존 '키즈카페' 매핑).
  - `GgKidscafeAdapter` 신규 구축(run-monthly.mjs STEPS 연결, `npm run
    ingest:gg-kidscafe` 추가), 신규 소스라 이전 작업에서 발견한 COALESCE 안전 병합
    이슈 없음(최초 upsert라 기존 값 충돌 자체가 없음).
  - **실측 검증**: 로컬 실행(2,918건 수신 → 1,892건 실제 적재: 키즈카페 103/놀이방식당
    1,789), DB 직접 조회로 카테고리 분포 및 데이터 무결성(인코딩 손상 없음) 확인.
  - **검증**: `npx tsc --noEmit`/`npm run test`(60파일 597건)/`npm run build` 통과. 상세:
    `implementation/2026-08-29-gg-kidscafe-adapter.md`.

- [x] **[이벤트픽 UX/UI 개선 — 메인 배너 다이어트/카드 규격 통일/전체보기 바텀시트化]**
  (2026-08-29 완료)
  - 메인 배너(Hero Carousel) 이미지 비율을 `aspect-[4/3]`→`aspect-[2/1]`로 슬림화해
    아래 섹션이 첫 화면에 더 가깝게 보이도록 함.
  - `EventCard`에 `h-full`/타이틀 `min-h` 예약을 추가하고 `ReservationOpenSlider` 래퍼에
    고정 높이(`h-64`)를 줘 "현재 이용 가능"/"예약 가능" 슬라이드 카드 규격을 완전히 통일.
  - **사전 실측**: ongoing 1,972건/reservation-open 918건(중분류 51종) — 스팟픽처럼
    전량 클라이언트 필터링은 과도하다 판단, 기존 오프셋 페이지네이션 구조를 유지한 채
    대분류(`CATEGORY_MAJ_OPTIONS`, 기존 카테고리 그리드와 동일 taxonomy 재사용) 칩 클릭
    시 서버 재조회하는 방식 채택.
  - 신규 `EventBrowseSheet`(스팟픽 `AiRecommendSheet`와 동일 바텀시트 패턴, 배경 클릭/✕만
    으로 닫힘 — `useModalBackClose` 미사용) 하나로 기존 3개 전체보기 페이지
    (`/events/today`, `/events/ongoing`, `/events/reservation-open`)를 완전히 대체,
    해당 page.tsx 3개 삭제(API 라우트는 재사용을 위해 유지).
  - `get-home-feed.ts`의 3개 조회 함수 + 3개 API 라우트에 `categoryMins`/`category_maj`
    파라미터 추가.
  - **실측 검증**: 로컬 개발 서버 기동 + `/api/events/ongoing` 필터 유무 응답 비교로
    category_maj 필터가 실제 DB 기준 정상 동작함을 확인.
  - **검증**: `npx tsc --noEmit`/`npm run test`(60파일 604건, 신규 `event-browse-sheet.
    test.tsx` 포함)/`npm run build` 통과. 상세:
    `implementation/2026-08-29-eventpick-ux-bottomsheet-and-card-diet.md`.

- [x] **[이벤트픽 홈 슬라이드 카테고리 믹스 + 전체보기 마감임박순 정렬 및 '전체' 칩 제거]**
  (2026-08-29 완료)
  - 기존 "공공키즈카페는 앞으로, 자연/과학·교육체험은 뒤로" 하드코딩 우선순위
    (`sortByCategoryMinPriority`)를 일반화된 라운드로빈 교차배치(`interleaveByCategoryMin`)
    로 완전히 대체 — 카테고리 목록을 하드코딩하지 않아 어떤 조합이 와도 자동으로 골고루
    섞인다.
  - `sortByEndDateAscending` 신설, 지역 우선순위/거리 정렬 사이에 끼워 넣어 "지역 우선순위 >
    종료일 임박순 > 거리" 순으로 최종 정렬(Strict Location-First Decision은 그대로 유지).
  - `getTodayEvents`는 Hero 미리보기와 "오늘 전체보기" 바텀시트가 공유하는 함수라 신규
    `diversifyByCategory` 파라미터(기본 false)로 분기 — 홈 Hero 호출부만 `true`로 카테고리
    교차배치를 켬.
  - 전체보기 바텀시트 3개 API(`getTodayEvents`/`getCurrentlyOngoingEventsPage`/
    `getReservationOpenEventsPage`)의 SQL 정렬을 `start_date`→`end_date` 오름차순으로 변경.
  - `EventBrowseSheet`의 무의미한 '전체' 칩 제거(필터 해제는 토글/EmptyState로 계속 가능).
  - **실측 검증**: 로컬 개발 서버 + 실제 DB로 `/api/events/ongoing`(마감임박순 확인)과
    `/api/home/feed`(카테고리 라운드로빈 확인, ONGOING 섹션 20개 서로 다른 카테고리 순환)
    확인.
  - **검증**: `npx tsc --noEmit`/`npm run test`(60파일 611건)/`npm run build` 통과. 상세:
    `implementation/2026-08-29-eventpick-slide-mix-and-deadline-sort.md`.

- [x] **[홈 화면 성능 최적화 — DB 인덱스 점검 및 슬라이드 영역 Lazy Loading]** (2026-08-29 완료)
  - DB 인덱스 실측 점검: `is_completed` 컬럼은 events/open_spaces 어디에도 존재하지 않음을
    확인(지시서 예시가 실제와 다름, 추측으로 만들지 않음). end_date/category_min/
    category_maj는 이미 인덱스 존재. `EXPLAIN ANALYZE`로 "예약 가능" 쿼리 99ms를 재현했으나,
    실험적 인덱스 추가 후 재측정(13ms)·삭제 후 재측정(12ms, 동일)으로 **콜드 캐시 효과였지
    인덱스 문제가 아님**을 실측으로 확인 — 불필요한 인덱스를 추가하지 않기로 결정.
  - 진짜 병목은 SSR(`page.tsx`)이 Hero+현재 이용 가능+예약 가능 3개 쿼리(카테고리 믹스
    연산 포함)를 모두 기다린 뒤에야 첫 응답을 보내던 구조였다.
  - `page.tsx`에서 Hero(`getTodayEvents`)만 SSR로 남기고 나머지 두 SSR 호출 제거.
    `home-view.tsx`의 두 슬라이더 state를 `null`(로드 전) 시작으로 바꿔 마운트 시
    `/api/home/feed`로 클라이언트 지연 페칭(기존 "위치 설정 시에만 재조회" 가드 제거).
  - 신규 `ReservationOpenSliderSkeleton`(w-40 h-64 규격 펄스 플레이스홀더)으로 로드 전
    스켈레톤 노출, 로드 후 0건이면 섹션 숨김 유지.
  - **실측 검증**: 프로덕션 빌드 기동 후 `/` 응답 0.4~0.6초(기존 3쿼리 합산 시 1.3초에서
    개선), 초기 SSR HTML에 스켈레톤이 이미 포함됨을 curl로 확인.
  - **검증**: `npx tsc --noEmit`/`npm run test`(60파일 613건)/`npm run build` 통과. 상세:
    `implementation/2026-08-29-home-performance-lazy-loading.md`.

- [x] **[EventCard 이미지:텍스트 4:6 포션 고정]** (2026-08-29 완료)
  - 지시서 문구("카테고리 뱃지, 제목, 날짜 등이 텍스트 영역에 배치")가 기존 이미지 위
    오버레이 뱃지(중분류/상태/마감임박)를 텍스트 영역으로 옮기라는 뜻인지 모호해
    AskUserQuestion으로 확인 — "이미지 위 오버레이 유지(권장)"로 확정, 두 컨테이너의
    flex-basis만 명시적으로 바꾸는 보수적 변경으로 진행.
  - 이미지 컨테이너 `aspect-[16/9]`→`flex-[4]`, 텍스트 컨테이너 `flex-1`→`flex-[6]
    min-h-0 overflow-hidden`(콘텐츠가 60%를 넘겨도 강제로 4:6 비율 유지, 넘치는 내용은
    클립).
  - **검증**: `npx tsc --noEmit`/`npm run test`(60파일 616건, 신규 4:6 포션 테스트 3건
    포함)/`npm run build` 통과. 상세: `implementation/2026-08-29-eventcard-4-6-portion.md`.

- [x] **[농어촌체험휴양마을 + 농촌교육농장 통합 수집 어댑터 구현]** (2026-08-29 완료,
  소스 B는 인증키 대기로 부분 보류)
  - **소스 A(전국농어촌체험휴양마을, data.go.kr)**: 완전히 구현·라이브 검증 완료.
    실측 확인(전량 1,254건 좌표/명칭/주소 결측 없음), '체험휴양마을' category_min
    RAW 태깅, 어드민 카테고리에 신규 대분류 "농장/체험" 신설. `run-monthly.mjs` 연결.
    **실제 DB 적재 완료**: RAW 1,254건 → open_spaces 1,253건(중복 1쌍 병합).
  - **소스 B(농촌교육농장, 농사로 api.nongsaro.go.kr)**: 참고자료(`reference/
    농촌교육농장`) 확인 결과 data.go.kr과 무관한 별도 인증키(NONGSARO_API_KEY)가
    필요함을 실측(더미 키로 실제 호출해 "인증키 미등록" 응답 확인) — data.go.kr 동일
    등록 사례도 검색으로 못 찾음. AskUserQuestion으로 확인해 "코드만 먼저 완성"으로
    진행 — 어댑터(XML 파싱용 `fast-xml-parser` 신규 의존성)/CLI/테스트 10건 모두
    완성했으나 **실제 인증키가 없어 라이브 호출·DB 적재는 검증하지 못했다**. 사용자가
    농사로에서 키를 발급받아 `NONGSARO_API_KEY`에 설정하면 `--dry-run`으로 먼저 확인 후
    `run-monthly.mjs`에 연결 필요(아직 미연결, 사유 주석 명시).
  - **검증**: `npx tsc --noEmit`/`npm run test`(62파일 640건)/`npm run build` 통과. 상세:
    `implementation/2026-08-29-rural-village-and-education-farm-adapters.md`.

- [x] **[농촌교육농장(RURAL_EDUCATION_FARM) 라이브 검증 및 DB 적재 완료]** (2026-08-29 완료)
  - 사용자가 실제 NONGSARO_API_KEY를 발급받아 `.env.local`에 설정 후 검증 요청.
  - 실제 키로 직접 호출해 응답 구조가 이전에 참고 샘플 코드 기반으로 구현한 파싱 로직과
    정확히 일치함을 확인(코드 수정 없이 그대로 동작) — 총 253건, DB에 250건 적재
    (3건은 원본 주소 자체의 오탈자로 지오코딩 실패, 어댑터가 안전하게 skip).
  - `run-monthly.mjs` STEPS에 RURAL_EDUCATION_FARM 연결(자동 월간 배치 편입 완료),
    어드민 카테고리 "농장/체험" 그룹·필터 안전망 목록에 '교육농장' 추가.
  - **실측 검증**: DB 직접 조회로 250건 전량 좌표/category_min 확인, 202건
    sigungu_name 자동 추출 성공(48건은 원본 주소가 시/도 접두어 없이 시작해 결측 —
    기존 정의된 안전한 동작).
  - **검증**: `npx tsc --noEmit`/`npm run test`(62파일 640건)/`npm run build` 통과. 상세:
    `implementation/2026-08-29-rural-education-farm-live-verification.md`.

- [x] **[농장 및 전체 스팟 상세 바텀시트 네이버 플레이스/검색 딥링크 연동]** (2026-08-29 완료)
  - "SpotDetailSheet"는 존재하지 않고 스팟/이벤트 공용 `DetailModal`이 실제 대상임을
    확인 — 기존 Decision 011 3분류 CTA(공공예약/할인예매/길찾기)는 그대로 두고 네이버
    버튼을 **추가**로 넣었다.
  - 지시서 예시 URL(`m.map.naver.com/search.naver?query=`)은 공식 미확인 구형 URL이라
    쓰지 않고, `buildNaverMapDirectionsUrl`이 이미 세운 원칙대로 네이버 공식 문서
    (guide.ncloud-docs.com/docs/maps-url-scheme)를 다시 WebFetch로 확인 — 검색 전용
    스킴(`nmap://search?query=`)이 공식 문서에 정의돼 있음을 확인하고 채택.
  - `buildNaverPlaceSearchUrl(name, address)` 신규 함수 추가. `DetailModal`에서
    `info_url` 있으면 그대로, 없으면 이 함수로 항상 딥링크 생성(스팟=open_spaces
    한정, 이벤트는 기존 3분류로 이미 커버돼 제외).
  - **검증**: `npx tsc --noEmit`/`npm run test`(62파일 647건, 신규 테스트 7건)/
    `npm run build` 통과. 상세: `implementation/2026-08-29-spot-detail-naver-deep-link.md`.

- [x] **[스팟 자체 간편 예약/신청 시스템 MVP 구축]** (2026-08-29 완료)
  - 직전 작업의 네이버 검색 딥링크 폴백(`buildNaverPlaceSearchUrl`)을 완전히 제거하고,
    `DetailModal`을 info_url 있으면 [🌐 공식 홈페이지 바로가기], 없으면 [📝 간편
    예약/신청하기](자체 폼 모달 오픈)로 분기하도록 교체.
  - `reservations` 테이블 신설(spot_id→open_spaces FK, contact/visit_date/headcount/
    status/created_at) — RLS 켜고 정책 없음(service_role만 접근 가능, PII 보호).
    `npm run gen:types`로 타입 갱신.
  - `ReservationRequestModal`(날짜/인원수/연락처 3항목 MVP 폼) + `POST /api/reservations`
    (서버 검증 4종 + service-role insert) 신규 구현.
  - **실측 검증**: 실제 스팟에 대해 curl로 정상 접수 확인(테스트 데이터 정리 삭제),
    검증 실패 4종(연락처 누락/날짜 오류/인원수 0/존재하지 않는 spot_id) 확인, **anon 키로
    직접 SELECT/INSERT 시도 시 RLS가 완전히 차단함을 실측 확인**(개인정보 보호 핵심 검증).
  - **검증**: `npx tsc --noEmit`/`npm run test`(63파일 649건)/`npm run build` 통과. 상세:
    `implementation/2026-08-29-spot-self-service-reservation-mvp.md`.

- [x] **[관리자 예약 관리 어드민 대시보드 구축]** (2026-08-29 완료)
  - `/api/reservations`에 GET(서비스 롤 키, open_spaces 이름/주소 PostgREST 임베딩 조인,
    페이지네이션)과 PATCH(id+status → CONFIRMED/CANCELLED만 허용) 추가.
  - `/admin/reservations` 페이지 신설 — 스팟명/주소/방문 예정일/인원/연락처/접수 시각/
    상태 뱃지/확정·취소 액션 버튼(PENDING 건에만 노출), 기존 `Pagination` 컴포넌트 재사용.
    /admin/data-grid와 동일하게 별도 로그인 인증 없음(기존 관례, 이번 범위 밖).
  - **실측 검증 중 버그 발견 및 수정**: 존재하지 않는 id로 PATCH 시 `.single()`의 원본
    PostgREST 에러 문구가 그대로 노출되던 것을 발견 — PGRST116(no rows) 분기로 사람이
    이해할 수 있는 404 메시지로 교체.
  - **검증**: `npx tsc --noEmit`/`npm run test`(64파일 654건)/`npm run build` 통과, 로컬
    개발 서버+실제 DB로 GET 조인/PATCH 상태 전환/에러 처리 전부 실측 확인(테스트 데이터
    정리 삭제). 상세: `implementation/2026-08-29-admin-reservations-dashboard.md`.

- [x] **[예약 신청 폼 UI/UX 고도화 (ReservationRequestModal)]** (2026-08-29 완료)
  - 인원수를 문자열 state로 바꿔 0/빈 값을 실제로 입력해볼 수 있게 하고, 제출 시점에
    필드별 구체적 안내 메시지(날짜/인원수/연락처 각각 다른 문구)로 검증.
  - 연락처 입력창 아래 상시 힌트 텍스트 추가(placeholder 힌트 + label 밖 별도 안내문 —
    label 안에 넣으면 접근성 트리상 라벨 이름이 오염되는 것을 실측으로 발견해 밖으로 뺌).
  - `handleSubmit` 맨 앞에 `if (isSubmitting) return` 이중 방어선 추가(버튼 disabled와
    별개로 중복 제출 완벽 차단).
  - 상단 안내 문구 추가, `window.alert()` + 즉시 닫힘을 제거하고 모달 내 완료 화면
    (✅ + 메시지)을 보여준 뒤 1.8초 후 자동으로 부드럽게 닫히도록 교체.
  - **테스트 안정성 이슈 발견 및 수정**: 자동 닫힘 검증에 `vi.useFakeTimers()`를 쓰면
    단일 파일 실행은 통과하지만 전체 스위트 실행 시 간헐적으로 실패하는 것을 실측
    확인 — 실제 시간 기반 `waitFor`로 교체해 안정화(2회 연속 전체 스위트 실행으로
    재현 없음 확인).
  - **검증**: `npx tsc --noEmit`/`npm run test`(64파일 662건)/`npm run build` 통과. 상세:
    `implementation/2026-08-29-reservation-form-ux-polish.md`.

- [x] **[어드민 예약 관리 화면 상단 요약 카운트 및 대기(PENDING) 뱃지 강조 폴리싱]**
  (2026-08-29 완료)
  - `/api/reservations` GET에 상태별 카운트(head:true 카운트 전용 쿼리 3개, 병렬 실행)를
    추가해 `statusCounts: {PENDING, CONFIRMED, CANCELLED}` 응답 — 페이지네이션과 무관하게
    테이블 전체 기준.
  - 어드민 페이지 상단에 4개 요약 카드(전체/🔴 신규 대기/확정 완료/취소) 신설, 신규
    대기만 진한 주황 배경으로 강조. 상태 변경 시 목록 재조회 없이 카드 숫자만 로컬 갱신.
  - 테이블 PENDING 행에 강조 배경(`bg-amber-50`) + 왼쪽 강조선(`border-l-4
    border-amber-400`) 적용, 상태 뱃지도 PENDING만 채워진 진한 색으로 변경.
  - **실측 검증**: 실제 스팟에 테스트 신청 생성 → GET 응답에 statusCounts가 정상
    포함됨을 확인(테스트 데이터 정리 삭제).
  - **검증**: `npx tsc --noEmit`/`npm run test`(64파일 668건)/`npm run build` 통과. 상세:
    `implementation/2026-08-29-admin-reservations-summary-badges.md`.

- [x] **[제휴 특가(Deals) 데이터베이스 스키마, 수집 어댑터 및 이벤트픽 연동 MVP]**
  (2026-08-29 완료)
  - `deals` 테이블 신설(정가/할인가/할인율/이미지/제휴 링크/노출 여부) — reservations와
    동일하게 RLS 활성화 + 정책 없음(service_role 전용), `affiliate_url unique`로 수집
    어댑터 upsert 충돌 키 확보.
  - `GET /api/deals`(활성 특가 최신순, 페이지네이션) 신설.
  - `scripts/ingest/adapters/deals-collector.mjs`: 실제 제휴 API(쿠팡파트너스/네이버쇼핑
    등)가 아직 확정/발급되지 않아 지시서 표현대로 "뼈대"만 구현 — `fetchDealsFromAffiliateApi()`는
    명시적 미구현 에러, `transformDealItem`/`upsertDeals`/`collectDeals`는 실제 동작하며
    단위 테스트로 검증. `BaseCollectorAdapter`는 상속하지 않음(그 인프라가 위치 기반
    소스 전용 `external_id` dedup에 결합돼 있어 억지 재사용 시 기존 15종+ 어댑터 공유
    인프라를 넓게 건드리는 위험).
  - 기존에 "실제 데이터 없음"을 이유로 `enabled: false`였던 홈 서브탭 "🏷️ 특가·핫딜"을
    `enabled: true`로 전환(전제였던 데이터 부재가 이번 작업으로 해소됨) — `DealCard`/
    `DealDetailModal`(제휴 마케팅 필수 안내 문구 + 새 창 구매 버튼) 신설, `home-view.tsx`에
    지연 페칭 훅과 렌더 분기 연결.
  - **실측 검증**: anon 키로 deals select/insert 모두 RLS에 차단됨, service-role로 만든
    테스트 특가가 실행 중인 로컬 서버의 `GET /api/deals` 응답에 정상 반영됨을 확인(정리
    삭제 완료).
  - **검증**: `npx tsc --noEmit`/`npm run test`(65파일 679건)/`npm run build` 통과. 상세:
    `implementation/2026-08-29-deals-affiliate-system-mvp.md`.

- [x] **[이벤트픽 & 티켓 할인 정보 MVP: 이벤트/티켓 데이터베이스, API 및 UI 구축]**
  (2026-08-29 완료)
  - **사전 확인에서 테이블명 충돌 발견**: 지시서가 `events` 테이블 생성을 요구했으나,
    이미 위치/일정 기반으로 20개 이상 수집 어댑터가 채우는 핵심 `events` 테이블이
    존재하고(홈 "이벤트픽" 탭 전체가 이걸로 동작 중) 스키마도 전혀 다름 —
    `AskUserQuestion`으로 확인해 사용자가 "새 테이블(`event_tickets`)로 분리"를 선택,
    기존 events 테이블은 전혀 건드리지 않음.
  - `event_tickets` 테이블 신설(카테고리/행사기간/장소/정가/할인가/할인율/예매링크/
    노출여부) — deals와 동일한 RLS(service_role 전용) 패턴.
  - `GET /api/event-tickets`(활성 이벤트 최신순, 페이지네이션) 신설.
  - `scripts/seed-event-tickets.mjs`: 지시서가 명시적으로 요구한 샘플 데이터(가을 단풍
    축제/키즈 체험/워터파크/동물원/농촌 체험 5건) 초기화, 멱등 처리(이미 데이터 있으면
    스킵).
  - **실행 중 버그 발견 및 수정**: `import.meta.url`을 `process.argv[1]`과 단순 문자열
    결합으로 비교하는 "직접 실행 가드"가 Windows에서 항상 false가 되어 스크립트를
    실행해도 아무 것도 삽입되지 않는 것을 실측 발견 — 기존 `run-monthly.mjs` 등이 쓰던
    `pathToFileURL(process.argv[1]).href` 비교로 교체해 해결.
  - 홈 탭(기본 탭)에 상시 노출되는 "🎫 할인 티켓·이벤트" 그리드 섹션 신설(Hero 아래,
    "현재 이용 가능" 위) — `EventTicketCard`/`EventTicketDetailModal`(설명/기간/장소/
    가격 + 새 창 예매 버튼, deals와 달리 제휴 문구는 지시서에 없어 추가하지 않음).
  - **실측 검증**: anon 키로 select/insert 모두 RLS에 차단됨, 시드 스크립트 재실행
    멱등 확인, 실행 중인 로컬 서버의 `GET /api/event-tickets`가 시드된 5건을 정상
    반환함을 확인.
  - **검증**: `npx tsc --noEmit`/`npm run test`(66파일 685건)/`npm run build` 통과. 상세:
    `implementation/2026-08-29-event-tickets-mvp.md`.

- [x] **[홈 화면 할인 티켓(event_tickets) 섹션 UI 개편]** (2026-08-30 완료)
  - 섹션 헤더를 "🔥 이번 주말 놓치면 후회할 특가" + "전체보기 ›" 버튼으로 교체.
  - 홈 섹션은 최신 4건만 `EventTicketBannerCard`(신설, h-[320px]/다크 그라데이션/좌상단
    할인율 뱃지/하단 장소·상품명·가격·예매 버튼의 Hero 스타일 배너)로 노출, 클릭 시
    기존과 동일하게 상세 모달이 열린다. 기존 그리드형 `EventTicketCard`는 그대로 두고
    "전체보기 ›" 클릭 시 뜨는 새 바텀시트(`EventTicketBrowseSheet`, 기존
    `EventBrowseSheet`와 동일한 관례)의 전체 목록에서 재사용한다.
  - **검증**: `npx tsc --noEmit`/`npm run test`(67파일 691건)/`npm run build` 통과. 상세:
    `implementation/2026-08-30-event-tickets-home-section-redesign.md`.

- [x] **[핵심 events 테이블 수집 파이프라인 장애 점검]** (2026-08-30 완료)
  - **근본 원인 확정**: 조사 도중 원격에 새로 올라온 최신 실제 실행 기록(2026-08-30
    05:52~06:27 UTC 4회 연속, github-actions[bot] 커밋)이 Daily 배치 전 단계에서
    완전히 동일한 메시지("Node.js detected but native WebSocket not found")로 실패한
    것을 발견 — `npm view @supabase/supabase-js@2.112.2 engines`로 직접 조회해
    `{node: '>=22.0.0'}`을 확인, 반면 세 워크플로(daily/monthly/e2e) 전부
    `node-version: 20`으로 고정돼 있었다. Node 22 미만은 native WebSocket이 없어
    Supabase 클라이언트 생성 자체가 크래시하는 것으로 확정 — 세 워크플로 모두
    `node-version: 22`로 상향해 근본 수정했다.
  - 더 이전 실행(2026-08-29 01:59 UTC, github-actions[bot] 최초 커밋)은 API 키 누락/
    Supabase 클라이언트 생성 실패 등 표면 에러가 제각각이었는데, 코드 조사 결과
    "필수 환경변수가 프로세스에 주입되지 않음"이라는 별개의 과거 이슈로 추정되나
    (`gh` CLI 미설치로 Actions 실행 환경 직접 조회 불가) 완전히 규명하지는 못함 —
    사용자가 GitHub Secrets 등록 상태를 한 번 확인해두길 권장.
  - `node scripts/ingest/run-daily.mjs --dry-run`을 `.env.local`(로컬 Node v24, 실제
    키)로 실행 → 11/11개 단계 전부 성공 — 어댑터 로직 자체는 건강함을 확인(단, 로컬
    Node가 22 이상이라 위 CI 전용 회귀는 로컬에서 애초에 재현되지 않음).
  - **방어적 재발 방지 조치**: `scripts/ingest/lib/env-precheck.mjs` 신설,
    `run-daily.mjs`/`run-monthly.mjs`에 배치 시작 시점 필수 환경변수 사전 검사 추가
    (누락 시 카스케이드 에러 대신 한 줄로 즉시 원인 노출) — 과거 이슈 재발 시 진단
    속도 향상 목적.
  - **부수 발견 및 수정**: 이 조사 과정에서 `RURAL_EDUCATION_FARM`(농사로 API)이
    요구하는 `NONGSARO_API_KEY`가 `.github/workflows/ingest-monthly.yml`의 `env:`
    블록에 아예 빠져 있는 실제 버그를 발견 — 추가로 수정.
  - **후속 실측(사용자가 Node 22 적용 후 workflow_dispatch로 수동 재실행)**: WebSocket
    크래시는 완전히 사라지고 `SEOUL_YEYAK`/`seoul_public_culture` 및 후처리 7개
    단계가 전부 정상 성공(근본 원인 진단이 정확했음을 확인) — 다만 `GG_CULTURE_EVENTS`/
    `TOUR_API_FESTIVAL` 2개 소스는 여전히 `fetch failed`로 실패해 완전 해결은 아님.
    두 소스 다 국가/광역 단위 포털(data.go.kr/gg.go.kr)을 쓴다는 공통점이 있어 IP
    제한 가설을 세웠으나 확정하지 못함 — `scripts/ingest/lib/fetch-with-cause.mjs`
    신설해 Node 네이티브 fetch가 숨기던 `err.cause`(실제 네트워크 실패 원인)를 다음
    실패부터 메시지에 노출하도록 관측성을 개선(재시도 로직에는 영향 없음, 단위
    테스트로 확인). 남은 원인 규명은 다음 실행 로그를 봐야 한다.
  - **검증**: `npx tsc --noEmit`/`npm run test`(68파일 695건 — env-precheck 4건,
    fetch-with-cause 4건 신규)/`npm run build` 통과. `GG_DATA_API_KEY`를 `.env.local`에서
    일시 제거해 사전 검사가 실제로 배치를 중단시키는지 실측 확인 후 원상 복구. 상세:
    `implementation/2026-08-30-events-pipeline-outage-investigation.md`.

- [x] **[UI/UX 개발 요청] 홈 화면 큐레이션 섹션 추가 및 상단 탭(네비게이션) 정리**
  (2026-08-30 완료)
  - **사전 확인에서 직전 작업과의 중복 발견**: 새로 요청된 "베스트 나들이 픽" 가로
    슬라이드 섹션이 바로 전 작업의 "🔥 이번 주말 놓치면 후회할 특가" 배너 섹션과
    목적(event_tickets 큐레이션)이 거의 동일 — `AskUserQuestion`으로 확인해 "새
    섹션이 기존 배너를 대체"로 확정, 구 배너 섹션(그리드/디테일모달/전체보기
    바텀시트) 전체를 걷어내고 교체.
  - 상단 [홈/특가·핫딜/무료·공공] 서브탭(`HomeSubTabs`) 완전 삭제 — 탭이 유일한
    진입 경로였던 `deals` 그리드/무료·공공 피드도 함께 제거(`DealCard`/
    `DealDetailModal`/`EventTicketCard` 등 이제 미사용인 컴포넌트 파일 7개 삭제,
    전부 다른 소비처 없음을 grep으로 확인 후 진행). `deals`/`event_tickets` 테이블과
    `/api/deals`/`/api/home/free-feed` API는 명시적 삭제 요청이 없어 그대로 둠(프런트
    연결만 제거).
  - `best-pick-slider.tsx` 신설 — "✅ 현재 이용 가능"과 "📋 예약 가능" 사이에 배치,
    가로 스크롤 컴팩트 카드(썸네일+타이틀+장소명), 할인율 뱃지 등 세일즈성 장식 없이
    신뢰감 있는 큐레이션 톤("에디터가 직접 검증한 나들이 코스만 엄선했어요"). 카드
    클릭 시 상세 모달 없이 곧바로 `booking_url`을 `target="_blank"`로 새 창 오픈.
  - **검증**: `npx tsc --noEmit`/`npm run test`(68파일 691건 — 서브탭 삭제/베스트 픽
    마운트 렌더링·직접 링크 클릭·0건 숨김·섹션 위치 순서 신규 테스트)/`npm run build`
    통과. 로컬 서버 SSR 응답으로 신규 섹션 타이틀 노출 및 구 탭 라벨 완전 제거 확인.
    상세: `implementation/2026-08-30-home-curation-and-tab-removal.md`.

- [x] **[워크플로 "Commit pipeline log" 푸시 경합 수정]** (2026-08-30 완료)
  - 사용자가 공유한 GitHub Actions 로그에서 Daily 배치의 "Commit pipeline log" 스텝이
    `git push`에서 `[rejected] (fetch first)`로 실패한 것을 확인 — 이 세션이 같은
    시간대에 main에 다른 커밋을 계속 푸시하고 있어 발생한 non-fast-forward 경합.
    러너 워크스페이스가 잡 종료와 함께 사라져 그 실행의 리포트 커밋 자체가 유실됨.
  - **실측 확인**: git 푸시 실패는 리포트 커밋 단계에서만 발생, 그 이전 Supabase
    데이터 적재 스텝은 이미 끝난 뒤라 데이터 유실은 없음을 확인(events 테이블에서
    최근 6시간 내 `seoul_public_reservation` 11건 신규 적재 확인).
  - `ingest-daily.yml`/`ingest-monthly.yml`의 "Commit pipeline log" 스텝에 push 실패
    시 fetch+rebase 후 최대 5회 재시도하는 로직 추가(docs/pipeline-log.md는 이 두
    워크플로만 건드리는 파일이라 rebase 충돌 위험 낮음).
  - **검증**: `npx js-yaml` CLI로 두 워크플로 YAML 구문 유효성 확인(앱 코드 변경이
    아니라 tsc/test/build 대상 범위 밖). 상세:
    `implementation/2026-08-30-workflow-push-race-fix.md`.

- [x] **[핵심 events 파이프라인 후속 — GG_CULTURE_EVENTS/TOUR_API_FESTIVAL "fetch
  failed" 재발 대응]** (2026-08-30 완료)
  - 사용자가 공유한 실제 실행 로그에서 `fetchWithCause` 배포 후에도 GG_CULTURE_EVENTS가
    재시도 3회 전부 소진 후 순수 `fetch failed`만 남긴 것을 확인 — `err.cause`
    부가 정보가 전혀 붙지 않아, 이 환경(GitHub Actions 러너)의 undici가 이 실패에는
    애초에 cause를 붙이지 않는다는 것을 실측으로 확정(JS 에러 조사만으로는 더 캘
    정보가 없음, 네트워크/IP 차단 계열 가설에 무게 실림).
  - `fetch-with-cause.mjs`의 `describeError()` 강화 — err 자체의 code/errno,
    AggregateError 하위 에러까지 방어적으로 추출(단위 테스트 3건 추가, 총 7건).
  - JS 레벨 진단의 한계를 인정하고 `ingest-daily.yml`에 "Network diagnostics" 스텝
    신설 — `curl -v`로 실패 중인 openapi.gg.go.kr/apis.data.go.kr과 정상 동작 중인
    openapi.seoul.go.kr(대조군)에 직접 연결해 DNS/TCP/TLS/HTTP 중 정확히 어느
    단계에서 막히는지 다음 실행 로그에 직접 남기도록 함(진단 전용, 배치 실행에
    영향 없음).
  - **검증**: `npx tsc --noEmit`/`npm run test`(68파일 694건)/`npm run build` 통과,
    `npx js-yaml`로 워크플로 YAML 유효성 확인. 상세:
    `implementation/2026-08-30-events-pipeline-outage-investigation.md` 6절.
