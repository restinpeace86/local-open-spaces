# [SEOUL_YEYAK 소스 상세보기 설명 누락 수정]

## 문제 제보
직전 작업(상세보기 설명 추가)을 배포했는데 대표가 실제로 열어보니 설명이 안 보인다고
제보.

## 근본 원인 (실측 확인)
`seoul_public_reservation`(SEOUL_YEYAK) 소스는 이 세션 초반의 본문 백필
(`backfill-contents.mjs`, `seoul_public_culture`/`gg_public`/`tourapi_4.0` 3개 소스 대상)
범위에 애초에 포함되지 않았다 — 실측 결과 `is_active=true` 2,760건 전부 `description`이
`NULL`이었다. 이 소스는 이벤트픽 활성 이벤트의 절대다수(2,760/3,463 = 79.7%)를 차지하고,
특히 직전 작업에서 우선순위를 앞으로 둔 "공공키즈카페" 카테고리가 여기 속해 있어, 대표가
연 카드 대부분이 하필 설명이 없는 쪽이었다.

## 해결
`raw_data.DTLCONT`(상세내용 원본 필드, 이미 전량 보존돼 있음 — Decision 017)에서 추출해
채운다. 실측 확인 결과 두 가지 정제가 필요했다:
1. 모든 레코드에 공통으로 붙는 정형 안내문("1. 공공시설 예약서비스 이용시 필수 준수사항"~
   "2. 시설예약")이 앞에 붙어 있다 — 여러 샘플 대조 결과 토씨 하나 다르지 않게 완전히
   동일해 레코드별 실질 정보가 아니다. "3. 상세내용"부터 "4. 주의사항" 전까지만 추출한다.
2. 원본이 HWP/CKEditor로 작성된 원시 HTML이라 태그를 제거하고(`<br/>`→줄바꿈, `</td>`→` | `,
   나머지 태그 제거) 흔한 HTML 엔티티(`&nbsp;` 등)를 사람이 읽을 수 있는 문자로 바꾼다.

## 변경 사항
- `scripts/ingest/lib/seoul-yeyak-description.mjs`(신규): `extractYeyakDescription(dtlcont)`
  — 위 정제 로직. "3. 상세내용" 마커가 없는 드문 변형 포맷은 원문 전체를 정리해 그대로
  쓴다(마커 존재를 임의로 가정하지 않음, 제3장 제5조 추측 금지).
- `scripts/ingest/adapters/seoul-yeyak-adapter.mjs`: events 행 빌더에
  `description: extractYeyakDescription(item.DTLCONT)` 추가 — 앞으로 수집되는 신규 데이터는
  자동으로 채워진다.
- `scripts/ingest/backfill-seoul-yeyak-description.mjs`(신규): 기존 데이터 백필. `raw_data`가
  이미 있어 외부 API 재호출 없이 DB 안에서만 채운다. Safe Merge(`description` 이미 채워진
  행은 `.is('description', null)` 가드로 절대 덮어쓰지 않음 — `category_min`/
  `target_audience` 등 다른 컬럼은 이 스크립트가 다루지 않아 구조적으로 유실 불가능).

## 실행 결과 (실제 UPDATE)

| 항목 | 건수 |
| :--- | ---: |
| 스캔 대상(source=seoul_public_reservation, description NULL) | 3,947건 |
| 채워짐 | 3,247건 |
| DTLCONT 없음/추출 후 빈 값 | 700건 |

`is_active=true` 기준 재확인: 2,760건 중 2,171건(78.7%)이 description을 갖게 됐다(기존
0건).

## 남은 한계 (추가 조치 불가, 데이터 자체의 한계)
"공공키즈카페" 카테고리(265건)는 여전히 1건만 description이 있다 — 실측 확인 결과
`raw_data.DTLCONT` 자체가 원본 API에서부터 빈 문자열(`""`)로 내려온다(추출 로직의 결함이
아니라 원천 데이터에 애초에 이 필드가 채워지지 않는 카테고리). 직전 작업에서 "공공키즈카페"
를 카드 우선순위 맨 앞으로 뒀기 때문에, 대표가 본 카드 대부분이 하필 이 카테고리와 겹쳐
설명이 안 보이는 것처럼 느껴졌던 것으로 보인다. 다만 "서울형 키즈카페 OO구 OO동점"처럼
제목 자체가 이미 무엇인지 충분히 설명하는 경우가 많아, 다른 소스(문화체험/클래스류)만큼
설명이 필수적이지는 않다고 판단해 이번 작업 범위에서는 추가 조치하지 않았다.

## 검증
- `npx tsc --noEmit`: clean.
- `npm run test`: 47 파일 512건 통과(신규 6건: `extractYeyakDescription`).
- `npm run build`: 성공.
- 실제 DB 반영 후 실측: `is_active=true seoul_public_reservation` 2,760건 중 2,171건
  description 정상 확인. 실제 텍스트 샘플 2건(한강공원 촬영 대관 안내, 서울청년센터 강동
  프로그램 모집 공고)에서 정제된 가독성 있는 텍스트 확인.
