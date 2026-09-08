# open_spaces 상세에서 중복 스팟 검토(다건 동시 병합)

## 구현 대상
사용자 지시: "8월 일반캠핑존 C형(4인용, 데크형)/8월 일반캠핑존 B형(4인용,
자갈형)/8월 프리캠핑존(4인용, 잔디형) 26년 한강공원 난지캠핑장 이렇게
되어있는것들은 예약기준으로는 별도로 가는게 맞는데 장소기준으로는
난지캠핑장 하나 아니야?" → (실측 확인 후 사용자 확인) "장소 단위로 묶어서
대표 1건만 노출 하는 걸로 하자.. 그리고 중복스팟 검수 및 매핑 있는데 이
탭에 있는 것을 스팟 큐레이션 옮긴 것처럼 해당 스팟 상세에 대하여 버튼
만들어서 중복 스팟 검색이라던가 검수라던가 매핑이라던가 해야하나?"

이 기록은 그중 **관리자 워크플로우(어떻게 중복을 실제로 그룹으로
등록하는가)** 부분이다. 소비자 화면의 "대표 1건 노출 + 클릭 시 펼치기"는
별도 기록([[2026-09-09-group-representative-exposure]])에서 다룬다.

## 구현 일시
2026-09-09

## 배경 조사
- 실측 결과 서울시 공공예약(`seoul_public_reservation`) 소스는 예약
  단위(SVCID)로 낱개 적재되는 것이 Decision 017의 의도된 설계다.
  `open_spaces` 전체 142,118건 중 이 소스가 1,455건, 그중 실제 서로 다른
  장소는 382곳뿐(장소당 평균 3.8건 중복) — 난지캠핑장 하나만도 42건이
  완전히 동일한 좌표에 겹쳐 있다(실측).
- 기존 "중복 스팟 그룹핑" 인프라(`spot_dedup_groups`/`spot_dedup_pending_groups`,
  `SpotDedupPanel`, `find_nearby_open_spaces` RPC, `MobileCurationWorkbench`의
  "1단: 중복 장소 검수 배너")는 이미 있었지만 실제로 **한 번도 실사용되지
  않았다**(`spot_dedup_groups` 0건, 실측 확인) — 배너가 "후보 1건씩 합치기"
  UX라 이런 대량(수십 건) 중복에는 비효율적이었던 것도 한 원인으로 보인다.
- `find_nearby_open_spaces`(단건 반경 조회 RPC)는 `p_limit` 기본값이 5라
  42건짜리 그룹을 다 보여주지 못했다.

## 변경 사항
### 1. `find_nearby_open_spaces` RPC 기본 limit 상향
`scripts/migrations/2026-09-09-raise-find-nearby-open-spaces-limit.sql` —
`p_limit` 기본값 5 → 50. 특정 카테고리를 하드코딩하지 않고 일반적으로
올린 값이라(제3장 제4조 확장성 고려) 캠핑장이 아닌 다른 대량 중복 사례에도
그대로 적용된다. 적용 후 실측: 난지캠핑장 기준 42건 정상 반환 확인.

### 2. `spot-dedup-quick-modal.tsx`(신규): `SpotDedupQuickModal`
`MobileCurationWorkbench`의 "1단: 중복 장소 검수 배너" 로직(30m 반경 조회,
"유지" 시 `spot_dedup_pending_groups`에 ignored로 기록)을 그대로
재사용하되(제5장 제4조), 후보를 **체크박스로 여러 개 한 번에 선택**해 한
번의 "합치기"로 전부 묶을 수 있게 확장했다 — `GroupDetailModal`(기존,
`/api/admin/spot-dedup/apply` 호출)이 이미 임의 개수의 멤버를 지원하므로
(`group.members: DedupCandidateRow[]`), 새 백엔드 없이 프런트 UX만
다건-선택으로 바꾸면 됐다.

### 3. `raw-data-modal.tsx`
"🔍 블로그로 큐레이션"/"🏷️ 스팟 큐레이션" 버튼과 같은 레벨에 "🔗 중복
스팟 검토 (같은 장소 병합)" 버튼을 추가했다.

## 검증
- `spot-dedup-quick-modal.test.tsx`(신규, 4개): 후보 없음 안내, 체크박스로
  여러 건 선택 시 버튼 카운트 반영, "다른 장소임" 클릭 시 목록에서 빠지고
  `pending-groups`에 `ignored`로 기록, 여러 건 체크 후 합치면 `spot_ids`에
  현재 스팟 + 선택한 후보 전부가 담겨 `/apply`로 전송되고 성공 메시지 표시.
- `raw-data-modal.test.tsx`: 신규 트리거 테스트 2개(open_spaces 탭에서 버튼
  클릭 시 팝업 열림, events 탭에는 버튼 없음).
- `npx tsc --noEmit` / `npm run test`(1338건) / `npm run build` 전체 통과.

## 특이 사항
- `SpotDedupPanel`(기존 관리자 '중복 스팟 그룹핑' 탭)과
  `MobileCurationWorkbench`의 기존 배너는 건드리지 않았다 — 이번 추가는
  "open_spaces 상세에서 곧장 시작하는" 새로운 진입점일 뿐, 기존 두 화면과
  병행 존재한다(모두 같은 `GroupDetailModal`/`/apply` API를 공유하므로
  데이터 관점에서는 완전히 동일한 결과를 낸다).
