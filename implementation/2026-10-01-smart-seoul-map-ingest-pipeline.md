# 스마트서울맵(서울시 지도정보 플랫폼) 신규 수집 파이프라인

## 구현 대상
사용자가 스마트서울맵 OpenAPI 테마 키 2개(일반/테마)와 신청 항목 5개(서울형
키즈카페, 편한외출 서울키즈 오케이존, 서울로 떠나는 캠핑, 서울형키즈카페머니
사용처, 서울 유아숲 체험시설)를 제공하고, 스펙 문서(`reference/
MGIS_ApplicationServer_ThemeList_ver.5.0.0.pdf`,
`reference/MGIS_ApplicationServer_Doc(OpenAPIV5).pdf`)를 참고해 신청 항목이
실제로 데이터를 가져오는지 확인 후, 데이터 수집 파이프라인을 구축하도록
지시했다. 여러 차례의 설계 논의 끝에(아래 결정 사항 참고) "진행해"로 확정됐다.

## 실측 확인
1. 테마 리스트 API(`/public/themes/ko`)로 5개 테마 ID가 전부 활성 상태(THM_
   THEME_STAT=1)이고 콘텐츠 개수가 0이 아님을 확인(131/655/17/62/373건).
2. 콘텐츠 리스트 API(`/public/themes/contents/ko`)가 좌표+반경 기반 검색임을
   스펙 문서(4.2절)로 확인. 서울시청 좌표 기준 반경을 키워가며 실측한 결과
   "서울로 떠나는 캠핑"이 함평(전남, 약 250km)까지 포함한 전국 단위 콘텐츠임을
   발견 — 기본 반경을 300km로 채택.
3. "편한외출 서울키즈 오케이존"의 SUBCATE 9종(한식/양식/중식/일식/경양식/제과/
   카페/패스트푸드/아시아푸드)을 확인해 전부 식당·카페류임을 확인, "서울형
   키즈카페머니 사용처"는 SUBCATE가 "상품권 사용처" 1종뿐이라 업종을 알 수
   없음을 확인.
4. 기존 DB 데이터와의 중복 가능성을 이름/주소 매칭으로 실측(서울형 키즈카페
   26/131 정확 일치, 카페머니 사용처 15/62 정확 일치 등 — 상당한 중복 존재
   확인, 그러나 정교한 사전 매칭은 사용자 지시로 생략하고 사후 수동 dedup에
   위임).

## 주요 설계 결정(대화를 통해 확정)
- **배치 주기**: 주 1회(물리적 시설 목록이라 변동이 적음, 신규 수집기는 기존
  run-daily.mjs/run-monthly.mjs 소스 목록에 등록하지 않는 완전 별도 파이프라인).
- **중복 처리**: 사전 매칭 없이 그냥 신규 행으로 수집 + 뱃지 부여, 중복
  병합은 기존 관리자 수동 dedup 도구에 위임(이미 있는 badge-consolidation
  패턴이 병합 시 뱃지 유실을 막아줌).
- **표준중분류/노출중분류 매핑**:
  | 테마 | 표준중분류 | 노출중분류 | 뱃지 |
  |---|---|---|---|
  | 서울형 키즈카페 | 키즈카페(기존 재사용) | 키즈카페 / 실내놀이터(기존) | kc_seoul_type |
  | 서울형키즈카페머니 사용처 | 키즈카페(기존 재사용) | 키즈카페 / 실내놀이터(기존) | kc_voucher_accepted |
  | 서울로 떠나는 캠핑 | 캠핑장(기존 재사용) | 캠핑장 / 피크닉장(기존) | CAMPING_SEOUL_OPERATED |
  | 편한외출 서울키즈 오케이존 | 키즈친화 식당(오케이존)(신규) | 키즈친화 식당(오케이존)(신규) | ok_zone_certified |
  | 서울, 유아숲 체험시설 | 유아숲체험원(신규) | 유아숲체험원(신규) | 없음(독자적 신규 분류라 불필요) |
