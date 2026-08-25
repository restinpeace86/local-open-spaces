# 전체 파이프라인 일괄 가동: 검증된 표준 ETL 포맷을 전체 17개 Source에 적용 및 전수 적재

## 구현 대상
- 사용자 지시([전체 파이프라인 일괄 가동], 2026-08-25): SeoulYeyakAdapter에서 검증된 표준
  ETL 포맷(events/open_spaces 표준 매핑 + COALESCE Safe UPSERT + raw_ingest_data 보존)을
  프로젝트에 등록된 모든 수집 어댑터(17개 Source)에 적용하고 일괄 가동, DB에 전수 적재
- 수집 완료 후 `raw_ingest_data`/`open_spaces`/`events`의 source별 건수 리포팅
- `/admin/data-grid`에서 source별 조회/필터링 최종 검증

## 구현 일시
2026-08-25

## 변경 사항

### 코드: 17개 Source에 source 컬럼 태깅 + RAW 레이어 opt-in 적용
- **BaseCollectorAdapter 공통 변경**: `run()`의 단일 테이블 경로(open_spaces 또는 events 하나만
  쓰는 24개 기존 어댑터)가 `upsertRows()` 대신 `upsertRowsSafeMerge()`를 쓰도록 승격했다 —
  Decision 017이 `targetTable: 'multi'` 어댑터에만 적용했던 COALESCE Safe UPSERT를 전체
  어댑터 공통 기본값으로 확장. 재수집 시 원본 API가 일시적으로 일부 필드를 비워 보내도 기존
  실데이터가 NULL로 되돌아가지 않는다.
- **13개 BaseCollectorAdapter 기반 어댑터**(city-park, amusement-park, cultural-facility-summary,
  gg-events, gg-culture-events, go-camping, national-park-ecotour, playground,
  public-facility-open, swimming-pool, kor-tour/kor-with-tour/kor-pet-tour — 마지막 3개는 공유
  베이스 클래스 `tour-api-v4-area-based-adapter.mjs` 한 곳만 수정해 전부 적용됨): 각 어댑터에
  `source` 상수(원천 식별자) 추가 + `getRawRows()` opt-in 훅 추가. 원본에 안정적 고유 ID가
  있으면 그대로(manageNo/contentid/pfctSn/faci_cd 등), 없으면 external_id 생성에 이미 쓰던
  것과 동일한 결정적 해시(이름+주소 SHA1)를 재사용해 sourceId를 만들었다.
- **3개 레거시 독립 스크립트**(cultural-spaces.mjs, seoul-culture-events.mjs,
  tour-api-festival.mjs — BaseCollectorAdapter를 쓰지 않고 schema-mapper.mjs도 거치지 않는
  구조): `upsertRawIngestData`/`upsertRowsSafeMerge` 호출과 `source` 필드를 인라인으로
  추가했다.
- SeoulYeyakAdapter는 지난 세션(Decision 017)에서 이미 이 포맷을 갖추고 있어 재작업하지
  않았고, 이번 일괄 가동에도 재수집하지 않았다(이미 최신 상태).

### 실행: 3개 배치로 병렬 가동 (API 제공처별 그룹, DB 커넥션 과부하 방지)
- Batch A(PUBLIC_DATA_API_KEY, 지오코딩 불필요 9개): city-park, playground,
  public-facility-open, swimming-pool, go-camping, kor-tour, kor-with-tour, kor-pet-tour,
  tour-api-festival — 전부 성공.
- Batch B(SEOUL_OPEN_DATA_KEY 2개): cultural-spaces, seoul-culture-events — 전부 성공.
- Batch C(VWorld 지오코딩 필요 5개, 레이트리밋 회피 위해 배치 내부는 순차 실행):
  cultural-facility-summary, national-park-ecotour, gg-events, gg-culture-events,
  enrich-gg-culture-event-locations(후처리 — gg-culture-events가 남긴 CITY_APPROX/UNKNOWN
  좌표를 상세 페이지 스크래핑으로 EXACT 승격) — 전부 성공.
- amusement-park는 코드는 수정했으나 최초 배치 계획에서 누락돼 별도로 추가 실행했다(아래
  특이사항 참고).

