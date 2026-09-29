# 서울특별시교육청어린이도서관·글마루한옥어린이도서관 병합 + 뱃지 대표 통합

## 구현 대상
사용자 지시(2026-09-29): "어 병합하고. 실제로 일단 대표쪽에 뱃지 추가해" —
batch7 CSV 재확인으로 발견한 두 미병합 중복(서울특별시교육청어린이도서관
3행, 글마루한옥어린이도서관 2행으로 알고 있었음)을 병합하고, 여러 행에
흩어진 뱃지를 대표 행 하나에 모은다.

## 실측 확인 — 글마루한옥어린이도서관은 실제로 3행이었다
`aac0f845`(그동안 대표로 써 온 행)를 다시 조회하니 이미 **기존 그룹**
(`3d000e89-...`)이 있었고, 그 그룹에 `d687d65f`(비대표, spot_curations
행 자체가 없어 뱃지 0개)가 이미 딸려 있었다 — 직전 대화에서 파악한 2행이
아니라 실제로는 3행. `mergeOneGroup()`에 세 행을 모두 넘겨 기존 그룹
정보를 잃지 않고 그대로 흡수했다.

## 변경 사항
### `scripts/migrations/2026-09-29-merge-and-consolidate-badges-library-duplicates.mjs` (신규)
- 2026-09-29-merge-children-library-duplicate-pairs.mjs의 `mergeOneGroup()`
  을 그대로 재사용(제5장 제4조 기존 구조 우선) — 대표 선정(created_at
  오름차순), naver_place_id/excluded_weekdays 조건부 병합 로직 중복 없음.
- 신규 `consolidateBadgesToRepresentative()`: 그룹 병합 후 멤버 전원의
  `spot_curations.curation_badges`를 합집합으로 계산해 **대표 행 하나에만**
  반영한다 — 비대표는 화면에 노출되지 않으므로 대표에 모아야 실제로 보인다.

### `scripts/migrations/2026-09-29-merge-and-consolidate-badges-library-duplicates.test.mjs` (신규)
- mergeOneGroup 재사용(import) 확인(1).
- 그룹 멤버 전원의 뱃지 합집합이 대표 행에 반영되는지 검증(1).
- 큐레이션 행이 없는 멤버(빈 배열)는 합집합에 영향 없는지 검증(1).
- 중복 뱃지가 한 번만 남는지 검증(1).

## 실행 결과
| 도서관 | group_id | 대표 스팟 id | 최종 뱃지(대표에 통합) |
| --- | --- | --- | --- |
| 서울특별시교육청 어린이도서관 | f3c3e147-0579-45c3-9e8b-abc308ed83f5 | 4ecb04fc-dacb-4f90-9e73-0a1de4fe0a69 | parking, floor_seating, lib_infant_reading_room, lib_quiet_talk_allowed, lib_weekend_program |
| 글마루한옥어린이도서관 | 1698cabb-3c09-45d8-9783-8d93633404be | aac0f845-69b5-485a-9bf3-678fac724c5c | floor_seating, lib_infant_reading_room, lib_quiet_talk_allowed, lib_weekend_program |

## 검증
- `npx vitest run scripts/migrations/2026-09-29-merge-and-consolidate-badges-library-duplicates.test.mjs` — 4개 통과.
- `npx tsc --noEmit` / `npm run test`(전체 223개 파일 2,510개) / `npm run build` 모두 통과.
- 실제 DB: 2개 그룹 병합 + 대표 행 뱃지 통합 완료(실행 로그로 group_id/대표
  id/최종 뱃지 확인).

## 특이 사항
- 두 그룹 다 사전에 계산한 예상 대표·뱃지 합집합과 실행 결과가 정확히
  일치했다(우연이 아니라, 지금까지의 batch1/batch6/batch7 뱃지 반영
  작업에서 "같은 실제 장소면 여러 행에 동일하게 반영"해 온 관례 덕분에
  합집합을 구해도 새로 추가되는 값이 없었다).
