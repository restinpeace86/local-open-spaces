# [개선사항 6] 이벤트/체험 스팟 '다중 소스 가격 수집 및 관리자 검증 UI'

## 구현 대상
`implementation/todo.md` [개선사항 6] — 4개 소스(블로그/원천 설명/공식 홈페이지/정형
요금 필드) 병렬 가격·연령 후보 수집, 관리자 단일 페이지 검증 UI, 최종 확정 저장.

## 구현 일시
2026-09-15

## 조사 결과 (구현 전 확인한 기존 구조)
- **소스1(블로그)**: 이미 "🔍 블로그 큐레이션" 버튼(`EventBlogCurationModal`,
  2026-09-11)이 블로그 검색→선택→`events.curated_blog_urls`/`price_text` 저장까지
  전부 구현돼 있었다. 이번 화면에서 블로그 검색 UI를 다시 만들지 않고, 이미 저장된
  결과를 "소스1 카드"로 재구성해 보여주기만 한다(제5장 제4조 기존 구조 우선) —
  블로그 자체를 다시 검수하려면 기존 버튼을 쓰면 된다.
- **소스2(원천 설명)**: `events.description`이 이미 존재(네트워크 요청 불필요).
- **소스3(공식 홈페이지)**: `events.source_url`이 이미 존재. 실제 크롤링(HTML→텍스트
  변환)은 신규 구현이 필요했다 — `naver-blog-body.ts`의 `extractBlogBodyText()`는
  네이버 블로그 전용 컨테이너 클래스(`.se-main-container`)를 가정해 임의 사이트에는
  못 쓴다. `node-html-parser`(이미 프로젝트에 있음, jsdom 대신 채택된 이력 있음)로
  범용 페이지 텍스트 추출 함수(`extractGenericPageText`)를 새로 작성했다.
- **소스4(정형 요금 필드)**: 코드 전수 조사 결과 실제로 쓰이는 필드명은 `USE_FEE`
  (seoul-culture-events.mjs)와 `PARTCPT_EXPN_INFO`(gg-culture-events-adapter.mjs)
  뿐이었다(추측 금지 — 실제 코드에 없는 필드명을 임의로 나열하지 않음).
  `TOUR_API_FESTIVAL`/`SEOUL_YEYAK`은 전용 요금 필드가 없음을 실측 확인(각각
  price_text 항상 null / DTLCONT 설명문 파싱만 존재) — 이 경우 소스4는 정직하게
  "데이터 없음"이 맞는 결과다.
- **소스5(그 외 제안)**: 코드베이스 전체 조사 결과, 이 서비스가 이미 보유한
  독립적인 가격 정보원 중 위 4개 외에 남는 것은 없었다 — 정형 필드가 없는
  소스의 유일한 대안은 이미 소스2/3(설명/공식 홈페이지)가 커버한다. 관리자 화면에
  이 조사 결과를 그대로 안내 문구로 남겼다(없으면 없다고 답할 것).

## 변경 사항
### 1) DB 스키마: `event_price_verifications` (신규 테이블)
`scripts/migrations/2026-09-15-event-price-verifications-table.sql` —
`event_id`(FK, unique) / `candidates`(jsonb, 확정 시점 스냅샷) /
`final_price_type`(free/paid/variable) / `final_age_text` / `final_price_text` /
`admin_note` / `confirmed_at`. RLS는 spot_curations와 동일하게 서비스 롤 전용.
운영 DB에 적용 후 타입 재생성(`supabase gen types`)까지 반영.

### 2) 후보 수집 순수 로직 (`src/lib/admin/event-price-candidates.ts`)
`buildBlogCandidate`/`buildDescriptionCandidate`/`buildOfficialSiteCandidate`/
`buildRawFieldCandidate` + `extractAgeText`(AGE_HINT_KEYWORDS 재사용, 신호가 있으면
문맥 일부를 그대로 보여줌 — 미리 정한 몇 개 값으로 정규화하지 않는다) +
`extractGenericPageText`(신규 범용 HTML→텍스트). 네트워크 I/O가 없는 순수 함수라
전부 단위 테스트로 커버했다.

