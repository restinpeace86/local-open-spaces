# AK플라자 문화아카데미 문화센터 연동

## 구현 대상
사용자 요청(2026-10-09): AK플라자 문화센터(culture.akplaza.com) API 2건
(`getMain`/`course/getPeltList_New`) 캡처 제공 + "전지점을 여러건으로
가져올수 있는지 혹은 지점없이 가져올수있는지, 수강대상(main_cd)이 아마도
kids/baby/family 3개"에 대한 조사 요청 → 상세 페이지(`course/detail`)
조사 요청 추가 → "상세페이지 까지 조사하고나서 제안하는 수집방식으로
해 물론 상세페이지 포함해서"로 구현까지 확정.

project/decision-log.md Decision 028이 이미 5개 브랜드(이마트/롯데마트/
AK플라자/신세계/현대백화점)를 예정해 `culture_club_classes.brand` CHECK
제약에 `'ak_plaza'`가 이미 포함돼 있었다(마이그레이션 변경 불필요).

## 구현 일시
2026-10-09

## 실측 확인 — 조사 결과

### 지점 — 세션 기반, 다른 4개 브랜드와 전혀 다른 구조
`getPeltList_New`의 `store` 바디 파라미터는 **완전히 무시된다**(실측:
존재하지 않는 코드 "99"를 넣어도 결과가 전혀 달라지지 않음). 실제 지점은
`/common/change_main_store`(POST, body `store=0N`)를 먼저 호출해 응답의
`Set-Cookie: JSESSIONID=...`를 세션으로 저장해야 하고, 이후
`getPeltList_New` 호출은 그 세션에 저장된 지점 데이터를 그대로 돌려준다
— "여러 지점을 한 요청에" 또는 "지점 없이 전체"로 가져오는 방법은
없다(지점마다 세션 재설정 1회 + 목록조회 1회 순회 필요). 다만 지점이
롯데마트(60+)/신세계(12)/현대백화점(10)보다 훨씬 적은 **4개뿐**(홈페이지
"지점 안내" 메뉴에서 직접 확인: 01 분당점/02 수원점/03 평택점/04 원주점)
이라 가볍다. 분당점(01)은 세션 전환 후 조회해도 현재 0건(폐점 안내는
없었음 — 일시적으로 개설 강좌가 없는 상태일 수도 있어 단정하지 않음).

### 수강대상(main_cd) — API가 라벨을 직접 내려줌, 추측 불필요
`getMain` 엔드포인트가 그대로 코드표를 반환: `1=Adult(성인, 제외)` /
`2=Baby(엄마랑 아가랑)` / `3=Kids(유아,어린이)` / `4=Family(가족 이벤트)`
/ `5=미사용(제외)`. 사용자가 예상한 "kids, baby, family 3개"가 정확히
맞았다. 추가로, `main_cd`를 빈 값으로 보내도 응답의 각 행에 `MAIN_CD`
필드가 그대로 있어(신세계의 `rcptStat` 빈값 트릭과 동일한 패턴)
**지점당 한 번만 요청**해서 사후에 2/3/4만 남기면 된다 — main_cd별로
따로 돌 필요 없음(다중값 `main_cd=2,3`은 0건으로 깨짐을 실측 확인했지만
이 트릭 덕에 안 써도 됨).

### 페이지네이션 — listSize를 크게 주면 한 번에 전체
`listSize=1000`으로 요청하면 지점 전체 강좌(원주점 602건 등)를 한 번에
다 받는다(실측 확인) — 추가 페이지네이션 불필요.

