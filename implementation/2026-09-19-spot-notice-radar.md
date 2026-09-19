# [네이버 플레이스 공지 온디맨드 레이더 + 관리자 큐레이션 파이프라인]

## 구현 대상
사용자 지시(2026-09-19): "[Task] 멀티 엔트리포인트 공지 '온디맨드 레이더' 및
'관리자 큐레이션 파이프라인' 구현" — 유저가 스팟/이벤트/제휴 상품 상세 중 어디로
들어오든 연동된 스팟의 네이버 플레이스 공지를 온디맨드(오늘 미체크 시)로 감지해
관리자 스테이징함에 쌓고, 관리자가 검수/가공해 발행한 것만 최종 노출한다.

## 구현 일시
2026-09-19

## 사전 실측 — 계획 단계에서 확인한 것
- **기술 실현 가능성**: `https://pcmap.place.naver.com/restaurant/{placeId}/feed`
  페이지도 기존 크롤러(2026-09-18 구현)와 동일하게 `window.__APOLLO_STATE__`
  정적 파싱으로 접근 가능함을 실측 확인(헤드리스 브라우저 불필요). 실제 라이브
  데이터(딸부자 닭갈비, placeId 1107293125)로 `Feed:{placeId}_{feedId}` 스키마
  (`title/desc/category/media[]/isPinned/createdString`)를 확인했다.
- **"이미지 5장까지 가능" 확인 결과 — 사실 아님**: open_spaces/spot_curations/
  curated_items 어디에도 다중 이미지 구조가 없다(단일 `image_url` 컬럼뿐). 이
  사실을 바탕으로 공지는 기존 대표 이미지 슬롯과 섞지 않고 별도 섹션으로 설계했다.
- **가장 가까운 기존 전례**: `open_spaces.blog_review_urls`/`blog_review_updated_at`
  (2026-09-10, `/api/spot-blog-reviews`)의 Cache-Aside 패턴을 그대로 본떴다 —
  다만 이번엔 "오늘(KST) 체크했는지" 달력일 기준(요청 원문)이라 10일 롤링 TTL과는
  다른 규칙을 새로 만들었다.
- **3개 진입점 → 2개 마운트 지점**: 스팟/이벤트 상세는 같은 컴포넌트(`DetailModal`)
  를 쓴다. 제휴상품은 `CuratedItemDetailModal`. `item.id`(스팟)/`item.space_id`
  (이벤트)/`item.spot?.id`(제휴상품) 세 가지 방법으로 전부 `open_spaces.id`를
  얻을 수 있다.

## DB 스키마
`scripts/migrations/2026-09-19-spot-notice-radar.sql`(적용 완료):
- `open_spaces.notice_checked_at timestamptz` 추가.
- `spot_notices` 테이블 신규: `spot_id`(FK, cascade), `raw_naver_feed_id`(네이버
  feed 원문 ID, `spot_id`와 유니크 — 재크롤링 시 중복 스테이징 방지),
  `raw_title/raw_content/raw_image_url/raw_category/raw_posted_at`,
  `curated_title/curated_content/curated_image_url`, `status`(pending/
  published/archived), `created_at/updated_at/published_at`.

## 파싱 — `src/lib/admin/naver-place-crawler.ts`에 추가(새 파일 없음)
`buildNaverPlaceFeedUrl(placeId)`, `extractNaverPlaceFeedItems(html)`(기존
`PlaceMenuItem:`/`PlaceDetail_BaeminMenu:` 스캔과 동일한 `Feed:` 접두어 평탄
스캔 방식, `isDeleted=true`는 제외).

## 재사용 가능한 체크 함수 — `src/lib/admin/spot-notice-radar.ts`(신규)
`checkAndFetchSpotNotices(spotId)`: naver_place_id 없으면 즉시 종료 →
`notice_checked_at`의 KST 달력일이 오늘이면 종료 → feed 크롤링 → 조회 실패
(res.ok=false)면 TTL을 소모하지 않고 종료(blog-review 캐시와 동일한 안전장치,
다음 방문 때 재시도) → `spot_notices`에 `upsert(ignoreDuplicates: true)`(기존
스테이징/큐레이션 값 절대 덮어쓰지 않음) → `notice_checked_at` 갱신. 전체를
try/catch로 감싸 절대 예외를 던지지 않는다(제5장 제11조).