- **신규 노출중분류 이름**: 기존 "키즈친화 식당(놀이시설 포함)"과 구분하기
  위해 "키즈친화 식당(오케이존)"으로 확정(AskUserQuestion).

## 변경 사항
### 1. 표준중분류/노출중분류 신설
- `scripts/migrations/2026-10-01-add-smart-seoul-map-category-rules.sql`(적용
  완료): `category_rules`에 '유아숲체험원'/'키즈친화 식당(오케이존)' 등록.
- `scripts/migrations/2026-10-01-add-smart-seoul-map-service-categories.sql`
  (적용 완료): `service_categories`에 두 노출중분류 신규 행 추가.
- `src/lib/admin/category-min-groups.ts`: 자연/공원에 '유아숲체험원', 키즈/
  놀이시설에 '키즈친화 식당(오케이존)' 추가.
- `src/lib/admin/category-min-fallback.ts`: 두 값 추가 + 변경 이력 주석 갱신.
- `src/lib/spaces/spot-category-groups.ts`: 'kids-restaurant' 칩에 '키즈친화
  식당(오케이존)' 편입(museum/library 칩과 동일한 "칩 하나 유지, 중분류
  여러 개 수용" 관례), 'toddler-forest-experience' 신규 칩 추가(기존 칩과
  겹치는 의미가 없어 신규).

### 2. 뱃지 시스템(`src/lib/admin/curation-badges.ts`)
- `RESTAURANT_CONFIG`: exposureCategoryNames에 '키즈친화 식당(오케이존)'
  추가, 'ok_zone_certified'("오케이존 인증") 뱃지 추가('인증' 그룹 신설,
  13→14개).
- `KIDS_CAFE_CONFIG`: 'kc_seoul_type'("서울형키즈카페")/'kc_voucher_
  accepted'("키즈카페머니 사용가능") 뱃지 추가('서울시 연계' 그룹 신설,
  20→22개).
- `CAMPING_CONFIG`: 'CAMPING_SEOUL_OPERATED'("서울형캠핑장") 뱃지 추가
  ('서울시 연계' 그룹 신설).
- `GENERIC_CATEGORY_NAMES`에 '유아숲체험원' 추가(전용 뱃지 없이 보편 임시
  뱃지셋 적용).
- 위 4개 신규 뱃지는 블로그 텍스트 키워드 추측이 아니라 API가 이미 확정해준
  사실이라 keywordGroups 항목을 두지 않았다(수집 스크립트가 직접 써넣음).
- `src/lib/admin/curation-badges.test.tsx`: 변경된 카운트/그룹 반영(5개
  수정 + 신규 뱃지 키 존재 검증 추가).

### 3. 신규 수집 파이프라인(기존 배치와 완전 별도)
- `scripts/ingest/lib/smart-seoul-map-client.mjs`(+ test): 콘텐츠 리스트 API
  클라이언트. 서울시청 좌표 고정 + 반경 300km(기본값) + 페이지네이션.
- `scripts/ingest/adapters/lib/smart-seoul-map-transform.mjs`(+ test): 5개
  어댑터 공유 raw→open_spaces 변환 로직. `buildSmartSeoulMapExternalId`가
  external_id를 생성.
- `scripts/ingest/adapters/smart-seoul-{kids-cafe,kids-cafe-voucher,camping,
  ok-zone,toddler-forest}-adapter.mjs`(각 + test): 테마별 어댑터 5개.
  `BaseCollectorAdapter`를 상속해 기존 25개 이상의 어댑터와 동일한 공용
  업서트 로직(`upsertRowsSafeMerge`)을 재사용한다.
- `scripts/ingest/lib/apply-curation-badge.mjs`(+ test): external_id 목록으로
  스팟을 찾아 `spot_curations.curation_badges`에 뱃지를 합집합으로 추가한다
  (기존 뱃지 보존, 중복 추가 방지).
- `scripts/ingest/run-smart-seoul-map.mjs`(+ test): 5개 어댑터를 순차 실행하고
  어댑터별 badgeKey가 있으면 뱃지를 적용하는 독립 러너. `--only=`/`--dry-run`
  지원.
