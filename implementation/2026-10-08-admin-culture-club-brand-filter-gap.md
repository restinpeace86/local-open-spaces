# 관리자 문화센터 화면 — 신세계/현대백화점 브랜드·지점 필터 누락 수정

## 구현 대상
사용자 지적(2026-10-08): "그리고 관리자 화면도 이마트랑 롯데마트밖에없네
조건이? 신세계랑 현백 필터링조건이 없는데?"

## 구현 일시
2026-10-08

## 근본 원인
`culture-club-panel.tsx`의 `Brand` 타입은 이미 `'shinsegae' | 'hyundai'`
를 포함하고 있었지만, 화면에 실제로 렌더되는 `BRAND_OPTIONS` 상수(브랜드
선택 pill)와 지점 선택 드롭다운에 쓰일 지점 목록(fetch)이 여전히
이마트/롯데마트 2개만 등록돼 있었다 — 두 브랜드가 추가된 날(2026-10-08)
데이터 수집/노출 버그(`implementation/2026-10-08-culture-club-
department-store-visibility-fix.md`)는 고쳤지만, 관리자 화면의 필터 UI
갱신은 그 작업에 포함되지 않았다(별개 화면이라 누락).

## 변경 사항
- `src/components/admin/culture-club-panel.tsx`: `BRAND_OPTIONS`에
  `신세계 아카데미`/`현대백화점` 추가. 지점 목록 fetch(Promise.all)에
  신세계/현대백화점 지점 API 호출을 추가하고 `shinsegae:${storeCode}`/
  `hyundai:${storeCode}` 복합 키로 네임스페이스 구분(기존 이마트/롯데마트
  방식과 동일).
- `src/app/api/culture-club/shinsegae-stores/route.ts`(신규),
  `src/app/api/culture-club/hyundai-stores/route.ts`(신규): 기존
  `/api/culture-club/stores`(이마트)와 동일한 패턴 — 오늘 이미 지오코딩
  등록된 `open_spaces`의 `SHINSEGAE_STORE_*`(12건)/`HYUNDAI_STORE_*`
  (10건) 행을 조회해 지점 목록을 돌려준다. 백엔드(`/api/admin/culture-
  club`)는 이미 `brand`/`store` 파라미터를 브랜드에 무관하게 범용으로
  처리하고 있어(`brand.in([...])`, `${brand}:${storeCode}` 복합 조건)
  별도 수정이 필요 없었다.

## 검증
- `npx tsc --noEmit` / `npm run test`(294개 파일 **3,005개**, 신규
  `shinsegae-stores`/`hyundai-stores` 라우트 테스트 4개 + 관리자 패널
  브랜드 pill 테스트 1개 포함) / `npm run build` 전부 통과. 빌드 결과물에
  `/api/culture-club/shinsegae-stores`, `/api/culture-club/hyundai-
  stores` 두 라우트가 정상 포함됨을 확인.
- `culture-club-panel.test.tsx`에 "신세계/현대백화점 브랜드 pill도
  선택 가능하고 조회 요청에 반영된다" 테스트 추가 — pill 클릭 시
  `/api/admin/culture-club?...brand=shinsegae%2Chyundai...` 쿼리가
  실제로 발행되는지 검증.

## 특이 사항
- 이번 수정은 **관리자 화면**의 브랜드/지점 필터 조건에 한정된다.
  일반 사용자 화면(이벤트픽 문화센터 탭)의 신세계/현대백화점 지점
  뱃지 드릴다운은 Decision 029(`project/decision-log.md`)에 따라 아직
  의도적으로 미구현 상태로 남아있다(`culture-club-tab-view.tsx`의
  "전용 지점 목록 API가 아직 없다" 주석 참고) — 오늘 범위는 사용자가
  명시한 "관리자 화면" 쪽만이며, 일반 사용자 화면 쪽 드릴다운 구현은
  별도 지시가 필요하다(추측 금지, 제3장 제5조).
