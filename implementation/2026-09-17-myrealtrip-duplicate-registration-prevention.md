# [마이리얼트립 제휴 상품 중복 등록 방지]

## 구현 대상
사용자 지시(2026-09-17): "[여주] 루덴시아 테마파크 9월 특가 이거 2개 보이는데?
중복입력된거 아니야? 이거 1개 삭제하고 중복 입력안되도록.. 조치해줘"

## 구현 일시
2026-09-17

## 진단
실측 확인 결과 같은 상품("[여주] 루덴시아 테마파크 9월 특가 입장권")을 시간차를
두고(2026-09-17 00:36과 07:27, 약 7시간 간격) 두 번 "🔗 제휴 상품으로 등록"해서
생긴 중복이었다 — 직전에 고친 빠른 더블클릭 방지(useRef 가드)와는 다른 원인이다.
근본 원인: `curated_items`에는 마이리얼트립 gid를 저장하는 컬럼이 없어서, 관리자가
같은 상품을 검색해 다시 "제휴 상품으로 등록"을 눌러도 "이미 등록했었다"는 걸 알
방법이 전혀 없었다(스팟 연결 기능(`spot_myrealtrip_links`)은 gid가 있어 "✅
연결됨"으로 이미 알려주고 있던 것과 대조적).

## 변경 사항

### 중복 데이터 정리
오래된 쪽(00:36:19 생성)을 삭제하고 최신 쪽(07:27:24 생성, 최신 마이링크)만 남김.
삭제 전후로 `curated_items` 전체에 다른 중복이 남아있지 않은지 재확인 완료.

### 데이터베이스
- `scripts/migrations/2026-09-17-curated-items-myrealtrip-gid.sql`: `curated_items`에
  `myrealtrip_gid text` 컬럼 추가(nullable — coupang 등 마이리얼트립과 무관한 수동
  등록 상품도 다루므로). unique 제약은 걸지 않는다 — DB 레벨 강제 차단이 아니라
  관리자 화면에서 경고 후 선택하게 한다(의도적 재등록까지 막지 않기 위함).

### 등록 시 gid 저장
- `mapSearchItemToCuratedItemPrefill`(`myrealtrip-search.ts`)이 이제 `myrealtrip_gid:
  item.gid`도 함께 prefill에 담는다.
- `CuratedItemFormValue`/`prefill` 타입에 `myrealtrip_gid` 추가, 폼은 이 값을
  사용자가 편집하지 않고 그대로 저장 payload에 실어 보낸다.
- `/api/admin/curated-items` POST가 `myrealtrip_gid`를 저장한다.

### 중복 감지 및 경고
- 신규 `GET /api/admin/curated-items/by-gids?gids=...` — 주어진 gid들 중 이미
  `curated_items`로 등록된 게 있는지 한 번에 조회한다(기존
  `spot-myrealtrip-link/by-gids`와 동일 패턴).
- `MyRealTripSearchPanel`: 검색 결과가 나올 때마다 이 API로 등록 상태를 함께
  조회해, 이미 등록된 상품은 카드에 "🏷️ 이미 제휴 상품으로 등록됨" 뱃지를, 상세
  모달에는 어떤 제목으로 등록돼 있는지 문구로 보여준다.
- "🔗 제휴 상품으로 등록"을 누를 때 이미 등록된 상품이면 `window.confirm`으로
  "이미 '{제목}'(으)로 등록된 상품입니다. 그래도 다시 등록하시겠습니까?"를 먼저
  묻는다 — 취소하면 마이링크 생성 API(분당 호출 한도 있음)조차 호출하지 않는다.
  확인하면 기존과 동일하게 등록을 진행한다(완전 차단이 아니라 확인 후 허용 —
  가격 변경 등으로 정말 재등록이 필요한 경우까지 막지 않기 위함).
- 등록에 성공하면 그 즉시 화면 상태를 갱신해 카드에 "이미 등록됨" 뱃지가 뜬다.

## 검증
- `npx tsc --noEmit`/`npm run test`(전체 1857개, 신규 6개 포함)/`npm run build`
  모두 통과.
- 실제 DB에서 중복 삭제 후 전체 재스캔으로 다른 중복이 없음을 확인.
- 실제 개발 서버에서 신규 `/api/admin/curated-items/by-gids` 라우트 응답 확인.
