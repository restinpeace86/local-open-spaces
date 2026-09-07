# open_spaces 목록 — "큐레이션이 아직 없는 행만 보기" 필터 추가

## 구현 대상
사용자 지시: "그리고 이제 노출 중분류가 아직 없는 행만보기 뿐만아니라
큐레이션이 아직 없는 행만보기도 추가해줘 검색조건에... 현재 표준중분류 /
노출중분류는 되어있는데 큐레이션이 없는것들 구분이 안되거든? 1차적으로
여러건에 대하여 한번에 표준중분류 노출중분류 했으면 이제 큐레이션쪽
해야지ㅣ.. 뱃지다는거.."

## 구현 일시
2026-09-07

## 배경
직전 작업([[2026-09-07-open-spaces-column-cleanup-and-bulk-edit]])에서
체크박스로 여러 건을 골라 표준 중분류/노출 중분류를 한 번에 반영하는 기능을
만들었다 — 이제 그 다음 단계로 "노출 중분류는 이미 채워졌지만 아직 블로그
검색/뱃지 태깅(큐레이션)을 안 한" 행들을 걸러 보고 싶다는 요청이다. 큐레이션
(blog_url/뱃지)은 `open_spaces`가 아니라 별도 테이블 `spot_curations`
(spot_id로 연결)에 저장되므로, 기존 "노출 중분류 미지정만 보기"처럼
open_spaces 컬럼 하나로는 걸러낼 수 없다.

## 변경 사항
- `src/app/api/admin/data-grid/route.ts`: `only_uncurated=true` 파라미터
  추가. `spot_curations.spot_id` 전체를 먼저 조회한 뒤(실측: 116건 —
  작은 규모), `open_spaces.id`가 그 목록에 없는 행만 남긴다
  (`.not('id', 'in', ...)`). 기존 `only_unmapped`/`only_mapped`와 동일한
  범위(메인 쿼리 빌더 경로에만 적용, SEOUL_YEYAK 서브셋 경로는 대상 아님)로
  뒀다.
- `src/components/admin/data-grid-client.tsx`: "노출 중분류(service_
  category_id)가 아직 없는 행만 보기" 체크박스 바로 아래 "큐레이션(블로그/
  뱃지)이 아직 없는 행만 보기" 체크박스를 추가했다(open_spaces 탭 전용,
  즉시 반영 — 기존 체크박스와 동일 관례). 두 체크박스는 독립적이라 동시에
  켜서 "노출 중분류는 있는데 큐레이션은 아직 없는" 행만 볼 수도 있다.

## 검증(실측)
- `EXPLAIN (analyze, buffers)`로 실제 쿼리 성능 확인:
  - `only_uncurated`만 켰을 때: 0.29ms(대부분의 행이 아직 미큐레이션이라
    거의 즉시 매칭됨).
  - `only_mapped` + `only_uncurated` 함께 켰을 때(실제 다음 작업 흐름):
    175ms — 8초 제한 대비 충분히 빠름.
- `src/components/admin/data-grid-client.test.tsx`: 신규 3건(체크박스 노출
  + only_uncurated=true 조회, 노출 중분류 필터와 함께 켜면 두 파라미터 모두
  실림, events 탭엔 체크박스 없음).
- `npx tsc --noEmit` / `npm run test`(115개 파일, 1286개 테스트) /
  `npm run build` 전체 통과.

## 특이 사항 — 알려진 확장성 한계
`spot_curations` 전체 spot_id를 애플리케이션 레벨에서 조회해 `NOT IN`
목록으로 구성하는 방식은 현재 규모(116건)에서는 충분히 빠르지만, 큐레이션
건수가 수천 건 이상으로 늘어나면(URL 길이/조회 비용) JOIN 기반 RPC로
바꿔야 할 수 있다 — `count: 'estimated'` 등 이 프로젝트가 이미 채택한
"현재 규모에서 충분히 빠르면 단순한 방식을 우선한다"는 트레이드오프와
동일한 판단이다(제3장 제3조 MVP 우선, 제5장 제4조 기존 구조 우선).
