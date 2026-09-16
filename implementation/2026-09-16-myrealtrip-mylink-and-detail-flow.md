# [마이리얼트립: 마이링크(추적 링크) 자동 생성 + 상세보기→등록 흐름]

## 구현 대상
사용자 지시(2026-09-16, 마이리얼트립 검색 탭 후속): "바로 반영해, 그리고 지금
만든 마이리얼트립 상품 검색 쪽에... 내가 상품리스트 보고.. 상품 체크하고 상품
상세 들어가서 해당 상품에 대하여 제휴상품으로 등록하는 흐름으로 할때 이게
만들어지고 등록되도록?" — 직전에 공유받은 "마이링크" 문서(URL 파라미터 방식/
`POST /v1/mylink` API 방식) 중 API 방식을 실측 검증한 뒤 등록 흐름에 반영.

## 구현 일시
2026-09-16

## 실측 확인
`POST /v1/mylink`(`{targetUrl}`)로 실제 상품 URL을 넘겨 `https://myrealt.rip/qamObf`
단축 링크를 발급받고, 그 링크를 직접 열어(리다이렉트만 확인) 아래처럼 실제
추적 파라미터가 자동으로 붙는 것을 확인했다:
```
https://myrealt.rip/qamObf
→ 301 → .../bridge/marketing?return_url=...%2Fproducts%2F3880363
   %3Fmylink_id%3D4837493%26t_scope%3D604800%26utm_source%3Dmktpartner
```
직전에 만든 등록 흐름은 `booking_url`에 원본 `productUrl`을 그대로 넣고
있었다 — 이대로면 클릭이 추적/정산되지 않는 문제가 있어 이번에 고쳤다.

## 변경 사항
### 백엔드
- `POST /api/admin/myrealtrip/detail`: `{gid}` → 상세 설명(HTML)/포함·불포함
  사항 프록시(직전 구현 기록에서 "카테고리 범위 결정 이후 필요 시 추가"로
  미뤄뒀던 것, 이번 지시로 바로 필요해짐).
- `POST /api/admin/myrealtrip/mylink`: `{targetUrl}` → 마이링크(myrealt.rip
  단축 URL) 생성 프록시.
- `src/lib/admin/myrealtrip-search.ts`: `MyRealTripProductDetail` 타입 추가.
  `mapSearchItemToCuratedItemPrefill(item, bookingUrl)`로 시그니처 변경 —
  이전엔 함수 내부에서 항상 `item.productUrl`을 썼는데, 이제 호출부가 마이링크
  생성 결과(또는 실패 시 원본 URL)를 명시적으로 넘긴다(네트워크 호출은 API
  라우트가 맡고, 이 함수는 순수 매핑만 유지).

### 관리자 UI — 흐름 변경
기존: 검색 결과 카드에서 "＋ 큐레이션에 등록"을 누르면 바로 등록 폼이 열림.
변경: 카드를 누르면 **상세 모달**(`MyRealTripProductDetailModal`)이 열려
소개 문구(HTML)/포함·불포함 사항을 먼저 보여주고, "🔗 제휴 상품으로 등록"을
누르면:
1. `/v1/mylink`로 추적 링크 생성 시도
2. 성공하면 그 마이링크를 `booking_url`로 채운 등록 폼(`CuratedItemFormModal`)이 열림
3. 실패하면(제5장 제11조 — 서비스가 멈추면 안 됨) 에러를 보여주고, "추적 없이
   원본 링크로 등록(수익 정산 안 됨)" 버튼으로 계속 진행할 수 있는 대안을 남김
   — 어느 쪽이든 관리자가 명확히 인지한 상태에서 선택한다.

## 검증
- `npx tsc --noEmit`, `npm run test`(전체 1826개, 신규 5개 포함), `npm run build`
  모두 통과(`/api/admin/myrealtrip/detail`, `/api/admin/myrealtrip/mylink` 라우트
  정상 등록 확인).
- 실제 API로 재현 호출: `detail({gid:"3880363"})` → 실제 HTML 설명 반환,
  `mylink({targetUrl:"...products/3880363"})` → 새 마이링크 정상 발급 확인.
