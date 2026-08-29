# [배치 수집 로그 검증, Admin 상세 모달 링크/이미지 개선, 기본 조회일자 오늘로 설정]

## 요구사항
1. 주말 데이터 수집 배치 실행 여부/에러 검증 — 공공데이터 포털 주말 미업데이트 때문인지,
   백엔드 배치 에러/타임아웃 때문인지 확인.
2. `/admin/data-grid` 상세보기 모달의 URL 텍스트를 클릭 가능한 링크로, 이미지 URL을 실제
   미리보기 이미지로 렌더링.
3. 관리자 페이지 최초 진입 시 기본 조회 조건을 "오늘 수집된 데이터"로 고정.
4. 검증 후 커밋/푸시.

## 구현 일시
2026-08-29

## 1. 배치 수집 로그 검증 — 결론: 공공데이터 주말 미업데이트가 아니라 GitHub Actions 저장소 시크릿 설정 누락/무효

**조사 순서**:
1. `docs/pipeline-log.md`에 최근 CI 스케줄 실행 기록이 2026-08-26 이후로 없어, 로컬에
   남은 기록만으로는 실제 GitHub Actions 실행 성공 여부를 알 수 없었다(이 파일은 로컬/수동
   실행 결과만 반영되고 있었음 — 8/28에 이미 한 번 지적된 관측성 부재 문제가 재발).
2. GitHub REST API(`/repos/.../actions/workflows/{id}/runs`)로 실제 스케줄 실행 이력을
   직접 조회 — **2026-08-20부터 현재까지 기록된 Daily Ingestion 스케줄 실행이 예외 없이
   전부 `failure`**였다(주말만이 아니라 평일 포함 전체 기간).
3. 동일 스크립트(`scripts/ingest/run-daily.mjs`)를 로컬에서 CI와 동일한 환경변수 세트로
   직접 실행 — **11/11단계 전부 성공**(GG_CULTURE_EVENTS 18,959건, TOUR_API_FESTIVAL
   264건, SEOUL_YEYAK open_spaces 1,296건/events 1,555건 정상 적재). 즉 코드/로직 자체는
   정상이며, 원본 데이터도 실제로 존재하고 최신 상태임을 확인 — "공공데이터 포털 주말
   미업데이트" 가설은 기각.
4. 실패 실행의 소요 시간(약 15분 46초)이 "즉시 실패 → 15분 대기 → 즉시 재실패" 패턴과
   정확히 일치해, CI에서는 배치가 시작하자마자 곧바로 죽는 것으로 추정.
5. 대표 승인 하에 저장된 git 자격증명(gho_... PAT)으로 GitHub Actions 잡의 원문 로그를
   1회성으로 직접 조회(읽기 전용, 저장하지 않음) — **정확한 원인을 확인**:
   ```
   ❌ [GG_CULTURE_EVENTS] 실패: GG_DATA_API_KEY 환경변수가 설정되지 않았습니다.
   ❌ [SEOUL_CULTURE_EVENTS] 실패: 서울 열린데이터광장 응답이 JSON이 아닙니다:
      <RESULT><CODE>INFO-100</CODE><MESSAGE>인증키가 유효하지 않습니다.
   ❌ [TOUR_API_FESTIVAL] 실패: fetch failed
   ❌ [SEOUL_YEYAK] 실패: SEOUL_OPEN_DATA_KEY 환경변수가 설정되지 않았습니다.
   ❌ [CATEGORY_RULES_APPLICATION 외 5개 후처리 단계] 실패:
      NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 없습니다.
   ▶▶▶ Daily Events Batch 종료: 0/11개 단계 성공
   ```

**결론**: 배치 코드/로직/공공데이터 원본 어느 쪽도 문제가 아니다. **GitHub 저장소의 Actions
시크릿(Settings → Secrets and variables → Actions)이 누락되었거나 값이 무효화된 것이
근본 원인**이다:
- `GG_DATA_API_KEY`, `SEOUL_OPEN_DATA_KEY`, `NEXT_PUBLIC_SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY` — 시크릿 자체가 비어있거나 미설정 상태로 추정(코드가 명시적으로
  "환경변수가 설정되지 않았습니다"로 판별해 던진 에러).
- `PUBLIC_DATA_API_KEY`(서울 열린데이터광장이 사용하는 키로 추정) — 값은 존재하나 API가
  "인증키가 유효하지 않습니다"로 거부 — 만료/회전(rotate)되었을 가능성.
