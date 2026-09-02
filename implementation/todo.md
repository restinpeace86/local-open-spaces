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

- [x] **[UI/UX 개선] 외부 지도 앱 연동 제거 및 '스팟픽' 인앱 지도/위치 표시 기능**
  (2026-08-30 완료)
  - **사전 조사에서 발견**: 인앱 지도 인프라(`MiniMap`/`MapPreviewModal`, Kakao Maps
    SDK, 핀 표시, EXACT 좌표만 노출하는 오도 방지 로직)는 이미 Task 9-5-1(2026-08-22)
    때 구현돼 있었다 — 실제로 남아 있던 문제는 `DetailModal`의 조건부 CTA 3분류
    (Decision 011) 중 세 번째 옵션이 여전히 `buildNaverMapDirectionsUrl()`로 만든
    `nmap://route/car` 딥링크를 새 창으로 여는 것뿐이었다(grep으로 앱 전체에서 유일한
    외부 지도 연동 지점임을 확인, `/nearby`도 동일 `DetailModal` 재사용이라 함께 해결).
  - `detail-modal.tsx`의 3번째 CTA를 외부 `<a target="_blank">`에서 이미 존재하던
    `MapPreviewModal`을 여는 `<button>`("🗺️ 지도에서 보기")으로 교체 — 새 지도
    컴포넌트를 만들지 않고 기존 미니맵의 "🔍 크게보기"와 동일한 모달을 재사용.
  - 유일한 소비처를 잃어 완전히 미사용이 된 `src/lib/navigation.ts`/`navigation.test.ts`
    (buildNaverMapDirectionsUrl) 삭제.
  - **검증**: `npx tsc --noEmit`/`npm run test`(67파일 691건 — 네이버 딥링크 검증을
    인앱 모달 오픈 검증으로 교체)/`npm run build` 통과. `/nearby` 페이지 HTML에
    `nmap://` 문자열이 전혀 없음을 실측 확인. 상세:
    `implementation/2026-08-30-inapp-map-remove-external-nav.md`.

- [x] **[UI/UX 수정] 큐레이션 카드 내부 '이미지 vs 텍스트' 영역 비율 고정**
  (2026-08-30 완료)
  - "베스트 나들이 픽" 카드(`best-pick-slider.tsx`)가 `location_name` 유무에 따라
    카드 전체 높이가 들쭉날쭉했던 것을 발견 — 바깥 래퍼에 고정 크기(`w-36
    h-[220px]`)를 잡고 카드는 `h-full flex flex-col`로 채우는 기존
    `ReservationOpenSlider` 관례를 재사용해 수정.
  - 이미지 영역을 `aspect-square`에서 고정 높이 `h-36` + `w-full h-full
    object-cover`로 교체, 텍스트 영역은 `flex-1 min-h-0 overflow-hidden`으로 남는
    공간을 정확히 채우되 넘쳐도 카드 밖으로 나오지 않게 함. 스켈레톤도 동일 크기로
    맞춰 CLS 없음.
  - **검증**: `npx tsc --noEmit`/`npm run test`(67파일 692건 — 장소명 유무와 무관하게
    카드 크기가 항상 동일한지 검증하는 신규 테스트)/`npm run build` 통과. 상세:
    `implementation/2026-08-30-best-pick-card-ratio-fix.md`.

- [x] **[개발 요청] 관리자 화면(/admin/data-grid) 기능 고도화 및 범용 제휴 상품
  테이블 개편** (2026-08-30 완료)
  - **사전 조사**: 지시서가 말한 "/admin/data-grid의 기존 상품명 검색/등록일 필터"는
    실제로 open_spaces/events/raw_ingest_data 3개 탭을 다루는 기존 관리자 그리드에
    이미 있었다(대상 데이터만 시설/행사였을 뿐) — 그 UX 패턴을 큐레이션 상품에도
    적용하는 것으로 해석. 이 그리드는 표준 중분류 체계에 깊게 결합돼 있고
    curated_items는 데이터 모양이 근본적으로 달라(제휴 상품 vs 위치 기반) 공유 테이블
    로직에 끼워넣지 않고, 네 번째 탭으로 추가하되 자기완결적인 `CuratedItemsPanel`로
    통째로 대체 렌더링(기존 3개 탭 코드는 전혀 손대지 않음).
  - `curated_items` 테이블 신설(id/title/image_url/booking_url/category/is_active/
    operation_start_date/operation_end_date/created_at) — deals/event_tickets와
    동일한 RLS(service_role 전용). `event_tickets`는 삭제하지 않고 그대로 둠(프런트
    연결만 이동).
  - `GET/POST/PATCH /api/admin/curated-items`(검색+등록일+운영기간 필터, 등록/수정/
    원클릭 토글) + `GET /api/curated-items`(홈 화면 공개 조회, is_active와 운영기간
    둘 다 반영) 신설.
  - 홈 화면 "베스트 나들이 픽"을 `curated_items`로 연결(location_name 등 event_tickets
    전용 필드가 사라져 카드가 더 단순해짐).
  - 관리자 UI: 상품명 검색/등록일 필터(기존 UX 재사용) + 운영기간 필터(신규) +
    원클릭 노출 토글(로컬 갱신, 목록 재조회 없음) + 등록/수정 겸용 모달.
  - **실측 검증**: RLS 차단, 관리자 등록→공개 노출→토글로 즉시 비노출→어드민에는
    계속 노출 전체 흐름 확인, 운영기간 지난/미래 상품이 공개 GET에서 제외되고
    어드민 기간 필터로는 정상 조회됨을 확인. 테스트 데이터 정리 완료.
  - **검증**: `npx tsc --noEmit`/`npm run test`(69파일 699건 — curated-items-panel
    5건, data-grid-client 스모크 테스트 2건 신규)/`npm run build` 통과. 상세:
    `implementation/2026-08-30-curated-items-admin-crud.md`.

