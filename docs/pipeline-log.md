# ETL Data Ingestion & Pipeline Health Log

본 문서는 Daily Data Ingestion 파이프라인의 실행 결과 및 데이터 무결성 상태를 기록합니다.

[긴급 아키텍처 개편(2026-08-25)]: RAW 레이어(`raw_ingest_data`) 도입에 맞춰 "총 수집 건수"
한 칸을 "RAW 적재 건수"(원본 API 응답을 무오염 보존한 건수)와 "Service 적재 건수"(표준
스키마로 변환해 `events`/`open_spaces`에 최종 upsert된 건수)로 나눴다. RAW 레이어를 아직
쓰지 않는(opt-in 안 한) 어댑터는 "RAW 적재 건수"에 `-`가 찍힌다 — 기존 로그 행은 이 변경
이전 형식 그대로 보존한다(과거 기록을 소급 수정하지 않음).

[Decision 017(2026-08-25)]: 하나의 원본이 여러 표준 테이블(open_spaces/events)로 나뉘어
적재되는 다중 테이블 어댑터는 표 아래에 접이식(`<details>`) 상세 리포트를 추가로 남긴다 —
테이블별 가져온/적재 건수, 배치 내 SVCID 중복(NULL 병합) 건수, 기존 DB 행과 병합된 건수,
범위 제외 건수, 원인별 에러 건수(예: `DATE_PARSE_FAIL`).

[배치 자동화 및 로깅 체계 확정(2026-08-26)]: 위 표는 "소스 1개 실행 1행"이라 소스별
개별 실행 기록에는 맞지만, 여러 소스를 한 번에 묶어 도는 배치(`scripts/ingest/run-daily.mjs`/
`run-monthly.mjs`) 단위 기록에는 맞지 않아 이 문서 맨 아래에 `## [타임스탬프] [배치명]
Ingestion Log` 형식으로 별도 블록을 추가한다(기존 표는 그대로 유지, 대체 아님). 소스별
`RAW 수신 건수`/`events 적재 건수`/`open_spaces 적재 건수`/`Safe Merge 건수`(배치 내 중복
병합 + 기존 DB 행 병합 합계)/`에러 건수`(진짜로 어느 테이블에도 적재되지 않고 범위 제외
대상도 아닌 건수만 — 좌표 파싱 실패처럼 값은 이상해도 행은 정상 적재된 경우는 포함하지
않는다)를 표로 남긴 뒤, 배치 전체의 "RAW 수신 vs (적재+에러+범위제외)"를 대조해 드롭 0건
여부를 검증 문구로 명시한다. 신규 수집이 아니라 이미 적재된 행을 보강하는 후처리 단계
(예: `enrich-gg-culture-event-locations`)는 표에는 남기되 이 드롭 검증 합계에는 넣지
않는다(같은 행이 이중 집계되는 것을 방지).
분류 기준(코드 분석 기반, 임의 추측 아님 — 각 어댑터의 실제 `targetTable`을 직접 확인):
Daily Events Batch = `events` 테이블 전용 API 전체 + `events`/`open_spaces` 양쪽에 적재하는
복합 API(`SeoulYeyakAdapter`, `targetTable: 'multi'`). Weekly/Monthly Spaces Batch =
`open_spaces` 테이블로만 적재하는 API 전체. 상세 근거는 `scripts/ingest/run-daily.mjs`/
`run-monthly.mjs` 상단 주석 참고.

[배치 스케줄링 조정(2026-08-26)]: open_spaces 전용 배치(고정 장소/시설 데이터, 변경
빈도가 매우 낮음)를 API 호출 낭비/DB 부하 절감을 위해 최초 구축한 Weekly(주간) 스케줄에서
Monthly(월 1회, 매월 1일 새벽)로 전환했다. 파일명(`run-weekly.mjs`→`run-monthly.mjs`,
`ingest-weekly.yml`→`ingest-monthly.yml`)과 헤더 배치명(`Weekly Spaces Batch`→
`Monthly Spaces Batch`)만 바뀌고 대상 API 목록/분류 기준/드롭 검증 로직은 변경 없다.
전환 이전에 이미 기록된 `[Weekly Spaces Batch]` 로그 블록은 소급 수정하지 않고 그대로
보존한다(위 "과거 기록을 소급 수정하지 않음" 원칙 동일 적용) — 앞으로의 실행부터
`[Monthly Spaces Batch]` 헤더로 기록된다.

