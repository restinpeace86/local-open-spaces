# [원천 링크 페이지 크롤링/조회]

## 구현 대상
[개선사항 3] (2026-09-16 todo.md 재배포분): 관리자용 상세 팝업에서 raw_data의
공식 외부 URL(ORG_LINK/HMPG_ADDR/SVCURL 등)을 크롤링해 본문을 보여주는 기능.

## 구현 일시
2026-09-16

## 설계 판단: raw_data를 직접 다시 뒤지지 않고 이미 정규화된 컬럼을 쓴다
요구사항 원문은 "raw_data JSON에 포함된 URL 컬럼을 활용해"라고 되어 있지만,
실제 조사 결과 이 URL들은 **이미 각 인제스트 어댑터가 소스별 우선순위로
정규화해 `events.source_url`/`open_spaces.info_url` 컬럼에 저장해 두고
있었다**(예: `seoul-culture-events.mjs`는 `ORG_LINK || HMPG_ADDR`, `gg-culture-
events-adapter.mjs`는 `HMPG_URL || URL`, `tour-api-festival.mjs`는 `homepage`
필드가 `<a href="...">` HTML로 감싸여 오는 것까지 별도 추출). admin UI에서
raw_data를 다시 뒤져 이 우선순위를 재구현하면 소스별 예외(특히 HTML로 감싸인
경우)를 놓쳐 잘못된 URL을 만들 위험이 있어(제5장 제4조 기존 구조 우선), 이미
검증된 정규화 컬럼을 그대로 크롤링 대상으로 썼다.

## 변경 사항
### DB 컬럼 노출
- `src/app/api/admin/data-grid/route.ts`의 `EVENTS_COLUMNS`에 `source_url` 추가
  (기존 events 테이블 컬럼, 목록 조회에 빠져 있었을 뿐).
- `src/components/admin/data-grid-client.tsx`의 `AdminEventRow` 타입에
  `source_url: string | null` 추가. `AdminOpenSpaceRow`는 이미 `info_url`을
  갖고 있었다.

### 백엔드
- `POST /api/admin/scrape-source-url`: URL을 받아 `fetchWithTimeout` +
  `extractGenericPageText`(가격 큐레이션 소스3가 이미 쓰던 것과 완전히 동일한
  함수, `src/lib/admin/event-price-candidates.ts`에서 그대로 재사용)로 본문을
  뽑아 반환한다. http/https만 허용, 8초 타임아웃, HTTP 오류/본문 추출 실패를
  구분해 안내한다.

### 프론트엔드 (`raw-data-modal.tsx`)
- `getModalContent()`가 `sourceUrl`(events는 `source_url`, open_spaces는
  `info_url`)도 함께 반환하도록 확장.
- 기존 "📄 {key} 정돈해서 보기" 버튼 그룹과 같은 위치(원문 JSON 미리보기 바로
  위)에 "🌐 원천 링크 페이지 크롤링/조회" 버튼을 추가 — `sourceUrl`이 있을
  때만 조건부 렌더링(요구사항 원문 그대로).
- `ScrapedSourcePreviewModal` 신규: 클릭 시에만 크롤링을 트리거하고(상세
  팝업을 열 때마다 자동으로 외부 사이트를 긁지 않음), 로딩/에러/결과 3단계
  상태를 `CleanedTextPreviewModal`과 같은 톤으로 보여준다.

## 참고: [개선사항 1]과의 차이(왜 이건 스킵하지 않았는지)
같은 날 [개선사항 1](마이리얼트립 등 제휴 상품 크롤링)은 대상 사이트
robots.txt가 명시적으로 크롤링을 금지해 스킵했다. 이번 건은 대상이 서울시/
경기도 문화 포털, 구립 도서관 등 **공공기관 사이트**이고, 이미 이 코드베이스
안에서 동일한 목적(가격 정보 확인을 위한 공식 홈페이지 크롤링, 소스3)으로
승인·구현·운영 중인 기능의 UI 노출 범위를 넓히는 것뿐이라 새로운 정책 충돌
소지가 없다.

## 검증
- `npx tsc --noEmit`, `npm run test`(전체 1815개, 신규 4개 포함), `npm run build`
  모두 통과(`/api/admin/scrape-source-url` 라우트 빌드 결과에 정상 등록 확인).
- 실제 이벤트("[마포구립서강도서관] 8월/어린이 2026 어린이 여름 독서교실",
  `source_url`이 실제 마포구립도서관 상세 페이지)로 재현 호출 — HTTP 200과
  함께 실제 페이지 본문(내비게이션 포함, 소스3와 동일한 기존 한계)을 정상
  수신함을 확인.
