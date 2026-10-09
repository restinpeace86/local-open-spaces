# 롯데백화점 문화센터 연동 — 7번째 브랜드

## 구현 대상
사용자 요청(2026-10-09): "아래는 롯데백화점꺼인데... 이건 롯데마트꺼랑
다른거가? 이것도 좀 봐줘" + `https://culture.lotteshopping.com/search/
list.ajax` 캡처 → 조사 결과 공유 → "4~6시간...내에서 랜덤하게.. 다만
상세꺼가 중요해.. 상세데이터도 확인해보자"로 상세 조사 → 구현 확정.

Decision 028(5개 브랜드) → 2026-10-09 AK플라자/스타필드로 6개 → 이번이
**7번째**(scripts/migrations/2026-10-09-lotte-department-brand.sql).

## 구현 일시
2026-10-09

## 실측 확인 — 조사 결과

### 롯데마트와 완전히 다른 시스템 — 확인됨
`culture.lotteshopping.com`(백화점)은 이미 수집 중인 `culture.lottemart.
com`(대형마트)과 도메인/운영 조직이 완전히 다른 별개 시스템이다.

### 대분류 2개 × 요청 1번씩, 총 2번의 HTTP 요청으로 전량 수집
`lrclsCtegryCd`(01=성인(제외)/02=영유아/03=아동 — 메인 화면 "성인강좌"/
"영·유아강좌"/"아동강좌" 라벨로 확정)만 바꾸면 되고, `mdclsCtegryCd`/
`brchCdList`를 비우면 그 대분류 전체 소분류·전체 지점이 합쳐져서 나온다
(실측: 영유아 6,709건을 한 응답에). `listCnt=10000`으로 페이지네이션
없이 전량 수신 가능(실측: 7.5MB/5초) — 다른 6개 브랜드보다 압도적으로
가벼운 구조.

### 지점 — 31개, 전용 지점 페이지에서 직접 확인
`index.do`의 "/application/search/list.do?type=branch&brchCd=NNNN" 링크
텍스트로 31개 전체 코드-이름 확보. "타임빌라스 수원"/"롯데몰광명점"은
이미 완전한 고유명이라 "롯데백화점" 접두사를 붙이지 않는다(실측: 붙이면
오매칭 위험).

### 상태값 — 사람이 읽는 텍스트 그대로(7종)
접수중=OPEN / 대기접수=WAITING / 나머지(접수예정·접수마감·접수불가·
강의종료·지점문의)=CLOSED.

### 목록보다 상세 페이지가 훨씬 구조화됨 — 사용자 지시 "상세꺼가 중요해"
목록 카드는 요일/시간이 "세부 일정 선택"처럼 아예 없는 경우가 있고
강사명·강의실·정확한 연령이 전혀 없다. 상세 페이지(`/application/
search/view.do?brchCd=...&yy=...&lectSmsterCd=...&lectCd=...`, 쿠키
없이도 공개 접근)는 `<dt>/<dd>` 13개 쌍으로 지점/강좌구분/학기/
**강사명(개인 강사)**/강의기간/강의시간/강의횟수·정원/**강의실**/
수강료/자녀연령/대상구분/접수기간/문의처를 전부 제공한다.

**그래서 이 브랜드만 다른 설계**: 목록 배치는 지점/상태/제목/이미지/
식별자만 채운 "뼈대" 행을 넣고, 상세수집이 요일/시간/강사명/강의실/
연령/수강료/소개 텍스트까지 핵심 구조화 컬럼을 UPDATE로 직접 채운다
(다른 6개 브랜드는 상세수집이 class_intro 하나만 채웠음). 목록 배치가
재실행될 때(4~6시간 주기) 이미 상세수집된 값을 지우지 않도록, merge
대상 컬럼을 class_intro 하나에서 여러 구조화 컬럼으로 확장했다
(`toUnifiedLotteDepartmentRow` 참고).

### ⚠️ 리스크 — NetFunnel(대기열)+Incapsula(WAF)
홈페이지에 두 보호 장치가 걸려있다(실측 확인). 사용자 승인에 따라
**4~6시간 랜덤 주기**(Windows 작업 스케줄러 5시간 간격 + 스크립트 자체
랜덤 시작 지연 최대 60분)로 완화하고, 응답 이상을 감지하면 "봇 차단
의심"이라고 명시한 에러를 던져 디스코드 실패 알림에 그대로 드러나게
했다(사용자 지시: "차단 정책이 바뀌면 나한테 알려줘서 내가 인지할수있게
해줘").

**실측으로 발견/수정한 버그(구현 중)**: 처음엔 list/detail 양쪽에 동일한
"data-tot-cnt 없으면 차단 의심" + "NetFunnel_Action 포함되면 차단 의심"
검사를 적용했는데, 실제 상세 페이지 1,679건을 전부 수집해보니 전부
"차단 의심"으로 실패했다 — data-tot-cnt는 목록 응답에만 있는 속성이고,
NetFunnel_Action은 완전한 HTML 페이지(상세/홈페이지)엔 표준 템플릿으로
항상 포함돼 있어 차단과 무관함을 재확인(정상 상세 페이지 82,757바이트
응답에도 그대로 있었음). `looksLikeListBotBlocked`/`looksLikeDetailBot
Blocked` 두 함수로 분리해 각 엔드포인트에 맞는 "정상이면 반드시 있어야
할 것"만 확인하도록 수정 → 재수집 결과 1,679건 중 1,556건 즉시 성공,
나머지 123건도 재시도하니 121건 성공(실측 확인: 전부 일시적 네트워크
이슈였을 뿐 실제 차단이 아니었음) — 최종 2건만 진짜 HTTP 500(롯데 서버
자체 오류, 다음 예약 실행에서 자동 재시도됨).

## DB 변경
`scripts/migrations/2026-10-09-lotte-department-brand.sql`(적용 완료):
`culture_club_classes_brand_check` 제약에 `'lotte_department'` 추가.
카테고리는 현대백화점/신세계/AK플라자와 동일하게 기존 `백화점문화센터`
재사용(새 카테고리/RPC 변경 불필요).

## 변경 사항
- `scripts/ingest/lib/lotte-department-culture-club-parser.mjs`(신규):
  지점 31개, 대분류 코드/라벨, 상태 정규화, 카드 파싱(복합 class_id
  "brchCd_yy_lectSmsterCd_lectCd"), `looksLikeListBotBlocked`/
  `looksLikeDetailBotBlocked`.
- `scripts/ingest/lotte-department-culture-club.mjs`(신규): 대분류 2개
  × 요청 1번씩("뼈대" 행), `splitOpenAndClosedRows()`, 확장된
  `fetchDetailEnrichmentByClassId()`(구조화 컬럼 다수 포함).
- `scripts/ingest/lotte-department-culture-club-detail.mjs`(신규): dt/dd
  파싱(요일/시간/강사명/강의실/연령/수강료/소개 텍스트), UPDATE로 핵심
  컬럼 직접 채움.
- `scripts/ingest/lotte-department-culture-club-stores.mjs`(신규): 31개
  지점을 `open_spaces`(백화점문화센터)에 지오코딩 등록.
- `scripts/ingest/lib/culture-club-unified-row.mjs`: `toUnifiedLotteDepartmentRow`
  추가(다른 브랜드와 다른 설계 — 위 "그래서 이 브랜드만 다른 설계" 참고).
- 프론트엔드/관리자 화면: `culture-club-options.ts`(브랜드 옵션,
  `buildLotteDepartmentDetailUrl` — 복합 class_id를 분해해 딥링크
  재구성), `culture-club-tab-view.tsx`, `search/route.ts`(VALID_BRANDS +
  `EXTERNAL_ID_BRAND_ALIASES`에 `lottedept → lotte_department` 처음부터
  등록 — AK플라자 때 겪은 브랜드명 불일치 버그를 재현하지 않기 위해
  선제 대응), `culture-club-panel.tsx` + `lotte-department-stores/
  route.ts`(신규).

## 스케줄링 — 4~6시간 랜덤 주기(사용자 승인)
Windows 작업 스케줄러에 등록 완료:
- `LocalOpenSpaces-LotteDepartmentBatch`: 매 5시간(시작 09:15).
- `LocalOpenSpaces-LotteDepartmentDetailFetch`: 매 5시간(시작 09:55,
  목록 배치 40분 뒤).

각 스크립트의 `MAX_STARTUP_DELAY_MS=60분`이 실제 실행 시각을 흔들어
효과적으로 4~6시간 범위를 만든다(`IS_SCHEDULED_RUN=true`일 때만 적용 —
수동 실행/로컬 테스트는 지연 없음, 기존 관례와 동일).

## 검증
- `npx tsc --noEmit` / `npm run test`(309개 파일 **3,130개**, 롯데백화점
  신규 테스트 전부 포함) / `npm run build` 전부 통과.
- 지점 지오코딩 실제 upsert: 31/31 성공.
- 목록 배치 실제 실행: 영유아 6,709건 + 아동 4,212건 = 10,921건 수신 →
  중복 제거 10,921건 → 비활성 9,242건 제외 → **1,679건 upsert**.
- 상세정보 수집: 1,679건 중 1,677건 성공(2건만 진짜 서버 오류), 실제
  DB/라이브 API 조회로 요일/시간/강사명/강의실/연령/수강료/소개 텍스트
  전부 정상 채워짐을 확인.
- 라이브 API 호출로 end-to-end 확인: `/api/culture-club/search?
  brand=lotte_department&lat=35.82&lng=127.14&radius_km=20` → 28건
  정상 노출(`distance_meters`/`store_lat`/`store_lng` 정상, 상세 enrichment
  반영됨), `/api/culture-club/lotte-department-stores` → 31개 지점,
  `/api/admin/culture-club?brand=lotte_department` → 1,679건 정상.

## 특이 사항
- 재료비(학습비/재료비 분리)는 구조화 필드로 제공되지 않아(소개 텍스트
  안의 자유 서술일 뿐) `class_material_fee`는 항상 null — 지어내지 않음.
- 할인 전/후 가격 구분이 보이지 않아 `class_original_fee`도 항상 null.
- 지점 뱃지 드릴다운(사용자 노출 화면)은 Decision 029 범위에 따라 아직
  미구현 — 다른 신규 브랜드와 동일.
