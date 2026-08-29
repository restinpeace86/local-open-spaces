# [경기도 키즈카페 및 놀이시설 포함 휴게음식점 데이터 수집 어댑터 구축]

## 요구사항
1. 경기데이터드림 OpenAPI 2종(Kidscafe, Resrestrtkidscafe) 연동 — 인증키
   `GG_DATA_API_KEY`, JSON 응답(`Type=json`).
2. Kidscafe → 기존 '키즈카페' category_min 매핑. Resrestrtkidscafe → 아이 동반 식당/
   놀이방 음식점 특성을 살릴 수 있는 별도 카테고리/태그로 구분.
3. 주소 기반 위경도 보정 로직 점검(누락 방지).
4. 로컬 실행으로 정상 수집·Upsert 확인 후 검증 및 커밋/푸시.

## 구현 일시
2026-08-29

## 1. 실측 확인 (구현 전 필수 사전 조사)

두 API를 직접 호출해 실제 응답 구조를 확인했다(추측 금지 원칙):
- 응답 봉투는 기존 `gg-events-adapter.mjs`와 완전히 동일한 경기데이터드림 표준 형식
  (`json[rootKey][0].head`에 `list_total_count`/`RESULT`, `json[rootKey][1].row`에
  배열)이며, WAF 우회를 위한 동일한 User-Agent가 필요함을 확인했다.
- **Kidscafe**(264건): `BIZPLC_NM`(상호명), `SANITTN_BIZCOND_NM`(영업조건, 전량
  '키즈카페' 확인), `BSN_STATE_NM`('영업'/'폐업' 2종만 관측, 영업 105/폐업 159),
  `REFINE_WGS84_LOGT`/`REFINE_WGS84_LAT`(좌표, 264건 중 258건 존재).
- **Resrestrtkidscafe**(2,654건): API 이름과 달리 `SANITTN_BIZCOND_NM`이 '키즈카페'인
  업소는 356건뿐이고, 나머지는 한식(628)/커피숍(195)/편의점(53)/일식(47)/중국식(67)/
  호프·통닭(128) 등 34종의 매우 다양한 일반 음식점 업종으로 구성됨을 실측으로 확인했다
  (영업 1,792/폐업 862, 좌표 2,654건 중 2,644건 존재). 즉 이 API의 정체성은 "특정
  업종"이 아니라 "놀이시설(키즈존)을 갖춘 휴게음식점 전체"다.

이 실측 결과에 근거해 Resrestrtkidscafe는 업종별로 세분화하지 않고 소스 전체를 단일
category_min('놀이방식당' — 사용자가 예시로 제시한 태그명 그대로 채택)으로 매핑하기로
판단했다(개별 업종으로 재분류할 근거 필드가 없음).

## 2. 어댑터 구현 (`gg-kidscafe-adapter.mjs`)

`GgKidscafeAdapter`(sourceKey: `GG_KIDSCAFE`, targetTable: `open_spaces`)로 두 API를
`gg-events-adapter.mjs`와 동일한 패턴(단일 어댑터가 관련 API 2종을 병렬 수집,
`Promise.all`)으로 통합했다:
- **운영 상태 필터**: `BSN_STATE_NM !== '영업'`인 행은 제외(amusement-park-adapter.mjs/
  swimming-pool-adapter.mjs와 동일 관례).
- **좌표 보정(요구사항 3)**: `REFINE_WGS84_LOGT`/`REFINE_WGS84_LAT`이 이미 제공되면
  그대로 사용하고, 결측인 소수(실측 약 0.4%)에 한해서만 VWorld 지오코딩으로 보정한다
  (gg-events-adapter.mjs는 원본에 좌표 필드 자체가 없어 전량 지오코딩했던 것과 달리,
  이 두 API는 대부분 좌표를 직접 제공해 불필요한 API 호출을 최소화했다). 경기도 범위
  이탈 시 오매칭으로 간주해 건너뛰는 기존 `GYEONGGI_BOUNDS` 검증도 결측 보정 건에
  동일하게 적용한다.
- **category_min 매핑(요구사항 2)**: Kidscafe → `'키즈카페'`, Resrestrtkidscafe →
  `'놀이방식당'`(신규), 둘 다 `category_min_source: 'RAW'`.
- **is_free**: 원본에 요금 필드가 없고 전량 민간 상업시설이라 `amusement-park-
  adapter.mjs`와 동일하게 추정하지 않고 `null`.
