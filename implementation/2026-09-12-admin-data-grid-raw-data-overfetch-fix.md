# 관리자화면 목록 조회의 raw_data 과다 전송 제거 (프론트엔드 체감 지연 원인)

## 구현 대상
사용자 지시: "아까보단 빨라졌는데 그래도 느린데 db쪽이 아니라면 프론트엔드쪽의
랜더링쪽에서 뭔가 느린거 아니야? 데이터를 가져오는게 크게 없는데?"

## 구현 일시
2026-09-12

## 진단 — "프론트엔드 렌더링"이 아니라 "안 보이는 데이터를 과다 전송"이었음
직전 조치(`get_events_filter_options` 인덱싱 수정)로 필터 옵션 RPC는 해결됐지만
"그래도 느리다"는 사용자 지적에, 실제 목록 조회(`/api/admin/data-grid`)의 응답
페이로드 크기를 직접 측정했다:

```
open_spaces page_size=200: 246.9KB (raw_data가 66.4KB = 26.9%)
events      page_size=200: 655.0KB (raw_data가 404.3KB = 61.7%)
```

`data-grid-client.tsx`의 그리드 행 렌더링 코드를 확인한 결과:
- **open_spaces 행은 raw_data를 전혀 안 쓴다** — 100% 순수 낭비.
- **events 행은 raw_data 중 3개 문자열 필드(MAXCLASSNM/MINCLASSNM/SVCSTATNM)만
  써서** "원천 대/중분류"·"접수상태" 컬럼에 표시한다 — 나머지(원문 API 응답
  전체)는 화면에 전혀 안 보이는데도 매번 통째로 내려받고 있었다.

즉 "데이터를 가져오는게 크게 없는데?"라는 느낌은 **화면에 보이는 열(컬럼) 기준**
으로는 맞지만, 실제 네트워크로 오간 JSON은 그 몇 배였다 — 진짜 프론트엔드
렌더링(React 재렌더링 등) 문제가 아니라 "안 쓰는 데이터를 매번 통째로 받아와
파싱하는" 과다 전송(over-fetching) 문제였다.

## 조치

### 1. `src/app/api/admin/data-grid/route.ts`
- `OPEN_SPACES_COLUMNS`(기본 목록 조회): `raw_data` 완전히 제거.
- `queryOpenSpacesViaSourceSubset`(SEOUL_YEYAK 소스 전용 JS 메모리 필터 경로 —
  `raw_data.MINCLASSNM`/`SVCSTATNM`을 애플리케이션 코드에서 직접 읽어야 함)만
  예외적으로 `raw_data`를 포함한 별도 상수(`OPEN_SPACES_COLUMNS_WITH_RAW_DATA`)를
  쓴다.
- `EVENTS_COLUMNS`: `raw_data` 대신 PostgREST 별칭 문법으로 3개 필드만 직접
  SELECT한다:
  ```
  max_class:raw_data->>MAXCLASSNM, min_class:raw_data->>MINCLASSNM, svc_stat:raw_data->>SVCSTATNM
  ```
  (SQL WHERE 필터인 `.filter('raw_data->>MINCLASSNM', 'eq', ...)`는 SELECT
  목록과 무관하게 그대로 작동 — 변경 없음.)

### 2. 신규 라우트 `src/app/api/admin/data-grid/raw-data/route.ts`
`GET ?table=open_spaces|events&id=...` — 상세 모달을 열 때 그 한 건의 raw_data만
따로 조회한다.

### 3. `src/components/admin/data-grid-client.tsx`
- `AdminOpenSpaceRow.raw_data`/`AdminEventRow.raw_data`를 `unknown` → `unknown
  | undefined`(옵셔널)로 변경 — 목록 조회에는 이제 이 값이 없다.
- `AdminEventRow`에 `max_class`/`min_class`/`svc_stat` 필드 추가, 그리드 행
  렌더링이 `rawField(r.raw_data, 'MAXCLASSNM')` 대신 이 값을 직접 쓰도록 변경
  (`rawField` 헬퍼는 더 이상 쓰이지 않아 제거).
- `handleOpenDataRow`에 `ensureRawDataLoaded()`를 추가 — 행을 열 때
  `row.raw_data`가 아직 `undefined`면(=목록에서 못 받아온 경우) 새 라우트로
  그 한 건만 가져와 `rows`/`selectedRow` 양쪽에 채운다. 이미 값이 있으면(예:
  SEOUL_YEYAK 메모리 필터 경로) 재조회하지 않는다.

### 4. `src/components/admin/raw-data-modal.tsx`
`raw_data === undefined`인 동안(아직 안 받아온 상태) "원문 JSON" 섹션에
"불러오는 중..."을 보여준다(기존 로딩 표시 관례와 동일한 문구). `raw_ingest_data`
탭은 원래부터 `raw_payload`를 항상 갖고 있어 해당 없음.

## 검증 (실측 전/후 비교, 워밍업 후 안정 수치)
```
open_spaces page_size=200: 246.9KB → 177.5KB (raw_data 66.4KB 제거, -28%)
events      page_size=200: 655.0KB → 231.9KB (raw_data 404.3KB 대신 3개 문자열
                                              필드만, -65%)
```
응답 시간도 함께 개선(콜드 캐시 편차가 있어 참고용): open_spaces 2732ms →
185ms, events 774ms → 186ms(둘 다 안정화 후 재측정 기준).

- `npx tsc --noEmit`: 통과.
- `npm run test -- --run`: 137 파일 / 1622건 전체 통과. 신규 5건 —
  `raw-data-modal.test.tsx`에 "raw_data 지연 로딩 상태" 3건(로딩 중 문구,
  채워지면 정상 표시, raw_ingest_data는 해당 없음), `data-grid-client.test.tsx`에
  "상세 모달 열 때 raw_data 지연 로딩" 2건(없으면 새 엔드포인트 호출해 채움,
  있으면 재조회 안 함). 기존 테스트들은 전부 `raw_data`를 명시적으로 채운 행
  객체를 쓰고 있어(예: `raw_data: {}`) 수정 없이 그대로 통과했다.
- `npm run build`: 성공(`/api/admin/data-grid/raw-data` 라우트 포함 확인).

## 특이 사항
- `raw_ingest_data` 탭(`raw_payload`, 평균 0.4~3.8KB)은 이번 조치에서 제외했다
  — open_spaces/events만큼 payload 비중이 크지 않고(그리드 행이 raw_payload를
  전혀 안 쓴다는 점은 동일하지만), `raw_ingest_data`가 단일 `id` 대신
  `(source, source_id)` 복합키를 써서 이번에 만든 `raw-data` 라우트를 그대로
  재사용할 수 없다 — 필요성이 실측으로 확인되면 별도 키 조회를 지원하는 확장을
  검토한다(제3장 제5조 추측 금지 — 지금은 손대지 않음).
- 이 조치로 "관리자화면이 느리다"는 이번 대화의 두 원인(DB 쿼리 타임아웃 + 프론트
  과다 전송)을 모두 확인·수정했다. 그래도 체감상 느리면 다음엔 실제 브라우저
  개발자 도구(Network/Performance 탭)로 다시 실측해야 한다 — 이번처럼 추측이
  아니라 항상 실측으로 원인을 좁힌다.
