# [개선사항 1] 이벤트픽 메인 화면 성능 저하 진단 및 썸네일 최적화

## 구현 대상
`implementation/todo.md` [개선사항 1] — 이벤트픽 원천 썸네일 활용/규격화(1400px
일반·300~400px 썸네일), DB 구조 정리, 그 외 성능 저하 원인 진단 및 조치.

## 구현 일시
2026-09-15

## 조사 결과 (구현 전 확인한 현재 상태)
- `events.thumbnail_url` 컬럼은 이미 존재하고(최초 스키마부터), 메인 목록 쿼리
  (`get-home-feed.ts`의 `EVENT_COLUMNS`)도 이미 `SELECT *`가 아니라 명시적 컬럼
  목록을 쓰고 있어 이 두 가지는 추가 조치가 필요 없었다.
- 4개 이벤트 소스 중 3개(SEOUL_YEYAK/SEOUL_CULTURE_EVENTS/GG_CULTURE_EVENTS API1)는
  이미 원천 썸네일 필드를 `thumbnail_url`에 채우고 있었다. TOUR_API_FESTIVAL은
  원천이 제공하는 진짜 썸네일 필드(`firstimage2`)를 두고 원본 크기 필드
  (`firstimage`)를 쓰고 있었다 — 이번에 고쳤다.
- **다만 지금까지 어떤 소스도 리사이징/재호스팅을 하지 않았다** — `thumbnail_url`은
  전부 원천 서버의 외부 URL을 그대로 저장한 것이었다. 이번 요구사항의 핵심
  ("원천 썸네일이 규격보다 크면 리사이징해 저장")은 여기서부터가 실제 신규
  구현이었다.
- `end_date`에 대한 단독/리딩 인덱스가 없었다 — 기존 `idx_events_dates`는
  `(start_date, end_date)` 복합이라 `end_date`만 거는 쿼리(이벤트픽 조회 거의
  전부)에는 안 맞는다. 이 동일한 원인은 `deactivate-expired-events.mjs`의 기존
  주석에서도 이미 확인됐던 문제였다(그쪽은 소량 배치 반복으로 우회하고 있었음).

## 변경 사항
### 1) TourAPI 썸네일 필드 수정
`scripts/ingest/tour-api-festival.mjs`: `thumbnail_url: item.firstimage2 ||
item.firstimage || null` — 진짜 썸네일 필드를 우선하고 없으면 원본으로 폴백.
테스트 3개 추가(`tour-api-festival.test.mjs`).

### 2) `idx_events_active_enddate` 인덱스 추가
`scripts/migrations/2026-09-15-events-active-enddate-index.sql` —
`(is_active, end_date)` 복합 인덱스. 이벤트픽의 거의 모든 조회 패턴
(`WHERE is_active=true AND end_date [=|>=] 오늘 ORDER BY end_date`)을 그대로
서빙한다. 운영 DB에 직접 적용 후 `pg_indexes`로 생성 확인.

### 3) 이벤트 썸네일 리사이징 + 재호스팅 파이프라인 (신규)
- 신규 Supabase Storage 버킷 `event-thumbnails`(public, 5MB 제한, png/jpeg/
  webp/gif 허용) 생성.
- `scripts/ingest/lib/resize-image.mjs`: 썸네일 전용 리사이징(긴 변 400px,
  src/lib/images/resize-for-storage.ts와 같은 원리지만 배치 스크립트는 TS를
  가져올 수 없어 독립 구현 — 기존 관례와 동일).
- `scripts/ingest/lib/rehost-event-thumbnails.mjs`: 아직 우리 버킷 URL이 아닌
  `thumbnail_url`을 하루 최대 100건(대량 fetch로 인한 실행시간 폭증 방지, 백로그는
  매일 조금씩 처리, 이미 재호스팅된 행은 조회 조건에서 자동 제외되어 멱등적)
  다운로드 → 리사이징 → 업로드 → `thumbnail_url` 갱신. 개별 행 실패(죽은 링크
  등)는 건너뛰고 나머지는 계속 진행한다.
- `run-daily.mjs`에 `REHOST_EVENT_THUMBNAILS` 후처리 단계로 연결(다른 캐시
  갱신 단계들과 동일한 위치/패턴).

### 발견 후 수정한 실제 버그 (실측 없이는 못 찾았을 것)
운영 DB로 실제 3건을 처리해보니 3건 다 업로드에서 실패했다 — 원인 진단 결과
`culture.seoul.go.kr`(서울시 문화행사 소스)가 비표준 `image/jpg`(정식 표준은
`image/jpeg`)를 Content-Type으로 내려주고 있었고, 이 값을 그대로 Storage
업로드에 넘기니 버킷의 `allowed_mime_types` 화이트리스트(정식 표준만 허용)에
걸려 전부 거부됐다. 원본 서버의 Content-Type 헤더를 신뢰하지 않고, sharp가
실제 이미지 바이트를 디코딩해 판별한 포맷을 기준으로 표준 MIME 타입을 다시
만들도록 수정했다. 회귀 테스트 추가 후 재실행 → 3/3 성공, 실제 업로드된
파일을 HTTP로 직접 요청해 200/올바른 content-type까지 확인했다.

## 검증
- `npx tsc --noEmit`, `npm run test`(전체 1701개, 신규 11개 포함),
  `npm run build` 모두 통과.
- 운영 DB/Storage 대상 실측: dry-run성 소량 테스트(3건) → 실패 원인 진단 →
  수정 → 재실행 3/3 성공 → 업로드된 파일 HTTP 직접 조회로 접근성/포맷 확인.

## 이번 범위에서 의도적으로 손대지 않은 것 (요구사항 ③ 관련, 근거 명시)
- **"전체보기" 페이지네이션의 전체 로드 후 메모리 내 정렬 구조**
  (`fetchAllRowsChunked`/`finalizeBrowsePage`, get-home-feed.ts): 지역 필터링 +
  거리순 정렬을 페이지 자르기보다 먼저 적용해야 하는 기존 설계상 불가피하게
  전체 후보를 먼저 가져온 뒤 JS에서 정렬·페이징한다는 기존 주석의 설명을
  확인했다. 이 구조를 DB 레벨 keyset pagination 등으로 바꾸는 것은 정렬/필터
  로직 전체를 재설계해야 하는 별도의 큰 작업이라, 이번 "썸네일 최적화" 범위를
  벗어난다고 판단해 손대지 않았다 — 필요하면 별도 작업으로 분리해 진행하는
  것을 권장한다.
- **`next/image` 전환**: `next.config.ts`의 `images.remotePatterns`가 지금은
  Supabase Storage 도메인만 허용하고 있어(외부 원천 도메인 전부 미허용),
  기존 코드에 이미 "next/image로 바꾸면 대부분 깨진다"는 실측 기반 경고
  주석이 있다. 이번에 재호스팅 파이프라인을 도입해 앞으로 갈수록 더 많은
  썸네일이 우리 Supabase 도메인을 가리키게 되므로 `next/image` 전환이
  점점 더 안전해지지만, 아직 전체 백로그가 재호스팅되지 않은 과도기라
  일부는 여전히 외부 URL이다 — 지금 전면 전환하면 그 나머지가 깨진다.
  기존 `<img loading="lazy">`(이미 지연 로딩 적용됨)를 유지하고, 이 재호스팅
  배치가 백로그를 충분히 소화한 뒤 재검토하는 것을 권장한다.
