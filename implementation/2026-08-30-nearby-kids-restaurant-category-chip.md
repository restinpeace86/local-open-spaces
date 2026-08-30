# [개발 요청] 스팟픽(/nearby) 중분류 필터에 "키즈친화 식당" 칩 누락 수정

## 구현 일시
2026-08-30

## 요구사항
스팟픽 화면 중분류 필터에 이번에 새로 수집한 "키즈친화 음식점" 데이터를 보여줄
칩이 왜 없는지 확인하고 추가.

## 원인
"경기 키즈카페/놀이시설 휴게음식점 수집 어댑터 구축"(`scripts/ingest/adapters/
gg-kidscafe-adapter.mjs`)이 경기데이터드림 Resrestrtkidscafe API를 통해
`category_min='놀이방식당'`(놀이시설을 갖춘 음식점 전체 — 어댑터 자체 조사 결과
특정 업종으로 세분화할 근거가 없어 소스 전체를 하나의 값으로 묶은 것, `is_kids_
friendly=true` 고정)으로 이미 데이터를 적재하고 있었다. 실측 확인 결과 현재
`open_spaces`에 **1,788건**이 존재한다.

그런데 스팟픽 화면의 중분류 필터 칩 목록(`src/lib/spaces/spot-category-groups.ts`
의 `CORE_SPOT_CATEGORIES`)은 2026-08-29 "나들이 전용 핵심 중분류 1단 필터 개편"
때 정해진 목록 그대로였고, 그 시점에는 이 어댑터가 아직 없어(또는 새 칩으로
명시되지 않아) `놀이방식당`에 대응하는 칩이 빠져 있었다 — 즉 실제 DB에는 데이터가
1,788건이나 있는데 화면에서는 중분류로 찾아볼 방법이 전혀 없는 상태였다.

## 조치
`src/lib/spaces/spot-category-groups.ts`의 `CORE_SPOT_CATEGORIES`에 신규 칩을
추가했다.

```ts
{ id: 'kids-restaurant', label: '키즈친화 식당', emoji: '🍽️', minors: ['놀이방식당'] }
```

`minors` 값은 실제 DB에 존재하는 `category_min` 값을 그대로 썼다(추측 금지 —
`select count(*) from open_spaces where category_min='놀이방식당'`로 1,788건을
직접 확인). 다른 칩의 필터/선택 로직(`map-explorer.tsx`, `spot-category-filter.tsx`)
은 이미 `CORE_SPOT_CATEGORIES` 배열을 순회하는 구조라 이 배열에 항목을 추가하는
것만으로 자동으로 칩이 노출되고 기존 단일 선택/AI 추천 로직에도 그대로 편입된다
(코드 변경 없음, 데이터만 추가).

## 검증

### 코드 검증
- `npx tsc --noEmit` 통과.
- `npm run test`(71파일 724건 — `spot-category-groups.test.ts`에 칩 개수
  11→12 갱신 + "키즈친화 식당(놀이방식당) 칩이 존재한다" 신규 검증 1건 추가) 통과.
- `npm run build` 통과.

### 실측 검증(로컬 개발 서버, 프로덕션 DB)
- `open_spaces`에서 `category_min='놀이방식당'` 1,788건, 샘플 5건 모두
  `is_kids_friendly=true`, `source_type='GG_KIDSCAFE'`임을 직접 조회로 확인.
- Playwright로 실제 `/nearby` 페이지를 렌더링해 "키즈친화 식당" 칩이 실제로
  DOM에 노출됨을 확인.
