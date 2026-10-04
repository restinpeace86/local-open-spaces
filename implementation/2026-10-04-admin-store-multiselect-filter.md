# 이마트/롯데마트 관리자 패널 지점별 다중선택 필터

## 구현 대상
사용자 지시(2026-10-04): "관리자화면에서 이마트 컬처클럽하고 롯데마트
문화센터 관련해서 지점별로도 보는거 가능하게좀 필터조건 추가해줘.. 전체도
다볼수 있지만 지점별 (복수선택 가능)으로도 볼수있는 조건 추가"

## 변경 사항
- `src/components/admin/store-multiselect.tsx`(신규, 공용 컴포넌트): 검색
  가능한 체크박스 드롭다운. 지점이 60개 이상이라 펼쳐두지 않고 버튼("전체
  지점" / "지점 N개 선택")을 눌러야 열린다. 지점 목록 자체는 각 패널이
  이미 있는 공개 지점 API에서 받아 prop으로 넘긴다(새 조회 경로를 만들지
  않음 — 제5장 제4조).
- `src/components/admin/emart-culture-club-panel.tsx`: 마운트 시
  `/api/culture-club/stores`(기존 공개 API, open_spaces 기반 64개 지점)를
  조회해 `StoreMultiSelect`에 넘긴다. 선택된 지점 코드를 콤마로 묶어
  `store_code` 쿼리 파라미터로 전달.
- `src/components/admin/lottemart-culture-club-panel.tsx`: 동일한 방식으로
  `/api/culture-club/lottemart-stores`(기존 공개 API, 수집 데이터 기반 60개
  지점) 사용.
- `src/app/api/admin/emart-culture-club/route.ts` /
  `src/app/api/admin/lottemart-culture-club/route.ts`: `store_code` 파라미터
  처리를 단일 `.eq()`에서 콤마 구분 다중값 `.in()`으로 확장(쿼리 파라미터
  이름은 그대로 유지해 하위 호환).

## 검증
- `npx tsc --noEmit` / `npm run test`(267개 파일 2,791개, 신규 6개 포함) /
  `npm run build` 전부 통과.
- 기존 이마트 패널 테스트 2개가 깨졌었다(마운트 시 지점 목록을 먼저
  조회하게 되면서 `fetch` 호출 순서가 바뀜) — 안내 문구 텍스트 갱신 +
  "조회하기" 클릭으로 발생한 마지막 호출만 검사하도록 수정.
- 개발 서버 + Playwright로 실제 화면 확인: 롯데마트 탭에서 고양점+송파점
  2개 지점 선택 → 조회하기 → "총 388건"으로 정확히 좁혀짐을 확인(전체
  15,101건 중).

## 특이 사항
- 이마트 지점 목록은 open_spaces 기반(64개, 지역 접미사 포함), 롯데마트는
  수집 데이터 기반(60개, 지역 접미사 없음) — 서로 출처가 다르지만 둘 다
  `{storeCode, label}` 형태로 이미 통일돼 있어 공용 컴포넌트가 그대로
  재사용 가능했다.