- `.env.local`: `SMART_SEOUL_MAP_THEME_API_KEY` 추가(gitignored).

## 실측 중 발견한 장애와 수정
### external_id 형식으로 인한 URL 길이 초과(실행 중 발견)
최초 구현은 `SMART_SEOUL_{themeId}_{COT_CONTS_ID}`(최대 58자)를 그대로 썼다.
오케이존(654건) 실행 시 `upsertRowsSafeMerge()`가 내부적으로 200건씩 끊어
기존 행을 GET `.in()`으로 조회하는 구간에서 "fetch failed"가 **두 번의 독립
실행에서 동일하게 재현**됐다(1~600번째 행 매번 실패, 54건만 성공). 실측
확인: 200건 기준 URL 인코딩 합산 길이가 11,606자에 달해, 다른 25개 이상의
기존 소스가 쓰는 짧은 external_id 기준으로 검증된 `SELECT_LOOKUP_BATCH_SIZE
(200)` 한도를 초과한 것으로 판단했다. 공용 `upsertRowsSafeMerge()`를 고치는
대신(영향 범위가 "완전 별도 파이프라인" 지시를 벗어남, 제5장 제4조) 이
소스의 external_id를 `rural-experience-village-adapter.mjs`와 동일한 패턴
(SHA1 해시 16자)으로 줄였다 — `SMART_SEOUL_{16자 해시}`(고정 28자).

이 수정 전 두 차례 실행으로 잘못된 형식의 external_id를 가진 행 264건이
이미 적재돼 있어, 재실행 전에 `source='smart_seoul_map'` 행과 연결된
`spot_curations`를 정리(10건씩 배치 삭제 — 8초 statement_timeout 재확인)
했다.

### 날짜 하드코딩 플레이키 테스트 2건(검증 루프 중 발견, 무관한 기존 버그)
`src/lib/home/get-home-feed.test.ts`에서 2건의 하드코딩된 절대 날짜
(`end_date: '2026-09-30'` 등)가 실행일이 2026-10-01로 넘어가며 "진행중"
이벤트가 "이미 종료"로 잘못 제외되는 문제를 발견 — 기존 `daysFromToday()`
헬퍼로 상대 날짜로 교체했다(2026-09-30에 같은 패턴을 한 번 고친 적이 있으나
그때 놓친 다른 2곳).

## 검증
- `npx vitest run`(신규 11개 테스트 파일, 총 69개 테스트) 전부 통과.
- `npx tsc --noEmit` / `npm run test`(전체 247개 파일 2,622개) / `npm run build`
  모두 통과(날짜 플레이키 수정 후 전체 재검증 포함, 총 2회 전체 루프 수행).
- 실제 실행: 5개 테마 전부 성공 — 키즈카페 193건(131+62, 중복 포함 신규
  삽입)/캠핑장 17건/유아숲체험원 372건(373 중 1건 좌표 결측으로 API 자체에서
  누락)/키즈친화 식당(오케이존) 654건(655 중 1건 동일 사유), 총 1,236건.
  뱃지도 4개 테마 전부 대상 건수만큼 정확히 부여됨(토끼숲체험원 제외).

## 특이 사항
- 사전 이름/주소 매칭(중복 방지)은 의도적으로 생략했다 — 사용자 판단: "나중에
  위치기반으로 중복스팟 검수및 병합하면될거같아" — 기존 수동 dedup 도구와
  병합 시 뱃지 보존 로직(2026-09-29 `consolidateBadgesToRepresentative`)이
  이미 있어 재사용 가능.
- 콘텐츠 리스트 API는 요금/운영시간 전용 구조화 필드가 없어(COT_VALUE_01/03은
  테마마다 라벨이 달라 신뢰 불가) `is_free`/`operating_hours`를 추측하지 않고
  null로 둔다.
- `reference/MGIS_ApplicationServer_Doc(OpenAPIV5).pdf` /
  `reference/MGIS_ApplicationServer_ThemeList_ver.5.0.0.pdf`는 사용자가 제공한
  API 스펙 문서라 보관용으로 커밋한다.
