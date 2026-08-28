# [NULL 데이터 중분류 매핑 실제 적용] 결과 및 안전 검증 (2026-08-28)

`docs/null-category-analysis.md`에서 "적용 가능"으로 판정한 범위를 실제 DB에 반영했다.
구현: `scripts/ingest/lib/legacy-source-category-mapping.mjs`, 1회성 실행 스크립트:
`scripts/migrations/2026-08-28-apply-null-category-mapping.mjs`.

## 적용 범위(대표 지시 그대로)

| source_type | 매핑 방식 | 대상 category_min |
| :--- | :--- | :--- |
| LOCALDATA_PLAYGROUND | `facility_type` 구조화 필드 기준 | `어린이놀이시설(야외)` / `어린이놀이시설(실내)` |
| SWIMMING_POOL | 소스 전체 일괄 | 기존 `수영장` |
| LOCALDATA_AMUSEMENT | 이름에 "키즈카페" 포함 | `키즈카페` |
| GG_EVENTS | 이름에 "바닥분수" 또는 "물놀이" 포함 | `바닥분수/물놀이시설` |

**이미 `category_min`이 채워진 행은 절대 건드리지 않는다**(UPDATE 시 `.is('category_min',
null)` 재확인 가드 유지) — 이 4개 source_type 외에는 전혀 손대지 않았다.

## 실행 중 발견한 문제와 수정

최초 실행에서 `(source_type = 'LOCALDATA_PLAYGROUND') AND (category_min IS NULL)` 조합으로
DB에 직접 필터링해 조회하는 방식이 `statement timeout`으로 2회 연속 실패했다(이 프로젝트에서
이미 여러 차례 실측된 것과 같은 종류의 플래너 오판으로 추정). `category_min IS NULL` 단독
조건(이 세션에서 안정적으로 동작함을 이미 확인한 패턴)으로 전체를 한 번만 조회한 뒤
source_type별 분류를 인메모리에서 수행하도록 수정해 해결했다.

`analyze_open_spaces()` 실행도 최초 1회는 `lock timeout`으로 실패했다(대량 UPDATE 직후
락 경합으로 추정되는 일시적 현상) — 재시도로 정상 완료했다.

## 실측 적용 결과

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

`docs/null-category-analysis.md` 3절에서 제시한 예상 건수(9,814 / 3,289 / 715 / 262 / 163,
합계 14,243)와 **정확히 일치**한다.

## 안전 검증 (실측)

| 항목 | 결과 |
| :--- | :--- |
| `어린이놀이시설(야외)` 건수 | 9,814 (예상 소스 외 오염 0건) |
| `어린이놀이시설(실내)` 건수 | 3,289 (예상 소스 외 오염 0건) |
| `키즈카페` 건수 | 262 (예상 소스 외 오염 0건 — LOCALDATA_PLAYGROUND의 우연한 "키즈카페" 541건 포함되지 않음 확인) |
| `바닥분수/물놀이시설` 건수 | 163 (예상 소스 외 오염 0건) |
| `수영장` 총 건수(기존+신규) | 2,198 (기존 1,483 + 신규 715 = 2,198 정확히 일치) |
| 최종 `category_min` NULL 잔여 | 2,101 (16,344 − 14,243 = 2,101 정확히 일치, 전량 이번 적용 범위 밖으로 남겨둔 보류분) |
| `category_min` 옵션 총 개수 | 50종(기존 46 + 신규 4) |
| **인코딩 손상 신규 발생 여부** | **없음** — 발견된 손상 값 1건(`���ý�`)은 `docs/null-category-analysis.md` 4절에 이미 기록된 기존 데이터(`category_min_source='MANUAL'`)이며 이번 작업과 무관함을 재확인 |
| `analyze_open_spaces()` 실행 | 재시도 후 정상 완료 |

## 결론

대표가 지시한 4개 범위(14,243건)를 정확히, 근거 없는 확장 없이 적용했다. 오매칭·인코딩
손상 신규 발생 0건을 실측으로 확인했다. `docs/null-category-analysis.md` 3절의 "보류"
항목(1,777건 LOCALDATA_AMUSEMENT 나머지, 324건 GG_EVENTS 나머지)은 이번에도 손대지 않았다
— 최종 NULL 잔여 2,101건과 정확히 일치한다.
