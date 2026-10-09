# 스타필드 문화센터(클래스콕) 문화센터 연동 — 6번째 브랜드

## 구현 대상
사용자 요청(2026-10-09): "스타필드쪽도 3개 데이터 넣을까하는데" +
`https://www.classkok.com/mlt/initLctrSrch.do` 캡처 제공 → 상세 페이지
(`initLctrDetl.do`) 조사 요청 → "그렇게 진행하자"로 구현 확정.

project/decision-log.md Decision 028은 5개 브랜드(이마트/롯데마트/
AK플라자/신세계/현대백화점)까지만 예정했었다 — 스타필드는 사용자가
이번에 명시적으로 승인한 **6번째 브랜드**다.

## 구현 일시
2026-10-09

## 실측 확인 — 조사 결과

### 지점 — 완전 무상태(stateless), 다른 5개 브랜드보다 더 간단함
3개 지점 확정(사이트 홈페이지 지점선택 화면의 `goStore("01"/"02"/"03")`
리터럴 + `/mcm/selectStoreList.do` 응답으로 확정): 01=스타필드 고양,
02=스타필드 수원, 03=스타필드 빌리지 운정.

이 사이트엔 `_classkok_store_` 쿠키(클라이언트 JS가 `document.cookie`로
직접 설정, 서버 세션이 아님) 게이트가 있어 쿠키가 전혀 없으면 모든
요청이 `/selectStore.do`로 리다이렉트된다. 그런데 실측 확인 결과
**쿠키 값 자체는 무엇이든 상관없고(존재만 하면 통과), 실제 지점은 요청
바디의 `storeCd` 파라미터가 그대로 적용**된다(쿠키=고양으로 고정해도
storeCd=수원을 보내면 수원 데이터가 나옴) — AK플라자의
`change_main_store`(지점마다 세션을 다시 설정해야 함)보다도 더 간단한
구조: 고정 쿠키 헤더 하나(`STATIC_STORE_COOKIE`)만 달고 `storeCd`만
바꿔가며 완전히 무상태로 순회할 수 있다.

### 수강대상(lctrTrgCtgryCd) — 2(어린이)/3(영유아)만, "빈 값 트릭" 안 통함
공용 조회(`/mcm/selectLctrSrchPopUpNeedInfo.do`)로 라벨 확정: `1=성인
(제외, 사용자 지시)` / `2=어린이` / `3=영유아` / `4=펫(제외)`.

다중값(`2,3`)은 0건으로 깨지고(실측 확인), **신세계/AK플라자와 달리
빈 값으로 보내도 각 행에 실제 카테고리를 알려주는 필드가 전혀 없다**
(`lctrTrgCtgryCd`/`lctrTrgCtgryNm`이 응답 행마다 항상 null — 요청
파라미터를 그대로 echo하는 메타필드일 뿐 실제 값이 아님). 그래서 지점
(3) × 대상(2) = 6개 조합을 전부 따로 조회해야 하고, 그 요청에 쓴
코드를 `parseLecture(row, targetCtgryCd)` 호출부가 직접 넘겨준다(신세계
의 targetCode 전달 패턴과 동일).

### 페이지네이션 — 고정 20건, `recordsPerPage` 무시됨
각 행의 `lctrTotCnt`로 총건수를 읽어 `ceil(총량/20)`만큼 페이지를
순회해야 한다(실측 확인). 수집 결과: 고양 105건(어린이20+영유아85),
수원 117건(28+89), 운정 132건(54+78) — 전체 354건 수신, 중복 제거 후
338건, 대기불가(WD) 9건 제외 **329건 저장**.

### 상태값(acptStCd) — 뱃지 렌더링 JS의 if/else 분기에 라벨이 그대로 박혀 있음
`I=접수중`/`AA=추가접수중`/`P=매진임박`(셋 다 OPEN) / `WD=대기불가`
(CLOSED) / 그 외(실측된 예: `S`)=`대기가능`(WAITING, else 분기).

### 이미지/접수시각 — 오히려 다른 브랜드보다 더 좋은 품질
목록 응답에 완전한 이미지 URL(`thumbnailImgPath`)이 이미 있고, 접수
시작/종료가 `acptBeginDtm`/`acptTrmntDtm`로 **날짜+시각까지 정밀하게**
제공된다(다른 브랜드는 날짜만 있거나 이 개념 자체가 없었음) —
emart에만 있던 정밀도의 `register_start_at`을 그대로 쓸 수 있다.

### 상세 페이지(`/mlt/initLctrDetl.do?lctrNo=...&store=영문지점명`)
세션/쿠키 없이도 GET으로 200 + 정상 콘텐츠를 반환하는 완전한 공개
딥링크(`og:url` 메타에서 이 형태를 그대로 확인) — "클래스소개" `<h4>`
바로 다음 `<div>`에 실제 소개 텍스트가 있다. **AK플라자와 달리 이
페이지는 `<table>` 구조가 아니라 node-html-parser가 정상 동작함을
실측으로 확인**했다(AK플라자의 파싱 실패는 table 전용 문제였음을
재확인 — 이번엔 안전하게 node-html-parser를 그대로 사용).