- `TOUR_API_FESTIVAL`의 "fetch failed"는 원인이 불명확하나(네트워크 레벨 실패), 앞선
  키 이슈들과 같은 시점에 함께 실패하고 있어 연관 가능성이 있다.

**이번 세션에서 직접 수정하지 않은 이유**: 시크릿의 올바른 값은 각 공공데이터/Supabase
프로젝트의 실제 키이며, 구현 AI가 임의로 추측해 설정할 수 없다(제3장 제5조 추측 금지).
대표가 GitHub 저장소 Settings에서 각 시크릿 값을 재확인/재발급 후 갱신해야 하는 운영
조치이며, 코드 변경으로 해결되는 문제가 아니다.

## 2. Admin 상세 모달 URL/이미지 UX 개선

`src/components/admin/raw-data-modal.tsx`의 "전체 컬럼" 그리드(구조화된 컬럼 값 나열)에서:
- `isHttpUrl(value)`: `http(s)://`로 시작하는 문자열 값을 판별해 `<a target="_blank"
  rel="noopener noreferrer">`로 렌더링(클릭 시 새 창).
- `isImageUrlField(key, value)`: 필드명이 `thumbnail_url`이거나 URL이 이미지 확장자
  (jpg/jpeg/png/gif/webp/svg/avif)로 끝나면, 텍스트 링크 대신 실제 `<img>` 미리보기
  (56×56, object-cover)를 렌더링하고 클릭 시 새 창에서 원본을 연다. 이미지 로드 실패 시
  `onError`로 조용히 숨겨 깨진 이미지 아이콘이 노출되지 않게 했다.
- raw JSON 원문(`raw_data`/`raw_payload`, `<pre>` 블록)은 이번 범위에 포함하지 않았다 —
  구조화된 컬럼(요구사항이 명시한 "URL 필드")과 달리 중첩 JSON 내부까지 파싱해 인터랙티브
  링크로 바꾸는 것은 별도의 훨씬 큰 작업이라 범위를 벗어난다고 판단.

## 3. 관리자 페이지 기본 조회일자 오늘로 설정

`src/components/admin/data-grid-client.tsx`의 `createdFrom`/`createdTo` state 초기값을
`''`(전체 조회)에서 `todayDateStr()`(오늘)로 변경. `resetFilters()`(탭 전환 시, "필터
초기화" 버튼)도 같은 값으로 되돌리도록 통일 — 기존에 `isActive` 필터가 기본값을 `'all'`이
아니라 `'true'`로 두는 것과 동일한 관례(초기화 = "전체 노출"이 아니라 "합리적인 기본값으로
복귀")를 따랐다.

## 검증
- `npx tsc --noEmit` 통과
- `npm run test`(57파일 565건, `raw-data-modal.test.tsx` 신규 3건 포함) 통과
- `npm run build` 통과
- 실측: Playwright로 관리자 페이지 진입 시 날짜 입력 필드 초기값이 오늘 날짜로 채워지고
  "오늘 등록건 보기" 버튼이 활성 상태로 표시됨을 확인. 모달의 링크/이미지 렌더링은 전체
  페이지 E2E 대신(문서화된 RPC 타임아웃 이슈로 불안정) `raw-data-modal.test.tsx` 컴포넌트
  테스트로 직접 검증.

## 특이 사항
- 요구사항 1은 코드 수정이 아니라 **운영 조치(GitHub 저장소 시크릿 재설정)가 필요한
  진단 결과**다. 대표가 아래 시크릿을 확인/갱신해야 한다:
  `GG_DATA_API_KEY`, `SEOUL_OPEN_DATA_KEY`, `NEXT_PUBLIC_SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY`(누락 추정), `PUBLIC_DATA_API_KEY`(무효 확인).
  갱신 후 `workflow_dispatch`로 수동 실행해 정상화를 재확인하는 것을 권장한다.
- 이 진단을 위해 GitHub Actions 잡의 원문 로그를 조회할 때, 이 환경에 이미 저장돼 있던
  git 자격증명(PAT)을 사용했다 — 자동 분류기가 이를 민감한 동작으로 판단해 1차 차단했고,
  대표에게 명시적으로 사용 여부를 확인받은 뒤(읽기 전용, 로그를 저장하지 않고 즉시 삭제)
  진행했다.
