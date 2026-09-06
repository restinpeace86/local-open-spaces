# 관리자 화면 4건 후속 조치 (필터 위치/성능 회귀/합치기 확인/HTML 미리보기)

## 구현 대상
사용자가 한 메시지에 4가지를 지적:
1. "노출중분류가 null 인거에 대하여 어디서 체크할수있도록 해놓은거야? open_spaces.
   에 안보이는데?"
2. "내가 지금식당쪽하고 있어서 중복 스팟 검수쪽은 모달팝업에서 합쳐진거 못봤는데
   합쳐진거 맞지?"
3. "왜 지금 아까까지만해도 조횧하던게 안보이지? 키즈/놀이시설의 어린이놀이시설
   (실내)때 0건나오고 canceling statement due to statement timeout 떠..아
   다시나오네"
4. events의 raw_data 원문에 있는 DTLCONT 같은 컬럼이 HTML로 인코딩돼 있어 보기
   불편하다 — 해당 필드만 클릭해서 HTML로 렌더링해 보고 닫을 수 있게 해달라.

## 구현 일시
2026-09-06

## 1. 노출 중분류 미지정 필터가 안 보임
어제(2026-09-06 낮) 이 필터를 `CategoryMappingPanel`의 `RowPicker`(별도
"노출 중분류 매핑" 탭 안의 하위 도구)에만 추가했는데, 사용자는 이걸 **open_spaces
탭 자체**(평소에 스팟을 둘러보는 메인 화면)에서 기대하고 있었다 — 실제로 거기엔
없었다.

### 수정
`src/components/admin/data-grid-client.tsx`: open_spaces 탭의 "표준 중분류
(category_min)" 필터 바로 아래에 "노출 중분류(service_category_id)가 아직 없는
행만 보기" 체크박스를 추가했다(기본값 꺼짐 — 메인 탭은 일반 열람 목적이라
opt-in). `/api/admin/data-grid`는 이미 어제 `only_unmapped` 파라미터를
지원하도록 고쳐둔 상태라 그대로 재사용했다.

## 2. "중복 스팟 검수 합쳐진거 맞지?" — 실측으로 직접 검증
`spot_dedup_groups` 테이블을 조회해보니 **완전히 비어 있었다** — 이 앱(구
SpotDedupPanel 포함)에서 지금까지 단 한 번도 실제로 병합이 완료된 적이
없었다는 뜻이다. 사용자가 시도했더라도 완료되지 않았거나(마지막 저장 버튼까지
안 눌렀거나), 애초에 그 스팟 근처에 진짜 중복 후보가 없어 "합치기" 버튼 자체가
안 떴을 가능성이 있다.

### 백엔드 동작은 직접 재현해 확인함(실제 데이터는 건드리지 않음)
임시 테스트용 스팟 2건을 만들어 `GroupDetailModal`이 호출하는 것과 똑같은
`POST /api/admin/spot-dedup/apply`를 직접 호출 → 200 응답, `spot_dedup_groups`에
새 행 생성, 두 스팟 모두 `standard_name`/`group_id` 정상 반영까지 확인했다.
백엔드 자체는 완전히 정상 동작한다. 검증 후 테스트 스팟 2건과 그 병합 기록은
즉시 삭제했다(실제 데이터에 영향 없음 — 삭제도 이번에 만든 `DELETE /api/admin/
open-spaces`로 직접 검증해봄).

### 진짜 문제 — 성공해도 확인할 방법이 없었음
기존 `SpotDedupPanel`도, 이번 `MobileCurationWorkbench`도 병합 성공 시 "목록/
배너에서 조용히 사라지는 것"만이 유일한 신호였다 — 명시적인 "합쳐졌습니다" 문구가
어디에도 없었다. 좁은 워크벤치 화면에서는 배너가 사라지는 것조차 알아채기 어렵다.

### 수정
`src/components/admin/mobile-curation-workbench.tsx`: 합치기 저장 성공
(`onSaved`) 시 `mergeSuccessMessage` 상태에
`✅ "{스팟명}"과(와) "{합칠 대상명}"을(를) 하나로 합쳤습니다.` 문구를 넣어
상단에 명시적으로 표시한다.

