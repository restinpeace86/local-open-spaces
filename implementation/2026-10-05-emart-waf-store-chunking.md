# 이마트 메인 배치 WAF 403 대응 — 지점 분할 요청

## 구현 대상
사용자 지시(2026-10-05): "일단 메인 배치의 요청을 지점 10~20개씩 쪼개서
해봐" — GitHub Actions에서 이마트 메인 배치(emart-culture-club.mjs)가
`WAFForbiddenException`(403)으로 3일 연속 실패한 문제에 대한 첫 번째
(비용 없는) 대응.

## 진단 근거
같은 IP(GitHub Actions 러너)/같은 API 키/같은 GraphQL 엔드포인트를 쓰는
상세정보 배치(emart-culture-club-detail.mjs, class_id 단건 조회)는 3번
전부 성공했다 — IP 자체가 막힌 게 아니라, 메인 배치가 지점 64개를
`filterData`에 한 번에 담아 보내는 "넓은" 쿼리가 WAF 규칙(요청 크기/복잡도
기반으로 추정)에 걸렸을 가능성이 높다고 판단했다. 프록시 서비스 도입
전에 요청을 지점 단위로 쪼개는, 비용 없는 수정을 먼저 시도한다.

## 변경 사항
- `scripts/ingest/emart-culture-club.mjs`: `STORE_CHUNK_SIZE=15`로 지점
  64개를 5묶음(15/15/15/15/4)으로 나눠, 상태(TARGET_STATUSES)별로 묶음마다
  별도 GraphQL 요청을 보낸다. `buildFilterData`/`fetchPage`/
  `fetchAllForStatus`가 전부 `storeCodes` 매개변수를 받도록 확장(기존
  전역 `STORE_CODES` 참조 제거).

## 검증
- `npx tsc --noEmit`: 통과.
- 로컬 dry-run으로 청크 분할이 올바르게 동작함을 확인(64개 지점 → 5묶음,
  상태별로 순회).
- **실제 검증은 GitHub Actions에서 수동 트리거(workflow_dispatch)로
  확인 필요** — 로컬에서는 애초에 WAF가 안 걸리므로(IP가 다름) 로컬
  성공만으로는 이 수정이 실제 문제를 해결했는지 증명할 수 없다. 사용자가
  Actions 탭에서 "Emart Culture Club Batch" → Run workflow로 직접 확인.

## 후속 — 되돌림(2026-10-06)
사용자가 직접 workflow_dispatch로 재현한 결과 이 쪼개기도 403을 해결하지
못했다(실측 확인, todo.md 개선사항1 참고). 이마트 메인 배치가 GitHub
Actions를 완전히 떠나 로컬 PC 작업 스케줄러로 이전된 뒤, 사용자 지시
("PC로 완전히 옮긴 이상, 한번에 가져오도록")에 따라 지점 분할을 되돌렸다
— 로컬 PC는 애초에 WAF에 막힌 적이 없어(쪼개기 이전 원래 코드로도 로컬
dry-run은 항상 성공) 쪼개는 이유가 없어졌다. 상태(TARGET_STATUSES)당
지점 64개 전체를 다시 한 번에 요청한다.

## 특이 사항
- 요청을 쪼개면서 각 요청의 페이지네이션은 그대로 유지돼, 전체 HTTP 요청
  수는 어느 정도 늘어난다(묶음당 페이지 수는 줄지만 묶음 자체가 5배
  늘어남) — 매너 있게 수집(요청 간 랜덤 페이싱)은 그대로 유지되므로 전체
  소요 시간은 다소 늘어날 수 있다.
- 이 수정으로도 403이 계속되면, 다음 단계는 사용자가 이미 승인한 주거용/
  모바일 IP 프록시 서비스(Webshare 무료 티어부터 시도 권장) 도입이다.
