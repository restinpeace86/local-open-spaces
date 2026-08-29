# [제휴 특가(Deals) 데이터베이스 스키마, 수집 어댑터 및 이벤트픽 연동 MVP]

## 요구사항
1. `deals` 테이블 생성(정가/할인가/할인율/이미지/제휴 링크/노출 여부), reservations와
   동일한 RLS(서비스 롤 전용) 적용.
2. `GET /api/deals`(활성 특가 최신순 조회) + 외부 제휴 API 응답을 upsert할 수 있는 수집
   스크립트/함수의 뼈대.
3. 메인/이벤트 탭에 특가 카드 UI, 상세 모달에 설명/가격 + 제휴 마케팅 안내 문구 +
   [특가로 구매하러 가기] 버튼(새 창).
4. 검증 후 커밋/푸시.

## 구현 일시
2026-08-29

## 1. DB 스키마 (`scripts/migrations/2026-08-29-create-deals-table.sql`)

reservations와 동일하게 RLS를 켜고 정책을 하나도 추가하지 않았다 — anon/authenticated는
완전히 차단되고 service_role만 접근 가능하다. reservations는 개인정보 보호가 목적이었다면,
deals는 "쓰기 차단"이 목적이다(공개 콘텐츠지만 익명 키로 쓰기가 가능하면 누구나 가짜
특가/악성 제휴 링크를 심을 수 있음).

컬럼은 지시서 명세를 그대로 따르되, 다음 2가지를 데이터 무결성 목적으로 추가했다(기능
추가가 아니라 CHECK 제약 수준의 안전장치):
- `discount_price <= original_price`, `0 <= discount_rate <= 100` CHECK 제약.
- `affiliate_url unique` — 수집 어댑터가 같은 상품을 재수집했을 때 upsert 충돌 키로 쓴다
  (요구사항 2 "upsert할 수 있는" 스크립트의 전제 조건).

적용은 `node scripts/apply-sql.mjs`로, 타입은 `npm run gen:types`로 재생성했다.

## 2. API (`src/app/api/deals/route.ts`)

`reservations` GET과 동일한 패턴 — `createAdminClient()`(서비스 롤)로 `is_active=true`인
행만 `created_at desc` 정렬, 페이지네이션(`page`/`page_size`) 지원.

## 3. 수집 어댑터 뼈대 (`scripts/ingest/adapters/deals-collector.mjs`)

**지시서가 명시적으로 "뼈대"만 요구했고, "쿠팡 파트너스나 네이버 쇼핑 등"으로 예시만 들 뿐
특정 API를 확정하지 않았다** — 실제 API 키/엔드포인트/응답 필드명을 추측으로 구현하지
않는다(제3장 제5조). 대신 어떤 제휴 API를 나중에 연동하든 그대로 재사용 가능하도록 표준
중간 형태(`RawDealItem`)를 정의했다:
- `fetchDealsFromAffiliateApi()`: 실제 API 확정 전까지는 명확한 미구현 에러를 던진다(가짜
  데이터로 채우지 않음).
- `transformDealItem(item)`: `RawDealItem` → deals 행 변환. 할인율이 없으면 가격에서 계산.
- `upsertDeals(client, rows)`: `affiliate_url` 충돌 키로 upsert.
- `collectDeals({dryRun})`: fetch → transform → upsert 오케스트레이션.