[배치 스케줄링 조정 - cron 정밀화(2026-08-26)]: "KST 매월 1일 새벽 02:00 정확히 실행"을
GitHub Actions cron으로 직접 표현할 수 없다는 사실을 확인했다 — GitHub Actions는 표준
5필드 POSIX cron(vixie-cron 방언)만 지원하고 Quartz 전용 확장 토큰인 `L`(마지막 날)을
지원하지 않는다. 대신 `0 17 28-31 * *`(매월 28~31일 17:00 UTC마다 깨어남) + "내일(UTC)이
1일인지" 확인하는 가드 스텝을 `ingest-monthly.yml`에 추가해, 그 달의 진짜 마지막 날에만
실제 배치가 실행되도록 했다 — 수학적으로 "매월 1일 KST 02:00 정확히 1회 실행"과 동일한
결과다. `workflow_dispatch`(수동 실행)는 이 가드를 건너뛴다.

| 실행 일시 | 수집 권역 | RAW 적재 건수 | Service 적재 건수 | 파싱 에러 | 상태 | 비고 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 2026-08-29 16:36 | GG_KIDSCAFE | 2897 | 1892 | 1026 | ✅ [OK] |  |
| 2026-08-29 15:52 | LOCALDATA_PLAYGROUND | 85297 | 82381 | 2917 | ✅ [OK] |  |
| 2026-08-29 15:38 | LOCALDATA_PLAYGROUND | 85297 | 82381 | 2917 | ✅ [OK] |  |
| 2026-08-29 11:47 | SEOUL_YEYAK | 2851 | 2851 | 30 | ✅ [OK] |  |
| 2026-08-29 11:36 | GG_CULTURE_EVENTS | 3249 | 2955 | 294 | ✅ [OK] |  |
| 2026-08-28 11:07 | SEOUL_YEYAK | 2876 | 2876 | 29 | ✅ [OK] |  |
| 2026-08-28 10:19 | SEOUL_YEYAK | 2876 | 1586 | 1319 | 🚨 [CRITICAL] | 테이블별 부분 실패: open_spaces(open_spaces upsert 실패: canceling statement due to statement timeout) |
| 2026-08-28 10:15 | SEOUL_YEYAK | - | 0 | N/A | 🚨 [CRITICAL] | open_spaces upsert 실패: canceling statement due to statement timeout |
| 2026-08-28 09:58 | SEOUL_YEYAK | - | 0 | N/A | 🚨 [CRITICAL] | open_spaces upsert 실패: canceling statement due to statement timeout |
| 2026-08-28 09:50 | GG_CULTURE_EVENTS | 3249 | 2955 | 294 | ✅ [OK] |  |
| 2026-08-28 09:39 | GG_CULTURE_EVENTS | 3249 | 2955 | 294 | ✅ [OK] |  |
| 2026-08-28 09:26 | GG_CULTURE_EVENTS | 3249 | 2955 | 294 | ✅ [OK] |  |
| 2026-08-26 00:25 | KOR_PET_TOUR | 857 | 857 | 0 | ✅ [OK] |  |
| 2026-08-26 00:25 | KOR_WITH_TOUR | 5041 | 5040 | 1 | ✅ [OK] |  |
| 2026-08-26 00:25 | KOR_SERVICE | 19146 | 19144 | 2 | ✅ [OK] |  |
| 2026-08-26 00:23 | SWIMMING_POOL | 2546 | 1542 | 1018 | ✅ [OK] |  |
| 2026-08-26 00:23 | PUBLIC_FACILITY_OPEN | 7113 | 7113 | 216 | ✅ [OK] |  |
| 2026-08-26 00:23 | LOCALDATA_PLAYGROUND | 85289 | 82372 | 2918 | ✅ [OK] |  |
| 2026-08-26 00:18 | NATIONAL_PARK_ECOTOUR | 109 | 83 | 27 | ✅ [OK] |  |
| 2026-08-26 00:17 | GO_CAMPING | 3103 | 3093 | 10 | ✅ [OK] |  |
| 2026-08-26 00:17 | GG_EVENTS | 1302 | 1199 | 106 | ✅ [OK] |  |
| 2026-08-26 00:10 | LOCALDATA_AMUSEMENT | 7009 | 2506 | 4698 | ✅ [OK] |  |
| 2026-08-26 00:10 | CULTURAL_FACILITY_SUMMARY | 3061 | 2907 | 167 | ✅ [OK] |  |
| 2026-08-25 23:59 | CITY_PARK | 17079 | 17079 | 2076 | ✅ [OK] |  |
| 2026-08-25 23:58 | SEOUL_YEYAK | 2902 | 2902 | 29 | ✅ [OK] |  |
| 2026-08-25 23:52 | GG_CULTURE_EVENTS | 3249 | 2955 | 294 | ✅ [OK] |  |
| 2026-08-25 22:58 | SEOUL_YEYAK | 2902 | 2902 | 29 | ✅ [OK] |  |
| 2026-08-25 22:49 | GG_CULTURE_EVENTS | 3249 | 2955 | 294 | ✅ [OK] |  |
| 2026-08-25 21:32 | LOCALDATA_AMUSEMENT | 7009 | 2506 | 4698 | ✅ [OK] |  |
| 2026-08-25 21:30 | GG_CULTURE_EVENTS | 3249 | 2955 | 294 | ✅ [OK] |  |
| 2026-08-25 21:28 | GG_EVENTS | 1302 | 1199 | 106 | ✅ [OK] |  |
| 2026-08-25 21:21 | NATIONAL_PARK_ECOTOUR | 109 | 83 | 27 | ✅ [OK] |  |
| 2026-08-25 21:21 | CULTURAL_FACILITY_SUMMARY | 3061 | 2898 | 176 | ✅ [OK] |  |
| 2026-08-25 21:18 | KOR_PET_TOUR | 857 | 857 | 0 | ✅ [OK] |  |
| 2026-08-25 21:18 | KOR_WITH_TOUR | 5041 | 5040 | 1 | ✅ [OK] |  |
| 2026-08-25 21:18 | KOR_SERVICE | 19146 | 19144 | 2 | ✅ [OK] |  |
| 2026-08-25 21:16 | GO_CAMPING | 3103 | 3093 | 10 | ✅ [OK] |  |
| 2026-08-25 21:16 | SWIMMING_POOL | 2546 | 1542 | 1018 | ✅ [OK] |  |
| 2026-08-25 21:16 | PUBLIC_FACILITY_OPEN | 7113 | 7113 | 216 | ✅ [OK] |  |
| 2026-08-25 21:15 | LOCALDATA_PLAYGROUND | 85289 | 82372 | 2918 | ✅ [OK] |  |
| 2026-08-25 21:10 | CITY_PARK | 17079 | 17079 | 2076 | ✅ [OK] |  |
| 2026-08-25 20:05 | SEOUL_YEYAK | 2877 | 2877 | 29 | ✅ [OK] |  |
| 2026-08-25 20:03 | SEOUL_YEYAK | 2877 | 2877 | 29 | ✅ [OK] |  |
| 2026-08-25 20:01 | SEOUL_YEYAK | - | 0 | N/A | 🚨 [CRITICAL] | open_spaces 기존 행 조회 실패: TypeError: fetch failed |
| 2026-08-25 20:00 | SEOUL_YEYAK | - | 0 | N/A | 🚨 [CRITICAL] | open_spaces 기존 행 조회 실패: TypeError: fetch failed |
| 2026-08-25 12:28 | GG_CULTURE_EVENTS | - | 2955 | 294 | ✅ [OK] |  |
| 2026-08-25 09:00 | 서울/경기 | - | - | - | 🟡 [INITIALIZED] | 모니터링 체계 구축 완료 |

