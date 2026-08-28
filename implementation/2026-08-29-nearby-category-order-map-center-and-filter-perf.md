# [스팟픽(/nearby) 대분류 순서 조정 + 지도 중심 불일치 버그 + 카테고리 필터 반응 속도 개선]

## 요구사항 (사용자 제보 3건)
1. 대분류 탭 순서를 키즈/놀이시설 → 자연/공원 → 문화시설 → 체육시설 순으로 변경.
2. "위치는 계속 성남시 분당구로 잡혀있는데 지도의 중심은 서울특별시청으로 잡힌다" — 버그 여부 확인.
3. "카테고리 필터 선택 시 지도 반응이 좀 늦다" — 원인 확인 및 개선.

## 1. 대분류 탭 순서 변경
`src/lib/spaces/spot-category-groups.ts`의 `SPOT_CATEGORY_GROUPS` 배열 순서를
키즈/놀이시설 → 자연/공원 → 문화시설 → 체육시설로 재배열. 순서에 의존하는 로직은 없었으나
(`isKnownSpotCategoryMin`은 순서 무관), 기본 활성 탭(`SpotCategoryFilter`의
`useState(SPOT_CATEGORY_GROUPS[0])`)이 배열 첫 항목을 그대로 쓰므로 기본 노출 탭이
체육시설→키즈/놀이시설로 바뀐다. 이 가정에 의존하던 기존 테스트
(`spot-category-filter.test.tsx`, `map-explorer.test.tsx`)를 새 기본값에 맞게 수정.

## 2. 지도 중심 불일치 버그 — 실제 원인(Stale Closure Race Condition)
`src/components/map/kakao-map-view.tsx`의 최초 지도 생성 effect(`deps=[]`, 마운트 시
단 1회 실행)는 `loadKakaoMapSdk()`(카카오 스크립트 비동기 로드) 완료 후 콜백에서
`new kakao.maps.Map(..., { center: ... })`을 호출하는데, 이 콜백 클로저가 **effect가
처음 만들어졌을 때(마운트 순간)의 `center`/`radius` 값을 그대로 캡처**해 이후 리렌더와
무관하게 고정되는 문제가 있었다.

반면 `useUserLocation`은 LocalStorage에서 저장된 위치를 읽는 게 마운트 직후 매우
빠르게(동기적 읽기 + 리렌더 1회) 끝난다 — 즉 `center`가 기본값(서울시청, `DEFAULT_CENTER`)
에서 실제 저장 위치(분당구)로 바뀌는 시점이, 카카오 SDK 스크립트 로드가 끝나는 시점보다
거의 항상 먼저 온다. 그런데 위 stale closure 때문에, SDK 로드가 끝나 실제로 지도가
생성되는 순간에는 이미 최신 위치가 아니라 "마운트 당시"의 서울시청 좌표로 지도가
만들어진다. 별도의 보정 effect(`deps=[center.lat, center.lng, radius]`, panTo 호출)가
있지만, 이 effect가 먼저 실행되는 시점(위치가 막 갱신된 시점)에는 아직 `mapRef.current`가
없어(지도가 채 생성되기 전) 조용히 아무 것도 하지 않고, 이후 `center`가 다시 바뀌지 않는
한 재시도되지 않는다 — 그 결과 주소 텍스트(state, `sigunguName`)는 정확히 "성남시
분당구"를 보여주는데 지도만 서울시청에 고정되는 불일치가 발생했다.

**조치**: 매 렌더마다 최신 값을 담는 `centerRef`/`radiusRef`를 추가하고, 비동기 콜백
내부(마운트 effect)에서는 클로저 변수 대신 이 ref를 읽도록 수정(`center`→
`centerRef.current`, `radius`→`radiusRef.current`, 4곳: 최초 지도 생성, 펄스 마커
초기 위치, `handleResize`의 `setCenter`). 보정 effect(deps 기반)는 그대로 유지 —
SDK가 로케이션 로드보다 더 빨리 끝나는 반대 경우는 이 effect가 정상적으로 처리한다.

