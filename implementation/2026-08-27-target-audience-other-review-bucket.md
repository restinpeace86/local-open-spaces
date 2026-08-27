# [타겟 연령 "기타(OTHER)" 수동 검수 분리]

## 구현 대상
`docs/target-audience-null-all-rawdata-keyword-simulation.md`에서 시뮬레이션한 근거를 바탕으로,
`is_active=true`이면서 `target_audience`가 `NULL` 또는 `ALL`인 행 중 유아/어린이/가족 관련
키워드가 `description`/`raw_data`의 기타 필드(현재 어느 단계에서도 스캔하지 않는 필드)에
발견되면 신규 값 `'OTHER'`(기타)로 분리해, 관리자가 어드민 화면에서 수동으로 확인·수정할
수 있게 한다.

## 구현 일시
2026-08-27

## 범위 확인 (사용자 재확인 반영)
대표가 "항상 `is_active=true` 데이터만 기준으로 본다"는 원칙을 재확인함에 따라, 이번 작업도
`is_active=true`로만 스캔 범위를 한정했다(직전 시뮬레이션과 동일 범위, 변경 없음).

## 키워드
사용자가 두 차례에 걸쳐 지시한 키워드를 합집합으로 사용: `어린이`, `보호자`, `유아`, `초등`,
`가족`, `동반`, `키즈` (`OTHER_REVIEW_KEYWORDS`, `scripts/ingest/lib/target-audience-taxonomy.mjs`).

## 구현 (`scripts/ingest/lib/target-audience-taxonomy.mjs`)
- `resolveOtherReviewTag(row)`: MANUAL 행과 이미 실제 태그(NULL/ALL이 아닌 값)가 확정된 행은
  절대 건드리지 않는다. `title+description+raw_data 기타 필드`(0순위 3개 필드/description
  편입 필드/title 중복 필드 제외)에서 키워드가 하나라도 있으면 `{target_audience:'OTHER',
  target_audience_source:'OTHER'}`를 반환한다.
- `applyOtherReviewFlag(client)`: `is_active=true AND (target_audience IS NULL OR
  target_audience = 'ALL')` 범위만 스캔해 실제 UPDATE하는 후속 배치. 기존
  `applyTargetAudienceTaxonomy`(0~2단계 메인 퍼널)와는 별개의 추가 정제 단계다 — 메인 퍼널이
  이미 확정한 다른 태그는 절대 재검토하지 않는다.
- 목적은 `ALL` 태그가 "가족/어린이와 진짜 무관한" 행만 남도록 정제하는 것이지, `ALL`
  자체가 틀렸다고 단정하는 게 아니다(원천 `USETGTINFO`가 실제로 "제한없음"인 경우가
  대부분).

## 어드민 UI 반영
- `src/components/admin/data-grid-client.tsx`, `src/app/api/admin/data-grid/target-audience/route.ts`:
  `TARGET_AUDIENCE_TAGS`에 `'OTHER'` 추가 — 체크박스 필터/수동 수정 드롭다운에 노출.
- `TARGET_AUDIENCE_SOURCE_STYLE`에 `OTHER: 빨간 계열` 뱃지 추가(수동 검수 필요를 시각적으로
  강조).
- `src/lib/home/get-home-feed.ts`의 `EVENT_PICK_TARGET_AUDIENCES`에는 **`OTHER`를 추가하지
  않았다** — 명시적 결정 사항으로, 검토 전까지는 홈 피드에 노출하지 않는 안전한 기본값을
  택했다(사용자에게 사전 고지 후 승인받음).

## 실행 결과 (실제 UPDATE, 대표 승인 완료)

| 항목 | 건수 |
| :--- | ---: |
| 스캔 대상(`is_active=true`, `target_audience` NULL/ALL) | 1,786건 |
| MANUAL 보존(건드리지 않음) | 6건 |
| **OTHER로 분리** | **495건** |
| ㄴ 원래 NULL이었던 것 | 64건 |
| ㄴ 원래 ALL이었던 것 | 431건 |
| 분리 후 남는 ALL | 1,008건 |
| 분리 후 남는 NULL | 283건 |

Dry-run 예측(495건)과 실제 실행 결과가 정확히 일치했다.

**부수 효과(사전 고지 완료)**: ALL→OTHER로 이동한 431건은 `EVENT_PICK_TARGET_AUDIENCES`에
`OTHER`가 없어 홈 피드(이벤트픽)에서 즉시 사라진다. 관리자가 어드민에서 수동 확인 후 실제
태그로 재지정하면 다시 노출된다.

## 검증
- `npx tsc --noEmit`: clean.
- `npm run test`: 44 파일 480건 통과(신규 7건: `resolveOtherReviewTag` 6건 +
  `applyOtherReviewFlag` 1건).
- `npm run build`: 성공.
- 실제 DB 반영 후 API 실측: `GET /api/admin/data-grid?table=events&target_audience=OTHER`
  → `total: 495` 정상 확인.

## 다음 단계 (관리자 수동 작업)
`/admin/data-grid` events 탭에서 `타겟 연령(target_audience)` 체크박스로 `OTHER`를 선택해
495건을 확인하고, 상세 모달에서 실제 태그로 하나씩 수정한다(수정 시 `target_audience_source`
가 자동으로 `MANUAL`로 고정돼 이후 배치가 덮어쓰지 않는다).
