# 네이버 플레이스 공지 주간 배치 (온디맨드 레이더와 별개)

## 구현 대상
사용자 지시(2026-09-25): "별도로.. 1주일마다 배치로.. 소식 가져온거에 대하여
1주일이 지났는지 체크하고 1주일이 넘은거에 대하여 주기적으로 소식 데이터
가져오는거.. 다만 여기에 대하여, 중분류별로.. 요일 나눠서.. 검토해봐.
성능적으로 문제 없을지" → 검토 결과 공유 후 사용자 확인: "아 그렇구나..
공지에 대하여서는 매일 체크하고 매일 가져오고 있어? 그렇다면 이에 대하여
일단 10초의 텀을 두도록 하자 1개 하고 다음꺼 하기까지 인터벌을.."

## 검토 결과 (구현 전)
- 기존 온디맨드 레이더(`checkAndFetchSpotNotices`, `spot-notice-radar.ts`)는
  "1주일"이 아니라 **매일(KST 달력일)** 체크였다 — 사용자에게 이 차이를
  먼저 안내했다. 1주일 간격은 별개 기능인 영업시간/메뉴 재크롤링
  (`spot-curation-refresh.ts`)의 규칙이었다.
- 실측: `naver_place_id`가 채워진 스팟은 총 250건, **전부 "놀이방식당"
  중분류 하나뿐**(운영 DB 직접 조회). 중분류별 요일 분산은 지금 중분류가
  하나뿐이라 분산 효과가 없어 **보류**하고, 대신 요청 간 인터벌(사용자
  확정: 10초)로 네이버 안티봇 차단 위험만 낮추는 단순한 주간 배치로
  구현했다.

## 변경 사항
### `scripts/ingest/lib/naver-place-feed.mjs` (신규)
`src/lib/admin/naver-place-crawler.ts`의 공지(feed) 관련 함수만 mjs로
옮겼다(scripts/는 TS를 직접 import하지 않는 기존 관례, 제5장 제4조 —
category-min-groups.mjs 등과 동일 패턴): `parseApolloState`,
`denormalizeApolloValue`, `buildNaverPlaceFeedUrl`, `extractNaverPlaceFeedItems`.
`naver-place-feed.test.mjs`에 TS 쪽과 동일한 테스트 6개.

### `scripts/ingest/notice-refresh-batch.mjs` (신규)
- `open_spaces`에서 `naver_place_id is not null` AND
  (`notice_checked_at is null` OR 7일 경과)인 스팟을 조회.
- 스팟 1건씩 순차로 `/feed` 크롤링 → `spot_notices` upsert(온디맨드
  레이더와 동일하게 `onConflict: 'spot_id,raw_naver_feed_id',
  ignoreDuplicates: true` — 관리자가 이미 큐레이션한 값을 덮어쓰지 않음)
  → `open_spaces.notice_checked_at` 갱신.
- **건 사이 10초 대기**(사용자 확정 인터벌).
- 조회 실패(네트워크 오류 등)는 `notice_checked_at`을 건드리지 않아 다음
  배치나 다음 온디맨드 방문에서 재시도된다(온디맨드 레이더와 동일한
  무중단 원칙, 제5장 제11조). 한 건 실패해도 다음 건으로 계속 진행한다.

### `.github/workflows/notice-refresh-batch.yml` (신규)
매주 월요일 05:15 KST(cron `15 20 * * 0`, UTC 일요일 20:15) 1회 실행 —
기존 daily/monthly/mom-pick-grade 배치 시각과 겹치지 않게 분산.

## 검증
- `npx tsc --noEmit` / `npm run test`(203개 파일 2,347개, 신규 6개 포함) /
  `npm run build` 모두 통과.
- 배치 스크립트의 대상 조회 쿼리를 실제 운영 DB에 읽기 전용으로 실행해
  확인: 250건 중 **243건이 현재 기준으로 이미 7일 경과 대상**임을 확인
  (나머지 7건은 최근 온디맨드 방문으로 이미 체크됨) — 필터 로직이 의도한
  대로 동작함을 실측으로 확인.
- 실제 크롤링(Naver 요청) 자체는 이번 검증에서 실행하지 않았다 — 이
  개발 환경에서 네이버 직접 접근이 이미 "과도한 접근" 429로 막혀 있어
  (이 세션 앞부분에서 확인) 여기서 250건을 실제로 돌리는 건 무의미했다.
  실제 실행은 다음 월요일 GitHub Actions 스케줄(또는 `workflow_dispatch`
  수동 실행)에서 처음 이뤄진다.

## 특이 사항
- 온디맨드 레이더(매일 체크)는 이번 변경으로 전혀 손대지 않았다 — 이
  배치는 "유저가 안 보는 스팟도 최소 주 1회는 갱신되게" 하는 보완
  장치다.
- 중분류별 요일 분산은 구현하지 않았다(위 검토 결과 참고) — 나중에
  naver_place_id가 여러 중분류에 걸쳐 규모가 커지면 재검토가 필요하다.