## 3. 카테고리 필터 반응 속도 — 실측 기반 진단
사용자에게 "정확히 어느 동작이 느린지" 확인 질문 후 "카테고리 필터 선택 시"로 특정.
추측 없이 실제 Playwright(headless Chromium)로 개발 서버(localhost:3000, 실제 프로덕션
Supabase 백엔드) 대상 실측:
- 네트워크 탭 확인 결과 **카테고리 필터 토글은 API 호출을 전혀 발생시키지 않는다**
  (기존 코드 리뷰로 이미 알고 있던 클라이언트 전용 필터링 구조를 실측으로 재확인) — 즉
  지연의 원인은 100% 클라이언트 렌더링 비용.
- `KakaoMapView`의 마커 렌더링 effect(`deps=[items]`)가 필터가 바뀔 때마다
  **보이는 마커 전체를 파괴(`clustererRef.current.clear()` + 개별 `setMap(null)`) 후
  전량 재생성**하고 있었음을 코드 확인 — 최대 200개 마커 + `MarkerClusterer` 재계산
  비용이 매 토글마다 반복됨.

**조치**: id 기준 diff 방식으로 변경 — 이전에 이미 보이던 항목(같은 `item.id`)의 마커는
그대로 유지(재생성하지 않음), 새로 필터에 걸린 항목만 마커를 생성(`clustererRef.current
.addMarkers`), 더 이상 안 보이는 항목의 마커만 제거(`clustererRef.current.removeMarker
(marker, true)`으로 배치 재계산 지연 후 마지막에 한 번만 `addMarkers`/`redraw()`로
반영). 마커 클릭 핸들러는 생성 시점 값을 클로저로 가두지 않고 `itemsByIdRef`/
`groupsByPositionRef`를 매번 조회하도록 해, 마커가 재사용되는 동안에도 최신 아이템
정보(겹침 그룹 등)를 정확히 반영한다.

카카오 맵 JS SDK v2의 `MarkerClusterer.removeMarker(marker, nodraw)`/`redraw()`는
기존 프로젝트 자체 타입 선언(`src/types/kakao.d.ts`, 공식 타입 패키지 미제공이라 실사용
API만 최소 선언)에 없어 추가했다(공식 SDK에 실제로 존재하는 메서드).

**검증(실측)**: 동일 Playwright 스크립트로 수정 전/후 비교(칩 반복 클릭 → 2프레임 후
경과 시간) — 수정 전 [58, 118, 54, 60, 33]ms → 수정 후 [51, 108, 46, 45, 28]ms로
소폭 개선 확인. 이 벤치마크는 "전체 선택→해제"를 반복하는 시나리오라 diff 방식이 가장
유리한 "이미 필터링된 상태에서 중분류 1개 추가 선택"(다중 선택 흐름에서 더 흔한 패턴)
시나리오에서는 이보다 더 큰 개선이 기대된다 — 제거만 필요한 경우 마커 생성 비용이 전혀
들지 않기 때문.

## 검증
- `npx tsc --noEmit` 통과
- `npm run test`(56파일 562건) 통과 — 대분류 기본 탭 변경으로 깨진
  `spot-category-filter.test.tsx`/`map-explorer.test.tsx` 3건을 새 기본 순서에 맞게 수정
- `npm run build` 통과
- 프로덕션 실측(Playwright): 네트워크 미발생 확인, 렌더링 시간 개선 확인

## 특이 사항
- `tests/e2e/support/mocks.ts`의 Kakao SDK 스텁에 `removeMarker`/`redraw` no-op을
  추가해 타입/런타임 정합성을 맞췄다(단, 이 e2e 스위트(`test:e2e`, Playwright)는 harness
  필수 검증 대상(`npm run test`)이 아니며, 이미 제거된 UI(반경 원, Quick 필터 뱃지)를
  참조하는 등 별도로 outdated 상태로 보인다 — 이번 작업 범위 밖).
