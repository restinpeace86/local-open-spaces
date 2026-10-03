# 이벤트픽 "문화센터" 탭 (A)

## 구현 대상
사용자 지시(2026-10-03, 4개 기능 중 A): "'문화센터' 탭 화면 및 데이터 필터링
로직을 다음과 같이 설계·구현해줘 — 브랜드 선택(단일 세그먼트, 현재 이마트
뿐), 지점 선택(단일선택), 요일/카테고리 상태 필터(다중선택 OR), 무한스크롤."
Plan 승인 완료(2026-10-03) 후 구현. 구조 질문("스팟픽 drill-down과 같은
화면이냐")은 사용자 확인("스팟픽은 스팟픽꺼고 이벤트픽은 이벤트픽꺼") —
독립된 별개 화면으로 만든다.

## 변경 사항
### 신규 파일
- `src/lib/home/culture-club-options.ts`: 브랜드(1개, 배열 구조만 — 새
  테이블 없음)/카테고리(실측된 5개 실제 값)/요일 옵션 상수.
- `src/app/api/culture-club/stores/route.ts`: 지점 목록 — 원본
  `emart_culture_club_classes`(6,500여건)를 훑지 않고, 이미 지오코딩/브랜드
  정규화를 끝낸 `open_spaces`의 `EMART_STORE_*` 행(64건, 2026-10-03 "이마트
  지점 open_spaces 등록" 작업물)을 재사용한다(제5장 제4조) — external_id
  접두사를 벗겨 store_code를 복원, display_name을 라벨로 쓴다.
- `src/app/api/culture-club/classes/route.ts`: 강좌 목록. `store_code`
  필수(단일), `days`/`sub_category_name`는 콤마구분 다중값(`.overlaps()`/
  `.in()`으로 OR), `is_excluded=false` 항상 고정, `page`/`page_size`
  (`.range()`) 페이지네이션. 공개 라우트지만 테이블 RLS가 service-role
  전용이라 이 프로젝트 기존 관례(`events/today`, `nearby/service-
  categories`)대로 `createAdminClient()`를 서버에서만 쓴다.
- `src/components/home/culture-club-sheet.tsx`: `EventBrowseSheet`를
  구조적으로 본뜬 풀스크린 바텀시트 — 브랜드 라벨, 지점 네이티브
  `<select>`(가나다순 64개 평면), 요일/카테고리 칩(기존 비주얼 재사용, 선택
  로직은 `Set` 토글로 신규 작성 — 기존 칩은 전부 단일선택이라), 스크롤
  트리거 무한스크롤(`PAGE_SIZE=20`), 10번째마다 `null`을 반환하는
  `CultureClubAdSlot`(광고 자리 스캐폴딩, D 항목 — 실제 광고 없음).

### 수정 파일
- `src/components/home/home-view.tsx`: "🏫 문화센터 강좌 보러가기" 진입
  카드 추가(`isCultureClubOpen` 독립 state — 기존 `EventBrowseSheetMode`
  닫힌 유니온에 억지로 끼워넣지 않음), `MajorCategoryGrid` 섹션 **바로
  아래**에 배치(2026-09-03 결정 "대분류 그리드 최상단 배치"를 깨지 않도록 —
  처음엔 그 위에 뒀다가 `home-view.test.tsx`의 "카테고리별 행사가 항상
  index 0" 회귀 테스트가 실패해 발견하고 아래로 옮겼다).

## 검증
- `npx vitest run src/app/api/culture-club` 10개 통과(신규 — stores
  라우트 4개: 라벨 변환/display_name 폴백/접두사 불일치 방어/500 처리,
  classes 라우트 6개: 400/is_excluded 고정/overlaps·in 전달/range 계산/
  정상 응답/500 처리).
- `npx tsc --noEmit` / `npm run test`(258개 파일 2,709개) / `npm run build`
  (`/api/culture-club/classes`, `/api/culture-club/stores` 라우트 빌드
  출력에 포함 확인) 전부 통과.
- **실측 스모크 테스트**(라우트와 동일한 쿼리를 직접 실행): `/stores` 로직
  → 64개 지점 전부, 브랜드별 올바른 라벨("스타필드 안성점" 등) 확인.
  `/classes` 로직 → 982점(스타필드 안성) 전체 131건, 페이지당 20건,
  `is_excluded=true` 0건 유출 확인. 요일(토/일)+카테고리(Kids & Children류)
  OR 필터 조합 → 41건으로 정확히 좁혀짐, 결과 전부 조건 일치 확인.

## 특이 사항
- 지점 피커의 지역별 `<optgroup>` 그룹핑은 1차에서 보류했다(`store_center`
  컬럼이 지역이 아니라 브랜드 계열이라 트레이더스도 'emart'로 들어있어
  지역 그룹핑에 못 쓰고, 64개 수동 매핑은 과잉설계로 판단 — Plan 단계에서
  확정).
- 20개 캡(C 항목)의 DB 레벨(트리거) 강제는 하지 않았다 — "무분별한 등록
  방지"라는 취지상 UX 유도 장치로 판단, 클라이언트 체크만으로 충분하다고
  보고 진행(Plan 단계에서 명시).