<details>
<summary>2026-08-25 20:03 SEOUL_YEYAK 상세 리포트</summary>

**테이블별 적재**

| 테이블 | 가져온 건수 | DB 적재 건수 | 배치 내 중복(NULL 병합) | 기존 DB 병합 |
| :--- | ---: | ---: | ---: | ---: |
| open_spaces | 1282 | 1282 | 0 | 0 |
| events | 1595 | 1595 | 0 | 1407 |

**범위 제외**: 29건

**에러 상세**

| 원인 | 건수 |
| :--- | ---: |
| COORDINATE_PARSE_FAIL | 15 |

</details>

<details>
<summary>2026-08-25 20:05 SEOUL_YEYAK 상세 리포트</summary>

**테이블별 적재**

| 테이블 | 가져온 건수 | DB 적재 건수 | 배치 내 중복(NULL 병합) | 기존 DB 병합 |
| :--- | ---: | ---: | ---: | ---: |
| open_spaces | 1282 | 1282 | 0 | 1282 |
| events | 1595 | 1595 | 0 | 589 |

**범위 제외**: 29건

**에러 상세**

| 원인 | 건수 |
| :--- | ---: |
| COORDINATE_PARSE_FAIL | 15 |

</details>

<details>
<summary>2026-08-25 22:58 SEOUL_YEYAK 상세 리포트</summary>

