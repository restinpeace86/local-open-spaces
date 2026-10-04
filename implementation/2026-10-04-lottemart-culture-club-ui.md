# 롯데마트 문화센터 공개 화면 + 찜 연동

## 구현 대상
사용자 지시(2026-10-04, `reference/lottemart culture.png` / `reference/lottemart
culture detail.png` 참고): "해당 구조 참조하여 하면 되지 않을까 싶은데 여기에
필요한 데이터들 보면 목록리스트는 강좌명 개강일/요일/시간, 수강료 접수상태/
수강신청 있네 ... 강좌명에는 제목이랑, 분류랑 연령 대상이 있네 ... 바로 신청
이거 신청하러가는건 url 확인해봐야돼 ... 우리껀 찜 목록 필요해 장바구니는
필요없고 ... 수강료쪽엔 가격만 있는게 아니고 4회 28,000원 처럼 횟수도 있네".

## 실측으로 확인한 사실
- **접수기간 존재 여부**: "접수가능/접수준비" 필터 버킷(search_reg_status='1')이
  UI상 있지만, 13개 지점 × 대상 조합으로 약 220건을 전수 조사한 결과 전부
  이미 "바로신청"(= 접수가능) 상태였고 "접수준비"(아직 안 열림) 사례는 단 한
  건도 없었다 — 이마트의 "접수대기 0건" 실측 결과와 동일한 결론. 접수 시작을
  기다리는 알람 기능은 (현재 관측 가능한 데이터 범위에서는) 적용 대상이 없다.
  상세 화면의 "강좌기간"(예: 2026.10.08~2026.11.26)은 접수기간이 아니라
  강좌 운영 기간이다.
- **"바로신청" URL**: `fn_courseApp()`는 로그인 세션 확인 → 서버의
  `getBuyTime.json` 호출로 당일 접수 가능 시간대 확인을 거친 뒤에야
  `selectCoursePaymentInfo.do`(결제 페이지)로 이동한다 — 비로그인 상태로 그
  결제 URL에 바로 링크하면 깨진다. 로그인 여부와 무관하게 항상 정상 동작하는
  공개 페이지는 검색 상세 페이지(`courseview.do`)다 — 최소 파라미터
  (`search_str_cd`, `cls_cd`, `search_term_cd`, `search_cls_target`)만으로
  동작함을 실측 확인했다. 이마트의 "클래스 신청하러 가기"와 동일한 역할로 이
  URL을 쓴다(`buildLottemartCourseViewUrl`).
- 사용자가 설명한 "접수마감과 대기자 신청 버튼이 같이" 뜨는 현상과 "랄랄라
  코알라 여러개" 현상 둘 다 재확인 완료(별도 메시지로 이미 보고함) — 버그
  아니라 실제 사이트 구조.

## 변경 사항
- `scripts/migrations/2026-10-04-user-bookmarks-lottemart-class.sql`(신규,
  적용 완료): `user_bookmarks.lottemart_class_id` 4번째 nullable FK 추가,
  `num_nonnulls(...)=1` 체크를 4-way로 확장. 이마트와 달리 접수 시작 알람
  대상이 아니므로(위 실측 참고) 예약-알람 캡(`DEFAULT_EVENT_BOOKMARK_CAP`)
  대상에서는 제외했다 — 캡의 취지가 "알람 무분별 등록 방지"인데 알람
  메커니즘 자체가 없는 대상까지 캡을 걸 이유가 없다.
- `src/lib/community/bookmarks.ts`: `BookmarkTarget`에 `lottemart_class` 추가,
  insert/delete/목록조회/찜상태조회 전부 4-way로 확장.
- `src/components/community/bookmark-button.tsx`: `isBookmarkedFor` 4-way
  확장.