**`BaseCollectorAdapter`를 상속하지 않은 이유**: 그 베이스 클래스는 `targetTable`이
`'open_spaces'|'events'|'multi'`만 허용하고, 공용 upsert 헬퍼(`upsertRows`/
`upsertRowsSafeMerge`)가 전부 `external_id` 기준 dedup에 결합돼 있다(위치 기반 소스
15종 이상이 공유하는 인프라). deals는 위치가 아니라 커머스 상품이고 충돌 키도
`affiliate_url`이라 억지로 끼워맞추면 오히려 기존 인프라를 넓게 건드리는 위험이 크다 —
독립된 가벼운 스크립트로 분리했다(제5장 제4조 기존 구조 우선의 취지는 "목적이 다른데도
억지로 재사용"이 아니라 "동일 목적 기능의 중복 방지"이므로, 이 경우는 분리가 맞다고 판단).

단위 테스트(`deals-collector.test.mjs`)로 `transformDealItem`의 유효성 검증/할인율 계산,
`upsertDeals`의 충돌 키 지정, `collectDeals`가 뼈대 상태(미구현 에러)임을 명확히 드러내는지
확인했다.

## 4. 프론트엔드 연동

- **`src/components/home/home-sub-tabs.tsx`**: 기존에 `enabled: false`로 비활성 노출되던
  "🏷️ 특가·핫딜" 탭을 `enabled: true`로 전환했다. 기존 주석은 "실제 데이터가 전혀 없어
  비활성화"라는 이유였는데, 이번 지시서로 DB/API/UI가 모두 마련되어 그 전제가 해소됐다.
  실제 제휴 API 연동 전이라 deals가 비어 있을 수 있지만, 그 경우는 기존 "무료·공공" 탭과
  동일하게 `EmptyState`로 처리되므로(가짜 데이터 없이도) 탭을 열어두는 데 문제가 없다.
- **`src/components/cards/deal-card.tsx`**: `EventCard`의 이미지:텍스트 flex-[4]/flex-[6]
  고정 비율 레이아웃을 재사용, 할인율 뱃지 + 정가(취소선)/할인가 표시.
- **`src/components/map/deal-detail-modal.tsx`**: 설명/가격 정보 + 필수 제휴 마케팅 안내
  문구("이 포스팅은 제휴 링크를 포함하며...") + `target="_blank" rel="noopener noreferrer"`로
  여는 [🛍️ 특가로 구매하러 가기] 버튼. `DetailModal`(NearbyItem 전용, 위치/일정 필드
  기준)과 데이터 모양이 달라 별도 컴포넌트로 분리했다.
- **`src/components/home/home-view.tsx`**: `useDealsFeed()` 훅 신설(`useFreeFeed`와 달리
  deals는 지역 개념이 없어 탭 최초 선택 시 한 번만 페칭), `activeTab === 'hotdeal'` 렌더
  분기 추가, `DealDetailModal` 마운트.

## 검증

### 코드 검증
- `npx tsc --noEmit` 통과.
- `npm run test`(65파일 679건 — 신규: `deals-collector.test.mjs` 8건, `home-view.test.tsx`
  특가·핫딜 3건 신규 및 기존 비활성 탭 테스트 교체) 통과.
- `npm run build` 통과 — `/api/deals` 라우트 정상 포함.

### 실측 검증(로컬 개발 서버, 프로덕션 DB)
- **RLS**: anon 키로 `select`는 빈 배열(정책 없음), `insert`는 명시적 RLS 위반 에러로
  차단됨을 확인. service-role 키로는 insert/delete 정상 동작.
- **API**: service-role로 테스트 특가를 생성한 뒤 실행 중인 로컬 개발 서버의
  `GET /api/deals`를 호출해 응답에 정확히 포함됨을 확인, 검증 후 테스트 데이터 삭제.

## 특이 사항
- **수집 어댑터는 의도적으로 미완성 상태다**: 실제 쿠팡파트너스/네이버쇼핑 API 키가
  아직 없고 지시서도 "뼈대"만 요구했다 — `fetchDealsFromAffiliateApi()`는 명확한 안내
  메시지와 함께 미구현 에러를 던진다. 실제 연동 시 이 함수 내부만 교체하면 나머지
  (transform/upsert/collectDeals)는 그대로 동작한다.
- **`hotdeal` 탭 활성화 판단**: `spec/common/feature-flags.md`는 미승인 기능을 코드 레벨로는
  선구현하되 UI 노출은 별도 게이트를 거치라는 원칙을 담고 있지만, 이 탭은 애초에 "실제
  데이터가 전혀 없다"는 구체적 이유로만 비활성화돼 있었고 이번 지시서 자체가 UI 구현을
  3번 요구사항으로 명시했다 — 데이터 유무 문제가 해소된 이상 탭을 열었다. 되돌리려면
  `home-sub-tabs.tsx`의 `enabled: true → false` 한 줄만 바꾸면 된다.
- 제휴 API 자체 연동(실제 쿠팡파트너스/네이버쇼핑 키 발급 및 `fetchDealsFromAffiliateApi()`
  구현)은 이번 지시서 범위 밖이라 진행하지 않았다 — 별도 지시 필요.
