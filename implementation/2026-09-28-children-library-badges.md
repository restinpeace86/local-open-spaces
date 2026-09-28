# 어린이도서관 표준 뱃지 태깅

## 구현 대상
todo.md [개선사항 1] (2026-09-28 등록): 전국 전문 어린이도서관을 분석해 7개
표준 뱃지(#신발벗는 온돌·마루방, #영유아 전용 자료실 분리, #소곤소곤 대화 가능,
#주말 독서·체험 프로그램, #영어 그림책 전문, #만화·웹툰 특화, #주차 편리)를
원문/팩트 기반으로만 태깅. "매핑 이력이 있는 뱃지(주차 완비, 놀이방/키즈존,
아기의자)는 없애지 말고 그대로 둘 것."

## 실측 확인 — 원문 데이터 가용성
`category_min='어린이도서관'` 156건의 소스별 원문 소개글 보유 현황을 직접 조회:

| 소스 | 건수 | 소개 텍스트 |
| --- | --- | --- |
| localdata_playground | 17 | 없음 |
| public_facility_open | 22 | 없음(단 10건 `etcFclty`에 "책상+의자" 등 비품 목록만) |
| tourapi_4.0 | 13 | 없음 |
| cultural_facility_summary | 98 | 없음 |
| seoul_public_culture | 20 | **있음**(`raw_data.FAC_DESC`) |

즉 156건 중 실제 서술형 원문이 있는 건 seoul_public_culture 20건뿐이다.
이 20건 전체를 직접 읽어 7개 기준과 대조했다(아래 표).

## 판단 결과
| 기준 | 원문 근거 여부 | 처리 |
| --- | --- | --- |
| #신발벗는 온돌·마루방 | 2건에서 명시 확인 | 뱃지 신설(`floor_seating`, 기존 restaurant config 키 재사용) |
| #영유아 전용 자료실 분리 | 2건에서 층/자료실 분리 명시 확인 | 뱃지 신설(`lib_infant_reading_room`) |
| #영어 그림책 전문 | 4건에서 명칭/소개글로 명시 확인 | 뱃지 신설(`lib_english_picture_books`) |
| #소곤소곤 대화 가능 | 20건 전체에서 근거 0건 | 뱃지 미신설 |
| #주말 독서·체험 프로그램 | 20건 전체에서 "주말"+프로그램 결합 근거 0건 | 뱃지 미신설 |
| #만화·웹툰 특화 | 20건 전체에서 근거 0건 | 뱃지 미신설 |
| #주차 편리 | 기존 `parking`("주차 완비")과 개념 중복 | 별도 뱃지 미신설, 기존 뱃지로 대체 |

미신설 3개는 "정보가 불확실하면 미부여"라는 지시 원문과 제3장 제5조(추측 금지)에
따라 억지로 만들지 않았다.

## 변경 사항
### `src/lib/admin/curation-badges.ts`
- '어린이 도서관'을 보편 임시 config(`GENERIC_CONFIGS`)에서 빼고 전용
  `CHILDREN_LIBRARY_CONFIG`로 승격(`categoryMinNames: ['어린이도서관']`로
  표준중분류 우선 매칭 — SPA_JJIMJILBANG_CONFIG와 동일한 방식).
- badgeOptions 11개: 기존 매핑 이력 보존 6개(parking/stroller/nursing_room/
  diaper_table/kids_chair/kids_zone — 기존 restaurant config와 동일한 키를
  그대로 재사용해 이미 저장된 값이 고아가 되지 않게 함) + 신규 확정 3개
  (floor_seating/lib_infant_reading_room/lib_english_picture_books) +
  운영 2개(reservation_required/reservation_possible).

### `src/lib/admin/curation-badges.test.tsx`
- '어린이 도서관'을 검증하던 "보편 임시 뱃지" 테스트를 '어린이 과학관 / 박물관'
  으로 교체(어린이 도서관은 이제 전용 config이므로).
- `children_library` 전용 describe 블록 신규(3개): categoryMin 우선 매칭,
  11개 뱃지 목록 정확성, 보존 대상 3개가 restaurant와 동일 키를 쓰는지.

### `scripts/migrations/2026-09-28-tag-children-library-badges.mjs` (신규)
- 원문 근거가 확인된 8개 스팟에 한해 `spot_curations.curation_badges`에
  신규 뱃지를 **추가**(기존 값 삭제하지 않음, `Set` 합집합으로 병합).
- 실행 결과: 8개 스팟 갱신(floor_seating 2건, lib_infant_reading_room 2건,
  lib_english_picture_books 4건). 기존 parking/kids_chair/reservation_possible
  값은 그대로 유지됨(로그로 전/후 값 확인).

### `scripts/migrations/2026-09-28-tag-children-library-badges.test.mjs` (신규)
- 기존 값 보존 + 신규 추가 검증(1), 큐레이션 행이 아직 없는 스팟 처리 검증(1).

## 검증
- `npx vitest run scripts/migrations/2026-09-28-tag-children-library-badges.test.mjs src/lib/admin/curation-badges.test.tsx` — 2 파일 77개 테스트 통과.
- `npx tsc --noEmit` / `npm run test`(전체 216개 파일 2,478개) / `npm run build` 모두 통과.
- 실제 DB: 8개 스팟 갱신 완료(마이그레이션 스크립트 실행 로그로 전/후 값 확인).

## 특이 사항
- todo.md 원문의 "Output Format"(마크다운 테이블)과 "Input Data"(빈 플레이스홀더)는
  분석용 프롬프트 템플릿이었다 — 실제 입력 데이터는 DB에서 직접 조회해 확보했다.
- 136건(원문 소개글 없는 소스)은 이번 태깅 대상에서 제외됐다 — 근거 없이 태깅하지
  않는다는 원칙을 지킨 결과이며, 추후 새로운 원문 데이터(예: 네이버 크롤링,
  관리자 수기 입력)가 확보되면 그때 추가 검토한다.
