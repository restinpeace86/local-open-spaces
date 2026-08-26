# [Dry-Run] 본문(description) 백필 반영 후 7대 대분류/중분류 매핑 시뮬레이션 재검증

## 구현 대상
- `implementation/todo.md`의 "[Dry-Run] 본문(description) 백필 반영 후 7대 대분류/중분류
  매핑 시뮬레이션 실행" 항목.
- 2026-08-27 본문(description) 백필 파이프라인(`2026-08-27-backfill-contents-pipeline.md`)
  완료 후, `is_active=true`인 유효 events(3,560건)를 대상으로 7대 대분류(`category_maj`)/
  36종 중분류(`category_min`) 매핑 알고리즘의 매칭 성공률을 **읽기 전용(Dry-run)**으로
  재측정한다. 실제 DB UPDATE는 전혀 수행하지 않았다.

## 방법론
`scripts/ingest/lib/category-maj-taxonomy.mjs`의 기존 `resolveCategoryForRow` 로직(키워드
규칙 자체는 전혀 수정하지 않음 — MANUAL 보존/RAW 구→신 이름 치환/RULE 키워드 매칭 3분기
그대로)을 임시 스크립트(`scripts/_tmp-category-maj-description-recheck.mjs`, 실행 후 즉시
삭제 — target_audience 재검증 때와 동일 관례)로 재사용하되, RULE 분기의 스캔 대상 텍스트만
`title` 단독에서 `title + description`으로 확장해 비교했다. `raw_data.MINCLASSNM` 기반
RAW 매핑은 원래도 텍스트 키워드 매칭이 아니므로 description 유무와 무관하게 결과가 같다.

## 결과 (2026-08-27 실행, DB 변경 없음)

### 대상 확정
| 항목 | 건수 |
| :--- | ---: |
| `is_active=true` 스캔 대상 | 3,560건 |
| `category_min_source = 'RAW'`(SEOUL_YEYAK 원본 치환, description 무관) | 917건 |
| `category_min_source ∈ {'RULE', NULL}`(제목/본문 키워드 재스캔 대상) | 2,643건 |
| `description` 값이 실제로 채워진 행 | 314건(전체의 8.82%) |

### 매칭 성공률 퍼널 비교 (title만 vs title+description)
| 항목 | 백필 전(title만, 기존 실제 적용값) | 백필 후(title+description, 이번 Dry-run) | 증감 |
| :--- | ---: | ---: | ---: |
| 매칭 성공(`category_min` 확정) | 1,992건 (55.96%) | **2,101건 (59.02%)** | **+109건 (+3.06%p)** |
| `category_min = NULL` 잔여 | 1,568건 (44.04%) | **1,459건 (40.98%)** | **-109건 (-3.06%p)** |

검산: 2,101 + 1,459 = 3,560건 (일치 확인).

### description 채워진 314건 내부 분해
| 구분 | 건수 |
| :--- | ---: |
| title로는 NULL → description 덕분에 신규 매칭 | 109건 |
| title로 이미 매칭됐으나 description 반영 후 값이 달라짐 | 17건 |
| 변화 없음(그대로 NULL 또는 그대로 동일 값) | 188건 |

### 재검증 후 7대 대분류별 분포 (참고, DB 미반영 시뮬레이션 값)
| 대분류 | 건수 |
| :--- | ---: |
| 자연 / 캠핑 | 371 |
| 스포츠 대여 | 347 |
| 배움 / 클래스 | 332 |
| 축제 / 이벤트 | 328 |
| 문화 / 전시 | 310 |
| 공공 키즈카페 | 286 |
| 체험 / 농장 | 127 |

## 해석 및 주의사항 (정직한 보고)
- **개선 폭은 있으나 "대폭"은 아니다** — description이 실제로 채워진 314건(전체의 8.82%에
  불과) 대비로 보면 그 중 34.7%(109/314)가 신규 매칭돼 이 범위 안에서는 효과가 뚜렷하지만,
  `is_active=true` 전체 모집단(3,560건) 기준으로는 +3.06%p 개선에 그쳤다 — 근본 원인은
  description 자체가 아직 소수(8.82%)에만 채워져 있다는 데이터 커버리지 한계다(2026-08-27
  백필 파이프라인 결과 참고 — `seoul_public_reservation` 소스는 애초에 이번 백필 대상이
  아니었고, `tourapi_4.0`/`gg_public`/`seoul_public_culture` 중에서도 원본 본문 필드가 비어
  있던("-" 등) 행은 description이 여전히 NULL).
- **주의(회귀 위험 신호)** — description 반영 후 기존 title 매칭값이 **바뀐 17건**이
  발견됐다. 샘플 확인 결과 일부는 본문 텍스트에 등장하는 단어가 키워드와 우연히 겹쳐
  발생하는 것으로 보인다(예: "한강야경투어" → description 텍스트에 "광장" 포함으로 인식,
  실제 이 행사 성격과 다를 수 있음). 이번 작업은 Dry-run 리포트만 요구받았으므로 규칙을
  임의로 수정하지 않았다 — 실제 적용 여부/우선순위 조정은 대표 승인 후 별도 작업으로
  제안한다.
- 규칙 자체(36종 키워드 목록, 우선순위, exclude 조건)는 이번 재검증에서 전혀 변경하지
  않았다 — 오직 스캔 텍스트 범위(제목 → 제목+본문)만 확장했다.

## 검증
- `npx tsc --noEmit`: 통과.
- `npm run test`: 통과(기존 테스트 스위트 변경 없음 — 이번 작업은 임시 조회 스크립트만
  사용했고 실제 로직/스키마 변경이 없어 신규 테스트 추가 대상 아님).
- `npm run build`: 통과.
- 임시 스크립트(`scripts/_tmp-category-maj-description-recheck.mjs`)는 실행 후 즉시
  삭제 완료(DB/저장소에 흔적 없음).
- 실제 `events` 테이블 UPDATE/컬럼 추가는 전혀 수행하지 않았다(요청된 범위 그대로 읽기
  전용 시뮬레이션).

## 다음 단계 (승인 대기, 이번 작업 범위 밖)
1. description 커버리지 자체를 늘릴지(예: `seoul_public_reservation` 소스 본문 필드 추가
   확보, 현재 "-" 플레이스홀더로 비어 있는 `gg_public` API2 행 재확인) 여부 결정.
2. description 반영으로 값이 바뀐 17건 중 오탐(false positive) 의심 사례를 검토해 규칙에
   `exclude` 조건을 추가할지 결정.
3. 승인 시: 실제 `UPDATE events SET category_maj = ..., category_min = ...` 재실행(RULE/NULL
   대상만, MANUAL 보존 원칙 동일 유지).