- **is_kids_friendly**: 두 소스 모두 "아이 놀이시설을 갖춘 곳"이 소스 자체의 정의라
  개별 텍스트 근거 없이 `true`로 고정(playground-adapter.mjs와 동일 논리).
- **facility_type**: 주소 표본에 "지상3층 303호"/"11층 1104호" 등 건물 내 호실 표기가
  다수 확인되어 물리적 특성상 `'실내'`로 고정.
- **external_id**: 원본에 고유 ID 필드가 없어(실측 확인) `gg-events-adapter.mjs`와
  동일하게 `SHA1(시설명|주소)` 해시 기반으로 결정적 생성(`GG_KIDSCAFE_` 접두).

CLI 진입점 `scripts/ingest/gg-kidscafe.mjs` 및 `npm run ingest:gg-kidscafe` 추가.
`run-monthly.mjs`의 `STEPS`에 `GG_KIDSCAFE`로 연결(targetTable이 `open_spaces`인
어댑터는 월간 배치 소속이라는 기존 분류 기준 그대로 적용, 헤더 주석의 어댑터 목록도
갱신).

어드민 카테고리 그룹핑(`category-min-groups.ts`)과 필터 안전망 목록
(`category-min-fallback.ts`)에도 신규 값 `'놀이방식당'`을 반영했다.

## 3. 신규 소스라 COALESCE 안전 병합 이슈 없음

직전 작업(행안부 놀이시설 설치장소코드 매핑)에서 발견한
`upsertRowsSafeMerge`(COALESCE 안전 병합)가 새 매핑을 막는 문제는, 그 경우 대상 행이
이미 여러 달째 재수집되며 `category_rules.mjs`의 RULE 매칭이 먼저 채간 상태였기 때문에
발생했다. `GG_KIDSCAFE`는 **완전히 새로운 소스**(이번이 최초 upsert)라 대상 external_id에
해당하는 기존 행 자체가 없으므로 이 문제가 적용되지 않는다 — 별도 백필 스크립트가
필요하지 않다. 단, 동일 실제 업소가 기존 소스(예: LOCALDATA_AMUSEMENT의 키즈카페 키워드
매핑, LOCALDATA_PLAYGROUND의 A013 매핑)에도 이미 존재할 가능성은 있으며, 이는 기존에
이미 파이프라인에 연결돼 있는 `DEDUPE_OPEN_SPACES`(교차 출처 중복 정제) 후처리 단계가
처리한다.

## 검증

### 코드 검증
- `npx tsc --noEmit` 통과
- `npm run test`(60파일 597건, 신규 `gg-kidscafe-adapter.test.mjs` 12건 포함) 통과
- `npm run build` 통과

### 실측 검증(로컬 수동 실행, 프로덕션 DB)
- `node scripts/ingest/gg-kidscafe.mjs --dry-run`: 2,918건 수신(264+2,654 실측치와
  일치), 1,896건 유효 변환 확인(폐업 1,021건 제외, 지오코딩 실패 1건 제외).
- `node scripts/ingest/gg-kidscafe.mjs`(실제 적재): RAW 레이어 2,897건 보존 +
  open_spaces upsert 1,892건 성공.
- DB 직접 조회: `category_min` 분포 `키즈카페` 103건 + `놀이방식당` 1,789건 = 1,892건
  (upsert 건수와 정확히 일치) 확인.
- 무작위 표본 6건 조회로 상호명("세븐일레븐 구리한진점", "산골추어탕 동탄점",
  "중화명가" 등 실측으로 확인한 다양한 업종이 실제로 '놀이방식당'에 매핑됨)/주소/좌표
  한글 텍스트 인코딩 손상 없음을 확인.

## 특이 사항
- `docs/pipeline-log.md`에 이번 실제 실행 결과(RAW 2,897 / Service 1,892 / 파싱 제외
  1,026건)가 자동 기록되었다.
- Resrestrtkidscafe 데이터의 "놀이방식당" 분류는 스팟픽(`/nearby`) 공개 필터 칩으로는
  이번 작업 범위에서 추가하지 않았다 — 요구사항이 "수집 스크립트 구현"에 한정되어
  있고 신규 UI 칩 추가는 명시적으로 요청되지 않았다(제7장 제2조 임의 UI 변경 금지).
  DB에는 정상 적재되어 있어 어드민 필터/향후 UI 노출 시 즉시 활용 가능하다.
