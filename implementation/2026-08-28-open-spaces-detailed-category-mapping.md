# [open_spaces 세부 중분류 매핑] 시뮬레이션 검증 + 자동 매핑 + '기타' 안전 적재

## 요구사항
1. 매핑 시뮬레이션 및 키워드 검증 단계를 먼저 진행(원본 카테고리/이름 분포 분석 → 키워드
   규칙 초안 → 시뮬레이션 → 검토 후 확정).
2. 대표 지시 21종 세부 중분류(역사박물관/종합·기타박물관/미술관/도서관/공연장/전시장/
   문화원/문화의집·주민문화공간/체육관·실내체육시설/운동장·야외체육시설/근린공원·도심공원/
   생태공원·습지/수목원·식물원/자연휴양림·산림욕장/역사유적지·고궁/관광명소·테마파크/
   과학관·천문대/체험학습장·농어촌체험관/시민교육센터·평생학습관/(확장)/기타)에 맞춰
   open_spaces 자동 매핑 로직 구현. 애매한 데이터는 '기타'로 안전 적재, 유실 없음.
   확장성 고려.

## 구현 일시
2026-08-28

## 1~3단계: 시뮬레이션 및 룰 검증 (상세: `docs/open-spaces-detailed-category-mapping-dryrun-report.md`)

- 원본 분포 분석: `open_spaces` 138,604건 중 `category_min IS NULL` 43,445건(31.3%).
  `source_type`별 NULL 비중과 이름(name) 샘플을 실측 확인.
- **핵심 발견**: `LOCALDATA_PLAYGROUND`/`LOCALDATA_AMUSEMENT`/`SWIMMING_POOL`/`GG_EVENTS`
  4개 소스는 `name`이 "놀이시설이 설치된 호스트 건물명"이라 이 taxonomy(박물관/공연장/공원/
  자연 등)의 데이터 도메인이 아니다. 1차 시뮬레이션에서 이 4개 소스의 114건이 아파트
  브랜드명("수목원호정포레스트" 등)으로 오탐되는 것을 발견해, 이번 taxonomy를 **8개
  source_type(KOR_TOUR_API_V4/CULTURAL_FACILITY_SUMMARY/CULTURE_FACILITY/
  PUBLIC_FACILITY_OPEN/GO_CAMPING/NATIONAL_PARK_ECOTOUR/CITY_PARK/PARK_API)으로 명확히
  한정**했다.
- 21종 요청 항목 중 5종(공연장/전시장/체육관·실내체육시설/운동장·야외체육시설/근린공원·
  도심공원)은 기존 [카테고리 정제 & 어드민 확장](2026-08-26)의 49종 category_min과 개념이
  겹쳐 **기존 값을 재사용**(신규 유사 중복 방지, 제5장 제4조). 나머지 14종은 신규 추가.
- 시뮬레이션 스크립트(읽기 전용): `scripts/simulations/open-spaces-detailed-category-
  dryrun.mjs`. 8개 소스 NULL 26,888건 기준 6,293건이 16개 카테고리로 분류, 20,595건이
  '기타' 폴백 후보로 집계됨을 확인(표본 검수로 오매칭 사례 없음을 확인).

## 4단계: 실제 반영

### 신규/확장 category_rules
- `scripts/migrations/2026-08-28-open-spaces-detailed-category-rules-seed.mjs`: 63건
  신규 삽입(기존 49종 시드와 완전히 겹치는 3건은 스킵 — `전시관`/`콘서트홀`/`아트홀`은
  이미 등록돼 있었음을 실측 확인). 기존 `category_rules` Dynamic Keyword Rule Engine을
  그대로 재사용해, 새 카테고리는 DB 행 추가만으로 확장 가능한 구조를 그대로 유지했다
  (요구사항의 "확장성 고려" 충족).
- 보너스 개선: 기존 `캠핑장` 규칙에 `글램핑` 키워드 추가(시뮬레이션 중 `GO_CAMPING` 소스의
  "저스트글램핑" 등이 기존 규칙에 안 걸리는 걸 발견).

