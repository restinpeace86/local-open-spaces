# [핵심 events 테이블 수집 파이프라인 장애 점검]

## 요구사항
1. 20개 이상 수집 어댑터의 최근 실행 로그 확인.
2. 타임아웃/API 키 만료/파싱 에러(DOM 구조 변경 등) 에러 로그 트래킹.
3. 로컬에서 수집 스크립트를 Dry-run으로 돌려 파싱/Supabase 인서트가 정상인지 검증.

## 점검 일시
2026-08-30

## 1. 실행 로그 확인 — `docs/pipeline-log.md` + git 히스토리 대조

`docs/pipeline-log.md`는 2026-08-28 "파이프라인 관측성 긴급 복구" 작업 이후로 GitHub
Actions 워크플로가 매 실행마다 결과를 저장소에 커밋(`github-actions[bot]`)하도록
바뀌었다 — 즉 이 파일에 남은 기록 중 **`github-actions[bot]`가 커밋한 것만 실제
프로덕션 스케줄 실행**이고, 그 외(사람 계정 커밋 안에 우연히 포함된 행)는 로컬 개발/
디버깅 실행 기록이다. `git log --author="github-actions" -- docs/pipeline-log.md`로
확인한 결과 봇 커밋은 2건이었다 — 이 조사 작업 도중 새 커밋(`b769350`, 2026-08-29
21:27 UTC)이 원격에 추가로 올라와, 결과적으로 서로 다른 시점의 실패 2건을 모두 확보해
비교할 수 있었다.

## 2. 에러 로그 트래킹 — 두 건의 서로 다른 실패 진단

### (A) 2026-08-29 01:59 UTC 실행(`f58255f`) — 필수 환경변수 미주입 의심(과거)

이 실행은 Daily 배치 4개 소스 + 후처리 7개 단계가 표면적으로 서로 다른 에러로 전부
실패했다: `GG_DATA_API_KEY`/`SEOUL_OPEN_DATA_KEY` "환경변수가 설정되지 않았습니다",
서울 열린데이터광장의 "인증키가 유효하지 않습니다", `TOUR_API_FESTIVAL`의 "fetch
failed", 그리고 Supabase 의존 후처리 6개 전부 "NEXT_PUBLIC_SUPABASE_URL 또는
SUPABASE_SERVICE_ROLE_KEY가 없습니다". 코드를 조사해보면(`seoul-culture-events.mjs`/
`tour-api-festival.mjs`는 키 존재를 사전 검증하지 않고 URL에 그대로 꽂아 넣어, 키가
`undefined`면 원본 서버가 "무효한 키"로 응답한다) 이 전면적 실패는 개별 키 만료가
아니라 **그 실행 시점에 필수 환경변수 전체가 프로세스에 주입되지 않았다**는 단일
원인으로 가장 잘 설명된다. 다만 이 실행이 정확히 왜 그랬는지(GitHub Secrets 설정
문제였는지, 다른 일시적 요인이었는지)는 그 시점의 Actions 실행 환경을 직접 들여다볼
방법이 없어(이 세션에 `gh` CLI 없음) 사후적으로 완전히 규명하지는 못했다.

### (B) 2026-08-30 05:52~06:27 UTC 4회 연속 실행(`b769350`) — **근본 원인 확정(현재 진행 중)**

조사 도중 원격에 새로 올라온 이 커밋을 보면, 가장 최근 4회 연속 실행(05:52/05:58/06:13/
06:27 UTC, 약 10~35분 간격 — 워크플로의 15분 재시도와는 별개로 반복 트리거된 것으로
보임)이 Daily 배치의 **모든 단계에서 완전히 동일한 메시지**로 실패했다:

> Node.js detected but native WebSocket not found.
> Suggested solution: Ensure you are running Node.js 22+ or provide a WebSocket
> implementation via the transport option.

