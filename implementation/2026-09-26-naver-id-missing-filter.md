# open_spaces "네이버 ID 없는 행만 보기" 필터 + 3개 필터 한 줄 정렬

## 구현 대상
사용자 지시(2026-09-26): "open_spaces쪽에 검색조건에 대하여.. 네이버 id가
아직 없는 행만 보기도 검색으로 알수 있게 좀 해줘... 그리고 노출 중분류
아직없는 행만보기 검색조건이랑 큐레이션이 아직 없는행만보기랑 네이버 ID가
없는 행만보기.. pc에서 봤을때 한 행에 있도록 나열해줘".

## 변경 사항

### 서버: `src/app/api/admin/data-grid/route.ts`
`only_without_naver_place_id` 쿼리 파라미터 추가 — 기존 `only_unmapped`
(`service_category_id is null`)와 완전히 동일한 관례(open_spaces 전용 단일
컬럼, JOIN 불필요)로 `naver_place_id is null` 조건을 건다. `only_uncurated`
(다른 테이블 spot_curations 조인이 필요해 더 복잡한 경로)와는 다르게, 이건
onlyUnmapped처럼 단순한 `.is()` 한 줄로 충분하다.

### 클라이언트: `src/components/admin/data-grid-client.tsx`
- `onlyWithoutNaverPlaceId` state 추가, 쿼리 파라미터 반영, 의존성 배열 추가,
  "검색조건 초기화" 핸들러에도 리셋 추가(기존 두 필터와 동일하게 누락 없이).
- **세 필터를 한 줄로 정렬**: 기존엔 "노출 중분류 없는 행만 보기"/"큐레이션
  없는 행만 보기" 체크박스가 각각 독립된 블록이라 세로로 쌓였다. 셋을
  `flex flex-wrap items-center gap-x-4 gap-y-1.5` 컨테이너로 묶어, PC처럼
  폭이 충분하면 한 줄로 나열되고 화면이 좁아지면(모바일) 자연스럽게
  줄바꿈되게 했다.

## 검증
- `src/components/admin/data-grid-client.test.tsx`에 신규 테스트 3개: 체크박스
  노출 + `only_without_naver_place_id=true` 파라미터 반영, events 탭에는 안
  보임(open_spaces 전용), 세 필터를 동시에 켜도 파라미터가 전부 실린다.
- `npx tsc --noEmit` / `npm run test`(203개 파일 2,370개) / `npm run build`
  모두 통과.

## 특이 사항
- 이 필터는 기존 두 필터와 동일한 한계를 그대로 물려받는다 — MINCLASSNM/
  SVCSTATNM 서브셋 조회 경로(`queryOpenSpacesViaSourceSubset`)에는 적용되지
  않는다(기존 `only_unmapped`/`only_uncurated`도 그 경로엔 안 감, 제5장
  제4조로 동일한 기존 한계를 그대로 따름).
