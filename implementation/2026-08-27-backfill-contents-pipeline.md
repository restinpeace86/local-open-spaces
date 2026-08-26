# [수집기 본문(Contents) 필드 적재 보강 및 재수집(Re-ingest) 파이프라인 구축]

## 구현 대상
- `seoul_public_culture`/`gg_public`/`tourapi_4.0` 3개 수집기 어댑터의 본문/설명 필드
  적재 보강 (근본 원인 수정: 향후 수집분부터 정상 적재)
- 기존 22,146건(83.9%)의 누락된 본문을 채우는 백필 스크립트(`scripts/ingest/backfill-contents.mjs`)
- 본문 백필 후 target_audience 0~2단계 알고리즘 재실행 검증(읽기 전용, DB 반영 없음)

## 구현 일시
2026-08-27

## 핵심 발견 — 근본 원인은 "데이터 없음"이 아니라 "적재 누락 버그"

전날(2026-08-26) `docs/target-audience-analysis-report.md`는 `seoul_public_culture`/
`gg_public`/`tourapi_4.0` 세 소스의 `events.raw_data`가 완전히 빈 값이라 본문을 스캔할 수
없다고 보고했다. 이번 작업에서 재조사한 결과, 이는 **원천 API에 본문 자체가 없는 게
아니라 각 어댑터의 events 행 빌더가 이미 확보한 원본 item을 `raw_data`로 전달하지 않은
코드 버그**였다. 근거:
- `raw_ingest_data`(RAW 레이어, 원본 아카이브 전용 테이블)에는 이미 원본이 대부분
  보존돼 있었다(`SEOUL_CULTURE_EVENTS` 19,479건, `GG_CULTURE_EVENTS` 3,249+179건,
  `TOUR_API_FESTIVAL` 240건).
- 실측 확인 결과 서울시 문화행사는 `PROGRAM`(프로그램 소개)/`ETC_DESC`(기타내용), 경기
  재단행사(API2)는 `DTCONT`(단, `"-"` 플레이스홀더 다수 발견) 필드에 실제 본문이 있었다.
- TourAPI만 예외로, 목록 조회(`searchFestival2`) 원본에는 진짜로 본문 필드가 없다
  (실측 필드 전수 확인). 상세 조회(`detailCommon2`)를 호출해야 `overview`를 얻을 수
  있다 — 이미 검증된 기존 `detailIntro2` N+1-보강 패턴(`tour-api-v4-area-based-adapter.mjs`)
  과 동일 구조로 재사용했다.

## 변경 사항

### 1. 스키마
- `scripts/migrations/2026-08-26-events-description-column.sql`: `events.description text`
  컬럼 신설(소스마다 다른 JSONB 키를 매번 찾지 않도록 정제된 단일 설명 텍스트 전용).
  `ANALYZE public.events` + `npm run gen:types` 완료.

### 2. 수집기 어댑터 보강 (향후 수집분부터 정상 적재)
- `scripts/ingest/seoul-culture-events.mjs`: `mapToEventRow()`가 `raw_data: item`을
  전달하지 않던 버그 수정 + `description = PROGRAM + ETC_DESC` 결합.
- `scripts/ingest/adapters/gg-culture-events-adapter.mjs`: API1(문화행사)은 본문 필드
  자체가 없어 `description: null`이 정확한 값(실측 확인, 억지로 다른 필드를 끼워 넣지
  않음). API2(재단행사)는 `DTCONT`를 매핑하되 `"-"` 플레이스홀더는 `null`로 정리.
- `scripts/ingest/tour-api-festival.mjs`: 목록 조회 후 항목별로 `detailCommon2`를
  순차 호출(동시 요청 폭주 방지, 150ms 페이싱)해 `overview`를 확보. dry-run 시에는
  실제 API 호출을 생략해 미리보기 비용을 없앴다.
- `scripts/ingest/adapters/lib/schema-mapper.mjs`: `buildEventRow()`에 `description`
  파라미터 추가.

### 3. 백필 스크립트 (`scripts/ingest/backfill-contents.mjs`, 신규)
- Safe Merge 원칙: 모든 UPDATE를 `.is('raw_data', null)`로 스코프해 이미 채워진 행은
  절대 덮어쓰지 않는다. `category_maj`/`category_min`/`category_min_source`(MANUAL 포함)는
  이 스크립트가 다루는 컬럼이 아니라서 구조적으로 유실 불가능.
