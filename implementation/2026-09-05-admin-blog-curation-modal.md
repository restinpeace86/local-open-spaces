# 관리자용 블로그 큐레이션 모달 팝업 및 스마트 뷰어

## 구현 대상
사용자 지시: "관리자 대시보드(Admin Panel)에 특정 장소(스팟)의 키즈/체험 관련
큐레이션을 효율적으로 처리할 수 있는 [관리자용 블로그 큐레이션 모달 팝업 및 스마트
뷰어] 기능을 구현해줘." — 네이버 블로그 검색 API 연동, 1년 룰 경고, 하이라이팅,
뱃지 폼, URL만 저장(본문은 폐기)까지 상세 스펙 그대로.

## 구현 일시
2026-09-05

## 사전 확인(제0조) — Decision 019와의 충돌 및 해소
`project/decision-log.md` Decision 019(맘스픽 등급 체계) 9항에 "네이버 블로그 검색
API 기반 '블로그 아웃링크 프리뷰' — 추후 별도 Spec으로 다룬다"는 명시적 보류가
있었다. 이번 사용자 지시가 그 "별도 Spec" 수준으로 충분히 상세(수집 방식/저장
정책/UI/하이라이트 키워드/뱃지 목록까지 명시)해, 새 Decision(021)으로 승인·기록한
뒤 진행했다 — 임의로 무시하거나 임의로 구현하지 않고 결정을 명문화했다
(`project/decision-log.md` Decision 021 참고).

## 실측으로 확인한 두 가지 제약(정직하게 기록)
1. **네이버 API 인증 실패**: 실제로 `.env.local`의 `NAVER_CLIENT_ID`/`NAVER_CLIENT_SECRET`로
   블로그 검색 API를 직접 호출해보니 `401 NID AUTH Result Invalid`로 인증 자체가
   거부됐다 — 네이버 개발자센터 애플리케이션에 "검색 > 블로그" API가 활성화돼
   있지 않거나 키가 유효하지 않은 것으로 보인다(코드 문제 아님). **사용자가 네이버
   개발자센터에서 확인/조치해야 실제로 동작한다.**
2. **"본문 텍스트"의 실제 범위**: 네이버 블로그 검색 API는 전체 본문이 아니라
   `description`(약 200자 요약 스니펫, 매칭 키워드에 자체 `<b>` 태그 포함)만
   제공한다. 실제 블로그 페이지 전체 본문은 iframe 안에 렌더링돼 있어 안정적으로
   크롤링할 근거가 없다(추측 금지) — 이번 구현은 검색 API가 실제로 제공하는 요약
   스니펫을 정제해 보여준다. 전체 본문 스크래핑은 범위 밖(Decision 021 참고).

## 변경 사항

### DB
- `scripts/migrations/2026-09-05-spot-curations-blog-curation-fields.sql`(적용 완료):
  `spot_curations`에 `blog_url_1/2/3`(text), `curation_badges`(text[]) 추가. "노출
  중분류"는 기존 `open_spaces.service_category_id`를 재사용(제5장 제4조).

### 백엔드
- `src/lib/admin/naver-blog-search.ts`(신규): 순수 함수만 모음 —
  `cleanNaverText`(네이버 자체 `<b>` 태그/HTML 엔티티 정리), `parsePostdate`,
  `isWithinRecentWindow`(1년 룰). API 라우트 자체는 테스트하지 않는 이 프로젝트
  관례상 로직을 여기로 빼 단위 테스트했다.
- `src/app/api/admin/spot-curations/blog-search/route.ts`(신규): 네이버 블로그
  검색 API 서버 프록시(GET, `?query=`) — 클라이언트에 API 키 노출 없음. 정확도순
  (`sort=sim`) 상위 3개, 1년 룰 경고 플래그(`hasRecentReview`)와 "검색 결과
  0건"(`hasNoResults`) 케이스를 구분해 응답한다.
- `src/app/api/admin/spot-curations/route.ts`: 기존 CRUD(GET/POST/PATCH)에
  `blog_url_1/2/3`, `curation_badges` 필드 반영(기존 필드들과 동일한 패턴).

### 프론트엔드
- `src/lib/admin/curation-badges.ts`(신규): `CURATION_BADGE_OPTIONS`(12종 — 아래
  특이 사항 참고), `highlightKeywords()`(정규식 기반, `<mark>` React 노드로 안전하게
  렌더링 — 외부 크롤링 텍스트라 `dangerouslySetInnerHTML` 대신 문자열 배열을 그대로
  React 자식으로 반환해 XSS 위험 없음).
- `src/components/admin/blog-curation-modal.tsx`(신규): 모달이 열리는 시점 자체를
  "버튼을 누른" On-Demand 트리거로 보고 마운트 시 바로 블로그 검색을 호출한다.
  탭(블로그 1/2/3) + 원문 링크 + 하이라이팅된 요약 뷰어 + 1년 룰 경고 + 노출
  중분류 select + 뱃지 체크박스(그룹별) + 취소/저장 버튼.
- `src/components/admin/raw-data-modal.tsx`: open_spaces 탭 상세에 "🔍 블로그로
  큐레이션" 트리거 버튼 추가(ServiceCategoryEditor 아래).

### 저장 흐름
1. 노출 중분류가 바뀌었으면 기존 `POST /api/admin/open-spaces/bulk-category-mapping`을
   `ids: [spot.id]`로 재사용(제5장 제4조 — 새 엔드포인트 없음).
2. `spot_curations`에 블로그 URL 3개(본문 제외)와 체크된 뱃지 키 배열을 upsert —
   기존 큐레이션이 있으면 PATCH, 없으면 POST(모달이 열릴 때 `GET ?spot_id=`로
   미리 확인해 어느 쪽을 쓸지 판단).

## 검증
- `npx tsc --noEmit` 통과.
- `npm run test`: 112개 파일 / 1175개 테스트(기존 1148개 + 신규 27개: naver-blog-
  search 8, curation-badges 8, blog-curation-modal 8, raw-data-modal 트리거 2 + 미세
  1) 전체 통과.
- `npm run build` 통과, `/api/admin/spot-curations/blog-search` 라우트 정상 등록.
- 실측: 네이버 API 실제 호출로 401 인증 실패를 직접 재현·확인(위 "실측으로 확인한
  제약" 참고) — 추측이 아니라 실제 호출 결과.

## 특이 사항
- **뱃지 개수 불일치(11 vs 12)**: 사용자 지시 원문은 "다중 선택 11개"라고 썼지만
  실제로 나열한 항목(이동/편의 4 + 식사/아기 5 + 공간/놀이 2 + 운영 1)을 세면
  12개다. 어느 항목을 뺄지 임의로 판단하지 않고(제3장 제5조 추측 금지) 실제
  나열된 12개를 그대로 구현했다 — 필요하면 사용자가 직접 하나를 제외해달라고
  알려주면 된다.
- **검색어는 스팟명을 기본값으로 쓰되 관리자가 수정 후 재검색할 수 있다** — 요구사항
  원문에는 없지만, 흔한 이름(예: "스타벅스")은 정확도순 검색만으로 엉뚱한 결과가
  나올 수 있어 최소한의 보조 장치로 추가했다. 저장 데이터 구조에는 영향 없다.
- **네이버 API가 지금 당장은 동작하지 않는다** — 코드는 정상 스펙대로 완성됐지만,
  실제 블로그 검색이 되려면 사용자가 네이버 개발자센터에서 이 애플리케이션에
  "검색 > 블로그" API를 활성화하거나 키를 재발급해야 한다.
