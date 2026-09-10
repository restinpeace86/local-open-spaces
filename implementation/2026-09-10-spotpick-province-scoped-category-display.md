# 스팟픽 노출 중분류 데이터를 현재 위치의 도(道) 단위로 제한 — 개선사항2-5 나머지 / Step 99 / Decision 023

## 구현 대상
`implementation/todo.md` 개선사항2-5의 지도 마커 부분 + 사용자 후속 지시:
"반경 컷오프(10/20/30km) 폐지는 유지하되, 노출 중분류를 선택해서 보여주는
데이터는 현재 설정한 위치가 포함하는 도 단위로 제한. 판교원로 68 →
경기도 + 서울시. 강릉 → 강원도."

이전에 "도 전역 노출" Decision 022와 상충한다고 스킵했으나, 사용자가 이번에
명시적 판단(도 단위 제한 + 경기·서울 특례)을 제공해 **Decision 023**으로 기록하고
구현했다.

## 구현 일시
2026-09-10

## 변경 사항
### `project/decision-log.md` — Decision 023 신규
반경 컷오프 폐지는 유지, 노출 중분류 데이터 범위를 "전국" → "현재 위치의 광역
(도/광역시)"으로 축소. 경기 ↔ 서울 상호 포함, 판별 불가 시 필터 미적용(폴백).
RPC 변경 없이 클라이언트 필터.

### `spec/map/spatial-search.md` §2.1 개정 (Updated by Decision 022, 023)

### `src/lib/spaces/province.ts` (신규, 순수 함수)
- `getProvinceFromText(text)`: 주소/시군구명 앞 토큰의 광역 표기를 17개 정규 광역
  (`서울`/`경기`/`강원`/…)으로 정규화. 장/단축형·공백 변형 모두 처리
  (DB `normalize_address_region_prefix`와 동일 규약). 실측 이상 데이터
  "전남광주통합특별시" → `광주`.
- `getVisibleProvinces(province)`: `경기`→`['경기','서울']`, `서울`→`['서울','경기']`,
  그 외 → `[self]`, `null`→`null`(필터 없음).
- `isSpotInProvinces(address, sigunguName, provinces)`: 광역 판별 실패 시 보수적
  포함(true) — 근거 없이 스팟을 숨기지 않는다(제3장 제5조).

### `src/components/map/map-explorer.tsx`
- `currentProvince = getProvinceFromText(addressName) ?? getProvinceFromText(sigunguName)`.
- `provinceScopedCategoryItems` useMemo — `visibleProvinces`가 있으면
  `categoryItems`를 `isSpotInProvinces`로 필터. `baseItems`(→ 지도 마커/데스크톱
  리스트/바텀시트) 및 `isEmptyByFilter`가 이 값을 사용.
- 반경 컷오프/바텀시트 반경 로직은 그대로(Step 93 폴백 포함).

### 테스트
- `src/lib/spaces/province.test.ts` +15 (정규화/특례/폴백).
- `src/components/map/map-explorer.test.tsx` +2 (경기→경기+서울, 강원→강원만).
  `useUserLocation`을 모듈 모킹(기본값 위치 미설정 → 기존 테스트 무영향).

## 검증
- `npx tsc --noEmit` 통과.
- `npm run test`: 127 파일 1457건 통과.
- `npm run build`: Compiled successfully.

## 후속 (범위 밖)
- 대분류 바텀시트의 노출 중분류별 카운트(`/api/nearby/service-categories`)는
  아직 전국 카운트 — 광역 스코프 카운트로 맞추면 "12건인데 눌러보니 우리 도엔
  0건"인 경우를 줄일 수 있다. Decision 023 영향란에도 후속으로 명시.