**테이블별 적재**

| 테이블 | 가져온 건수 | DB 적재 건수 | 배치 내 중복(NULL 병합) | 기존 DB 병합 |
| :--- | ---: | ---: | ---: | ---: |
| open_spaces | 1280 | 1280 | 0 | 1278 |
| events | 1622 | 1622 | 0 | 1592 |

**범위 제외**: 29건

**에러 상세**

| 원인 | 건수 |
| :--- | ---: |
| COORDINATE_PARSE_FAIL | 15 |

</details>

## [2026-08-25 22:58:34] [Daily Events Batch] Ingestion Log

| API 출처 식별자 (`source`) | RAW 수신 건수 | events 적재 건수 | open_spaces 적재 건수 | Safe Merge 건수 | 에러 건수 | 비고 |
| :--- | ---: | ---: | ---: | ---: | ---: | :--- |
| gg_public | 3249 | 2955 | 0 | 2955 | 294 |  |
| seoul_public_culture | 19498 | 18951 | 0 | 18969 | 547 |  |
| tourapi_4.0 | 240 | 240 | 0 | 240 | 0 |  |
| seoul_public_reservation | 2931 | 1622 | 1280 | 2870 | 15 |  |
| gg_public | 10 | 0 | 0 | 0 | 10 | 좌표 정밀도 보강 후처리(신규 적재 아님, gg-culture-events 종속) — EXACT 승격 0/10건, URL복원실패 0/장소필드없음 1/지오코딩실패 9 |

**검증**: 전체 RAW 수신 25918건 vs DB 적재 25048건 (+에러 856건 +범위제외 29건) → **드롭 -15건 발견 ⚠️** (원인 미상 — 개별 소스 행 확인 필요)

<details>
<summary>2026-08-25 23:58 SEOUL_YEYAK 상세 리포트</summary>

**테이블별 적재**

| 테이블 | 가져온 건수 | DB 적재 건수 | 배치 내 중복(NULL 병합) | 기존 DB 병합 |
| :--- | ---: | ---: | ---: | ---: |
| open_spaces | 1280 | 1280 | 0 | 1280 |
| events | 1622 | 1622 | 0 | 1622 |

**범위 제외**: 29건

**에러 상세**

| 원인 | 건수 |
| :--- | ---: |
| COORDINATE_PARSE_FAIL | 15 |

</details>

## [2026-08-25 23:58:12] [Daily Events Batch] Ingestion Log

