# 블로그 검색 정렬 기준(sim/date) 화면 전환 기능

## 구현 대상
사용자 지시(같은 턴 중 이어진 추가 요청): "현재는 그런데 나중에는 sim 기준으로도
변경할수있도록 해... 아니면 내가 화면에서 sim / date 기준 변경해서도 호출할수
있게하던가.. default는 date로 하고" — 방금 date로 완전 교체한 정렬 기준을,
관리자가 필요하면 화면에서 sim으로 즉시 바꿔 다시 검색할 수 있게 해달라는 요청.

## 구현 일시
2026-09-06

## 변경 사항
- `src/lib/admin/naver-blog-search.ts`: `resolveBlogSort(requested: string | null)`
  (신규, 순수 함수) — `sim`/`date` 중 하나면 그대로, 아니면(오타/누락/알 수 없는
  값) 추측하지 않고 기본값 `date`로 되돌린다. 이 프로젝트는 route.ts를 직접
  테스트하지 않는 관례라(로직을 순수 함수로 빼서 테스트) 검증 로직을 여기로 뺐다.
- `src/app/api/admin/spot-curations/blog-search/route.ts`: `sort`를 하드코딩된
  `'date'`에서 클라이언트가 넘긴 `?sort=` 쿼리 파라미터(`resolveBlogSort`로 검증)로
  교체.
- `src/lib/admin/use-spot-curation-form.ts`: `sortOption` 상태(기본값 `'date'`)
  추가. `runSearch(query, sort = sortOption)`로 확장해 "다시 검색"은 현재 정렬을
  유지하고, `setSortOption(next)`는 정렬을 바꾸는 즉시 새 정렬로 재검색한다(상태
  갱신이 비동기라 값을 직접 넘겨 최신 값으로 재검색).
- `src/components/admin/blog-reference-viewer.tsx`: "최신순/정확도순" 토글
  버튼 추가(검색어 입력 바로 아래) — 누르면 즉시 재검색.
- `BlogCurationModal`/`MobileCurationWorkbench`: `sortOption`/`onSortOptionChange`를
  훅에서 뷰어로 그대로 전달.

## 검증
- `npx tsc --noEmit` 통과.
- `npm run test`: 115개 파일 / 1207개 테스트(기존 1203 + 신규 4: resolveBlogSort
  2, 정렬 토글 UI 2) 전체 통과.
- `npm run build` 통과.
- **실제 네트워크 재현**(dev 서버): `sort` 파라미터 없이 호출 → date 기본값으로
  정확한 최신 리뷰 반환, `sort=sim` 명시 호출 → (실측 확인된) 스팸 결과가 다시
  나옴(토글이 실제로 다른 API 결과를 만든다는 것을 확인), `sort=bogus`(알 수 없는
  값) → 추측하지 않고 date로 안전하게 폴백함을 확인.

## 특이 사항
- 토글 버튼 라벨은 API 파라미터 값(`sim`/`date`) 대신 관리자가 바로 이해할 수
  있는 한글("최신순"/"정확도순")로 표기했다 — 어제(Decision 021 8항) 확인한
  대로 지금은 `sim`(정확도순)이 실제로는 저품질이라는 걸 관리자가 알아야
  의미 있게 활용할 수 있어, 필요하면 두 라벨 옆에 품질 안내를 추가하는 것도
  고려할 수 있지만 이번 범위에서는 토글 자체만 우선 제공했다.
