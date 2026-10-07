# 이마트 상태값 배치 재확인 — 경량화

## 구현 대상
사용자 지시(2026-10-08): "나중에 이미지 빼고.. 신규건만가져오던가 초간단하게
상태값만 읽어오는 방법은 없을까? 최대한 경량화로?" → 조사 결과를 보고한 뒤
"이마트 쪽 배치는 최적화 구현해줘 할수있으면 해야지" — 이마트는 가능함을
실측으로 확인했으므로 실제 구현한다. 같은 지시에서 "현대백화점쪽도 가볍게
할수있는지도 확인하고"도 함께 조사했다(결과는 아래 "현대백화점 조사" 참고).

## 구현 일시
2026-10-08

## 실측으로 확인한 전제
- 이마트 GraphQL `getClassByFiltering`의 `classId` 필터는 단건이 아니라
  **배열**을 받는다(기존에 찜 상태감시(`fetchEmartCurrentStatus`)가 class_id
  1건씩만 넣던 것은 필요 이상으로 좁게 쓴 것이었다). 실측: class_id 500개를
  한 요청에 넣어도 120~150ms로 정상 동작, 실제 전체 ~6,563건
  (`is_excluded=false`) 중 500개 묶음 샘플에서 '접수중' 6건이 정확히
  매칭됨을 확인.
- 롯데마트는 **동일 방식이 안 된다**(실측): 상세 페이지(courseview.do)에
  `cls_cd`를 콤마로 여러 개 묶어 보내면 "잘못된 경로로 접속하셨거나 인터넷
  미노출 강좌 정보입니다"라는 에러 스크립트(124 bytes)만 돌아온다. 단건
  요청(동일 파라미터, class_id 1개)은 177KB 정상 페이지를 돌려줌 —
  class_id 단건만 지원, 다중값 미지원이 명확하다. 매일 전체 재수집이
  상태 갱신의 유일한 방법이라는 기존 결론을 재확인.
- **현대백화점 조사**: 목록 페이지(CT010100_L.do)에 `crsSqNo` 등 ID 기반
  필터 파라미터를 추가로 보내도 무시되고 평소와 동일한 전체 페이지가
  그대로 돌아온다(실측: 가짜 파라미터명 3종 모두 동일하게 무시됨 —
  파라미터가 실제로 있는 게 아니라 그냥 아무 영향이 없을 뿐). 또한
  현대백화점은 목록 자체에 이미지+상태가 이미 포함돼 있어(별도
  상세수집 단계가 원래 없음) "상태만 가볍게" 분리할 대상 자체가 없다 —
  지금의 일일 1회 배치가 이미 가장 가벼운 형태다. 추측으로 숨겨진
  파라미터를 더 찾지 않는다(제3장 제5조).

## 변경 사항
- `scripts/ingest/lib/culture-club-status-fetchers.mjs`: `fetchEmartStatusesBatch()`
  신규 — class_id 배열을 받아 500개씩(`chunkSize`) 나누고, 청크마다
  3개 상태 버킷(접수중/정원마감/접수대기)을 조회해 `Map<classId,
  rawStatus>`를 만든다(3개 전부 미매칭이면 기존 단건 로직과 동일한 기본값
  '접수마감'). 기존 단건 함수(`fetchEmartCurrentStatus`, 찜 감시 전용)는
  변경하지 않았다. `chunkArray()` 헬퍼도 함께 export.
- `scripts/ingest/emart-culture-club-status-refresh.mjs`(신규): 전체
  이마트 강좌(`is_excluded=false`, ~6,563건)를 조회해 `fetchEmartStatusesBatch`
  로 상태만 일괄 재확인하고, 기존 값과 다른 행만 `raw_status`/
  `normalized_status`를 업데이트한다. 이미지/강사명/교실 등 나머지 필드는
  건드리지 않는다(메인 배치 `emart-culture-club.mjs`가 여전히 매일 1회
  그 역할을 전담). 5분 주기 찜 감시(`culture-club-status-watch.mjs`)와
  동일한 관례로 성공 시 Discord 알림은 보내지 않고 `pipeline_logs`만
  남긴다(30분마다 도는 "잦은" 배치라 매번 알림을 보내면 스팸이 된다).
  `diffChangedStatuses()`를 export해 순수 로직만 단위 테스트한다.
- `scripts/ingest/lib/culture-club-status-fetchers.test.mjs`: `chunkArray`/
  `fetchEmartStatusesBatch` 테스트 추가(버킷별 매칭, 청크 분할, apiKey
  누락 가드).
- `scripts/ingest/emart-culture-club-status-refresh.test.mjs`(신규):
  `diffChangedStatuses` 단위 테스트(변경분만 추출, 변경 없음, 상태를
  못 찾은 행도 CLOSED로 감지).
- `LocalOpenSpaces-EmartStatusRefresh`(작업 스케줄러, 매 30분, 09:05
  시작) 신규 등록 — 5분 주기 찜 감시(알람 발송 목적)와는 별개로, 찜
  여부와 무관하게 전체 강좌의 상태값을 화면/검색에 더 빠르게 반영하기
  위한 용도다.

## 검증
- `npx tsc --noEmit` / `npm run test`(282개 파일 2,933개, 신규 테스트
  포함) / `npm run build` 전부 통과.
- 실제 배치(dry-run)로 전체 6,563건 중 1,094건이 DB에 저장된 상태와
  실제 사이트 상태가 어긋나 있음을 실측 확인(메인 배치가 마지막으로
  돈 뒤 시간이 지나며 자연스럽게 벌어진 간극) — 실제(non-dry-run)
  실행으로 1,094건 갱신, 소요 60.9초. 재실행(dry-run)에서 변경분이
  137건으로 줄어든 것을 확인해(즉시 재조회 사이에 실제로 더 바뀐
  건들) 쓰기가 정상 반영됐음을 검증.

## 특이 사항
- `pipeline_logs.period`는 'daily'/'monthly'만 쓰이고 있어(제3장 제5조
  추측 금지 — 'frequent' 같은 값이 실제 스키마/관례로 확인되지 않음),
  5분 주기 감시와 동일하게 `null`로 기록한다.
- 이 스크립트는 `raw_status`/`normalized_status` 두 컬럼만 쓴다 —
  나머지 필드(이미지·강사·교실 등)의 신선도는 여전히 메인 배치(일 1회)
  책임이다. 범위를 임의로 넓히지 않았다(제5장 제3조).
