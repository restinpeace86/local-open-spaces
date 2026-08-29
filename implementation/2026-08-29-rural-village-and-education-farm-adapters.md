# [농어촌체험휴양마을 + 농촌교육농장 통합 수집 어댑터 구현 및 DB 적재]

## 요구사항
1. 소스 A(전국농어촌체험휴양마을, data.go.kr tn_pubr_public_frhl_exprn_vilage_api)와
   소스 B(농촌진흥청 농촌교육농장, `reference/농촌교육농장` 참고)를 수집해 Supabase에 적재.
2. 두 소스 모두 상위 [농장/체험] 카테고리로 묶고, category_min을 각각 체험휴양마을/
   교육농장으로 구분. 위치/좌표 파싱 + 결측 시 지오코딩. 홈페이지 등 링크 정보 반영.
3. 로컬 실행으로 실제 파싱·upsert 검증 후 tsc/test/build 통과 확인, 커밋/푸시.

## 구현 일시
2026-08-29

## 1. 소스 A: 전국농어촌체험휴양마을 — 완전히 구현·라이브 검증 완료

### 사전 실측
지시서에 제공된 서비스키로 실제 엔드포인트를 직접 호출해 확인했다(추측 금지):
- 응답은 `city-park-adapter.mjs`와 동일한 표준데이터 봉투
  (`header.resultCode`/`body.items.item[]`/`totalCount`).
- 전량(1,254건) 조회해 데이터 품질 확인: 명칭/주소/좌표(latitude, longitude) 전량 존재,
  homepageUrl은 106건에만 존재, 중복(명칭+주소 동일) 1쌍만 존재.
- 고유 ID 필드가 없음(insttCode는 마을이 아니라 관리기관 코드라 여러 마을이 공유) —
  gg-kidscafe-adapter.mjs와 동일하게 SHA1(명칭|주소) 해시로 external_id를 결정적 생성.

### 구현 (`rural-experience-village-adapter.mjs`)
- category: `EXPERIENCE_CLASS`(체험·클래스), category_min: `'체험휴양마을'`(RAW).
- 좌표: 원본 latitude/longitude를 우선 사용, 결측 시에만 VWorld 지오코딩(사용자 지시
  "결측 시 지오코딩 보완" 반영 — 실측상 결측이 없어 방어적 코드로만 존재).
- 전국 단위 소스라 GYEONGGI_BOUNDS 같은 지역 범위 검증은 적용하지 않음
  (national-park-ecotour-adapter.mjs와 동일한 전국 소스 관례).
- 4대 핵심 뱃지(키즈친화/주차/유모차/실내외)는 exprnSe(체험구분)+exprnCn(체험내용)
  텍스트에서 `deriveParentalTags`로 실제 근거 기반 판별(소스 전체를 임의로 고정하지 않음).
- 링크: homepageUrl이 있으면 info_url로 반영.
- `run-monthly.mjs` STEPS에 연결(targetTable이 open_spaces인 어댑터는 월간 배치 소속).
- 어드민 카테고리 그룹핑에 신규 대분류 "농장/체험"을 신설하고 '체험휴양마을'을 배정,
  필터 안전망 목록에도 반영.

### 실측 검증(로컬 실행, 프로덕션 DB)
- `--dry-run`: 1,254건 수신 → 1,254건 전량 유효 변환(드롭 0건).
- 실제 적재: RAW 레이어 1,253건 보존 + open_spaces upsert 1,253건(명칭+주소 중복 1쌍이
  동일 external_id로 병합되어 1건 차이, 실측 확인한 예상된 결과).
- DB 직접 조회: 1,253건 전량 좌표/category_min 보유, 1,248건 sigungu_name 자동 추출
  성공, 105건 홈페이지 링크 보유. 무작위 표본 5건(청주/담양/부여/홍천/춘천)으로 전국
  분포 및 한글 인코딩 손상 없음 확인.

## 2. 소스 B: 농촌교육농장 — 코드 완성, 라이브 검증은 실제 인증키 확보 후 필요

### 참고 자료 확인
`reference/농촌교육농장/샘플소스/rest/php/fmlgEdcFarmmList.php`(+`_D.php`)를 읽어
실제 연동 대상이 data.go.kr이 아니라 **농사로(api.nongsaro.go.kr)** 자체 API
(서비스명 `fmlgEdcFarmm`, 오퍼레이션 `fmlgEdcFarmmList`/`fmlgEdcFarmmDtl`)임을 확인했다.

### 인증키 확인 결과(AskUserQuestion으로 진행 방식 확인)
- 지시서에 제공된 키(PUBLIC_DATA_API_KEY)는 data.go.kr 전용이라 농사로에는 쓸 수 없다.
- 참고 자료의 샘플키("nongsaroSampleKey")는 데모용 placeholder다.
- 실제 엔드포인트에 더미 키로 직접 호출해 "인증키가 등록되지 않았습니다 — 농사로에
  접속하여 Open API 인증키를 발급받으십시오" 응답을 실측 확인했다(HTTP 200, 즉 엔드포인트
  자체는 살아있고 유효한 키만 없는 상태).
