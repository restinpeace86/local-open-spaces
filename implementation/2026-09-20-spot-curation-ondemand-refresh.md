# [스팟 큐레이션 — 영업시간/메뉴 온디맨드 재크롤링(1주일 TTL)]

## 구현 대상
사용자 지시(2026-09-20): "지금 생성되는 영업시간이나 메뉴라던가 소식 등의
정보들.. 현재 일자 기준으로 1주일이 지나면 한번 다시 수집해줘.. 로봇처럼
크롤링이 아니고.. 사용자가 스팟 상세 페이지를 눌렀을 때 혹은 이벤트를 눌렀는데
스팟 연동되어 있었으면.. 데이터 가져온 지 1주일이 넘었는지 체크하고 넘었으면
다시 크롤링해서 정보 비교하고 달라진 점을 반영해."

확인 질문(AskUserQuestion) 답변:
- 재크롤링 결과는 관리자 검수 없이 spot_curations에 바로 자동 반영한다(관리자가
  "⚡ 데이터 가져오기" 버튼을 직접 누른 것과 동일하게 취급).
- 기존 "소식(공지)" 레이더는 그대로 매일(최소 1일 텀) 유지한다. 이번 건은
  영업시간/메뉴에만 새로 적용하는 최소 7일 텀이다.
- "최소 텀"은 달력일이 아니라 순수 경과 시간 기준이다(예: 10일 후에 방문하면
  10일 만에 1번 갱신되는 것이지, 매주 1회로 고정되는 게 아님).

## 설계 결정
- [네이버 플레이스 공지 온디맨드 레이더](spot-notice-radar.ts, 2026-09-19)와 동일한
  Cache-Aside 모양을 그대로 따르되(제5장 제4조), TTL 판단 기준만 다르다 — 공지는
  "오늘(KST) 체크했는지" 달력일 비교, 이번 건은 "최소 7일(밀리초 단위) 경과"
  순수 경과 시간 비교.
- 트리거 지점은 소식 레이더와 동일한 2곳(DetailModal의 SPACE/EVENT 분기)만
  해당한다 — CuratedItemDetailModal(제휴상품)은 애초에 spot_curations를 전혀
  조회/표시하지 않으므로(코드 확인 완료) 대상에서 제외했다(제3장 제5조 추측
  금지 — Spec/코드에 없는 범위로 확장하지 않음).
- 아직 spot_curations 레코드가 없는 스팟은 새로 만들지 않는다(관리자가 이미
  "데이터 가져오기"로 한 번은 등록해 둔 스팟만 갱신 대상 — 제3장 임의 판단
  금지, 신규 큐레이션 생성은 여전히 관리자 몫).
- 관리자가 메뉴 항목별로 수동 지정한 [키즈메뉴] 여부(2026-09-19에 막 추가한
  기능)를 재크롤링이 조용히 되돌리지 않도록, 이름이 같은 기존 항목의
  is_kids_menu가 true면 재크롤링 결과가 매칭 안 해도 true를 유지한다(기존
  admin UI의 "OFF→ON 방향으로만 자동 반영" 정책을 서버 자동 갱신에도 동일하게
  적용) — 큐레이션 전체 뱃지(curation_badges의 'kids_menu')도 같은 원칙으로
  병합한다.
- 범위는 사용자가 명시한 "영업시간/메뉴"까지만이다. 편의시설 뱃지(그 외
  11개), 대표 이미지, 입장료, 예약 URL, 큐레이션 노트 등 관리자 전용 입력
  필드는 건드리지 않는다(기존 "⚡ 데이터 가져오기" 버튼도 이 필드들은
  자동으로 안 채움 — 동일 범위 유지, 제5장 제4조).

## DB 스키마
`scripts/migrations/2026-09-20-spot-curations-last-crawled-at.sql`(적용 완료,
`node scripts/apply-sql.mjs`로 실행): `spot_curations.last_crawled_at
timestamptz` 추가. `src/types/database.types.ts`는
`node scripts/gen-types.mjs`로 재생성했다.

## 코드 변경
- `src/lib/admin/spot-curation-refresh.ts`(신규): `checkAndRefreshSpotCuration
  (spotId)` — naver_place_id/기존 큐레이션 존재 확인 → last_crawled_at 기준
  7일 미경과 시 스킵 → 재크롤링(기존 naver-place-crawler.ts 함수 재사용) →
  parseOperatingHoursText/extractRegularWeekdayHours/parseMenuText/
  detectKidsMenuItems로 파싱(기존 spot-curation-parsers.ts 재사용, 새 파싱
  로직 없음, 제5장 제4조) → 기존 is_kids_menu=true 항목 보존 병합 →
  spot_curations 업데이트(operating_hours_raw/open_time/close_time/
  break_start/break_end/last_order/operating_hours_by_day/menu_items/
  curation_badges/last_crawled_at). 크롤링 실패 시 last_crawled_at을
  건드리지 않아 다음 방문 때 재시도된다. 전체를 try/catch로 감싸 예외를
  절대 던지지 않는다(제5장 제11조).
- `src/app/api/spot-curation-refresh/route.ts`(신규): `POST { spot_id }` —
  spot-notice-radar 라우트와 동일한 모양, 서버가 완전히 await한 뒤 항상
  200을 반환한다.
- `src/components/map/detail-modal.tsx`: 기존 공지 레이더 트리거
  (`usePublishedSpotNotices`) 바로 아래에 새 `useEffect` 추가 — 스팟이면
  `item.id`, 이벤트면 `item.space_id`로 `/api/spot-curation-refresh`를
  fire-and-forget 트리거한다(결과를 기다리지 않음 — 갱신된 값은 다음 방문부터
  보여도 충분하다고 판단, 소식 레이더와 동일한 판단 근거).

## 검증
- `npx tsc --noEmit`/`npm run test`(170개 파일, 2030개 테스트 — 신규:
  `checkAndRefreshSpotCuration` 9개, DetailModal 재크롤링 트리거 3개)/
  `npm run build` 모두 통과.
- 마이그레이션은 `node scripts/apply-sql.mjs`로 실제 Supabase 프로젝트에
  적용 완료, `node scripts/gen-types.mjs`로 타입 재생성 확인.

## 특이 사항
공지 레이더와 재크롤링 두 기능이 같은 "스팟 상세/이벤트 상세 진입" 지점을
공유하지만 서로 다른 API를 각자 fire-and-forget으로 호출한다 — 하나로
합치지 않은 이유는 TTL 판단 기준(달력일 vs 순수 경과시간)과 반영 방식(관리자
검수 대기 vs 즉시 반영)이 서로 다르기 때문이다(제5장 제3조 임의 판단
금지 — 다른 정책을 가진 두 기능을 섣불리 하나로 합치지 않음).