## API 라우트
- `POST /api/spot-notice-radar`: 라우트 자신은 완료까지 await하지만(서버리스
  응답 후 백그라운드 작업이 죽는 것을 방지), 클라이언트는 결과를 기다리지 않고
  fire-and-forget으로 호출한다.
- `GET /api/spot-notices?spot_id=X`: `status='published'`만 반환(유저 화면용).
- `GET/PATCH /api/admin/spot-notices`: 관리자 스테이징함 CRUD(status별 목록,
  curated_* 필드/status 갱신, publish 시 published_at 기록).

## 관리자 UI
`src/components/admin/spot-notices-panel.tsx`(신규) — 다른 자기완결 탭과 동일한
관례(마운트 시 자동 조회 안 함). pending/published/archived 탭 + 페이지네이션 +
행별 인라인 편집 폼(원본 읽기 전용 미리보기 + curated_title/content 입력 +
기존 `/api/admin/spot-curations/upload-image` 재사용한 이미지 업로드 + 발행/
보관 버튼). `data-grid/page.tsx`/`data-grid-client.tsx`/`raw-data-modal.tsx`에
`spot_notices` 탭을 기존 6개 자기완결형 탭과 동일한 방식으로 배선했다.

## 프론트엔드 연동
`src/components/common/spot-notices-section.tsx`(신규) — `usePublishedSpotNotices`
훅(조회+온디맨드 레이더 트리거) + `SpotNoticesSection` 컴포넌트를 `DetailModal`
(SPACE/EVENT 양쪽 분기)과 `CuratedItemDetailModal`이 동일하게 재사용한다(진입점
마다 로직 복제 없음, 제5장 제4조). 이미지 있는 공지는 사진 카드, 없는(텍스트
전용) 공지는 기존 amber 인포 배너 시각 언어를 재사용한 배너로 표시한다(요청
원문 "이미지가 아닌 공지는 어떻게 보여주는게 좋을지 제안해라"에 대한 제안이자
구현).

## 검증
- `npx tsc --noEmit`/`npm run test`(168개 파일, 2001개 테스트 — 신규: 크롤러
  파싱 5개, checkAndFetchSpotNotices 6개, DetailModal 공지 섹션 5개,
  CuratedItemDetailModal 공지 섹션 2개, SpotNoticesPanel 5개)/`npm run build`
  모두 통과.
- **실측(라이브 E2E, 딸부자 닭갈비 닭도리탕, naver_place_id=1107293125)**:
  1. `POST /api/spot-notice-radar` → 실제 네이버 공지 4건 감지(추석연휴 정상영업/
     임시휴무 2건/설연휴 정상영업, category 알림/임시휴무) → `spot_notices`에
     전부 pending으로 정확히 스테이징됨을 확인.
  2. 곧바로 재호출 → 오늘 이미 체크됨 → 재크롤링 없이 4건 그대로 유지(TTL/
     중복방지 동작 확인).
  3. `PATCH /api/admin/spot-notices`로 1건 발행(curated_title/content 지정) →
     `GET /api/spot-notices?spot_id=...`가 그 발행된 1건만(원본 raw_* 필드는
     제외하고) 정확히 반환함을 확인.

## 특이 사항
- 실측 검증 중 실제로 발행한 "추석 연휴 정상영업 안내" 1건은 내용이 진짜
  사실이라(관리자가 검수한 것과 동일한 절차로 발행) 되돌리지 않고 그대로 뒀다 —
  필요하면 관리자 화면(🔔 공지 스테이징함 탭 → 발행됨)에서 보관 처리하거나
  내용을 수정할 수 있다.
- 야간 배치(cron) 버전, 발행 예약(스케줄링)은 요청 범위 밖이라 구현하지 않았다
  (요청 원문이 명시적으로 "온디맨드").
