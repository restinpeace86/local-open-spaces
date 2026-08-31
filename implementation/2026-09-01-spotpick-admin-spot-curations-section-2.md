# [개발 종합 요청] 스팟픽 MVP 스마트 폴백, 관리자 큐레이션 및 배치 안정화 고도화 — 섹션 2(관리자 스팟 큐레이션 탭)

## 구현 일시
2026-09-01

## 배경
대형 종합 지시서의 4개 섹션 중 섹션 2. 섹션 1(프론트엔드 폴백)이 이 섹션의 데이터
구조(spot_curations)에 의존하므로 먼저 구현한다.

## 구현 내용

### 1. `spot_curations` 테이블 신설
`scripts/migrations/2026-09-01-create-spot-curations-table.sql` — open_spaces와
`spot_id`(FK, unique — 1:1 관계) 로 연결되는 관리자 전용 부가 정보 테이블.
`is_active`, `image_url`, `operating_hours_raw`(원문 보존) + 구조화 필드
(`open_time`/`close_time`/`break_start`/`break_end`/`last_order`), `menu_items`
(jsonb 배열), `curation_note`. curated_items/deals와 동일하게 RLS를 켜고 정책은
추가하지 않는다(service_role 전용). `npm run gen:types`로 타입 갱신 완료.

### 2. Supabase Storage 버킷
`scripts/migrations/2026-09-01-create-spot-curation-images-bucket.mjs` — 신규
public 버킷 `spot-curation-images`(5MB 제한, png/jpeg/webp/gif만 허용) 생성.
`next.config.ts`에 이미 `*.supabase.co/storage/v1/object/public/**` remotePattern이
설정돼 있어 이 용도를 위한 사전 준비가 이미 돼 있었다.

### 3. 스마트 텍스트 파서
`src/lib/admin/spot-curation-parsers.ts`(순수 함수, 신규 유닛 테스트 10건):
- `parseOperatingHoursText`: "10:00~22:00 (브레이크타임 15:00~17:00, 라스트오더
  21:30)" 같은 자유 텍스트에서 영업시간/브레이크타임/라스트오더를 각각 정규식으로
  분리한다. "~"/"-" 구분자, "브레이크타임"/"휴게시간", "라스트오더"/"L.O"/"주문마감"
  등 여러 표기를 인식한다. 못 찾은 항목은 null로 남기고 추측해 채우지 않는다.
- `parseMenuText`: "짜장면 7,000원" 형태의 줄을 `{name, price}`로 분리한다. 쉼표
  유무/"원" 접미사 유무 모두 인식하고, 가격을 찾을 수 없는 줄은 결과에서 제외한다.

### 4. API
- `GET/POST/PATCH /api/admin/spot-curations`: curated-items의 CRUD 패턴을 그대로
  따른다. GET은 `spot_id` 단건 조회(View Fallback/편집 폼용, 없으면 `item: null`)와
  목록 조회(PostgREST 임베디드 리소스로 `open_spaces(name, address, category)`를
  조인, 검색어는 조인된 스팟명/주소 대상) 둘 다 지원. POST는 spot_id unique 위반 시
  409로 "PATCH를 쓰라"고 명확히 안내.
- `POST /api/admin/spot-curations/upload-image`: 클립보드에서 얻은 이미지 Blob을
  FormData로 받아 Storage에 업로드하고 공개 URL을 반환. 파일 타입/용량을 서버에서도
  재검증한다(클라이언트 검증만 믿지 않음).

### 5. 관리자 UI
`src/components/admin/spot-curations-panel.tsx`(신규) — `data-grid-client.tsx`의
5번째 탭("📍 스팟 큐레이션")으로 curated_items 탭과 동일하게 자기완결적으로 분리
렌더링(섹션 3의 Lazy Loading 게이트도 동일하게 적용). 목록(스팟명 검색, is_active
토글, 수정) + 등록/수정 모달(스팟 검색 — 기존 `/api/spots/search` 전국구 검색을
재사용, 이미지 영역에 `onPaste`로 클립보드 이미지 즉시 업로드, 영업시간/메뉴
텍스트 붙여넣기 + "⚡ 자동 파싱" 버튼 + 구조화된 결과를 직접 수정 가능).

## 검증

### 코드 검증
- `npx tsc --noEmit`/`npm run test`(72파일 735건 — 파서 유닛 테스트 10건 신규)/
  `npm run build` 통과. `/api/admin/spot-curations`, `/api/admin/spot-curations/
  upload-image` 라우트 정상 등록 확인.

### 실측 검증(로컬 개발 서버, 프로덕션 DB — 테스트 데이터는 검증 직후 전량 삭제)
- 실제 스팟("운중어린이공원")에 대해 POST → PATCH(한글 인코딩 정정, Windows Git
  Bash `-d` 인자 UTF-8 손상 재발 — 이전에도 겪은 로컬 쉘 문제, 파일 기반 payload로
  우회) → `spot_id` 단건 조회 → 스팟명 검색 목록 조회(PostgREST 조인 정상 동작) →
  `is_active=false` 토글 → 동일 spot_id 재등록 시 409 응답까지 전체 흐름 확인.
- 실제 1x1 PNG 파일을 `/api/admin/spot-curations/upload-image`에 업로드해 반환된
  공개 URL이 실제로 200 OK/`image/png`로 응답함을 확인(Storage 버킷 public 설정
  정상 동작).
- Playwright로 실제 `/admin/data-grid` 페이지에서 "📍 스팟 큐레이션" 탭 클릭 →
  "+ 스팟 큐레이션 등록" 모달 오픈 → 스팟 검색 입력/클립보드 붙여넣기 안내/영업시간·
  메뉴 자동 파싱 버튼이 모두 실제로 렌더링됨을 확인.

## 특이 사항
- 이미지 붙여넣기(`onPaste`)는 실제 브라우저 클립보드 이벤트가 필요해 이번
  자동화 검증(curl/Playwright)에서는 업로드 API 자체(실제 PNG 파일 업로드)만
  실측했다 — 브라우저에서 실제로 이미지를 복사해 Ctrl+V 하는 수동 확인은 관리자가
  직접 해봐야 한다.
- 스팟 검색은 새로 구축한 `/api/spots/search`(전국구 서버사이드 검색)를 그대로
  재사용했다 — 검색 UX가 스팟픽(/nearby)과 관리자 화면에서 완전히 동일하다.
