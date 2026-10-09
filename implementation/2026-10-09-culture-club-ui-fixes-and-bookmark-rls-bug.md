# 문화센터 UI 4건 수정 + 찜 버튼 무반응 RLS 버그 수정

## 구현 대상
사용자 지적(2026-10-09): "이거 검색조건에 2줄로 되도 되니깐 글이 세로로
안나오게 하자 그리고 이마트, 롯데마트 , 현대백화점, 신세계 AK플라자,
스타필드 롯데백화점 이랜드리테일로 문화센터는 다 빼... 너무 길어져
그리고 이마트 눌렀을때 왜 이마트 분당점 (경기 성남시) 2.4km 이렇게
나와 ? 일단 이마트 분당점 2.4km만나오던가... 그리고 각 목록 리스트에
원래는 이마트 분당점 이렇게 나왔는데 그냥 분당 2.4km 이렇게만나오네...
그리고 찜눌렀는데 반응이없는거같아.. 색깔 칠이 안되는데 ? 눌러도 ?"

## 구현 일시
2026-10-09

## 실측 확인 — 원인 5가지

### 1) 브랜드 필터 pill 글자가 세로로 깨짐
`culture-club-tab-view.tsx`의 브랜드 필터 컨테이너가 `flex items-center
gap-2`뿐이라(overflow-x-auto도 flex-wrap도 없음) 8개 브랜드가 한 줄에
안 들어가자 기본 flex-shrink가 pill 하나하나를 짜부라뜨렸고, 그 안의
한글 텍스트가 공백 없이 세로로 줄바꿈됐다. 컨테이너에 `flex-wrap`,
각 버튼에 `shrink-0 whitespace-nowrap`을 줘서 pill 단위로 다음 줄로
넘어가게 고쳤다(가로 스크롤 대신 2줄 허용 — 사용자 지시 그대로).

### 2) 브랜드 라벨이 너무 길다
`CULTURE_CLUB_BRAND_OPTIONS`/`BRAND_LABELS`의 라벨이 브랜드마다 다른
접미사(컬처클럽/문화센터/아카데미/문화아카데미)를 달고 있었다 — 이미
"문화센터" 탭 안이라 접미사가 중복 정보였다. 8개 전부 순수 브랜드명만
쓰도록 줄였다(이마트/롯데마트/현대백화점/신세계/AK플라자/스타필드/
롯데백화점/이랜드리테일).

### 3) 지점 선택 뱃지에 지역 표기가 중복으로 붙어 길어짐
`/api/culture-club/*-stores` 7개 라우트(stores/hyundai-stores/
shinsegae-stores/akplaza-stores/starfield-stores/lotte-department-
stores/eland-retail-stores)가 2026-10-03에 만든 "지점명 (지역)" 포맷을
그대로 쓰고 있었다. 당시엔 지점명만으론 위치를 알기 어렵다는 이유였는데,
이후 뱃지에 실제 거리(km)가 같이 붙게 되면서 지역 표기가 중복 정보가
됐다 — 7개 라우트 전부에서 지역 표기(`extractShortRegion`)를 제거하고
지점명만 쓰도록 통일했다(lottemart-stores는 원래부터 정적 목록이라
지역 표기가 없어 영향 없음).

### 4) 목록 카드의 위치 줄에 브랜드가 안 보임
`culture_club_classes.store_name`은 원본 사이트 표기 그대로라 브랜드
접두사가 없는 경우가 많다(이마트 "분당", AK플라자 "분당", 스타필드
"수원" 등 — 같은 지명을 여러 브랜드가 쓸 수 있어 "분당"만 보면 어느
브랜드인지 알 수 없다). 2026-10-07에 "위치 줄이 브랜드/위치를 전달해
중복"이라는 이유로 브랜드 뱃지를 없앴었는데, 그 전제(위치 줄이 브랜드를
전달)가 실제로는 틀렸다(우연히 "롯데몰수지점"처럼 브랜드명이 지점명에
섞인 경우만 전제가 맞았을 뿐). 카드/상세시트의 위치 줄에
`formatStoreNameWithBrand()`로 짧은 브랜드명을 지점명 앞에 붙여
"이마트 분당"처럼 보이게 고쳤다.

