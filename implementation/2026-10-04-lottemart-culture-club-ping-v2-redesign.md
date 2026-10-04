# 롯데마트 ping 비교 방식 재설계 (성인 제외) + pipeline_logs 버그 수정

## 구현 대상
사용자 지시(2026-10-04): "다시말하면 처음 ping이라고 보내는게 연령 구분안하고
1개로 가져오는거니깐.. 여기에 대하여 성인꺼는 데이터 가져온것에서 빼고나서
우리꺼 기존에 적재된거랑 비교를 해야지 변화가 있는지를 알수 있어.. 성인꺼도
포함해서 대상 선택안하고 가져오는건 핑 요청건을 줄이려고하는거니깐."

이전 커밋(Step 133)의 ping 설계(v1)는 pageInfo의 버킷 3개(접수가능/온라인
마감/접수마감) 합계를 지점별로 저장해 비교했는데, 이 합계가 성인강좌 포함
혼합 응답에서 나온 거라 성인강좌만 바뀌어도 오탐했다 — 사용자가 "당연히
성인 빼고 비교했겠지"라고 물어서 아니었음을 인정하고 바로 수정했다.

## 재설계
- **요청은 그대로(1지점당 1페이지, 대상 필터 없음)** — 사용자 확인: "성인꺼도
  포함해서 대상 선택안하고 가져오는건 핑 요청건을 줄이려고하는거니깐" — 요청
  단계에서 성인을 거를 필요는 없다.
- **비교는 받아온 행(row) 단위로, 성인 제외 후** — `main_category_name ===
  '성인강좌'`인 행만 걸러내고, 남은 행의 class_id로 이미 적재된
  `lottemart_culture_club_classes`를 직접 조회해 `registration_status`가
  다르거나 class_id 자체가 없으면(신규 강좌) "변화"로 판단한다. 버킷 합계를
  별도로 저장해 둘 필요가 없어져 `lottemart_culture_club_store_ping_state`
  테이블에서 3개 컬럼을 제거했다(진단용 checked_at/changed_at만 남김).
- **정렬 방식 실측 재확인**: "마감임박순"으로 받으면 오히려 성인강좌가
  페이지를 독점한다(확인한 지점에서 20개 중 20개가 성인강좌) — 기본 정렬
  ("강좌군별")이 성인 외 항목을 20개 중 11~15개 수준으로 더 고르게 섞어서
  보여준다는 걸 실측으로 확인하고, 기본 정렬을 그대로 쓰기로 했다.

## 변경 사항
- `scripts/migrations/2026-10-04-lottemart-culture-club-ping-state-v2.sql`
  (신규, 적용 완료): ping state 테이블에서 버킷 합계 3개 컬럼 제거.
- `scripts/ingest/lottemart-culture-club-ping.mjs`: 핵심 로직 재작성 —
  `fetchStoreBuckets`/`hasChanged`(버킷 비교) → `fetchNonAdultPage1Rows`/
  `detectChange`(행 단위 비교)로 교체. `parseRow`를 그대로 재사용(제5장
  제4조).
- `scripts/ingest/lottemart-culture-club-ping.test.mjs`: `detectChange` 4개
  테스트로 교체(동일/전환/신규/빈배열).
- **별도로 발견한 버그 수정**: `pipeline_logs.period` CHECK 제약이
  'daily'/'monthly'/null만 허용하는데 ping 배치가 'hourly'를 넣고 있어서
  매 실행마다 로그 insert가 조용히 실패하고 있었다(배치 자체는 안 죽지만
  진단 기록이 안 남음) — null로 정정. 같은 문제가 `lottemart-culture-club-
  status-watch.mjs`(15분 주기인데 'daily'로 잘못 라벨)에도 있어 같이
  고쳤다(이쪽은 'daily'가 유효값이라 에러는 안 났지만 라벨이 거짓이었음).

## 검증
- `npx tsc --noEmit` / `npm run test`(269개 파일 2,801개) / `npm run build`
  전부 통과.
- **실제 라이브 ping 2회 실행**: 1차(v1 전체 재수집 직후) → 변화 감지 0/60,
  재수집 0건 — 데이터가 막 신선해진 직후라 정확히 기대한 결과. 이 과정에서
  pipeline_logs insert 실패를 실측으로 발견해 수정 → 2차 재실행으로 에러
  없이 정상 완료됨을 재확인.

## 특이 사항
- v1 ping의 첫 실행(모든 지점을 "처음 봄"으로 간주해 60개 지점 전체
  재수집)은 이미 완료돼 `lottemart_culture_club_classes`가 최신 상태다 —
  그래서 v2로 교체한 뒤 바로 돌렸을 때 "0/60 변화"가 나온 게 버그가 아니라
  정확히 예상된 동작이다(막 전부 갱신했으니 비교 대상이 전부 일치).
- 1페이지만 보는 한계는 v1과 동일하게 남아있다 — 그 지점의 변화가 전부
  1페이지 안에 있으리라는 보장은 없다. 다만 이건 "경량 ping"이라는 설계의
  본질적 트레이드오프이고(완전한 탐지가 목적이 아니라 저비용으로 자주
  찔러보는 신호), 놓친 변화는 기존 일 1회 전체 배치가 결국 잡아준다.
