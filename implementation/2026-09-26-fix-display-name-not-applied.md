# 노출 이름 수동 수정(display_name)이 화면에 반영 안 되던 버그 수정

## 구현 대상
사용자 제보(2026-09-26): "스팟픽에서 놀이방식당에 있는 것들.. 지금 이름에
대하여 노출되는 상호명으로 안바뀐거 같은데.. 내가 검색했을때 '소원.1'로
나오는 곳이 있었어 노출이름이 현재 '소원.1 태전직영점'으로 노출이름이
바꼈는데" → 조사 후 원인 확정 및 수정 승인("그래 진행하고").

## 원인
`open_spaces.display_name`(2026-09-20 도입, "노출 이름 수동 수정" 기능 —
관리자가 원본 상호명이 잘못됐거나 여러 상호가 합쳐져 들어온 경우 노출용
이름을 별도로 덮어쓰는 컬럼)이 DB에는 정상 저장되고 있었다(실측 확인:
"소원.1" 스팟의 `display_name = "소원.1 태전직영점"`이 정확히 저장돼
있었음). 하지만 유저 화면에 스팟 이름을 내려주는 RPC들을 전부 확인한 결과:
- `get_nearby_spaces_and_events`(5-인자, map-explorer.tsx가 실제로 쓰는
  경로), `get_spots_by_service_category`, `get_deal_spots` — 전부
  `coalesce(standard_name, name)`만 쓰고 `display_name`을 아예 읽지 않았다.
- `get_nearby_spaces_and_events`(3-인자, 레거시)는 `coalesce(display_name,
  name)`만 써서 `display_name`은 반영했지만 `standard_name`은 무시했다
  (세 RPC와 다른 규칙).

즉 2026-09-20 이후 "노출 이름 수동 수정" 기능이 저장은 되지만 실제
화면에는 단 한 번도 반영되지 않는 상태였다.

## 변경 사항
`scripts/migrations/2026-09-26-fix-display-name-not-read-by-rpcs.sql`:
위 4개 RPC(get_nearby_spaces_and_events 2개 오버로드 +
get_spots_by_service_category + get_deal_spots) 전부 이름 계산식을
`coalesce(display_name, standard_name, name)`으로 통일했다 — display_name
(관리자가 이 스팟 하나를 콕 집어 수동 수정한 값)이 가장 구체적인 의도라
최우선, standard_name(중복 스팟 병합 대표명)이 다음, 원본 name이 최종
폴백이다. 반환 컬럼/타입/그 외 로직은 전혀 바꾸지 않았다 — 컬럼 추가가
아니라 name 계산식만 바꾸는 것이라 DROP 없이 CREATE OR REPLACE로 안전하게
적용됐다.

## 검증
- 실측: 마이그레이션 적용 후 `get_nearby_spaces_and_events`를 "소원.1"
  스팟 좌표 기준으로 직접 호출해 `name`이 정확히 "소원.1 태전직영점"으로
  나오는지 확인.
- 이 변경은 DB 함수만 수정하고 JS/TS 코드는 전혀 건드리지 않았다 —
  `npx tsc --noEmit` / `npm run test`(202개 파일 2,332개) / `npm run build`
  모두(회귀 없음 확인 목적으로) 통과.

## 특이 사항
- `find_rows_by_external_ids`(2026-09-26에 시도했다 되돌린 RPC)와 무관한
  완전히 별개의 기존 RPC 4개를 수정한 것이다.
- 이 버그는 순수하게 "새 컬럼을 추가해놓고 그 컬럼을 읽는 곳을 빠짐없이
  업데이트하지 못한" 패턴이다 — 앞으로 `open_spaces`/`events`에 이름 관련
  새 오버라이드 컬럼을 추가할 때는, 이 이름을 실제로 소비하는 모든 RPC를
  함께 확인해야 한다(이번에 4곳이 있었고 그중 3곳이 누락돼 있었다).