### 5) 찜 버튼을 눌러도 색이 안 바뀜 — RLS가 조회를 막고 있었음(진짜 버그)
`src/lib/community/bookmarks.ts`의 `addBookmark`/`removeBookmark`가
브라우저의 `createClient()`(= `authenticated` 롤)로 먼저
`culture_club_classes`를 조회해 surrogate id를 알아낸다
(`resolveCultureClubClassId`). 그런데 실측 확인(`pg_policy` 직접 조회)
결과 이 테이블의 RLS 정책은 `service_role` 전용 하나뿐이었다(2026-10-06
통합 테이블 생성 시 등록) — `authenticated` 롤에는 SELECT 권한이 전혀
없어 이 조회가 매번 0건으로 막혀 `.single()`이 에러를 던졌다.
`bookmark-button.tsx`의 catch가 `BookmarkCapExceededError`가 아닌 일반
에러는 조용히 삼키게 되어 있어(제5장 제11조 — 서비스 중단 금지 취지)
찜 토글 state(`isBookmarked`)가 절대 안 바뀌었고, 사용자 입장에서는
"눌러도 색이 안 칠해지는" 것으로 보였다. 이 데이터는 이미
`/api/culture-club/search`가 공개로 노출하는 것과 동일해 민감하지
않으므로, `authenticated` 롤에 SELECT만 열어주는 정책을 추가했다(쓰기는
여전히 service_role 전용).

## DB 변경
`scripts/migrations/2026-10-09-culture-club-classes-authenticated-
select.sql`(적용 완료): `culture_club_classes_authenticated_select`
정책 추가(`for select to authenticated using (true)`).

## 변경 사항
- `src/components/home/culture-club-tab-view.tsx`: 브랜드 필터
  컨테이너에 `flex-wrap`, 버튼에 `shrink-0 whitespace-nowrap` 추가.
  `BRAND_LABELS` 5개 축약. `formatStoreNameWithBrand()` 신규 헬퍼 추가
  — 카드 위치 줄/상세시트 "접수가능지점" 줄에서 사용.
- `src/lib/home/culture-club-options.ts`: `CULTURE_CLUB_BRAND_OPTIONS`
  8개 브랜드 라벨 축약.
- `src/app/api/culture-club/{stores,hyundai-stores,shinsegae-stores,
  akplaza-stores,starfield-stores,lotte-department-stores,eland-
  retail-stores}/route.ts`(7개): `extractShortRegion` 제거, select
  컬럼에서 `address` 제거, `label`을 지점명만으로 단순화.
- 위 7개의 `route.test.ts`: 지역 표기 검증 테스트를 지점명만 검증하도록
  수정(지역 없음 테스트는 의미가 없어져 제거).
- `src/components/home/culture-club-tab-view.test.tsx` /
  `src/components/home/home-view.test.tsx`: 축약된 브랜드 라벨/상세시트
  제목 텍스트에 맞춰 테스트 문자열 수정. 카드 위치 줄과 지점 뱃지가 이제
  같은 텍스트("이마트 춘천점")를 공유하게 되어, `aria-pressed` 속성으로
  뱃지만 구분하도록 1건을 `waitFor` 기반으로 재작성(카드는 캐시에서 즉시
  렌더되지만 뱃지는 비동기 지점 목록 조회 이후에 나타나는 타이밍 차이
  고려).

## 검증
- `npx tsc --noEmit` / `npm run test -- --run`(314개 파일 **3,169개**,
  지역 표기 제거로 1건 감소 — 의미 없어진 테스트 제거) / `npm run build`
  전부 통과.
- 라이브 API 호출로 확인: `/api/culture-club/stores?lat=37.3947&
  lng=127.1086&radius_km=15` → "이마트 분당점"(지역 표기 없음),
  `/api/culture-club/hyundai-stores` → "현대백화점 가든파이브" 등 7개
  라우트 전부 지역 표기 제거 확인. `/api/culture-club/search?
  brand=emart&store_codes=250` → 96건 전부 OPEN(CLOSED 필터 여전히
  정상), `store_name`은 DB 원본 그대로 "분당"(브랜드 접두사는 프론트엔드
  렌더링 시점에만 붙음, API 응답 자체는 변경 없음).
- 찜 버튼 RLS 수정은 `pg_policy` 직접 조회로 정책 추가만 확인했다 —
  실제 브라우저 로그인 세션으로의 클릭 테스트는 이 환경에서 직접
  수행하지 못했다(라이브 사용자 인증 플로우 필요) — 코드/RLS 레벨 원인
  분석과 수정은 확정적이나, 최종 체감 확인은 사용자가 직접 재현해줘야
  한다.

## 특이 사항
- 관리자 패널(`culture-club-panel.tsx`)의 브랜드 라벨은 이번 범위에
  포함하지 않았다(사용자 지적은 이벤트픽 문화센터 탭 — 사용자 노출 화면
  한정, 관리자 화면은 별도 로컬 상수를 쓰고 있어 건드리지 않음).
- `formatStoreNameWithBrand()`는 이랜드리테일처럼 실제 건물 상호가
  "이랜드리테일"로 시작하지 않는 브랜드(NC백화점/뉴코아아울렛)에선 지점
  선택 뱃지의 실제 건물명과 100% 일치하지 않는다("이랜드리테일 부천"
  vs 뱃지의 "NC백화점 부천점") — 그래도 브랜드 식별 자체는 명확해지므로
  수용 가능한 수준으로 판단했다.