| API 출처 식별자 (`source`) | RAW 수신 건수 | events 적재 건수 | open_spaces 적재 건수 | Safe Merge 건수 | 에러 건수 | 비고 |
| :--- | ---: | ---: | ---: | ---: | ---: | :--- |
| gg_public | 3249 | 2955 | 0 | 2955 | 294 |  |
| seoul_public_culture | 19498 | 18951 | 0 | 18969 | 547 |  |
| tourapi_4.0 | 240 | 240 | 0 | 240 | 0 |  |
| seoul_public_reservation | 2931 | 1622 | 1280 | 2902 | 0 |  |
| gg_public | 10 | 0 | 0 | 0 | 10 | 좌표 정밀도 보강 후처리(신규 적재 아님, gg-culture-events 종속) — EXACT 승격 0/10건, URL복원실패 0/장소필드없음 1/지오코딩실패 9 |

**검증**: 전체 RAW 수신 25918건 vs DB 적재 25048건 (+에러 841건 +범위제외 29건) → **드롭 0건 확인 ✅**

## [2026-08-26 00:25:46] [Weekly Spaces Batch] Ingestion Log

| API 출처 식별자 (`source`) | RAW 수신 건수 | events 적재 건수 | open_spaces 적재 건수 | Safe Merge 건수 | 에러 건수 | 비고 |
| :--- | ---: | ---: | ---: | ---: | ---: | :--- |
| city_park | 19155 | 0 | 17079 | 19155 | 2076 |  |
| seoul_public_culture | 1079 | 0 | 1078 | 1078 | 1 |  |
| cultural_facility_summary | 3074 | 0 | 2907 | 2901 | 167 |  |
| localdata_amusement | 7204 | 0 | 2506 | 2515 | 4698 |  |
| gg_public | 1305 | 0 | 1199 | 1201 | 106 |  |
| tourapi_4.0 | 3103 | 0 | 3093 | 3093 | 10 |  |
| national_park_ecotour | 110 | 0 | 83 | 84 | 27 |  |
| localdata_playground | 85290 | 0 | 82372 | 82372 | 2918 |  |
| public_facility_open | 7329 | 0 | 7113 | 7329 | 216 |  |
| swimming_pool | 2560 | 0 | 1542 | 1542 | 1018 |  |
| tourapi_4.0 | 19146 | 0 | 19144 | 19144 | 2 |  |
| tourapi_4.0 | 5041 | 0 | 5040 | 5040 | 1 |  |
| tourapi_4.0 | 857 | 0 | 857 | 857 | 0 |  |

**검증**: 전체 RAW 수신 155253건 vs DB 적재 144013건 (+에러 11240건 +범위제외 0건) → **드롭 0건 확인 ✅**

<details>
<summary>2026-08-28 10:19 SEOUL_YEYAK 상세 리포트</summary>

**테이블별 적재**

| 테이블 | 가져온 건수 | DB 적재 건수 | 배치 내 중복(NULL 병합) | 기존 DB 병합 |
| :--- | ---: | ---: | ---: | ---: |
| open_spaces | 1290 | 0 | 0 | 0 |
| events | 1586 | 1586 | 0 | 1506 |

**범위 제외**: 29건

**에러 상세**

| 원인 | 건수 |
| :--- | ---: |
| COORDINATE_PARSE_FAIL | 15 |

</details>

<details>
<summary>2026-08-28 11:07 SEOUL_YEYAK 상세 리포트</summary>

**테이블별 적재**

| 테이블 | 가져온 건수 | DB 적재 건수 | 배치 내 중복(NULL 병합) | 기존 DB 병합 |
| :--- | ---: | ---: | ---: | ---: |
| open_spaces | 1290 | 1290 | 0 | 1276 |
| events | 1586 | 1586 | 0 | 1586 |

**범위 제외**: 29건

**에러 상세**

| 원인 | 건수 |
| :--- | ---: |
| COORDINATE_PARSE_FAIL | 15 |

</details>

## [2026-08-29 10:43:54] [Daily Events Batch] Ingestion Log