- WebSearch로 data.go.kr에 동일 데이터가 표준데이터로 별도 등록된 사례를 찾아봤으나
  확인하지 못했다(관련 LINK형 항목은 있었으나 별도의 농사로 자체 키가 필요한 구조).
- 이 상태를 사용자에게 보고하고 AskUserQuestion으로 진행 방식을 확인한 결과 **"코드만
  먼저 완성"**으로 결정 — 아래와 같이 구현했다.

### 구현 (`rural-education-farm-adapter.mjs`)
- 응답 형식이 XML 전용임을 실측 확인(`type=json`을 붙여도 무시되고 XML이 그대로 옴) —
  이 프로젝트 최초로 XML 응답을 다루는 소스라 `fast-xml-parser`를 신규 의존성으로
  추가했다(Node 내장 XML 파서 없음).
- 필드 매핑은 참고 샘플 코드의 실제 필드 접근 경로를 그대로 신뢰: cntntsNo(고유번호,
  external_id로 사용)/cntntsSj(명칭)/locplc(주소)/thema(주제).
- 좌표: 목록/상세 어느 응답에도 좌표 필드가 없어(샘플 코드 확인) 전량 VWorld
  지오코딩(gg-events-adapter.mjs와 동일한 "전량 지오코딩" 패턴).
- 링크 정보(홈페이지 URL)는 상세조회(`fmlgEdcFarmmDtl`, 건별 개별 호출) 전용 필드다 —
  실제 키 없이는 전건 상세조회 시의 호출 횟수·응답시간·요청 제한을 검증할 수 없어(목록
  대비 N배 호출), 이번 범위에서는 목록 조회만 구현하고 info_url은 null로 뒀다(제3장
  제5조 추측 금지 — 검증 못한 API 호출 패턴을 무작정 늘리지 않음). 실제 키 확보 후
  상세조회 추가는 후속 작업으로 남긴다.
- category_min: `'교육농장'`(RAW). is_kids_friendly는 "농촌교육농장"이라는 소스 자체의
  정의(농촌진흥청이 학생 현장체험학습 대상으로 품질인증하는 시설)에 근거해 true 고정
  (playground-adapter.mjs/gg-kidscafe-adapter.mjs와 동일 논리).
- CLI 진입점(`rural-education-farm.mjs`, `npm run ingest:rural-education-farm`)과
  단위 테스트(참고 샘플의 필드 경로 + 실측한 에러 응답 XML 형식 기반 mock, 10건)까지
  완성했으나, **`run-monthly.mjs`에는 아직 연결하지 않았다** — 인증키 없이 자동 배치에
  넣으면 매달 실패만 반복하기 때문이다(주석으로 사유 명시).

### 남은 작업(사용자 액션 필요)
1. https://www.nongsaro.go.kr 에서 회원가입 후 Open API 인증키 발급.
2. 발급받은 키를 `.env.local`의 `NONGSARO_API_KEY`에 설정.
3. `node scripts/ingest/rural-education-farm.mjs --dry-run`으로 실제 응답 구조가
   이번에 구현한 파싱 로직과 일치하는지 확인(특히 `<items>` 내부에 `numOfRows`/
   `totalCount`/`pageNo`가 실제로 함께 오는지 — 샘플 코드의 접근 경로를 신뢰해 구현했지만
   실제 원본 XML로 직접 확인한 적은 없음).
4. 확인 후 `run-monthly.mjs` STEPS에 연결.

## 검증

### 코드 검증
- `npx tsc --noEmit` 통과.
- `npm run test`(62파일 640건 — 신규 `rural-experience-village-adapter.test.mjs` 13건,
  `rural-education-farm-adapter.test.mjs` 10건, `category-min-groups.test.ts` 신규 1건
  포함) 통과.
- `npm run build` 통과.

### 실측 검증
- 소스 A: 위 "실측 검증" 절 참고 — 로컬 dry-run + 실제 프로덕션 DB upsert + 직접 조회로
  완전히 검증했다.
- 소스 B: 인증키 없어 라이브 호출/DB 적재 검증은 하지 못했다. 단위 테스트는 참고 샘플의
  필드 접근 경로를 근거로 구성한 목 응답으로 통과시켰다.

## 특이 사항
- `reference/농촌교육농장/` 디렉터리(사용자가 직접 추가한 참고 자료)는 이번 작업에서
  읽기 전용으로만 참고했고 수정하지 않았다.
- `fast-xml-parser`는 이 프로젝트의 두 번째 "특정 파싱 목적 전용" 프로덕션 의존성이다
  (`proj4`가 좌표계 변환 목적으로 이미 추가돼 있던 것과 동일한 성격 — 제5장 제4조 기존
  구조 우선 원칙상 새 의존성은 최소화하되, XML 응답을 다루는 소스가 처음 생겨 불가피했다).