### DB 성능: 실행/검증 과정에서 발견한 플래너 문제 3건을 추가로 수정
- **[핵심 발견] `source` 컬럼의 planner 통계 부재**: `source IS NOT NULL` 조건의 추정
  매칭 행 수가 실제 1,282건인데 119,812건으로 완전히 잘못 추정돼 있었다(컬럼을 오늘 막
  추가·백필한 뒤 ANALYZE가 한 번도 안 돎) — `ANALYZE public.open_spaces` 한 번으로 해당
  조건의 조회가 9.3초 → 19ms로 개선됐다.
- **`open_spaces`/`events`에 `(source, created_at DESC NULLS LAST)` 복합 인덱스 추가**
  (`scripts/migrations/2026-08-25-admin-data-grid-perf-indexes.sql`에 추가): 17개 어댑터
  전부가 source를 채우게 되면서 "source로 필터 + created_at 정렬"(관리자 그리드의 실제
  조회 패턴)에서 옵티마이저가 관련 없는 행을 수만~십만 건 훑고 지나가는 문제를 실측으로
  확인(16.2초). 복합 인덱스로 10.9ms까지 개선.
- **`.in()`이 만드는 `= ANY(array[...])`가 위 복합 인덱스를 여전히 무시하는 별개의 플래너
  버그성 동작 확인**: 단일 값 `=` 비교는 인덱스를 정확히 쓰지만 1개짜리 배열의 `ANY()`는
  옵티마이저가 다른(느린) 플랜을 고른다(ANALYZE 재실행으로도 해결 안 됨 — 실측). 관리자
  그리드에서 단일 값을 선택하는 것이 흔한 UX라 `src/app/api/admin/data-grid/route.ts`에서
  선택값이 1개면 `.eq()`, 2개 이상이면 `.in()`을 쓰도록 분기해 우회했다(16초 → 1.1초).
- **`/admin/data-grid` 필터 옵션 RPC 재구성**: 17개 어댑터 전부가 source를 채우면서 기존
  `get_open_spaces_filter_options`(여러 컬럼을 하나의 RPC로 묶은 버전)이 다시 8초
  타임아웃 근처로 불안정해졌다 — 컬럼당 완전히 독립된 단일 컬럼 RPC 4종
  (`get_open_spaces_source_type_options`/`get_open_spaces_category_options`/
  `get_open_spaces_source_options`/`get_open_spaces_seoul_yeyak_options`, 마지막은
  `source = 'seoul_public_reservation'` 동등 비교로 좁힘)으로 쪼개 각각 안정적으로
  8초 한도 안에서 끝나도록 했다(`scripts/migrations/2026-08-25-admin-data-grid-rpcs.sql`).

## 검증 결과

### DB 리포트 (수집 완료 후 direct 쿼리)

**raw_ingest_data (source별)**
| source | 건수 |
| :--- | ---: |
| LOCALDATA_PLAYGROUND | 85,289 |
| SEOUL_CULTURE_EVENTS | 19,479 |
| KOR_SERVICE | 19,146 |
| CITY_PARK | 17,079 |
| PUBLIC_FACILITY_OPEN | 7,113 |
| LOCALDATA_AMUSEMENT | 7,009 |
| KOR_WITH_TOUR | 5,041 |
| GG_CULTURE_EVENTS | 3,249 |
| GO_CAMPING | 3,103 |
| CULTURAL_FACILITY_SUMMARY | 3,061 |
| SEOUL_YEYAK | 2,877 |
| SWIMMING_POOL | 2,546 |
| GG_EVENTS | 1,302 |
| CULTURE_SPACE | 1,079 |
| KOR_PET_TOUR | 857 |
| TOUR_API_FESTIVAL | 240 |
| NATIONAL_PARK_ECOTOUR | 109 |
| **합계** | **179,579건** |

**open_spaces (source별)**
| source | 건수 |
| :--- | ---: |
| localdata_playground | 82,372 |
| tourapi_4.0 (go-camping+kor-tour+with+pet, contentid 기준 통합) | 22,237 |
| city_park | 17,079 |
| public_facility_open | 7,113 |
| cultural_facility_summary | 2,898 |
| localdata_amusement | 2,506 |
| swimming_pool | 1,542 |
| seoul_public_reservation | 1,282 |
| gg_public | 1,199 |
| seoul_public_culture | 1,078 |
| national_park_ecotour | 83 |
| (source 미설정 — 기존 미마이그레이션 잔여) | 29 |

