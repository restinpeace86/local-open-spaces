# [Admin open_spaces 탭 멀티 체크박스 필터] + [체크박스 렌더링 안정성 확보]

## 요구사항
1. `/admin/data-grid`의 open_spaces 탭에 중분류 + `[NULL(미지정)]` 멀티 체크박스 필터
   구현(백엔드 쿼리 + 프론트 UI).
2. events/open_spaces 양쪽에서 중분류 체크박스 목록이 간헐적으로 누락되고 NULL만 남는
   고질적 렌더링 버그 수정 — 안전한 fallback/방어 코드, 로딩/에러 상태 UI 보강.
3. 검증 후 커밋/푸시.

## 구현 일시
2026-08-28

## 1. 멀티 체크박스 필터 — 이미 구현되어 있었음(재확인)
`/admin/data-grid`의 `category_min` 다중 선택 + NULL 필터는 [행사 데이터 수집/정제
파이프라인 및 홈 피드 필터링 개선](2026-08-27)에서 이미 구현되어 있고, 바로 전 작업
([open_spaces NULL 그룹핑 분석] 2026-08-28)에서도 정상 동작을 실측 확인했다. 이번에도
코드 중복 구현은 하지 않았다.

## 2. 렌더링 버그 — 실측으로 재현 및 근본 원인 확정

### 근본 원인
`page.tsx`가 `get_category_min_options` RPC를 서버에서 **재시도 없이 1회만** 호출한다.
이 RPC가 일시적으로 실패하면(대량 UPDATE 직후 DB 콜드 캐시/락 경합 — 이 세션에서 이미
여러 차례 실측된 패턴) `categoryMins`가 빈 배열이 되는데, `CheckboxMultiSelect`는
`includeNullOption`이 true이면 빈 배열이어도 `return null` 하지 않고 그대로 렌더링한다 —
그 결과 **NULL 체크박스만 남고 나머지 항목 전체가 사라진 것처럼 보인다**. 사용자가 보고한
증상과 정확히 일치한다.

### 실측 검증 — 라이브 재현
로컬 서버로 직접 재현한 결과, 이 문제는 category_min 하나만이 아니라 **이 페이지의
RPC 8개 전부**에서 동시다발적으로 발생하고 있었다(연속 요청 시 실패 개수가 7→2→2로
점차 줄어드는 전형적 콜드 캐시 패턴과 일치). 재시도(2회, 300ms 간격)를 붙인 뒤에도
지속되는 부하 상태에서는 재시도조차 모두 실패하는 경우를 실제로 목격했다 — 즉 "가끔"이
아니라 대표가 제보한 대로 "고질적"인 문제였다.

## 변경 사항

### 서버 측 재시도
- `src/lib/supabase/rpc-retry.ts`(신규): `rpcWithRetry(fn, retries=2, delayMs=300)` —
  Supabase RPC 호출을 감싸 실패 시 짧은 간격으로 재시도한다.
- `src/app/admin/data-grid/page.tsx`: 8개 RPC 호출 **전부**를 `rpcWithRetry`로 감쌌다
  (category_min 2건뿐 아니라 source_type/category/source/seoul_yeyak/events_filter/
  raw_ingest_filter 옵션까지 — 실측상 전부 같은 위험에 노출돼 있었다).

### 최후의 방어 코드 — 하드코딩 폴백 목록
- `src/lib/admin/category-min-fallback.ts`(신규): `OPEN_SPACES_CATEGORY_MIN_FALLBACK`/
  `EVENTS_CATEGORY_MIN_FALLBACK` — 재시도까지 모두 실패했을 때만 쓰이는 스냅샷
  목록(2026-08-28 기준, 인코딩 손상된 기존 값 1건은 의도적으로 제외). **서비스 데이터의
  원천이 아니다** — 실시간 조회가 정상이면 이 목록은 절대 쓰이지 않는다(제5장 제6조
  하드코딩 최소화 원칙과 충돌하지 않도록 "완전 실패 시의 최후 안전망" 용도로만 존재하게
  설계했다). `page.tsx`가 RPC 에러 시(재시도 포함) 이 목록으로 폴백한다.

### UI 방어 코드
- `src/components/admin/data-grid-client.tsx`:
  - `FilterOptions` 타입에 `categoryMinsFetchFailed?: boolean` 추가.
  - `CheckboxMultiSelect`에 `fetchFailed`/`onRetry` prop 추가 — 폴백 목록을 쓰는 중이면
    체크박스 목록 위에 "⚠️ 최신 목록을 불러오지 못해 최근 스냅샷을 표시 중입니다" 경고
    + "다시 시도" 버튼을 함께 렌더링한다(폴백 목록조차 없는 극단적 경우를 대비해 완전
    실패 시의 큰 경고 메시지 분기도 유지). "다시 시도"는 `useRouter().refresh()`로
    페이지를 다시 렌더링해 RPC를 재시도한다(전체 새로고침 없이).

## 검증
- `npx tsc --noEmit`: clean.
- `npm run test`: 53개 파일 545건 통과(`rpc-retry.test.ts` 3건 신규).
- `npm run build`: 성공, 라우트 변화 없음.
- **라이브 재현 및 수정 확인**: 로컬 서버에서 실제로 8개 RPC 전부가 동시다발 timeout을
  내는 상황을 재현했고(수정 전 로그: "get_category_min_options(open_spaces) 조회
  실패(재시도 포함)"), 수정 후 같은 상황에서 폴백 목록이 정상 활성화됨을 실측 확인했다
  — 렌더링된 HTML에서 경고 배너("최신 표준 중분류(category_min) 목록을 실시간으로
  불러오지 못해...")와 "다시 시도" 버튼, 그리고 체크박스 50개(폴백 49종 + NULL)가 모두
  정상 렌더링됨을 확인했다.

## 특이 사항
- 이번 검증 중 발견한 사실을 투명하게 보고한다: 현재 이 프로젝트의 Supabase DB가 이
  세션의 대량 배치 작업(대규모 UPDATE 여러 건, 전수 스캔 등) 여파로 상당히 부하가 걸려
  있는 것으로 보이며, `/admin/data-grid` 진입 시 여러 RPC가 동시다발적으로 지연·타임아웃
  되는 현상이 (드물지 않게) 실측됐다. 이번 수정으로 "화면이 깨지는" 증상은 확실히
  해소되지만, 근본적인 DB 부하 완화(예: 통계 갱신 주기 조정, 커넥션 풀 설정 검토)가
  필요하다면 별도 조사가 필요하다 — 이번 작업 범위 밖으로 남겨둔다.
