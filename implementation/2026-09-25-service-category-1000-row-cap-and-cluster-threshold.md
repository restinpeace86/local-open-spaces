# 노출 중분류 조회 1,000건 truncation 수정 + 클러스터링 건수 기준 자동 분기

## 구현 대상
사용자 지시(2026-09-25):
1. "지금 노출중분류 매핑으로 보이도록 하고 있잖아.. 그럼 이 구조대로 했을때
   현재기준으로 하나의 중분류에 1000건이 안넘지 않나 ? 여기에 대하여 클러스터
   On/Off 기능으로 하는게 괜찮은지.. 적용가능한지 검토해줘" (검토 요청)
2. (검토 결과 보고 후) "어 1000건 잘리면 안되지 ... 내기준에서 1000건만
   보여달라는건 없었잖아.. 그래 그렇게 제안한대로 해" (구현 승인)

## 검토 결과 요약 (구현 전 실측)
사용자 전제("하나의 중분류에 1000건이 안 넘지 않나")를 실측으로 확인한 결과
일부 틀렸다 — 대표 1건 기준 실제 건수: 캠핑장/피크닉장 3,227건, 키즈카페/
실내놀이터 2,246건, 휴양마을 1,211건(이 3개는 1,000건 초과), 그 외 13개는
수백 건 이하. 그리고 더 심각한 문제를 발견했다: `get_spots_by_service_category`
RPC를 공개 REST 엔드포인트로 직접 호출해보니 PostgREST 기본 max-rows(1,000)에
걸려 **캠핑장/피크닉장이 3,227건 중 1,000건만 조용히 잘려서 반환되고 있었다**
(`content-range: 0-999/3227`, status 206) — 사용자가 요청한 적 없는 암묵적
truncation. 이 버그를 먼저 고치는 게 클러스터 On/Off보다 우선이라고 판단해
사용자에게 보고했고, 승인받았다.

## 변경 사항

### 1) 1,000건 truncation 수정
- `scripts/migrations/2026-09-25-fix-service-category-rpc-1000-row-truncation.sql`
  (신규, 사용자 승인 후 적용): `get_spots_by_service_category`에 `order by
  s.id`를 추가했다. ORDER BY 없이 `.range()`로 페이지네이션하면 Postgres가
  페이지 간 행 순서를 보장하지 않아 중복/누락이 생길 수 있어, 안정적인
  유니크 키 기준 정렬이 페이지네이션의 전제 조건이다. 반환 컬럼/WHERE 조건은
  기존과 완전히 동일(재적재 회귀 방지) — ORDER BY 한 줄만 추가, 반환 타입
  변경이 없어 DROP 없이 CREATE OR REPLACE로 안전하게 적용됐다(직전
  `get_nearby_spaces_and_events`처럼 컬럼을 추가하는 경우와 달리 이번엔 DROP이
  필요 없었다 — 실측 확인).
- `src/lib/spaces/get-nearby.ts`의 `getSpotsByServiceCategory()`: `.range()`로
  1,000건씩 페이지를 반복 요청해 전체를 모으도록 변경. 마지막 페이지가
  PAGE_SIZE(1,000)보다 작게 오면 종료. 무한 루프 방지용 안전 상한
  (SAFETY_MAX_PAGES=50)을 뒀다(현재 최대 중분류 3,227건에 크게 여유).
- 신규 테스트 `src/lib/spaces/get-nearby.test.ts`(5건): 단일 페이지, 실측
  사례(3,227건=1,000+1,000+1,000+227) 재현, 정확히 1,000의 배수 경계, 빈
  결과, RPC 에러 전파.
- `src/components/map/map-explorer.test.tsx`: 공용 `rpcMock`이 `.rpc()` 호출
  직후 바로 `await`되는 평범한 Promise를 반환하던 기존 방식으로는 새로 추가된
  `.range()` 체이닝을 지원하지 못해(카테고리 선택 관련 테스트 6건이 "range is
  not a function"으로 실패) — `rpcMock`은 그대로 두고(기존 assertion들이 계속
  이 객체를 참조), 실제로 소비 코드에 넘기는 반환값에만 `.range()`를 얇게 얹어
  같은 결과를 반환하는 `rpcWithRange` 래퍼를 추가했다.

### 2) 클러스터링 건수 기준 자동 분기
- `src/components/map/kakao-map-view.tsx`: `CLUSTER_ITEM_COUNT_THRESHOLD = 300`
  신규. 마커 렌더링 effect에서 `items.length >= 300`이면 기존처럼
  `clustererRef.current.addMarkers(markers)`(2026-09-25에 minLevel=10으로
  바꾼 클러스터러 — 최상단 광역 뷰에서만 클러스터링), 미만이면 클러스터러를
  건너뛰고 `marker.setMap(mapRef.current)`로 지도에 직접 붙인다. 기존 teardown
  로직(`clustererRef.current.clear()` + 모든 이전 마커 `setMap(null)`)이 이미
  두 경로 모두를 커버해, 카테고리를 바꿔가며 반복 선택해도 잔여 마커가 남지
  않는다. `refreshEmphasis()`(포커스/호버 강조)는 클러스터러 소속 여부와 무관
  하게 마커 객체에 직접 `setImage`/`setZIndex`를 호출하는 구조라 두 경로 모두
  영향 없이 동작한다.
- 사용자 지시대로 수동 On/Off 토글이 아니라 건수 기준 자동 분기로 구현했다
  (임계값 300은 "300~500건" 제안 범위의 하한 — 보수적으로 일찍 클러스터링).

## 검증
- `npx tsc --noEmit` / `npm run test`(202개 파일 2,328개, 신규 5건 포함) /
  `npm run build` 모두 통과.
- 실측: `get_spots_by_service_category`를 DB에서 직접 호출해 캠핑장/
  피크닉장 전체 건수(3,227)가 정확히 나오는지 확인(마이그레이션 적용 직후).
- kakao-map-view.tsx는 이 프로젝트에 기존에도 전용 단위 테스트가 없다(카카오
  SDK 의존이라 map-explorer.test.tsx에서 전체를 모킹). 배포 후 실제 화면에서
  캠핑장(다수, 클러스터링 유지)과 소규모 중분류(예: 어린이 과학관/박물관 8건,
  클러스터 없이 개별 핀)를 비교 확인 예정(이 기록 갱신).

## 특이 사항
- `get_nearby_spaces_and_events`(반경 기반 기본 조회)는 자체 `LIMIT 1001`이
  이미 있어 이번 truncation 버그의 영향을 받지 않는다 — 이번 수정은
  `get_spots_by_service_category`(노출 중분류 전국 조회, LIMIT 없음) 한
  곳에만 해당한다.