이 메시지는 (A)의 다양한 증상과 달리 단 하나의 정확한 원인을 가리킨다 — 직접
`npm view @supabase/supabase-js@2.112.2 engines`로 조회해 확인한 결과, 현재 설치된
`@supabase/supabase-js`(2.112.3, `npm ls`로 확인)가 `"engines": {"node": ">=22.0.0"}`를
명시한다. 그런데 `.github/workflows/ingest-daily.yml`/`ingest-monthly.yml`/`e2e.yml`
**세 워크플로 전부 `actions/setup-node@v4`에 `node-version: 20`을 고정**하고 있었다 —
Node 20에는 native `WebSocket` 전역 객체가 없어(Node 22부터 안정화), Supabase 클라이언트를
생성하는 시점에 즉시 크래시한다. 이 크래시는 Supabase에 접근하는 모든 단계(외부 API
호출조차 하기 전에 클라이언트부터 만드는 후처리 단계 포함)에 예외 없이 영향을 줘,
"모든 단계가 완전히 동일한 메시지로 실패"하는 이번 패턴을 정확히 설명한다. 로컬에서는
이 문제가 전혀 드러나지 않았는데(1절 dry-run 참고), 로컬 Node가 v24.18.1(>=22)이라
아예 재현되지 않기 때문이다 — **CI 전용 회귀**였다.

**조치**: 세 워크플로 모두 `node-version: 20 → 22`로 상향했다. 이것이 이번 지시서가
말한 "어제 날짜로 예정/갱신되어야 할 공공 데이터가 events 테이블에 누락"의 직접적이고
가장 최근인 원인이며, 코드/설정 레벨에서 완전히 수정 가능한 문제였다.

한편 DOM 구조 변경으로 인한 파싱 에러 가능성은 코드베이스 전체를 확인해 해당 없음으로
결론지었다 — 모든 수집 어댑터가 JSON/XML 공공 API를 호출하며, HTML 스크레이핑
라이브러리(`cheerio` 등)는 프로덕션 코드에 전혀 쓰이지 않는다(`jsdom`은 vitest 테스트
환경설정용 devDependency일 뿐).

## 3. 로컬 Dry-run 검증

`.env.local`(실제 키, 로컬 Node v24.18.1)로 아래를 실행해 코드/어댑터 자체가 정상인지
검증했다 — (B)의 Node 버전 이슈가 로컬에서는 나타나지 않으므로, 이 결과는 "어댑터
로직 자체는 건강하다"는 것만 확인해준다(실제 CI 장애 재현은 아님).

- `node scripts/ingest/run-daily.mjs --dry-run` → **11/11개 단계 전부 성공**.
- `node scripts/ingest/seoul-culture-events.mjs --dry-run` 단독 → 19497건 정상 수신.
- `node scripts/ingest/tour-api-festival.mjs --dry-run` 단독 → 정상 파싱(예:
  "강남페스티벌").
- `node scripts/ingest/run-monthly.mjs --dry-run` 앞부분 spot-check → CITY_PARK
  18202건 등 정상 수신.

## 4. 재발 방지 조치

### (1) Node 버전 상향(근본 수정) — `.github/workflows/{ingest-daily,ingest-monthly,e2e}.yml`
`node-version: 20 → 22`. `@supabase/supabase-js`의 `engines` 요구사항을 충족하는
최소 LTS 버전이다.

### (2) 배치 시작 시점 필수 환경변수 사전 검사 신설(방어적 개선)
(A)의 원인이 정확히 무엇이었는지는 완전히 규명하지 못했지만, 재발 시 진단 속도를
높이기 위해 `scripts/ingest/lib/env-precheck.mjs`(`getMissingEnvVars`/
`formatMissingEnvVarsMessage`)를 신설해 `run-daily.mjs`/`run-monthly.mjs` 양쪽 모두
배치 시작 즉시 필수 환경변수 존재 여부를 검사하도록 했다. 어떤 게 "필수"인지는
추측하지 않고 각 어댑터 소스 코드의 `throw new Error('... 환경변수가 설정되지
않았습니다.')` 가드를 전수 `grep`으로 확인해 확정했다(VWORLD_API_KEY/GEMINI_API_KEY처럼
없어도 경고만 남기고 계속 진행하도록 이미 설계된 키는 제외 — 제5장 제11조 무중단
원칙).

