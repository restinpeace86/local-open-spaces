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

| 실행 일시 | 수집 권역 | RAW 적재 건수 | Service 적재 건수 | 파싱 에러 | 상태 | 비고 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
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
