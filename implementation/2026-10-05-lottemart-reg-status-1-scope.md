# 롯데마트 수집 범위를 search_reg_status=1로 축소

## 구현 대상
사용자 지시(2026-10-04): "search_reg_status가 1이 접수가능/접수준비쪽(바로신청,
마감임박 등), 2가 온라인마감/현장접수, 3이 접수마감/대기자신청/전화문의 ...
여기에 대하여 1인 것만 우리가 받아도 문제 없을까? 조금이라도 비용을 줄여볼까
해서" → (대기자신청 전용 강좌의 신규 발견 경로가 사라지는 트레이드오프를
확인) → "괜찮음, 1번만 가져와"

## 실측 확인
5개 지점 표본 조사 결과:
- 2번(온라인마감/현장접수) 버킷: **전부 0건** — 모든 지점에서 실질적으로
  존재하지 않음.
- 1번(접수가능/접수준비) 버킷 비율: 6.4%~23.6%(평균 10%대) — 1번만 가져오면
  페이지네이션 요청량이 **85~93% 감소**.
- `search_reg_status=1`을 요청에 넣으면 실제 반환되는 행(row) 수는 정확히
  필터링되지만(실측: 고양점 265건 중 17건만 반환), pageInfo 문자열의
  `totalCnt`(3번째 숫자)는 필터와 무관하게 항상 전체(265) 그대로 보고된다 —
  우리 페이지네이션 로직은 `totalPage`(2번째 숫자, 올바르게 축소됨)만 쓰므로
  영향 없음.

## 변경 사항
- `scripts/ingest/lottemart-culture-club.mjs`: `fetchPage()`에
  `search_reg_status: '1'` 고정 추가 — `fetchAllForCombo`/ping 양쪽이 모두
  이 함수를 재사용하므로 전체 수집 경로가 한 번에 좁혀진다.
- **`markFallenOutRowsAsUnavailable(client, freshClassIds, storeCodes)`**(신규
  export): 이번에 새로 받은 1번 버킷 class_id와, DB에 '바로신청'/'대기자신청'
  으로 저장돼 있던 기존 행(이번에 실제로 조회한 지점으로 범위 한정)을 대조해
  빠진 것만 새 상태값 **'접수불가'**로 갱신한다. 롯데마트에 추가 요청을 보내지
  않는다(DB끼리 비교). 현재 찜돼 있는 class_id는 건드리지 않는다 — 찜-상태감시
  (lottemart-culture-club-status-watch.mjs)가 5분마다 더 정확히 추적 중인
  걸 하루 1번 배치가 뭉개면 안 되기 때문.
- `scripts/migrations/2026-10-04-lottemart-culture-club-reg-status-scope.sql`
  (적용 완료): `registration_status` CHECK 제약에 `'접수불가'` 추가.
- `src/components/home/lottemart-culture-club-view.tsx` /
  `src/components/admin/lottemart-culture-club-panel.tsx`: 타입 유니온에
  `'접수불가'` 추가, 접수마감과 동일하게 비활성 처리(기존 폴백 스타일링이
  자동으로 적용됨 — 별도 분기 불필요).
- `scripts/ingest/lottemart-culture-club.test.mjs`: `markFallenOutRowsAsUnavailable`
  단위 테스트 4개(정상 갱신/찜 제외/신선 목록 전부 남음/대상 자체 없음).

## 검증
- `npx tsc --noEmit` / `npm run test`(270개 파일 2,810개, 신규 4개 포함) /
  `npm run build` 전부 통과.
- **실제 라이브 실행(dry-run 아님, 2개 지점)**으로 전체 파이프라인 검증:
  - 재수집 전 103/322 지점 접수가능 건수: 98건
  - 신규 수집(1번 버킷만): 93건
  - 1번 버킷에서 빠진 5건 → '접수불가'로 자동 갱신
  - 재수집 후 확인: 접수가능 93건 + 접수불가 5건 = 98건(정확히 일치)

## 특이 사항
- 대기자신청 전용 강좌(3번 버킷에만 존재)는 더 이상 수집되지 않아 신규
  브라우징 유저가 이런 강좌를 발견할 경로가 없어진다 — 사용자가 명시적으로
  수용한 트레이드오프. 이미 찜한 강좌는 영향 없다(찜-상태감시가 상세페이지를
  직접 확인).
- ping 배치(lottemart-culture-club-ping.mjs)도 `fetchPage`/`fetchAllForCombo`
  를 그대로 재사용하므로 자동으로 같은 축소 범위를 적용받는다 — 별도 수정
  불필요했다.
- '접수불가'는 정확히 어떤 상태(접수마감/대기자신청/전화문의)로 바뀌었는지
  모른다는 뜻을 정직하게 담은 값이다 — 추측으로 '접수마감'이라고 단정하지
  않았다(제3장 제5조).
