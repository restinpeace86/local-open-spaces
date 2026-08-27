# [Dry-Run] target_audience 8대 세분화 체계 정제 파이프라인 사전 영향도 시뮬레이션

## 구현 대상
- `implementation/todo.md`의 "[Dry-Run] target_audience 정제 파이프라인 사전 영향도
  시뮬레이션 분석 (8대 세분화 체계 및 원천 필드 동적 탐색 우선 적용)" 항목.
- `events`(`is_active = true`, 3,560건) 전용, `open_spaces` 완전 제외.
- 알고리즘: [0순위 원천 필드 동적 탐색] → [0단계 역방향 소거] → [1단계 특화 상속] →
  [2단계 텍스트 파싱] → [3단계 NULL 잔여 어드민 수동 검수].

## 구현 일시
2026-08-27

## 작업 성격
지시문의 **[핵심 지침 - 절대주의]**에 따라 순수 Read-Only 시뮬레이션만 수행했다 —
`events.target_audience` 컬럼을 추가하지 않았고 어떤 행도 UPDATE하지 않았다. 조사에
사용한 임시 스크립트(`scripts/_tmp-target-audience-8tier-simulate.mjs`)는 실행 후 즉시
삭제했다(2026-08-26/27 이전 target_audience/category_maj 분석 세션과 동일 관례).

## 핵심 발견
1. **원천 필드는 2개 소스에만 존재**: `seoul_public_reservation`(SEOUL_YEYAK)의
   `USETGTINFO`(1,123건), `seoul_public_culture`의 `USE_TRGT`(426건)만 연령 관련 원천
   필드를 보유했다. `tourapi_4.0`/`gg_public`/레거시 `seoul_public_reservation`(source=null,
   `SEOUL_RESERVATION_*` 접두, 1,717건, `raw_data` 완전 공백)에는 연령 관련 원천 필드
   자체가 없음을 실측 확인했다.
2. **지시문에 1/2단계 8대 태그별 세부 키워드가 명시돼 있지 않음**: 0순위/0단계는 지시문에
   구체적 키워드가 명시돼 있었으나, 1단계(카테고리 특화 상속)·2단계(텍스트 파싱)는 "8대
   세분화 타겟 특화 상속"/"명확 텍스트 파싱"이라는 원칙만 있고 태그별 실제 키워드 목록이
   없었다. 시뮬레이션 실행을 위해 이번 작업 전용 잠정 규칙을 새로 정의했고, 이를 추측이
   아니라 **제안**으로 명시해 `docs/target-audience-8tier-dryrun-report.md` 1절에
   투명하게 공개했다(제3장 제5조 추측 금지 준수 — 확정하지 않고 승인 요청).
3. **최종 NULL 잔여 50.48%(1,797/3,560)**: 5대 체계(2026-08-27 재검증 기준 80.18%)보다는
   크게 개선됐으나(원천 필드 1:1 매핑 성공률 상승 + 시설 대관류 ALL 자동 확정 규칙 도입
   효과), 여전히 절반 수준이다. NULL의 56.2%(1,010/1,797)가 `raw_data`/`category_min`
   모두 없는 레거시 `SEOUL_RESERVATION_*` 소스에 집중돼 있음을 확인했다.
4. **"성인" 단독 값 미해결**: 5대 체계 분석 때와 동일하게, 8대 태그 어디에도 정확히
   대응하지 않는 "성인" 단독 값(원천 필드 226건 + 제목 텍스트 45건)을 임의로 끼워 맞추지
   않고 별도 집계 후 대표 결정 사항으로 보고했다.

상세 퍼널 수치, 잠정 규칙 전문, 추가 키워드 제안(높음/중간/낮음 신뢰도별)은
`docs/target-audience-8tier-dryrun-report.md`에 기록했다.

## 대표 확인이 필요한 미결 사항 (임의 결정하지 않고 그대로 보고)
1. "성인" 단독 값 처리 방침(ALL/신규 태그/NULL 중 선택).
2. 시뮬레이션 전용 1단계/2단계 잠정 규칙(보고서 1.1/1.2절) 채택 여부.
3. 보고서 4.1절 "시설/공간 대관류 → ALL" 확장 제안 반영 여부(레거시 소스 NULL 대량 감소
   기대, 정밀 재시뮬레이션은 승인 후 진행).
4. `events.target_audience`/`target_audience_source` 컬럼 신설 및 실제 UPDATE 실행 여부.

## 검증
코드/스키마 변경이 없어 별도 tsc/test/build 대상 자체가 없다(이전 target_audience/
category_maj 분석 세션과 동일). 모든 수치는 Supabase에 대한 실제 읽기 전용(SELECT) 쿼리로
직접 실측했으며, DB에는 어떤 흔적도 남기지 않았다(임시 스크립트 실행 후 즉시 삭제 완료).
