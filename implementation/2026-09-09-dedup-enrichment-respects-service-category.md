# 중복 스팟 검수 — 그룹 보강 조회가 노출 중분류 경계를 넘지 않도록 수정

## 구현 대상
사용자 질문: "그룹을 열 때마다 각 멤버 기준으로 실제 반경(30m)을 다시
조회.. 이부분에서 같은 노출중분류에 대하여서만 하는거 맞아?"

## 구현 일시
2026-09-09

## 확인 결과 — 아니었다(실제 버그)
[[2026-09-09-dedup-scan-page-size-and-group-enrichment]]에서 추가한 그룹
오픈 시 보강 조회는 `find_nearby_open_spaces` RPC를 그대로 재사용했는데,
이 RPC는 좌표 30m 반경만 볼 뿐 `service_category_id`(노출 중분류)를 전혀
고려하지 않는다. 즉, 노출 중분류로 스캔 범위를 좁혀서 찾은 그룹(예:
"캠핑장/피크닉장")을 열었을 때, 30m 이내에 완전히 다른 노출 중분류(또는
미매핑)의 무관한 스팟이 있으면 그것도 함께 딸려와 체크박스가 기본 체크된
채 표시됐다 — 관리자가 놓치고 그대로 저장하면 그 무관한 스팟의
`service_category_id`까지 잘못 덮어쓸 위험이 있었다.

## 변경 사항
### 1. `find_nearby_open_spaces` RPC
`scripts/migrations/2026-09-09-find-nearby-open-spaces-add-service-category.sql`
— 반환 목록에 `service_category_id`를 추가했다. RPC 자체에는 강제 필터를
넣지 않았다 — 이 RPC를 공유하는 다른 두 호출부(`SpotDedupQuickModal`의
"open_spaces 상세에서 중복 스팟 검토", `MobileCurationWorkbench`의 "1단:
중복 장소 검수 배너")는 오히려 노출 중분류와 무관하게 "좌표만으로 같은
장소인지" 찾는 게 목적이라 그쪽에 필터를 강제하면 안 된다.

### 2. `src/app/api/admin/spot-dedup/nearby/route.ts`
`NearbySpot` 타입에 `service_category_id: string | null` 추가(단순 통과,
가공 없음).

### 3. `src/components/admin/spot-dedup-panel.tsx` — `handleOpenGroup`
보강 조회 결과를 그룹에 합치기 전에, 현재 스캔 범위(`scanScope`)가 기대하는
`service_category_id`와 비교해 다르면 걸러낸다:
- `scanScope === UNMAPPED_SCOPE`(미매핑 원본 전체 스캔 중)면 `service_
  category_id`가 `null`인 것만 채택.
- 실제 노출 중분류를 골라 스캔 중이면 정확히 그 id와 같은 것만 채택.

이 필터는 `SpotDedupPanel`(이 파일) 안에서만 적용된다 — RPC/API 자체는
그대로 두어 다른 두 호출부의 기존 동작에 영향이 없다.

## 검증
- `spot-dedup-panel.test.tsx`: 기존 보강 테스트의 mock에 `service_category_
  id: null`을 명시(미매핑 스캔 시나리오와 일치)하도록 보정했고, 신규
  테스트로 "노출 중분류가 다른 스팟은 30m 이내라도 보강 대상에서 제외된다"
  (캠핑장 스캔 중 무관한 `service_category_id`의 "근처 편의점"이 합쳐지지
  않음)를 추가했다.
- `spot-dedup-quick-modal.test.tsx`/`mobile-curation-workbench.test.tsx`:
  타입에 필드가 추가됐을 뿐 검증하지 않는 위치라 기존 그대로 통과.
- `npx tsc --noEmit` / `npm run test`(1385건, 기존 1384 + 신규 1) /
  `npm run build` 전체 통과.
- 실측: RPC를 직접 호출해 응답에 `service_category_id`가 정상적으로
  포함됨을 확인.
