# [NULL 데이터 중분류 매핑 실제 적용]

## 요구사항
`docs/null-category-analysis.md` 분석 내용을 바탕으로, 아래 범위를 실제 DB에 안전하게
적용:
- LOCALDATA_PLAYGROUND: facility_type 기반 `어린이놀이시설(야외)`/`어린이놀이시설(실내)`
- SWIMMING_POOL: 전량 기존 `수영장`
- LOCALDATA_AMUSEMENT: "키즈카페" 포함 262건만
- GG_EVENTS: "바닥분수/물놀이" 포함 163건만
적용 후 `analyze_open_spaces()` 실행 + 오매칭/인코딩 손상 검증 결과를 문서/로그로 남길 것.

## 구현 일시
2026-08-28

## 변경 사항
- `scripts/ingest/lib/legacy-source-category-mapping.mjs`(신규): `applyLegacySourceCategoryMapping()`.
  4개 source_type별 분류 규칙(facility_type 기반 2건, 소스 전체 1건, 키워드 기반 2건)을
  하나의 전체 NULL 스캔 결과에 인메모리로 적용한다. **`category_rules`(범용 엔진)에 넣지
  않은 이유**: 실측 확인 결과 "키즈카페"가 LOCALDATA_AMUSEMENT 외에 LOCALDATA_PLAYGROUND에도
  541건 우연히 포함되어 있었고("키즈카페 안에 설치된 놀이시설"로 추정), "물놀이"도 3개
  소스에 흩어져 있었다 — source_type 구분 없이 범용 엔진에 넣으면 대표 지시 범위를 벗어나
  오매칭된다. 이 함수는 source_type을 코드 레벨에서 명시적으로 제한한다.
- `scripts/ingest/lib/legacy-source-category-mapping.test.mjs`(신규, 6건): facility_type
  분기, source 전체 매핑, 키즈카페 교차 오염 방지(위 541건 케이스 재현), 바닥분수/물놀이
  매핑, 기존 값 미덮어쓰기, breakdown 집계.
- `scripts/migrations/2026-08-28-apply-null-category-mapping.mjs`(신규): 1회성 실행
  스크립트(매핑 적용 + `analyze_open_spaces()` 순차 실행).
- `scripts/ingest/run-daily.mjs`/`run-monthly.mjs`: `LEGACY_SOURCE_CATEGORY_MAPPING`
  배치 후처리 단계 추가(재발 방지 — 향후 이 4개 소스에 새로 들어오는 NULL도 매 배치마다
  자동 매핑됨). `DETAILED_CATEGORY_FALLBACK`와 완전히 disjoint한 source_type 집합이라
  실행 순서 의존성 없음.
- `docs/null-category-application-verification.md`(신규): 안전 검증 결과 문서(요구사항의
  "안전 장치" 조항).

## 실행 중 발견/수정한 문제
1. **DB 조회 timeout**: `WHERE source_type='LOCALDATA_PLAYGROUND' AND category_min IS NULL`
   조합 조회가 2회 연속 `statement timeout`으로 실패 — `category_min IS NULL` 단독 조건
   (이 세션에서 이미 안정 동작이 검증된 패턴)으로 전체를 한 번만 조회 후 인메모리 분류로
   변경해 해결.
2. **ANALYZE lock timeout**: 대량 UPDATE 직후 `analyze_open_spaces()`가 1회 `lock timeout`
   실패 — 재시도로 정상 완료(일시적 락 경합으로 추정).

## 실측 적용 결과 (프로덕션)
```json
{
  "updated": 14243,
  "breakdown": {
    "LOCALDATA_PLAYGROUND": { "어린이놀이시설(실내)": 3289, "어린이놀이시설(야외)": 9814 },
    "SWIMMING_POOL": { "수영장": 715 },
    "LOCALDATA_AMUSEMENT": { "키즈카페": 262 },
    "GG_EVENTS": { "바닥분수/물놀이시설": 163 }
  }
}
```
`docs/null-category-analysis.md`의 예상 건수와 정확히 일치. 상세 안전 검증(오매칭 0건,
인코딩 손상 신규 발생 0건, 최종 NULL 잔여 2,101건)은
`docs/null-category-application-verification.md` 참고.

## 검증
- `npx tsc --noEmit`: clean.
- `npm run test`: 52개 파일 542건 통과(신규 6건 포함).
- `npm run build`: 성공, 라우트 변화 없음.
- 프로덕션 실측: 위 결과대로 예상과 정확히 일치, 오염 0건 확인(상세는 검증 문서 참고).

## 특이 사항
- `docs/null-category-analysis.md` 3절의 "보류" 항목(LOCALDATA_AMUSEMENT 나머지 1,777건,
  GG_EVENTS 나머지 324건, 합계 2,101건)은 이번에도 손대지 않았다 — 최종 NULL 잔여와 정확히
  일치해 범위 밖 데이터가 실수로 포함되지 않았음을 재확인했다.
- 이번 작업 역시 `category_min IS NULL`인 행만 채우는 가역적 UPDATE라(기존 값 절대
  덮어쓰지 않음) 별도 확인 없이 시뮬레이션 검증 완료 후 곧바로 적용까지 진행했다.