- [x] **[개발 요청] 상세 모달 내 인앱 지도 및 위치 핀 표시 기능 구현** (2026-08-30 완료)
  - **사전 조사**: 요구사항 1(외부 지도 링크 제거)/2(인앱 지도+핀)는 직전 작업["외부
    지도 앱 연동 제거 및 '스팟픽' 인앱 지도/위치 표시 기능 구현"]에서 이미 구현돼
    있었음을 grep 전수 확인(window.open/map.kakao.com/map.naver.com/nmap:// 등 앱
    전체에서 외부 지도 연동 지점 0건). 실제로 남아 있던 갭은 요구사항 3(로딩
    스켈레톤/실패 폴백)뿐이었다.
  - `MiniMap`에 로딩 상태 관리(`loading`/`loaded`/`error`) 추가 — 로딩 중엔 스켈레톤,
    SDK 로드 실패 시엔 "지도를 불러올 수 없습니다" + (address 있으면) 주소 텍스트와
    "주소 복사" 버튼을 보여준다(지도가 없어도 위치 정보는 확인 가능). `DetailModal`/
    `MapPreviewModal`이 `item.address`를 새로 전달하도록 연결.
  - **부수 발견 및 정리**: 예전 카카오맵 길찾기 링크 유틸이었으나 네이버 지도로
    전환되며 완전히 버려진 죽은 코드 `src/lib/kakao/directions-url.ts`(소비처 0건)를
    발견해 삭제.
  - **검증**: `npx tsc --noEmit`/`npm run test`(70파일 703건 — `mini-map.test.tsx`
    4건 신규, loadKakaoMapSdk 모킹으로 로딩/성공/실패 상태 전이 검증)/`npm run build`
    통과. 상세: `implementation/2026-08-30-inapp-map-loading-fallback.md`.

- [x] **[개발 요청] 검색창/지도 검색 키워드 유연성 대폭 개선 ('용인 어린이상상' 등
  검색 누락 방지)** (2026-08-30 완료)
  - **사전 조사에서 실측으로 정확한 원인 규명**: (1) 사용자 예시의 events 행은
    is_active=false/end_date 만료로 정상적으로 제외되는 것(버그 아님), (2) **핵심**:
    open_spaces(141,980행)에 인덱스 없는 `name ILIKE '%...%'`가 3.5초+ 걸리고
    부하 시 statement timeout까지 재현됨 — "간헐적 누락" 증상과 정확히 일치.
  - `pg_trgm` 확장 설치 + open_spaces(name,address)/events(title,description,
    venue_name)/curated_items(title)에 GIN 트라이그램 인덱스 추가 — 동일 쿼리
    3584ms → 82ms로 개선(타임아웃 위험 제거).
  - `src/lib/search/keyword-search.ts` 신규(`splitSearchTokens`/`escapeIlikePattern`
    공유 유틸) — 공백 기준 토큰마다 여러 필드에 걸쳐 ILIKE OR 매칭해 "용인
    어린이상상"(띄어씀) ↔ "용인어린이상상의숲"(붙어있음) 같은 불일치를 해결.
  - `searchEvents`(이벤트픽 GNB 검색): title 단일 → title/description/venue_name
    확장 + 토큰 매칭. 기존 is_active/target_audience/category_min 큐레이션 필터는
    별도의 명시적 Decision이라 유지(추측 금지).
  - `/api/admin/data-grid`(open_spaces/events 검색, SEOUL_YEYAK 메모리 필터 경로
    포함), `/api/admin/curated-items`(이스케이프 누락도 함께 수정), `/nearby` 지도
    클라이언트 필터(name→name+address) 모두 동일한 토큰 매칭으로 확장.
  - **실측 검증**: 사용자가 준 예시 그대로("용인 어린이상상") 어드민 검색에서
    "용인어린이상상의숲"을 정확히 찾아냄. 실제 활성 이벤트("남사당바우덕이", 붙어
    있음)를 "남사당 바우덕이"(띄어씀)로 검색해 2건 정상 반환 확인.
  - **특이 사항(사용자 확인 필요)**: `/nearby` 지도 검색은 현재 지도 반경 내로 이미
    좁혀진 목록을 클라이언트에서 텍스트로 재필터링하는 구조라, 찾으려는 장소가 현재
    화면 밖에 있으면 텍스트 매칭을 아무리 고쳐도 원천적으로 검색되지 않는다 — 이번
    지시서 범위(텍스트 매칭)를 넘어서는 구조적 이슈라 손대지 않고 남겨둠, 전국 단위
    서버사이드 스팟 검색은 별도 지시 필요.
  - **검증**: `npx tsc --noEmit`/`npm run test`(71파일 715건)/`npm run build` 통과.
    상세: `implementation/2026-08-30-search-keyword-flexibility.md`.

- [x] **[개발 요청] 스팟픽 전국구 서버사이드 검색 구현 및 큐레이션(베스트 나들이 픽)
  실제 DB 연동 마무리** (2026-08-30 완료)
  - **요구사항 1(전국구 검색)**: 앞선 지시서에서 남겨둔 "지도 반경 안에서만 텍스트로
    거르는" 구조적 한계를 해소. `searchSpacesNationwide`(신규, `get-home-feed.ts`) +
    `GET /api/spots/search` 신설 — `searchEvents`와 동일한 토큰 단위 다중 필드(name/
    address) ILIKE 패턴으로 open_spaces 전체를 지도 중심과 무관하게 검색한다.
    `map-explorer.tsx`는 검색어가 있을 때 기존 반경 RPC 결과 대신 이 응답을 쓰도록
    전환하고, 기존 클라이언트 텍스트 필터는 완전히 제거했다. panTo+핀 활성화는 이미
    있던 `focusPosition`/`setSelectedItem` 흐름을 그대로 재사용해 신규 코드 없이
    "그냥 작동"함을 확인했다.
  - **실측으로 발견한 추가 성능 함정**: "부산"처럼 흔한 지명은 매치 건수가
    6,000건+이라 `order('name')`을 걸면 정렬 비용 때문에 1.9~5초가 걸리고, **라이브
    서버에서 PostgREST 8초 statement_timeout 타임아웃까지 실제 재현**했다. `order()`를
    제거해(검색 결과는 "관련도" 정렬 기준이 없어 이름순을 포기해도 무방) 같은 쿼리를
    200~300ms로 안정화했다(반복 측정 0.36~0.94초).
  - **요구사항 2(베스트 나들이 픽 Mock 제거 재확인)**: `best-pick-slider.tsx`/
    `home-view.tsx`/`api/curated-items` 전수 재확인 — 이미 Mock 데이터 경로 0건,
    is_active+운영기간 필터 정확함을 코드로 재확인. 관리자 POST(실제 등록 엔드포인트)
    → 공개 GET 즉시 반영 → is_active 토글 시 즉시 비노출까지 실측 검증(테스트 데이터
    삭제로 원상 복구). 코드 변경 없음(기존 구현이 이미 요구사항 충족).
  - **검증**: `npx tsc --noEmit`/`npm run test`(71파일 720건 — `searchSpacesNationwide`
    5건 신규, `map-explorer.test.tsx` 검색 테스트를 전국구 아키텍처에 맞게 교체)/
    `npm run build` 통과(`/api/spots/search` 라우트 정상 등록 확인). 상세:
    `implementation/2026-08-30-nationwide-spot-search-and-curated-items-verification.md`.

- [x] **[개발 요청] "현재 이용 가능"/"예약 가능" 카드 내부 이미지·텍스트 영역 비율
  불일치 수정** (2026-08-30 완료)
  - **원인**: 두 섹션이 공유하는 `EventCard`가 이미지:텍스트를 flex-[4]/flex-[6]로
    정확히 40:60 분할하도록 되어 있었으나, `getDateBannerBadge`가 반환하는 "오늘
    한정/오늘 마감" 배너(당일 종료 이벤트에만 뜸)가 `flex-col`의 **별도 행**으로
    이미지 영역 위에 얹혀 있었다 — 배너가 있는 카드는 "전체 높이 - 배너 높이"만
    4:6으로 나뉘어 배너 없는 카드보다 이미지/텍스트가 모두 작아졌다. 실측 확인:
    `/api/home/feed` 기준 "현재 이용 가능" 20건 중 7건, "예약 가능" 20건 중 5건이
    오늘 마감이라 실제로 매 새로고침마다 발생하던 문제였다.
  - 배너를 이미지 영역(flex-[4]) 내부 절대 위치 오버레이로 옮겨 레이아웃 흐름에서
    완전히 제외 — 배너 유무와 무관하게 4:6 분할이 항상 동일해진다. 기존 중분류/상태
    뱃지는 배너와 겹치지 않도록 배너가 있을 때만 한 칸(top-8) 내렸다.
  - **정정(사용자 재확인 후)**: 배포 후에도 여전히 깨진다는 재확인을 받고
    Playwright로 실제 브라우저 렌더링 높이를 직접 측정 — dateBanner는 진짜 원인이
    아니었다(수정 후에도 이미지 높이가 92~224px로 제각각, 배너 유무와 무상관).
    **진짜 원인**: 이미지 영역 div(flex-[4])에 `min-h-0`이 빠져 있어, flex 기본값
    (min-height:auto)이 `<img>`의 min-content 크기(원본 이미지 가로세로 비율을
    고정폭에 대입한 높이)를 존중해 버렸다 — 썸네일마다 원본 비율이 달라 이미지
    영역이 flex-[4]가 아니라 "그 이미지가 요구하는 높이"로 늘어났던 것. 이미지
    영역에도 min-h-0을 추가(텍스트 영역엔 이미 있었음)해 재측정 결과 16장 카드
    전부 92px:162px로 완전히 동일해짐을 Playwright로 확인했다.
  - **검증**: `npx tsc --noEmit`/`npm run test`(71파일 723건 — `event-card.test.tsx`
    3건 신규)/`npm run build` 통과 + Playwright 실측 렌더링 검증. 상세:
    `implementation/2026-08-30-event-card-image-text-ratio-fix.md`.

- [x] **[개발 요청] 스팟픽(/nearby) 중분류 필터에 "키즈친화 식당" 칩 누락 수정**
  (2026-08-30 완료)
  - **원인**: "경기 키즈카페/놀이시설 휴게음식점 수집 어댑터"(gg-kidscafe-adapter.mjs)가
    `category_min='놀이방식당'`(놀이시설을 갖춘 음식점 전체, is_kids_friendly=true
    고정)으로 이미 1,788건을 적재하고 있었으나, 2026-08-29 중분류 1단 필터 개편
    당시 이 값에 대응하는 칩이 없어 화면에서 찾아볼 방법이 전혀 없었다(실측 확인).
  - `CORE_SPOT_CATEGORIES`(`spot-category-groups.ts`)에
    `{ id: 'kids-restaurant', label: '키즈친화 식당', minors: ['놀이방식당'] }` 추가.
    필터/선택 로직은 이미 이 배열을 순회하는 구조라 코드 변경 없이 데이터 추가만으로
    자동 반영됨.
  - **검증**: `npx tsc --noEmit`/`npm run test`(71파일 724건 —
    `spot-category-groups.test.ts` 1건 신규, 칩 개수 11→12 갱신)/`npm run build`
    통과 + Playwright로 실제 `/nearby` 페이지에 칩이 노출됨을 확인. 상세:
    `implementation/2026-08-30-nearby-kids-restaurant-category-chip.md`.

- [ ] **[개발 요청] 키즈친화 스팟 서비스 스마트 폴백(Fallback) 아키텍처 구현**
  — **사전 확인 결과 기존 Decision과 정면 상충하여 구현 보류(스킵)**, 사용자
  재확인 필요 (2026-08-30)
  - **요구사항 요약**: (1) 지도 마커 클릭/상세 모달 진입 시, 우리 DB에 상세정보가
    없으면 `https://map.naver.com/v5/search/{이름+주소}`로 새 창(`target="_blank"`)
    연동하는 "View Fallback". (2) [예약하기] 버튼을 자체 예약 시스템 → `naver_
    booking_url` → 전화문의/준비중 팝업 3단 폴백으로 구성하는 "Reservation Fallback".
  - **상충 1(치명적) — 오늘(2026-08-30) 이미 정반대 방향으로 확정한 결정과 충돌**:
    `implementation/2026-08-30-inapp-map-remove-external-nav.md`("외부 지도 앱
    연동 제거 및 인앱 위치 보기로 전환") — 사용자가 오늘 직접 "네이버 지도 등으로
    나가던 길찾기/**위치 보기** 버튼의 외부 연동 동작 제거"를 명시적으로 지시해
    Decision 011의 3번째 CTA를 외부 네이버 딥링크(`nmap://`)에서 인앱
    `MapPreviewModal`로 이미 교체했다. 이번 요청의 "View Fallback"은 이 결정을
    정확히 역행한다 — 게다가 curated_items(큐레이션 상품, 소수)에만 있는 "자체
    등록된 대표 이미지/커스텀 텍스트"가 없으면 폴백한다는 조건이라, 절대다수인
    일반 공공데이터 open_spaces 항목 전체가 사실상 항상 네이버 외부 링크로
    빠지게 되어 오늘 결정보다 오히려 더 넓은 범위로 외부 이탈을 되살리는 셈이다.
  - **상충 2(치명적) — 어제(2026-08-29) 같은 기능을 넣었다가 같은 날 되돌린 전례**:
    `implementation/2026-08-29-spot-detail-naver-deep-link.md`로 `buildNaverPlace
    SearchUrl` 네이버 검색 딥링크 폴백을 추가했다가, 바로 다음 작업
    (`implementation/2026-08-29-spot-self-service-reservation-mvp.md`)에서
    "직전 작업의 네이버 검색 딥링크 폴백을 완전히 제거"하고 대신 자체
    `reservations` 테이블 + `ReservationRequestModal` + `POST /api/reservations`
    (RLS로 anon 접근 완전 차단, service-role 전용) 자체 간편 예약/신청 MVP로
    교체했다 — 이번 요청의 "Reservation Fallback" 2순위(`naver_booking_url`)/
    3순위(전화문의)는 바로 이 자체 예약 시스템으로 이미 대체된 흐름을 다시
    네이버/전화 경유로 되돌리는 것과 같다.
  - **상충 3 — Spec에 없는 신규 데이터/로직(제3장 제2조·제5조, 제5장 제2조)**:
    `naver_booking_url` 컬럼, 스팟별 "자체 예약/결제 테이블 연동 여부" 플래그
    모두 `project/database_schema.md`/Decision 011 어디에도 정의돼 있지 않다.
    Decision 011의 기존 3분류 CTA(공공 예약/할인 예매/그 외)와 이번 요청의 3단
    폴백이 구조적으로 유사해 보이지만 3번째 분기 동작이 다르다(기존: 인앱 지도
    보기 / 신규: 전화문의 팝업) — 어느 쪽이 맞는지는 Spec 개정 없이 임의로
    판단하지 않는다.
  - **처리**: 구현 진행하지 않고 스킵. 위 세 상충 내역을 사용자에게 그대로
    전달하고, (a) 오늘/어제 결정을 실제로 뒤집을 의도인지, (b) 그렇다면
    "View Fallback"의 발동 조건(전체 open_spaces 대상인지, 특정 소스/카테고리
    한정인지)과 "네이버 지도 상세정보 보기"와 기존 인앱 `MapPreviewModal`의
    공존 방식, `naver_booking_url` 컬럼 추가 여부와 기존 자체 예약 시스템과의
    관계를 확정해 달라고 요청 후 재지시받아 진행한다.

- [x] **[개발 종합 요청] 스팟픽(SpotPick) MVP 스마트 폴백, 관리자 큐레이션 및 배치
  안정화 고도화** (2026-08-30~2026-09-01 완료 — 사용자가 위 스킵된 요청을 재작성해
  외부 링크 문제를 스스로 제거하고 다시 지시함, 상충 없음 확인 후 진행)
  - **재확인**: View Fallback이 "네이버 새 창"에서 "자체 UI 내 인앱 렌더링"으로
    바뀌어 오늘 결정(외부 지도 앱 연동 제거)과 더 이상 충돌하지 않는다. Reservation
    Fallback도 공공예약/원본 링크를 자체 폼보다 우선시키는 방향으로 재배치되어
    자체 간편예약 MVP를 완전히 대체하지 않는다(자체 예약 "연동"이 없는 스팟은
    여전히 공공/원본 링크 우선, 그다음 네이버, 마지막 전화). 규모가 매우 커
    아래 4개 섹션으로 나눠 순차 구현하고 섹션별로 커밋한다.
  - [x] **섹션 4(배치 안정성)** (2026-09-01 완료): `TourApiV4AreaBasedAdapter.fetch()`
    (KorTour/KorWithTour/KorPetTour 공유)의 contentTypeId별 그룹 루프를 개별
    try-catch로 격리 — 하나의 API가 실패해도 나머지는 계속 진행. 신규
    `fetch-with-timeout.mjs`(30초 AbortController)를 이 어댑터에 적용,
    `withRetry` 백오프를 5s/10s(×2배, 예시 그대로)로 조정. `run-daily.mjs`/
    `run-monthly.mjs`의 STEPS를 export하고 `runSingleDailySource`/
    `runSingleMonthlySource` 신규 — CLI `--only=` 플래그와 신규
    `POST /api/admin/ingest/rerun`이 동일 경로를 재사용. Stale-data 보존
    (`upsertRowsSafeMerge`, 삭제 경로 없음)/cron 정각 회피(이미 03:07·03:13
    KST)는 실측 확인 후 코드 변경 없이 문서화만. **실측 검증**: 라이브 서버로
    잘못된 batch/sourceKey 누락/존재하지 않는 sourceKey 3가지 에러 케이스 확인,
    Next.js 런타임에서 `scripts/` 밖 `.mjs` 동적 import가 실제로 동작함을 확인.
    **미완료**: 타임아웃 유틸은 이 어댑터 1곳에만 적용(나머지 20여 개는 후속
    작업), 재수집 버튼은 API만 완성(관리자 UI는 섹션 2와 함께 진행).
  - [x] **섹션 3(관리자 Lazy Loading)** (2026-09-01 완료): `data-grid-client.tsx`
    (open_spaces/events/raw_ingest_data 공유) + `curated-items-panel.tsx`
    (자기완결 패널, 별도 게이트 필요) 둘 다 `hasLoaded` 플래그를 추가해 탭
    진입/전환 시 자동 fetch를 막고 "📥 불러오기" 버튼 클릭 시에만 조회하도록
    변경(기존 "🔍 조회하기"는 중분류/타겟연령 필터 반영용이라 이름을 다르게 붙여
    혼동 방지). 탭 전환 시 플래그를 다시 false로 리셋. raw_ingest_data도 이
    공통 게이트로 명시적 트리거가 통일됨. **검증**: 기존 테스트를 "불러오기
    클릭 후 검증"으로 갱신, 부수적으로 `event-card.test.tsx`의 UTC 기준 날짜
    계산이 KST 등에서 실제로 깨지는 잠재 결함을 실측으로 발견해 로컬 날짜
    헬퍼로 교체.
    상세: `implementation/2026-09-01-spotpick-fallback-curation-batch-hardening-sections-3-4.md`.
  - [x] **섹션 2(관리자 스팟 큐레이션 탭)** (2026-09-01 완료): 신규 `spot_curations`
    테이블(open_spaces 1:1 FK, is_active, image_url, 영업시간 구조화 필드,
    menu_items jsonb, RLS+정책없음) + `spot-curation-images` Storage 버킷(public,
    5MB, 이미지 mime 제한) + `POST /api/admin/spot-curations/upload-image`(클립보드
    Ctrl+V 이미지를 서버로 받아 업로드) + `GET/POST/PATCH /api/admin/spot-curations`
    (스팟명 조인 검색, spot_id 단건 조회, 중복 등록 409 안내) + 영업시간/메뉴 스마트
    파서(`spot-curation-parsers.ts`, 유닛 테스트 10건) + 5번째 관리자 탭
    `SpotCurationsPanel`(스팟 검색은 기존 `/api/spots/search` 재사용, 섹션 3
    Lazy Loading 게이트 동일 적용). **실측 검증**: 실제 스팟으로 POST→PATCH→단건
    조회→목록 검색→토글→중복 409까지 전체 CRUD 흐름 확인, 실제 PNG 업로드 후
    공개 URL 200 OK 확인, Playwright로 탭/모달/파서 버튼 렌더링 확인. 상세:
    `implementation/2026-09-01-spotpick-admin-spot-curations-section-2.md`.
  - [x] **섹션 1(프론트엔드 폴백)** (2026-09-01 완료): 신규 공개
    `GET /api/spot-curations?spot_id=`(is_active=true만 반환, `/api/admin/
    spot-curations`와 분리) + `naver_booking_url` 컬럼 추가(관리자 폼에도 입력란
    추가). `DetailModal.tsx`: 스팟일 때 마운트 시 큐레이션 조회 — 없으면 기존
    공공데이터 뷰 그대로(코드 변경 없음, 이미 충족), 있으면 대표 이미지/구조화된
    영업시간(오픈~마감·브레이크타임·라스트오더)/메뉴 목록을 우선 표시(모두
    인앱, 외부 링크 없음). 예약 CTA는 기존 "info_url → 자체 간편 예약 폼" 2단
    구조 사이에 `naver_booking_url` 한 단계만 끼워 넣어 info_url → naver_booking_url
    → 자체 폼(2026-08-29 결정 유지) 순으로 재배치. **검증**: `npx tsc --noEmit`/
    `npm run test`(72파일 742건 — `detail-modal.test.tsx` 7건 신규)/`npm run build`
    통과 + 실제 스팟으로 등록→즉시 공개 반영→비활성화→즉시 미반영까지 실측 확인.
    **특이 사항**: `open_spaces`에 전화번호 컬럼이 없어(실측 확인) 4순위 "tel: 직통
    전화" 요구사항은 문자 그대로 구현하지 못했다 — 기존 자체 간편 예약 폼(연락처
    남기면 관리자가 연락)을 실질적 안내 역할로 유지했다(추측으로 가짜 전화번호를
    만들지 않음). 상세:
    `implementation/2026-09-01-spotpick-fallback-frontend-section-1.md`.
  - 각 섹션 완료 시 `npx tsc --noEmit`/`npm run test`/`npm run build` 통과 확인 후
    커밋. **4개 섹션 전체 완료.**

- [x] **[개발 요청] 스팟픽(SpotPick) UI/UX 개선 및 버그 패치 (4가지 항목)**
  (2026-09-01 완료)
  - **항목 1(마커 클릭 2단계 UX)**: `map-explorer.tsx`에 `previewItem` 상태 신설 —
    마커 클릭은 전용 핸들러로 분리해 전체 상세 대신 신규 `MarkerPreviewCard`(썸네일
    자리/장소명/간단 주소 말풍선 카드)만 먼저 띄우고, 그 카드를 터치해야 전체
    `DetailModal`로 승격된다. 리스트/AI추천/겹친마커그룹 클릭은 요구사항이 "마커
    클릭"으로 한정했으므로 기존처럼 즉시 전체 상세로 진입(단, previewItem은 함께
    정리). 위로 스와이프 제스처는 이번 범위에서 구현하지 않음(탭으로 동일 결과 도달).
  - **항목 2(예약 버튼 노출 조건 엄격화)**: `DetailModal`의 보조 액션에 4번째 분기
    추가 — info_url → naver_booking_url → **spot_curations 존재(관리자 확인 신호로
    재해석, 새 컬럼 만들지 않음)** → 안내 텍스트(무료: "예약 필요 없음 · 상시 무료
    입장", 그 외: "예약 관련 정보가 없습니다"). 큐레이션 없는 절대다수 스팟은 이제
    버튼 대신 텍스트만 노출.
  - **항목 3(관리자 자동완성)**: `searchSpacesNationwide`에 `categoryMin` 파라미터
    추가 + `/api/spots/search`에 `category_min` 쿼리 파라미터 연결. **실측 중 발견한
    기존 버그**: SPACE_COLUMNS/SpaceRow/toSpaceItem에 category_min이 빠져 있어 이
    검색 API 결과의 category_min이 항상 undefined였던 잠재 결함(검색 모드 중분류
    필터가 한 번도 매치 안 됐음)을 함께 수정. 관리자 스팟 큐레이션 탭 검색을
    "키즈친화 식당"(놀이방식당)으로 좁히고 2글자 미만 조회 금지, "[장소명 +
    주소(동/읍/면)]" 축약 표시 추가.
  - **항목 4(중복 지도 뷰 제거)**: `DetailModal`에 `hideMapSection` prop 추가,
    map-explorer.tsx만 true로 전달 — 정확한 좌표라 실제 지도를 보여줄 수 있었던
    경우만 미니맵/지도 CTA 생략(좌표 부정확 안내 문구는 중복 정보가 아니므로 그대로
    유지). 이벤트는 이 prop과 무관하게 항상 기존 구조 유지.
  - **검증**: `npx tsc --noEmit`/`npm run test`(73파일 757건 — 신규/갱신 13건)/
    `npm run build` 통과. 실측: `/api/spots/search`에 category_min 필드가 정상
    채워지는지, category_min 필터가 실제로 좁혀지는지(65건 전부 놀이방식당) 확인,
    Playwright로 관리자 화면 실제 자동완성(10건, "가능동" 축약 주소) 확인. 상세:
    `implementation/2026-09-01-spotpick-ux-4-fixes.md`.

- [x] **[개발 요청] 외부 공공 API 배치 수집 안정성 및 독립 실행(Isolation) 구조
  고도화** (2026-09-01 완료 — 2026-08-30 작업의 "20여 개 어댑터는 후속 작업" 후속)
  - **항목 1(격리, 신규 발견)**: 전수 조사 결과 `Promise.all`로 서로 독립된 외부 API
    2개 이상을 묶어 하나만 실패해도 전체가 reject되던 어댑터 5개 발견(
    `cultural-facility-summary-adapter.mjs`(8개 시설유형 — 가장 정확한 "그룹 루프"
    사례)/`gg-culture-events-adapter.mjs`/`gg-events-adapter.mjs`/
    `gg-kidscafe-adapter.mjs`/`swimming-pool-adapter.mjs`). 신규 공유 유틸
    `settle-group-fetches.mjs`(Promise.allSettled 기반)로 5곳 모두 격리 — 일부만
    실패해도 나머지는 정상 수집, 전부 실패했을 때만 예외.
  - **항목 2(30초 타임아웃)**: `fetch-with-timeout.mjs`가 기존 `fetch-with-cause.mjs`
    (2026-08-30 원인진단)를 내부적으로 거치도록 통합. 전수 조사로 남아있던 raw
    `fetch()` 17곳(어댑터 15개 + 지오코딩/AI 유틸 3개)을 전부 교체 — 이제 파이프라인
    전체에 예외 없이 30초 타임아웃 적용. vworld-geocoder의 대량 지오코딩용 세밀한
    재시도(1초×3회)는 유지하고 타임아웃만 추가(서로 다른 관심사로 판단).
  - **항목 3(Stale Data 방어)**: 이미 충족 확인(코드 변경 없음).
  - **항목 4(관리자 UI)**: `GET /api/admin/ingest/rerun` 신규(STEPS에서 소스 목록
    동적 조회, 하드코딩 금지) + `/admin/data-grid` 상단 `IngestRerunPanel`(배치/소스
    선택 + 재수집 버튼 + 결과 표시).
  - **항목 5(cron 분산)**: daily 03:07→**02:47 KST**, monthly 03:13→**03:52 KST**로
    재조정 — 요구사항이 명시한 "2~4시 사이 애매한 시간"에 맞춰 두 배치를 멀리
    떨어뜨림.
  - **검증**: `npx tsc --noEmit`/`npm run test`(75파일 769건 — 신규 8건 + 5개
    어댑터 격리 테스트 갱신)/`npm run build` 통과. 실측: `GET /api/admin/ingest/rerun`
    실제 STEPS 목록(daily 4/monthly 16) 확인, Playwright로 관리자 화면 재수집 패널
    렌더링 확인. 상세: `implementation/2026-09-01-ingest-pipeline-isolation-hardening.md`.

- [x] **[개발 요청] 스팟별 날씨 및 대기질(미세먼지) 캐시 테이블 스키마 생성**
  (2026-09-01 완료)
  - 신규 `spot_weather_caches` 테이블(id PK + spot_id UNIQUE FK →
    `open_spaces`(id) on delete cascade — 지시서의 "spots"를 프로젝트 실제 테이블명
    으로 정정, spot_curations과 동일한 1:1 모델링). 기상청 단기예보(temperature/
    precipitation_prob/sky_status/humidity, 퍼센트 컬럼 0~100 CHECK) + 에어코리아
    (pm10/pm25/pm10_grade/pm25_grade) + updated_at. updated_at 인덱스 추가(캐시
    특유의 TTL 조회 대비). RLS는 curated_items/spot_curations와 동일하게 켜고
    정책 없음(service_role 전용) — 지시서의 "인증된 유저 읽기 가능" 예시는 이 앱에
    로그인 자체가 없어 실질적으로 존재하지 않는 역할이라 적용하지 않고 기존
    프로젝트 패턴을 따랐다.
  - **검증**: `npx tsc --noEmit`/`npm run test`(75파일 769건, 순수 스키마 추가라
    영향 없음)/`npm run build` 통과. 실측: UNIQUE/CHECK 제약 위반 확인, upsert 정상
    동작 확인, anon SELECT/INSERT 모두 RLS로 차단됨을 실제 DB로 확인(테스트 데이터
    삭제로 원상 복구). 이번 지시서 범위는 스키마 생성까지 — 실제 수집 어댑터/API
    라우트는 미포함. 상세:
    `implementation/2026-09-01-spot-weather-caches-schema.md`.

- [x] **[개발 요청] 기상청 단기예보 조회서비스 연동 어댑터 구현 (실제 API 스펙 반영)**
  (2026-09-01 완료)
  - 인증키는 새 환경변수 없이 기존 `PUBLIC_DATA_API_KEY` 재사용(사용자 제공 키를
    URL-디코딩해 정확히 일치함을 확인).
  - 신규 유틸 `kma-grid.mjs`(위경도→기상청 격자 LCC 변환, 서울/부산/제주 기준값과
    정확히 일치 확인 — 최초 반올림 상수 버그를 이 비교로 발견해 수정) +
    `kma-base-time.mjs`(getVilageFcst 8회/getUltraSrtNcst 매시 발표 스케줄에 맞춘
    최신 base_date/base_time 계산, 타임존 독립적).
  - 어댑터 `kma-weather-adapter.mjs`(BaseCollectorAdapter 비상속 — 카탈로그 수집이
    아니라 "기존 스팟마다" 날씨를 채우는 다른 데이터 모델이라 함수 기반 모듈로 구현):
    **격자 그룹핑 신규 최적화**(같은 5km 격자 스팟은 API 1회만 호출 — 141,980건
    규모에서 반드시 필요), `settleGroupFetches`/`fetchWithTimeout`/`withRetry`(2회)
    재사용한 개별 격자 에러 격리+30초 타임아웃+재시도, TMP/POP/SKY/REH 파싱(가장
    이른 예보 시각 선택, SKY 코드 한글 번역), getUltraSrtNcst 선택적 실황 보강,
    spot_weather_caches 전용 upsert(캐시 특성상 완전 덮어쓰기, 기존 open_spaces의
    NULL-병합과 다름).
  - **검증**: `npx tsc --noEmit`/`npm run test`(78파일 798건 — 신규 29건)/
    `npm run build` 통과. 실측: 실제 기상청 API로 실제 스팟 5건 날씨 수집(합리적인
    실제 값 확인) → 실제 DB upsert 확인 → 재실행 시 중복 없이 덮어써짐 확인 →
    테스트 데이터 삭제. 상세: `implementation/2026-09-01-kma-weather-adapter.md`.

- [x] **[개발 요청] 기상청 날씨 데이터 수집 3시간 주기 배치(Cron) 파이프라인 연동**
  (2026-09-01 완료)
  - `kma-weather-adapter.mjs`에 `fetchAllExactSpots(client)`(신규,
    `dedupe-open-spaces.mjs`와 동일한 커서 페이지네이션) 추가 → `run()`이 `limit`
    미지정 시 전국 EXACT 스팟 전체(실측 142,024건)를 기본 대상으로 처리하도록 변경
    (기존 `DEFAULT_SPOT_LIMIT=2000` 안전장치 제거).
  - `collectWeatherForSpots()` 반환 형태를 `{ rows, totalGroups, succeededGroups,
    failedGroups }`로 확장(요구사항 5 "총 처리된 격자 수, 성공/실패 건수" 로깅용).
  - `run-daily.mjs`/`run-monthly.mjs`와 동일한 env-precheck(필수 환경변수 누락
    시작 시점 검사) 추가, 배치 시작/격자 처리 결과/소요 시간 콘솔 로깅 강화.
  - 신규 `.github/workflows/ingest-weather.yml`: 소스가 KMA 하나뿐이라 별도
    오케스트레이터 없이 어댑터 CLI를 직접 실행. Cron `47 2,5,8,11,14,17,20,23 * * *`
    — KST 오프셋(9시간)이 발표 주기(3시간)의 배수라 KST/UTC 조정 없이 요구사항
    값 그대로 사용 가능함을 계산으로 확인. `docs/pipeline-log.md` 기록과 워크플로
    재시도는 의도적으로 넣지 않음(사유는 구현 기록 참고 — 데이터 모델 불일치 및
    3시간 자동 재주기로 불필요).
  - **검증**: `npx tsc --noEmit`/`npm run test`(78파일 801건 — 신규 3건, 기존 2건
    반환 형태 수정)/`npm run build` 통과. 실측: `--dry-run --limit=5`/`--limit=5`
    (실제 upsert) 정상 확인, `fetchAllExactSpots`로 실제 DB 전국 EXACT 142,024건
    누락 없이 수집 확인, 필수 환경변수 누락 시 env-precheck 정상 동작 확인,
    테스트 데이터 삭제로 원상 복구. 상세:
    `implementation/2026-09-01-kma-weather-cron-pipeline.md`.

- [x] **[개발 요청] 에어코리아(한국환경공단) 시도별 실시간 대기질 API 연동 어댑터 구현
  (실제 API 스펙 반영)** (2026-09-01 완료)
  - 인증키는 새 환경변수 없이 기존 `PUBLIC_DATA_API_KEY` 재사용(KMA와 동일 포털
    인증키임을 확인).
  - 신규 `address-sido-lookup.mjs`: `open_spaces.address` 첫 토큰(시/도)을 AirKorea
    `sidoName` 17개 약칭으로 변환. 실제 DB 142,024건 전수 스캔(325개 고유 첫 토큰)
    기반으로 표를 구성(추측 금지) — `"전남광주통합특별시"`(2,584건, 17개 표준
    시/도 어디에도 대응 안 됨)와 `"광주시"`(경기도 광주시/광주광역시 판별 불가,
    `korea-region-lookup.mjs`의 기존 판단과 동일)는 의도적으로 매핑하지 않고 제외.
  - 어댑터 `airkorea-adapter.mjs`: 17개 시/도 순회 수집 + `settleGroupFetches`
    재사용한 개별 시/도 에러 격리(실측 중 부산/경남 504 타임아웃 후 재시도로 정상
    복구 확인), pm10Value/pm25Value/pm10Grade/pm25Grade 파싱 및 방어('-'/빈 문자열/
    범위 밖 등급 → null), 시/도 단위 측정소 평균 집계(API가 위경도 없이 시/도
    단위로만 데이터를 줘 발생한 정밀도 한계 — 구현 판단으로 명시), `kma-weather-
    adapter.mjs`의 `upsertWeatherCaches` 재사용(중복 구현 없음).
  - **검증**: `npx tsc --noEmit`/`npm run test`(80파일 818건 — 신규 17건)/
    `npm run build` 통과. 실측: 실제 에어코리아 API로 10건 수집(8/10 매핑 성공,
    2건은 `"전남광주통합특별시"`라 의도대로 미매칭 확인) → 실제 DB upsert 확인 →
    같은 스팟에 KMA 어댑터 재실행 시 pm10/pm25가 손상되지 않고 공존함을 확인 →
    테스트 데이터 삭제. 상세: `implementation/2026-09-01-airkorea-adapter.md`.

- [x] **[개발 요청] 스팟픽(SpotPick) AI 맞춤 추천 챗봇 엔진 구현** (2026-09-01 완료)
  - 사전 확인: 기존 "AI 추천" 칩(`AiRecommendSheet`, LLM 미사용 규칙기반)과 별개의
    신규 기능으로 확정(사용자 원문 "기존에 구현 완료된 항목들을 제외하고") — 충돌
    Decision 없음, 홀드 없음.
  - LLM 토큰 최적화(요구사항 2-①): 1~8단계 인터뷰 전체는 LLM 0회(프론트 상태
    머신 + 백엔드 템플릿 리터럴), 최종 요약 문구 생성 1회에만 Gemini 호출(실패/키
    없음 시 템플릿 폴백).
  - 5단계 날씨/대기질: 오늘=`spot_weather_caches` 캐시(신규 RPC
    `get_nearest_spot_weather`, SECURITY DEFINER 필요성을 실측으로 발견해 수정),
    내일 이후=KMA 라이브 예보(TS 미러 `kma-forecast.ts`/`kma-grid.ts` — 기존 .mjs
    임포트 시 `process.argv` 부작용으로 크래시해 별도 구현). 미세먼지는 미래 날짜엔
    예보 자체가 없어 정직하게 안내.
  - 4단계 검색/랭킹(`search-engine.ts`, 순수 함수): 성향(Vibe)→category_min 매핑,
    공공시설/민간사업자 판정, 예산 필터 데이터 한계 정직 처리, 1회성 완화 후 즉시
    중단(요구사항 문구 그대로), 공공시설 1개+제휴 상품(curated_items) 1개 믹스 보장.
  - **실측으로 발견해 재설계한 성능 함정**: 폴백 대비 최대 반경(40km)으로 미리
    조회하면 141,980행 규모에서 PostgREST 8초 statement_timeout에 실제로 걸림 —
    "선택 반경 먼저 조회 → 0건일 때만 다음 반경 재조회"하는 2단계 왕복으로 재설계.
  - 키즈친화 맛집 지연 로딩(`/api/ai-chat/nearby-restaurants`): 1km→3km→5km 실제
    순차 재조회, 첫 결과에서 즉시 중단.
  - FAB + 바텀시트 UI(`ai-chat-fab.tsx`/`ai-chat-sheet.tsx`), `/nearby`·`/calendar`
    양쪽 마운트(`/calendar`는 온보딩 모달 없이 좌표만 조용히 사용 — 무관한 UX 변경
    방지).
  - **검증**: `npx tsc --noEmit`/`npm run test`(87파일 876건 — 신규 7파일 58건)/
    `npm run build` 통과. 실측: 실제 KMA/에어코리아로 캐시 시딩 → `/api/ai-chat/
    weather`(오늘/내일 전환) → `/api/ai-chat/search`(정상 매칭/1회 완화/완전
    소진 3가지 경로) → `/api/ai-chat/nearby-restaurants`(반경 확장/빈 결과) 전부
    실제 DB로 확인 → Playwright로 `/nearby` 전체 8단계 실제 진행 + `/calendar` FAB
    노출 확인 → 테스트 데이터 삭제로 원상 복구. 상세:
    `implementation/2026-09-01-ai-chat-recommendation-engine.md`.

- [x] **[코드 점검 및 성능 안정화 요청] 스팟픽(SpotPick) 백엔드/프론트엔드 프로덕션
  리스크 진단 및 개선** (2026-09-01 완료)
  - 6개 항목 각각 EXPLAIN ANALYZE/실측 호출/유닛 테스트로 먼저 검증 후 실제 문제만
    수정(추측으로 일괄 수정하지 않음).
  - **①DB 인덱싱**: `idx_open_spaces_location_geography`(2026-08-29 기존 장애
    디버깅으로 이미 존재) 실측 확인 — Index Scan 사용, GIST가 바운딩박스 프루닝을
    이미 자동 수행함을 확인해 코드 변경 없음(KNN 재작성은 지도 화면 공유 핵심 RPC라
    범위 밖으로 분리 제안).
  - **②배치 청크**: 대부분 이미 500건 청크(공용 `upsertRows`) — `deals-collector.mjs`
    (아직 미연결 뼈대 코드)만 사각지대로 발견해 500건 청크+재시도 추가.
  - **③Gemini 타임아웃**: 10초→3.5초로 단축(요구사항 3~4초). fake timer로 hang 상황
    재현해 5초 내 템플릿 폴백 확인.
  - **④맛집 캐싱**: 실제 아키텍처(스팟별이 아니라 사용자 위치별 세션 단일 조회)
    확인 후 모듈 스코프 캐시(`nearby-restaurants-cache.ts`) 신설 — 시트 재오픈해도
    같은 좌표면 재요청하지 않음을 Playwright로 확인.
  - **⑤폴백 투명성**: 무한루프는 구조적으로 불가능(단일 if, 검증됨) — 서버 로그
    추가 + 응답에 `originalRadiusMeters`/`finalRadiusMeters` 추가해 요약 문구가
    구체적 반경 변화를 안내하도록 개선.
  - **⑥RPC STABLE**: `pg_proc.provolatile` 직접 조회로 두 RPC 모두 STABLE 확인,
    코드 변경 없음.
  - **검증**: `npx tsc --noEmit`/`npm run test`(88파일 884건 — 신규 2파일 5건 +
    기존 3파일 6건 추가)/`npm run build` 통과. 상세:
    `implementation/2026-09-01-spotpick-production-risk-audit.md`.

- [x] **[UI/UX 개선 및 기능 수정 요청] 이벤트픽 챗봇 추가, 대/중분류 바텀 시트 개편,
  스팟픽 레이아웃 통일 및 시설 제한 상향** (2026-09-01 완료)
  - **①이벤트픽 FAB 정정**: 실측 확인(`bottom-tabs.tsx`) 결과 "이벤트픽"은
    `/`(홈)이고 `/calendar`가 아니었다 — 직전 챗봇 작업에서 `/calendar`에 잘못
    마운트했던 것을 발견해 `/`(HomeView)로 옮기고 `/calendar`에서는 제거(정정).
  - **②테마별 행사 숨김**: `<section>`에 `hidden` 적용(state/로직은 보존, 삭제 아님).
  - **③대/중분류 바텀시트**: `MajorCategoryGrid`의 인라인 중분류 칩을
    `AiRecommendSheet`/`EventBrowseSheet`와 동일한 오버레이+바텀시트 패턴으로 개편.
  - **④스팟픽 헤더 레이아웃 통일**: `/nearby` 모바일 헤더(위치+검색)를 이벤트픽
    `HomeHeader`와 동일한 `flex items-center` 가로 배치로 변경(데스크톱 사이드바는
    성격이 달라 제외).
  - **⑤마커 상한 200→1,000**: `MARKER_LIMIT` + `get_nearby_spaces_and_events` RPC
    LIMIT(1001) + `spec/map/spatial-search.md` 문서 값 함께 상향, 서울시청 실측으로
    1,000건 정상 반환·응답시간 여유 확인.
  - **검증**: `npx tsc --noEmit`/`npm run test`(88파일 889건)/`npm run build` 통과.
    Playwright로 5개 항목 전부 실제 화면(스크린샷 포함)에서 확인. 상세:
    `implementation/2026-09-01-eventpick-chatbot-category-sheet-layout-marker-limit.md`.

- [x] **[버그 제보] 어드민 스팟 큐레이션 등록 화면 — 검색 선택/영업시간·메뉴 파싱**
  (2026-09-02 완료)
  - **검색 클릭 선택**: Playwright 재현 결과 state 자체는 정상 — 콜드 스타트 지연
    (최대 5초)과 선택 후 UI가 완전히 다른 모양으로 바뀌어 "채워졌다"는 느낌이 없던
    것이 유력 원인으로 판단, 검색 중 표시를 파란 강조로/선택 카드를 입력란과 동일한
    테두리 스타일(✅)로 개선 + AbortController로 요청 취소 방어 추가.
  - **영업시간 파싱 근본 원인 확정**: "시간이 키워드보다 앞"(예: "15:00 - 17:00
    브레이크타임", "20:30 라스트오더")에서 파싱 실패 — 옛 구현이 키워드 뒤쪽만
    검색했기 때문. 줄 단위로 키워드와 가장 가까운 시간을 채택하도록 수정, 기존
    형식과 완전히 하위 호환.
  - **메뉴 파싱 근본 원인 확정**: "이름/가격/설명이 각각 별도 줄(빈 줄 구분)"인
    배달앱·홈페이지 복사 형식을 아예 인식 못 함 — 가격 단독 줄 인식 + 직전 텍스트
    줄을 이름으로 확정하는 로직 추가(설명은 스키마에 없어 의도적으로 버림).
  - textarea 크기 확대(영업시간 2→5줄, 메뉴 3→8줄, resize-y 허용).
  - **검증**: `npx tsc --noEmit`/`npm run test`(88파일 894건 — 파서 5건 신규)/
    `npm run build` 통과. 실측: 사용자 제보 원문 그대로 Playwright로 재현해 영업시간
    5개 필드/메뉴 3개 항목 전부 정확히 파싱됨을 실제 화면에서 확인. 상세:
    `implementation/2026-09-02-spot-curations-parser-and-search-ux-fix.md`.

- [x] **[버그 제보 정정] 스팟 검색 입력란 미반영 / 이미지 붙여넣기 포커스 가로채짐 /
  배경 클릭 시 등록 폼 소실** (2026-09-02 완료)
  - 사용자 재제보로 위 항목 1(검색 선택)과 이미지 붙여넣기의 이전 진단이 부족했음을
    확인 — 정정.
  - **검색 선택 근본 원인 확정**: 선택해도 입력란 "값" 자체가 바뀌지 않던 것(요청:
    "하노"→"하노이진영" 검색→클릭→입력칸에 "하노이진영") + 스크롤 가능한 결과
    목록에서 트랙패드 미세 이동으로 click 이벤트가 아예 발생하지 않을 수 있던 문제 —
    입력란 value를 선택된 이름으로 직접 채우고, 목록 클릭을 onMouseDown으로 전환.
    "등록하기 시 선택했는데도 에러" 문제도 실제 저장 성공까지 확인해 함께 해결.
  - **이미지 붙여넣기 근본 원인 확정**: 붙여넣기 대상 div와 URL input이 같은
    `<label>`로 묶여 있어, 클릭 시 브라우저가 자동으로 그 안의 폼 컨트롤(URL input)
    로 포커스를 가로채고 있었다(Playwright로 document.activeElement 직접 확인) —
    `<label>`을 `<div>`로 교체해 자동 포커스 위임을 제거.
  - **순서 무관 확인**: 오픈/마감/브레이크/라스트오더는 줄 순서가 아니라 키워드
    존재로만 판별해 순서가 뒤섞여도 정확히 파싱됨을 신규 테스트로 확인.
  - **배경 클릭 시 폼 소실 방지**: 등록 폼은 입력량이 많아 실수로 배경 클릭 시 데이터
    손실 리스크가 커 배경 클릭 닫기를 제거, ✕ 버튼/저장 성공 두 경로로만 닫히게 변경.
  - **검증**: `npx tsc --noEmit`/`npm run test`(88파일 896건)/`npm run build` 통과.
    Playwright로 배경 클릭 유지/입력란 값 반영/실제 저장 성공/이미지 영역 실제 포커스
    4가지 모두 실제 화면에서 확인, 테스트로 생성된 큐레이션 1건은 삭제로 원상 복구.
    상세: `implementation/2026-09-02-spot-curations-parser-and-search-ux-fix.md`
    (같은 파일에 정정 섹션으로 추가).

- [x] **[개발요청] Supabase Auth 기반 카카오/구글 소셜 로그인 버튼 및 콜백 처리 구현**
  — **사전 확인 결과 기존 헌법/Decision과 정면 상충하여 구현 보류(스킵)** (2026-09-02).
  **이후 사용자가 Decision 018 + spec/common/auth-user-profile.md를 실제로 커밋해
  상충이 해소됨을 `git pull`로 직접 확인 → 같은 날 구현 완료(아래 항목 참고).
  - **요구사항 요약**: `KakaoLoginButton`/`GoogleLoginButton` 컴포넌트,
    `supabase.auth.signInWithOAuth({ provider: 'kakao'|'google', options:
    { redirectTo } })` 호출, 에러 핸들링, `/auth/callback` 세션 처리 가이드.
  - **상충 1(치명적) — 제2장 제5조(단순함과 신뢰성)**: "복잡한 가입 절차 *없이* 내
    위치를 기반으로 즉시 동네 소식을 확인할 수 있는 단순하고 이해하기 쉬운 서비스를
    지향한다"고 명시돼 있다. 카카오/구글 소셜 로그인 도입은 일반 사용자에게 로그인
    (가입) 절차를 요구하는 것으로, 이 조항이 명시적으로 배제하는 방향과 정확히
    반대다.
  - **상충 2(치명적) — 제3장 제2조/제7장 제1조(Spec 우선/Spec 없는 기능 추가 금지)**:
    `spec/` 전체를 뒤져도 로그인/인증/사용자 계정 관련 Spec 문서가 전혀 없다(실측
    확인 — `find spec -iname "*auth*" -o -iname "*login*" -o -iname "*user*"`
    결과 0건). 승인된 Spec 없이 임의로 구현할 수 없다.
  - **상충 3(치명적) — 제7장 제4조(미래 기능 구현 금지)**: 제1장 제3조가 정의한
    현재 MVP 범위는 "공공 데이터 API 연동 및 내 위치 반경 기반 검색"이며, 사용자
    계정/로그인은 포함돼 있지 않다.
  - **상충 4(결정적 증거) — 이번 세션 전체에 걸쳐 반복적으로 확정된 "무인증"
    아키텍처**: `implementation/todo.md`에 이미 두 차례 명시적으로 기록됨 — "별도
    로그인 인증 없음(기존 관례, 이번 범위 밖)"(296행), "로그인 자체가 없어 실질적으로
    존재하지 않는 역할이라 적용하지 않고"(826행). `deals`/`event_tickets`/
    `curated_items`/`reservations`/`spot_curations`/`spot_weather_caches` 테이블
    모두 "이 앱은 아직 로그인/세션 인증이 없다(known gap)"는 전제로 RLS를
    service_role 전용으로 설계돼 있다 — 지금 로그인을 추가하면 이 모든 기존 설계
    전제가 깨진다.
  - **참고**: `project/decision-log.md` Decision 007이 관리자 계정 RBAC(`user_
    metadata.role` 기반)을 언급하지만, 이는 **어드민 계정 전용** 구상이고 실측 확인
    결과 `is_admin()` 함수 자체가 아직 구현되지 않았다(`grep -rl is_admin scripts/
    migrations src` 결과 0건) — 이번 요청은 그 관리자 RBAC이 아니라 **일반 사용자용**
    카카오/구글 소셜 로그인이라 별개이며, Decision 007도 "향후 일반 사용자... 확장
    시"라고 명시해 현재 범위가 아님을 스스로 인정하고 있다.
  - **결론**: 사용자가 직접 Spec 수정(또는 새 Decision 기록)을 통해 "일반 사용자
    로그인 도입"을 명시적으로 승인하기 전까지 구현하지 않는다.

- [x] **[개발요청] Supabase Auth 기반 카카오/구글 소셜 로그인 및 프로필(birth_years)
  연동 구현** (2026-09-02 완료 — 위 스킵 항목의 상충 해소 후 재개)
  - `git pull`로 Decision 018(무로그인 정책 수정 승인) +
    `spec/common/auth-user-profile.md`가 실제로 원격에 존재함을 직접 확인한 뒤 진행.
  - DB: `public.profiles`(`birth_years int[]`) + 본인 행만 CRUD 가능한 RLS 4개
    정책(이 프로젝트에서 유일하게 auth.uid() 기반 정책이 실제로 붙은 테이블) +
    `auth.users` 가입 시 자동 프로필 생성 트리거.
  - `middleware.ts`(신규, @supabase/ssr 공식 세션 갱신 패턴), `KakaoLoginButton`/
    `GoogleLoginButton`(요구사항 색상/문구 그대로), `/auth/callback` 콜백 라우트
    (exchangeCodeForSession), `getMyProfile`/`updateBirthYears`/`useUser`, `/my`
    페이지 신규 구현 + 하단 탭 "마이" 활성화(NEXT_PUBLIC_ENABLE_MY_PAGE=true —
    Vercel 프로덕션에도 별도 설정 필요).
  - **실측으로 발견해 함께 고친 버그**: `BirthYearsEditor`가 비동기로 늦게 도착하는
    프로필 데이터를 반영하지 못해(useState 초기값만 사용, 리마운트 안 됨) 항상 빈
    목록만 보이던 문제 — `key`로 프로필 로드 여부에 따라 확실히 리마운트되게 수정.
  - **검증**: `npx tsc --noEmit`/`npm run test`(92파일 916건 — 신규 5파일 27건)/
    `npm run build` 통과. 실측: 카카오 버튼 클릭 → 실제 `accounts.kakao.com/login`
    까지, 구글 버튼 클릭 → 실제 `accounts.google.com/v3/signin/identifier`까지
    이동함을 확인(둘 다 Supabase 콜백 URI·실제 등록된 client_id 포함 — 대시보드
    Provider 설정이 살아있음을 실증). anon 키로 `profiles` SELECT는 빈 배열, INSERT
    시도는 401+RLS 위반으로 정확히 차단됨을 확인. 미들웨어 추가 후 기존 페이지 전부
    정상 로드(회귀 없음). 상세: `implementation/2026-09-02-social-login-and-profile.md`.

- [x] **[개발요청] 맘스픽(Mom's Pick) 등급/게이미피케이션 & 커뮤니티 체계 구현**
  (2026-09-02 완료)
  - `spec/community/mom-pick-grades.md` Spec 초안 작성 → 채팅으로 6개 쟁점(채택 정의/
    VAPID 발급 주체/등급 산정 주기/리뷰·체크리스트 입력 형태/파워맘 선발 방식/강등
    정책) 확정 → `project/decision-log.md` **Decision 019** 승인 기록 → "바로
    구현해줘" 지시로 구현.
  - DB: `profiles.grade`/`ai_chat_free_uses_used` 추가 + 신규 테이블 4종(`mom_pick_
    posts`/`mom_pick_likes`/`user_bookmarks`/`push_subscriptions`) + 트리거 3종(채택
    필드 보호/좋아요 카운트 동기화/새싹맘 즉시 승급) + RPC 2종(월간 활동 집계/반경 내
    신규 항목 카운트).
  - 등급 로직(`calculateGrade`, TS+mjs 두 벌 — 배치 스크립트는 `@/` 별칭을 못 써 독립
    구현), AI 챗봇 1회 제한(로그인 signed_up은 서버 카운터, 비로그인은 localStorage
    소프트 제한), 커뮤니티 피드/후기·체크리스트 작성 화면(`/mom-pick`), 찜 화면
    (`/favorites`, Decision 003 플래그 해제), 어드민 "채택" 관리 탭, 등급 산정 배치
    (매일 KST 04:23) + 파워맘 정원제, Web Push 알림 인프라(VAPID/서비스워커/구독
    저장/발송 배치 KST 07:30) — 5개 논리 단위로 나눠 각각 `tsc`/`test`/`build` 통과
    후 커밋.
  - **실측으로 발견해 함께 고친 문제**: (1) `push_subscriptions`↔`profiles`가 둘 다
    `auth.users`를 가리키는 형제 FK라 PostgREST 임베디드 조회가 안 되는 것을 배치
    스크립트 실제 실행으로 발견해 2단계 조회로 수정. (2) `useUser()` 훅을 새로 쓰게 된
    `AiChatSheet`/`BookmarkButton` 때문에 `detail-modal.test.tsx`/`home-view.test.tsx`/
    `map-explorer.test.tsx`가 supabase 클라이언트 미모킹으로 일제히 실패한 것을 발견해
    세 파일에 목을 추가.
  - **검증**: `npx tsc --noEmit`/`npm run test`(94파일 933건)/`npm run build` 통과.
    라이브 Supabase에 마이그레이션 8개 순차 적용 + RLS/트리거 존재 확인, 등급/푸시
    배치 스크립트 라이브 실행 확인, dev 서버로 `/mom-pick`/`/favorites`/`/my`/
    `/admin/data-grid` 200 및 신규 탭 라벨 렌더링 확인. 상세:
    `implementation/2026-09-02-mom-pick-grades-and-gamification.md`.
  - **수동 후속 조치 필요**: Vercel에 `NEXT_PUBLIC_ENABLE_USER_BOOKMARK`/
    `NEXT_PUBLIC_VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`, GitHub Actions 시크릿에
    VAPID 키 등록 필요(로컬 `.env.local`만으로는 배포에 반영 안 됨).
  - **후속 확인(2026-09-02)**: 사용자가 위 3개 Vercel 환경변수 + GitHub Actions
    VAPID 시크릿 2개를 모두 등록 완료. GitHub API로 시크릿 존재 여부를 직접 조회해
    실측 확인함(값 자체는 API로도 조회 불가 — 존재 여부만 확인).

- [x] **[개발요청] AI 챗봇 맞춤 추천 상세 구현 (초개인화 고도화 통합본)** (2026-09-02 완료)
  - 기존 8단계 인터뷰(2026-09-01)를 날씨 선제 제안(Step 1) → 지역 선택(Step 1) → 로그인
    프로필 자동 나이 연동(Step 2, KIDS 단계 스킵) → 찜/방문 이력 반영(Step 3) 순으로
    재편. 지역 변경은 기존 `LocationOnboardingModal` 재사용, 세션 한정(앱 전역 위치는
    안 바꿈). 나이는 "연 나이"로 계산(생일 데이터 없음, 추측 금지)하고 영유아보육법
    실제 정의(0~6세)로 매핑. 방문 이력은 신규 테이블 없이 기존 `mom_pick_posts`
    (Decision 019)를 재해석해 재사용(제5장 제4조 기존 구조 우선).
  - **실측으로 발견해 함께 고친 심각한 성능 버그**: `/api/ai-chat/weather`가 서울
    도심 좌표에서 매번 statement timeout으로 실패하던 것을 발견 — `get_nearest_spot_
    weather` RPC가 `st_dwithin` 방식이라 밀집 지역에서 후보 수만 건을 모은 뒤 정렬해
    3.86초 걸리던 것을, PostGIS KNN 연산자(`<->`)로 재작성해 기존 GiST 인덱스를 최근접
    탐색에 실제로 쓰게 해 56ms로 개선(69배). 이 latent 버그는 2026-09-01에 이미
    존재했으나 이번에 처음 발견됨.
  - **검증**: `npx tsc --noEmit`/`npm run test`(95파일 953건)/`npm run build` 통과.
    라이브 DB `EXPLAIN ANALYZE`로 성능 개선 실측, dev 서버 curl로 `/api/ai-chat/
    weather`·`/api/ai-chat/search`(신규 `isBookmarked`/`bookmarkedSpotName` 필드
    포함) 정상 응답 확인. 상세:
    `implementation/2026-09-02-ai-chat-personalization-upgrade.md`.
  - **구현 판단(추측 대신 명시)**: "기계적 이동수단 질문 금지"는 기존 TRANSPORT_
    OPTIONS가 이미 이동수단+거리 결합형이라 별도 조치 불필요로 판단. 식사 시간대
    "스마트 조건부" 질문의 정확한 트리거 경계가 예시만으로 불명확해 기존 동작(모든
    시간대 질문)을 그대로 유지.

- [x] **[개발요청] 맘스픽(Mom's Pick) 메인 화면 기획 구현** (2026-09-02 완료)
  - `/mom-pick`의 기존 최신순 전체 나열 피드를 "파워맘·우수맘 추천/인기·우수글/실시간
    라이브" 3대 섹션(Preview + 전체보기)으로 재구성. 상단 개인화 배너는 `profiles.
    region` 컬럼이 없어 기존 `useUserLocation()`(위치)+`personalization.ts`(나이)를
    재사용해 구현.
  - **실측으로 발견한 아키텍처 문제**: 다른 사용자의 닉네임/등급 배지 표시가 필수인데
    `profiles` RLS(Decision 018 "본인만 조회 가능")가 이를 원천 차단 — RLS를 완화하는
    대신 curated_items 등과 동일한 관례로 service_role 서버 라우트에서만 안전한
    필드(id/nickname/grade)만 골라 조회하고, 로그인/등급 검증은 라우트 레벨에서
    별도 수행(`requireCommunityAccess`). `mom_pick_posts.author_id`↔`profiles.id`
    형제 FK 문제(오늘 두 번째)도 동일한 2단계 조회 패턴으로 해결.
  - `profiles.nickname` 컬럼 신규 추가(+ `/my`에 편집 UI) — 카드에 표시할 이름이
    기존 스키마에 전혀 없었음.
  - 신규 API 4개(`/api/mom-pick/dashboard`, `/expert`, `/trending`, `/live`), 신규
    페이지 3개(`/mom-pick/expert`, `/trending`, `/live`).
  - **구현 판단**: "찜(북마크)"은 게시글에 없는 개념이라(스팟/이벤트 전용) 인기글
    순위는 like_count만 사용. 전체보기 카드는 읽기 전용(인터랙션 요구 없음). 기존
    `MomPickFeed`는 메인에서 안 쓰지만 삭제하지 않고 보존(임의 기능 제거 금지).
  - **검증**: `npx tsc --noEmit`/`npm run test`(95파일 953건)/`npm run build` 통과.
    dev 서버 curl로 신규 페이지 4개 200, API 4개 미로그인 401 차단 확인. 라이브 DB에
    우수맘/파워맘 등급 사용자 0명(아직 실사용 데이터 없음) 확인 — 빈 상태 UI가
    정상적으로 나타날 상황임을 인지. 상세:
    `implementation/2026-09-02-mom-pick-main-dashboard.md`.

- [x] **[개발요청] 새싹맘 등급 조건부 권한 제어 및 안내 팝업** (2026-09-02 완료)
  - "맘스픽 클릭 시" 비로그인/새싹맘 미달성/새싹맘 이상 3분기 안내 모달
    (`LoginPromptModal`/`SaessakMomGuideModal`) + 판별 훅(`useMomPickAccess`) 구현.
  - **용어 대응(스키마 재도입 안 함)**: 요구사항이 `profiles.tier`/`'seed_mom'`을
    전제했지만, 오늘 이미 Decision 019로 `profiles.grade`(sprout 등)와 자동 승급
    트리거(`promote_to_sprout_on_first_post`)를 구현·배포해뒀다 — 같은 개념을 다른
    이름으로 재도입하지 않고 기존 것을 그대로 사용했다(제3장 제2조). "자동 승급
    처리"는 이미 완료된 상태라 이번엔 트리거 존재만 실측 재확인하고 새로 구현하지
    않았다.
  - [첫 글 쓰러 가기]는 별도 `/write` 페이지 대신 같은 화면에 이미 있는
    `PostComposer`로 스크롤 이동(기존 구조 재사용).
  - **검증**: `npx tsc --noEmit`/`npm run test`(96파일 957건)/`npm run build` 통과.
    라이브 DB에 승급 트리거 재확인, dev 서버 curl로 `/mom-pick` 200 확인. 상세:
    `implementation/2026-09-02-saessak-mom-access-guard.md`.

- [x] **[버그 수정] 챗봇 문제점 6건** (2026-09-02 완료)
  - (1) 새 메시지 자동 스크롤 안 됨 → 스크롤 컨테이너 자동 하단 이동 추가.
  - (2) 지역 변경이 정확한 동네 이름 검색만 가능해 국소적 → 기존에 있었지만 GPS
    실패 시에만 숨겨져 열리던 시/군/구 목록 선택을 상시 노출 버튼으로 승격.
  - (3) 예산 "1만원 이하"가 인당/가족 전체 모호 → "1인 기준"으로 라벨 명시(실제
    가격 필터링 기능은 DB에 이용료 데이터가 없어 여전히 미지원 — 정직하게 라벨만 수정).
  - (4) 연령대 "4~6세 빠짐"/"다양한 연령" 의미 불명 → 실제로는 라벨 문구가 실제
    판정 기준(0~6세 영유아, personalization.ts와 동일)과 달라 생긴 오해 — 라벨을
    실제 기준에 맞게 수정(로직 변경 없음).
  - (5) 분위기 선택이 대분류 단일 선택만 가능 → 다중 선택(토글+선택완료 버튼) +
    "전체" 옵션 추가(`ChatAnswers.vibe`→`vibes: Vibe[]`).
  - (6) "검색 중 문제가 생겼어요"만 뜨고 원인 불명 → `NODE_ENV`가 production이
    아니면 실제 에러 메시지를 그대로 표시(오픈 후 자동으로 일반 문구 전환).
  - **실측으로 발견한 진짜 근본 원인**(항목 2·6과 직결): 반경 15km/40km에서 검색이
    매번 statement timeout으로 실패하던 것을 curl로 재현·확인 — 오늘 세 번째로 겪은
    동일 근본 원인(`get_nearby_spaces_and_events`의 `st_dwithin` 방식이 밀집 지역에서
    느림). KNN 인덱스 연산자(`<->`)로 재작성해 15km 6798ms→935ms, 40km→123ms로
    개선(최대 55배) — 경기도권 폭넓게 검색이 안 됐던 진짜 이유였다.
  - **검증**: `npx tsc --noEmit`/`npm run test`(96파일 962건)/`npm run build` 통과.
    라이브 DB EXPLAIN ANALYZE로 성능 개선 실측, dev 서버 curl로 이전엔 100% 실패하던
    15km/40km 검색이 정상 응답함을 확인. 상세:
    `implementation/2026-09-02-ai-chat-bugfixes.md`.

- [x] **[버그 수정] AI 챗봇 예산 옵션 무료/유료/상관없음 3단계로 단순화** (2026-09-03 완료)
  - 사용자 질문("원천데이터에 금액 있는지 파싱 못 해?")에 실측으로 답변: 이벤트는
    USE_FEE 필드가 46%(8,820/19,040건) 있지만 챗봇은 애초에 이벤트를 검색 안 함
    (`p_item_type: 'SPACE'`만 조회). 스팟은 CULTURE_FACILITY에만 ENTR_FEE가 있는데
    전체의 0.76%(1,080/142,109건)뿐 — "1만원 이하" 등 세분화 옵션은 사실상 항상
    무의미했다.
  - 사용자에게 3가지 선택지(단순화만/가격 파싱 구축/단순화 후 나중에 파싱) 제시 →
    "무료/유료/상관없음 3단계로 단순화" 선택받아 구현. `Budget` 타입 축소,
    `matchesBudget`에 PAID(`is_free===false`) 케이스 추가.
  - **검증**: `npx tsc --noEmit`/`npm run test`(96파일 964건)/`npm run build` 통과,
    dev 서버 curl로 PAID 필터 정상 동작 확인. 상세:
    `implementation/2026-09-03-ai-chat-budget-simplification.md`.

- [x] **[개발요청] 로딩 이미지 교체 및 브랜드 표기 영문 제거** (2026-09-03 완료)
  - 사용자가 제공한 `reference/loading/loading_image.gif`를 `public/loading/`으로
    복사해 `BrandSplash`(이 프로젝트 유일의 로딩 스피너, `app/loading.tsx`·
    `bottom-tabs.tsx` 둘 다 공유)의 회전 스피너를 대체 — `next/image`가 GIF를
    재인코딩해 애니메이션이 깨질 수 있어 순수 `<img>` 태그 사용.
  - "나드리픽 (NadriPick)" → "나드리픽"(전체 코드베이스에서 이 표기가 등장하는 유일한
    위치였음을 grep으로 확인).
  - **검증**: `npx tsc --noEmit`/`npm run test`(96파일 964건)/`npm run build` 통과,
    dev 서버 curl로 GIF 200 서빙 및 텍스트 변경 확인. 상세:
    `implementation/2026-09-03-loading-gif-and-brand-name.md`.
