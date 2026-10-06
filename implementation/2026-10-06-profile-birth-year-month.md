# 자녀 프로필 출생 연+월 수집 (개선사항 4)

## 구현 대상
`todo.md` 개선사항 4(2026-10-06): 온보딩/마이페이지에서 자녀의 "출생
연도"만 받던 것을 "몇 년 몇 월생"까지 받도록 UI/상태/DB를 확장.

## 변경 범위를 좁힌 근거
`profiles.birth_years`(integer[])는 10여 개 파일이 "연 나이" 계산에 그대로
쓰고 있다(`personalization.ts`, `mom-pick-dashboard.ts`, `posts.ts`,
`ai-chat-sheet.tsx` 등) — 이 표현 자체를 바꾸면 전부 손대야 한다. 대신
같은 인덱스로 대응하는 **`birth_months`(integer[])를 병렬 컬럼으로
추가**해, 기존 소비자는 전혀 건드리지 않고 새 기능(정확한 개월 수 계산)만
추가했다(제5장 제4조 기존 구조 우선).

## 변경 사항
- `scripts/migrations/2026-10-06-profiles-birth-months.sql`(적용 완료):
  `profiles.birth_months integer[] not null default '{}'`.
- `src/types/database.types.ts`: `npm run gen:types`로 재생성(이번 세션에
  추가한 culture-club 컬럼들도 함께 갱신됨).
- `src/lib/auth/profile.ts`: `Profile` 타입에 `birth_months` 추가,
  `updateBirthYears` → **`updateBirthYearsAndMonths(birthYears,
  birthMonths)`**로 교체(두 배열을 항상 함께 갱신해 인덱스가 어긋나지
  않게 함).
- `src/components/auth/complete-profile-view.tsx`(최초 필수 온보딩):
  연도 선택 옆에 월(1~12) 선택을 추가, 자녀 추가/삭제 시 두 배열을 함께
  조작, 제출 시 연도+월 둘 다 유효해야 그 자녀를 저장 대상으로 인정.
  기존 데이터에 `birth_months`가 없거나 짧은 경우(레거시) 추측 없이
  현재 월로 채우되 사용자가 바로 수정할 수 있게 둔다.
- `src/components/auth/birth-years-editor.tsx`(마이페이지 보조 편집기):
  동일하게 월 선택 추가 — 두 화면이 같은 컬럼을 공유해 한쪽만 월을 안
  받으면 다자녀 추가/삭제 시 배열 인덱스가 어긋나기 때문에 함께 수정.
- `src/components/my/my-page-view.tsx`: `BirthYearsEditor`에
  `initialBirthMonths` prop 전달.
- `src/lib/ai-chat/personalization.ts`: **`calculateTotalMonthsFromBirth`**
  /`calculateTotalMonthsFromBirthYearsAndMonths`(신규) — "저장 시 ...
  즉시 활용할 수 있는 총 개월 수 환산 유틸리티" 요구사항. culture-club
  강좌의 `min_age_months`/`max_age_months`(2026-10-06 개선사항2)와 같은
  단위라 향후 "내 아이에게 맞는 강좌" 필터링에 바로 쓸 수 있다. 저장
  시점 스냅샷으로 DB에 영속화하지 않고 호출마다 현재 시점 기준으로 다시
  계산하는 순수 함수로 뒀다 — 영속화하면 한 달만 지나도 값이 거짓이
  되기 때문(제3장 제5조).

## 검증
- `npx tsc --noEmit` / `npm run test`(274개 파일 2,863개, 신규 4개 포함,
  기존 테스트 7개 갱신) / `npm run build` 전부 통과.
- 레거시 데이터(출생월 없음) 시나리오를 명시적으로 테스트(배열 길이가
  어긋나는 경우 계산 불가능한 항목만 안전하게 걸러짐).

## 특이 사항
- `birth_years`는 그대로 "연 나이" 계산용으로 계속 쓰인다 — 이번 변경이
  기존 화면/추천 로직의 동작을 바꾸지 않는다(새 능력만 추가).
- "강좌 연령 필터링에 즉시 활용"은 유틸리티 함수 제공까지만 이번 범위다 —
  실제로 이 유틸을 호출해 "내 아이에게 맞는 강좌" 화면을 만드는 건
  todo.md에 별도로 명시되지 않아 포함하지 않았다(제5장 제2조 Spec 우선).