### 이미지 — 목록 응답 자체에 이미 있어 별도 상세수집 불필요
상세 페이지(`/course/detail`)의 썸네일 표시 블록은 사이트 자체가
`<!-- 썸네일 임시제거 -->` 주석으로 꺼둔 상태라 상세 페이지에서는 이미지를
전혀 볼 수 없다. 그러나 목록 응답(`getPeltList_New`)의 각 행에 여전히
`THUMBNAIL_IMG` 파일명이 내려오고, `${image_dir}/wlect/${THUMBNAIL_IMG}`
로 조합하면 실제로 살아있는 이미지(200 OK, 실측 확인: 61,616 bytes
JPEG)를 바로 받을 수 있다 — 그래서 이미지는 목록 배치가 직접 채우고,
상세수집 스크립트는 이미지를 다루지 않는다.

### 상세 페이지 — 소개 텍스트(`#lect_info`)만 여기서 채움
`/course/detail?store=...&main_cd=...&sSubject_cd=...`는 **세션 쿠키 없이
도** 200 + 정상 콘텐츠를 반환함을 실측 확인(목록과 달리 쿼리 파라미터만
으로 충분). `<td id="lect_info">` 셀에 강좌 소개(수업 목표/수업 내용 등
긴 텍스트)가 있다.

### 상태값 — 3종 확인
`STATUS_TXT`: 접수가능/마감임박/마감. "마감임박"은 아직 접수 가능한
상태라 OPEN으로 묵는다(원문은 raw_status에 보존). "대기"(WAITING) 상태는
실측 범위에서 보이지 않았다.

### 분류 2단계 — 이마트와 동일한 main/sub 구조 적용 가능
AK플라자는 "수강대상"(Baby/Kids/Family)과 "강좌분야"(SECT_NM, 예:
"외국어"/"쿠킹/베이킹") 둘 다 구조화된 필드로 갖고 있다(상세 페이지 표에
"수강대상: Kids / 강좌분야: 키즈 신규"로 나란히 노출) — 신세계(수강대상
만 있고 분류가 없어 target_name을 sub_category_name 자리에 썼음)와
달리, main_category_name=수강대상 한글 라벨, sub_category_name=강좌분야
로 매핑했다.

## 제안한 수집 방식(승인됨) 및 구현

지점 4개 × (세션 설정 1회 + 목록조회 1회, listSize=1000) = 지점당 요청
2번, 전체 8번으로 전량 수집. 받은 행 중 `MAIN_CD`가 1/5인 것만 제외.
"마감" 상태는 신세계/롯데마트와 동일한 정책(새로 쌓지 않고 기존 행만
상태 갱신)을 적용.

### 변경 사항
- `scripts/ingest/lib/akplaza-culture-club-parser.mjs`(신규): 지점 상수,
  수강대상 라벨, 상태 정규화, 시간/날짜 파싱, 썸네일 URL 조합,
  `parseLecture`/`parseLectureListResponse`.
- `scripts/ingest/akplaza-culture-club.mjs`(신규): 세션 기반 지점 순회
  배치. `changeMainStore()`가 Set-Cookie를 추출해 `fetchListForStore()`
  호출에 그대로 실어 보낸다. `splitOpenAndClosedRows()`(마감 제외),
  `mergeDetailEnrichment()`(class_intro 유실 방지).
- `scripts/ingest/akplaza-culture-club-detail.mjs`(신규): `lect_info`
  1회성 수집(세션 불필요, `detail_fetched_at IS NULL`인 행만).
- `scripts/ingest/akplaza-culture-club-stores.mjs`(신규): 4개 지점을
  `open_spaces`(백화점문화센터, 기존 카테고리 재사용)에 지오코딩 등록
  — 2026-10-08 신세계/현대백화점에서 겪은 "open_spaces 미등록으로 화면에
  안 보이는" 버그를 처음부터 피하기 위해 목록 배치와 함께 바로 추가했다.
- `scripts/ingest/lib/culture-club-unified-row.mjs`: `toUnifiedAkplazaRow`
  추가(신세계와 동일 구조 — 별도 원본 스테이징 테이블 없이 통합 테이블에
  직접 씀).
- `src/lib/home/culture-club-options.ts`: `CULTURE_CLUB_BRAND_OPTIONS`에
  AK플라자 추가, `buildAkplazaDetailUrl()`.
