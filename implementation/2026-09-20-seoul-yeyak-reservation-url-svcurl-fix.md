# [서울 예약 통합(SEOUL_YEYAK) — reservation_url 원본 SVCURL 신뢰로 수정]

## 구현 대상
사용자 버그 제보(2026-09-20): "마포구 망원한강공원"(서울형키즈카페) 이벤트의
"예약하기" 링크가 `https://yeyak.seoul.go.kr/web/reservation/selectReservView.do
?rsv_svc_id=XML-MP260301`로 저장돼 있어 "페이지 표시할 수 없음" 오류가 났다.
원천 API의 SVCURL 필드는 실제로 `https://umppa.seoul.go.kr/icare/user/
kidsCafeResve/BD_selectKidsCafeResveCal.do?q_fcltyId=MP260301`였다. "저
RESERVATION_URL은 어디서 나온거야?"라는 질문에 대한 조사 및 수정.

## 원인
`scripts/ingest/adapters/seoul-yeyak-adapter.mjs`가 `reservation_url`을 원본
`SVCURL` 필드를 쓰지 않고 `SVCID`로 `yeyak.seoul.go.kr` URL을 항상 새로
구성했다(2026-08-22 `implementation/2026-08-22-collector-adapter-architecture.
md` 결정, "API의 SVCURL 필드에 의존하지 않도록 함"). 대부분의(일반 체육시설/
문화체험) 레코드는 SVCID가 그 템플릿과 우연히 맞아떨어져 문제가 드러나지
않았지만, 그 우연의 일치를 "항상 같다"로 잘못 일반화해 소스 코드 주석에도
"reservation_url이 이미 SVCURL과 동등한 값이라 source_url을 따로 안 둔다"고
적어뒀었다(실측 검증 없이 남은 잘못된 전제).

서울형키즈카페처럼 SVCID가 `XML-{시설ID}` 형식인 레코드는 이 템플릿에 넣으면
깨진 URL이 되고, 실제 예약 페이지는 완전히 다른 도메인(umppa.seoul.go.kr)이다.
실측 결과 이 문제는 키즈카페에 국한되지 않았다 — "chilProgrm/
orgideaExprnCtzn"(아동 체험 프로그램) 계열의 `XML-{숫자}` SVCID 레코드도
동일하게 깨져 있었다(DB 백필 시 실측 확인, 아래 참고).

## 원인이 아닌 것(제목 버그, 별도 확인)
같은 이벤트의 title이 "마포구 망원한강공원"(장소명)으로 보이는 문제는 어댑터
로직이 장소 필드로 폴백해서가 아니다 — `title: item.SVCNM`은 원본 API 필드를
그대로 옮겨 담을 뿐이고, 코드 어디에도 제목이 비었을 때 장소명으로 대체하는
분기가 없다(전수 grep 확인). 즉 이 건은 **서울시 원천 데이터 자체가 SVCNM에
장소명을 넣어둔 데이터 품질 문제**로 보이며, 우리 코드로 고칠 수 있는 성격이
아니다 — 관리자 수동 정정(있다면) 또는 원천 데이터 제보가 필요하다.

## 코드 변경
- `scripts/ingest/adapters/seoul-yeyak-adapter.mjs`: `reservationUrl`을
  `item.SVCURL || \`${OUTLINK_BASE}?rsv_svc_id=${item.SVCID}\``로 변경 —
  원본 SVCURL이 있으면 그대로 신뢰하고(추측으로 재구성하지 않음, 제3장 제5조),
  없는 극히 드문 경우만 기존 방식으로 폴백한다.
- `scripts/ingest/adapters/seoul-yeyak-adapter.test.mjs`: 일반 SVCID(회귀
  없음 확인), 서울형키즈카페 `XML-` SVCID(umppa.seoul.go.kr로 정확히
  나오는지), SVCURL 자체가 없는 경우(폴백 동작) 3개 테스트 추가.
- `scripts/migrations/2026-09-20-backfill-seoul-yeyak-reservation-url-from-
  svcurl.mjs`(신규, 1회성): 이미 잘못 적재된 기존 행을 복구. `raw_data`(어댑터가
  항상 원본 그대로 보존)의 `SVCURL`과 현재 `reservation_url`이 다른 행만 골라
  `SVCURL` 값으로 덮어쓴다 — 재크롤링 없이 이미 저장된 원본만 사용(추측 없음),
  재실행해도 안전(멱등).

## 실행 결과(2026-09-20, 실제 DB)
`source='seoul_public_reservation'` 6,165건 중 302건 불일치 발견 → 302건 전부
성공적으로 복구(실패 0건). 마포구 망원한강공원(MP260301) 포함, 서울형키즈카페
및 아동 체험 프로그램(chilProgrm) 계열 레코드 다수가 대상이었다.

## 검증
- `npx tsc --noEmit`/`npm run test`(170개 파일, 2033개 테스트 — 신규 3개)/
  `npm run build` 모두 통과.
- 백필 스크립트를 `--dry-run`으로 먼저 실행해 영향 범위(302건)를 확인한 뒤
  실제 반영, 완료 후 성공/실패 건수 확인.
