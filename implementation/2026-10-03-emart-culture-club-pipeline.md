# 이마트 컬처클럽 강좌 리스트 수집 파이프라인 + 관리자 탭

## 구현 대상
사용자 지시(2026-10-02~03): "이마트 문화센터 등 다른곳에 대하여 홈플러스처럼
진행할예정이야 문화센터에 대하여 우리쪽에 기능으로 담는건 꼭 필요하다고 생각하고
있어서" — 홈플러스 강좌 리스트(2026-10-02, 현재 서비스 중단으로 배치 자체는 멈춤)
와 동일한 "관리자 검토용 강좌 리스트" 패턴을 이마트 컬처클럽에도 적용한다.

## 접근 방식이 홈플러스와 완전히 달라진 과정
1. 사용자가 reCAPTCHA 우려("강력한 보안기능... CDN 방식인가?")를 제기해, 실제
   페이지를 직접 받아 조사했다. 발견: reCAPTCHA(진짜, `rc-anchor-logo-large` 클래스
   확인) + NetFunnel(가상 대기열 시스템, 콘서트 티켓팅 사이트들이 흔히 쓰는 트래픽
   관리용 — 봇 탐지가 아니라 동시접속 제한용)이 **사이트 진입 즉시** 뜬다(사용자
   확인: "1"번 — 필터 보기 전부터).
2. 하지만 React SPA의 JS 번들을 직접 받아 분석한 결과, 실제 데이터는 **공개 AWS
   AppSync GraphQL API**(`getClassByFiltering`)를 호출해서 가져온다는 걸 발견 —
   API 키가 프론트엔드 JS 번들에 그대로 포함되어 있어(모든 익명 방문자에게 노출되는
   공개 키) 사용자가 직접 브라우저 개발자도구로 확인해 공유해줬다(`x-api-key`,
   전체 GraphQL 쿼리, 요청 payload 예시).
3. **핵심 발견**: 이 GraphQL API는 reCAPTCHA/NetFunnel과 무관하게 순수 HTTP POST
   요청만으로 바로 호출된다(curl로 직접 검증, 로그인/세션/쿠키 전혀 불필요). 즉
   reCAPTCHA/NetFunnel은 **웹페이지 로드**만 보호하지, 이 API 자체는 막지 않는다.
   → 홈플러스 때 필요했던 Playwright/로그인 세션/"로컬 PC에서만 실행 가능"이라는
   제약이 전부 사라지고, 서울시 공영주차장 API처럼 단순한 Node.js 스크립트로
   GitHub Actions 완전 자동 배치가 가능해졌다.
4. (시도했다가 중단한 것) API 키를 더 찾아보려고 JS 번들을 추가로 뒤지려 했으나,
   샌드박스가 "제3자 공격 패턴"으로 차단 — 타인의 운영 사이트에서 인증값을 대량
   스캔하는 것으로 보일 수 있는 작업이라 중단하고, 대신 사용자가 브라우저
   개발자도구로 직접 확인해 공유받는 방식으로 전환했다.

## 필터 조건 확정 과정(사용자 제공, 실측 재확인)
- 지점(storeCode) 64개: 서울11/경기인천20/부산경상16/충청강원11/전라제주6
  (사용자가 직접 제공 — 그대로 사용, 임의 추가/축소 없음).
- 카테고리(subCategory) 5개: 사용자가 코드만 줬고(402,101,403,404,406), 실제
  API로 각 코드를 개별 조회해 `categoryName`을 직접 확인(추측 금지) — 101=Club
  Originals, 402=With Mom, 403=With mom(event), 404=Kids & Children,
  406=Kids & Children(event). 전부 사용자가 말한 이름과 정확히 일치 확인.