- `src/components/home/culture-club-tab-view.tsx`: `CultureClubClass
  ['brand']`/`BRAND_LABELS`/`buildExternalApplyUrl()`에 ak_plaza 추가.
  지점 뱃지 드릴다운은 신세계/현대백화점과 동일하게 아직 미지원(Decision
  029 범위 — 이번 요청은 데이터 수집이지 이 화면의 UI 확장이 아님).
- `src/app/api/culture-club/search/route.ts`: `VALID_BRANDS`에 `ak_plaza`
  추가.
- `src/components/admin/culture-club-panel.tsx`,
  `src/app/api/culture-club/akplaza-stores/route.ts`(신규): 관리자 화면
  브랜드 필터/지점 목록에도 AK플라자 추가(2026-10-08 신세계/현대백화점
  추가 때 겪은 동일한 관리자 화면 누락을 처음부터 피함).

### 버그 수정 — 실측으로 발견(AK플라자 강좌가 조용히 0건으로 누락)
`src/app/api/culture-club/search/route.ts`의 `parseExternalId()`가
`open_spaces.external_id` 접두사("AKPLAZA_STORE_")를 그대로 소문자화해
브랜드 값을 `"akplaza"`로 만들었는데, `culture_club_classes.brand`의
실제 값은 `"ak_plaza"`(언더스코어 포함, CHECK 제약과 동일)였다 — 다른
4개 브랜드는 external_id 접두사가 brand 값과 1:1로 일치해(emart/
lottemart/hyundai/shinsegae) 이 불일치가 드러나지 않았다. 실제로 지점
지오코딩+목록 배치를 전부 돌린 뒤 라이브 API(`/api/culture-club/search`)
를 직접 호출해 AK플라자 결과가 0건으로 누락되는 걸 재현 확인했고,
`EXTERNAL_ID_BRAND_ALIASES`로 이 한 가지 예외만 명시적으로 보정했다
(다른 4개 브랜드가 쓰는 정규식은 그대로 둠).

## 검증
- `npx tsc --noEmit` / `npm run test`(299개 파일 3,043개 전체, AK플라자
  신규 테스트 포함) / `npm run build` 전부 통과. 빌드 결과물에
  `/api/culture-club/akplaza-stores` 라우트 포함 확인.
- 지점 지오코딩 실제 upsert: 4/4 성공(`open_spaces`에 `AKPLAZA_STORE_01~04`
  등록, `백화점문화센터` 카테고리).
- 목록 배치 실제 실행: 전체 수신 914건(분당 0/수원 576/평택 391/원주
  602) → 수강대상 필터 후 911건 중복제거 → 마감 237건 제외 → **674건
  upsert**.
- 라이브 API 호출로 실제 end-to-end 확인(`/api/culture-club/search?
  lat=37.2655&lng=127.0001&radius_km=20`): 수원 AK플라자 인근에서
  `ak_plaza` 219건이 거리순으로 정상 노출됨, `distance_meters`/
  `store_lat`/`store_lng` 모두 정상.
- 상세정보(소개 텍스트) 수집: 674건 대상 1회성 배치 실행(백그라운드).

## 특이 사항
- `getReviewList`(사용자가 함께 캡처해준 URL)는 수집 범위에 포함하지
  않았다 — 다른 4개 브랜드도 후기(리뷰)를 수집하지 않고 있어 일관성을
  위해 이번에도 범위 밖으로 둔다(Spec 밖 기능 추가 금지, 제7장 제1조).
  필요하면 별도 지시로 범위를 넓힌다.
- 분당점(01)이 현재 0건인 것이 "폐점"인지 "일시적으로 개설 강좌 없음"
  인지는 사이트에서 폐점 공지를 찾지 못해 단정하지 않았다 — 배치는
  매번 4개 지점을 전부 순회하므로, 나중에 분당점에 강좌가 생기면 자동
  으로 수집된다.