| API 출처 식별자 (`source`) | RAW 수신 건수 | events 적재 건수 | open_spaces 적재 건수 | Safe Merge 건수 | 에러 건수 | 비고 |
| :--- | ---: | ---: | ---: | ---: | ---: | :--- |
| GG_CULTURE_EVENTS | - | 0 | 0 | 0 | - | ❌ 실행 실패: GG_DATA_API_KEY 환경변수가 설정되지 않았습니다. |
| SEOUL_CULTURE_EVENTS | - | 0 | 0 | 0 | - | ❌ 실행 실패: 서울 열린데이터광장 응답이 JSON이 아닙니다: <RESULT><CODE>INFO-100</CODE><MESSAGE><![CDATA[인증키가 유효하지 않습니다.
인증키가 없는 경우, 열린 데이터 광장 홈페이지에서 인증키를 신청하십시오.]]></MESSAGE></RESULT> |
| TOUR_API_FESTIVAL | - | 0 | 0 | 0 | - | ❌ 실행 실패: fetch failed |
| SEOUL_YEYAK | - | 0 | 0 | 0 | - | ❌ 실행 실패: SEOUL_OPEN_DATA_KEY 환경변수가 설정되지 않았습니다. |
| gg_public | - | 0 | 0 | 0 | - | ❌ 실행 실패: GG_CULTURE_EVENTS 실패로 건너뜀 |
| CATEGORY_RULES_APPLICATION | - | 0 | 0 | 0 | - | ❌ 실행 실패: NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 없습니다. |
| DETAILED_CATEGORY_FALLBACK | - | 0 | 0 | 0 | - | ❌ 실행 실패: NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 없습니다. |
| LEGACY_SOURCE_CATEGORY_MAPPING | - | 0 | 0 | 0 | - | ❌ 실행 실패: NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 없습니다. |
| DEACTIVATE_EXPIRED_EVENTS | - | 0 | 0 | 0 | - | ❌ 실행 실패: NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 없습니다. |
| DEDUPE_OPEN_SPACES | - | 0 | 0 | 0 | - | ❌ 실행 실패: NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 없습니다. |
| ANALYZE_OPEN_SPACES | - | 0 | 0 | 0 | - | ❌ 실행 실패: NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 없습니다. |

**검증**: 전체 RAW 수신 0건(일부 소스 실패/미확인 — 완전한 대조 불가) vs DB 적재 0건 (+에러 0건 +범위제외 0건)

## [2026-08-29 10:59:06] [Daily Events Batch] Ingestion Log

| API 출처 식별자 (`source`) | RAW 수신 건수 | events 적재 건수 | open_spaces 적재 건수 | Safe Merge 건수 | 에러 건수 | 비고 |
| :--- | ---: | ---: | ---: | ---: | ---: | :--- |
| GG_CULTURE_EVENTS | - | 0 | 0 | 0 | - | ❌ 실행 실패: GG_DATA_API_KEY 환경변수가 설정되지 않았습니다. |
| SEOUL_CULTURE_EVENTS | - | 0 | 0 | 0 | - | ❌ 실행 실패: 서울 열린데이터광장 응답이 JSON이 아닙니다: <RESULT><CODE>INFO-100</CODE><MESSAGE><![CDATA[인증키가 유효하지 않습니다.
인증키가 없는 경우, 열린 데이터 광장 홈페이지에서 인증키를 신청하십시오.]]></MESSAGE></RESULT> |
| TOUR_API_FESTIVAL | - | 0 | 0 | 0 | - | ❌ 실행 실패: fetch failed |
| SEOUL_YEYAK | - | 0 | 0 | 0 | - | ❌ 실행 실패: SEOUL_OPEN_DATA_KEY 환경변수가 설정되지 않았습니다. |
| gg_public | - | 0 | 0 | 0 | - | ❌ 실행 실패: GG_CULTURE_EVENTS 실패로 건너뜀 |
| CATEGORY_RULES_APPLICATION | - | 0 | 0 | 0 | - | ❌ 실행 실패: NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 없습니다. |
| DETAILED_CATEGORY_FALLBACK | - | 0 | 0 | 0 | - | ❌ 실행 실패: NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 없습니다. |
| LEGACY_SOURCE_CATEGORY_MAPPING | - | 0 | 0 | 0 | - | ❌ 실행 실패: NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 없습니다. |
| DEACTIVATE_EXPIRED_EVENTS | - | 0 | 0 | 0 | - | ❌ 실행 실패: NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 없습니다. |
| DEDUPE_OPEN_SPACES | - | 0 | 0 | 0 | - | ❌ 실행 실패: NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 없습니다. |
| ANALYZE_OPEN_SPACES | - | 0 | 0 | 0 | - | ❌ 실행 실패: NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 없습니다. |

