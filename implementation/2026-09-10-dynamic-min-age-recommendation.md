# 동적 연령 추천 시스템 (min_age_recommended) — 개선사항1-B / Step 92

## 구현 대상
`implementation/todo.md` 개선사항1 "동적 연령 추천 시스템 (min_age_recommended)":
- "만 x세 이상 뱃지 / 기본값 0 (미지정 시 뱃지 미노출)"
- 운영 검수 룰(휴리스틱): "초등 이상/미취학 어려움/초등학생부터" → 7,
  "영유아 힘들다/어렵다/36개월 이하" → 3, 그 외 명시 연령("5세", "8세") 자동 입력
- "관리자가 후기를 검수하며 나이 관련 keyword에 노란색으로 칠하고 기준에 맞춰
  수동으로 숫자를 변경입력가능해야 함"

## 구현 일시
2026-09-10

## 변경 사항
### DB — `scripts/migrations/2026-09-10-spot-curations-min-age-recommended.sql`
- `spot_curations.min_age_recommended smallint not null default 0` 추가 +
  `check (0 <= min_age_recommended <= 19)` 제약 + 컬럼 코멘트. 프로덕션 적용 완료.
- 기존 행은 전부 0(미지정) — 뱃지 자동 체크와 동일하게 관리자가 검수하며
  개별로 채우는 세미오토 방식이라 백필하지 않음.
- `scripts/gen-types.mjs`로 `src/types/database.types.ts` 갱신(+3줄).

### `src/lib/admin/curation-badges.ts`
- `suggestMinAgeFromText(text)`: 미취학 제한 패턴 → 7, 영유아 제한 패턴 → 3,
  `(?:만 )?N세 (이상|부터)` / `N개월 (이상|부터)` 명시 연령 파싱, 여러 신호는
  최댓값(가장 보수적) 채택, 신호 없으면 null.
  - [해석] "그 외 명시된 연령"은 연령 *제한*을 발견하는 맥락이라, "이상/부터"
    같은 하한 표현이 붙은 경우만 채택(단순 "3세와 다녀왔어요"는 제외 — 제3장
    제5조 추측 금지).
- `aggregateMinAgeFromTexts(texts[])`: 워닝 없는 블로그 본문들의 제안값 중 최댓값.
- `clampMinAgeRecommended(value)`: 0~19 정규화(0 = 미지정).
- `AGE_HINT_KEYWORDS`: 관리자가 연령 제한을 발견하기 쉽게 노란 형광펜 처리할
  나이 키워드("초등학생", "미취학", "영유아", "36개월", "세 이상" 등).
- `MIN_AGE_RECOMMENDED_MAX = 19`.

### `src/lib/admin/use-spot-curation-form.ts`
- `SpotCurationItem`에 `min_age_recommended` 추가.
- state `minAgeRecommended`(기본 0) / `setMinAgeRecommended`(clamp 적용) /
  `ageSuggestion`(자동 제안 참고값) / `hasAutoCheckedAge`(1회성 자동 판정 가드,
  뱃지 자동 체크와 동일한 경쟁 상태 안전장치).
- 기존 큐레이션 로드 시 저장값 사용 + 자동 판정 스킵.
- 멀티 블로그 종합 effect에서 워닝 없는 본문으로 `aggregateMinAgeFromTexts` 실행,
  신호 있으면 값 채움.
- 저장 payload에 `min_age_recommended: clampMinAgeRecommended(...)` 포함.

### API
- `src/app/api/admin/spot-curations/route.ts`: POST/PATCH가
  `min_age_recommended`를 `clampMinAgeRecommended`로 정규화해 저장. `SpotCurationRow`
  타입 + PATCH updates 타입에 필드 추가.
- `src/app/api/spot-curations/route.ts`(공개 조회): select에 `min_age_recommended`
  추가 → 응답 `item`에 그대로 포함(0이면 소비자에서 미노출).

### 관리자 UI
- `src/components/admin/curation-badge-form.tsx`: "추천 연령 하한 (만 나이)"
  number 입력(0~19) + "0 = 미노출" 안내 + "후기 분석 제안: 만 N세 이상 적용"
  버튼(제안값이 현재값과 다를 때만).
- `src/components/admin/blog-reference-viewer.tsx`: `extraHighlightKeywords` prop
  신설 — 지역명과 별개로 나이 키워드도 같은 공백 무시 매칭·`<mark>` 처리.
  (지역명 미스매치 경고 문구에는 미포함 — 그래서 regionKeywords와 분리)
- `mobile-curation-workbench.tsx` / `blog-curation-modal.tsx`: 두 호출부 모두
  `AGE_HINT_KEYWORDS` 전달 + `CurationBadgeForm`에 min-age props 연결.

## 검증
- `npx tsc --noEmit` 통과.
- `npm run test`: 121 파일 1407건 통과(직전 1400 → +7: 연령 휴리스틱 유닛 테스트,
  blog-curation-modal 저장 payload 테스트에 `min_age_recommended: 0` 반영).
- `npm run build`: Compiled successfully.

## 특이 사항
- 소비자(스팟픽) 화면에서 "만 x세 이상" 뱃지를 **렌더링**하는 것은 개선사항3
  (상세 카드 최종 UI — "뱃지 영역")에서 함께 처리한다. 현재 detail-modal은 뱃지
  영역 자체가 없어(개선사항3 신설 예정) 여기서 단독 추가하면 스펙과 어긋난다.
  이번 작업은 데이터가 end-to-end로 흐르는 것까지(`/api/spot-curations` 응답에
  `min_age_recommended` 포함) 완료했다.
- `SpotCurationsPanel`(스팟 큐레이션 탭 — 이미지/영업시간/가격 전담)은
  `min_age_recommended`를 보내지 않으므로 PATCH 부분 갱신 규약상 기존 값을
  덮어쓰지 않는다.