### 3) API 라우트 (`src/app/api/admin/events/price-candidates/route.ts`)
- GET: 4개 소스를 매 요청마다 즉시 재수집해 반환한다(저장하지 않음 — 블로그/설명은
  언제든 바뀔 수 있어 캐시된 후보를 보여주면 오히려 오해를 부른다). 공식 홈페이지
  크롤링만 실제 네트워크 요청(8초 타임아웃)이 필요해 서버에서 수행한다.
- PUT: 관리자가 확정한 값 + 그 시점의 후보 스냅샷을 upsert하고, **`events.price_text`/
  `is_free`도 함께 갱신**한다 — 이 화면이 `events` 테이블 자체를 갱신하지 않으면
  관리자 눈에만 보이고 실제 서비스(유저가 보는 이벤트픽 가격 표시)에는 아무 효과가
  없기 때문이다. `is_free`는 `final_price_type`을 실제로 선택했을 때만 갱신해,
  가격 텍스트만 입력하고 유무료를 아직 판단하지 않은 경우 기존 값(원천 API가 채운
  값일 수 있음)을 null로 덮어쓰지 않는다.

### 4) 관리자 UI (`src/components/admin/event-price-curation-modal.tsx`)
요청 원문 ASCII 목업 그대로: 4개 소스 카드(상태 뱃지, 가격/연령 텍스트, 블로그·
공식홈페이지 외부 링크, 원천 필드명 명시, 원문 전문 보기) + 최종 확정 폼(유무료
3분류 토글/최종 연령 기준/최종 가격 텍스트/추가 메모/확정 저장 버튼). "🔍 블로그
큐레이션" 버튼과 동일 레벨(`raw-data-modal.tsx`의 events 상세 팝업)에 "💰 가격
큐레이션" 버튼을 추가해 연다.

## 검증
- `npx tsc --noEmit`, `npm run test`(전체 1734개, 신규 23개 포함), `npm run build`
  모두 통과.
- 운영 DB/실제 이벤트로 GET을 두 건 실측: (1) 원천 설명에 "참 가 비 : 5,000원/회"
  (라벨에 공백이 섞여 있어 파서가 의도대로 매칭 안 함 — 오탐지 방지 설계가 정상
  동작), (2) 실제 `source_url`(현재 404로 이동/삭제된 페이지) 크롤링 시도 →
  `status: 'error', errorMessage: 'HTTP 404'`로 정확히 보고됨(크래시 없이 무중단
  처리). PUT도 Node fetch(정상 UTF-8)로 실제 저장/`events.price_text` 갱신까지
  확인 후 테스트 데이터를 원상복구했다(curl 셸 인코딩 문제로 한 차례 깨진 한글이
  저장됐던 것도 즉시 발견해 되돌림 — 애플리케이션 코드 버그가 아니라 테스트
  방법상의 인코딩 이슈였음을 Node fetch 재현으로 확인).

## 이번 범위에서 의도적으로 손대지 않은 것
- "최종 연령 기준"(`final_age_text`)은 관리자 화면에만 저장되고 유저 화면에는
  아직 노출하지 않는다 — 요청 원문의 화면 목업이 전부 "관리자 검증 화면"만
  다루고 있고, 이를 유저 상세 카드 어디에 어떤 형태로 보여줄지는 명시되지 않아
  임의로 새 UI 슬롯을 만들지 않았다(제7장 제3조 임의 비즈니스 로직/UI 생성 금지).
  필요하면 별도 지시로 유저 화면 노출 위치를 확정해 진행하는 것을 권장한다.
- 소스1(블로그) 검색 UI 자체의 재구현 — 기존 `EventBlogCurationModal`을 그대로
  재사용(위 조사 결과 참고).
