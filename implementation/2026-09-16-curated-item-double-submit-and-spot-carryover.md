# [중복 등록 버그 수정 + 스팟 연결 후 등록 시 중복 작업 제거]

## 구현 대상
사용자 지시(2026-09-16): "내가 된건지 반응늦어서 똑같은거2번입력한거에 대하여
지금 큐레이션/제휴상품에 보면 똑같은게 2개 들어가 있어.. 그리고 마이리얼트립에서
들어가면 내스팟과 연결있는데 그거하고나서 등록버튼 누르고 제휴마케팅만들기
들어가면스팟연결안되어있어서 거기서 다시하고 노출중분류도 안되어있으면 넣고
저장하거든 그래서 2번하는걸로 되나?"

두 가지 별개 버그를 함께 신고한 메시지라 각각 원인을 분석해 수정했다.

## 구현 일시
2026-09-16

## 문제 인식과 변경 사항

### 1) 중복 등록 버그 (더블 서브밋)
`CuratedItemFormModal`의 `isSubmitting`은 React state였다. 응답이 느릴 때
"등록하기"를 빠르게 두 번(또는 더블클릭) 누르면, 두 번째 클릭의 핸들러가 아직
리렌더링으로 반영되지 않은 이전 `isSubmitting=false`를 그대로 읽어 통과해
버릴 수 있다 — React state가 렌더 주기와 무관하게 즉시 갱신되지 않아 생기는
전형적인 더블 서브밋 패턴이다.

**변경**: 렌더 주기와 무관하게 즉시 갱신되는 `useRef<boolean>`(`isSubmittingRef`)를
추가해 `handleSubmit` 최상단(비동기 작업 시작 전)에서 동기적으로 체크·설정하고,
`finally`에서 해제한다. `src/components/admin/curated-item-form-modal.tsx`.

### 2) 스팟 연결 후 등록 시 중복 작업(2번 하는 문제)
마이리얼트립 검색 패널(`MyRealTripSearchPanel`)에는 두 가지 별개 기능이
나란히 있다: (a) "🔗 우리 스팟과 연결"(스팟 상세 화면 구매 버튼용,
`spot_myrealtrip_links` 테이블) (b) "🔗 제휴 상품으로 등록"(마케팅 목록용,
`curated_items` 테이블, `CuratedItemFormModal`을 prefill로 염). 두 기능이
독립적으로 설계돼 있어, 관리자가 (a)로 이미 스팟을 연결한 상품이라도 (b)를
열면 스팟 정보가 전혀 전달되지 않아 스팟을 처음부터 다시 검색해야 했고,
그 스팟의 "노출 중분류" 확인 UI(`SpotServiceCategoryCheck`, spot.id로 동작)도
스팟이 선택되지 않은 상태라 뜨지 않아 결국 사용자가 신고한 "2번 하는" 흐름이
발생했다.

**변경**:
- `CuratedItemFormModal`의 `prefill` prop 타입에 선택적 `spot: {id, name,
  address} | null` 필드를 추가하고, `spot` state 초기값이 `initial?.spot` →
  `prefill?.spot` 순으로 폴백하도록 했다. 이 필드가 채워지면 스팟 검색 UI
  대신 이미 선택된 스팟이 바로 보이고, `SpotServiceCategoryCheck`도 그
  spot.id 기준으로 자동 동작한다(추가 배선 불필요 — 기존 로직이 spot state만
  보고 있었기 때문).
- `MyRealTripSearchPanel`에서 상품별 연결 상태를 들고 있던 `linkedByGid`의
  타입을 `Record<string, string>`(gid→스팟명)에서 `Record<string,
  LinkedSpotInfo>`(gid→{spotId, spotName})로 확장해 스팟 id까지 들고 있게
  했다. `ResultCard`, `ConnectToSpotModal`, `MyRealTripProductDetailModal`의
  관련 prop도 이 새 타입에 맞춰 함께 변경했다.
- `MyRealTripProductDetailModal.handleRegister`가 `CuratedItemFormModal`에
  넘길 prefill을 만들 때, 이미 연결된 스팟이 있으면 `spot` 필드를 함께
  채워 넘기도록 했다.

결과: "우리 스팟과 연결"로 한 번 연결한 상품은, 이후 "제휴 상품으로 등록"을
눌러도 그 스팟이 이미 선택된 상태로 폼이 열려 스팟을 다시 검색할 필요가
없어졌고, 노출 중분류 확인 UI도 자동으로 함께 뜬다.

## 검증
- `npx tsc --noEmit`: 통과.
- `npm run test`: 전체 158개 파일 / 1845개 테스트 통과(기존 1842개 + 신규 3개:
  더블 서브밋 방지 1개, `curated-item-form-modal.test.tsx`의 prefill.spot
  즉시 연동 1개, `myrealtrip-search-panel.test.tsx`의 "연결 → 등록" 스팟
  carryover 통합 1개).
- `npm run build`: 통과, `/api/admin/spot-myrealtrip-link`,
  `/api/admin/spot-myrealtrip-link/by-gids` 등 관련 라우트 정상 등록 확인.
- 신규 테스트로 두 시나리오 모두 재현·검증: (1) "등록하기"를 3번 연타해도
  POST가 정확히 1번만 나가는지, (2) "우리 스팟과 연결"로 스팟을 연결한 뒤
  "제휴 상품으로 등록"을 누르면 등록 폼에 스팟 검색창 없이 이미 선택된
  스팟(변경 버튼)으로 열리는지.
