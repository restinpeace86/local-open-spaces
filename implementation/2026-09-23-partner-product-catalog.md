# 파트너 상품 카탈로그 — 예약 추가 화면 상품 콤보박스 + 팀당/인당 가격 자동 계산

## 구현 대상
사용자 지시(2026-09-23): "파트너 예약추가 화면에서 상품명/객실명(선택)을
텍스트로 해놨네... 그냥 상품명으로 통일하고 콤보박스로 선택하게 해... 그리고
보통 상품의 금액 같이 붙으니... 여기에 대하여 상품명과 금액 붙여놔 여기에
대하여 설정은 더보기에서 화면 하나 만들어서 세팅할 수 있게해놓고 거기있는
데이터 가져와서 리스트로 나오게 하고 그중 선택하게해.. 상품(가격)이 보이고
인원선택하면 끝이잖아.. 지금은 너무 좀 불편해"

가격 계산 방식에 대해 후속 확인: "상품에 대하여 팀당 1개인지 아니면 인당
1개인지의 문제 아니야?.. 두가지 다 성립하도록" — 상품마다 "팀당(인원수
무관 고정가)"과 "인당(가격 × 인원수)" 중 선택할 수 있게 확정.

## 변경 사항

### 1) 신규 테이블 `partner_products`
`scripts/migrations/2026-09-23-partner-products.sql`: `id, partner_id, name,
price, pricing_unit('flat'|'per_person'), created_at`. partners/bookings와
동일한 RLS 패턴(auth.uid() = partner_id, 제5장 제4조). 운영 DB 적용 완료
(사용자 승인), `information_schema.columns`로 컬럼 구조 확인.

### 2) 상품 관리 화면 (더보기 > 상품 관리)
- `src/actions/partner/products.ts`: `createPartnerProduct`/
  `updatePartnerProduct`/`deletePartnerProduct` — onboarding.ts/bookings.ts와
  동일한 관례(세션 클라이언트, RLS에 위임, 성공 시 관련 경로 revalidate).
- `src/components/partner/products-manager.tsx`(`ProductsManager`): 목록 +
  추가/수정 폼(상품명·가격·가격 기준 라디오) + 삭제(확인 대화상자).
- `src/app/partner/(tabs)/more/products/page.tsx`: 세션 클라이언트로
  본인 상품 목록 조회 후 `ProductsManager`에 전달.
- `src/app/partner/(tabs)/more/page.tsx`: 기존 "준비 중" 목록 위에 실제로
  동작하는 "🛍️ 상품 관리" 링크 추가(나머지 준비 중 항목은 그대로 둠 —
  제7장 제4조, 요청 범위 밖 기능은 구현하지 않음).

### 3) 예약 추가 화면 — 자유 텍스트 → 콤보박스 + 자동 계산
- `src/components/partner/add-booking-fab.tsx`: "상품명/객실명(선택)" 자유
  텍스트+최근 이력 자동완성(datalist)을 없애고, 상품 카탈로그를 보여주는
  `<select>`("상품명(선택)")로 교체 — 옵션에 이름과 가격을 함께 표기
  (예: "입장권 (15,000원/인)"). 상품을 선택하거나 방문 인원을 바꾸면
  `computeTotalPrice`가 가격 기준에 따라 결제 금액을 자동 계산해 채운다
  (팀당=가격 그대로, 인당=가격×인원수). 자동 계산된 값도 이후 직접 고쳐
  쓸 수 있다(스팟 연동이 주소를 자동으로 채우되 잠그지 않는 것과 동일한
  관례) — 다만 상품이나 인원을 다시 바꾸면 그 시점 기준으로 재계산된다.
- `src/app/partner/(tabs)/today/page.tsx`: 예전 예약 이력에서 상품명을
  모아 자동완성 후보로 쓰던 조회(`recentProductRows`)를 없애고,
  `partner_products` 테이블에서 상품 카탈로그를 그대로 조회해 넘긴다.

## 검증
- `npx tsc --noEmit`(DB 컬럼이 text+check 제약이라 codegen 타입이 좁은
  리터럴이 아닌 string으로 나와, DB가 이미 강제하는 값 범위를 근거로 좁은
  타입으로 캐스팅 — 두 페이지 컴포넌트 경계에서만) / `npm run test`(201개
  파일 2,316개 — 신규: products.test.ts, products-manager.test.tsx,
  add-booking-fab.test.tsx의 콤보박스/자동 계산/재계산/수동 override 케이스
  추가) / `npm run build` 모두 통과. `/partner/more/products` 라우트가
  `ƒ`(Dynamic)로 정상 등록됨을 빌드 출력에서 확인.
- 배포 후 실제 파트너 계정(goodguy0515@gmail.com, "괴산 서울농장") 세션으로
  end-to-end 확인 예정: 상품 관리에서 팀당/인당 상품 등록 → 목록 표시 확인
  → 예약 추가 화면 콤보박스에 반영 확인 → 인당 상품 선택 후 인원 변경 시
  결제 금액 재계산 확인 → 테스트 상품 정리(실사용 계정 데이터 오염 방지)
  (이 기록 갱신 예정).

## 특이 사항
- 상품 삭제 기능은 있지만, 이미 과거 예약(`bookings.product_name`)에 쓰인
  상품명 텍스트 자체는 그대로 남는다(예약은 상품 id가 아니라 이름 문자열을
  스냅샷으로 저장 — 상품을 나중에 삭제/이름 변경해도 과거 예약 기록이
  깨지지 않는다는 뜻이자, 의도된 동작).
