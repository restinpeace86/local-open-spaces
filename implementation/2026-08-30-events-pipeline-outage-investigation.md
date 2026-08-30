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
프로덕션 스케줄 실행**이고, 그 외(사람 계정으로 커밋된 `git add .` 안에 우연히 포함된
행)는 로컬 개발/디버깅 실행 기록이다. `git log --author="github-actions" -- docs/pipeline-log.md`로
확인한 결과 **이 저장소 역사상 봇 커밋은 단 1건**(`f58255f`, 2026-08-29 01:59 UTC =
KST 2026-08-29 10:59)뿐이었다 — 관측성 복구 이후 첫 실제 Daily 배치 실행이자, 지금
확인 가능한 유일한 "진짜" 실행 기록이다.

## 2. 에러 로그 트래킹 — 원인 진단

그 커밋의 내용(2회 시도 — 최초 실행 10:43:54 + 15분 대기 후 재시도 10:59:06, 워크플로에
내장된 재시도 로직)을 보면 **Daily 배치 4개 소스 + 후처리 7개 단계가 전부 실패**했다.
표면적인 에러 메시지는 소스마다 달랐다:

| 소스 | 에러 |
| :--- | :--- |
| GG_CULTURE_EVENTS | `GG_DATA_API_KEY 환경변수가 설정되지 않았습니다` |
| SEOUL_CULTURE_EVENTS | 서울 열린데이터광장 응답: `인증키가 유효하지 않습니다` |
| TOUR_API_FESTIVAL | `fetch failed` |
| SEOUL_YEYAK | `SEOUL_OPEN_DATA_KEY 환경변수가 설정되지 않았습니다` |
| CATEGORY_RULES_APPLICATION 외 6개 후처리 | `NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 없습니다` |

**진단**: 코드를 직접 조사한 결과(`grep`으로 각 어댑터의 env 사용부 확인), 위 4개
소스는 전부 같은 근본 원인의 서로 다른 증상이다 — `SeoulYeyakAdapter`/
`GgCultureEventsAdapter`는 키가 없으면 생성자에서 명시적으로 `throw`하지만,
`seoul-culture-events.mjs`/`tour-api-festival.mjs`는 키를 사전 검증 없이 URL에
그대로 꽂아 넣는다(`env.SEOUL_OPEN_DATA_KEY`가 `undefined`면 URL에 문자열
"undefined"가 그대로 들어감) — 그 결과 전자는 "환경변수 없음"으로, 후자는 원본 서버가
"undefined"를 유효하지 않은 키로 판단해 "인증키 무효"/"fetch failed"로 나타난 것뿐이다.
후처리 6개 단계가 전부 Supabase 자격증명 누락으로 실패한 것까지 종합하면, **이 실행
시점에 필수 환경변수(Supabase 자격증명 포함) 전체가 프로세스에 주입되지 않았다**는
결론이 가장 설득력 있다 — 개별 API 키가 각각 만료됐다고 보기엔 실패 패턴이 너무
전면적이고 획일적이다.

`.env.local`(로컬)과 `.github/workflows/ingest-daily.yml`의 `env:` 블록을 대조한 결과
변수명 불일치는 없었다(`NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`/
`SEOUL_OPEN_DATA_KEY`/`PUBLIC_DATA_API_KEY`/`GG_DATA_API_KEY` 전부 코드와 워크플로가
동일한 이름을 쓴다) — 따라서 **코드 문제가 아니라 GitHub 저장소의 Actions Secrets
설정 쪽 문제로 추정된다.** 이 부분은 GitHub 저장소 Settings → Secrets and variables →
Actions 화면에서만 확인/수정 가능해 구현 AI가 직접 조회·수정할 수 없다(이 세션에는
`gh` CLI도 설치돼 있지 않았다) — **사용자 확인이 필요한 부분**으로 아래 "특이 사항"에
명시한다.