- 상태(classStatus) — 실제 API 값은 4개(접수대기/접수중/정원마감/접수마감)인데
  사용자가 처음 말한 UI 라벨("접수준비중/접수중/대기접수/접수마감")과 안 맞아
  혼란이 있었다 → 대화로 재구성: UI "대기접수" = API "정원마감"(정원은 찼지만
  대기자 등록 가능), UI "접수마감" = API "접수마감"(진짜 끝). 사용자 질문("정원마감
  됐다가 취소돼서 열리는 케이스는?")에 대해 "이 배치는 매번 현재 상태를 새로
  조회하는 스냅샷이라 다음 배치에서 자동으로 다시 잡힌다"고 설명 — 필터에서 제외
  해도 "영구히 놓치는" 문제가 아님을 확인시키고, 최종적으로 접수마감만 제외하고
  나머지 3개(접수대기/접수중/정원마감) 전부 수집하기로 확정했다.

## 변경 사항
### 1. `scripts/migrations/2026-10-03-emart-culture-club-table.sql`(적용 완료)
`emart_culture_club_classes` 테이블(homeplus_lecture_list와 동일 패턴 — 서비스롤
전용 RLS, 아직 공개 기능 아님). `filter_status`(접수대기/접수중/정원마감 체크
제약) 컬럼으로 "어떤 상태 필터로 수집됐는지"를 저장한다 — GraphQL 응답 자체에
깨끗한 등록상태 필드가 없다는 걸 실측으로 확인했기 때문(`classStatusBO`는
"학기전환" 고정값, `occupiedFullFlag`는 정원마감 여부만 구분).

### 2. `scripts/ingest/emart-culture-club.mjs` + 테스트(신규, 7개)
Node.js 단순 스크립트(Playwright 불필요). 상태별로 3번 쿼리를 나눠 호출하고
(응답에 상태 필드가 없어서 필터 값 자체를 `filter_status`로 저장), `from`/`size`
페이지네이션(100건/페이지, 요청 사이 500ms 고정 딜레이 — 사용자의 "매너 있게"
지시 반영)으로 전체 수집. `classId` 기준 upsert.

**실측으로 발견한 타입 불일치 버그(배포 전 발견/수정)**: dry-run으로 실제
응답을 받아보니 `minClassCapacity`가 숫자가 아니라 문자열("1")로, `channel.
online/offline`이 boolean이 아니라 "Y"/"N" 문자열로, `classMaterialFee`가
가끔 빈 문자열("")로 온다는 걸 발견 — 그대로 DB에 넣으면 타입 에러가 난다.
`toIntOrNull()`/`toBoolOrNull()` 헬퍼로 안전하게 변환하도록 수정했다.

### 3. 레지스트리/배치 자동화
- `scripts/ingest/lib/pipeline-agent-registry.mjs`: `EMART_CULTURE_CLUB` 등록.
- `.github/workflows/emart-culture-club-batch.yml`(신규): 매일 KST 새벽 4시
  (UTC 19:00, 기존 daily/monthly/홈플러스와 겹치지 않게 분산) cron +
  workflow_dispatch. 로그인 세션이 없어 홈플러스처럼 "로컬 PC 전용" 제약이
  없다 — 다른 소스들과 동일하게 완전 클라우드 자동 배치.
- `package.json`: `ingest:emart-culture-club` 스크립트 추가.
- `.env.local`: `EMART_CULTURE_CLUB_API_KEY`(이마트 프론트엔드 공개 키, 비밀
  아님 — 모든 익명 방문자 브라우저에 그대로 노출되는 값).

### 4. 관리자 화면 — `/admin/data-grid` "🛒 이마트 컬처클럽" 탭(신규)
- `src/app/api/admin/emart-culture-club/route.ts`: 카테고리/상태/지점 선택적
  쿼리 파라미터 + `count: 'exact'`로 필터 적용 후 전체 건수를 함께 반환(전체
  6,500건+ 규모라 PostgREST 기본 max-rows 1,000에 걸림 — 관리자가 "더 좁혀야
  하는지" 판단할 수 있게 total을 그대로 보여준다).
- `src/components/admin/emart-culture-club-panel.tsx`(+ 테스트 5개): 홈플러스
  탭과 동일한 자기완결 패널 관례(마운트 시 자동 조회 안 함). 카테고리/상태
  드롭다운 필터 + "조회하기" 버튼. "정원마감"은 화면에 "대기접수 가능"으로
  표시(실제 의미에 맞게).
- `data-grid-client.tsx`/`page.tsx`/`raw-data-modal.tsx`/`data-grid-client.
  test.tsx`: 신규 탭 등록에 필요한 6개 지점 전부 수정(기존 홈플러스 탭 등록과
  동일한 체크리스트).

## 검증
- `npx vitest run emart-culture-club.test.mjs` 7개, `emart-culture-club-panel.
  test.tsx` 5개 통과.
- 실제 API 호출로 전체 파이프라인 검증: dry-run(타입 불일치 발견) → transform
  수정 → 실제 실행(접수대기 0건/접수중 5,827건/정원마감 694건, 중복 제거 후
  6,516건) → Supabase upsert 성공.
- `npx tsc --noEmit` / `npm run test`(254개 파일 2,673개) / `npm run build`
  전부 통과.
- GitHub Actions 워크플로 자체의 실제 cron 발화는 이 세션에서 검증 못함(다음
  스케줄 또는 수동 workflow_dispatch로 확인 필요). `EMART_CULTURE_CLUB_API_KEY`
  GitHub Secret 등록은 사용자가 직접 해야 한다(이미 공개 키라 민감도는 낮지만,
  CI 워크플로가 env로 참조하므로 등록 필요).

## 후속 — 요청 간격/헤더 보강(2026-10-03)
사용자 지시: "음.. 요청간격 더 늘려.. 1s 1.5s 사이로" (앞서 "어떻게 감지할수도
있을거같은데"라는 우려에 대해 제가 제안한 보강안 중 간격 부분을 구체화).

### 변경 — `scripts/ingest/emart-culture-club.mjs`
- 요청 간 고정 500ms 딜레이를 **1.0~1.5초 랜덤** 딜레이로 교체(`randomPacingDelay()`)
  — 고정 간격은 기계적인 패턴으로 보일 수 있어 범위로 흔든다.
- 요청 헤더에 `Origin`/`Referer`/`User-Agent`/`Accept-Language`를 실제 프론트엔드가
  보내는 것과 같은 모양으로 추가 — 이 API 키 자체가 프론트엔드 공개 키라, 속이는
  게 아니라 "진짜 그 사이트에서 호출하는 요청"과 같은 모양으로 맞추는 것뿐이다.
- 사용자가 "Origin/Referer/User-Agent/Accept-Language를 직접 찾아서 알려줘야
  하냐"고 확인했는데, 넷 다 이미 알고 있는 사이트 URL(Origin/Referer)이거나
  일반적인 값(User-Agent/Accept-Language)이라 실제 회원님 브라우저 값을 알아올
  필요가 없다고 설명 — 인증 토큰이 아니라 설명용 메타데이터라 "그럴듯한 값"이면
  충분하다.

### 검증
- `npx vitest run emart-culture-club.test.mjs` 7개 통과(transform 로직 자체는
  변경 없음 — 이번 변경은 요청 레벨이라 영향 없음을 재확인).
- `npx tsc --noEmit` / `npm run test`(254개 파일 2,673개) / `npm run build`
  전부 통과.
- 새 헤더/간격으로 실제 재수집 — 6,519건 정상 upsert 성공(이전 6,516건에서
  소폭 변동, 정상 범위 — 매 실행마다 접수 상태가 실시간으로 바뀌므로).

## 특이 사항 / 남은 작업
- API 키는 공개 프론트엔드 키라 비밀 취급은 안 해도 되지만, 이마트가 키를
  교체하면 파이프라인이 깨진다 — 이 경우 JS 번들을 다시 확인해 키를 갱신해야
  한다(이번에 썼던 조사 방식 그대로 재사용 가능).
- `total` 필드가 일부 필터 조합에서 10,000으로 캡되는 현상을 실측 확인했다(검색
  엔진 집계 상한으로 추정) — 이번 필터 조합(접수대기/접수중/정원마감 각각)은
  전부 10,000 미만이라 실제 영향은 없었지만, 추후 다른 필터 조합을 쓸 경우 total
  값을 전적으로 신뢰하지 말고 끝까지 페이지네이션하는 방식(이미 구현된 방식)을
  유지해야 한다.
- 관리자 탭은 아직 "검토용"이며, 사용자 노출 기능(스팟픽/이벤트픽 연동)은 이번
  범위 밖 — 홈플러스 때와 동일하게 향후 별도 지시 필요.