### 학습비/재료비 — 분리된 적이 없어 총액만 사용
`dcAfterStdyAmt`/`dcAfterMtrlAmt`(학습비/재료비 분리값)는 샘플 전체에서
항상 null이었고, `dcAfterSmtnAmt`/`dcBfrSmtnAmt`(할인후/할인전 총액)만
실제 값이 있었다 — 지어내지 않고 총액만 `class_fee`/
`class_original_fee`에 쓴다.

## DB 변경 — 6번째 브랜드 확장(사용자 명시 승인)
`scripts/migrations/2026-10-09-starfield-brand-and-category.sql`(적용
완료):
- `culture_club_classes_brand_check` 제약에 `'starfield'` 추가.
- 신규 `쇼핑몰문화센터` category(스타필드는 "대형마트"도 "백화점"도
  아닌 복합쇼핑몰이라 기존 카테고리를 재사용하지 않음, 2026-10-08
  백화점문화센터 신설 때와 동일한 이유).
- `get_culture_club_store_coordinates()` RPC에 `쇼핑몰문화센터` 추가.

## 변경 사항
- `scripts/ingest/lib/starfield-culture-club-parser.mjs`(신규): 지점/
  대상 코드 상수, `STATIC_STORE_COOKIE`, 상태 정규화, 시간/날짜/접수
  시각 파싱, `parseLecture`/`parseLectureListResponse`/
  `getLectureListTotalCount`.
- `scripts/ingest/starfield-culture-club.mjs`(신규): 지점×대상 6조합
  순회 배치. 페이지네이션(lctrTotCnt 기반), `splitOpenAndClosedRows()`
  (WD 제외), `mergeDetailEnrichment()`(class_intro 유실 방지).
- `scripts/ingest/starfield-culture-club-detail.mjs`(신규): 소개 텍스트
  1회성 수집(세션 불필요, node-html-parser 사용).
- `scripts/ingest/starfield-culture-club-stores.mjs`(신규): 3개 지점을
  `open_spaces`(쇼핑몰문화센터)에 지오코딩 등록 — 신세계/현대백화점/
  AK플라자에서 겪은 "open_spaces 미등록" 버그를 처음부터 피하기 위해
  목록 배치와 함께 바로 추가.
- `scripts/ingest/lib/culture-club-unified-row.mjs`: `toUnifiedStarfieldRow`
  추가.
- `src/lib/home/culture-club-options.ts`: 브랜드 옵션 추가,
  `buildStarfieldDetailUrl()`, `STARFIELD_STORE_EN_NAME_BY_CODE`
  (상세 링크는 영문 지점명을 쓰므로 숫자 코드 → 영문명 매핑).
- `src/components/home/culture-club-tab-view.tsx`: `CultureClubClass
  ['brand']`/`BRAND_LABELS`/`buildExternalApplyUrl()`에 starfield 추가.
  지점 뱃지 드릴다운은 다른 신규 브랜드와 동일하게 아직 미지원(Decision
  029 범위).
- `src/app/api/culture-club/search/route.ts`: `VALID_BRANDS`에
  `starfield` 추가. (참고: `STARFIELD_STORE_` 접두사는 소문자화하면
  `starfield`와 정확히 일치해 AK플라자 때 겪은 브랜드명 불일치 버그가
  재발하지 않음 — 별도 별칭 보정 불필요.)
- `src/components/admin/culture-club-panel.tsx`,
  `src/app/api/culture-club/starfield-stores/route.ts`(신규): 관리자
  화면 브랜드 필터/지점 목록에 스타필드 추가.

## 검증
- `npx tsc --noEmit` / `npm run test`(304개 파일 **3,083개**, 스타필드
  신규 테스트 전부 포함) / `npm run build` 전부 통과. 빌드 결과물에
  `/api/culture-club/starfield-stores` 라우트 포함 확인.
- 지점 지오코딩 실제 upsert: 3/3 성공(`open_spaces`에
  `STARFIELD_STORE_01~03` 등록, `쇼핑몰문화센터` 카테고리).
- 목록 배치 실제 실행: 전체 수신 354건 → 중복 제거 338건 → WD 9건
  제외 → **329건 upsert**.
- 상세정보(소개 텍스트) 수집: 329건 전부 성공, 실제 DB 조회로 329/329
  건 모두 `class_intro` 채워짐을 확인.
- 라이브 API 호출로 실제 end-to-end 확인: `/api/culture-club/search?
  brand=starfield&lat=37.29&lng=127.0&radius_km=20` → 110건 정상 노출
  (`distance_meters`/`store_lat`/`store_lng` 정상), `/api/culture-club/
  starfield-stores` → 3개 지점 정상 반환, `/api/admin/culture-club?
  brand=starfield` → 329건 정상 반환.

## 특이 사항
- `getReviewList`류 후기 수집은 다른 5개 브랜드와의 일관성을 위해 이번
  에도 범위 밖으로 둔다.
- 지점 뱃지 드릴다운(사용자 노출 화면)은 Decision 029 범위에 따라 아직
  미구현 — 관리자 패널용 지점 목록 API는 이번에 추가했지만 별개 용도.