- Daily: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GG_DATA_API_KEY`,
  `SEOUL_OPEN_DATA_KEY`, `PUBLIC_DATA_API_KEY`
- Monthly: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PUBLIC_DATA_API_KEY`,
  `GG_DATA_API_KEY`, `NONGSARO_API_KEY`

`.env.local`에서 `GG_DATA_API_KEY`를 잠시 제거해 재현 → 정확히 "필수 환경변수 누락:
GG_DATA_API_KEY" 메시지로 즉시 중단됨을 실측 확인했다(검증 후 원상 복구).

### (3) `.github/workflows/ingest-monthly.yml`의 별도 실제 버그 발견 및 수정
사전 검사 대상을 정하려고 각 어댑터의 필수 키를 전수 조사하던 중, **`RURAL_EDUCATION_FARM`
(농사로 API, 2026-08-29 신규 추가)이 요구하는 `NONGSARO_API_KEY`가
`ingest-monthly.yml`의 `env:` 블록에 아예 빠져 있는 것을 발견했다** — `.env.local`에는
있어 로컬에서는 드러나지 않다가, GitHub Actions에서는 이 소스만 조용히 실패하고
있었을 것으로 추정된다. `env:` 블록에 추가했다.

## 검증

### 코드 검증
- `npx tsc --noEmit` 통과.
- `npm run test`(68파일 695건 — 신규: `env-precheck.test.mjs` 4건, `fetch-with-cause.test.mjs`
  4건) 통과.
- `npm run build` 통과.

### 실측 검증
- `npm view @supabase/supabase-js@2.112.2 engines` → `{ node: '>=22.0.0' }` 직접 확인.
- `npm ls @supabase/supabase-js` → 실제 설치 버전 2.112.3(같은 요구사항 적용) 확인.
- `run-daily.mjs --dry-run` 11/11 성공, `run-monthly.mjs --dry-run` spot-check 정상 —
  사전 검사 추가 후에도 정상 케이스는 그대로 통과함을 확인.
- `.env.local`에서 `GG_DATA_API_KEY`를 잠시 제거해 사전 검사가 실제로 배치를
  중단시키는지 확인, 검증 후 파일 원상 복구(백업 후 복사 방식, 임시 백업은 검증 직후
  삭제).

## 5. 후속 실측(2026-08-30, Node 22 적용 후 사용자가 workflow_dispatch로 수동 재실행)

Node 22 수정을 반영한 뒤 사용자가 GitHub Actions에서 직접 워크플로를 수동 실행했다.
결과(`docs/pipeline-log.md` 커밋 `c8b0d6f`):

- **`SEOUL_YEYAK`/`seoul_public_culture`(SEOUL_CULTURE_EVENTS) 및 7개 후처리 단계
  전부 정상 성공** — SEOUL_YEYAK 2790건 수신/적재, seoul_public_culture 19497건
  수신(18950건 적재). **"Node.js ... WebSocket not found" 크래시가 완전히
  사라졌다 — 4절의 진단과 수정이 정확했음을 실측으로 확인.**
- 다만 **`GG_CULTURE_EVENTS`와 `TOUR_API_FESTIVAL` 2개 소스가 여전히 `fetch failed`로
  실패**해(재시도 3회 전부 소진) 워크플로 전체는 여전히 exit code 1로 종료됐다. 이
  둘은 로컬 dry-run(3절)에서는 정상 동작했던 소스라 GitHub Actions 환경에서만
  재현되는 별개의 문제로 보인다.

