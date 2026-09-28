# 미병합 어린이도서관 중복 4쌍 직접 병합

## 구현 대상
사용자 지시(2026-09-29): "일단 이 4쌍만 바로 병합해줘" — 노원어린이도서관,
국립어린이청소년도서관, 아리랑어린이도서관, 지혜샘어린이도서관 4쌍이 관리자
"중복 스팟 검토" 화면에 후보로 뜨지 않아 직접 병합을 요청받았다.

## 원인(직전 대화에서 확정)
`find_spot_dedup_candidates`의 중복 판정은 ①주소 정규화 완전 일치 또는
②실제 좌표 거리 30m 이내(`spot-dedup-grouping.ts`
`PROXIMITY_THRESHOLD_METERS`) 중 하나만 맞아도 되는데, 이 4쌍은 둘 다
실패했다:
- 주소 정규화: "특별시"/동 이름/시설명 표기 차이로 문자열이 서로 다름.
- 좌표 거리(Haversine 실측): 노원 36.3m, 국립 55.3m, 아리랑 118.2m,
  지혜샘 136.8m — 전부 30m 초과.

같은 물리적 건물을 서로 다른 원본 소스가 조금씩 다르게 지오코딩해서
벌어진 것으로 보이며, 이 임계값을 전역으로 넓히는 건 다른 카테고리의
오탐(실제로 다른 장소를 잘못 묶음) 위험이 있어 사용자 확인 없이 임의로
바꾸지 않았다(제3장 제5조) — 이번엔 이미 같은 장소로 확인된 이 4쌍만
직접 병합한다.

## 변경 사항
### `scripts/migrations/2026-09-29-merge-children-library-duplicate-pairs.mjs` (신규)
`/api/admin/spot-dedup/apply` 라우트와 **정확히 동일한 로직**을 재현해
`mergeOneGroup()`으로 분리(테스트 가능):
- 대표 선정: `created_at` 오름차순(동일 시각이면 id 오름차순) — 라우트와
  동일한 결정적 기준.
- `spot_dedup_groups`에 이력 기록(`member_spot_ids`/`standard_name`/
  `service_category_id`).
- `open_spaces` 양쪽 행에 `standard_name`/`service_category_id`/`group_id`
  반영, 대표만 `is_dedup_representative=true`.
- `naver_place_id`가 비대표 하나에만 있으면 대표로 이전(unique 제약 위반
  방지를 위해 먼저 비우고 나중에 채움) — 실측: 4쌍 다 naver_place_id가
  없어 이 단계는 실제로는 미작동.
- `excluded_weekdays`/`excluded_nth_weekdays`가 양쪽에 동일하게 있으면
  그룹 갱신에 포함(실측: 4쌍 다 값 없어 미작동).

### `scripts/migrations/2026-09-29-merge-children-library-duplicate-pairs.test.mjs` (신규)
- 대표 선정(created_at 오름차순) 검증(1).
- naver_place_id 조건부 이전 검증(1).
- excluded_weekdays 일치 시 병합 반영 검증(1).
- spot_dedup_groups 기록 내용 검증(1).

## 실행 결과
4개 그룹 전부 성공적으로 병합됨(대표 id는 사전 계산과 정확히 일치):

| 도서관 | group_id | 대표 스팟 id |
| --- | --- | --- |
| 노원어린이도서관 | f5cd32df-0e35-41f0-9580-ba05334adcf7 | 61165c85-6228-40f3-803d-37c683445697 |
| 국립어린이청소년도서관 | 6c9058c6-cce1-4c6b-ad55-12d0ed72be60 | 5fbaa562-4b70-4d73-ae54-dd0d0c48308f |
| 아리랑어린이도서관 | f5ad97e0-f0a9-4ec8-8902-6a1349907480 | 2f809b26-8d22-4015-b781-198c8a3fa76a |
| 지혜샘어린이도서관 | 19f36376-3d3e-4794-863d-a264f79305fc | 2f25c622-d2a9-4f06-9502-76564825388a |

## 검증
- `npx vitest run scripts/migrations/2026-09-29-merge-children-library-duplicate-pairs.test.mjs` — 4개 통과.
- `npx tsc --noEmit` / `npm run test`(전체 218개 파일 2,487개) / `npm run build` 모두 통과.
- 실제 DB: 4개 그룹 병합 완료(실행 로그로 group_id/대표 id 확인).

## 특이 사항
- 대표로 뽑힌 4곳(61165c85/5fbaa562/2f809b26/2f25c622) 모두 이전 세션
  (2026-09-28 CSV 뱃지 반영)에서 이미 뱃지를 태깅해둔 쪽이라, 병합 후에도
  뱃지가 그대로 화면에 보인다(그 작업 때 두 행 모두에 뱃지를 반영해뒀던
  덕분 — 우연이 아니라 그때 "같은 실제 장소면 둘 다 반영"이라는 원칙을
  적용해둔 결과).
- 이번 병합은 "이미 같은 장소로 확인된 4쌍"에 대한 **일회성 직접 반영**이다
  — 자동 스캔 로직(30m 임계값/주소 정규화 규칙) 자체는 고치지 않았으므로,
  같은 유형의 미검출 중복이 다른 카테고리에도 남아있을 수 있다는 점은 여전히
  별도 확인이 필요하다.