**events (source별)**
| source | 건수 |
| :--- | ---: |
| seoul_public_culture | 18,951 |
| gg_public | 2,955 |
| (source 미설정 — 아래 특이사항 참고) | 2,633 |
| seoul_public_reservation | 1,595 |
| tourapi_4.0 | 240 |

### /admin/data-grid 검증
- 전체 11개 source 값 각각으로 필터링해 정확한 부분집합만 반환됨을 확인(응답 시간 0.16~1.1초).
- 페이지 로드(요약 메트릭 + 4개 필터 옵션 RPC 병렬 호출) 3.2~3.8초, 에러 없음.
- 요약 메트릭 10개 지표 중 8개는 항상 즉시 반환, 2개(주소/URL NULL 진단)는 대다수 행이
  매칭돼 인덱스 효과가 없는 조건이라 간헐적으로 느리지만 `null` 폴백으로 페이지 전체에는
  영향 없음(이전 작업에서 이미 확인된 한계, 이번에 추가로 악화되지 않았음을 재확인).
- `npx tsc --noEmit` / `npm run test`(36파일 384건) / `npm run build`: 모두 통과.

## 특이 사항
- **amusement-park.mjs는 최초 3개 배치 계획에서 누락됐다가 리포트 작성 중 발견해 별도
  실행했다**: 코드는 배치 실행 전에 이미 수정을 마쳤으나 배치 목록에 넣는 것을 빠뜨렸다.
  최종 리포트/검증은 재실행 완료 후의 수치다(2,506건, RAW 7,009건).
- **`events`의 "source 미설정" 2,633건은 이번 실행으로 채워지지 않았다**: 오늘 재수집한
  API 응답에 더 이상 나타나지 않는(예: 기간이 지나 목록에서 빠진) 과거 행사 데이터로
  추정된다 — Safe UPSERT는 "이번에 실제로 수집된 행"에만 적용되므로 API가 반환을 멈춘
  과거 데이터의 컬럼은 채워지지 않는다. 이는 일반적인 upsert 파이프라인에서 자연히 발생하는
  현상이며 이번 작업 범위(신규/재수집 데이터에 표준 포맷 적용) 밖이라 별도 정리하지
  않았다 — 필요하면 별도 논의 후 진행.
- **`open_spaces`의 tourapi_4.0(22,237건)은 GoCamping+KorTour+KorWithTour+KorPetTour 4개
  어댑터의 합계다**: 이 4개는 사용자 확인(2026-08-21, 기존 결정)에 따라 `contentid` 기준
  단일 키로 통합돼 있어(동일 컨텐츠가 여러 서비스에 중복 등재된 경우 하나로 합쳐짐) 개별
  어댑터별 세분화된 건수는 DB에서 구분되지 않는다(기존 아키텍처 그대로 유지, 이번에 변경
  하지 않음).
- **cultural-facility-summary는 이번 실행에서 geocoding 실패율이 눈에 띄게 높았다**
  (VWorld "결과 없음"이 다수): 별도로 VWorld API 자체를 직접 테스트해 정상 동작함을
  확인했고(다른 성공 사례들도 있음), 이 어댑터는 gg-events/gg-culture-events와 달리
  요청 간 pacing/재시도 로직이 없어(기존 코드, 이번에 변경 안 함) 짧은 시간에 많은 요청이
  몰릴 때 VWorld 쪽에서 일시적으로 거절(502 등)했을 가능성이 있다 — 실측 로그에 502/
  fetch failed 사례도 섞여 있음을 확인했다. 이 어댑터의 pacing/재시도 보강은 이번 작업
  범위(표준 포맷 적용 + 일괄 가동) 밖이라 손대지 않았다.
- **DB 성능 발견 3건(source 통계/복합 인덱스/`.in()` 플래너 문제)은 모두 이번 작업
  중 실측으로 새로 발견해 그 자리에서 해결했다** — 이전 `/admin/data-grid` 개편 작업
  당시에는 source 컬럼이 SEOUL_YEYAK 하나만 채워져 있어(전체의 ~1%) 드러나지 않았던
  문제들이며, 17개 어댑터 전부가 source를 채우는 이번 작업으로 선택도가 뒤집히면서
  비로소 나타났다.