- `seoul_public_culture`/`gg_public`: `raw_ingest_data`(RAW 레이어)에서 순수 DB 내
  백필(외부 API 재호출 없음).
- `tourapi_4.0`: `raw_ingest_data`로 목록 데이터를 채우고, `detailCommon2`를 실제
  재호출해 `overview`까지 확보(진짜 재수집).
- 테스트: `scripts/ingest/backfill-contents.test.mjs`(7건, `extractDescription()` 순수
  함수 단위 테스트).

## 실행 결과 (실제 DB 반영 완료)

| 소스 | 대상(scanned) | 채움(filled) | RAW 없음 | overview 확보 |
| :--- | ---: | ---: | ---: | ---: |
| `seoul_public_culture` | 18,951 | 18,951 | 0 | - |
| `gg_public` | 2,955 | 2,955 | 0 | - |
| `tourapi_4.0` | 240 | 240 | 0 | 239 |

3개 소스 전체 22,146건 중 22,146건(100%) 백필 완료. TourAPI는 240건 중 239건에서 실제
`overview` 확보(1건은 원문 API 응답 자체에 개요가 없었던 것으로 추정, 개별 재시도는
범위 밖).

## target_audience 재검증 결과 (읽기 전용 시뮬레이션, DB 반영 없음)

`docs/target-audience-analysis-report.md`와 완전히 동일한 0~2단계 알고리즘(부정
소거/자동 확정/텍스트 파싱 키워드 규칙 전부 동일, 변경 없음)을 재사용하되, 스캔 대상
텍스트만 `title` 단독에서 `title + description`으로 확장해 재실행했다.

| 단계 | 이전(본문 백필 전) | 이후(본문 백필 후) | 증감 |
| :--- | ---: | ---: | ---: |
| ① 서울시 USETGTINFO 1:1 매핑 | 1,055건 | 1,055건 | 0 |
| ② 0단계 역방향 소거 | 2,583건 | 2,728건 | +145 |
| ③ 1단계 자동 확정 | 245건 | 248건 | +3 |
| ④ 2단계 텍스트 파싱 | 1,121건 | 1,203건 | +82 |
| ⑤ 최종 NULL 잔여 | 21,400건(81.05%) | 21,170건(80.18%) | **-230건(-0.87%p)** |

검산 일치 확인(1,055+2,728+248+1,203+21,170=26,404).

**중요한 정직한 보고 — 매칭률이 "대폭 상승"하지 않았다.** 지시문 3번 항목("매칭률이
대폭 상승하는지 검증")의 가설과 달리, 실측 결과는 소폭 개선(230건, 전체의 0.87%p)에
그쳤다. 원인 분석: `PROGRAM`/`DTCONT`/`overview` 같은 본문 필드는 대부분 "전시 개요",
"공연 소개" 같은 홍보성 서술이지, "이용대상"처럼 대상 연령을 명시적으로 표기하는
구조화된 필드가 아니다 — 즉 본문이 채워져도 제목과 마찬가지로 "연령 무관 일반 문화
콘텐츠 서술"인 경우가 대부분이라 텍스트 키워드 매칭으로는 근본적인 개선 폭이 크지
않다는 것이 이번 재검증으로 실측 확인됐다(추측이 아니라 실제 재실행 결과).

## 검증
- `npx tsc --noEmit`: 통과(오류 없음)
- `npm run test`: Test Files 43 passed (43), Tests 444 passed (444) (기존 437건 + 신규 7건)
- `npm run build`: 성공 (Compiled successfully, 전체 라우트 정상 생성)
- 백필 스크립트 dry-run → 실제 실행 순으로 검증 후 실행, 결과 수치 위 표에 기록
- target_audience 재검증은 임시 스크립트(`scripts/_tmp-target-audience-recheck.mjs`)로
  실행 후 즉시 삭제(DB/저장소에 흔적 없음, 이전 분석과 동일한 관례)

## 미결 사항 (승인 대기, 변경 없음)
- `events.target_audience`/`target_audience_source` 컬럼 추가 및 실제 UPDATE는 여전히
  미승인 상태 — 이번 작업에서도 스키마/데이터 변경 없이 순수 검증만 수행했다.
- `docs/target-audience-analysis-report.md` 8절의 미결 사항(성인 313건 처리 방침,
  추가 키워드 제안 채택 여부)은 이번 작업 범위 밖으로 그대로 유지된다.
