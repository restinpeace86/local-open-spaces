# only_uncurated 필터가 아무 효과 없던 버그 수정 (RLS 권한 문제)

## 구현 대상
사용자 지시: "이상하네 .. 현재 놀이방식당 기준으로 큐레이션 아직없는행만
보기 했을때 11건인가 조금만 나와야되는데 왜 95건 다나오지?"

## 구현 일시
2026-09-07

## 원인 (실측)
운영 API를 직접 재현 호출해 확인한 결과, `category_min=놀이방식당`에
`only_uncurated=true`를 걸어도 필터 없이 조회한 것과 **총 건수가 정확히
95건으로 동일**했다 — 필터가 통째로 아무 효과가 없었다.

원인은 [[2026-09-07-only-uncurated-filter]]에서 구현한 코드가 `spot_curations`
테이블을 이 라우트가 원래 쓰던 익명 키/쿠키 기반 클라이언트(`@/lib/supabase/
server`의 `createClient()`)로 조회했기 때문이다. `spot_curations` 테이블은
실측 확인 결과 **RLS가 켜져 있고 정책이 단 하나도 등록돼 있지 않다**
(`/api/admin/spot-curations/route.ts`가 이미 "service_role만 접근 가능"이라고
명시적으로 주석에 남긴 의도된 설계 — curated_items/deals와 동일 패턴). RLS가
켜진 테이블에 정책이 없으면 그 어떤 역할로도 행을 볼 수 없고, 이는 에러 없이
**조용히 0건**을 반환한다 — 그래서 "제외할 큐레이션 spot_id 목록"이 항상
빈 배열이었고, 코드의 `if (curatedIds.length > 0)` 가드에 걸려 제외 필터
자체가 한 번도 적용되지 않았다.

## 변경 사항
`src/app/api/admin/data-grid/route.ts`: `spot_curations` 조회에
`createAdminClient()`(service_role, RLS 우회)를 새로 import해 사용하도록
수정했다. `open_spaces` 조회 등 라우트의 나머지 부분은 기존 클라이언트
그대로 유지한다(이 부분만 RLS로 막혀 있던 테이블이므로 이 조회 하나만
클라이언트를 바꾸면 충분).

## 검증(실측)
- 수정 전 재현: 운영 API에서 `category_min=놀이방식당` 필터+`only_uncurated=
  true` 조합과 필터 없는 조회가 둘 다 total=95로 동일함을 확인(버그 재현).
- DB 직접 조회로 정답값 확인: `category_min='놀이방식당'` 총 95건 중
  92건이 이미 큐레이션돼 있고, 실제 미큐레이션은 **3건**뿐이다(사용자가
  예상한 "11건 정도"보다도 적었지만, 사용자도 "11건인가"로 불확실하게
  말했었고 핵심은 "95건은 확실히 잘못됐다"는 지적이 정확했음).
- `npx tsc --noEmit` / `npm run test`(115개 파일, 1286개 테스트, route.ts는
  기존 관례상 직접 단위 테스트 없음) / `npm run build` 전체 통과.

## 특이 사항
- 배포 후 운영 API를 다시 호출해 `category_min=놀이방식당&only_uncurated=
  true`가 total=3을 반환하는지 최종 확인 필요(이 기록 작성 시점엔 아직
  배포 전).