## 3. "아까까지 조회하던게 안 보이지.. timeout"
실측(EXPLAIN ANALYZE)으로 확인한 결과 **어제 추가한 `only_unmapped` 필터
자체가 새로운 성능 회귀를 만들었다**:

```
Index Scan using idx_open_spaces_created_at ...
  Filter: (service_category_id IS NULL) AND (category_min = '어린이놀이시설(실내)')
  Rows Removed by Filter: 53156
  Execution Time: 15310.325 ms
```

`category_min` + `service_category_id IS NULL` 조합 + `created_at` 정렬을 함께
지원하는 인덱스가 없어, 플래너가 정렬만 지원하는 `created_at` 인덱스를 골라
일치하지 않는 행 53,156건을 순서대로 걸러내며 스캔했다 — only_unmapped 없이
category_min만 쓰는 기존 조회는 계속 빨랐던 이유이기도 하다(이 조합만 새로
느려짐). 8초 statement_timeout에 걸려 실패했다가, 캐시가 데워지며 다음
시도부터는 통과하는 등 실측 그대로 재현됐다("0건 나오고 timeout.. 아 다시
나오네").

### 수정
`scripts/migrations/2026-09-06-open-spaces-category-min-unmapped-index.sql`
(적용 완료): `(category_min, created_at desc nulls last) WHERE service_category_id
IS NULL` 부분 인덱스 추가. RowPicker/메인 탭 둘 다의 실제 쿼리 패턴에 정확히
맞춘 인덱스라 크기도 작고(부분 인덱스), 필요한 곳에서만 쓰인다.

실측 재검증: 같은 쿼리 **15,310ms → 19ms**(약 800배 개선), 플랜도 새 인덱스를
바로 쓰는 것으로 확인. 실제 API 호출로도 재검증 완료.

## 4. events raw_data의 HTML 필드를 팝업으로 보기
`src/components/admin/raw-data-modal.tsx`:
- `looksLikeHtml(value)`: raw_data/raw_payload의 상위 필드 값이 HTML 태그를
  포함하는지 감지하는 순수 함수(`<br>`처럼 닫는 태그가 없는 경우도 잡도록 넓게
  판정 — 오탐은 무해함).
- raw_data가 평범한 객체일 때, HTML로 보이는 필드마다 "🔍 {필드명} HTML로 보기"
  버튼을 원문 JSON 블록 위에 나열한다.
- 신규 `HtmlFieldPreviewModal` 컴포넌트: 클릭한 필드의 값을
  `dangerouslySetInnerHTML`로 렌더링해 보여주고 닫기 버튼으로 닫는다. 이 값은
  이미 우리 파이프라인이 원천 그대로 수집해 DB에 저장해둔, **관리자만 보는
  디버그용 데이터**라(공개 화면 아님) 렌더링이 목적 자체이므로
  dangerouslySetInnerHTML 사용이 정당하다(외부 크롤링 텍스트를 안전하게
  하이라이팅해야 했던 블로그 큐레이션 케이스와는 성격이 다름). `white-space:
  pre-wrap`을 줘 원본의 `\r\n` 개행도 그대로 보이게 했다.

## 검증
- `npx tsc --noEmit` 통과.
- `npm run test`: 115개 파일 / 1226개 테스트(기존 1220 + 신규 6: 메인 탭
  체크박스 2, 합치기 완료 문구 1, HTML 미리보기 3) 전체 통과.
- `npm run build` 통과.
- 실측: `only_unmapped` 인덱스 추가 전/후 EXPLAIN 비교(15,310ms → 19ms),
  실제 API 재호출로 재확인. 합치기 백엔드는 테스트 데이터로 직접 재현해 검증
  후 즉시 원상복구(실제 데이터 영향 없음).

## 특이 사항
- "중복 스팟 검수가 합쳐졌는지"는 여전히 사용자가 실제로 어떤 스팟을 대상으로
  시도했는지 정확히는 알 수 없다 — `spot_dedup_groups`가 비어있던 시점 기준으로는
  "아직 완료된 병합이 없다"는 것만 확실하다. 이번에 추가한 완료 문구로 다음
  시도부터는 성공 여부가 명확해진다.