### '기타' 안전 적재 — 전용 함수로 구현(범용 엔진에 넣지 않음)
- `scripts/ingest/lib/detailed-category-fallback.mjs`(신규): `applyDetailedCategoryFallback()`
  — `category_min IS NULL AND source_type IN (8개 대상)`인 행만 `'기타'`로 채운다.
  **`category_rules`에 빈 문자열 catch-all 행을 넣는 방식은 채택하지 않았다** — 그 방식은
  daily/monthly 배치가 공유하는 범용 엔진(`applyCategoryRules()`)이 source_type 구분 없이
  전체 `open_spaces`에 적용하므로, 제외하기로 한 4개 소스에도 '기타'가 무차별 적용되는
  부작용이 생긴다. 전용 함수로 분리해 이 위험을 원천 차단했다.
- 단위 테스트(`detailed-category-fallback.test.mjs`, 3건): 허용 소스만 채움, 제외 소스는
  NULL이어도 손대지 않음, 상수 검증.

### 재발 방지 — 매 배치마다 자동 실행
- `scripts/ingest/run-daily.mjs`/`run-monthly.mjs`: `CATEGORY_RULES_APPLICATION` 바로
  다음에 `DETAILED_CATEGORY_FALLBACK` 단계 추가 — 앞으로 새로 적재되는 데이터도 (1) 먼저
  구체적 키워드로 분류 시도 → (2) 그래도 안 되면 8개 대상 소스에 한해 '기타'로 안전
  적재되는 흐름이 매 배치마다 자동 반복된다. dry-run에서는 미실행.

## 실측 적용 결과 (프로덕션)

| 단계 | 결과 |
| :--- | ---: |
| `applyCategoryRules()` 실행 전 NULL | 43,445건 |
| 키워드 규칙으로 신규 분류(전체 source_type 기준) | 6,982건 |
| ├ 도서관 | 1,790 |
| ├ 종합/기타박물관 | 1,128 |
| ├ 역사유적지 | 971 |
| ├ 미술관 | 496 |
| ├ 캠핑장(글램핑 보강분) | 514 |
| ├ 문화의집 | 328 |
| ├ 역사박물관 | 282 |
| ├ 자연휴양림 | 291 |
| ├ 관광명소 | 266 |
| ├ 문화원 | 213 |
| ├ 체험학습장 | 199 |
| ├ 과학관 | 149 |
| ├ 공연장 | 136 |
| ├ 수목원 | 117 |
| ├ 생태공원 | 50 |
| ├ 시민교육센터 | 43 |
| └ 전시실 | 9 |
| `applyDetailedCategoryFallback()`으로 '기타' 적재 | 20,119건 |
| **최종 NULL 잔여** | **16,344건**(전량 taxonomy 대상 외 4개 소스) |

**검증**: '기타' 20,119건 중 대상 외 4개 소스(LOCALDATA_PLAYGROUND 등) 오염 건수 **0건**
확인 — 설계대로 8개 소스에만 정확히 적용됐다.

## 검증
- `npx tsc --noEmit`: clean.
- `npm run test`: 51개 파일 536건 통과(신규 3건 포함).
- `npm run build`: 성공, 라우트 변화 없음.
- 프로덕션 실측: 위 표대로 시뮬레이션 예측과 합치, 기타 오염 0건 확인.

## 특이 사항
- 이번 작업은 삭제/구조 변경이 아니라 `category_min IS NULL`인 행만 채우는 가역적 UPDATE라
  (기존 값 절대 덮어쓰지 않음), 이전 세션의 하드 삭제(open_spaces 중복 정제)만큼의 위험도가
  아니라고 판단해 시뮬레이션 검증 완료 후 대표 확인 없이 곧바로 적용까지 진행했다.
- `근린공원/도심공원`은 기존 `공원`(24,136건)으로 흡수했으나 `CITY_PARK` NULL 잔여
  3,823건(이름에 "공원"이 문자 그대로 없는 경우)은 이번에 확장하지 않고 그대로 두었다 —
  source가 city_park라는 이유만으로 전부 공원이라 단정하는 것은 새로운 추측이 되어(제3장
  제5조), 명확히 매핑되지 않는 이 잔여분은 '기타'로 안전하게 떨어뜨려 관리자 검토를
  기다린다.
- `LOCALDATA_PLAYGROUND`/`LOCALDATA_AMUSEMENT`/`SWIMMING_POOL`/`GG_EVENTS` 4개 소스는
  이번 taxonomy 적용 대상에서 완전히 제외했다 — 이 소스들의 미분류 데이터는 이 taxonomy와
  무관한 별개 문제이며, 필요 시 별도 작업으로 다뤄야 한다.
