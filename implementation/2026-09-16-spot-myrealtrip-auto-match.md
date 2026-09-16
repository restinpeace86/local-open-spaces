# [스팟 상세 → 마이리얼트립 자동 매칭 (관리자 승인 방식)]

## 구현 대상
사용자 지시(2026-09-16, 자동화 확인 답변): "스팟픽에서 우리의 키즈카페 장소
검색시 해당 장소 눌렀을때 내부적으로 마이리얼트립에서 해당 키즈카페 상호명?
으로 검색하고 있으면 .. 동적 버튼을 통하여 해당 까페 티켓 구매 둘러보기라던가
만들고.. 그거 누를때 바로 넘어가는게 아니고 우리쪽에서 이에 대하여 큐레이션
등록하고 그 등록한 걸 통해서 넘어가게" — 이후 확인 질문에 대한 답: "관리자
승인 한 번 거치기(권장)".

## 구현 일시
2026-09-16

## 설계 판단: 완전 자동이 아니라 관리자 승인 게이트
사용자 원문은 "유저 클릭 시점에 바로 검색+등록"에 가까웠지만, 두 가지 위험을
설명하고 확인을 받았다:
1. **오매칭 위험**: 상호명 검색은 동명이인 업체/체인점 등으로 잘못된 상품과
   연결될 수 있다 — 완전 자동이면 이를 걸러낼 방법이 없다.
2. **API 한도**: 검색 API는 분당 200건 제한이 있다 — 실제 유저 트래픽마다
   검색을 호출하면 쉽게 한도를 넘길 수 있다.

확정된 방식: **관리자가 스팟 상세에서 미리 검색·확인·승인**해 두면, 그 시점에
마이링크(추적 링크)를 한 번만 생성해 저장하고, 유저 화면은 이미 승인된 결과만
읽는다(실시간 검색/생성 없음 — 응답 속도도 빠르고 API 한도 소모도 없음).

## 변경 사항
### DB (`scripts/migrations/2026-09-16-spot-myrealtrip-links.sql`)
- `spot_myrealtrip_links(spot_id unique fk, gid, item_name, image_url,
  price_display, product_url, mylink, approved_at)`. RLS만 켜고 정책 없음
  (event_operating_exceptions와 동일 관례).

### 백엔드
- `GET/POST/DELETE /api/admin/spot-myrealtrip-link`: 관리자 전용 CRUD.
  POST(승인) 시점에 `/v1/mylink`를 호출해 마이링크를 생성한 뒤 함께 저장한다.
- `GET /api/spots/myrealtrip-link`: 유저 화면 공개 조회 전용 — 저장된 결과만
  반환(admin 클라이언트로 조회, RLS 정책 없는 테이블이라 anon으로는 못 읽음).

### 관리자 UI
- `SpotMyRealTripLinkEditor`: `raw-data-modal.tsx`의 open_spaces 행 상세에
  배치. 매칭이 없으면 스팟명(기본값)으로 검색 → 결과 카드 목록 → "이 상품으로
  승인" 클릭 시 매칭 확정. 매칭이 있으면 확정된 상품 정보 + "매칭 해제" 버튼만
  보여준다.

### 유저 화면
- `detail-modal.tsx`: 스팟(이벤트 아님)일 때만 `/api/spots/myrealtrip-link`를
  조회해, 승인된 매칭이 있으면 액션 버튼 아래에 "🎟️ {상품명} 구매 둘러보기"
  링크(새창, 저장된 마이링크로 직접 연결)를 노출한다.

## 검증
- `npx tsc --noEmit`, `npm run test`(전체 1835개, 신규 8개 포함), `npm run build`
  모두 통과(`/api/admin/spot-myrealtrip-link`, `/api/spots/myrealtrip-link`
  라우트 정상 등록 확인).
- 실제 스팟("(주)미래(타요키즈카페 제주용담점)")으로 전 구간 실측: 매칭 없음
  확인 → 승인(마이링크 실제 생성됨, `https://myrealt.rip/...`) → 유저 화면
  공개 API가 정확히 그 결과를 반환 → 매칭 해제 → 재확인(정상적으로 비워짐)까지
  확인. 테스트 데이터는 정리했다.

## 이번 범위에서 다루지 않은 것 (사용자 보고 완료, 착수 보류)
- "시한성 특가 자동 추출": 검색 API 응답 필드(gid/itemName/description/
  salePrice/priceDisplay/category/reviewScore/reviewCount/imageUrl/
  productUrl/deepLink/tags)와 카테고리 목록(서울/오사카 실측 확인) 어디에도
  할인율/정가/프로모션 종료일 신호가 없어 API 구조상 자동 추출 근거가 없다 —
  문자열 매칭(예: 제목에 "특가" 포함 여부) 같은 임의 추측은 하지 않았다(제3장
  제5조).
- "키즈 카테고리 외 자동 판별": `category: "kids"`가 API가 제공하는 유일한
  구조적 신호이며, 그 외 자동 분류는 근거가 없어 보류.