**검증**: 전체 RAW 수신 0건(일부 소스 실패/미확인 — 완전한 대조 불가) vs DB 적재 0건 (+에러 0건 +범위제외 0건)

<details>
<summary>2026-08-29 11:47 SEOUL_YEYAK 상세 리포트</summary>

**테이블별 적재**

| 테이블 | 가져온 건수 | DB 적재 건수 | 배치 내 중복(NULL 병합) | 기존 DB 병합 |
| :--- | ---: | ---: | ---: | ---: |
| open_spaces | 1296 | 1296 | 0 | 1285 |
| events | 1555 | 1555 | 0 | 1530 |

**범위 제외**: 30건

**에러 상세**

| 원인 | 건수 |
| :--- | ---: |
| COORDINATE_PARSE_FAIL | 15 |

</details>

## [2026-08-29 11:50:19] [Daily Events Batch] Ingestion Log

| API 출처 식별자 (`source`) | RAW 수신 건수 | events 적재 건수 | open_spaces 적재 건수 | Safe Merge 건수 | 에러 건수 | 비고 |
| :--- | ---: | ---: | ---: | ---: | ---: | :--- |
| gg_public | 3249 | 2955 | 0 | 2955 | 294 |  |
| seoul_public_culture | 19506 | 18959 | 0 | 18953 | 547 |  |
| tourapi_4.0 | 264 | 264 | 0 | 250 | 0 |  |
| seoul_public_reservation | 2881 | 1555 | 1296 | 2815 | 0 |  |
| gg_public | 10 | 0 | 0 | 0 | 10 | 좌표 정밀도 보강 후처리(신규 적재 아님, gg-culture-events 종속) — EXACT 승격 0/10건, URL복원실패 0/장소필드없음 1/지오코딩실패 9 |
| CATEGORY_RULES_APPLICATION | 17483 | 24 | 0 | 0 | 0 | category_min 신규 룰 매칭 후처리(신규 적재 아님) — open_spaces 0/2101건, events 24/15382건 |
| DETAILED_CATEGORY_FALLBACK | 0 | 0 | 0 | 0 | 0 | 세부 중분류 미분류 잔여를 '기타'로 안전 적재(8개 대상 source_type 한정) — 0/0건 |
| LEGACY_SOURCE_CATEGORY_MAPPING | 0 | 0 | 0 | 0 | 0 | docs/null-category-analysis.md 적용 범위(어린이놀이시설/수영장/키즈카페/바닥분수·물놀이시설) 매핑 — 0건, 내역: {} |
| DEACTIVATE_EXPIRED_EVENTS | 92 | 92 | 0 | 0 | 0 | end_date < 2026-08-29 이면서 is_active=true였던 행 92건을 false로 전환(신규 적재 아닌 만료 정리 후처리) |
| DEDUPE_OPEN_SPACES | 0 | 0 | 0 | 0 | 0 | 교차 출처 중복 정제 완료 — 0개 그룹, survivor 병합 0건, 삭제 0건 |
| ANALYZE_OPEN_SPACES | 0 | 0 | 0 | 0 | 0 | open_spaces 플래너 통계 갱신 완료(신규 적재 아닌 유지보수 후처리) — statement timeout 재발 방지 |

**검증**: 전체 RAW 수신 25900건 vs DB 적재 25029건 (+에러 841건 +범위제외 30건) → **드롭 0건 확인 ✅**