한편 DOM 구조 변경으로 인한 파싱 에러 가능성은 코드베이스 전체를 확인한 결과 해당
없음으로 결론지었다 — 이 프로젝트의 모든 수집 어댑터는 JSON/XML 공공 API를 호출하는
방식이며(`cheerio`/`jsdom` 등 HTML 스크레이핑 라이브러리는 프로덕션 코드에서 전혀
쓰이지 않음, `jsdom`은 vitest 테스트 환경 설정용 devDependency일 뿐), HTML 페이지를
크롤링하는 어댑터가 없다.

## 3. 로컬 Dry-run 검증

`.env.local`(실제 키 보유)로 아래를 실행해 코드/어댑터 자체가 정상인지 검증했다.

- `node scripts/ingest/run-daily.mjs --dry-run` → **11/11개 단계 전부 성공**
  (GG_CULTURE_EVENTS/SEOUL_CULTURE_EVENTS/TOUR_API_FESTIVAL/SEOUL_YEYAK 4개 소스 +
  위치 보강/카테고리 후처리 등 7개 단계 모두 정상 종료).
- `node scripts/ingest/seoul-culture-events.mjs --dry-run` 단독 실행 → 서울 열린데이터광장
  19497건 정상 수신(즉 `SEOUL_OPEN_DATA_KEY`는 로컬에서 유효함 — CI에서 본 "인증키
  무효"는 키 자체가 만료된 게 아니라 애초에 전달되지 않았다는 방증).
- `node scripts/ingest/tour-api-festival.mjs --dry-run` 단독 실행 → 정상 파싱 확인
  (예: "강남페스티벌" 등 실제 축제 데이터).
- `node scripts/ingest/run-monthly.mjs --dry-run` 앞부분 spot-check → CITY_PARK
  18202건 등 정상 수신 확인(전체 14개 소스 완주는 소요 시간상 생략 — 이번 장애의
  증상은 Daily/events 쪽이라 Daily를 전량 완주 검증했고, Monthly는 4번 항목의 코드
  개선이 두 배치에 동일하게 적용됐는지만 spot-check).

**결론**: 코드/어댑터 자체는 건강하다. 실 서비스 장애는 2026-08-29 01:59 UTC
1회(그리고 그 15분 뒤 재시도 1회)의 GitHub Actions 실행에서 필수 환경변수가 프로세스에
전달되지 않아 발생한 것으로 진단된다.

## 4. 재발 방지 조치(코드 레벨)

원인 진단 자체는 GitHub Secrets 설정이라는 저장소 외부 요인이라 구현 AI가 직접
"수정"할 수는 없지만, 다음 두 가지는 코드로 즉시 개선했다.

### (1) 배치 시작 시점 필수 환경변수 사전 검사 신설
`scripts/ingest/lib/env-precheck.mjs`(`getMissingEnvVars`/`formatMissingEnvVarsMessage`)를
신설해 `run-daily.mjs`/`run-monthly.mjs` 양쪽 모두 배치 시작 즉시 필수 환경변수 존재
여부를 한 번에 검사하도록 했다. 어떤 게 "필수"인지는 추측하지 않고 각 어댑터 소스
코드의 `throw new Error('... 환경변수가 설정되지 않았습니다.')` 가드를 전수
`grep`으로 확인해 확정했다(VWORLD_API_KEY/GEMINI_API_KEY처럼 없어도 경고만 남기고
계속 진행하도록 이미 설계된 키는 제외 — 불필요하게 배치를 막지 않기 위함, 제5장
제11조 무중단 원칙).

- Daily: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GG_DATA_API_KEY`,
  `SEOUL_OPEN_DATA_KEY`, `PUBLIC_DATA_API_KEY`
- Monthly: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PUBLIC_DATA_API_KEY`,
  `GG_DATA_API_KEY`, `NONGSARO_API_KEY`

이제 이런 상황이 재발하면 11개(또는 22개) 단계가 각자 다른 메시지로 실패하는 카스케이드
대신, "필수 환경변수 누락: X, Y" 한 줄로 즉시 원인이 드러난다. `.env.local`에서
`GG_DATA_API_KEY`를 잠시 제거하고 재현 → 정확히 이 메시지로 즉시 중단됨을 실측
확인했다(검증 후 원상 복구).

### (2) `.github/workflows/ingest-monthly.yml`의 실제 버그 발견 및 수정
위 사전 검사 대상을 정하려고 각 어댑터의 필수 키를 전수 조사하던 중,
**`RURAL_EDUCATION_FARM`(농사로 API, 2026-08-29 신규 추가)이 요구하는
`NONGSARO_API_KEY`가 `ingest-monthly.yml`의 `env:` 블록에 아예 빠져 있는 것을
발견했다** — `.env.local`에는 있어 로컬 실행/테스트에서는 전혀 드러나지 않다가,
GitHub Actions에서는 이 소스만 매번 조용히(다른 13개 소스는 정상 동작하니 배치
전체는 "성공"으로 보이면서) 실패하고 있었을 것으로 추정된다. `env:` 블록에
`NONGSARO_API_KEY: ${{ secrets.NONGSARO_API_KEY }}`를 추가했다.

## 검증

### 코드 검증
- `npx tsc --noEmit` 통과.
- `npm run test`(67파일 691건 — 신규: `env-precheck.test.mjs` 4건) 통과.
- `npm run build` 통과.

### 실측 검증
- `run-daily.mjs --dry-run` 11/11 성공, `run-monthly.mjs --dry-run` spot-check 정상 —
  사전 검사 추가 후에도 정상 케이스는 그대로 통과함을 확인.
- `.env.local`에서 `GG_DATA_API_KEY`를 잠시 제거해 사전 검사가 실제로 배치를
  중단시키고 명확한 메시지를 내는지 확인, 검증 후 파일 원상 복구(백업 파일 생성 후
  복사 방식으로 원본 유실 위험 없이 진행, 임시 백업 파일은 검증 직후 삭제).

## 특이 사항 — 사용자 확인 필요

1. **GitHub Actions Secrets 재확인 요청**: 이번 조사로 코드/어댑터 자체는 건강함을
   확인했다. 2026-08-29 01:59 UTC 실행의 전면적 실패는 저장소의 Actions Secrets
   설정(`Settings → Secrets and variables → Actions`)에 다음 값들이 실제로
   존재하는지, 값이 올바른지 재확인이 필요하다 — 이 화면은 구현 AI가 접근할 수 없다:
   `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SEOUL_OPEN_DATA_KEY`,
   `PUBLIC_DATA_API_KEY`, `GG_DATA_API_KEY`, `VWORLD_API_KEY`, `GEMINI_API_KEY`,
   `KAKAO_REST_API_KEY`, 그리고 이번에 새로 워크플로에 추가한 `NONGSARO_API_KEY`
   (이번이 처음 요구되는 시점이라 애초에 등록 자체가 안 돼 있을 가능성이 있음).
2. 이번 실패가 1회성 사고인지 반복 패턴인지는 `github-actions[bot]` 커밋이 단
   1건뿐이라(관측성 복구가 최근에야 적용됨) 판단할 근거가 아직 부족하다 — 다음 스케줄
   실행(매일 KST 03:07) 이후 `docs/pipeline-log.md`를 다시 확인하면 Secrets 수정이
   실제로 효과가 있었는지 확인 가능하다.
3. Gemini AI 분류가 로컬 dry-run 중 간헐적으로 HTTP 429(레이트 리밋)를 반환하는 것을
   관찰했으나, 코드가 이미 이를 "ETC로 분류" 폴백으로 우아하게 처리하도록 설계돼
   있어(데이터 유실 없음, 분류 품질만 일부 저하) 이번 지시서의 "누락" 증상과는
   무관하다고 판단해 별도 조치하지 않았다 — 필요시 별도 지시로 진행 가능.