- `src/components/favorites/favorites-view.tsx`: 탭을 5개로 늘리지 않고
  이마트+롯데마트 찜을 "찜한 문화센터" 한 탭에 합산(사용자 확인: "비슷하게
  보여줄수 있는 만큼만 화면에서 어레인지").
- `src/lib/home/culture-club-options.ts`: `CULTURE_CLUB_BRAND_OPTIONS`에
  `lottemart` 추가, `LOTTEMART_TARGET_OPTIONS`(어린이청소년/유아/엄마와함께),
  `buildLottemartCourseViewUrl()` 추가.
- `src/app/api/culture-club/lottemart-stores/route.ts`(신규): 이마트와 달리
  롯데마트 지점은 아직 open_spaces에 등록되지 않아(별도 지오코딩 작업 필요,
  이번 범위 아님) `lottemart_culture_club_classes`에서 distinct store_code/
  store_name을 직접 뽑는다.
- `src/app/api/culture-club/lottemart-classes/route.ts`(신규): store_code
  필수 단일, target_code/days 다중선택 OR, `is_excluded=false` 고정.
- `src/components/home/lottemart-culture-club-view.tsx`(신규): 지점 select +
  수강대상/요일 칩 + 그리드 + 상세시트. 카드/상세 모두 할인가 쌍
  (원가 취소선 + 할인가), 재료비 별도 표기, 접수상태 배지(바로신청/대기자
  신청/전화문의/접수마감 — 접수마감만 액션 비활성화), 찜 버튼, "OOO하러
  가기" 외부 링크(상태 라벨을 그대로 버튼 문구에 반영)를 포함한다.
- `src/components/home/culture-club-tab-view.tsx`: 기존 본문을
  `EmartCultureClubView`로 이름만 바꾸고, 새 `CultureClubTabView` 래퍼가
  브랜드 pill 클릭으로 `EmartCultureClubView`/`LottemartCultureClubView`를
  전환하도록 재구성(이전엔 브랜드 pill이 라벨 1개짜리 고정 표시였음).

## 검증
- `npx tsc --noEmit`: 통과(새 테이블/컬럼 반영 위해 `npm run gen:types` 선행
  실행 필요했음).
- `npm run test`: 전체(264개 파일 2,766개) 통과(신규 브랜드 전환 테스트 1개,
  찜 탭 병합 테스트 2개 포함).
- `npm run build`: 통과.
- **실제 라이브 수집 1회 전체 실행**(60개 지점 전부, dry-run 아님) — 15,111건
  수집/적재 완료. 과정에서 버그 하나 발견·수정: `lottemart-culture-club.mjs`에
  `loadEnv()` 호출이 빠져 있어 로컬 실행 시 `.env.local`을 못 읽고 Supabase
  업서트 단계에서 실패했다(스크레이핑 자체는 60개 지점 전부 정상 완료,
  DB 쓰기만 실패). GitHub Actions에서는 시크릿이 `env:`로 직접 주입돼 영향
  없었을 것으로 보이지만, 다른 모든 ingest 스크립트와의 일관성 및 로컬
  디버깅을 위해 E-mart 스크립트와 동일하게 `loadEnv()`를 추가했다.
- **PostgREST 1,000행 기본 제한 재발견 및 수정**: `lottemart-stores` API가
  `.range()` 없이 조회해 15,111건 중 처음 1,000행만 받아와 지점이 5개만
  노출되는 문제를 실측으로 발견 — 이 세션에서 반복된 패턴(emart-culture-
  club.mjs의 fetchExistingClassIds 등)대로 페이지네이션 루프를 추가해
  60개 지점 전부 정상 노출되는 것을 확인했다.
- **개발 서버 + 실제 브라우저(Playwright)로 화면 직접 확인**: 브랜드 pill
  전환(이마트→롯데마트), 지점 select(고양점/MAXX영등포점), 수강대상 필터,
  카드(카테고리/연령/할인가 취소선/재료비 별도/접수상태 배지) 전부 실제
  데이터로 렌더링 확인. 상세 시트에서 접수마감 항목은 액션 버튼이 비활성
  문구로 나오고, 바로신청 항목은 실제 "바로신청하러 가기 ↗" 링크가
  `https://culture.lottemart.com/.../courseview.do?search_str_cd=103&
  cls_cd=20260310346122&search_term_cd=202603&search_cls_target=2` 형태로
  정확히 생성되는 것과 그 URL이 실제로 200을 반환하는 것까지 확인했다.

## 특이 사항
- 상세 화면은 리스트 단계에서 이미 수집한 필드만 사용한다(이마트 상세
  시트와 동일한 설계 — 재조회 없음). 화면 캡처에 있는 강좌기간(종료일)/
  강의실/첫시간준비물/강좌소개 본문은 리스트 응답에 없는 필드라 상세
  페이지를 별도로 긁어야 한다(이마트의 `emart-culture-club-detail.mjs`와
  같은 2단계 구조) — 이번 범위에는 포함하지 않았다. 필요하면 후속 지시로
  진행한다.
- 롯데마트 지점 선택지는 아직 지역 접미사가 없다(이마트는 open_spaces 등록
  후 "(경기 안성시)" 식으로 붙였음) — 롯데마트 지점의 open_spaces 등록은
  이번 범위 밖이라 지점명 원문 그대로 노출한다.