**원인 후보(미확정)**: 두 실패 소스 모두 국가/광역 단위 공공데이터 포털
(`apis.data.go.kr`, `openapi.gg.go.kr`)을 쓰는 반면, 정상 동작한 두 소스는 서울시
자체 포털(`openapi.seoul.go.kr`)을 쓴다는 공통점이 있다 — 일부 공공데이터 API는
활용신청 시 고정 IP를 등록해야 호출이 허용되는 경우가 있어(널리 알려진 제약), 매번
IP가 바뀌는 GitHub Actions 러너에서 특히 문제가 될 수 있다는 가설을 세웠으나, 이
가설을 코드나 로그만으로 확정할 방법은 없었다(외부 포털의 API 키 관리 화면에서
IP 제한 설정 여부를 사용자가 직접 확인해야 함).

**즉시 조치(관측성 개선)**: 기존 코드가 Node의 네이티브 fetch(undici) 에러를 그대로
전파해, 실패 원인이 항상 "fetch failed"라는 동일하고 무의미한 문구로만 남고
실제 원인(DNS 실패/연결 거부/타임아웃/TLS 오류 등, `err.cause`에만 담겨 있음)이
유실되고 있었다 — `scripts/ingest/lib/fetch-with-cause.mjs`(`fetchWithCause`) 신설,
`gg-culture-events-adapter.mjs`/`tour-api-festival.mjs`의 원본 `fetch()` 호출
3곳을 교체해 다음 실패부터는 `err.cause`가 메시지에 포함되도록 했다. retry.mjs의
재시도 판별은 부분 문자열 매칭이라 동작에 영향 없음(단위 테스트로 확인).

## 특이 사항 — 사용자 확인 필요

1. **`GG_CULTURE_EVENTS`/`TOUR_API_FESTIVAL`의 "fetch failed"는 아직 미해결이다.**
   다음 실행부터는 `err.cause`가 메시지에 포함되니, 그 내용을 보고 원인을 좁힐 수
   있다 — 만약 DNS/타임아웃 계열이면 일시적 네트워크 문제일 가능성이, "connection
   reset"/타 명확한 거부 계열이면 IP 제한 가설에 무게가 실린다. `apis.data.go.kr`
   (공공데이터포털)과 `openapi.gg.go.kr`(경기데이터드림) 각각의 API 키 관리
   화면에서 "활용신청 시 등록한 IP" 또는 "서비스 URL/IP 제한" 설정이 있는지 확인해
   보시길 권장한다 — 이 화면들은 구현 AI가 접근할 수 없다.
2. (A) 2026-08-29 01:59 UTC 실패의 정확한 원인은 완전히 규명하지 못했다 — GitHub
   저장소 Actions Secrets(`Settings → Secrets and variables → Actions`)에 아래 값이
   모두 있는지 한 번 확인해두면 좋다: `NEXT_PUBLIC_SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`, `SEOUL_OPEN_DATA_KEY`, `PUBLIC_DATA_API_KEY`,
   `GG_DATA_API_KEY`, `VWORLD_API_KEY`, `GEMINI_API_KEY`, `KAKAO_REST_API_KEY`,
   `NONGSARO_API_KEY`(이번에 워크플로에 새로 추가 — 저장소에 등록 자체가 안 돼
   있을 가능성 있음). 2026-08-30 재실행에서는 이 계열 에러가 재현되지 않아, 일시적
   이슈였을 가능성이 있다.
3. GitHub Actions 로그에 보이는 "Node.js 20 is deprecated ... forced to run on
   Node.js 24" 경고는 `actions/checkout@v4`/`actions/setup-node@v4` 액션 자체의
   실행 런타임에 대한 GitHub 인프라 공지이며, 우리가 지정한 `node-version: 22`(스크립트
   실행용)와는 무관하다 — 액션 작성자 쪽에서 처리할 사안이라 우리 워크플로에서
   조치할 부분은 없다.
4. Gemini AI 분류가 로컬 dry-run 중 간헐적으로 HTTP 429(레이트 리밋)를 반환하는 것을
   관찰했으나, 코드가 이미 "ETC로 분류" 폴백으로 처리해 데이터 유실은 없다(분류 품질만
   일부 저하) — 이번 지시서의 "누락" 증상과는 무관해 별도 조치하지 않았다.
