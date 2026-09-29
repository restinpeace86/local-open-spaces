# 관리자 데이터 그리드 — 주소 기준 정렬

## 구현 대상
todo.md [개선사항 1] (2026-09-29 등록): open_spaces 탭과 events 탭 데이터
그리드에 '주소(address)' 기준 정렬 기능 추가. 오름차순 ➔ 내림차순 ➔ 기본
정렬(None) 순으로 토글, 상태를 아이콘으로 표시, 클라이언트 측
`localeCompare` 정렬, 두 탭 동일 패턴 적용.

## 변경 사항
### `src/components/admin/data-grid-client.tsx`
- `addressSortDirection` state(`'asc' | 'desc' | null`) 추가.
- `toggleAddressSort()`: 클릭할 때마다 null → asc → desc → null 순환.
- `displayRows` (useMemo): 정렬 상태가 없으면 `rows`를 그대로, 있으면 정렬된
  사본을 반환. **events는 행 단위 상세 주소 컬럼이 없어**(AdminEventRow에
  `address` 필드 자체가 없음) 기존 화면 표시 로직과 동일하게
  `sigungu_name`(시군구명)을 정렬 기준으로 쓴다 — 화면에 실제로 보이는 값과
  정렬 기준을 일치시켰다(제5장 제4조 기존 구조 우선, addressText 계산 로직
  재사용).
- 주소 컬럼 헤더를 버튼으로 바꿔 클릭 시 `toggleAddressSort` 호출, 현재
  상태를 ↕(기본)/▲(오름차순)/▼(내림차순) 아이콘으로 표시.
- 행 렌더링을 `rows.map(...)` → `displayRows.map(...)`으로 교체(정렬만
  화면 순서에 영향, 총 건수/선택 상태 등은 그대로 `rows` 기준 유지).
- `switchTab()`에 `setAddressSortDirection(null)` 추가 — 탭을 바꾸면 정렬
  상태도 초기화(다른 탭 필터들과 동일한 리셋 관례).

### `src/components/admin/data-grid-client.test.tsx`
- open_spaces 탭: 헤더 클릭 3회로 오름차순→내림차순→기본 정렬 순으로
  정확히 순환하는지 검증(1).
- events 탭: sigungu_name 기준으로 동일하게 정렬되는지 검증(1).
- 탭 전환 시 정렬 상태가 초기화되는지 검증(1).

## 검증
- `npx vitest run src/components/admin/data-grid-client.test.tsx` — 44개(기존 41개 + 신규 3개) 통과.
- `npx tsc --noEmit` / `npm run test`(전체 218개 파일 2,493개) / `npm run build` 모두 통과.

## 특이 사항
- 서버 재조회 없이 **현재 페이지에 이미 로드된 행만** 정렬한다(요구사항
  원문 "클라이언트 측 상태에서" 정렬과 일치) — "더 보기"로 페이지를 더
  불러오면 새로 합쳐진 전체 목록에 대해 다시 정렬해야 하지만, 이 그리드는
  커서 기반 누적 로딩 구조가 아니라(페이지네이션, `Pagination` 컴포넌트)
  한 페이지 교체 방식이라 문제되지 않는다.
- raw_ingest_data 탭은 애초에 주소 컬럼 자체가 없어(원본 그대로 보존하는
  탭) 정렬 대상에서 제외했다.
