# [본문(description) 반영 7대 대분류/중분류 실제 DB 업데이트]

## 구현 대상
- `implementation/todo.md`의 "[DB UPDATE] 본문 반영된 유효 events 대상 7대 대분류/중분류
  실제 DB 업데이트 실행" 항목.
- 2026-08-27 Dry-run 재검증(`implementation/2026-08-27-category-maj-description-dryrun-recheck.md`)
  에서 검증된 title+description 스캔 방식을 `is_active=true`인 유효 events(3,560건)에
  실제로 반영한다.

## 구현 일시
2026-08-27

## 1. 로직 변경 (`scripts/ingest/lib/category-maj-taxonomy.mjs`)
`resolveCategoryForRow`의 RULE/NULL 분기 스캔 대상 텍스트를 `title` 단독에서
`title + description`(description이 있을 때만 결합)으로 확장했다. MANUAL 보존/RAW
구→신 이름 치환 로직은 전혀 변경하지 않았다(키워드 규칙 자체도 무변경). `applyCategoryMajTaxonomy`의
조회 컬럼에 `description`을 추가했다.

## 2. 실제 적용 방법
Dry-run 때와 동일한 관례로 임시 스크립트(`scripts/_tmp-apply-category-maj-description.mjs`)를
만들어 `createAdminClient()` + `applyCategoryMajTaxonomy(client)`를 실행 후 즉시 삭제했다
(신규 상용 스크립트를 남기지 않음 — 제5장 제4조 기존 구조 우선).

## 3. 실행 결과 (DB 실반영, Dry-run 예측치와 완전히 일치)

| 항목 | 백필 전(title만, 기존 실적용값) | 이번 실행(title+description) | 증감 |
| :--- | ---: | ---: | ---: |
| 스캔 대상(is_active=true) | 3,560건 | 3,560건 | - |
| 매칭 성공(`category_min` 확정) | 1,992건 (55.96%) | **2,101건 (59.02%)** | **+109건 (+3.06%p)** |
| NULL 잔여 | 1,568건 (44.04%) | **1,459건 (40.98%)** | **-109건 (-3.06%p)** |
| MANUAL 보존 | 0건 | 0건 | - |

### 대분류별 분포 (실반영 후)
| 대분류 | 건수 |
| :--- | ---: |
| 자연 / 캠핑 | 371 |
| 스포츠 대여 | 347 |
| 배움 / 클래스 | 332 |
| 축제 / 이벤트 | 328 |
| 문화 / 전시 | 310 |
| 공공 키즈카페 | 286 |
| 체험 / 농장 | 127 |

검산: 371+347+332+328+310+286+127 = 2,101건 (일치).

## 4. 정직한 보고 — 미해결 회귀 위험 (Dry-run에서 이미 확인된 사항, 재확인)
Dry-run 리포트에서 지적한 대로, description 반영으로 기존 title 매칭값이 **바뀐 17건**은
이번 실적용에도 그대로 포함돼 있다(일부는 본문 텍스트의 우연한 단어 중복으로 인한 오탐
가능성 — 예: "한강야경투어" 설명문에 "광장"이 등장해 재분류됨). 이번 작업 범위는 todo.md에
명시된 "실제 DB 업데이트 실행"이며, 규칙에 `exclude` 조건을 추가하는 등의 정밀도 개선은
포함되지 않았다 — 별도 검토/승인 후 후속 작업으로 제안한다(Dry-run 리포트 "다음 단계" 2항과
동일).

## 검증
- `npx tsc --noEmit`: 통과.
- `npm run test`: 통과(신규 1건 추가 — title 미매칭·description 매칭 케이스 회귀 테스트).
- `npm run build`: 통과.
- 실제 DB 실행 결과가 Dry-run 예측치(2,101건/59.02%, 대분류별 분포)와 완전히 일치함을
  확인했다(동일 데이터 상태에서 알고리즘만 실행했으므로 예상된 결과).
- 임시 스크립트(`scripts/_tmp-apply-category-maj-description.mjs`)는 실행 후 즉시 삭제 완료.
