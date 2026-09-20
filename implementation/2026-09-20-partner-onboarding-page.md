# [나드리픽 파트너 PMS — 온보딩 페이지 및 스팟 연동]

## 구현 대상
사용자 지시(2026-09-20): "로그인 직후 신규 파트너(사장님)가 농장 정보를 등록하는
온보딩 페이지(`/partner/onboarding`) 및 서버 액션" 구현. 필드: 농장 이름/대표자
성함/연락처(필수), 대표 이미지(선택, Storage 업로드), 주소 + 스팟 연동(필수).
저장은 Server Action으로, 성공 시 `/partner`로 리다이렉트.

## 착수 전 조사
- **스팟 검색 재사용**: `/api/spots/search`(내부 DB, 인증 불필요) + `/api/spots/
  search-external`(카카오 로컬 Fallback) + `/api/spots/upsert-external`(외부
  장소 Auto-Upsert)이 이미 존재하고 전부 관리자 전용이 아니었다 — 이 3단계
  플로우를 그대로 구현한 `src/components/community/spot-picker.tsx`(후기/체크리스트
  작성용으로 이미 존재)를 파트너 온보딩에도 그대로 재사용했다(제5장 제4조 기존
  구조 우선 — 새 검색 UI를 만들지 않음).
- **이미지 업로드**: 이 코드베이스의 모든 Storage 업로드가 예외 없이 서버
  라우트(service_role)를 거친다는 걸 확인했다(`spot-curation-images`,
  `mom-pick-post-images` 둘 다 버킷 자체에 `authenticated` 쓰기 정책이 없음).
  브라우저 직접 업로드 전례가 전혀 없어, 로그인한 일반 사용자가 호출하는
  `/api/mom-pick/upload-image`(먼저 세션 확인 → service_role로 실제 업로드)
  패턴을 그대로 복제했다.
- **Server Actions**: 이 코드베이스는 지금까지 전부 Route Handler만 써왔고
  Server Action은 전례가 없었다 — 하지만 사용자가 지시서에서 메커니즘(Server
  Action)과 경로(`src/actions/partner/onboarding.ts`)를 명시적으로 지정했으므로
  "임의로 새 패턴을 고른 것"이 아니라 그 지시를 그대로 따랐다.

## 변경 사항

### DB
`scripts/migrations/2026-09-20-partners-onboarding-fields.sql`: `partners`에
`image_url text` / `address text` / `spot_id uuid references open_spaces(id)
on delete set null` 추가. 폼에서는 주소·스팟 연동을 필수로 받지만 컬럼 자체는
nullable로 뒀다(spec.md 8절 "옵셔널 필드 원칙 철저히 준수" — 필수 여부는
서버 액션에서 검증). 적용 후 `node scripts/gen-types.mjs`.

`scripts/migrations/2026-09-20-create-partner-farm-images-bucket.mjs`: 농장
대표 이미지용 Storage 버킷(`partner-farm-images`, public, 5MB 제한) —
기존 두 버킷 생성 스크립트와 동일한 패턴.

### 이미지 업로드 라우트
`src/app/api/partner/upload-farm-image/route.ts`: `/api/mom-pick/upload-image`와
완전히 동일한 구조(로그인 확인 → service_role 업로드 → 공개 URL 반환,
`user.id/{uuid}.ext` 경로).

### Server Action
`src/actions/partner/onboarding.ts` (`submitPartnerOnboarding`):
- 필수값(farm_name/owner_name/phone/address/spot_id) 검증, 실패 시
  `{ error }` 반환.
- `createClient()`(서버, 세션 쿠키 기반)로 `auth.getUser()` — 미들웨어가 이미
  걸러내지만 서버 액션은 다른 경로로도 직접 호출될 수 있어 다시 한번 확인
  (제5장 제11조).
- `partners.upsert({ id: user.id, ... }, { onConflict: 'id' })` — RLS
  (`partners_insert_own`/`partners_update_own`, Phase 1에서 이미 추가됨)가
  `auth.uid() = id`를 강제하므로 본인 행만 실제로 반영된다.
- 성공 시 `redirect('/partner')`.

### 폼 UI
`src/components/partner/onboarding-form.tsx`(클라이언트) +
`src/app/partner/onboarding/page.tsx`(서버, 얇은 래퍼로 교체 — 기존 스텁 제거).
"모바일 퍼스트... 사장님들이 쓰기 편하게 직관적이고 큰 폼 요소" 요구사항에 맞춰
다른 관리자 폼(text-sm/py-2)보다 한 단계 큰 터치 타깃(text-base/py-3)을 썼다.
스팟을 선택하면 그 스팟의 주소로 주소 입력창을 자동 채우되(중복 타이핑 방지),
이미 직접 입력해 둔 주소는 덮어쓰지 않는다(스팟 주소와 파트너 표기 주소가
항상 완전히 같으리라는 보장은 없음 — 추측 금지). 이미지는 선택 즉시 업로드해
URL만 최종 제출에 포함한다(다른 업로드 플로우와 동일한 관례).

## 검증
- `npx tsc --noEmit` 통과.
- `npm run test`: 174개 파일 2082개 테스트 전부 통과(신규 15개 — 서버 액션
  검증/로그인 확인/upsert/리다이렉트/trim 6개, 폼의 스팟 선택→주소 자동 채움
  (덮어쓰지 않는 경우 포함)/제출 payload/에러 표시/이미지 업로드 플로우 9개).
- `npm run build` 통과 — `/partner/onboarding` 라우트 정상 생성.
- 실측 한계: 실제 로그인 세션이 있어야 온보딩 페이지 접근이 가능해(미들웨어가
  비로그인 요청은 `/partner/login`으로 먼저 보냄), 이 세션에서는 브라우저로
  실제 OAuth 로그인 후 폼 제출까지 end-to-end로 직접 확인하지 못했다 — 대신
  단위/컴포넌트 테스트로 각 로직(검증, 업로드, upsert, 리다이렉트)을 개별
  검증했다. 실제 로그인 가능한 환경에서 한 번 더 실사용 확인을 권장한다.

## 특이 사항
- `submitPartnerOnboarding`은 이 코드베이스 최초의 Server Action이다 — 이후
  파트너 PMS의 다른 폼(예약 CRUD, 리마인드 템플릿 설정)도 이 파일을 참고해
  동일한 패턴(입력 타입 정의, 검증 함수, `createClient()` 세션 재확인)을 따르면
  일관성이 유지된다.
